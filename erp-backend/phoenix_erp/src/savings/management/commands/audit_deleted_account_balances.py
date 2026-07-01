"""
savings/management/commands/audit_deleted_account_balances.py
================================================================
READ-ONLY diagnostic. Makes NO database writes.

generate_trial_balance() only sums Account.objects.filter(is_deleted=False),
both at the top level and in the parent-rollup (account.children.filter(
is_deleted=False)). Any GL Account that is soft-deleted (is_deleted=True)
while still holding a non-zero `balance` silently drops that amount out of
every future trial balance, with nothing on the other side of the ledger to
offset it. This is the general shape of the bug suspected in
merge_duplicate_accounts (and possibly other soft-delete paths) — this
command finds every instance of it, not just the loan-specific case.

Usage
-----
    python manage.py audit_deleted_account_balances
"""
from __future__ import annotations

from decimal import Decimal

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = (
        'READ-ONLY. Finds every soft-deleted GL Account that still carries '
        'a non-zero balance — accounts silently missing from the trial '
        'balance. Makes no changes.'
    )

    def handle(self, *args, **options):
        from accounts.models import Account

        self.stdout.write('=== Soft-Deleted Accounts With Non-Zero Balance (read-only) ===\n')

        affected = list(
            Account.all_objects
            .filter(is_deleted=True)
            .exclude(balance=Decimal('0.00'))
            .order_by('code')
        )

        self.stdout.write(f'Found {len(affected)} soft-deleted account(s) with a non-zero balance.\n')

        if not affected:
            self.stdout.write(self.style.SUCCESS(
                'None found. The -84,000 trial balance gap is not explained '
                'by soft-deleted GL accounts — the cause is elsewhere '
                '(e.g. an unposted/void transaction, a parent/child '
                'account_type mismatch, or a report bug unrelated to deletion).'
            ))
            return

        total_debit_normal_leftover = Decimal('0.00')
        total_credit_normal_leftover = Decimal('0.00')
        DEBIT_NORMAL_TYPES = {'ASSET', 'EXPENSE', 'LOAN'}

        for acct in affected:
            is_debit_normal = acct.account_type in DEBIT_NORMAL_TYPES
            bal = acct.balance

            # Trial-balance impact of hiding this account:
            #   debit-normal + positive balance  -> lost debit
            #   debit-normal + negative balance  -> lost credit
            #   credit-normal + positive balance -> lost credit
            #   credit-normal + negative balance -> lost debit
            if is_debit_normal:
                if bal > 0:
                    total_debit_normal_leftover += bal
                else:
                    total_credit_normal_leftover += -bal
            else:
                if bal > 0:
                    total_credit_normal_leftover += bal
                else:
                    total_debit_normal_leftover += -bal

            # Try to identify what this account is linked to, for context.
            linked_to = 'unknown/unlinked'
            try:
                sa = acct.savings_account_detail
                linked_to = f'SavingsAccount #{sa.pk} ({getattr(sa.client, "full_name", sa.client_id)}, status={sa.status})'
            except Exception:
                pass
            try:
                la = acct.loan_account_detail
                linked_to = f'LoanAccount #{la.pk} ({getattr(la.client, "full_name", la.client_id)}, status={la.status})'
            except Exception:
                pass

            self.stdout.write(
                f'  {acct.code} | {acct.name} | type={acct.account_type} | level={acct.account_level}\n'
                f'    balance    : {bal}\n'
                f'    parent     : {acct.parent.code if acct.parent_id else "-"}\n'
                f'    linked to  : {linked_to}\n'
                f'    updated_at : {acct.updated_at}\n'
            )

        net_missing_debit = total_debit_normal_leftover - total_credit_normal_leftover
        self.stdout.write(self.style.WARNING(
            f'\nLost debit-side total  : {total_debit_normal_leftover}\n'
            f'Lost credit-side total : {total_credit_normal_leftover}\n'
            f'Net missing debits     : {net_missing_debit}\n'
            f'(If your trial balance shows total_credits - total_debits = 84000.00, '
            f'you are looking for net_missing_debit close to 84000.00 above.)'
        ))
