from django.core.management.base import BaseCommand
from django.core.exceptions import ObjectDoesNotExist

from transactions.models import Transaction


class Command(BaseCommand):
    help = "Dump transaction entries and current account balances for a transaction reference"

    def add_arguments(self, parser):
        parser.add_argument('--ref', required=True, help='Transaction reference number (e.g. INV-20260130-0001)')

    def handle(self, *args, **options):
        ref = options.get('ref')
        try:
            tx = Transaction.objects.select_related('series').prefetch_related('entries__account').get(reference_number=ref)
        except ObjectDoesNotExist:
            self.stderr.write(f"Transaction not found: {ref}")
            return

        self.stdout.write(f"Transaction: {tx.reference_number} - {tx.description} (approved={tx.approved})")
        self.stdout.write("Entries:")
        for e in tx.entries.select_related('account').all():
            acct = getattr(e, 'account', None)
            acct_id = acct.id if acct else e.account_id
            acct_code = acct.code if acct else 'N/A'
            acct_balance = acct.balance if acct else 'N/A'
            self.stdout.write(
                f"  Entry id={e.id} account_id={acct_id} account_code={acct_code} side={e.side} amount={e.amount} posted={e.posted} account_balance={acct_balance}"
            )

        # Also print a quick aggregate of the accounts involved
        acc_set = {e.account_id for e in tx.entries.all()}
        self.stdout.write("\nAccounts snapshot:")
        from accounts.models import Account
        for aid in acc_set:
            try:
                a = Account.objects.get(pk=aid)
                self.stdout.write(f"  Account id={a.id} code={a.code} balance={a.balance} owner_id={getattr(a,'owner_id',None)} branch_id={getattr(a,'branch_id',None)}")
            except Account.DoesNotExist:
                self.stdout.write(f"  Account id={aid} not found via default manager")
