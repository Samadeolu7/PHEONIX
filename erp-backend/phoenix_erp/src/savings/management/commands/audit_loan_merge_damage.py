"""
savings/management/commands/audit_loan_merge_damage.py
========================================================
READ-ONLY diagnostic. Makes NO database writes.

merge_duplicate_accounts._merge_loans() cancels duplicate loans whose
outstanding_principal == 0, soft-deleting their GL Account WITHOUT checking
the account's actual ledger balance and WITHOUT posting any reversing
journal entry. If that GL account still carried a non-zero balance (e.g.
leftover interest/fee/penalty amounts fallback-credited to the loan
account because the LoanProduct had no interest_income_account /
fee_income_account / penalty_income_account configured), that balance is
silently dropped out of the Trial Balance forever, because:

  - generate_trial_balance() only queries Account.objects.filter(is_deleted=False)
  - the parent-account rollup only sums account.children.filter(is_deleted=False)

'cancelled' is a LoanAccount status value that is ONLY ever set by
merge_duplicate_accounts._merge_loans() (verified: no other code path in
this codebase sets LoanAccount.status = 'cancelled'). So every LoanAccount
with status='cancelled' is a candidate for having been touched by that
command, and any of those whose linked GL Account has a non-zero balance
is a confirmed instance of this bug.

Usage
-----
    python manage.py audit_loan_merge_damage
"""
from __future__ import annotations

from decimal import Decimal

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = (
        'READ-ONLY. Finds duplicate loan GL accounts soft-deleted by '
        'merge_duplicate_accounts that still carry a non-zero balance — '
        'the cause of a trial balance imbalance. Makes no changes.'
    )

    def handle(self, *args, **options):
        from loans.models import LoanAccount

        self.stdout.write('=== Loan-Merge Damage Audit (read-only) ===\n')

        affected = list(
            LoanAccount.all_objects
            .filter(status='cancelled', is_deleted=True)
            .exclude(account__balance=Decimal('0.00'))
            .select_related('account', 'client', 'product__product')
            .order_by('client_id', 'product_id')
        )

        all_cancelled_count = LoanAccount.all_objects.filter(
            status='cancelled', is_deleted=True
        ).count()

        self.stdout.write(
            f'Total loans cancelled by merge_duplicate_accounts: {all_cancelled_count}'
        )
        self.stdout.write(
            f'Of those, with a NON-ZERO GL account balance (the bug): {len(affected)}\n'
        )

        if not affected:
            self.stdout.write(self.style.SUCCESS(
                'No affected accounts found. If the trial balance is still off, '
                'the cause is something else — do not assume this is the full story.'
            ))
            return

        total_debit_leftover = Decimal('0.00')
        total_credit_leftover = Decimal('0.00')

        for loan in affected:
            bal = loan.account.balance
            client_label = getattr(loan.client, 'full_name', str(loan.client_id))
            try:
                product_label = loan.product.product.name
            except Exception:
                product_label = f'product_id={loan.product_id}'

            direction = 'DR (asset-side residual)' if bal > 0 else 'CR (excess credited — likely unrecognized income)'
            if bal > 0:
                total_debit_leftover += bal
            else:
                total_credit_leftover += -bal

            self.stdout.write(
                f'  Loan #{loan.pk} ({loan.loan_number})\n'
                f'    Client        : {client_label}\n'
                f'    Product       : {product_label}\n'
                f'    GL Account    : {loan.account.code} (id={loan.account_id})\n'
                f'    Balance       : {bal}  [{direction}]\n'
                f'    disbursed_amount    : {loan.disbursed_amount}\n'
                f'    outstanding_principal: {loan.outstanding_principal}\n'
                f'    updated_at    : {loan.updated_at}\n'
            )

        net = total_debit_leftover - total_credit_leftover
        self.stdout.write(self.style.WARNING(
            f'\nTotal leftover DR balances : {total_debit_leftover}\n'
            f'Total leftover CR balances : {total_credit_leftover}\n'
            f'Net (DR - CR)              : {net}\n'
            f'(Compare |net| and the individual totals against your trial '
            f'balance "difference" figure — they should line up.)'
        ))
