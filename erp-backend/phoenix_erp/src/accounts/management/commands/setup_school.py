"""
Management command to set up a school tenant with proper configuration
"""

from django.core.management.base import BaseCommand
from users.models import Tenant
from accounts.models import Account, AccountCategory
from incomes.models import IncomeCategory

class Command(BaseCommand):
    help = 'Set up a school tenant with proper domain configuration'
    
    def add_arguments(self, parser):
        parser.add_argument('tenant_id', type=str, help='Tenant ID to configure')
    
    def handle(self, *args, **options):
        tenant_id = options['tenant_id']
        
        try:
            tenant = Tenant.objects.get(id=tenant_id)
        except Tenant.DoesNotExist:
            self.stdout.write(self.style.ERROR(f'Tenant {tenant_id} not found'))
            return
        
        # Update tenant to school domain
        tenant.domain_type = 'school'
        
        # Add school-specific settings
        if not tenant.settings:
            tenant.settings = {}
        
        tenant.settings['domain_type'] = 'school'
        tenant.settings['academic_year_start_month'] = 9
        tenant.settings['max_students_per_class'] = 40
        tenant.save()
        
        self.stdout.write(self.style.SUCCESS(f'✓ Updated tenant {tenant.name} to school domain'))
        
        # Create school-specific income categories
        self.create_fee_categories(tenant)
        
        # Update existing clients to student context
        from clients.models import Client
        updated = Client.objects.filter(
            tenant=tenant,
            classification__name__icontains='grade'
        ).update(usage_context='student')
        
        self.stdout.write(self.style.SUCCESS(f'✓ Updated {updated} clients to student context'))
    
    def create_fee_categories(self, tenant):
        """Create school fee income categories aligned to the financial template."""
        from accounts.utils.account_creation import get_or_create_child_account
        from users.models import User
        from branches.models import Branch

        # Require both an owner and a branch for multi-tenant account creation
        owner = User.objects.filter(tenant=tenant).first()
        if not owner:
            self.stdout.write(self.style.WARNING('No owner found for tenant, skipping fee categories'))
            return

        branch = Branch.objects.filter(tenant=tenant).first()
        if not branch:
            self.stdout.write(self.style.WARNING('No branch found for tenant, skipping fee categories'))
            return

        # Tuple: (code, display_name, usage_context, (parent_code, child_suffix), gl_account_name)
        # Codes are consistent with initialize_school_erp so both commands share the same GL accounts.
        fee_types = [
            ('TUITION',       'Tuition Fees',         'school_fees', ('4100', '003'), 'School Fees and Tuition Income'),      # 4103 (standard)
            ('REGISTRATION',  'Registration Fees',    'school_fees', ('4100', '006'), 'Revenue – Registration Fees'),    # 4106
            ('UNIFORM',       'Uniform',              'school_fees', ('4100', '007'), 'Revenue – Uniform Sales'),        # 4107
            ('TEXTBOOK',      'Textbook / Materials', 'school_fees', ('4100', '008'), 'Revenue – Textbook Sales'),       # 4108
            ('DEV_LEVY',      'Development Levy',     'school_fees', ('4100', '009'), 'Revenue – Development Levy'),     # 4109
            ('LAUNCH',        'Launch Event',         'school_fees', ('4100', '010'), 'Revenue – Launch Income'),        # 4110
            ('SPECIAL_EVENT', 'Special Event',        'school_fees', ('4100', '011'), 'Revenue – Special Event Income'), # 4111
            ('CODING',        'Coding Classes',       'school_fees', ('4100', '012'), 'Revenue – Coding Classes'),       # 4112
            ('TRANSPORT',     'Transportation Fee',   'school_fees', ('4100', '013'), 'Revenue – Transportation Fees'),  # 4113
            ('PTA',           'PTA Levy',             'school_fees', ('4100', '014'), 'Revenue – PTA Levy'),             # 4114
            ('MAINTENANCE',   'Maintenance Fee',      'school_fees', ('4100', '009'), 'Revenue – Development Levy'),     # 4109 (same as dev levy)
            ('PRACTICAL',     'Practical Classes Fee','school_fees', ('4100', '015'), 'Revenue – Practical Fees'),       # 4115
            ('BECE_NECO',     'BECE & NECO Exam Fee', 'school_fees', ('4100', '016'), 'Revenue – BECE and NECO Examination Fees'), # 4116
            ('OTHER',         'Other Revenue',        'school_fees', ('4200', '009'), 'Miscellaneous Income'),                # 4209 (standard)
        ]

        for code, name, usage_context, account_code, account_name in fee_types:
            parent_code, child_suffix = account_code
            income_account = get_or_create_child_account(
                parent_code=parent_code,
                child_suffix=child_suffix,
                name=account_name,
                account_type='INCOME',
                owner=owner,
                branch=branch,
                parent_name='Revenue from Contracts with Customers'
            )

            IncomeCategory.objects.get_or_create(
                tenant=tenant,
                code=code,
                defaults={
                    'name': name,
                    'income_account': income_account,
                    'usage_context': usage_context,
                    'is_recurring': True,
                    'recurrence_period': 'termly',
                    'owner': owner,
                }
            )

        self.stdout.write(self.style.SUCCESS(f'✓ Created {len(fee_types)} fee categories with GL accounts'))

