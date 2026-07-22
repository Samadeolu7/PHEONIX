"""
banks/management/commands/unmatch_transaction_by_id.py
========================================================
Thin CLI wrapper around the existing, audited ReconciliationBankTransaction
.unmatch() (banks/models.py) for exactly one bank transaction — the same
action available from the Payment Trace UI's "Unmatch" button, for cases
where you've identified (e.g. via find_occupied_match_conflicts) which
specific wrongly-matched line needs to be freed so its ERP payment becomes
a normal link candidate for the correct line, and you'd rather script it
than click through the UI one at a time.

Does everything unmatch() does: sets matched=False (matched_erp_payment_id
preserved as history), reopens the bank_only exception for this line, and
reopens the erp_only exception for the ERP payment it was matched to (both
created fresh if they don't already exist) — never touches the underlying
GL Transaction/TransactionEntry.

Usage:
    python manage.py unmatch_transaction_by_id --tx-id <uuid> --user-id <id> --reason "..."
"""
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Unmatches a single ReconciliationBankTransaction by id — same action as the UI's Unmatch button."

    def add_arguments(self, parser):
        parser.add_argument('--tx-id', type=str, required=True, help='ReconciliationBankTransaction id (UUID).')
        parser.add_argument('--user-id', type=int, required=True, help='User to attribute the unmatch action to.')
        parser.add_argument('--reason', type=str, required=True, help='Reason (min 10 characters).')

    def handle(self, *args, **options):
        from django.contrib.auth import get_user_model

        from banks.models import ReconciliationBankTransaction

        User = get_user_model()
        try:
            acting_user = User.objects.get(pk=options['user_id'])
        except User.DoesNotExist:
            raise CommandError(f"No user with id={options['user_id']}")

        try:
            tx = ReconciliationBankTransaction.objects.get(pk=options['tx_id'])
        except ReconciliationBankTransaction.DoesNotExist:
            raise CommandError(f"No ReconciliationBankTransaction with id={options['tx_id']}")

        try:
            tx.unmatch(acting_user, options['reason'])
        except ValidationError as exc:
            raise CommandError(str(exc))

        self.stdout.write(self.style.SUCCESS(
            f'Unmatched tx={tx.id} ({tx.bank_account} {tx.direction} ₦{tx.amount} on {tx.value_date}) — '
            f'was matched to ERP payment {tx.matched_erp_payment_id}, now free.'
        ))
