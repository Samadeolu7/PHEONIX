"""
Management command: correct_penalty_compounding_bug

Corrects the penalty-on-penalty compounding bug quantified by
audit_penalty_compounding_bug_damage (2026-08-12 -> 2026-08-22, 439 schedule
rows, ~1.49M posted to GL, ~165K still phantom-outstanding as of the audit).

Root cause: update_loan_status.py's daily cron computed each overdue
installment's fresh penalty as a percentage of `sched.total_due -
sched.total_paid`, but total_due structurally includes the row's own
penalty_due (see models.py ~1986-1989). So every day the job ran on a
still-overdue row, it fed the previous day's already-assessed penalty back
into the next day's base — charging penalty on penalty, instead of the
intended flat percentage once per real missed period. Fixed in
update_loan_status.py (2026-08-22) to exclude the row's own penalty_due
from the base; this command corrects the damage already sitting in the
book from before that fix.

Same proven mechanism as correct_penalty_not_capped_at_payoff (2026-08-16,
124 loans, 1,828,451.01 reversed): for each affected loan —
  1. Recomputes every non-restructured row's TRUE penalty using the
     corrected base (principal+interest+fees remaining only, never the
     row's own penalty_due) AND the row's real resolution date (payment_date
     if settled, today otherwise — same payoff-capping already established
     as correct) — combining both known-good fixes into one recompute.
  2. Reverses EVERY currently-standing LNPEN transaction for the loan via
     Transaction.reverse() (the proper audited path — linked opposite entry,
     original marked is_reversed), found via FinancialAuditLog lookup.
  3. Reposts ONE fresh LNPEN entry for the correctly recomputed total, if
     anything is genuinely still owed.
  4. Writes each row's corrected penalty_due and loan.outstanding_penalties.
  5. Logs one FinancialAuditLog(LOAN_BALANCE_CORRECTION) per loan.

Scope: loans with at least one LOAN_PENALTY_ACCRUAL FinancialAuditLog entry
since the bug's live window start (2026-08-12 by default) — i.e. exactly
the loans audit_penalty_compounding_bug_damage flagged. Not restricted to
origin=legacy_import, since update_loan_status.py runs against every
active/disbursed/defaulted loan regardless of origin.

SAFETY:
  - Dry-run by default. Nothing is written until --apply.
  - Each loan is processed in its own atomic block with a savepoint.
  - Only loans where recompute finds LESS owed than currently recorded are
    touched (overcharge > tolerance) — a loan where recompute finds MORE is
    flagged needs_review instead of guessed at (unexpected direction).
  - --loan for a single loan, --batch for every affected loan.

Usage:
    python manage.py correct_penalty_compounding_bug --loan LN-735       # dry-run
    python manage.py correct_penalty_compounding_bug --loan LN-735 --apply
    python manage.py correct_penalty_compounding_bug --batch             # dry-run, all
    python manage.py correct_penalty_compounding_bug --batch --apply
"""
from datetime import date, datetime
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone
from django.db import transaction as db_transaction

DEFAULT_WINDOW_START = date(2026, 8, 12)
TOLERANCE = Decimal('0.01')
REVERSAL_REASON = (
    'Penalty-on-penalty compounding bug — update_loan_status.py fed each overdue row\'s own '
    'already-assessed penalty back into the next day\'s base amount, instead of computing a flat '
    'percentage once per real missed period. Fixed 2026-08-22 (excludes penalty_due from the '
    'base); this reverses the resulting over-accrual. See audit_penalty_compounding_bug_damage.'
)


class Command(BaseCommand):
    help = (
        'Corrects the penalty-on-penalty compounding bug (live 2026-08-12 to 2026-08-22): '
        'reverses every standing LNPEN transaction for affected loans and reposts one fresh, '
        'correctly-computed entry (corrected base + real resolution date).'
    )

    def add_arguments(self, parser):
        parser.add_argument('--loan', dest='loan_number', default=None,
                             help='Only correct a single loan by loan_number.')
        parser.add_argument('--batch', action='store_true',
                             help='Correct every affected loan in one run.')
        parser.add_argument('--since', dest='since', default=None,
                             help='Bug window start date (YYYY-MM-DD). Default: 2026-08-12.')
        parser.add_argument('--apply', action='store_true',
                             help='Actually write the correction. Without this, only previews.')

    def handle(self, *args, **options):
        from loans.models import LoanAccount
        from common.models import FinancialAuditLog

        loan_number = options['loan_number']
        batch = options['batch']
        apply_changes = options['apply']
        since = (
            datetime.strptime(options['since'], '%Y-%m-%d').date()
            if options['since'] else DEFAULT_WINDOW_START
        )

        if bool(loan_number) == bool(batch):
            raise CommandError('Pass exactly one of --loan <number> or --batch.')

        if loan_number:
            loan_numbers = [loan_number]
        else:
            loan_numbers = sorted(set(
                FinancialAuditLog.objects.filter(
                    event_type=FinancialAuditLog.LOAN_PENALTY_ACCRUAL,
                    timestamp__date__gte=since,
                ).exclude(extra__loan_number__isnull=True)
                .values_list('extra__loan_number', flat=True)
            ))

        applied, dry_ran, skipped, needs_review = 0, 0, 0, 0
        for ln in loan_numbers:
            try:
                loan = LoanAccount.all_objects.select_related('product', 'account').get(loan_number=ln)
            except LoanAccount.DoesNotExist:
                self.stdout.write(self.style.ERROR(f'[{ln}] not found.'))
                skipped += 1
                continue
            result = self._process_loan(loan, apply_changes)
            if result == 'applied':
                applied += 1
            elif result == 'dry_run_ok':
                dry_ran += 1
            elif result == 'needs_review':
                needs_review += 1
            else:
                skipped += 1

        self.stdout.write('')
        if apply_changes:
            self.stdout.write(self.style.SUCCESS(
                f'Done. applied={applied} needs_review={needs_review} unaffected={skipped}'
            ))
        else:
            self.stdout.write(self.style.WARNING(
                f'DRY-RUN done. would_apply={dry_ran} needs_review={needs_review} '
                f'unaffected={skipped} — re-run with --apply to write.'
            ))

    def _process_loan(self, loan, apply_changes):
        from common.models import FinancialAuditLog, log_financial_event
        from transactions.models import Transaction, TransactionEntry, TransactionSeries

        today = timezone.localdate()
        loan_number = loan.loan_number

        with db_transaction.atomic():
            sid = db_transaction.savepoint()

            loan = type(loan).all_objects.select_for_update().get(pk=loan.pk)
            rows = list(
                loan.repayment_schedule.select_for_update()
                .exclude(status='restructured')
                .order_by('due_date')
            )
            if not rows:
                db_transaction.savepoint_rollback(sid)
                return 'unaffected'

            row_updates = []
            correct_total = Decimal('0.00')
            for sched in rows:
                as_of = sched.payment_date if sched.status == 'paid' and sched.payment_date else today
                days_late = loan.product.effective_days_late(sched.due_date, as_of)
                non_penalty_remaining = (
                    (sched.principal_due + sched.interest_due + sched.fees_due)
                    - (sched.principal_paid + sched.interest_paid + sched.fees_paid)
                )
                correct_penalty = (
                    loan.product.calculate_late_penalty(
                        non_penalty_remaining, days_late, loan.repayment_frequency,
                    ) if days_late > 0 else Decimal('0.00')
                )
                # correct_penalty is the GROSS freshly-assessed figure (same convention as
                # penalty_due elsewhere — see update_loan_status.py "sched.penalty_due =
                # new_penalty", never netted against penalty_paid). But
                # loan.outstanding_penalties IS net of every payment ever applied against
                # penalty (record_payment() does `outstanding_penalties -= penalty_payment`),
                # so comparing gross correct_penalty against the net aggregate directly
                # would flag every row with any real penalty payment as "more owed" purely
                # from the payment, not from anything wrong with the recompute. Net off
                # this row's own penalty_paid before summing into correct_total, floored at
                # 0 (a row can't contribute negative "still owed").
                correct_total += max(Decimal('0.00'), correct_penalty - sched.penalty_paid)
                if abs(correct_penalty - sched.penalty_due) > TOLERANCE:
                    row_updates.append((sched, correct_penalty))

            overcharge = loan.outstanding_penalties - correct_total

            if overcharge <= TOLERANCE:
                db_transaction.savepoint_rollback(sid)
                if overcharge < -TOLERANCE:
                    self.stdout.write(self.style.WARNING(
                        f'[{loan_number}] needs manual review — recompute finds MORE penalty owed '
                        f'({correct_total:,.2f}) than currently recorded '
                        f'({loan.outstanding_penalties:,.2f}), the opposite of this bug\'s direction.'
                    ))
                    return 'needs_review'
                return 'unaffected'

            journal_ids = list(
                FinancialAuditLog.objects.filter(
                    event_type=FinancialAuditLog.LOAN_PENALTY_ACCRUAL,
                    extra__loan_number=loan_number,
                ).values_list('extra__journal_entry_id', flat=True)
            )
            existing_txns = list(
                Transaction.all_objects.filter(
                    pk__in=[j for j in journal_ids if j],
                    series__code='LNPEN',
                    is_reversed=False,
                    is_reversal=False,
                ).order_by('date', 'id')
            ) if journal_ids else []
            reversed_total = sum(
                (t.get_total_amount() for t in existing_txns), Decimal('0.00')
            )

            self.stdout.write(
                f'[{loan_number}] pk={loan.pk}  outstanding_penalties '
                f'{loan.outstanding_penalties:,.2f} -> {correct_total:,.2f}  '
                f'(reverse {len(existing_txns)} txn(s) totalling {reversed_total:,.2f}; '
                f'repost {correct_total:,.2f})  {len(row_updates)} row(s) updated'
            )

            if not apply_changes:
                db_transaction.savepoint_rollback(sid)
                return 'dry_run_ok'

            for txn in existing_txns:
                txn.reverse(user=None, reason=REVERSAL_REASON)

            for sched, correct_penalty in row_updates:
                sched.penalty_due = correct_penalty
                sched.save(update_fields=['penalty_due', 'updated_at'])

            loan.outstanding_penalties = correct_total
            loan.save(update_fields=['outstanding_penalties', 'updated_at'])

            penalty_account = loan.product.penalty_income_account
            journal_ref = None
            if correct_total > 0 and penalty_account:
                series, _ = TransactionSeries.objects.get_or_create(
                    code='LNPEN',
                    defaults={'description': 'Loan Penalty Accrual'},
                )
                journal = Transaction.objects.create(
                    series=series,
                    date=today,
                    description=(
                        f'Loan penalty accrual (compounding bug corrected) — {loan_number}'
                    )[:255],
                    owner=loan.owner,
                    branch=loan.branch,
                    tenant=loan.tenant,
                )
                TransactionEntry.objects.create(
                    transaction=journal, account=loan.account,
                    side=TransactionEntry.DEBIT, amount=correct_total,
                )
                TransactionEntry.objects.create(
                    transaction=journal, account=penalty_account,
                    side=TransactionEntry.CREDIT, amount=correct_total,
                )
                journal.post()
                journal_ref = journal.reference_number
                loan.penalty_accrual_active = True
                loan.save(update_fields=['penalty_accrual_active', 'updated_at'])

            log_financial_event(
                FinancialAuditLog.LOAN_BALANCE_CORRECTION,
                acted_by=None,
                record_type='LoanAccount',
                record_id=str(loan.pk),
                amount=-overcharge,
                description=(
                    f'Corrected penalty-on-penalty compounding bug — {loan_number}: reversed '
                    f'{len(existing_txns)} transaction(s) totalling {reversed_total:,.2f}, '
                    f'reposted {correct_total:,.2f} ({len(row_updates)} schedule row(s) recomputed '
                    'using corrected base amount and real resolution date)'
                ),
                extra={
                    'loan_number': loan_number,
                    'reversed_count': len(existing_txns),
                    'reversed_total': str(reversed_total),
                    'reposted_total': str(correct_total),
                    'rows_updated': len(row_updates),
                    'journal_entry_ref': journal_ref,
                    'source_command': 'correct_penalty_compounding_bug',
                },
            )

            db_transaction.savepoint_commit(sid)
            self.stdout.write(self.style.SUCCESS(f'  [{loan_number}] Applied.'))
            return 'applied'
