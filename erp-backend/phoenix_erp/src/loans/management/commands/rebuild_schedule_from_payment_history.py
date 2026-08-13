"""
Management command: rebuild_schedule_from_payment_history

Fixes the gap found by audit_schedule_penalty_paid_drift: LoanRepaymentSchedule's
per-component _paid fields (principal_paid/interest_paid/fees_paid/penalty_paid)
were written by a broken proportional allocation in _update_schedule_with_payment()
before it was fixed on 2026-08-05. Payments recorded before that fix can still
have the wrong composition on their installment rows — even though the loan-level
aggregates (LoanAccount.penalties_paid/interest_paid/fees_paid/principal_paid)
are unaffected, tracked independently in record_payment().

Rather than estimate a correction from aggregate drift (audit_schedule_penalty_
paid_drift's per-loan number turned out unsafe to act on directly — see
reverse_penalty_gl_overaccrual's docstring for why), this REPLAYS each
affected loan's real payment history:

  1. Reset every schedule row's principal_paid/interest_paid/fees_paid/
     penalty_paid/total_paid/status/payment_date/days_late.
  2. Re-apply every historical payment, in the order it actually happened,
     through LoanAccount._update_schedule_with_payment() — the exact same,
     now-correct, due-date-ordered waterfall used for new payments today.
     The real principal/interest/fees/penalty split for each historical
     payment comes from FinancialAuditLog(LOAN_REPAY).extra, logged at
     payment time from the same in-memory split actually applied to the
     loan's aggregates — untouched by the schedule bug (see
     report_penalty_paid_per_payment.py, which reads the same ground truth).
  3. Verify Sum(schedule.*_paid) now matches the loan's trusted aggregates
     before committing. A loan that doesn't reconcile after replay is
     skipped, not written — better to leave it visibly wrong than silently
     wrong.

Only ever touches LoanRepaymentSchedule rows (principal_paid, interest_paid,
fees_paid, penalty_paid, total_paid, status, payment_date, days_late). Never
touches *_due fields, LoanAccount aggregates, or GL — those are unaffected by
this bug and are handled (if at all) by separate, already-existing tools.

Excluded, not fixed here — flagged in the output for manual handling:
  - Loans with a COMPLETED LoanRepaymentReversal. A reversal partially undoes
    an earlier payment's effect on the loan's aggregates; correctly netting
    that into a chronological replay needs case-by-case handling this command
    doesn't attempt. Blindly replaying only the still-standing LOAN_REPAY
    entries could double-count or miscount for these loans.
  - Loans with total_paid > 0 but zero LOAN_REPAY audit log entries (payment
    history predates that logging, or was never logged) — nothing to replay
    from.

SAFETY:
  - Dry-run by default. Nothing is written until --apply.
  - Each loan is replayed and verified inside its own savepoint — one loan
    failing verification doesn't block the others in the same run.
  - No FinancialAuditLog entries about this correction are money-moving (no
    GL, no loan aggregate changes) — still logged via
    FinancialAuditLog(LOAN_BALANCE_CORRECTION) per loan for traceability.

Usage:
    python manage.py rebuild_schedule_from_payment_history                # auto-detect drifted loans, dry-run
    python manage.py rebuild_schedule_from_payment_history --loan LN-532  # one loan, dry-run
    python manage.py rebuild_schedule_from_payment_history --apply        # writes verified loans
"""
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction as db_transaction
from django.db.models import Sum


TOLERANCE = Decimal('0.01')


class Command(BaseCommand):
    help = (
        'Replay real payment history (FinancialAuditLog LOAN_REPAY) through the fixed '
        'schedule-allocation logic to correct drifted per-installment paid composition. '
        'Dry-run by default; --apply writes only loans that verify clean after replay.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--loan', dest='loan_number', default=None,
                             help='Only process a single loan by loan_number.')
        parser.add_argument('--apply', action='store_true',
                             help='Actually write the rebuilt schedule. Without this, only previews.')

    def handle(self, *args, **options):
        from loans.models import LoanAccount, LoanRepaymentReversal, LoanRestructure
        from common.models import FinancialAuditLog, log_financial_event
        from transactions.models import Transaction
        from django.utils import timezone

        loan_number = options['loan_number']
        apply_changes = options['apply']
        today = timezone.localdate()

        loans = LoanAccount.all_objects.filter(is_deleted=False).order_by('loan_number')
        if loan_number:
            loans = loans.filter(loan_number=loan_number)

        candidates = []
        for loan in loans.iterator():
            agg = loan.repayment_schedule.aggregate(
                principal=Sum('principal_paid'), interest=Sum('interest_paid'),
                fees=Sum('fees_paid'), penalty=Sum('penalty_paid'), total=Sum('total_paid'),
            )
            drift = (
                abs((agg['principal'] or Decimal('0.00')) - (loan.principal_paid or Decimal('0.00'))) > TOLERANCE
                or abs((agg['interest'] or Decimal('0.00')) - (loan.interest_paid or Decimal('0.00'))) > TOLERANCE
                or abs((agg['fees'] or Decimal('0.00')) - (loan.fees_paid or Decimal('0.00'))) > TOLERANCE
                or abs((agg['penalty'] or Decimal('0.00')) - (loan.penalties_paid or Decimal('0.00'))) > TOLERANCE
                or abs((agg['total'] or Decimal('0.00')) - (loan.total_paid or Decimal('0.00'))) > TOLERANCE
            )
            if drift or loan_number:
                candidates.append(loan)

        if not candidates:
            self.stdout.write(self.style.SUCCESS('No drifted loans found.'))
            return

        self.stdout.write(f'{len(candidates)} loan(s) to check.\n')

        excluded_reversals = []
        excluded_restructured = []
        excluded_no_logs = []
        verified_ok = []
        verified_failed = []

        for loan in candidates:
            if LoanRepaymentReversal.objects.filter(
                loan=loan, status=LoanRepaymentReversal.COMPLETED,
            ).exists():
                excluded_reversals.append(loan.loan_number)
                continue

            # Restructuring never deletes the old schedule rows — it marks them
            # status='restructured' and generates new ones alongside (see
            # LoanAccount.restructure(), models.py ~1898). A chronological
            # replay against "every row this loan has" would revive those
            # retired rows back into pending/overdue and let the due-date-order
            # waterfall consume payments against them before ever reaching the
            # real current installments — exactly what caused this command's
            # false verification failures on 2026-08-13. Correctly replaying a
            # restructured loan means splitting at the restructure's
            # effective_date (pre-restructure payments stay against the old,
            # now-retired rows; only post-restructure payments apply to the
            # new ones) — a different, more careful job this command doesn't
            # attempt. Flag for manual review instead.
            if LoanRestructure.objects.filter(loan=loan).exists():
                excluded_restructured.append(loan.loan_number)
                continue

            logs = list(
                FinancialAuditLog.objects.filter(
                    event_type=FinancialAuditLog.LOAN_REPAY,
                    extra__loan_number=loan.loan_number,
                ).order_by('timestamp', 'id')
            )
            if not logs and loan.total_paid and loan.total_paid > 0:
                excluded_no_logs.append(loan.loan_number)
                continue
            if not logs:
                continue  # nothing paid, nothing to replay, nothing drifted worth reporting

            journal_ids = [log.extra.get('journal_entry_id') for log in logs]
            txn_dates = dict(
                Transaction.all_objects.filter(pk__in=[j for j in journal_ids if j])
                .values_list('pk', 'date')
            )

            with db_transaction.atomic():
                sid = db_transaction.savepoint()

                # Lock and refresh the loan row itself too — matches record_payment()'s
                # own entry pattern — so a real payment landing on this loan while this
                # command runs can't interleave with the reset/replay below.
                loan = type(loan).objects.select_for_update().get(pk=loan.pk)

                # Only ever touch rows in the normal lifecycle. Belt-and-braces on
                # top of the LoanRestructure exclusion above — any row sitting in
                # some other, non-standard status (e.g. 'restructured') is retired
                # and must never be revived back into the active pool.
                schedules = list(
                    loan.repayment_schedule.select_for_update()
                    .filter(status__in=['pending', 'partial', 'overdue', 'paid'])
                    .order_by('due_date')
                )
                for sched in schedules:
                    sched.principal_paid = Decimal('0.00')
                    sched.interest_paid = Decimal('0.00')
                    sched.fees_paid = Decimal('0.00')
                    sched.penalty_paid = Decimal('0.00')
                    sched.total_paid = Decimal('0.00')
                    sched.payment_date = None
                    sched.days_late = 0
                    sched.status = 'overdue' if sched.due_date < today else 'pending'
                    sched.save()
                loan.installments_paid = 0

                for log in logs:
                    extra = log.extra or {}
                    txn_pk = extra.get('journal_entry_id')
                    payment_date = txn_dates.get(txn_pk) or log.timestamp.date()
                    loan._update_schedule_with_payment(
                        log.amount or Decimal('0.00'),
                        payment_date,
                        penalty=Decimal(extra.get('penalty', '0') or '0'),
                        interest=Decimal(extra.get('interest', '0') or '0'),
                        fees=Decimal(extra.get('fees', '0') or '0'),
                        principal=Decimal(extra.get('principal', '0') or '0'),
                    )

                loan.save(update_fields=['installments_paid', 'updated_at'])

                post_agg = loan.repayment_schedule.aggregate(
                    principal=Sum('principal_paid'), interest=Sum('interest_paid'),
                    fees=Sum('fees_paid'), penalty=Sum('penalty_paid'), total=Sum('total_paid'),
                )
                ok = (
                    abs((post_agg['principal'] or Decimal('0.00')) - (loan.principal_paid or Decimal('0.00'))) <= TOLERANCE
                    and abs((post_agg['interest'] or Decimal('0.00')) - (loan.interest_paid or Decimal('0.00'))) <= TOLERANCE
                    and abs((post_agg['fees'] or Decimal('0.00')) - (loan.fees_paid or Decimal('0.00'))) <= TOLERANCE
                    and abs((post_agg['penalty'] or Decimal('0.00')) - (loan.penalties_paid or Decimal('0.00'))) <= TOLERANCE
                    and abs((post_agg['total'] or Decimal('0.00')) - (loan.total_paid or Decimal('0.00'))) <= TOLERANCE
                )

                if ok and apply_changes:
                    log_financial_event(
                        FinancialAuditLog.LOAN_BALANCE_CORRECTION,
                        acted_by=None,
                        record_type='LoanAccount',
                        record_id=str(loan.pk),
                        amount=Decimal('0.00'),
                        description=(
                            f'Repayment schedule rebuilt from payment history — {loan.loan_number} '
                            f'({len(logs)} payment(s) replayed)'
                        ),
                        extra={
                            'loan_number': loan.loan_number,
                            'payments_replayed': len(logs),
                            'source_command': 'rebuild_schedule_from_payment_history',
                        },
                    )
                    db_transaction.savepoint_commit(sid)
                    verified_ok.append((loan.loan_number, len(logs)))
                else:
                    db_transaction.savepoint_rollback(sid)
                    if ok:
                        verified_ok.append((loan.loan_number, len(logs)))
                    else:
                        verified_failed.append((loan.loan_number, len(logs), post_agg, {
                            'principal': loan.principal_paid, 'interest': loan.interest_paid,
                            'fees': loan.fees_paid, 'penalty': loan.penalties_paid, 'total': loan.total_paid,
                        }))

        if verified_ok:
            self.stdout.write(self.style.SUCCESS(f'\nVerified clean after replay ({len(verified_ok)}):'))
            for ln, n in verified_ok:
                self.stdout.write(f'  {ln:24s} {n} payment(s) replayed')

        if verified_failed:
            self.stdout.write(self.style.ERROR(
                f"\nFAILED verification after replay ({len(verified_failed)}) — NOT written, needs manual review:"
            ))
            for ln, n, post_agg, trusted in verified_failed:
                self.stdout.write(f'  {ln:24s} {n} payment(s) replayed')
                self.stdout.write(f'    schedule-after-replay: {post_agg}')
                self.stdout.write(f'    trusted aggregates:    {trusted}')

        if excluded_reversals:
            self.stdout.write(self.style.WARNING(
                f'\nExcluded — has a completed reversal, needs manual handling ({len(excluded_reversals)}): '
                + ', '.join(excluded_reversals)
            ))

        if excluded_restructured:
            self.stdout.write(self.style.WARNING(
                f'\nExcluded — has been restructured, needs manual handling ({len(excluded_restructured)}): '
                + ', '.join(excluded_restructured)
            ))

        if excluded_no_logs:
            self.stdout.write(self.style.WARNING(
                f'\nExcluded — total_paid > 0 but no LOAN_REPAY audit log entries ({len(excluded_no_logs)}): '
                + ', '.join(excluded_no_logs)
            ))

        if not apply_changes:
            self.stdout.write(self.style.WARNING(
                '\nDRY-RUN — nothing written. Re-run with --apply to write every loan listed as '
                '"Verified clean after replay".'
            ))
        else:
            self.stdout.write(self.style.SUCCESS(f'\nApplied. Wrote {len(verified_ok)} loan(s).'))
