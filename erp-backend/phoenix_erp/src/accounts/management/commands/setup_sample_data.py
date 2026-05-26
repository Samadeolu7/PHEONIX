# common/management/commands/setup_initial_data.py
"""
Complete setup command for new tenant/branch
Creates all necessary initial data:
- Notification channels
- Account categories
- Transaction series
- Default accounts
- Transaction patterns
- Notification templates
"""
from django.core.management.base import BaseCommand
from django.db import transaction
from django.core.management import call_command


class Command(BaseCommand):
    help = 'Setup initial data for new tenant/branch'
    
    def add_arguments(self, parser):
        parser.add_argument('--branch-id', type=int, required=True)
        parser.add_argument('--owner-id', type=int, required=True)
        parser.add_argument('--skip-notifications', action='store_true')
        parser.add_argument('--skip-accounts', action='store_true')
        parser.add_argument('--skip-patterns', action='store_true')
    
    @transaction.atomic
    def handle(self, *args, **options):
        branch_id = options['branch_id']
        owner_id = options['owner_id']
        
        self.stdout.write(
            self.style.SUCCESS(
                f'\n{"="*60}\n'
                f'Starting Initial Setup\n'
                f'Branch ID: {branch_id}, Owner ID: {owner_id}\n'
                f'{"="*60}\n'
            )
        )
        
        # 1. Create notification channels
        if not options['skip_notifications']:
            self.stdout.write('\n📢 Step 1: Creating notification channels...')
            self._create_notification_channels()
        
        # 2. Create account categories
        if not options['skip_accounts']:
            self.stdout.write('\n💰 Step 2: Creating account categories...')
            self._create_account_categories(branch_id, owner_id)
        
        # 3. Create transaction series
        self.stdout.write('\n📝 Step 3: Creating transaction series...')
        self._create_transaction_series()
        
        # 4. Create default accounts (if requested)
        if not options['skip_accounts']:
            self.stdout.write('\n🏦 Step 4: Creating default accounts...')
            self._create_default_accounts(branch_id, owner_id)
        
        # 5. Create transaction patterns (if requested)
        if not options['skip_patterns']:
            self.stdout.write('\n🔄 Step 5: Creating transaction patterns...')
            call_command('create_account_patterns', branch_id=branch_id)
        
        # 6. Create notification templates (if requested)
        if not options['skip_notifications']:
            self.stdout.write('\n📨 Step 6: Creating notification templates...')
            call_command('create_notification_templates', 
                        branch_id=branch_id, owner_id=owner_id)
        
        self.stdout.write(
            self.style.SUCCESS(
                f'\n{"="*60}\n'
                f'✅ Setup Complete!\n'
                f'{"="*60}\n'
            )
        )
    
    def _create_notification_channels(self):
        """Create notification channels"""
        from notifications.models import NotificationChannel
        
        channels = [
            {
                'code': 'sms',
                'name': 'SMS',
                'provider': 'termii',
                'cost_per_unit': 5.00,
                'rate_limit_per_minute': 60,
                'rate_limit_per_hour': 1000
            },
            {
                'code': 'email',
                'name': 'Email',
                'provider': 'smtp',
                'cost_per_unit': 0.00,
                'rate_limit_per_minute': 100,
                'rate_limit_per_hour': 5000
            },
            {
                'code': 'whatsapp',
                'name': 'WhatsApp',
                'provider': 'twilio',
                'cost_per_unit': 10.00,
                'rate_limit_per_minute': 30,
                'rate_limit_per_hour': 500
            },
            {
                'code': 'push',
                'name': 'Push Notification',
                'provider': 'firebase',
                'cost_per_unit': 0.00,
                'rate_limit_per_minute': 200,
                'rate_limit_per_hour': 10000
            },
            {
                'code': 'in_app',
                'name': 'In-App Notification',
                'provider': 'internal',
                'cost_per_unit': 0.00,
                'rate_limit_per_minute': 1000,
                'rate_limit_per_hour': 50000
            }
        ]
        
        for channel_data in channels:
            channel, created = NotificationChannel.objects.get_or_create(
                code=channel_data['code'],
                defaults=channel_data
            )
            if created:
                self.stdout.write(f'  ✓ Created channel: {channel.name}')
            else:
                self.stdout.write(f'  → Channel exists: {channel.name}')
    
    def _create_account_categories(self, branch_id, owner_id):
        """Create account categories"""
        from accounts.models import AccountCategory
        from branches.models import Branch
        from users.models import User
        
        branch = Branch.objects.get(id=branch_id)
        owner = User.objects.get(id=owner_id)
        
        categories = [
            (1, "Assets"),
            (2, "Liabilities"),
            (3, "Equity"),
            (4, "Income"),
            (5, "Expenses"),
        ]
        
        for section, name in categories:
            category, created = AccountCategory.objects.get_or_create(
                section=section,
                defaults={
                    'name': name,
                    'branch': branch,
                    'owner': owner,
                    'created_by': owner
                }
            )
            if created:
                self.stdout.write(f'  ✓ Created category: {category}')
            else:
                self.stdout.write(f'  → Category exists: {category}')
    
    def _create_transaction_series(self):
        """Create transaction series"""
        from transactions.models import TransactionSeries
        
        series_list = [
            ('TXN', 'General Transactions'),
            ('DEP', 'Deposits'),
            ('WDL', 'Withdrawals'),
            ('LNR', 'Loan Repayments'),
            ('LND', 'Loan Disbursements'),
            ('FEE', 'Fee Collections'),
            ('INT', 'Interest Charges'),
        ]
        
        for code, description in series_list:
            series, created = TransactionSeries.objects.get_or_create(
                code=code,
                defaults={'description': description}
            )
            if created:
                self.stdout.write(f'  ✓ Created series: {code} - {description}')
            else:
                self.stdout.write(f'  → Series exists: {code}')
    
    def _create_default_accounts(self, branch_id, owner_id):
        """Create default accounts"""
        from accounts.models import Account, AccountCategory
        from branches.models import Branch
        from users.models import User
        
        branch = Branch.objects.get(id=branch_id)
        owner = User.objects.get(id=owner_id)
        
        # Default accounts to create
        default_accounts = [
            # Assets
            (1, '101', 'Cash', 'ASSET', True),
            (1, '102', 'Bank Account', 'ASSET', True),
            (1, '150', 'Total Savings', 'SAVINGS', False),  # Parent
            (1, '160', 'Total Loans Receivable', 'LOAN', False),  # Parent
            
            # Liabilities
            (2, '201', 'Accounts Payable', 'LIABILITY', True),
            (2, '210', 'Total Loans Payable', 'LOAN', False),
            
            # Equity
            (3, '301', 'Owner\'s Equity', 'EQUITY', True),
            (3, '302', 'Retained Earnings', 'EQUITY', True),
            
            # Income
            (4, '401', 'Interest Income', 'INCOME', True),
            (4, '402', 'Fee Income', 'INCOME', True),
            (4, '403', 'Other Income', 'INCOME', True),
            
            # Expenses
            (5, '501', 'Salaries Expense', 'EXPENSE', True),
            (5, '502', 'Rent Expense', 'EXPENSE', True),
            (5, '503', 'Utilities Expense', 'EXPENSE', True),
        ]
        
        for section, code, name, account_type, allow_manual in default_accounts:
            category = AccountCategory.objects.get(section=section)
            
            # All accounts with allow_manual=True should be CHILD accounts
            # Parents should always have allow_manual_entries=False
            account_level = 'CHILD' if allow_manual else 'PARENT'
            
            account, created = Account.objects.get_or_create(
                code=code,
                branch=branch,
                defaults={
                    'name': name,
                    'account_type': account_type,
                    'account_level': account_level,
                    'category': category,
                    'allow_manual_entries': allow_manual,
                    'enable_smart_forms': True,
                    'owner': owner,
                    'created_by': owner
                }
            )
            
            if created:
                self.stdout.write(f'  ✓ Created account: {code} - {name}')
            else:
                self.stdout.write(f'  → Account exists: {code} - {name}')


# Usage instructions at the end
"""
USAGE:

1. For a completely new tenant setup:
   python manage.py setup_initial_data --branch-id=1 --owner-id=1

2. To skip certain steps:
   python manage.py setup_initial_data --branch-id=1 --owner-id=1 --skip-notifications

3. After setup, you can:
   - Create client-specific accounts (savings/loans)
   - Patterns will auto-generate forms/workflows
   - Submit forms via API
   - Workflows execute automatically

NEXT STEPS:
1. Configure notification providers (SMS, Email) in Django settings
2. Set up Celery for background tasks
3. Configure Redis for caching
4. Test the complete flow:
   - Create a savings account
   - Pattern should auto-generate
   - Form should be available
   - Submit transaction
   - Workflow should execute
   - Notification should send
"""