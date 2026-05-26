# accounts/management/commands/seed_standard_categories.py
"""
Seed standard account categories that ERP models depend on
These categories are pre-built because business logic is tied to them
"""
from django.core.management.base import BaseCommand
from django.db import transaction
from accounts.models import AccountCategory, Account


class Command(BaseCommand):
    help = 'Create standard account categories for ERP modules'

    def add_arguments(self, parser):
        parser.add_argument(
            '--owner-id',
            type=int,
            required=True,
            help='User ID to set as owner for categories'
        )
        parser.add_argument(
            '--branch-id',
            type=int,
            required=True,
            help='Branch ID to associate with categories'
        )

    @transaction.atomic
    def handle(self, *args, **options):
        owner_id = options['owner_id']
        branch_id = options['branch_id']

        self.stdout.write(self.style.NOTICE('Creating standard account categories...'))

        # Define standard categories
        # Format: (section, code_prefix, name, description, is_system_required)
        standard_categories = [
            # ASSETS (Section 1: 100-199)
            (
                1, 
                'CA', 
                'Current Assets',
                'Assets expected to be converted to cash within one year',
                False
            ),
            (
                1, 
                'INV', 
                'Inventory',
                'Goods held for sale or use in production (linked to Inventory models)',
                True  # Required by InventoryItem model
            ),
            (
                1, 
                'AR', 
                'Accounts Receivable',
                'Money owed to the organization by customers',
                False
            ),
            (
                1, 
                'LR', 
                'Loans Receivable',
                'Money lent to clients (linked to LoanAccount model)',
                True  # Required by LoanAccount model
            ),
            (
                1, 
                'FA', 
                'Fixed Assets',
                'Long-term tangible assets like property, equipment',
                False
            ),
            
            # LIABILITIES (Section 2: 200-299)
            (
                2, 
                'CL', 
                'Current Liabilities',
                'Obligations due within one year',
                False
            ),
            (
                2, 
                'SAV', 
                'Savings Accounts',
                'Customer savings deposits (linked to SavingsAccount model)',
                True  # Required by SavingsAccount model
            ),
            (
                2, 
                'AP', 
                'Accounts Payable',
                'Money owed to suppliers',
                False
            ),
            (
                2, 
                'LTL', 
                'Long-term Liabilities',
                'Obligations due beyond one year',
                False
            ),
            
            # EQUITY (Section 3: 300-399)
            (
                3, 
                'OE', 
                'Owner\'s Equity',
                'Owner\'s investment and retained earnings',
                False
            ),
            (
                3, 
                'RE', 
                'Retained Earnings',
                'Accumulated profits not distributed',
                False
            ),
            
            # INCOME (Section 4: 400-499)
            (
                4, 
                'SR', 
                'Sales Income',
                'Income from primary business operations',
                False
            ),
            (
                4, 
                'IR', 
                'Interest Income',
                'Income from loans and investments',
                False
            ),
            (
                4, 
                'OR', 
                'Other Income',
                'Income from non-primary operations',
                False
            ),
            
            # EXPENSES (Section 5: 500-599)
            (
                5, 
                'COGS', 
                'Cost of Goods Sold',
                'Direct costs of producing goods sold (linked to Inventory)',
                True  # Required by Inventory COGS
            ),
            (
                5, 
                'OE', 
                'Operating Expenses',
                'Day-to-day business expenses',
                False
            ),
            (
                5, 
                'IE', 
                'Interest Expense',
                'Cost of borrowing money',
                False
            ),
        ]

        created_count = 0
        skipped_count = 0

        for section, code_prefix, name, description, is_system_required in standard_categories:
            # Check if category already exists
            existing = AccountCategory.objects.filter(
                owner_id=owner_id,
                branch_id=branch_id,
                code_prefix=code_prefix
            ).first()

            if existing:
                self.stdout.write(
                    self.style.WARNING(f'  ⚠ Skipped: {name} ({code_prefix}) - already exists')
                )
                skipped_count += 1
                continue

            # Create category
            category = AccountCategory.objects.create(
                owner_id=owner_id,
                branch_id=branch_id,
                created_by_id=owner_id,
                section=section,
                code_prefix=code_prefix,
                name=name,
                description=description,
                is_system_category=is_system_required  # Mark system-required categories
            )

            marker = '🔒' if is_system_required else '📁'
            self.stdout.write(
                self.style.SUCCESS(
                    f'  {marker} Created: {name} ({code_prefix}) - Section {section}'
                )
            )
            created_count += 1

        self.stdout.write('')
        self.stdout.write(
            self.style.SUCCESS(
                f'✅ Complete! Created {created_count} categories, skipped {skipped_count}'
            )
        )
        self.stdout.write('')
        self.stdout.write('📖 Category Legend:')
        self.stdout.write('  🔒 = System required (linked to ERP models)')
        self.stdout.write('  📁 = Optional (for organization/reporting)')
        self.stdout.write('')
        self.stdout.write('Next steps:')
        self.stdout.write('  1. Users can create custom categories as needed')
        self.stdout.write('  2. Parent accounts can link to these categories')
        self.stdout.write('  3. Categories can be skipped for direct GL → Parent linkage')
