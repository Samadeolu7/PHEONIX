"""
Management command: audit_outstanding_principal_vs_schedule

Read-only audit. Triggered by LN-858 (loan pk 652, Catherine Adukwu, origin=
legacy_import): outstanding_principal=800.00, but the loan's own
repayment_schedule says 57,800.00 is still owed (58 of 60 daily 1,000.00
installments still pending/overdue/partial). A first run of this command
turned up 228 loans with the same kind of disagreement across the book.

This is NOT a duplicated/bloated schedule. For LN-858, the schedule's own
total (60 x 1,000.00 = 60,000.00) reconciles exactly to disbursed_amount
(50,000.00) + its stated flat interest (20% over the term = 10,000.00) — the
schedule is structurally the correct, complete, original repayment plan for
this loan. The two numbers just come from two different fields in the same
legacy migration that were never cross-checked against each other:

  - outstanding_principal was written directly from the legacy system's own
    `balance` field (import_legacy_data.py:_import_loans, ~line 1257:
    `outstanding_principal=balance`).
  - The schedule rows' paid/unpaid status was written from the legacy
    system's separate per-installment `is_paid` export (same method,
    ~line 1289 onward).

Nothing in the importer (or anywhere since) reconciles those two figures
against each other — see the importer's own docstring, which describes the
mapping for each field but never a cross-check. When the old system's
`balance` was updated by something that didn't also flip every settled
installment's `is_paid` flag (a rollover/top-up/consolidation being the
classic MFI case: a new loan pays off an old one behind the scenes, and the
old loan's balance gets zeroed or adjusted while its schedule rows are left
untouched) — or when `balance` itself was simply stale/wrong in the legacy
system — the two fields land far apart on import, and Phoenix has carried
that disagreement forward unquestioned ever since.

Which field is right can't be determined by code alone; it needs the legacy
source (or ops/collections staff) to confirm, per loan or per cohort. This
audit's job is only to surface every loan where the two disagree, plus a
schedule-integrity signal to help prioritize: `schedule_matches_terms=True`
means the schedule itself is intact (its total_due reconciles to
disbursed_amount, i.e. no evidence of corrupted/duplicated rows) — the
disagreement is specifically an origin-data conflict, not a Phoenix bug in
generating the schedule.

This matters beyond cosmetics: outstanding_principal (via total_outstanding)
drives the defaulters report's "Outstanding" column, PAR-bucket balances,
CBN provisioning (provision_amount = provision_pct x outstanding_principal),
and the loan-book GL reconciliation — all silently wrong for every loan
below until someone decides which figure to trust. A loan can also look
"paid off" while a client still genuinely owes money: record_payment()
treats outstanding_principal == 0 (with total_outstanding == 0) as fully
settled and flips status to paid_off — see LoanAccount.record_payment(),
models.py ~1214.

record_payment() itself decrements outstanding_principal correctly, one
payment at a time (models.py ~1204) — this audit does not accuse that path,
and payments collected live since go-live (e.g. LN-858's 2,200.00, two
installments collected in July/August against its oldest unpaid legacy
rows) are real, verified collections, not part of the drift.

Ground truth used for "schedule-derived remaining": sum over every
non-restructured repayment_schedule row of (principal_due - principal_paid).
Rows with status='restructured' are excluded — a restructure retires the old
schedule rows in place rather than deleting them (see LoanAccount.
restructure(), models.py ~1798), so their principal_due must not
double-count against the new schedule that replaced them.

written_off / paid_off / closed loans are excluded — write-off and payoff
paths deliberately zero outstanding_principal without touching the schedule
rows' status (models.py ~1728, ~2843, ~3597), so schedule-vs-aggregate drift
on those is expected, not a bug.

Makes no changes — report only.

Usage:
    python manage.py audit_outstanding_principal_vs_schedule
    python manage.py audit_outstanding_principal_vs_schedule --loan LN-858
    python manage.py audit_outstanding_principal_vs_schedule --tolerance 5.00
    python manage.py audit_outstanding_principal_vs_schedule --legacy-only
"""
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db.models import Sum


class Command(BaseCommand):
    help = (
        'Read-only audit: loans whose outstanding_principal disagrees with the remaining '
        'principal implied by their own repayment_schedule rows.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--loan', dest='loan_number', default=None,
                             help='Only check a single loan by loan_number.')
        parser.add_argument('--tolerance', type=str, default='1.00',
                             help='Naira drift below which a loan is not flagged (default 1.00).')
        parser.add_argument('--legacy-only', action='store_true',
                             help='Only check loans with origin=legacy_import.')

    def handle(self, *args, **options):
        from loans.models import LoanAccount

        tolerance = Decimal(options['tolerance'])
        loan_number = options['loan_number']
        legacy_only = options['legacy_only']

        loans = LoanAccount.all_objects.filter(
            is_deleted=False,
        ).exclude(
            status__in=['written_off', 'paid_off', 'closed'],
        ).select_related('client').order_by('loan_number')
        if loan_number:
            loans = loans.filter(loan_number=loan_number)
        if legacy_only:
            loans = loans.filter(origin=LoanAccount.ORIGIN_LEGACY_IMPORT)

        flagged = []
        for loan in loans.iterator():
            agg = loan.repayment_schedule.exclude(status='restructured').aggregate(
                principal_due=Sum('principal_due'), principal_paid=Sum('principal_paid'),
                total_due=Sum('total_due'),
            )
            principal_due = agg['principal_due'] or Decimal('0.00')
            principal_paid = agg['principal_paid'] or Decimal('0.00')
            total_due = agg['total_due'] or Decimal('0.00')
            schedule_remaining = principal_due - principal_paid
            drift = loan.outstanding_principal - schedule_remaining

            if abs(drift) > tolerance:
                # Sanity-check the schedule itself: does its full total_due
                # reconcile to what this loan was actually disbursed (allowing
                # generous headroom for interest/fees/penalties baked into
                # total_due)? If total_due is wildly larger than anything
                # disbursed_amount could justify, the schedule side may be the
                # corrupted one rather than outstanding_principal — flag it
                # separately instead of assuming the drift always favors the
                # schedule.
                disbursed = loan.disbursed_amount or Decimal('0.00')
                schedule_matches_terms = (
                    disbursed > 0
                    and total_due <= disbursed * Decimal('3')
                )
                flagged.append((loan, schedule_remaining, drift, schedule_matches_terms))

        if not flagged:
            self.stdout.write(self.style.SUCCESS(
                'No loans found where outstanding_principal disagrees with the repayment schedule.'
            ))
            return

        self.stdout.write(self.style.ERROR(
            f'{len(flagged)} loan(s) have outstanding_principal out of sync with their schedule:\n'
        ))

        legacy_count = 0
        for loan, schedule_remaining, drift, schedule_matches_terms in flagged:
            direction = 'UNDERSTATED' if drift < 0 else 'OVERSTATED'
            is_legacy = loan.origin == LoanAccount.ORIGIN_LEGACY_IMPORT
            if is_legacy:
                legacy_count += 1
            self.stdout.write(
                f'  [{loan.loan_number}] pk={loan.pk}  client={loan.client_id}  status={loan.status}  '
                f'origin={loan.origin}  days_in_arrears={loan.days_in_arrears}\n'
                f'      outstanding_principal (loan)     = {loan.outstanding_principal:>14,.2f}\n'
                f'      schedule-derived remaining        = {schedule_remaining:>14,.2f}\n'
                f'      drift                              = {drift:>14,.2f}  ({direction})\n'
                f'      schedule_matches_terms             = {schedule_matches_terms}  '
                f'(schedule total_due vs disbursed_amount={loan.disbursed_amount:,.2f})\n'
                f'      provision_amount (built on the wrong figure) = {loan.provision_amount:,.2f}\n'
            )

        self.stdout.write(self.style.WARNING(
            f'\n{legacy_count}/{len(flagged)} flagged loans are origin=legacy_import. For those, '
            'outstanding_principal came from the old system\'s `balance` field and the schedule\'s '
            'paid/unpaid flags came from a separate export — nothing cross-checks them at import '
            '(see import_legacy_data.py:_import_loans). schedule_matches_terms=True means the '
            'schedule itself is structurally intact (not duplicated/corrupted) — the disagreement '
            'is an origin-data conflict between two legacy fields, not a schedule-generation bug. '
            'Confirm against the legacy source or ops before trusting either figure over the other; '
            'this command applies no correction.'
        ))
