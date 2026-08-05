"""
cash_management/management/commands/audit_petty_cash_multi_category_vouchers.py
==================================================================================
Finds petty cash vouchers that *look* like they cover several expense
categories (their `purpose` text lists multiple "N. [Category] description"
segments, the format PettyCashVoucherForm.tsx builds from its multi-line-item
UI) but have no PettyCashVoucherLine rows — meaning the whole voucher amount
was posted to a single GL expense account by the old disburse() logic
instead of being split per category.

Background
----------
Before PettyCashVoucherLine existed, the multi-line-item form collapsed all
its rows into one voucher: every line's amount was summed into `amount`, but
only the *first* line's category was kept as `expense_category`. disburse()
then debited that single account for the full total, so e.g. a voucher
covering Transportation + Water + Fuel for Generator posted its entire
amount to Transportation only.

This command does NOT fix anything — the per-line ₦ amounts for these
historical vouchers were never persisted (only category labels + free-text
descriptions survive in `purpose`), so there is no reliable amount to split
by. It only surfaces the affected vouchers so finance can decide whether to
book manual correcting journal entries for material ones.

Usage
-----
    python manage.py audit_petty_cash_multi_category_vouchers
    python manage.py audit_petty_cash_multi_category_vouchers --fund PC-001
"""
from __future__ import annotations

import re

from django.core.management.base import BaseCommand

LINE_ITEM_RE = re.compile(r'^\s*\d+\.\s*\[([^\]]+)\]', re.MULTILINE)


class Command(BaseCommand):
    help = (
        "Lists petty cash vouchers whose purpose text lists multiple expense "
        "categories but have no per-line GL split (i.e. their full amount "
        "was posted to a single expense account)."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--fund', dest='fund_code', default=None,
            help='Restrict to a single fund by fund_code (e.g. PC-001).',
        )

    def handle(self, *args, **options):
        from cash_management.models import PettyCashVoucher

        vouchers = (
            PettyCashVoucher.objects
            .filter(lines__isnull=True)
            .exclude(status__in=['draft', 'cancelled'])
            .select_related('expense_category', 'expense_category__expense_account', 'fund')
            .order_by('voucher_date', 'voucher_number')
        )
        if options['fund_code']:
            vouchers = vouchers.filter(fund__fund_code=options['fund_code'])

        affected = []
        for voucher in vouchers:
            categories = LINE_ITEM_RE.findall(voucher.purpose or '')
            unique_categories = list(dict.fromkeys(categories))  # dedupe, keep order
            if len(unique_categories) > 1:
                affected.append((voucher, unique_categories))

        if not affected:
            self.stdout.write(self.style.SUCCESS('No misposted multi-category vouchers found.'))
            return

        self.stdout.write(self.style.WARNING(
            f'{len(affected)} voucher(s) list multiple expense categories in their '
            f'purpose text but were posted entirely to a single GL account:\n'
        ))

        for voucher, categories in affected:
            posted_account = (
                voucher.expense_category.expense_account
                if voucher.expense_category and voucher.expense_category.expense_account
                else None
            )
            posted_desc = (
                f'{posted_account.code} - {posted_account.name}'
                if posted_account else '(no expense account on record)'
            )
            self.stdout.write(
                f'  {voucher.voucher_number}  {voucher.voucher_date}  '
                f'N{voucher.amount}  [{voucher.status}]\n'
                f'    Entire amount posted to: {posted_desc}\n'
                f'    Categories listed in purpose: {", ".join(categories)}\n'
            )
