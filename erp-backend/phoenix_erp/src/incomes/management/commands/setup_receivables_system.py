# incomes/management/commands/setup_receivables_system.py
"""
Management command to set up complete receivables system for school
"""
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from decimal import Decimal
from datetime import datetime, timedelta

from incomes.models import IncomeCategory, FeeStructure
from incomes.models_calendar import AcademicYear, AcademicTerm
from incomes.models_discount import DiscountProgram
from accounts.models import Account
from clients.models import ClientClassification


class Command(BaseCommand):
    help = 'Set up complete receivables system with sample data'
    
    def _get_unique_parent_code(self, base_code, owner_id, branch_id):
        """
        Generate unique parent account code by keeping first digit and varying last 2.
        Example: 400 -> 400, 401, 402, ..., 499
        """
        first_digit = base_code[0]
        base_num = int(base_code)
        
        for offset in range(100):  # Try up to 100 variations
            new_code = str(base_num + offset)
            if not Account.objects.filter(
                code=new_code,
                owner_id=owner_id,
                branch_id=branch_id,
                is_deleted=False
            ).exists():
                return new_code
        
        raise ValueError(f"Could not generate unique code based on {base_code}")
    
    def _get_unique_child_code(self, parent_code, owner_id, branch_id):
        """
        Generate unique child account code by varying 3 digits after dash.
        Example: 400-001, 400-002, ..., 400-999
        """
        for suffix in range(1, 1000):  # 001 to 999
            new_code = f"{parent_code}-{suffix:03d}"
            if not Account.objects.filter(
                code=new_code,
                owner_id=owner_id,
                branch_id=branch_id,
                is_deleted=False
            ).exists():
                return new_code
        
        raise ValueError(f"Could not generate unique child code for parent {parent_code}")
    
    def _get_or_create_child_account(self, base_code, name, acc_type, owner_id, branch_id):
        """
        Get or create a child account for transactions.
        First finds/creates the parent account, then uses the parent's actual code
        to find or create the child account. This ensures the child code matches the parent.
        """
        # Step 1: Find or create parent account
        parent = Account.objects.filter(
            code=base_code,
            owner_id=owner_id,
            branch_id=branch_id,
            account_level=Account.LEVEL_PARENT,
            is_deleted=False
        ).first()
        
        if not parent:
            # Create parent account with unique code
            parent_code = self._get_unique_parent_code(base_code, owner_id, branch_id)
            parent = Account.objects.create(
                code=parent_code,
                name=name,
                account_type=acc_type,
                account_level=Account.LEVEL_PARENT,
                allow_manual_entries=False,
                owner_id=owner_id,
                branch_id=branch_id
            )
            self.stdout.write(self.style.SUCCESS(f'  ✓ Created parent: {parent_code} - {name}'))
        else:
            parent_code = parent.code
            self.stdout.write(f'  • Found parent: {parent_code} - {parent.name}')
        
        # Step 2: Now search for existing child using the parent's actual code
        child_pattern = f"{parent_code}-"
        existing_child = Account.objects.filter(
            code__startswith=child_pattern,
            owner_id=owner_id,
            branch_id=branch_id,
            account_level=Account.LEVEL_CHILD,
            parent=parent,  # Also verify parent relationship
            is_deleted=False
        ).first()
        
        if existing_child:
            self.stdout.write(f'  • Found child: {existing_child.code} - {existing_child.name}')
            return existing_child
        
        # Step 3: Create child account using parent's actual code
        child_code = self._get_unique_child_code(parent_code, owner_id, branch_id)
        child = Account.objects.create(
            code=child_code,
            name=f'General {name}',
            account_type=acc_type,
            account_level=Account.LEVEL_CHILD,
            parent=parent,
            allow_manual_entries=True,
            owner_id=owner_id,
            branch_id=branch_id
        )
        self.stdout.write(self.style.SUCCESS(f'  ✓ Created child: {child_code} - General {name}'))
        return child
    
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
        parser.add_argument(
            '--skip-accounts',
            action='store_true',
            help='Skip GL account creation'
        )
        parser.add_argument(
            '--skip-classes',
            action='store_true',
            help='Skip client classification creation'
        )
    
    @transaction.atomic
    def handle(self, *args, **options):
        owner_id = options['owner_id']
        branch_id = options['branch_id']
        
        self.stdout.write(self.style.SUCCESS('=' * 80))
        self.stdout.write(self.style.SUCCESS('RECEIVABLES SYSTEM SETUP'))
        self.stdout.write(self.style.SUCCESS('=' * 80))
        
        # Step 1: Create GL Accounts
        if not options['skip_accounts']:
            self.stdout.write('\n📊 Step 1: Setting up GL accounts...')
            account_map = self.create_accounts(owner_id, branch_id)
        else:
            account_map = {}
        
        # Step 2: Create Client Classifications (Classes)
        if not options['skip_classes']:
            self.stdout.write('\n🎓 Step 2: Setting up client classifications (classes)...')
            self.create_classifications(owner_id, branch_id)
        
        # Step 3: Create Academic Calendar
        self.stdout.write('\n📅 Step 3: Setting up academic calendar...')
        self.create_academic_calendar(owner_id, branch_id)
        
        # Step 4: Create Income Categories, account_map
        self.stdout.write('\n💰 Step 4: Setting up income categories...')
        self.create_income_categories(owner_id, branch_id)
        
        # Step 5: Create Fee Structures
        self.stdout.write('\n💵 Step 5: Setting up fee structures...')
        self.create_fee_structures(owner_id, branch_id)
        
        # Step 6: Create Discount Programs
        self.stdout.write('\n🎁 Step 6: Setting up discount programs...')
        self.create_discount_programs(owner_id, branch_id, account_map)
        
        # Summary
        self.stdout.write(self.style.SUCCESS('\n' + '=' * 80))
        self.stdout.write(self.style.SUCCESS('✅ SETUP COMPLETE!'))
        self.stdout.write(self.style.SUCCESS('=' * 80))
        self.stdout.write('\n📝 Next steps:')
        self.stdout.write('  1. Add students to client classifications')
        self.stdout.write('  2. Generate term invoices: POST /api/incomes/invoices/generate-term-invoices/')
        self.stdout.write('  3. Review class summaries: GET /api/incomes/invoices/class-summary/')
        self.stdout.write('  4. Approve invoices: POST /api/incomes/invoices/approve-class-invoices/')
        self.stdout.write('  5. Generate PDFs: POST /api/incomes/invoices/generate-pdfs/')
    
    def create_accounts(self, owner_id, branch_id):
        """Create GL accounts for income and discounts"""
        accounts = [
            ('400', 'Tuition Fees', 'INCOME'),
            ('401', 'Book Fees', 'INCOME'),
            ('402', 'Uniform Fees', 'INCOME'),
            ('403', 'Sports Fees', 'INCOME'),
            ('404', 'Transport Fees', 'INCOME'),
            ('405', 'Exam Fees', 'INCOME'),
            ('510', 'Discounts Allowed', 'EXPENSE'),
            ('511', 'Scholarship Expense', 'EXPENSE'),
            ('512', 'Fee Waivers', 'EXPENSE'),
        ]
        
        created = 0
        created_accounts = {}
        
        for base_code, name, acc_type in accounts:
            # Try to get existing account with this exact code
            existing = Account.objects.filter(
                code=base_code,
                owner_id=owner_id,
                branch_id=branch_id,
                is_deleted=False
            ).first()
            
            if existing:
                self.stdout.write(f'  • Exists: {existing.code} - {existing.name}')
                created_accounts[base_code] = existing
            else:
                # Generate unique parent code
                unique_code = self._get_unique_parent_code(base_code, owner_id, branch_id)
                
                # Create parent account
                parent_account = Account.objects.create(
                    code=unique_code,
                    name=name,
                    account_type=acc_type,
                    account_level=Account.LEVEL_PARENT,
                    allow_manual_entries=False,  # Parents don't allow manual entries
                    owner_id=owner_id,
                    branch_id=branch_id
                )
                
                # Create child account for transactions
                child_code = self._get_unique_child_code(unique_code, owner_id, branch_id)
                child_account = Account.objects.create(
                    code=child_code,
                    name=f'General {name}',
                    account_type=acc_type,
                    account_level=Account.LEVEL_CHILD,
                    parent=parent_account,
                    allow_manual_entries=True,  # Children allow manual entries
                    owner_id=owner_id,
                    branch_id=branch_id
                )
                
                created += 2  # Parent + Child
                
                if unique_code != base_code:
                    self.stdout.write(self.style.WARNING(
                        f'  ⚠️  Code conflict: {base_code} → {unique_code} (parent) + {child_code} (child)'
                    ))
                else:
                    self.stdout.write(self.style.SUCCESS(
                        f'  ✓ Created: {unique_code} (parent) + {child_code} (child) - {name}'
                    ))
                
                # Store child account for later use (transactions go to children)
                created_accounts[base_code] = child_account
        
        self.stdout.write(f'  📊 Created {created} new accounts (parents + children)')
        return created_accounts
    
    def create_classifications(self, owner_id, branch_id):
        """Create client classifications for school classes"""
        classes = [
            ('P1A', 'Primary 1A', 1, {'sibling_discount': 0.10}),
            ('P1B', 'Primary 1B', 1, {'sibling_discount': 0.10}),
            ('P2A', 'Primary 2A', 2, {'sibling_discount': 0.10}),
            ('P2B', 'Primary 2B', 2, {'sibling_discount': 0.10}),
            ('P3A', 'Primary 3A', 3, {'sibling_discount': 0.10}),
            ('J1A', 'JSS 1A', 7, {'sibling_discount': 0.10}),
            ('J1B', 'JSS 1B', 7, {'sibling_discount': 0.10}),
            ('S1A', 'SS 1A', 10, {'sibling_discount': 0.10}),
        ]
        
        created = 0
        for code, name, priority, rates in classes:
            classification, is_new = ClientClassification.objects.get_or_create(
                code=code,
                owner_id=owner_id,
                branch_id=branch_id,
                defaults={
                    'name': name,
                    'priority_level': priority,
                    'special_rates': rates,
                    'description': f'Students in {name}'
                }
            )
            if is_new:
                created += 1
                self.stdout.write(self.style.SUCCESS(f'  ✓ Created: {code} - {name}'))
            else:
                self.stdout.write(f'  • Exists: {code} - {name}')
        
        self.stdout.write(f'  🎓 Created {created} new classifications')
    
    def create_academic_calendar(self, owner_id, branch_id):
        """Create academic year and terms"""
        # Create academic year
        academic_year, year_created = AcademicYear.objects.get_or_create(
            code='AY2025-2026',
            owner_id=owner_id,
            branch_id=branch_id,
            defaults={
                'name': '2025-2026',
                'start_date': '2025-09-01',
                'end_date': '2026-07-31',
                'is_active': True,
                'term_system': 'trimester'
            }
        )
        
        if year_created:
            self.stdout.write(self.style.SUCCESS(f'  ✓ Created academic year: {academic_year.name}'))
        else:
            self.stdout.write(f'  • Academic year exists: {academic_year.name}')
        
        # Create terms
        terms = [
            {
                'name': 'First Term',
                'code': 'T1',
                'term_number': 'first',
                'start_date': '2025-09-01',
                'end_date': '2025-12-15',
                'invoice_generation_date': '2025-08-15',
                'payment_due_date': '2025-09-30'
            },
            {
                'name': 'Second Term',
                'code': 'T2',
                'term_number': 'second',
                'start_date': '2026-01-05',
                'end_date': '2026-04-15',
                'invoice_generation_date': '2025-12-20',
                'payment_due_date': '2026-01-31'
            },
            {
                'name': 'Third Term',
                'code': 'T3',
                'term_number': 'third',
                'start_date': '2026-04-20',
                'end_date': '2026-07-31',
                'invoice_generation_date': '2026-04-01',
                'payment_due_date': '2026-05-15'
            }
        ]
        
        terms_created = 0
        for term_data in terms:
            term, is_new = AcademicTerm.objects.get_or_create(
                academic_year=academic_year,
                term_number=term_data['term_number'],
                defaults={
                    **term_data,
                    'owner_id': owner_id,
                    'branch_id': branch_id,
                    'is_active': term_data['term_number'] == 'first'
                }
            )
            if is_new:
                terms_created += 1
                self.stdout.write(self.style.SUCCESS(f'  ✓ Created: {term.name}'))
            else:
                self.stdout.write(f'  • Exists: {term.name}')
        
        self.stdout.write(f'  📅 Created {terms_created} new terms')
    
    def create_income_categories(self, owner_id, branch_id, account_map=None):
        """Create income categories"""
        # Use accounts from map if available, otherwise look them up
        if account_map:
            tuition_acc = account_map.get('400')
            books_acc = account_map.get('401')
            uniform_acc = account_map.get('402')
        else:
            # Find child accounts (preferred) or create them
            tuition_acc = self._get_or_create_child_account('400', 'Tuition Fees', 'INCOME', owner_id, branch_id)
            books_acc = self._get_or_create_child_account('401', 'Book Fees', 'INCOME', owner_id, branch_id)
            uniform_acc = self._get_or_create_child_account('402', 'Uniform Fees', 'INCOME', owner_id, branch_id)
        
        if not tuition_acc or not books_acc or not uniform_acc:
            self.stdout.write(self.style.ERROR('  ✗ Could not get/create required income accounts'))
            return
        
        categories = [
            ('TUITION', 'Tuition Fees', tuition_acc),
            ('BOOKS', 'Book Fees', books_acc),
            ('UNIFORM', 'Uniform Fees', uniform_acc),
        ]
        
        created = 0
        for code, name, account in categories:
            category, is_new = IncomeCategory.objects.get_or_create(
                code=code,
                owner_id=owner_id,
                branch_id=branch_id,
                defaults={
                    'name': name,
                    'income_account': account
                }
            )
            if is_new:
                created += 1
                self.stdout.write(self.style.SUCCESS(f'  ✓ Created: {code} - {name}'))
            else:
                self.stdout.write(f'  • Exists: {code} - {name}')
        
        self.stdout.write(f'  💰 Created {created} new income categories')
    
    def create_fee_structures(self, owner_id, branch_id):
        """Create fee structures for different classes"""
        tuition_category = IncomeCategory.objects.get(code='TUITION', owner_id=owner_id, branch_id=branch_id)
        books_category = IncomeCategory.objects.get(code='BOOKS', owner_id=owner_id, branch_id=branch_id)
        
        # Fee structures for Primary 1
        fee_structures = [
            {
                'code': 'P1-TUITION-T1-2026',
                'name': 'Primary 1 Tuition - First Term',
                'category': tuition_category,
                'base_amount': Decimal('50000.00'),
                'frequency': 'termly',
                'config': {
                    'class_code': 'P1A',
                    'academic_year': '2025-2026',
                    'term': 'first',
                    'is_mandatory': True
                }
            },
            {
                'code': 'P1-BOOKS-2026',
                'name': 'Primary 1 Books',
                'category': books_category,
                'base_amount': Decimal('15000.00'),
                'frequency': 'annually',
                'config': {
                    'class_code': 'P1A',
                    'academic_year': '2025-2026',
                    'term': 'first',
                    'is_optional': True
                }
            },
            {
                'code': 'P2-TUITION-T1-2026',
                'name': 'Primary 2 Tuition - First Term',
                'category': tuition_category,
                'base_amount': Decimal('55000.00'),
                'frequency': 'termly',
                'config': {
                    'class_code': 'P2A',
                    'academic_year': '2025-2026',
                    'term': 'first',
                    'is_mandatory': True
                }
            },
        ]
        
        created = 0
        for fee_data in fee_structures:
            fee, is_new = FeeStructure.objects.get_or_create(
                code=fee_data['code'],
                owner_id=owner_id,
                branch_id=branch_id,
                defaults={
                    'name': fee_data['name'],
                    'category': fee_data['category'],
                    'base_amount': fee_data['base_amount'],
                    'is_recurring': True,
                    'frequency': fee_data['frequency'],
                    'industry_config': fee_data['config'],
                    'effective_from': '2025-09-01'
                }
            )
            if is_new:
                created += 1
                self.stdout.write(self.style.SUCCESS(f'  ✓ Created: {fee_data["code"]}'))
            else:
                self.stdout.write(f'  • Exists: {fee_data["code"]}')
        
        self.stdout.write(f'  💵 Created {created} new fee structures')
    
    def create_discount_programs(self, owner_id, branch_id, account_map=None):
        """Create discount programs"""
        # Use accounts from map if available, otherwise look them up
        if account_map:
            discount_acc = account_map.get('510')
            scholarship_acc = account_map.get('511')
            waiver_acc = account_map.get('512')
        else:
            # Find child accounts (preferred) or create them
            discount_acc = self._get_or_create_child_account('510', 'Discounts Allowed', 'EXPENSE', owner_id, branch_id)
            scholarship_acc = self._get_or_create_child_account('511', 'Scholarship Expense', 'EXPENSE', owner_id, branch_id)
            waiver_acc = self._get_or_create_child_account('512', 'Fee Waivers', 'EXPENSE', owner_id, branch_id)
        
        if not discount_acc or not scholarship_acc or not waiver_acc:
            self.stdout.write(self.style.ERROR('  ✗ Could not get/create required discount accounts'))
            return
        
        programs = [
            {
                'code': 'SIBLING-DISC-2026',
                'name': 'Sibling Discount',
                'type': 'discount',
                'value': Decimal('10.00'),
                'criteria': {'has_sibling': True},
                'account': discount_acc,
                'approval': False
            },
            {
                'code': 'MERIT-SCHOLAR-2026',
                'name': 'Merit Scholarship',
                'type': 'scholarship',
                'value': Decimal('50.00'),
                'criteria': {'min_gpa': 3.5},
                'account': scholarship_acc,
                'approval': True,
                'budget': Decimal('5000000.00'),
                'max_recipients': 20
            },
            {
                'code': 'EARLY-PAY-2026',
                'name': 'Early Payment Discount',
                'type': 'discount',
                'value': Decimal('5.00'),
                'criteria': {'early_payment_days': 30},
                'account': discount_acc,
                'approval': False
            }
        ]
        
        created = 0
        for prog in programs:
            program, is_new = DiscountProgram.objects.get_or_create(
                program_code=prog['code'],
                owner_id=owner_id,
                branch_id=branch_id,
                defaults={
                    'name': prog['name'],
                    'program_type': prog['type'],
                    'discount_type': 'percentage',
                    'discount_value': prog['value'],
                    'eligibility_criteria': prog['criteria'],
                    'discount_account': prog['account'],
                    'requires_approval': prog['approval'],
                    'budget_allocated': prog.get('budget', Decimal('0')),
                    'max_recipients': prog.get('max_recipients', 0),
                    'start_date': '2025-09-01'
                }
            )
            if is_new:
                created += 1
                self.stdout.write(self.style.SUCCESS(f'  ✓ Created: {prog["code"]}'))
            else:
                self.stdout.write(f'  • Exists: {prog["code"]}')
        
        self.stdout.write(f'  🎁 Created {created} new discount programs')
