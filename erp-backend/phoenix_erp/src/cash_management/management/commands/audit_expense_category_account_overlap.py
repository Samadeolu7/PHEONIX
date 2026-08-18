"""
cash_management/management/commands/audit_expense_category_account_overlap.py
===============================================================================
The per-line GL split added for petty cash vouchers (PettyCashVoucherLine,
see audit_petty_cash_multi_category_vouchers) debits each line's own
`expense_category.expense_account`. If several ExpenseCategory records were
set up pointing at the *same* GL account, lines that look like separate
categories on the voucher will still legitimately collapse into a single
debit line when posted -- because that's what the account mapping says.

This command surfaces that condition: expense categories that share an
`expense_account`, so it's obvious whether a "this voucher only hit one
account" report is a code bug or a category setup issue.

Usage
-----
    python manage.py audit_expense_category_account_overlap
    python manage.py audit_expense_category_account_overlap --voucher PCV-2026-08-0004
"""
from __future__ import annotations

from collections import defaultdict

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = (
        "Lists expense categories that share the same GL expense_account, "
        "and optionally checks one voucher's lines against that mapping."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--voucher', dest='voucher_number', default=None,
            help='Also show the expense_category -> expense_account mapping '
                 'for every line on this voucher number.',
        )

    def handle(self, *args, **options):
        from expenses.models import ExpenseCategory

        by_account = defaultdict(list)
        for cat in ExpenseCategory.objects.select_related('expense_account').all():
            by_account[cat.expense_account_id].append(cat)

        overlaps = {
            acct_id: cats for acct_id, cats in by_account.items() if len(cats) > 1
        }

        if overlaps:
            self.stdout.write(self.style.WARNING(
                f'{len(overlaps)} GL account(s) are shared by more than one expense category:\n'
            ))
            for acct_id, cats in overlaps.items():
                account = cats[0].expense_account
                acct_desc = f'{account.code} - {account.name}' if account else '(no account)'
                names = ', '.join(f'{c.name} (id={c.id})' for c in cats)
                self.stdout.write(f'  {acct_desc}\n    -> {names}\n')
        else:
            self.stdout.write(self.style.SUCCESS('No expense categories share a GL account.\n'))

        voucher_number = options['voucher_number']
        if voucher_number:
            from cash_management.models import PettyCashVoucher

            try:
                voucher = PettyCashVoucher.objects.prefetch_related(
                    'lines__expense_category__expense_account'
                ).get(voucher_number=voucher_number)
            except PettyCashVoucher.DoesNotExist:
                self.stdout.write(self.style.ERROR(f'Voucher {voucher_number} not found.'))
                return

            self.stdout.write(f'\nVoucher status: {voucher.status}')
            self.stdout.write(f'Lines for {voucher_number} (source-of-truth categories):')
            lines = list(voucher.lines.all())
            if not lines:
                self.stdout.write('  (no PettyCashVoucherLine rows -- legacy single-category voucher)')
            for line in lines:
                cat = line.expense_category
                acct = cat.expense_account if cat else None
                acct_desc = f'{acct.code} - {acct.name}' if acct else '(none)'
                self.stdout.write(
                    f'  N{line.amount}  {cat.name if cat else "?"}  -> {acct_desc}'
                )

            if voucher.journal_entry_id:
                self.stdout.write(
                    f'\nActual posted GL entries (Transaction #{voucher.journal_entry_id}):'
                )
                for entry in voucher.journal_entry.entries.select_related('account').order_by('side', 'account__code'):
                    self.stdout.write(
                        f'  {entry.side:6}  {entry.account.code} - {entry.account.name}  N{entry.amount}'
                    )
            else:
                self.stdout.write(
                    '\n(Voucher has not been disbursed yet -- no journal_entry, so nothing has '
                    'actually posted to the GL. Any "same account" observation must be coming '
                    'from somewhere other than the ledger, e.g. a report or the detail page.)'
                )
