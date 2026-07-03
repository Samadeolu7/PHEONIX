"""
Read-only diagnostic for "why can't user X approve this transfer" reports.

Usage:
    python manage.py diagnose_bank_transfer <transfer_number> [--user <email>]
"""
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model

User = get_user_model()


class Command(BaseCommand):
    help = 'Diagnose why a specific user cannot approve a specific bank transfer'

    def add_arguments(self, parser):
        parser.add_argument('transfer_number', help='BankTransfer.transfer_number, e.g. BTRF-2026-0001')
        parser.add_argument('--user', dest='user_email', help='Email of the user who expects to approve it')

    def handle(self, *args, **options):
        from banks.models import BankTransfer

        transfer_number = options['transfer_number']
        user_email = options.get('user_email')

        try:
            transfer = BankTransfer.objects.get(transfer_number=transfer_number)
        except BankTransfer.DoesNotExist:
            self.stderr.write(f'No BankTransfer found with transfer_number={transfer_number!r}')
            return

        self.stdout.write(f'\n=== Transfer {transfer.transfer_number} (pk={transfer.pk}) ===')
        self.stdout.write(f'  status            : {transfer.status}')
        self.stdout.write(f'  source_type       : {transfer.source_type}')
        self.stdout.write(f'  destination_type  : {transfer.destination_type}')
        self.stdout.write(f'  initiated_by      : {transfer.initiated_by} (pk={transfer.initiated_by_id})')

        if transfer.destination_type == 'cashier':
            dca = transfer.destination_cashier_account
            if dca is None:
                self.stdout.write('  destination_cashier_account : NULL — this is why approval fails; '
                                   'no cashier can ever match a null account. Check how this transfer was created.')
            else:
                self.stdout.write(f'  destination_cashier_account : {dca.name} ({dca.account_number}), pk={dca.pk}, branch={dca.branch}')
                if dca.cashier is None:
                    self.stdout.write('  destination_cashier_account.cashier : NULL — this CashierAccount has '
                                       'no linked user at all, so NOBODY can approve this transfer as '
                                       '"the destination cashier". Fix via the Cashier Accounts admin page: '
                                       'assign a cashier (user) to this account.')
                else:
                    self.stdout.write(f'  destination_cashier_account.cashier : {dca.cashier.email} '
                                       f'(pk={dca.cashier_id}, name={dca.cashier.get_full_name()})')
        else:
            dba = transfer.destination_bank_account
            self.stdout.write(f'  destination_bank_account : {dba} (pk={dba.pk if dba else None})')
            if dba and dba.account_manager:
                self.stdout.write(f'  destination_bank_account.account_manager : {dba.account_manager.email}')
            elif dba:
                self.stdout.write('  destination_bank_account.account_manager : NULL — nobody can approve as '
                                   'account manager.')

        if user_email:
            try:
                user = User.objects.get(email=user_email)
            except User.DoesNotExist:
                self.stderr.write(f'\nNo user found with email={user_email!r}')
                return

            self.stdout.write(f'\n=== User: {user.email} (pk={user.pk}) ===')
            their_cashier_accounts = list(
                user.cashier_accounts.values_list('pk', 'name', 'account_number', 'branch_id')
            ) if hasattr(user, 'cashier_accounts') else []
            self.stdout.write(f'  CashierAccount(s) owned by this user: {their_cashier_accounts or "NONE"}')

            if transfer.destination_type == 'cashier' and transfer.destination_cashier_account:
                match = transfer.destination_cashier_account.cashier_id == user.pk
                self.stdout.write(f'\n  Would this user pass the approve() check? {match}')
                if not match:
                    self.stdout.write(
                        '  MISMATCH CONFIRMED: the transfer\'s destination_cashier_account.cashier is a '
                        'different user (or null) than the one you expect to approve it. Either:\n'
                        '    (a) the wrong CashierAccount was selected as the destination when the transfer '
                        'was created (re-check the sender picked the account actually linked to this user), or\n'
                        '    (b) this user\'s CashierAccount was created/assigned without linking the '
                        '"cashier" (user) field — fix it on the Cashier Accounts page.'
                    )

        self.stdout.write('')
