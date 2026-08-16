"""
Management command: audit_outstanding_principal_vs_schedule

Read-only audit. Triggered by LN-858 (loan pk 652, Catherine Adukwu):
disbursed_amount=50,000.00, principal_paid=2,200.00 (2 installments paid in
full + one partial), yet outstanding_principal=800.00 — nowhere near the
47,800.00 that disbursed_amount - principal_paid implies, and nowhere near
the 57,800.00 the loan's own repayment_schedule says is still owed (58 of
60 daily 1,000.00 installments still pending/overdue/partial). 800.00 is
suspiciously exactly the remainder of the loan's *next single installment*
(1,000.00 due − 200.00 paid) — as if outstanding_principal on this loan got
set from one installment's balance instead of the sum of everything still
owed across the schedule.

This matters beyond cosmetics: outstanding_principal (via total_outstanding)
drives the defaulters report's "Outstanding" column, PAR-bucket balances,
CBN provisioning (provision_amount = provision_pct × outstanding_principal —
already visibly wrong on LN-858: 400.00 provisioned against a loan that's
really carrying ~57,800.00 in likely-unrecoverable exposure), and the
loan-book GL reconciliation. A loan can also silently look "paid off" while
still owing money: record_payment() treats outstanding_principal == 0 (with
total_outstanding == 0) as fully settled and flips status to paid_off — see
LoanAccount.record_payment(), models.py ~1214.

record_payment() itself decrements outstanding_principal correctly, one
payment at a time (models.py ~1204) — this audit does not accuse that path.
The likely origin is a schedule regeneration or manual correction that
rewrote the schedule (or reset outstanding_principal) without keeping the
two in sync; nothing currently reconciles them, and no code path recomputes
outstanding_principal FROM the schedule the way this audit does. Which tool
actually caused it is not this command's concern — it only finds every loan
where the two have already drifted apart, elsewhere in the book.

Ground truth used: sum over every non-restructured repayment_schedule row of
(principal_due - principal_paid). Rows with status='restructured' are
excluded — a restructure retires the old schedule rows in place rather than
deleting them (see LoanAccount.restructure(), models.py ~1798), so their
principal_due must not double-count against the new schedule that replaced
them.

written_off / paid_off / closed loans are excluded — write-off and payoff
paths deliberately zero outstanding_principal without touching the schedule
rows' status (models.py ~1728, ~2843, ~3597), so schedule-vs-aggregate drift
on those is expected, not a bug.

Makes no changes — report only.

Usage:
    python manage.py audit_outstanding_principal_vs_schedule
    python manage.py audit_outstanding_principal_vs_schedule --loan LN-858
    python manage.py audit_outstanding_principal_vs_schedule --tolerance 5.00
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

    def handle(self, *args, **options):
        from loans.models import LoanAccount

        tolerance = Decimal(options['tolerance'])
        loan_number = options['loan_number']

        loans = LoanAccount.all_objects.filter(
            is_deleted=False,
        ).exclude(
            status__in=['written_off', 'paid_off', 'closed'],
        ).select_related('client').order_by('loan_number')
        if loan_number:
            loans = loans.filter(loan_number=loan_number)

        flagged = []
        for loan in loans.iterator():
            agg = loan.repayment_schedule.exclude(status='restructured').aggregate(
                principal_due=Sum('principal_due'), principal_paid=Sum('principal_paid'),
            )
            principal_due = agg['principal_due'] or Decimal('0.00')
            principal_paid = agg['principal_paid'] or Decimal('0.00')
            schedule_remaining = principal_due - principal_paid
            drift = loan.outstanding_principal - schedule_remaining

            if abs(drift) > tolerance:
                flagged.append((loan, schedule_remaining, drift))

        if not flagged:
            self.stdout.write(self.style.SUCCESS(
                'No loans found where outstanding_principal disagrees with the repayment schedule.'
            ))
            return

        self.stdout.write(self.style.ERROR(
            f'{len(flagged)} loan(s) have outstanding_principal out of sync with their schedule:\n'
        ))

        for loan, schedule_remaining, drift in flagged:
            direction = 'UNDERSTATED' if drift < 0 else 'OVERSTATED'
            self.stdout.write(
                f'  [{loan.loan_number}] pk={loan.pk}  client={loan.client_id}  status={loan.status}  '
                f'days_in_arrears={loan.days_in_arrears}\n'
                f'      outstanding_principal (loan)     = {loan.outstanding_principal:>14,.2f}\n'
                f'      schedule-derived remaining        = {schedule_remaining:>14,.2f}\n'
                f'      drift                              = {drift:>14,.2f}  ({direction})\n'
                f'      provision_amount (built on the wrong figure) = {loan.provision_amount:,.2f}\n'
            )

        self.stdout.write(self.style.WARNING(
            '\noutstanding_principal drives total_outstanding, the defaulters report\'s '
            '"Outstanding" column, PAR-bucket balances, and provision_amount. An UNDERSTATED '
            'drift on an active/defaulted loan risks it being treated as paid_off prematurely '
            '(record_payment() flips status to paid_off once outstanding_principal hits 0). '
            'No automated correction applied here — recompute outstanding_principal from the '
            'schedule (schedule-derived remaining above) after confirming the schedule itself '
            'is trustworthy for each flagged loan.'
        ))
