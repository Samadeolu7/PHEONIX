"""
One-off: move a bank account to a different (internal) branch.

BankAccount.branch is not something you can just flip. Its GL account
(BankAccount.gl_account) belongs to that branch's own chart of accounts
(accounts.Account is scoped by (tenant, branch) — see the
unique_code_per_tenant_branch_when_not_deleted constraint), so re-pointing
BankAccount.branch alone would leave the ledger balance stuck in the old
branch's books while the account "appears" to live in the new one.

Instead this follows the same pattern already used for moving value between
branches (interbranch app): create a fresh BankAccount in the destination
branch (its GL account is auto-provisioned correctly-scoped on save — see
BankAccount._auto_create_gl_account), move the outstanding balance across
via interbranch.services.create_interbranch_transfer (a real, balanced,
auditable JV pair through the Due-from/Due-to clearing accounts), then
retire the old BankAccount rather than deleting it so its transaction/
reconciliation history stays intact and correctly attributed.

Because BankAccount.account_number is globally unique, moving the *same*
real-world account number means the old row's number has to be freed up
first (renamed with a "-MOVED-<date>" suffix) before the new row can take it.

Usage
-----
    python manage.py move_bank_account_branch \\
        --account-number 2048508315 \\
        --to-branch IBF3 \\
        --user admin@example.com \\
        --dry-run

    python manage.py move_bank_account_branch \\
        --account-number 2048508315 \\
        --to-branch IBF3 \\
        --user admin@example.com \\
        --apply
"""
from __future__ import annotations

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction as db_transaction
from django.utils import timezone


class Command(BaseCommand):
    help = (
        'Moves a bank account to a different branch by opening a new BankAccount '
        'in the destination branch, moving the GL balance across via an '
        'inter-branch transfer, and retiring the old one.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--account-number', required=True, help='Real bank account number (BankAccount.account_number) to move.')
        parser.add_argument('--from-branch', help='Expected current branch (id or code), checked as a safety guard.')
        parser.add_argument('--to-branch', required=True, help='Destination branch (id or code).')
        parser.add_argument('--user', required=True, help='Email of the acting user (owner/created_by on new records and the transfer).')
        parser.add_argument('--apply', action='store_true', help='Apply the change (default is dry-run).')

    @staticmethod
    def _resolve_branch(Branch, value, label):
        """Accept either a Branch pk (numeric) or a Branch.code (text)."""
        lookup = {'pk': int(value)} if str(value).isdigit() else {'code': value}
        try:
            return Branch.objects.get(is_deleted=False, **lookup)
        except Branch.DoesNotExist:
            raise CommandError(f'No active Branch matching {label}={value!r} (tried {list(lookup)[0]}).')

    def handle(self, *args, **options):
        from banks.models import Bank, BankAccount
        from branches.models import Branch
        from interbranch.services import create_interbranch_transfer

        account_number = options['account_number']
        from_branch_code = options.get('from_branch')
        to_branch_code = options['to_branch']
        apply_changes = options['apply']

        User = get_user_model()

        try:
            old = BankAccount.all_objects.select_related('bank', 'branch', 'gl_account').get(
                account_number=account_number, is_deleted=False,
            )
        except BankAccount.DoesNotExist:
            raise CommandError(f'No active BankAccount with account_number={account_number!r}.')

        if old.branch is None:
            raise CommandError(f'BankAccount {account_number} has no branch set — nothing to move from.')

        if from_branch_code:
            expected_branch = self._resolve_branch(Branch, from_branch_code, '--from-branch')
            if old.branch.pk != expected_branch.pk:
                raise CommandError(
                    f'--from-branch={from_branch_code} (branch id={expected_branch.pk}, '
                    f'code={expected_branch.code}) does not match the account\'s actual '
                    f'branch (id={old.branch.pk}, code={old.branch.code}). Aborting.'
                )

        target_branch = self._resolve_branch(Branch, to_branch_code, '--to-branch')

        if target_branch.pk == old.branch.pk:
            raise CommandError('--to-branch is the same branch the account is already in.')

        try:
            user = User.objects.get(email=options['user'])
        except User.DoesNotExist:
            raise CommandError(f'No user with email={options["user"]!r}.')

        old.gl_account.refresh_from_db()
        balance = old.gl_account.balance

        self.stdout.write(
            f'Bank account {old.bank.bank_name} {old.account_number} '
            f'({old.account_name})\n'
            f'  Currently:  branch={old.branch.code} ({old.branch.name})  '
            f'GL={old.gl_account.code}  balance={balance}\n'
            f'  Moving to:  branch={target_branch.code} ({target_branch.name})\n'
        )

        # --- Hazards that this script deliberately does NOT auto-resolve ---
        warnings = []

        main_bank_for = list(Branch.objects.filter(main_bank_account=old))
        if main_bank_for:
            names = ', '.join(f'{b.code} ({b.name})' for b in main_bank_for)
            warnings.append(
                f'This account is the main_bank_account (EOD cash-sweep target) for: {names}. '
                f'After this move, that branch has no EOD sweep target until you manually '
                f'set a new Branch.main_bank_account for it.'
            )

        if old.feed_connected:
            warnings.append(
                'feed_connected=True — this account has a live bank-feed consent. '
                'The feed is tied to this BankAccount row by id; it will keep posting '
                'against the old (now retired) account after this move. The live feed '
                'consent must be manually re-linked to the new account through the '
                'bank-feed service — this script cannot do that.'
            )

        for w in warnings:
            self.stdout.write(self.style.WARNING(f'  WARNING: {w}\n'))

        if not apply_changes:
            self.stdout.write(self.style.WARNING('Dry-run only — re-run with --apply to execute.'))
            return

        if warnings:
            self.stdout.write(self.style.WARNING(
                'Proceeding despite the warning(s) above — resolve them manually afterwards.\n'
            ))

        today = timezone.localdate()

        with db_transaction.atomic():
            target_bank, _ = Bank.objects.get_or_create(
                bank_name=old.bank.bank_name,
                branch_name=old.bank.branch_name,
                branch=target_branch,
                defaults=dict(
                    tenant=target_branch.tenant,
                    owner=user,
                    created_by=user,
                    bank_code=old.bank.bank_code,
                    address=old.bank.address,
                    phone=old.bank.phone,
                    email=old.bank.email,
                    account_manager_name=old.bank.account_manager_name,
                    account_manager_phone=old.bank.account_manager_phone,
                    account_manager_email=old.bank.account_manager_email,
                ),
            )

            source_branch = old.branch
            moved_note = (
                f'Moved to branch {target_branch.code} on {today} '
                f'(new account id follows in this same operation).'
            )
            old.account_number = f'{old.account_number}-MOVED-{today.strftime("%Y%m%d")}'
            old.is_active = False
            old.is_primary_for_invoices = False
            old.notes = f'{old.notes}\n{moved_note}'.strip()
            old.save(update_fields=['account_number', 'is_active', 'is_primary_for_invoices', 'notes', 'updated_at'])

            new = BankAccount(
                tenant=target_branch.tenant,
                owner=user,
                created_by=user,
                branch=target_branch,
                bank=target_bank,
                account_number=account_number,
                account_name=old.account_name,
                account_type=old.account_type,
                currency=old.currency,
                account_manager=old.account_manager,
                daily_withdrawal_limit=old.daily_withdrawal_limit,
                monthly_transaction_limit=old.monthly_transaction_limit,
                requires_dual_approval=old.requires_dual_approval,
                dual_approval_threshold=old.dual_approval_threshold,
                is_active=True,
                is_cashier_collection_account=old.is_cashier_collection_account,
                iban=old.iban,
                swift_code=old.swift_code,
                date_opened=old.date_opened,
                notes=f'Continues {old.bank.bank_name} {account_number}, '
                      f'moved from branch {source_branch.code} on {today}.',
            )
            new.save()  # auto-provisions gl_account scoped to target_branch

            transfer = None
            if balance != Decimal('0.00'):
                transfer = create_interbranch_transfer(
                    from_branch=source_branch,
                    to_branch=target_branch,
                    from_account=old.gl_account,
                    to_account=new.gl_account,
                    amount=balance,
                    description=(
                        f'Branch migration: {old.bank.bank_name} {account_number} '
                        f'moved from {source_branch.code} to {target_branch.code}'
                    ),
                    date=today,
                    user=user,
                )

        self.stdout.write(self.style.SUCCESS(
            f'\nDone. New BankAccount pk={new.pk}, GL={new.gl_account.code}, '
            f'branch={target_branch.code}.\n'
            f'Old BankAccount pk={old.pk} retired (account_number={old.account_number}, is_active=False).'
        ))
        if transfer:
            self.stdout.write(self.style.SUCCESS(
                f'Balance moved via {transfer.transfer_number}: {balance} '
                f'({source_branch.code} -> {target_branch.code}).'
            ))
        else:
            self.stdout.write('Balance was 0.00 — no transfer needed.')
        if warnings:
            self.stdout.write(self.style.WARNING(
                f'\n{len(warnings)} warning(s) above still need manual follow-up.'
            ))
