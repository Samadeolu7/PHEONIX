# management/commands/setup_user_accounts.py

from django.core.management.base import BaseCommand
from django.db import transaction
from accounts.utils.setup_accounts import create_standard_accounts
from users.models import User
from branches.models import Branch


class Command(BaseCommand):
    help = 'Create standard FIRS chart of accounts for a specific user\'s tenant'

    def add_arguments(self, parser):
        parser.add_argument(
            '--email',
            type=str,
            required=True,
            help='Email of the user whose tenant should receive the chart of accounts'
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='Force recreation even if accounts already exist',
        )

    @transaction.atomic
    def handle(self, *args, **options):
        email = options['email']
        force = options.get('force', False)

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            self.stdout.write(self.style.ERROR(f'User with email {email} not found'))
            return

        tenant = getattr(user, 'tenant', None)
        if not tenant:
            self.stdout.write(self.style.ERROR(
                f'User {email} has no tenant. Assign the user to a tenant first.'
            ))
            return

        self.stdout.write(f'Setting up FIRS chart of accounts for: {user.email}')
        self.stdout.write(f'Tenant: {tenant.name}')

        created, skipped = create_standard_accounts(tenant, force=force)

        if created > 0:
            self.stdout.write(self.style.SUCCESS(
                f'\u2713 Created {created} accounts, skipped {skipped} existing'
            ))
        else:
            self.stdout.write(self.style.WARNING(
                f'\u23ed\ufe0f Skipped {skipped} existing accounts (use --force to recreate)'
            ))

        
        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            self.stdout.write(self.style.ERROR(f'User with email {email} not found'))
            return

        # Get or create a branch for this user
        branch, _ = Branch.objects.get_or_create(
            owner=user,
            defaults={
                'name': f'{user.first_name} Branch',
                'code': 'MAIN',
                'is_main': True,
                'created_by': user
            }
        )

        self.stdout.write(f'Creating accounts for user: {user.email}')
        self.stdout.write(f'Using branch: {branch.name}')

        # Create parent accounts
        parent_accounts = self.create_parent_accounts(user, branch)
        
        # Create some child accounts
        self.create_child_accounts(user, branch, parent_accounts)

        self.stdout.write(self.style.SUCCESS(f'✓ Successfully created accounts for {user.email}'))
        self.stdout.write(f'Total accounts created: {Account.objects.filter(owner=user).count()}')

    def create_parent_accounts(self, user, branch):
        """Create parent/GL accounts."""
        parent_accounts = {}
        
        # Assets Parent (FIRS 1100 = Cash and Cash Equivalents)
        parent_accounts['assets'] = Account.objects.get_or_create(
            owner=user,
            code='1100',
            defaults={
                'name': 'Cash and Cash Equivalents',
                'account_level': Account.LEVEL_PARENT,
                'account_type': Account.TYPE_DEBIT,
                'current_balance': Decimal('0.00'),
                'branch': branch,
                'created_by': user,
                'allow_manual_entries': False
            }
        )[0]
        
        # Liabilities Parent (FIRS 2100 = Trade and Other Payables)
        parent_accounts['liabilities'] = Account.objects.get_or_create(
            owner=user,
            code='2100',
            defaults={
                'name': 'Trade and Other Payables',
                'account_level': Account.LEVEL_PARENT,
                'account_type': Account.TYPE_CREDIT,
                'current_balance': Decimal('0.00'),
                'branch': branch,
                'created_by': user,
                'allow_manual_entries': False
            }
        )[0]
        
        # Income Parent (FIRS 4100 = Revenue from Contracts with Customers)
        parent_accounts['income'] = Account.objects.get_or_create(
            owner=user,
            code='4100',
            defaults={
                'name': 'Revenue from Contracts with Customers',
                'account_level': Account.LEVEL_PARENT,
                'account_type': Account.TYPE_CREDIT,
                'current_balance': Decimal('0.00'),
                'branch': branch,
                'created_by': user,
                'allow_manual_entries': False
            }
        )[0]
        
        # Expenses Parent (FIRS 5300 = Administrative and General Expenses)
        parent_accounts['expenses'] = Account.objects.get_or_create(
            owner=user,
            code='5300',
            defaults={
                'name': 'Administrative and General Expenses',
                'account_level': Account.LEVEL_PARENT,
                'account_type': Account.TYPE_DEBIT,
                'current_balance': Decimal('0.00'),
                'branch': branch,
                'created_by': user,
                'allow_manual_entries': False
            }
        )[0]
        
        self.stdout.write(self.style.SUCCESS(f'✓ Created {len(parent_accounts)} parent accounts'))
        return parent_accounts

    def create_child_accounts(self, user, branch, parent_accounts):
        """Create some sample child accounts."""
        child_accounts = [
            # Assets
            {
                'code': '1010',
                'name': 'Cash',
                'parent': parent_accounts['assets'],
                'account_type': Account.TYPE_DEBIT,
            },
            {
                'code': '1020',
                'name': 'Bank - Main Account',
                'parent': parent_accounts['assets'],
                'account_type': Account.TYPE_DEBIT,
            },
            {
                'code': '1030',
                'name': 'Accounts Receivable',
                'parent': parent_accounts['assets'],
                'account_type': Account.TYPE_DEBIT,
            },
            # Liabilities
            {
                'code': '2010',
                'name': 'Accounts Payable',
                'parent': parent_accounts['liabilities'],
                'account_type': Account.TYPE_CREDIT,
            },
            # Income
            {
                'code': '3010',
                'name': 'Service Income',
                'parent': parent_accounts['income'],
                'account_type': Account.TYPE_CREDIT,
            },
            {
                'code': '3020',
                'name': 'Product Sales',
                'parent': parent_accounts['income'],
                'account_type': Account.TYPE_CREDIT,
            },
            # Expenses
            {
                'code': '4010',
                'name': 'Salaries & Wages',
                'parent': parent_accounts['expenses'],
                'account_type': Account.TYPE_DEBIT,
            },
            {
                'code': '4020',
                'name': 'Rent Expense',
                'parent': parent_accounts['expenses'],
                'account_type': Account.TYPE_DEBIT,
            },
            {
                'code': '4030',
                'name': 'Utilities',
                'parent': parent_accounts['expenses'],
                'account_type': Account.TYPE_DEBIT,
            },
        ]
        
        for acc_data in child_accounts:
            Account.objects.get_or_create(
                owner=user,
                code=acc_data['code'],
                defaults={
                    'name': acc_data['name'],
                    'parent': acc_data['parent'],
                    'account_level': Account.LEVEL_CHILD,
                    'account_type': acc_data['account_type'],
                    'current_balance': Decimal('0.00'),
                    'branch': branch,
                    'created_by': user,
                    'allow_manual_entries': True
                }
            )
        
        self.stdout.write(self.style.SUCCESS(f'✓ Created {len(child_accounts)} child accounts'))
