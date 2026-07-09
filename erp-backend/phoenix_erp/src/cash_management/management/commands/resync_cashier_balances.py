"""
cash_management/management/commands/resync_cashier_balances.py
================================================================
One-time resync of every CashierAccount.current_balance and
PettyCashFund.current_balance against their linked GL Account.balance.

Why: cash_management/signals.py now keeps both caches in sync going
forward, but only reacts to new TransactionEntry postings — it does
nothing for rows that already drifted from their GL balance before the
signal existed (e.g. a CashierAccount.current_balance found sitting at a
large negative figure while its GL account balance was fine). This command
applies the same resync the signal does, once, to every existing row, and
reports which ones were actually wrong.

Usage
-----
    python manage.py resync_cashier_balances --dry-run
    python manage.py resync_cashier_balances
    python manage.py resync_cashier_balances --branch 2
"""
from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction as db_transaction


class Command(BaseCommand):
    help = (
        "Resyncs CashierAccount.current_balance and PettyCashFund.current_balance "
        "from their linked GL Account.balance for every existing row, reporting any "
        "that had drifted."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--branch', dest='branch_id', type=int, default=None,
            help='Restrict to a single branch id (default: all branches).',
        )
        parser.add_argument(
            '--dry-run', action='store_true',
            help='Preview what would change without making any changes.',
        )

    def handle(self, *args, **options):
        from cash_management.models import CashierAccount, PettyCashFund

        dry_run = options['dry_run']
        branch_id = options['branch_id']

        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN — no changes will be saved.\n'))

        cashier_qs = CashierAccount.objects.filter(account__isnull=False)
        fund_qs = PettyCashFund.objects.filter(petty_cash_account__isnull=False)
        if branch_id is not None:
            cashier_qs = cashier_qs.filter(branch_id=branch_id)
            fund_qs = fund_qs.filter(branch_id=branch_id)

        changed = 0

        self.stdout.write('=== CashierAccount ===')
        for ca in cashier_qs.select_related('account'):
            ca.account.refresh_from_db(fields=['balance'])
            gl_balance = ca.account.balance
            if ca.current_balance != gl_balance:
                changed += 1
                self.stdout.write(self.style.WARNING(
                    f'  {ca.account_number} ({ca.name}): current_balance='
                    f'{ca.current_balance} -> {gl_balance} (GL {ca.account.code})'
                ))
                if not dry_run:
                    with db_transaction.atomic():
                        CashierAccount.objects.filter(pk=ca.pk).update(
                            current_balance=gl_balance
                        )

        self.stdout.write('\n=== PettyCashFund ===')
        for fund in fund_qs.select_related('petty_cash_account'):
            fund.petty_cash_account.refresh_from_db(fields=['balance'])
            gl_balance = fund.petty_cash_account.balance
            if fund.current_balance != gl_balance:
                changed += 1
                self.stdout.write(self.style.WARNING(
                    f'  {fund.fund_code} ({fund.fund_name}): current_balance='
                    f'{fund.current_balance} -> {gl_balance} '
                    f'(GL {fund.petty_cash_account.code})'
                ))
                if not dry_run:
                    with db_transaction.atomic():
                        PettyCashFund.objects.filter(pk=fund.pk).update(
                            current_balance=gl_balance
                        )

        if changed == 0:
            self.stdout.write(self.style.SUCCESS('\nNo drift found. All balances match their GL account.'))
        elif dry_run:
            self.stdout.write(self.style.WARNING(
                f'\n{changed} row(s) would be corrected. Re-run without --dry-run to apply.'
            ))
        else:
            self.stdout.write(self.style.SUCCESS(f'\nCorrected {changed} row(s).'))
