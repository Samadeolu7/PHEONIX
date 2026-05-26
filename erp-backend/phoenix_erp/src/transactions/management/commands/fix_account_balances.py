"""
Management command to fix account balances and apply correct sign convention.

This command:
1. Resets all account balances to zero
2. Recalculates balances from posted transaction entries
3. Applies correct sign convention (Income/Liability = positive)
4. Rolls up child balances to parent accounts

Usage:
    python manage.py fix_account_balances --dry-run  # Preview changes
    python manage.py fix_account_balances             # Apply fixes
"""

from django.core.management.base import BaseCommand
from django.db import transaction
from decimal import Decimal
from accounts.models import Account
from transactions.models import TransactionEntry


class Command(BaseCommand):
    help = 'Fix account balances by recalculating from posted transaction entries'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Preview changes without applying them',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        
        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN MODE - No changes will be saved'))
        else:
            self.stdout.write(self.style.WARNING('LIVE MODE - Changes will be committed to database'))
        
        self.stdout.write('')
        
        with transaction.atomic():
            # Step 1: Get all accounts (only fetch necessary fields to avoid schema issues)
            all_accounts = Account.objects.all().only('id', 'code', 'name', 'account_type', 'balance', 'parent_id')
            total_accounts = all_accounts.count()
            
            self.stdout.write(f'Found {total_accounts} accounts to process')
            self.stdout.write('')
            
            # Track balance changes in memory for dry-run mode
            balance_changes = {}  # account_id -> new_balance
            
            # Step 2: Reset all balances to zero
            self.stdout.write(self.style.WARNING('Step 1: Resetting all account balances to zero...'))
            for account in all_accounts:
                balance_changes[account.id] = Decimal('0.00')
            if not dry_run:
                Account.objects.all().update(balance=Decimal('0.00'))
            self.stdout.write(self.style.SUCCESS('✓ All balances reset'))
            self.stdout.write('')
            
            # Step 3: Recalculate ALL account balances from posted entries (not just children)
            self.stdout.write(self.style.WARNING('Step 2: Recalculating account balances from transactions...'))
            
            # First, let's show which accounts have transaction entries
            accounts_with_entries = {}
            for account in all_accounts:
                entry_count = TransactionEntry.objects.filter(account=account, posted=True).count()
                if entry_count > 0:
                    accounts_with_entries[account.id] = entry_count
            
            self.stdout.write(f'  Found {len(accounts_with_entries)} accounts with posted transaction entries')
            self.stdout.write('')
            
            # Process all accounts that could have transaction entries
            updated_count = 0
            error_count = 0
            
            for account in all_accounts:
                try:
                    # Get all posted entries for this account
                    posted_entries = TransactionEntry.objects.filter(
                        account=account,
                        posted=True
                    ).select_related('account')
                    
                    if not posted_entries.exists():
                        continue
                    
                    # Calculate balance using corrected logic
                    new_balance = Decimal('0.00')
                    entry_details = []
                    
                    for entry in posted_entries:
                        # Use the corrected get_balance_effect() method
                        balance_delta = entry.get_balance_effect()
                        new_balance += balance_delta
                        entry_details.append(f"{entry.side}:{entry.amount}={balance_delta}")
                    
                    old_balance = account.balance
                    
                    # Always show accounts with entries, even if balance doesn't change
                    parent_info = f" [parent: {account.parent.code}]" if account.parent_id else ""
                    self.stdout.write(
                        f'  {account.code} ({account.account_type}){parent_info}: '
                        f'{old_balance} → {new_balance} '
                        f'(Δ {new_balance - old_balance}) '
                        f'[{len(posted_entries)} entries]'
                    )
                    
                    # Store in memory
                    balance_changes[account.id] = new_balance
                    
                    if not dry_run and old_balance != new_balance:
                        # Use update() to bypass Account.save() balance protection
                        Account.objects.filter(id=account.id).update(balance=new_balance)
                    
                    if old_balance != new_balance:
                        updated_count += 1
                
                except Exception as e:
                    self.stdout.write(
                        self.style.ERROR(f'  ERROR processing {account.code}: {str(e)}')
                    )
                    error_count += 1
            
            self.stdout.write(self.style.SUCCESS(f'✓ Updated {updated_count} accounts from transactions'))
            if error_count > 0:
                self.stdout.write(self.style.ERROR(f'✗ {error_count} errors encountered'))
            self.stdout.write('')
            
            # Step 4: Roll up child balances to parent accounts
            self.stdout.write(self.style.WARNING('Step 3: Rolling up balances to parent accounts...'))
            
            parent_accounts = all_accounts.filter(parent__isnull=True).order_by('code')
            parent_updated_count = 0
            
            for parent in parent_accounts:
                # Sum all child account balances using in-memory values
                children = Account.objects.filter(parent=parent)
                
                if not children.exists():
                    continue
                
                # Use balance_changes if in dry-run, otherwise query database
                child_balance_sum = sum(
                    balance_changes.get(child.id, child.balance) 
                    for child in children
                )
                
                # Get parent's own balance (from its own transactions, if any)
                parent_own_balance = balance_changes.get(parent.id, Decimal('0.00'))
                old_parent_balance = parent.balance
                
                # NEW BALANCE = parent's own transactions + sum of children
                new_parent_balance = parent_own_balance + child_balance_sum
                
                if old_parent_balance != new_parent_balance:
                    self.stdout.write(
                        f'  {parent.code} ({parent.name}): '
                        f'{old_parent_balance} → {new_parent_balance} '
                        f'(own: {parent_own_balance}, children: {child_balance_sum}, {children.count()} children)'
                    )
                    
                    # Store in memory
                    balance_changes[parent.id] = new_parent_balance
                    
                    if not dry_run:
                        # Use update() to bypass Account.save() balance protection
                        Account.objects.filter(id=parent.id).update(balance=new_parent_balance)
                    
                    parent_updated_count += 1
            
            self.stdout.write(self.style.SUCCESS(f'✓ Updated {parent_updated_count} parent accounts'))
            self.stdout.write('')
            
            # Step 5: Show summary by account type (using in-memory values)
            # Only count parent accounts OR childless accounts to avoid double-counting
            self.stdout.write(self.style.WARNING('Step 4: Balance summary by account type...'))
            
            for account_type, account_type_name in Account.TYPE_CHOICES:
                # Get all accounts of this type
                accounts_of_type = list(Account.objects.filter(account_type=account_type))
                
                # Only sum accounts that are either:
                # 1. Parent accounts (have children), OR
                # 2. Accounts with no parent (root/standalone accounts with no children)
                accounts_to_sum = [
                    acc for acc in accounts_of_type 
                    if acc.parent_id is None  # Only root accounts (parents or standalone)
                ]
                
                # Use balance_changes for accurate totals
                total_balance = sum(
                    balance_changes.get(acc.id, acc.balance) 
                    for acc in accounts_to_sum
                )
                
                # Format with proper sign for display
                sign = '+' if total_balance >= 0 else ''
                self.stdout.write(
                    f'  {account_type_name:20s}: {sign}{total_balance:>15,.2f} '
                    f'({len(accounts_to_sum)} parent/root accounts, {len(accounts_of_type)} total)'
                )
            
            self.stdout.write('')
            
            # Calculate accounting equation (using in-memory values, only parent/root accounts)
            all_accounts_list = list(all_accounts)
            root_accounts = [acc for acc in all_accounts_list if acc.parent_id is None]
            
            assets = sum(
                balance_changes.get(acc.id, acc.balance) 
                for acc in root_accounts if acc.account_type == Account.ASSET
            )
            liabilities = sum(
                balance_changes.get(acc.id, acc.balance) 
                for acc in root_accounts if acc.account_type == Account.LIABILITY
            )
            equity = sum(
                balance_changes.get(acc.id, acc.balance) 
                for acc in root_accounts if acc.account_type == Account.EQUITY
            )
            income = sum(
                balance_changes.get(acc.id, acc.balance) 
                for acc in root_accounts if acc.account_type == Account.INCOME
            )
            expenses = sum(
                balance_changes.get(acc.id, acc.balance) 
                for acc in root_accounts if acc.account_type == Account.EXPENSE
            )
            
            # Accounting equation: Assets = Liabilities + Equity + (Income - Expenses)
            left_side = assets
            right_side = liabilities + equity + income - expenses
            difference = left_side - right_side
            
            self.stdout.write(self.style.WARNING('Accounting Equation Check:'))
            self.stdout.write(f'  Assets: {assets:,.2f}')
            self.stdout.write(f'  Liabilities: {liabilities:,.2f}')
            self.stdout.write(f'  Equity: {equity:,.2f}')
            self.stdout.write(f'  Income: {income:,.2f}')
            self.stdout.write(f'  Expenses: {expenses:,.2f}')
            self.stdout.write(f'  Left Side (Assets): {left_side:,.2f}')
            self.stdout.write(f'  Right Side (L + E + I - Ex): {right_side:,.2f}')
            self.stdout.write(f'  Difference: {difference:,.2f}')
            
            if abs(difference) < 0.01:  # Allow for rounding
                self.stdout.write(self.style.SUCCESS('  ✓ Books are balanced!'))
            else:
                self.stdout.write(self.style.ERROR(f'  ✗ Books are out of balance by {difference:,.2f}'))
            
            self.stdout.write('')
            
            # Final summary
            if dry_run:
                self.stdout.write(self.style.WARNING('DRY RUN COMPLETE - No changes were made'))
                self.stdout.write('Run without --dry-run to apply these changes')
                # Rollback in dry run mode
                transaction.set_rollback(True)
            else:
                self.stdout.write(self.style.SUCCESS('✓ COMPLETE - All balances have been fixed!'))
                self.stdout.write(f'  • {updated_count} child accounts updated')
                self.stdout.write(f'  • {parent_updated_count} parent accounts updated')
                if error_count > 0:
                    self.stdout.write(self.style.ERROR(f'  • {error_count} errors encountered'))
