# management/commands/seed_account_hierarchy.py

from django.core.management.base import BaseCommand
from django.db import transaction
from decimal import Decimal
from accounts.models import Account, AccountCategory, SavingsAccount, Client
from products.models import Product
from datetime import date, timedelta
import random


class Command(BaseCommand):
    help = 'Seed account hierarchy with parent and child accounts for testing'

    def add_arguments(self, parser):
        parser.add_argument(
            '--clear',
            action='store_true',
            help='Clear existing data before seeding',
        )
        parser.add_argument(
            '--clients',
            type=int,
            default=20,
            help='Number of clients/savings accounts to create',
        )

    @transaction.atomic
    def handle(self, *args, **options):
        if options['clear']:
            self.stdout.write('Clearing existing data...')
            Account.objects.all().delete()
            AccountCategory.objects.all().delete()
            SavingsAccount.objects.all().delete()
            Client.objects.all().delete()
            Product.objects.all().delete()

        self.stdout.write('Creating account categories...')
        self.create_categories()

        self.stdout.write('Creating parent accounts (General Ledger)...')
        parent_accounts = self.create_parent_accounts()

        self.stdout.write('Creating products...')
        savings_product = self.create_products()

        self.stdout.write('Creating clients...')
        clients = self.create_clients(options['clients'])

        self.stdout.write('Creating child accounts and linking to savings...')
        self.create_child_accounts_and_savings(
            parent_accounts, 
            clients, 
            savings_product
        )

        self.stdout.write(self.style.SUCCESS('✓ Successfully seeded account hierarchy!'))
        self.print_summary(parent_accounts)

    def create_categories(self):
        """Create account categories."""
        categories = [
            {'section': 1, 'name': 'Assets'},
            {'section': 2, 'name': 'Liabilities'},
            {'section': 3, 'name': 'Equity'},
            {'section': 4, 'name': 'Income'},
            {'section': 5, 'name': 'Expenses'},
        ]
        
        for cat_data in categories:
            AccountCategory.objects.get_or_create(
                section=cat_data['section'],
                defaults={'name': cat_data['name']}
            )

    def create_parent_accounts(self):
        """Create parent/GL accounts for different account types."""
        asset_category = AccountCategory.objects.get(section=1)
        liability_category = AccountCategory.objects.get(section=2)
        
        parent_accounts = {}
        
        # Savings Parent Account  (FIRS 2140 = Customer Savings and Deposits)
        parent_accounts['savings'] = Account.objects.create(
            code='2140',
            name='Customer Savings and Deposits',
            account_level=Account.LEVEL_PARENT,
            account_type=Account.SAVINGS,
            category=asset_category,
            balance=Decimal('0.00'),
            is_system_account=True,
            allow_manual_entries=False  # Prevent direct posting to parent
        )

        # Loans Parent Account  (FIRS 1150 = Customer Loan Portfolio)
        parent_accounts['loans'] = Account.objects.create(
            code='1150',
            name='Customer Loan Portfolio',
            account_level=Account.LEVEL_PARENT,
            account_type=Account.LOAN,
            category=liability_category,
            balance=Decimal('0.00'),
            is_system_account=True,
            allow_manual_entries=False
        )

        # Current Assets Parent  (FIRS 1100 = Cash and Cash Equivalents)
        parent_accounts['current_assets'] = Account.objects.create(
            code='1100',
            name='Cash and Cash Equivalents',
            account_level=Account.LEVEL_PARENT,
            account_type=Account.ASSET,
            category=asset_category,
            balance=Decimal('0.00'),
            is_system_account=True,
            allow_manual_entries=False
        )

        # Cash Parent  (same FIRS 1100, use get_or_create to avoid duplicate)
        parent_accounts['cash'], _ = Account.objects.get_or_create(
            code='1100',
            defaults={
                'name': 'Cash and Cash Equivalents',
                'account_level': Account.LEVEL_PARENT,
                'account_type': Account.ASSET,
                'category': asset_category,
                'balance': Decimal('0.00'),
                'is_system_account': True,
                'allow_manual_entries': False,
            }
        )
        
        return parent_accounts

    def create_products(self):
        """Create savings product."""
        return Product.objects.create(
            name='Standard Savings',
            product_type='SAVINGS',
            interest_rate=Decimal('2.50'),
            minimum_balance=Decimal('100.00'),
            description='Standard savings account with 2.5% interest'
        )

    def create_clients(self, count):
        """Create test clients."""
        clients = []
        first_names = ['John', 'Jane', 'Michael', 'Sarah', 'David', 'Emma', 
                      'James', 'Olivia', 'Robert', 'Sophia', 'William', 'Ava']
        last_names = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia',
                     'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez']
        
        for i in range(count):
            first_name = random.choice(first_names)
            last_name = random.choice(last_names)
            
            client = Client.objects.create(
                name=f'{first_name} {last_name}',
                email=f'{first_name.lower()}.{last_name.lower()}{i}@example.com',
                phone=f'+234{random.randint(7000000000, 9999999999)}',
                address=f'{random.randint(1, 999)} Main Street, Lagos',
                client_type='INDIVIDUAL'
            )
            clients.append(client)
        
        return clients

    def create_child_accounts_and_savings(self, parent_accounts, clients, savings_product):
        """Create child accounts linked to savings accounts."""
        savings_parent = parent_accounts['savings']
        
        for i, client in enumerate(clients):
            # Create child account
            initial_balance = Decimal(random.randint(1000, 50000))
            
            child_account = Account.create_with_parent(
                parent_code='2140',
                child_data={
                    'name': f'{client.name} - Savings',
                    'balance': initial_balance,
                    'allow_manual_entries': True
                }
            )
            
            # Create savings account linked to child account
            account_number = f'SAV{date.today().year}{str(i+1).zfill(6)}'
            opened_date = date.today() - timedelta(days=random.randint(30, 365))
            
            savings_account = SavingsAccount.objects.create(
                client=client,
                account=child_account,
                product=savings_product,
                account_number=account_number,
                nickname=f'{client.name.split()[0]}\'s Savings',
                status='active',
                opened_on=opened_date,
                interest_rate=savings_product.interest_rate,
                interest_calculation_method='monthly',
                minimum_balance=savings_product.minimum_balance,
                allow_overdraft=random.choice([True, False]),
                overdraft_limit=Decimal('5000.00') if random.choice([True, False]) else Decimal('0.00')
            )
            
            self.stdout.write(
                f'  Created: {child_account.code} - {client.name} (Balance: ₦{initial_balance:,.2f})'
            )

    def print_summary(self, parent_accounts):
        """Print summary of created accounts."""
        self.stdout.write('\n' + '='*60)
        self.stdout.write(self.style.SUCCESS('ACCOUNT HIERARCHY SUMMARY'))
        self.stdout.write('='*60 + '\n')
        
        for key, parent in parent_accounts.items():
            parent.refresh_from_db()
            children = parent.children.all()
            total_balance = sum(child.balance for child in children)
            
            self.stdout.write(f'\n📁 {parent.code} - {parent.name}')
            self.stdout.write(f'   Type: {parent.get_account_type_display()}')
            self.stdout.write(f'   Parent Balance: ₦{parent.balance:,.2f}')
            self.stdout.write(f'   Children Count: {children.count()}')
            self.stdout.write(f'   Total Children Balance: ₦{total_balance:,.2f}')
            
            if children.exists() and key == 'savings':
                self.stdout.write('\n   Sample Child Accounts:')
                for child in children[:5]:  # Show first 5
                    self.stdout.write(f'   📄 {child.code} - {child.name}: ₦{child.balance:,.2f}')
                
                if children.count() > 5:
                    self.stdout.write(f'   ... and {children.count() - 5} more')
        
        self.stdout.write('\n' + '='*60)
        self.stdout.write('\n💡 Usage Examples:')
        self.stdout.write('   • Query parent accounts: Account.objects.filter(account_level="PARENT")')
        self.stdout.write('   • Query savings children: Account.objects.filter(parent__code="150")')
        self.stdout.write('   • Get hierarchy: account.get_hierarchy_path()')
        self.stdout.write('   • Update balance (atomic): account.update_balance(amount, is_debit=True)')
        self.stdout.write('='*60 + '\n')