"""
Management command: deactivate_orphaned_smart_savings

For a SmartSavingsAccount left cycling on a SavingsAccount that's since
been closed/soft-deleted (found 2026-08-27: apply_smart_savings_interest's
candidate query never checks whether the underlying account is still
alive, so a closed account's SmartSavingsAccount wrapper keeps failing —
and getting silently logged — every single day forever). Sets is_active
False so it stops being picked up, without touching anything else.

Refuses unless the underlying SavingsAccount is actually closed/deleted
(is_deleted=True or status='closed') — this is specifically for orphaned
wrappers on dead accounts, not a general-purpose "turn off Smart Savings"
tool. Use the normal deactivate action in the UI/API for a live account.

Usage:
    python manage.py deactivate_orphaned_smart_savings --account SAV-DC0200-REG              # dry-run
    python manage.py deactivate_orphaned_smart_savings --account SAV-DC0200-REG --apply
"""
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Deactivate a SmartSavingsAccount whose underlying SavingsAccount has been closed/soft-deleted."

    def add_arguments(self, parser):
        parser.add_argument('--account', dest='account_number', required=True)
        parser.add_argument('--apply', action='store_true',
                             help='Actually deactivate. Without this, only previews.')

    def handle(self, *args, **options):
        from savings.models import SavingsAccount

        apply_changes = options['apply']
        account_number = options['account_number']

        try:
            savings = SavingsAccount.all_objects.select_related('client').get(
                account_number=account_number
            )
        except SavingsAccount.DoesNotExist:
            raise CommandError(f"No SavingsAccount found (even via all_objects) with account_number='{account_number}'")

        if not (savings.is_deleted or savings.status == 'closed'):
            raise CommandError(
                f'{account_number} is not closed/deleted (is_deleted={savings.is_deleted}, '
                f"status='{savings.status}') — refusing. This command is only for orphaned "
                'wrappers on dead accounts.'
            )

        smart = getattr(savings, 'smart_account', None)
        if smart is None:
            raise CommandError(f'{account_number} has no SmartSavingsAccount to deactivate.')
        if not smart.is_active:
            self.stdout.write(self.style.SUCCESS(f'{account_number}\'s SmartSavingsAccount is already inactive. Nothing to do.'))
            return

        self.stdout.write(self.style.MIGRATE_HEADING(
            f'{account_number} — {savings.client.full_name} — is_deleted={savings.is_deleted}, status={savings.status}'
        ))
        self.stdout.write(f'  SmartSavingsAccount pk={smart.pk}  is_active=True -> False  '
                           f'(start_date={smart.start_date}, opening_balance={smart.opening_balance})')

        if not apply_changes:
            self.stdout.write(self.style.WARNING('\nDRY-RUN — no changes made. Re-run with --apply to deactivate.'))
            return

        smart.is_active = False
        smart.save(update_fields=['is_active'])
        self.stdout.write(self.style.SUCCESS('\nDeactivated.'))
