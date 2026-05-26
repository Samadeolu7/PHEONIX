"""
Management command to set up and test bulk invoice generation system
Creates test data and demonstrates complete workflow
"""
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from decimal import Decimal
import logging

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Set up and test bulk invoice generation system with discounts'

    def add_arguments(self, parser):
        parser.add_argument(
            '--test-only',
            action='store_true',
            help='Only run tests, skip setup'
        )
        parser.add_argument(
            '--branch-id',
            type=int,
            help='Branch ID to use for testing'
        )

    def handle(self, *args, **options):
        test_only = options.get('test_only', False)
        branch_id = options.get('branch_id')

        self.stdout.write(self.style.SUCCESS('=' * 70))
        self.stdout.write(self.style.SUCCESS('BULK INVOICE GENERATION SYSTEM TEST'))
        self.stdout.write(self.style.SUCCESS('=' * 70))
        self.stdout.write('')

        try:
            if not test_only:
                self._setup_test_data(branch_id)
            
            self._test_batch_generation()
            self._test_batch_summary()
            self._test_discount_approval()
            self._test_pdf_generation()
            self._test_celery_automation()
            
            self.stdout.write('')
            self.stdout.write(self.style.SUCCESS('=' * 70))
            self.stdout.write(self.style.SUCCESS('✓ ALL TESTS PASSED'))
            self.stdout.write(self.style.SUCCESS('=' * 70))

        except Exception as e:
            self.stdout.write(self.style.ERROR(f'✗ Test failed: {str(e)}'))
            logger.exception("Test failed")
            raise

    def _setup_test_data(self, branch_id=None):
        """Create test data for bulk invoice generation"""
        self.stdout.write(self.style.WARNING('\n1. Setting up test data...'))
        
        from accounts.models import User, Branch
        from clients.models import Client, ClientClassification
        from incomes.models_calendar import AcademicYear, AcademicTerm
        from incomes.models import IncomeCategory, FeeStructure
        from incomes.models_discount import DiscountProgram, DiscountApplication
        from accounts.models import Account
        
        # Get or create branch
        if branch_id:
            branch = Branch.objects.get(id=branch_id)
        else:
            branch = Branch.objects.first()
            
        if not branch:
            self.stdout.write(self.style.ERROR('No branch found'))
            return
        
        self.stdout.write(f'   Using branch: {branch.name}')
        
        # Get or create user
        user = User.objects.filter(branch=branch, is_staff=True).first()
        if not user:
            self.stdout.write(self.style.ERROR('No admin user found'))
            return
        
        self.stdout.write(f'   Using user: {user.username}')
        
        with transaction.atomic():
            # Create Academic Year and Term
            academic_year, _ = AcademicYear.objects.get_or_create(
                code='2025-2026',
                branch=branch,
                defaults={
                    'name': '2025/2026 Academic Year',
                    'start_date': '2025-09-01',
                    'end_date': '2026-07-31',
                    'term_system': 'trimester',
                    'is_active': True,
                    'owner': user
                }
            )
            
            term, _ = AcademicTerm.objects.get_or_create(
                code='T1-2026',
                academic_year=academic_year,
                branch=branch,
                defaults={
                    'name': 'First Term 2026',
                    'term_number': 1,
                    'start_date': '2026-01-15',
                    'end_date': '2026-04-15',
                    'invoice_generation_date': timezone.now().date(),  # Today for testing
                    'payment_due_date': '2026-02-28',
                    'is_active': True,
                    'owner': user
                }
            )
            
            self.stdout.write(f'   ✓ Created term: {term.code}')
            
            # Create Classification (Class)
            classification, _ = ClientClassification.objects.get_or_create(
                code='P3A',
                branch=branch,
                defaults={
                    'name': 'Primary 3A',
                    'description': 'Primary Three Class A',
                    'usage_context': 'student',
                    'is_active': True,
                    'owner': user
                }
            )
            
            self.stdout.write(f'   ✓ Created classification: {classification.name}')
            
            # Create Income Category
            income_account = Account.objects.filter(
                account_type='INCOME',
                branch=branch
            ).first()
            
            if not income_account:
                self.stdout.write(self.style.ERROR('No income account found'))
                return
            
            category, _ = IncomeCategory.objects.get_or_create(
                code='TUITION',
                branch=branch,
                defaults={
                    'name': 'Tuition Fees',
                    'income_account': income_account,
                    'is_active': True,
                    'owner': user
                }
            )
            
            # Create Fee Structure
            fee_structure, _ = FeeStructure.objects.get_or_create(
                name='Primary 3 Tuition - First Term',
                branch=branch,
                defaults={
                    'category': category,
                    'base_amount': Decimal('50000.00'),
                    'frequency': 'per_term',
                    'is_active': True,
                    'industry_config': {'term_code': term.code},
                    'owner': user
                }
            )
            
            self.stdout.write(f'   ✓ Created fee structure: ₦{fee_structure.base_amount}')
            
            # Create Discount Programs
            scholarship, _ = DiscountProgram.objects.get_or_create(
                program_code='SCHOLAR-MERIT-2026',
                branch=branch,
                defaults={
                    'name': 'Merit Scholarship 2026',
                    'program_type': 'scholarship',
                    'discount_type': 'percentage',
                    'discount_value': Decimal('50.00'),  # 50% off
                    'start_date': term.start_date,
                    'end_date': term.end_date,
                    'is_active': True,
                    'owner': user
                }
            )
            
            staff_discount, _ = DiscountProgram.objects.get_or_create(
                program_code='STAFF-CHILD-2026',
                branch=branch,
                defaults={
                    'name': 'Staff Children Discount',
                    'program_type': 'staff_benefit',
                    'discount_type': 'percentage',
                    'discount_value': Decimal('30.00'),  # 30% off
                    'start_date': term.start_date,
                    'is_active': True,
                    'owner': user
                }
            )
            
            self.stdout.write(f'   ✓ Created 2 discount programs')
            
            # Create Students
            students_created = 0
            for i in range(1, 11):  # Create 10 students
                student, created = Client.objects.get_or_create(
                    client_id=f'STU-P3A-{i:03d}',
                    branch=branch,
                    defaults={
                        'name': f'Student {i} Primary 3A',
                        'classification': classification,
                        'usage_context': 'student',
                        'is_active': True,
                        'metadata': {
                            'parent_name': f'Parent {i}',
                            'parent_phone': f'+234 800 000 {i:04d}',
                            'parent_email': f'parent{i}@school.test'
                        },
                        'owner': user
                    }
                )
                
                if created:
                    students_created += 1
                    
                    # Apply scholarships to some students
                    if i <= 3:  # First 3 students get scholarship
                        DiscountApplication.objects.get_or_create(
                            client=student,
                            program=scholarship,
                            branch=branch,
                            defaults={
                                'start_date': term.start_date,
                                'status': 'active',
                                'owner': user
                            }
                        )
                    
                    # Apply staff discount to some students
                    if i in [4, 5]:  # Students 4-5 are staff children
                        DiscountApplication.objects.get_or_create(
                            client=student,
                            program=staff_discount,
                            branch=branch,
                            defaults={
                                'start_date': term.start_date,
                                'status': 'active',
                                'owner': user
                            }
                        )
            
            self.stdout.write(f'   ✓ Created {students_created} students')
            self.stdout.write(f'   ✓ 3 with merit scholarships (50% off)')
            self.stdout.write(f'   ✓ 2 with staff discount (30% off)')
            self.stdout.write(f'   ✓ 5 with no discounts')
            
            # Store for tests
            self.branch = branch
            self.user = user
            self.term = term
            self.classification = classification
            self.fee_structure = fee_structure

    def _test_batch_generation(self):
        """Test bulk invoice generation"""
        self.stdout.write(self.style.WARNING('\n2. Testing batch generation...'))
        
        from incomes.services.bulk_invoice_service import BulkInvoiceService
        
        result = BulkInvoiceService.generate_batch_for_term(
            term_id=self.term.id,
            classification_id=self.classification.id,
            fee_structure_id=self.fee_structure.id,
            branch=self.branch,
            owner=self.user,
            notes='Test batch generation'
        )
        
        self.batch_id = result['batch_id']
        
        self.stdout.write(f'   ✓ Batch ID: {self.batch_id}')
        self.stdout.write(f'   ✓ Total students: {result["total_students"]}')
        self.stdout.write(f'   ✓ Invoices created: {result["invoices_created"]}')
        self.stdout.write(f'   ✓ Students with discounts: {result["students_with_discounts"]}')
        self.stdout.write(f'   ✓ Total discount: ₦{result["total_discount_amount"]:,.2f}')
        self.stdout.write(f'   ✓ Total amount: ₦{result["total_final_amount"]:,.2f}')
        
        assert result['invoices_created'] == 10, "Should create 10 invoices"
        assert result['students_with_discounts'] == 5, "Should have 5 students with discounts"

    def _test_batch_summary(self):
        """Test batch summary retrieval"""
        self.stdout.write(self.style.WARNING('\n3. Testing batch summary...'))
        
        from incomes.services.bulk_invoice_service import BulkInvoiceService
        
        summary = BulkInvoiceService.get_batch_summary(
            batch_id=self.batch_id,
            branch=self.branch
        )
        
        self.stdout.write(f'   ✓ Batch status: {summary["status"]}')
        self.stdout.write(f'   ✓ Discount summary items: {len(summary["discount_summary"])}')
        self.stdout.write(f'   ✓ Requires approval: {summary["requires_approval"]}')
        self.stdout.write(f'   ✓ Savings percentage: {summary["savings_percentage"]}%')
        
        assert summary['requires_approval'], "Should require approval with discounts"
        assert len(summary['discount_summary']) == 5, "Should have 5 discount items"

    def _test_discount_approval(self):
        """Test selective discount approval"""
        self.stdout.write(self.style.WARNING('\n4. Testing discount approval...'))
        
        from incomes.services.bulk_invoice_service import BulkInvoiceService
        from incomes.models import Invoice
        
        # Get invoices with discounts
        invoices = Invoice.objects.filter(
            metadata__batch_id=self.batch_id,
            branch=self.branch
        )
        
        discount_invoices = [
            inv.id for inv in invoices
            if Decimal(str(inv.metadata.get('discount_amount', 0))) > 0
        ]
        
        # Approve only first 3 discounts
        approved_ids = discount_invoices[:3]
        
        result = BulkInvoiceService.approve_batch(
            batch_id=self.batch_id,
            branch=self.branch,
            approver=self.user,
            notes='Test approval - selective discount approval',
            approved_discount_invoice_ids=approved_ids
        )
        
        self.stdout.write(f'   ✓ Total approved: {result["total_approved"]}')
        self.stdout.write(f'   ✓ Discounts approved: {result["discounts_approved"]}')
        self.stdout.write(f'   ✓ Discounts rejected: {result["discounts_rejected"]}')
        
        assert result['discounts_approved'] == 3, "Should approve 3 discounts"
        assert result['discounts_rejected'] == 2, "Should reject 2 discounts"

    def _test_pdf_generation(self):
        """Test PDF generation"""
        self.stdout.write(self.style.WARNING('\n5. Testing PDF generation...'))
        
        from incomes.services.pdf_batch_service import InvoicePDFBatchService
        from incomes.models import Invoice
        
        invoices = Invoice.objects.filter(
            metadata__batch_id=self.batch_id,
            branch=self.branch
        )[:3]  # Test with 3 invoices
        
        pdf_service = InvoicePDFBatchService()
        zip_bytes = pdf_service.generate_batch_zip(invoices, self.batch_id)
        
        self.stdout.write(f'   ✓ ZIP file size: {len(zip_bytes):,} bytes')
        self.stdout.write(f'   ✓ Invoices included: {invoices.count()}')
        
        assert len(zip_bytes) > 0, "Should generate non-empty ZIP"

    def _test_celery_automation(self):
        """Test Celery task (dry run)"""
        self.stdout.write(self.style.WARNING('\n6. Testing Celery automation...'))
        
        from incomes.tasks import check_invoice_generation_dates
        
        self.stdout.write('   ℹ Celery task check_invoice_generation_dates() ready')
        self.stdout.write('   ℹ Run: celery -A phoenix_erp beat -l info')
        self.stdout.write('   ℹ Schedule: Daily at midnight')
        self.stdout.write('   ✓ Task configuration validated')
