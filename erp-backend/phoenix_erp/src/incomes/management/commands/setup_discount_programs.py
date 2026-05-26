# incomes/management/commands/setup_discount_programs.py
"""
Management command to set up default discount programs for school
"""
from django.core.management.base import BaseCommand
from django.db import transaction
from decimal import Decimal

from incomes.models_discount import DiscountProgram
from accounts.models import Account


class Command(BaseCommand):
    help = 'Set up default discount programs for school'
    
    def add_arguments(self, parser):
        parser.add_argument(
            '--owner-id',
            type=int,
            help='Owner ID (tenant)',
            required=True
        )
        parser.add_argument(
            '--branch-id',
            type=int,
            help='Branch ID',
            required=True
        )
    
    @transaction.atomic
    def handle(self, *args, **options):
        owner_id = options['owner_id']
        branch_id = options['branch_id']
        
        self.stdout.write("Setting up discount programs...")
        
        # Get or create discount accounts
        discount_account = self._get_or_create_account(
            owner_id=owner_id,
            branch_id=branch_id,
            code='5100',
            name='Discounts Allowed',
            account_type='expense',
            description='Discounts given to customers (contra-revenue)'
        )
        
        scholarship_account = self._get_or_create_account(
            owner_id=owner_id,
            branch_id=branch_id,
            code='5110',
            name='Scholarship Expense',
            account_type='expense',
            description='Scholarship grants to students'
        )
        
        waiver_account = self._get_or_create_account(
            owner_id=owner_id,
            branch_id=branch_id,
            code='5120',
            name='Fee Waivers',
            account_type='expense',
            description='Fee waivers for hardship cases'
        )
        
        # Create discount programs
        programs_created = 0
        
        # 1. Sibling Discount - Auto-apply
        program, created = DiscountProgram.objects.get_or_create(
            program_code='SIBLING-DISC-2026',
            owner_id=owner_id,
            branch_id=branch_id,
            defaults={
                'name': 'Sibling Discount 2025-2026',
                'description': 'Automatic 10% discount for students with siblings in school',
                'program_type': 'discount',
                'discount_type': 'percentage',
                'discount_value': Decimal('10.00'),
                'eligibility_criteria': {
                    'has_sibling': True
                },
                'discount_account': discount_account,
                'requires_approval': False,  # Auto-apply
                'start_date': '2025-09-01',
                'is_active': True,
                'is_renewable': True,
                'renewal_period': 'year'
            }
        )
        if created:
            programs_created += 1
            self.stdout.write(self.style.SUCCESS(f'✓ Created: {program.program_code}'))
        else:
            self.stdout.write(f'  Already exists: {program.program_code}')
        
        # 2. Merit Scholarship - Requires approval
        program, created = DiscountProgram.objects.get_or_create(
            program_code='MERIT-SCHOLAR-2026',
            owner_id=owner_id,
            branch_id=branch_id,
            defaults={
                'name': 'Merit Scholarship 2025-2026',
                'description': '50% scholarship for high-performing students (GPA ≥ 3.5)',
                'program_type': 'scholarship',
                'discount_type': 'percentage',
                'discount_value': Decimal('50.00'),
                'eligibility_criteria': {
                    'min_gpa': 3.5,
                    'scholarship_product_code': 'SCHOLAR-MERIT-001'
                },
                'discount_account': scholarship_account,
                'requires_approval': True,
                'budget_allocated': Decimal('5000000.00'),
                'max_recipients': 20,
                'start_date': '2025-09-01',
                'is_active': True,
                'is_renewable': True,
                'renewal_period': 'year'
            }
        )
        if created:
            programs_created += 1
            self.stdout.write(self.style.SUCCESS(f'✓ Created: {program.program_code}'))
        else:
            self.stdout.write(f'  Already exists: {program.program_code}')
        
        # 3. Low Income Waiver - Requires approval
        program, created = DiscountProgram.objects.get_or_create(
            program_code='LOW-INCOME-2026',
            owner_id=owner_id,
            branch_id=branch_id,
            defaults={
                'name': 'Low Income Family Waiver',
                'description': '30% waiver for families with annual income under ₦500,000',
                'program_type': 'waiver',
                'discount_type': 'percentage',
                'discount_value': Decimal('30.00'),
                'eligibility_criteria': {
                    'max_family_income': 500000
                },
                'discount_account': waiver_account,
                'requires_approval': True,
                'budget_allocated': Decimal('3000000.00'),
                'start_date': '2025-09-01',
                'is_active': True,
                'is_renewable': True,
                'renewal_period': 'year'
            }
        )
        if created:
            programs_created += 1
            self.stdout.write(self.style.SUCCESS(f'✓ Created: {program.program_code}'))
        else:
            self.stdout.write(f'  Already exists: {program.program_code}')
        
        # 4. Early Payment Discount - Auto-apply at payment
        program, created = DiscountProgram.objects.get_or_create(
            program_code='EARLY-PAY-2026',
            owner_id=owner_id,
            branch_id=branch_id,
            defaults={
                'name': 'Early Payment Discount',
                'description': '5% discount for payment made 30+ days before due date',
                'program_type': 'discount',
                'discount_type': 'percentage',
                'discount_value': Decimal('5.00'),
                'eligibility_criteria': {
                    'early_payment_days': 30
                },
                'discount_account': discount_account,
                'requires_approval': False,
                'start_date': '2025-09-01',
                'is_active': True,
                'is_renewable': True,
                'renewal_period': 'year'
            }
        )
        if created:
            programs_created += 1
            self.stdout.write(self.style.SUCCESS(f'✓ Created: {program.program_code}'))
        else:
            self.stdout.write(f'  Already exists: {program.program_code}')
        
        # 5. Staff Children Discount - Auto-apply
        program, created = DiscountProgram.objects.get_or_create(
            program_code='STAFF-CHILD-2026',
            owner_id=owner_id,
            branch_id=branch_id,
            defaults={
                'name': 'Staff Children Discount',
                'description': '20% discount for children of staff members',
                'program_type': 'staff_benefit',
                'discount_type': 'percentage',
                'discount_value': Decimal('20.00'),
                'eligibility_criteria': {
                    'custom_field': 'metadata.is_staff_child',
                    'custom_field_value': True
                },
                'discount_account': discount_account,
                'requires_approval': False,
                'start_date': '2025-09-01',
                'is_active': True,
                'is_renewable': True,
                'renewal_period': 'year'
            }
        )
        if created:
            programs_created += 1
            self.stdout.write(self.style.SUCCESS(f'✓ Created: {program.program_code}'))
        else:
            self.stdout.write(f'  Already exists: {program.program_code}')
        
        # 6. New Student Discount - One-time
        program, created = DiscountProgram.objects.get_or_create(
            program_code='NEW-STUDENT-2026',
            owner_id=owner_id,
            branch_id=branch_id,
            defaults={
                'name': 'New Student Welcome Discount',
                'description': '10% discount for new students in first term',
                'program_type': 'promotion',
                'discount_type': 'percentage',
                'discount_value': Decimal('10.00'),
                'eligibility_criteria': {
                    'is_new_student': True
                },
                'discount_account': discount_account,
                'requires_approval': False,
                'start_date': '2025-09-01',
                'is_active': True,
                'is_renewable': False,
                'renewal_period': 'none'
            }
        )
        if created:
            programs_created += 1
            self.stdout.write(self.style.SUCCESS(f'✓ Created: {program.program_code}'))
        else:
            self.stdout.write(f'  Already exists: {program.program_code}')
        
        self.stdout.write(self.style.SUCCESS(
            f'\n✅ Setup complete! Created {programs_created} new discount programs.'
        ))
        
        self.stdout.write('\nDiscount Program Summary:')
        self.stdout.write('─' * 80)
        programs = DiscountProgram.objects.filter(
            owner_id=owner_id,
            branch_id=branch_id,
            is_active=True
        )
        for prog in programs:
            approval = "Auto-apply" if not prog.requires_approval else "Requires approval"
            self.stdout.write(f'• {prog.program_code}: {prog.discount_value}% ({approval})')
    
    def _get_or_create_account(self, owner_id, branch_id, code, name, account_type, description):
        """Get or create account"""
        account, created = Account.objects.get_or_create(
            code=code,
            owner_id=owner_id,
            branch_id=branch_id,
            defaults={
                'name': name,
                'account_type': account_type,
                'description': description,
                'is_active': True
            }
        )
        if created:
            self.stdout.write(f'  Created account: {code} - {name}')
        return account
