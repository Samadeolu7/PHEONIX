"""
cash_management/management/commands/audit_petty_cash_setup_gap.py
===================================================================
Finds PettyCashFund rows whose initial float was never posted to the GL.

Background
----------
PettyCashFundViewSet.setup() (cash_management/views.py) creates the fund's
opening journal entry — Dr. Petty Cash, Cr. Source Account — inside a single
db_transaction.atomic() block, then only sets `setup_journal_entry` and bumps
`current_balance` to `float_amount` AFTER both TransactionEntry rows commit.

Until the 2026-08-26 fix (commit c1a6b45), every real call to setup() raised
TypeError (TransactionEntry.objects.create() was passed a `description=`
kwarg the model has never had), which rolled back the whole atomic block —
including the Transaction (journal entry) itself. The view has no try/except
around this, so the TypeError propagated as a 500 to whoever clicked "Setup
Fund"; `setup_journal_entry` was NEVER a possible outcome of these calls.

This means:
  - Any fund still showing `setup_journal_entry IS NULL` was either never
    attempted, or was attempted and hit the bug (visibly, as a failed API
    call) and nobody has successfully retried since the fix.
  - `current_balance` for such a fund is whatever it was left at — likely
    0.00 if setup never succeeded, though vouchers/replenishments against
    an unset fund would make this drift from 0 without ever reflecting the
    float_amount that should have been booked.

This command does NOT fix anything or retry setup — it only surfaces the
affected funds so finance can decide whether to re-run setup() (now fixed)
or book a manual correcting journal entry for funds already in active use
without ever having had their opening entry posted.

Usage
-----
    python manage.py audit_petty_cash_setup_gap
"""
from __future__ import annotations

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = (
        "Lists PettyCashFund rows with no setup_journal_entry — funds whose "
        "opening GL float was never successfully posted."
    )

    def handle(self, *args, **options):
        from cash_management.models import PettyCashFund

        funds = (
            PettyCashFund.objects
            .filter(setup_journal_entry__isnull=True)
            .exclude(status='closed')
            .select_related('petty_cash_account', 'custodian', 'branch')
            .order_by('established_date', 'fund_code')
        )

        if not funds:
            self.stdout.write(self.style.SUCCESS(
                'No petty cash funds are missing their setup journal entry.'
            ))
            return

        self.stdout.write(self.style.WARNING(
            f'{funds.count()} petty cash fund(s) have no setup_journal_entry '
            f'(opening float never posted to GL):\n'
        ))

        for fund in funds:
            voucher_count = fund.vouchers.count() if hasattr(fund, 'vouchers') else None
            self.stdout.write(
                f'  {fund.fund_code}  {fund.fund_name}  [{fund.status}]  '
                f'branch={fund.branch}\n'
                f'    Established: {fund.established_date}  '
                f'Float: N{fund.float_amount}  Current balance on record: N{fund.current_balance}\n'
                f'    GL account: {fund.petty_cash_account.code} - {fund.petty_cash_account.name}\n'
                f'    Custodian: {fund.custodian}'
                + (f'  Vouchers recorded against this fund: {voucher_count}' if voucher_count is not None else '')
                + '\n'
            )
