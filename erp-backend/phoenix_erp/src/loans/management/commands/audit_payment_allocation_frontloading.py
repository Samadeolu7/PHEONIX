"""
Management command: audit_payment_allocation_frontloading

Read-only. Scopes the payment-allocation bug found on LN-20260702-B91A43
(2026-07-15): record_payment() (loans/models.py:1036-1049) allocates each
payment against `self.outstanding_interest` — the loan's ENTIRE remaining
interest for the whole term — before touching principal at all, instead of
following the per-installment schedule's principal_due/interest_due split.

For loans where interest was recognized in full at disbursement (the
"default" GL path), this is invisible: the interest portion still lands in
Loan Receivable regardless. It's only GL-visible — and financially wrong —
for loans on the "legacy cash-basis fallback" path (interest_income_account
was NULL at disbursement time, interest_recognized_at_disbursement=False,
interest_deferral_active=False): every payment's interest_payment portion
credits Income directly, so real collected cash sits fully in Income with
zero principal reduction until the loan's aggregate interest pool drains —
several installments in, for a typical flat-rate schedule.

Flags any such loan where total_paid > 0 but principal_paid is
disproportionately low relative to how many installments are already
marked 'paid' — the signature of this bug.

Usage:
    python manage.py audit_payment_allocation_frontloading
"""
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db.models import Sum


class Command(BaseCommand):
    help = 'Read-only scope check for the interest-before-principal payment allocation bug.'

    def handle(self, *args, **options):
        from loans.models import LoanAccount

        candidates = LoanAccount.objects.filter(
            interest_recognized_at_disbursement=False,
            interest_deferral_active=False,
            total_paid__gt=Decimal('0.00'),
            is_deleted=False,
        ).select_related('product', 'product__product').order_by('loan_number')

        self.stdout.write(self.style.MIGRATE_HEADING(
            f'Checked {candidates.count()} loan(s) on the legacy cash-basis fallback path with payments recorded.'
        ))
        self.stdout.write('')

        flagged = []
        total_stuck_principal = Decimal('0.00')

        for loan in candidates:
            paid_installments = loan.repayment_schedule.filter(status='paid').count()
            expected_principal_roughly = loan.repayment_schedule.filter(
                status='paid'
            ).aggregate(total=Sum('principal_due'))['total'] or Decimal('0.00')

            shortfall = expected_principal_roughly - loan.principal_paid
            is_flagged = paid_installments > 0 and shortfall > Decimal('0.01')

            product_name = loan.product.product.name if loan.product_id else '?'
            line = (
                f'  [{loan.loan_number}] {product_name:22} paid_installments={paid_installments:3} '
                f'total_paid={loan.total_paid:>12,.2f}  principal_paid={loan.principal_paid:>12,.2f}  '
                f'expected_principal~={expected_principal_roughly:>12,.2f}  '
                f'outstanding_principal={loan.outstanding_principal:>12,.2f}'
            )

            if is_flagged:
                flagged.append(loan.loan_number)
                total_stuck_principal += shortfall
                self.stdout.write(self.style.WARNING(line + f'  ** SHORTFALL={shortfall:,.2f}'))
            elif paid_installments > 0:
                self.stdout.write(self.style.SUCCESS(line))

        self.stdout.write('')
        if flagged:
            self.stdout.write(self.style.ERROR(
                f'{len(flagged)} loan(s) affected. Total principal that should have been recognized '
                f'as collected but is stuck in outstanding_principal instead: {total_stuck_principal:,.2f}'
            ))
            self.stdout.write('Affected loans: ' + ', '.join(flagged))
        else:
            self.stdout.write(self.style.SUCCESS('No loans show the frontloading pattern.'))
