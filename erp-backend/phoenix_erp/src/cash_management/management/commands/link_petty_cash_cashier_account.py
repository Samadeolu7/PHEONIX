"""
cash_management/management/commands/link_petty_cash_cashier_account.py
========================================================================
Creates a CashierAccount that points at the same GL account an existing
PettyCashFund already uses, with the fund's custodian as the cashier.

Why: PettyCashFund/PettyCashVoucher already handle petty cash spend
(approve -> disburse -> retire, with receipts and variance tracking) and
that workflow is not being replaced. But because petty cash isn't a
CashierAccount, it can't be funded through an ordinary BankTransfer, isn't
covered by daily CashReconciliation, and doesn't show up in the cashier
summary dashboard alongside other tills. Wrapping the fund's existing GL
account in a CashierAccount gets all of that for free - no changes needed
in BankTransfer, CashReconciliation, or SummaryViewSet.cashiers, since none
of them are petty-cash-specific.

This command deliberately does NOT create the PettyCashFund itself - use
the existing self-service provisioning path (PettyCashFundViewSet.get_default_fund,
`GET/POST /api/cash-management/petty-cash-funds/default/`) or the admin to
set one up first.

Idempotent: skips branches that already have a CashierAccount linked to
their fund's GL account; restores a soft-deleted one if found (same pattern
as banks/management/commands/backfill_cashier_accounts.py).

Usage
-----
    python manage.py link_petty_cash_cashier_account --branch 2 --dry-run
    python manage.py link_petty_cash_cashier_account --branch 2
"""
from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction as db_transaction


class Command(BaseCommand):
    help = (
        "Creates a CashierAccount pointing at an existing PettyCashFund's GL "
        "account (with the fund's custodian as cashier), so petty cash can be "
        "funded via BankTransfer, reconciled, and shown in the cashier summary."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--branch', dest='branch_id', type=int, required=True,
            help='Branch id whose active PettyCashFund should be linked.',
        )
        parser.add_argument(
            '--dry-run', action='store_true',
            help='Preview what would be created without making any changes.',
        )

    def handle(self, *args, **options):
        from branches.models import Branch
        from cash_management.models import CashierAccount, PettyCashFund

        dry_run = options['dry_run']
        branch_id = options['branch_id']

        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN — no changes will be saved.\n'))

        try:
            branch = Branch.objects.get(pk=branch_id)
        except Branch.DoesNotExist:
            raise CommandError(f'No Branch with id={branch_id}')

        fund = PettyCashFund.objects.filter(branch=branch, status='active').first()
        if fund is None:
            raise CommandError(
                f'No active PettyCashFund found for branch {branch_id} '
                f'({branch.name}). Provision one first via '
                f'GET/POST /api/cash-management/petty-cash-funds/default/ or the admin.'
            )

        if fund.petty_cash_account_id is None:
            raise CommandError(
                f'PettyCashFund {fund.fund_code!r} has no linked GL account '
                f'(petty_cash_account is null).'
            )

        gl_account = fund.petty_cash_account

        existing = CashierAccount.objects.filter(account=gl_account)
        active_existing = existing.filter(is_deleted=False).first()
        if active_existing:
            self.stdout.write(self.style.SUCCESS(
                f'CashierAccount {active_existing.account_number!r} already links '
                f'GL account {gl_account.code} to fund {fund.fund_code!r}. Nothing to do.'
            ))
            return

        self.stdout.write(
            f'Fund: {fund.fund_code} - {fund.fund_name} '
            f'(GL {gl_account.code}, GL balance={gl_account.balance}, '
            f'fund current_balance={fund.current_balance})\n'
            f'Custodian: {fund.custodian.get_full_name() or fund.custodian.username}\n'
        )

        dead = existing.filter(is_deleted=True).first()
        if dead:
            self.stdout.write(
                f'{"Would restore" if dry_run else "Restoring"} soft-deleted '
                f'CashierAccount {dead.account_number!r} for this GL account.'
            )
            if not dry_run:
                with db_transaction.atomic():
                    dead.is_deleted = False
                    dead.is_active = True
                    dead.cashier = fund.custodian
                    dead.save(update_fields=['is_deleted', 'is_active', 'cashier'])
                    gl_account.refresh_from_db(fields=['balance'])
                    CashierAccount.objects.filter(pk=dead.pk).update(
                        current_balance=gl_account.balance
                    )
                self.stdout.write(self.style.SUCCESS(
                    f'Restored CashierAccount {dead.account_number!r}.'
                ))
            return

        account_number = f'PETTY-{fund.fund_code}'
        name = f'{fund.fund_name} - Cashier Till'

        self.stdout.write(
            f'{"Would create" if dry_run else "Creating"} CashierAccount '
            f'{account_number!r} ({name!r}), cashier='
            f'{fund.custodian.get_full_name() or fund.custodian.username}.'
        )

        if dry_run:
            self.stdout.write(self.style.WARNING(
                'Dry run complete — no changes made. Re-run without --dry-run to apply.'
            ))
            return

        with db_transaction.atomic():
            cashier_account = CashierAccount.objects.create(
                cashier=fund.custodian,
                account=gl_account,
                account_number=account_number,
                name=name,
                branch=branch,
                owner=fund.owner,
                is_active=True,
                requires_dual_approval=False,
            )
            gl_account.refresh_from_db(fields=['balance'])
            CashierAccount.objects.filter(pk=cashier_account.pk).update(
                current_balance=gl_account.balance
            )
            cashier_account.refresh_from_db(fields=['current_balance'])

        self.stdout.write(self.style.SUCCESS(
            f'\nCreated CashierAccount {cashier_account.account_number!r} '
            f'linked to GL {gl_account.code}, current_balance='
            f'{cashier_account.current_balance}.'
        ))
