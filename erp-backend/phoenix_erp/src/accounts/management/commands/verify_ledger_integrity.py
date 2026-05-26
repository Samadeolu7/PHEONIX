"""
Management command to verify ledger integrity

Usage:
    python manage.py verify_ledger_integrity
    python manage.py verify_ledger_integrity --fix
    python manage.py verify_ledger_integrity --branch=1
"""
from django.core.management.base import BaseCommand
from django.db.models import Sum, Q
from decimal import Decimal
from accounts.models import Account
from transactions.models import Transaction, TransactionEntry
from tabulate import tabulate


class Command(BaseCommand):
    help = 'Verify accounting ledger integrity and optionally fix discrepancies'

    def add_arguments(self, parser):
        parser.add_argument(
            '--fix',
            action='store_true',
            help='Automatically fix balance discrepancies by recomputing from journal entries',
        )
        parser.add_argument(
            '--branch',
            type=int,
            help='Check only accounts for specific branch ID',
        )
        parser.add_argument(
            '--verbose',
            action='store_true',
            help='Show detailed output for each account',
        )

    def handle(self, *args, **options):
        fix = options['fix']
        branch_id = options.get('branch')
        verbose = options['verbose']

        self.stdout.write(self.style.NOTICE('=' * 80))
        self.stdout.write(self.style.NOTICE('LEDGER INTEGRITY VERIFICATION'))
        self.stdout.write(self.style.NOTICE('=' * 80))

        # Test 1: Check for unposted transaction entries
        self.stdout.write('\n1. Checking for unposted transaction entries...')
        unposted = TransactionEntry.objects.filter(posted=False).select_related('transaction', 'account')
        if unposted.exists():
            self.stdout.write(self.style.WARNING(f'   Found {unposted.count()} unposted entries:'))
            for entry in unposted[:10]:
                self.stdout.write(f'      - {entry.transaction.reference_number}: {entry.account.code} {entry.side} {entry.amount}')
            if unposted.count() > 10:
                self.stdout.write(f'      ... and {unposted.count() - 10} more')
        else:
            self.stdout.write(self.style.SUCCESS('   ✓ All transaction entries are posted'))

        # Test 2: Check for unbalanced transactions
        self.stdout.write('\n2. Checking for unbalanced transactions...')
        unbalanced = []
        transactions = Transaction.objects.all()
        if branch_id:
            transactions = transactions.filter(branch_id=branch_id)
        
        for tx in transactions:
            if not tx.validate_entries():
                unbalanced.append(tx)
        
        if unbalanced:
            self.stdout.write(self.style.ERROR(f'   Found {len(unbalanced)} unbalanced transactions:'))
            for tx in unbalanced[:10]:
                self.stdout.write(f'      - {tx.reference_number}: {tx.description}')
        else:
            self.stdout.write(self.style.SUCCESS('   ✓ All transactions are balanced'))

        # Test 3: Compare account balances to journal entry totals
        self.stdout.write('\n3. Comparing account balances to journal entry totals...')
        
        accounts = Account.objects.all()
        if branch_id:
            accounts = accounts.filter(branch_id=branch_id)
        
        mismatches = []
        fixed_count = 0
        
        for account in accounts:
            # Compute balance from posted entries
            entries = TransactionEntry.objects.filter(account=account, posted=True)
            dr_total = entries.filter(side=TransactionEntry.DEBIT).aggregate(
                total=Sum('amount')
            )['total'] or Decimal('0.00')
            
            cr_total = entries.filter(side=TransactionEntry.CREDIT).aggregate(
                total=Sum('amount')
            )['total'] or Decimal('0.00')
            
            # Calculate expected balance based on account type
            if account.account_type in [Account.ASSET, Account.EXPENSE]:
                computed_balance = dr_total - cr_total
            else:  # LIABILITY, EQUITY, INCOME
                computed_balance = cr_total - dr_total
            
            # Check for mismatch (allow 1 cent tolerance for rounding)
            if abs(computed_balance - account.balance) > Decimal('0.01'):
                mismatches.append({
                    'code': account.code,
                    'name': account.name,
                    'type': account.account_type,
                    'db_balance': account.balance,
                    'computed': computed_balance,
                    'diff': account.balance - computed_balance,
                })
                
                if fix:
                    # Fix the balance
                    import os
                    os.environ['DISABLE_BALANCE_PROTECTION'] = 'true'
                    try:
                        account.balance = computed_balance
                        account.save(update_fields=['balance'])
                        fixed_count += 1
                        if verbose:
                            self.stdout.write(
                                self.style.WARNING(f'   Fixed: {account.code} {account.name}')
                            )
                    finally:
                        del os.environ['DISABLE_BALANCE_PROTECTION']
        
        if mismatches:
            self.stdout.write(self.style.ERROR(f'   Found {len(mismatches)} balance mismatches:'))
            
            # Show table of mismatches
            table_data = [
                [m['code'], m['name'][:30], m['type'], f"{m['db_balance']:,.2f}", 
                 f"{m['computed']:,.2f}", f"{m['diff']:,.2f}"]
                for m in mismatches[:20]
            ]
            headers = ['Code', 'Name', 'Type', 'DB Balance', 'Computed', 'Difference']
            self.stdout.write('\n' + tabulate(table_data, headers=headers, tablefmt='grid'))
            
            if len(mismatches) > 20:
                self.stdout.write(f'\n   ... and {len(mismatches) - 20} more mismatches')
            
            if fix:
                self.stdout.write(self.style.SUCCESS(f'\n   ✓ Fixed {fixed_count} account balances'))
        else:
            self.stdout.write(self.style.SUCCESS('   ✓ All account balances match journal entries'))

        # Test 4: Check parent account balances
        self.stdout.write('\n4. Checking parent account balance aggregations...')
        parent_mismatches = []
        
        for parent in Account.objects.filter(account_level=Account.LEVEL_PARENT):
            children = parent.children.all()
            if children.exists():
                child_total = sum(child.balance for child in children)
                
                # Parent balance should equal sum of children (for parent accounts with children)
                if abs(parent.balance - child_total) > Decimal('0.01'):
                    parent_mismatches.append({
                        'code': parent.code,
                        'name': parent.name,
                        'parent_balance': parent.balance,
                        'children_sum': child_total,
                        'diff': parent.balance - child_total,
                    })
        
        if parent_mismatches:
            self.stdout.write(self.style.ERROR(f'   Found {len(parent_mismatches)} parent balance mismatches:'))
            table_data = [
                [m['code'], m['name'][:30], f"{m['parent_balance']:,.2f}", 
                 f"{m['children_sum']:,.2f}", f"{m['diff']:,.2f}"]
                for m in parent_mismatches[:10]
            ]
            headers = ['Code', 'Name', 'Parent Balance', 'Children Sum', 'Difference']
            self.stdout.write('\n' + tabulate(table_data, headers=headers, tablefmt='grid'))
        else:
            self.stdout.write(self.style.SUCCESS('   ✓ All parent account balances match children'))

        # Summary
        self.stdout.write('\n' + '=' * 80)
        self.stdout.write(self.style.NOTICE('SUMMARY'))
        self.stdout.write('=' * 80)
        
        total_issues = len(unposted) + len(unbalanced) + len(mismatches) + len(parent_mismatches)
        
        if total_issues == 0:
            self.stdout.write(self.style.SUCCESS('\n✓ LEDGER INTEGRITY: PASSED'))
            self.stdout.write(self.style.SUCCESS('  All checks passed. No issues found.\n'))
        else:
            self.stdout.write(self.style.ERROR(f'\n✗ LEDGER INTEGRITY: FAILED'))
            self.stdout.write(self.style.ERROR(f'  Total issues found: {total_issues}'))
            self.stdout.write(self.style.ERROR(f'    - Unposted entries: {len(unposted)}'))
            self.stdout.write(self.style.ERROR(f'    - Unbalanced transactions: {len(unbalanced)}'))
            self.stdout.write(self.style.ERROR(f'    - Balance mismatches: {len(mismatches)}'))
            self.stdout.write(self.style.ERROR(f'    - Parent mismatches: {len(parent_mismatches)}'))
            
            if fix:
                self.stdout.write(self.style.WARNING(f'\n  Fixed {fixed_count} balance discrepancies.'))
                self.stdout.write(self.style.WARNING('  Re-run this command to verify remaining issues.\n'))
            else:
                self.stdout.write(self.style.WARNING('\n  Run with --fix to automatically correct balance mismatches.\n'))
