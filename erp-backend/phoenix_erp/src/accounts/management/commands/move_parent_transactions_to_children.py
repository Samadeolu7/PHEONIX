"""
Move transactions from parent accounts to child accounts
Parent accounts should never have direct postings
"""
from django.core.management.base import BaseCommand
from django.db import transaction
from accounts.models import Account
from transactions.models import TransactionEntry
from accounts.utils.account_creation import get_or_create_child_account
from django.db.models import Count


class Command(BaseCommand):
    help = 'Move transactions from parent accounts to appropriate child accounts'
    
    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be done without making changes'
        )
    
    def handle(self, *args, **options):
        dry_run = options['dry_run']
        
        if dry_run:
            self.stdout.write(self.style.WARNING('\n🔍 DRY RUN MODE - No changes will be made\n'))
        
        # Find all parent accounts with transaction entries
        parent_accounts = Account.objects.filter(
            account_level='PARENT'
        ).annotate(
            entry_count=Count('entries')
        ).filter(entry_count__gt=0)
        
        if not parent_accounts:
            self.stdout.write(self.style.SUCCESS('\n✓ No parent accounts with transactions found!'))
            return
        
        self.stdout.write(f"\nFound {parent_accounts.count()} parent accounts with transactions\n")
        
        total_moved = 0
        
        for parent_account in parent_accounts:
            self.stdout.write(f"\n{'='*80}")
            self.stdout.write(f"Processing: {parent_account.code} - {parent_account.name}")
            self.stdout.write(f"Type: {parent_account.account_type}")
            
            # Get all transaction entries for this parent
            entries = TransactionEntry.objects.filter(
                account=parent_account
            ).select_related('transaction')
            
            entry_count = entries.count()
            self.stdout.write(f"Transaction entries: {entry_count}")
            
            # Determine child account name based on parent
            child_account_name = self._get_child_account_name(parent_account)
            
            # Get or create appropriate child account
            child_account = get_or_create_child_account(
                parent_code=parent_account.code,
                child_suffix='001',
                name=child_account_name,
                account_type=parent_account.account_type,
                owner=parent_account.owner,
                branch=parent_account.branch,
                parent_name=parent_account.name
            )
            
            self.stdout.write(f"Target child account: {child_account.code} - {child_account.name}")
            
            if not dry_run:
                with transaction.atomic():
                    # Move all entries to child account
                    updated = entries.update(account=child_account)
                    self.stdout.write(
                        self.style.SUCCESS(f"✓ Moved {updated} transaction entries")
                    )
                    total_moved += updated
                    
                    # Refresh from DB to get updated balances
                    parent_account.refresh_from_db()
                    child_account.refresh_from_db()
                    
                    self.stdout.write(
                        f"  Parent balance now: {parent_account.balance:,.2f}"
                    )
                    self.stdout.write(
                        f"  Child balance now: {child_account.balance:,.2f}"
                    )
            else:
                self.stdout.write(
                    self.style.WARNING(f"Would move {entry_count} entries to {child_account.code}")
                )
        
        self.stdout.write(f"\n{'='*80}")
        if not dry_run:
            self.stdout.write(
                self.style.SUCCESS(f'\n✓ Successfully moved {total_moved} transaction entries')
            )
            self.stdout.write('\nRun check_parent_account_transactions again to verify.')
        else:
            self.stdout.write(
                self.style.WARNING('\n🔍 Dry run complete - no changes made')
            )
            self.stdout.write('Run without --dry-run to apply changes.')
    
    def _get_child_account_name(self, parent_account):
        """Determine appropriate child account name based on parent"""
        name_map = {
            '1200': 'General Accounts Receivable',
            '420': 'General Tuition Fees',
            '120': 'General Inventory',
            '400': 'General Sales Revenue',
            '477': 'General Operating Expense',
        }
        
        # Check if parent code is in map
        if parent_account.code in name_map:
            return name_map[parent_account.code]
        
        # Otherwise, use generic name
        return f"General {parent_account.name}"
