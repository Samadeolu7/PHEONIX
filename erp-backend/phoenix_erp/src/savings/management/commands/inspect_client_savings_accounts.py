"""
Management command: inspect_client_savings_accounts

Read-only. Given ONE SavingsAccount's account_number, finds its client and
lists EVERY SavingsAccount (including soft-deleted ones, via all_objects)
belonging to that same client — to check whether a soft-deleted/retired
account has a live sibling that should have Smart Savings enrolled instead
(the pattern found 2026-08-27: a legacy-numbered account ('2140-XXXXX')
retired during a migration, with the client's real current balance sitting
under a newer-scheme account_number like 'SAV-DC####-REG' that may never
have been checked for Smart Savings eligibility).

Usage:
    python manage.py inspect_client_savings_accounts SAV-DC0200-REG
"""
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Read-only: list every SavingsAccount (incl. soft-deleted) belonging to one account's client."

    def add_arguments(self, parser):
        parser.add_argument('account_number', type=str)

    def handle(self, *args, **options):
        from savings.models import SavingsAccount
        from accounts.models import Account

        account_number = options['account_number']
        try:
            # NOTE: deliberately not using select_related('account') here —
            # Account.objects (the FILTERED, is_deleted=False manager) is
            # declared first on the model, so Django treats it as
            # _base_manager, which FK object-traversal (obj.account) and
            # any property built on it (SavingsAccount.current_balance)
            # uses by default — meaning both would raise Account.DoesNotExist
            # on exactly the soft-deleted rows this command needs to inspect.
            # Account.all_objects.get(pk=...) is used explicitly below instead.
            seed = SavingsAccount.all_objects.select_related('client').get(
                account_number=account_number
            )
        except SavingsAccount.DoesNotExist:
            raise CommandError(f"No SavingsAccount found (even via all_objects) with account_number='{account_number}'")

        client = seed.client
        self.stdout.write(self.style.MIGRATE_HEADING(f'Client: {client.full_name} (pk={client.pk})'))
        self.stdout.write(f'  is_deleted (Client itself) = {client.is_deleted}')

        self.stdout.write('')
        self.stdout.write(self.style.MIGRATE_HEADING('Every SavingsAccount for this client (incl. soft-deleted)'))
        accounts = SavingsAccount.all_objects.filter(client=client).order_by('opened_on')
        for acct in accounts:
            smart = getattr(acct, 'smart_account', None)
            smart_str = (
                f'smart_active={smart.is_active} start={smart.start_date}' if smart is not None
                else 'NO Smart Savings enrollment'
            )
            marker = '  <== queried account' if acct.pk == seed.pk else ''

            gl_code = '—'
            balance = None
            if acct.account_id:
                try:
                    gl_acct = Account.all_objects.get(pk=acct.account_id)
                    gl_code = gl_acct.code
                    balance = gl_acct.balance
                except Account.DoesNotExist:
                    gl_code = f'MISSING(pk={acct.account_id})'

            balance_str = f'{balance:>14,.2f}' if balance is not None else f'{"?":>14}'
            self.stdout.write(
                f'  {acct.account_number:22} is_deleted={str(acct.is_deleted):5}  status={acct.status:8}  '
                f'opened_on={acct.opened_on}  balance={balance_str}  '
                f'gl_code={gl_code:16}  {smart_str}{marker}'
            )
