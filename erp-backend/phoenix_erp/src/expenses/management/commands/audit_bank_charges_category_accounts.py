"""
expenses/management/commands/audit_bank_charges_category_accounts.py
========================================================================
Read-only check for the specific corruption found 2026-09: an ExpenseCategory
named "Bank Charges" (the get_or_create_bank_charges_category default,
banks/reconciliation_utils.py) whose `expense_account` is NOT actually a
bank-charges account — e.g. HO/Orimerunmu's "Bank Charges" category is wired
to "Payroll Related Expenses (2026)" (5302).

Likely mechanism: accounts.utils.account_creation.get_or_create_child_account
looks up an existing account by (branch, tenant, code) ONLY — never by name —
before returning it as "the" account for a logical key. If some other
account already occupied the branch's computed code before
get_or_create_bank_charges_category's get_system_account('bank_charges', ...)
call ran, it silently adopted that unrelated account. Whether that's what
happened here or the category was simply mislinked by hand, the fix needs a
human to confirm the branch's real "Bank Charges" account (existing,
unlinked, or needing to be created) — this command only surfaces the
exposure, it does not touch anything.

This complements cash_management's existing
audit_expense_category_account_overlap (categories sharing one account,
any purpose) with two things that command doesn't check: whether the
category's OWN name disagrees with its account's name, and how much real
money (is_posted=True) has already gone through a mismatched one.

Usage:
    python manage.py audit_bank_charges_category_accounts
"""
from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db.models import Count, Q, Sum


class Command(BaseCommand):
    help = (
        "Finds 'Bank Charges' ExpenseCategory rows whose expense_account "
        "doesn't look like a bank-charges account, and reports how much "
        "has already posted through them."
    )

    def handle(self, *args, **options):
        from expenses.models import Expense, ExpenseCategory

        suspects = (
            ExpenseCategory.objects
            .filter(name__iexact='Bank Charges')
            .select_related('expense_account', 'branch')
        )

        bad = [
            cat for cat in suspects
            if 'bank charg' not in (cat.expense_account.name or '').strip().lower()
        ]

        if not bad:
            self.stdout.write(self.style.SUCCESS(
                'Every "Bank Charges" category resolves to an account that looks correct.'
            ))
            return

        self.stdout.write(self.style.ERROR(
            f'{len(bad)} "Bank Charges" categor(y/ies) linked to a suspicious account:\n'
        ))
        for cat in bad:
            self.stdout.write(
                f'  branch={cat.branch}  category id={cat.id} code={cat.code}  '
                f'-> account "{cat.expense_account.name}" ({cat.expense_account.code})'
            )
            stats = Expense.objects.filter(category=cat).aggregate(
                total=Count('id'),
                posted=Count('id', filter=Q(is_posted=True)),
                posted_amount=Sum('total_amount', filter=Q(is_posted=True)),
            )
            self.stdout.write(
                f'    {stats["total"]} expense(s) use this category, '
                f'{stats["posted"]} already POSTED to the GL '
                f'(₦{stats["posted_amount"] or 0} already booked to "{cat.expense_account.name}")'
            )
            if stats['posted']:
                self.stdout.write(self.style.ERROR(
                    '    ^ real money already posted to the wrong GL account — this needs a '
                    'correcting journal entry, not a category reassignment (that only affects '
                    'future/unposted expenses).'
                ))
