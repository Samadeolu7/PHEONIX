"""
Management command: correct_principal_penalty_misallocation

Corrects the fourth bug found on LN-571: `inspect_loan_repayment_allocations`
showed principal_paid=0.00, penalties_paid=30,604.44 on a loan whose schedule
independently shows every installment's principal/interest/fees fully
satisfied by that same real payment. Root cause: before 2026-08-05 (see the
"Penalty proportional split" fix), LoanAccount.record_payment() drained a
payment against outstanding_penalties FIRST, before principal. On a legacy
loan whose outstanding_penalties was inflated by the pre-cutover-seeding bug
(see audit_penalty_not_capped_at_payoff), a payment that genuinely satisfied
principal/interest/fees got aggregate-misclassified as penalty collection —
the loan's own principal_paid/outstanding_principal were simply never
touched, even though the SAME payment correctly updated the schedule's
per-installment principal_paid (a different code path within the same
record_payment() call — see LoanAccount._update_schedule_with_payment()).

This does NOT touch outstanding_penalties — that field was already corrected
independently by correct_penalty_not_capped_at_payoff, computed from scratch
via calculate_late_penalty() rather than derived from penalties_paid. This
command only touches principal_paid/interest_paid/fees_paid (resynced UP to
match the schedule's trusted sums) and outstanding_principal/_interest/_fees
(reduced by the same amount), and reduces penalties_paid by the total moved
elsewhere so principal_paid + interest_paid + fees_paid + penalties_paid
still sums to total_paid — nothing about total_paid or the loan's real cash
history changes, only which bucket it's attributed to.

No GL entry is posted: the cash was already correctly collected and posted
to the loan's GL account at payment time (a real LNPMT transaction) — this
only corrects internal business-field bookkeeping about how that already-
posted cash is categorized, not the money itself.

IMPORTANT — scope of the schedule sum: a legacy loan's schedule mixes two
very different kinds of "paid" row. import_legacy_data.py marks installments
'paid' at import time straight from the old system's own is_paid flag, with
that system's own historical payment_date — genuine pre-migration payments
that were never meant to touch Phoenix's post-migration aggregate fields at
all (those start fresh from the migrated `balance`, not a running sum of
pre-migration history). Only installments settled by a REAL, LIVE, post-
migration Phoenix payment should ever be compared against loan.principal_paid
/interest_paid/fees_paid. First version of this command summed every
non-restructured row indiscriminately and produced nonsense (262,919.97
"more paid" on LN-571, against a single real 30,604.44 payment) by conflating
five legacy pre-migration payment dates (Jan-May 2026) with the one real
post-migration one (16 Jul 2026). Fixed: only counts 'partial' rows (only
ever reachable via a live payment — legacy import never seeds partial rows,
see import_legacy_data.py's binary is_paid handling) and 'paid' rows whose
payment_date is on/after LoanProduct.PENALTY_CUTOVER_DATE (2026-06-30, the
same migration-cutover constant already used throughout this investigation).

For each affected loan:
  1. Sums each in-scope schedule row's principal_paid/interest_paid/
     fees_paid — real post-migration payment activity only (see scope note
     above) — and diffs the total against loan.principal_paid+interest_paid
     +fees_paid to get the TOTAL amount misallocated into penalty. Only
     loans where the schedule shows MORE paid than the loan aggregate
     credits are touched (understated direction — money parked in the
     wrong bucket).
  2. Redistributes that total via a priority waterfall — interest first
     (capped at whatever outstanding_interest can currently absorb), then
     fees, then principal for the remainder — NOT a literal copy of the
     schedule's raw component split (see "IMPORTANT" note above for why).
     Updates loan.principal_paid/interest_paid/fees_paid and reduces
     outstanding_principal/_interest/_fees by the same amounts (never
     negative).
  3. Reduces loan.penalties_paid by the total moved, to keep total_paid
     conserved. Verifies principal_paid + interest_paid + fees_paid +
     penalties_paid == total_paid (tolerance 0.01) before committing.
  4. Logs one FinancialAuditLog(LOAN_BALANCE_CORRECTION) per loan.

SAFETY:
  - Dry-run by default. Nothing is written until --apply.
  - Each loan is processed in its own atomic block with a savepoint.
  - --loan for a single loan, --batch for every affected legacy_import loan.
  - Refuses (flags for manual review) any loan where reducing penalties_paid
    would push it negative — that would mean the misallocation is larger
    than what's recorded as penalty, a different/unexpected shape.

Usage:
    python manage.py correct_principal_penalty_misallocation --loan LN-571     # dry-run
    python manage.py correct_principal_penalty_misallocation --loan LN-571 --apply
    python manage.py correct_principal_penalty_misallocation --batch           # dry-run, all
    python manage.py correct_principal_penalty_misallocation --batch --apply
"""
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction as db_transaction
from django.db.models import Sum, Q

TOLERANCE = Decimal('0.01')


class Command(BaseCommand):
    help = (
        'Correct legacy-import loans where a real payment was aggregate-misclassified as '
        'penalty collection (pre-2026-08-05 drain-penalty-first bug) even though the schedule '
        'shows it correctly satisfied principal/interest/fees. Resyncs the loan aggregate up '
        'to match the schedule; no GL entry (cash was already correctly posted).'
    )

    def add_arguments(self, parser):
        parser.add_argument('--loan', dest='loan_number', default=None,
                             help='Only correct a single loan by loan_number.')
        parser.add_argument('--batch', action='store_true',
                             help='Correct every affected legacy_import loan in one run.')
        parser.add_argument('--apply', action='store_true',
                             help='Actually write the correction. Without this, only previews.')

    def handle(self, *args, **options):
        from loans.models import LoanAccount

        loan_number = options['loan_number']
        batch = options['batch']
        apply_changes = options['apply']

        if bool(loan_number) == bool(batch):
            raise CommandError('Pass exactly one of --loan <number> or --batch.')

        loans_qs = LoanAccount.all_objects.filter(
            is_deleted=False, origin=LoanAccount.ORIGIN_LEGACY_IMPORT,
        ).order_by('loan_number')
        if loan_number:
            loans_qs = loans_qs.filter(loan_number=loan_number)
            if not loans_qs.exists():
                raise CommandError(f'Loan {loan_number} not found (or not origin=legacy_import).')

        applied, dry_ran, skipped, needs_review = 0, 0, 0, 0
        for loan in loans_qs.iterator():
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
        from loans.models import LoanProduct

        loan_number = loan.loan_number

        with db_transaction.atomic():
            sid = db_transaction.savepoint()

            loan = type(loan).all_objects.select_for_update().get(pk=loan.pk)

            # Only rows touched by a REAL, LIVE, post-migration payment — see the
            # module docstring's "IMPORTANT — scope of the schedule sum" note.
            # Legacy pre-migration 'paid' rows (import-seeded, old system's own
            # payment_date) must never be counted here.
            in_scope_rows = loan.repayment_schedule.filter(
                Q(status='partial')
                | Q(status='paid', payment_date__gte=LoanProduct.PENALTY_CUTOVER_DATE)
            )
            agg = in_scope_rows.aggregate(
                principal_paid=Sum('principal_paid'),
                interest_paid=Sum('interest_paid'),
                fees_paid=Sum('fees_paid'),
            )
            sched_principal = agg['principal_paid'] or Decimal('0.00')
            sched_interest = agg['interest_paid'] or Decimal('0.00')
            sched_fees = agg['fees_paid'] or Decimal('0.00')

            # The TOTAL amount to move out of penalties_paid is trustworthy (the schedule's
            # in-scope rows are real post-migration payment activity). How it's redistributed
            # among principal/interest/fees is NOT simply the schedule's raw component split,
            # though — a legacy row's interest_due is seeded from the OLD SYSTEM'S OWN PENALTY
            # amount at import (see import_legacy_data.py: `interest_due = penalty`), not real
            # interest, and outstanding_interest on loans using this "bundle everything into
            # principal" migration convention starts at 0 with no capacity to absorb a
            # reduction. Copying the schedule split directly would push outstanding_interest/
            # _fees negative — manufacturing the exact negative-outstanding_* bug this whole
            # investigation keeps finding elsewhere (see LN-714's pre-existing case). Instead,
            # apply the same priority waterfall record_payment() itself uses: interest first,
            # capped at whatever outstanding_interest can actually absorb, then fees, with
            # everything left over going to principal — never negative, always conservative.
            total_delta = (sched_principal - loan.principal_paid) + \
                (sched_interest - loan.interest_paid) + (sched_fees - loan.fees_paid)

            if total_delta <= TOLERANCE:
                db_transaction.savepoint_rollback(sid)
                return 'unaffected'

            new_penalties_paid = loan.penalties_paid - total_delta
            if new_penalties_paid < -TOLERANCE:
                db_transaction.savepoint_rollback(sid)
                self.stdout.write(self.style.WARNING(
                    f'[{loan_number}] needs manual review — schedule shows {total_delta:,.2f} more '
                    f'paid than the loan credits, but penalties_paid ({loan.penalties_paid:,.2f}) '
                    'is not enough to absorb it. Misallocation may span more than just penalty.'
                ))
                return 'needs_review'

            before = (
                f'principal_paid={loan.principal_paid:,.2f} interest_paid={loan.interest_paid:,.2f} '
                f'fees_paid={loan.fees_paid:,.2f} penalties_paid={loan.penalties_paid:,.2f}'
            )

            remaining = total_delta
            delta_interest = min(remaining, max(loan.outstanding_interest, Decimal('0.00')))
            remaining -= delta_interest
            delta_fees = min(remaining, max(loan.outstanding_fees, Decimal('0.00')))
            remaining -= delta_fees
            delta_principal = remaining

            new_principal_paid = loan.principal_paid + delta_principal
            new_interest_paid = loan.interest_paid + delta_interest
            new_fees_paid = loan.fees_paid + delta_fees
            new_outstanding_principal = loan.outstanding_principal - delta_principal
            new_outstanding_interest = loan.outstanding_interest - delta_interest
            new_outstanding_fees = loan.outstanding_fees - delta_fees

            check_sum = new_principal_paid + new_interest_paid + new_fees_paid + new_penalties_paid
            if abs(check_sum - loan.total_paid) > TOLERANCE:
                db_transaction.savepoint_rollback(sid)
                self.stderr.write(self.style.ERROR(
                    f'[{loan_number}] FAILED verification — recomputed components sum to '
                    f'{check_sum:,.2f}, does not match total_paid {loan.total_paid:,.2f}. Not written.'
                ))
                return 'needs_review'

            self.stdout.write(
                f'[{loan_number}] pk={loan.pk}  moving {total_delta:,.2f} out of penalties_paid\n'
                f'    before: {before}\n'
                f'    after:  principal_paid={new_principal_paid:,.2f} interest_paid={new_interest_paid:,.2f} '
                f'fees_paid={new_fees_paid:,.2f} penalties_paid={new_penalties_paid:,.2f}\n'
                f'    outstanding_principal {loan.outstanding_principal:,.2f} -> {new_outstanding_principal:,.2f}  '
                f'outstanding_interest {loan.outstanding_interest:,.2f} -> {new_outstanding_interest:,.2f}  '
                f'outstanding_fees {loan.outstanding_fees:,.2f} -> {new_outstanding_fees:,.2f}'
            )

            if not apply_changes:
                db_transaction.savepoint_rollback(sid)
                return 'dry_run_ok'

            loan.principal_paid = new_principal_paid
            loan.interest_paid = new_interest_paid
            loan.fees_paid = new_fees_paid
            loan.penalties_paid = new_penalties_paid
            loan.outstanding_principal = new_outstanding_principal
            loan.outstanding_interest = new_outstanding_interest
            loan.outstanding_fees = new_outstanding_fees
            loan.save(update_fields=[
                'principal_paid', 'interest_paid', 'fees_paid', 'penalties_paid',
                'outstanding_principal', 'outstanding_interest', 'outstanding_fees', 'updated_at',
            ])

            log_financial_event(
                FinancialAuditLog.LOAN_BALANCE_CORRECTION,
                acted_by=None,
                record_type='LoanAccount',
                record_id=str(loan.pk),
                amount=total_delta,
                description=(
                    f'Corrected principal/penalty misallocation — {loan_number}: moved {total_delta:,.2f} '
                    f'from penalties_paid to principal_paid({delta_principal:,.2f})/'
                    f'interest_paid({delta_interest:,.2f})/fees_paid({delta_fees:,.2f}), matching the '
                    'schedule\'s own trusted per-installment record. No GL entry — cash already correctly posted.'
                ),
                extra={
                    'loan_number': loan_number,
                    'moved_to_principal': str(delta_principal),
                    'moved_to_interest': str(delta_interest),
                    'moved_to_fees': str(delta_fees),
                    'moved_from_penalty': str(total_delta),
                    'source_command': 'correct_principal_penalty_misallocation',
                },
            )

            db_transaction.savepoint_commit(sid)
            self.stdout.write(self.style.SUCCESS(f'  [{loan_number}] Applied.'))
            return 'applied'
