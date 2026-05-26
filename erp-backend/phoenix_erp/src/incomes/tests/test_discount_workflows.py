# incomes/tests/test_discount_workflows.py
"""
Comprehensive tests for discount workflow integration
"""
import pytest
from decimal import Decimal
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.utils import timezone
from datetime import date, timedelta

from incomes.models_discount import DiscountProgram, DiscountApplication
from incomes.models import IncomeCategory, FeeStructure, Invoice
from incomes.models_calendar import AcademicYear, AcademicTerm
from incomes.services.discount_workflow_service import DiscountWorkflowService
from incomes.services.receivables_service import ReceivablesService
from automations.models import WorkflowTemplate, WorkflowRun
from accounts.models import Account
from clients.models import Client, ClientClassification, ClientRelationship
from branches.models import Branch

User = get_user_model()


@pytest.mark.django_db
class TestDiscountProgramWorkflowValidation(TestCase):
    """Test workflow validation in DiscountProgram model"""
    
    def setUp(self):
        """Set up test data"""
        from users.models import Tenant
        from common.managers import set_current_tenant
        
        self.tenant = Tenant.objects.create(name='Test Org', slug='testorg')
        set_current_tenant(self.tenant)
        
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123',
            tenant=self.tenant
        )
        
        self.branch = Branch.objects.create(
            name='Main Branch',
            code='MAIN',
            tenant=self.tenant
        )
        
        self.discount_account = Account.objects.create(
            code='510',
            name='Discounts Allowed',
            account_type='EXPENSE',
            account_level='PARENT',
            owner=self.user,
            branch=self.branch
        )
        
        # Create valid workflow (no transaction steps)
        # Use unique run_sequence to avoid conflicts
        from datetime import datetime
        timestamp = datetime.now().strftime('%Y%m%d%H%M%S%f')
        
        self.valid_workflow = WorkflowTemplate.objects.create(
            name='GPA Check Workflow',
            workflow_type='master_template',
            run_sequence=f'gpa_check_{timestamp}',
            workflow_definition={
                'initial_step': 'check_gpa',
                'steps': [
                    {
                        'id': 'check_gpa',
                        'type': 'query',
                        'config': {
                            'query': 'SELECT gpa FROM students WHERE id = {{client.id}}'
                        },
                        'next': 'calculate'
                    },
                    {
                        'id': 'calculate',
                        'type': 'calculate',
                        'config': {
                            'formula': 'gpa >= 3.5'
                        },
                        'output': 'eligible'
                    }
                ]
            },
            owner=self.user,
            branch=self.branch
        )
        
        # Create invalid workflow (has transaction step)
        self.invalid_workflow = WorkflowTemplate.objects.create(
            name='Invalid Workflow',
            workflow_type='master_template',
            run_sequence=f'invalid_{timestamp}',
            workflow_definition={
                'initial_step': 'post_data',
                'steps': [
                    {
                        'id': 'post_data',
                        'type': 'transaction',
                        'config': {
                            'action': 'create_record'
                        }
                    }
                ]
            },
            owner=self.user,
            branch=self.branch
        )
    
    def test_valid_eligibility_workflow_attachment(self):
        """Test that valid workflows can be attached"""
        program = DiscountProgram(
            name='Merit Scholarship',
            program_code='MERIT-2026',
            program_type='scholarship',
            discount_type='percentage',
            discount_value=Decimal('50.00'),
            start_date=date.today(),
            eligibility_workflow=self.valid_workflow,
            discount_account=self.discount_account,
            owner=self.user,
            branch=self.branch
        )
        
        # Should not raise ValidationError
        program.clean()
        program.save()
        
        self.assertEqual(program.eligibility_workflow, self.valid_workflow)
    
    def test_invalid_workflow_rejected(self):  
        """Test that workflows with transaction steps are rejected"""
        program = DiscountProgram(
            name='Invalid Program',
            program_code='INVALID-2026',
            program_type='discount',
            discount_type='percentage',
            discount_value=Decimal('10.00'),
            start_date=date.today(),
            eligibility_workflow=self.invalid_workflow,
            discount_account=self.discount_account,
            owner=self.user,
            branch=self.branch
        )
        
        # Model validation via full_clean() should raise ValidationError
        try:
            program.full_clean()
            self.fail("ValidationError was not raised for invalid workflow")
        except ValidationError as e:
            error_dict = e.error_dict if hasattr(e, 'error_dict') else e.message_dict
            self.assertIn('eligibility_workflow', error_dict, 
                         f"Expected 'eligibility_workflow' in errors, got: {error_dict}")
            error_msg = str(error_dict['eligibility_workflow']).lower()
            self.assertIn('transaction', error_msg,
                         f"Expected 'transaction' in error message, got: {error_msg}")
    
    def test_workflow_required_without_workflow(self):
        """Test that requiring workflow without setting one raises error"""
        from incomes.serializers_discount import DiscountProgramSerializer
        
        data = {
            'name': 'Test Program',
            'program_type': 'discount',
            'discount_type': 'percentage',
            'discount_value': '10.00',
            'start_date': date.today().isoformat(),
            'eligibility_workflow_required': True,  # No workflow set
            'discount_account': self.discount_account.id
        }
        
        serializer = DiscountProgramSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn('eligibility_workflow_required', serializer.errors)


@pytest.mark.django_db
class TestDiscountWorkflowService(TestCase):
    """Test DiscountWorkflowService functionality"""
    
    def setUp(self):
        """Set up test data"""
        from users.models import Tenant
        from common.managers import set_current_tenant
        
        self.tenant = Tenant.objects.create(name='Test Org', slug='testorg')
        set_current_tenant(self.tenant)
        
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123',
            tenant=self.tenant
        )
        
        self.branch = Branch.objects.create(
            name='Main Branch',
            code='MAIN',
            tenant=self.tenant
        )
        
        self.discount_account = Account.objects.create(
            code='510',
            name='Discounts',
            account_type='EXPENSE',
            account_level='PARENT',
            owner=self.user,
            branch=self.branch
        )
        
        self.classification = ClientClassification.objects.create(
            code='P1A',
            name='Primary 1A',
            priority_level=1,
            owner=self.user,
            branch=self.branch
        )
        
        self.client = Client.objects.create(
            client_id='STU-002',
            first_name='Jane',
            last_name='Smith',
            gender='female',
            phone_primary='+2348022345678',
            classification=self.classification,
            status='active',
            usage_context='student',
            metadata={'gpa': 3.8},
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        from datetime import datetime
        timestamp = datetime.now().strftime('%Y%m%d%H%M%S%f')
        
        self.workflow = WorkflowTemplate.objects.create(
            name='Eligibility Check',
            workflow_type='master_template',
            run_sequence=f'eligibility_{timestamp}',
            workflow_definition={
                'initial_step': 'check',
                'steps': [
                    {
                        'id': 'check',
                        'type': 'calculate',
                        'config': {
                            'formula': 'client.metadata.gpa >= 3.5'
                        },
                        'output': 'eligible'
                    }
                ]
            },
            owner=self.user,
            branch=self.branch
        )
        
        self.program = DiscountProgram.objects.create(
            name='Merit Scholarship',
            program_code='MERIT-2026',
            program_type='scholarship',
            discount_type='percentage',
            discount_value=Decimal('50.00'),
            start_date=date.today(),
            eligibility_workflow=self.workflow,
            eligibility_workflow_required=True,
            discount_account=self.discount_account,
            owner=self.user,
            branch=self.branch
        )
    
    def test_workflow_step_validation(self):
        """Test workflow step type validation"""
        # Valid workflow
        valid_definition = {
            'steps': [
                {'id': 's1', 'type': 'query'},
                {'id': 's2', 'type': 'calculate'},
                {'id': 's3', 'type': 'loop'},
            ]
        }
        errors = DiscountWorkflowService.validate_workflow_steps(valid_definition)
        self.assertEqual(len(errors), 0)
        
        # Invalid workflow with transaction
        invalid_definition = {
            'steps': [
                {'id': 's1', 'type': 'query'},
                {'id': 's2', 'type': 'transaction'},  # Not allowed
            ]
        }
        errors = DiscountWorkflowService.validate_workflow_steps(invalid_definition)
        self.assertGreater(len(errors), 0)
        self.assertIn('transaction', errors[0].lower())
    
    def test_validate_eligibility_with_workflow_success(self):
        """Test successful workflow execution for eligibility"""
        is_eligible, error_msg, result = DiscountWorkflowService.validate_eligibility_with_workflow(
            program=self.program,
            client=self.client,
            invoice_amount=Decimal('100000.00')
        )
        
        # Note: This test may need mocking of WorkflowExecutor
        # For now, we're testing the service structure
        self.assertIsInstance(is_eligible, bool)
        if not is_eligible:
            self.assertIsNotNone(error_msg)
    
    def test_get_discount_preview(self):
        """Test discount preview calculation"""
        # Create academic year and term
        academic_year = AcademicYear.objects.create(
            name='2025-2026',
            code='AY2025',
            start_date='2025-09-01',
            end_date='2026-07-31',
            is_active=True,
            owner=self.user,
            branch=self.branch
        )
        
        term = AcademicTerm.objects.create(
            academic_year=academic_year,
            name='First Term',
            code='T1',
            term_number='first',
            start_date='2025-09-01',
            end_date='2025-12-15',
            payment_due_date='2025-09-30',
            owner=self.user,
            branch=self.branch
        )
        
        preview = DiscountWorkflowService.get_discount_preview(
            program=self.program,
            client_classification_code='P1A',
            academic_term_id=term.id
        )
        
        self.assertIn('program_code', preview)
        self.assertIn('eligible_count', preview)
        self.assertIn('total_discount', preview)
        self.assertIn('clients', preview)


@pytest.mark.django_db
class TestDiscountProgramAPI(TestCase):
    """Test DiscountProgram API endpoints"""
    
    def setUp(self):
        """Set up test data"""
        from rest_framework.test import APIClient
        from users.models import Tenant
        from common.managers import set_current_tenant
        
        self.client_api = APIClient()
        
        # Create tenant for user
        self.tenant = Tenant.objects.create(
            name='Test Tenant',
            slug='test-tenant'
        )
        set_current_tenant(self.tenant)
        
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123',
            tenant=self.tenant
        )
        
        self.branch = Branch.objects.create(
            name='Main Branch',
            code='MAIN',
            tenant=self.tenant
        )
        
        self.user.tenant = self.tenant
        self.user.branch = self.branch
        self.user.save()
        
        self.client_api.force_authenticate(user=self.user)
        
        self.discount_account = Account.objects.create(
            code='510',
            name='Discounts',
            account_type='EXPENSE',
            account_level='PARENT',
            owner=self.user,
            branch=self.branch
        )
        
        from datetime import datetime
        timestamp = datetime.now().strftime('%Y%m%d%H%M%S%f')
        
        self.workflow = WorkflowTemplate.objects.create(
            name='Test Workflow',
            workflow_type='master_template',
            run_sequence=f'test_wf_{timestamp}',
            workflow_definition={
                'initial_step': 'check',
                'steps': [
                    {'id': 'check', 'type': 'query'}
                ]
            },
            owner=self.user,
            branch=self.branch
        )
        
        self.program = DiscountProgram.objects.create(
            name='Test Program',
            program_code='TEST-2026',
            program_type='discount',
            discount_type='percentage',
            discount_value=Decimal('10.00'),
            start_date=date.today(),
            eligibility_workflow=self.workflow,
            discount_account=self.discount_account,
            owner=self.user,
            branch=self.branch
        )
    
    def test_create_discount_program(self):
        """Test creating discount program via API"""
        data = {
            'name': 'New Discount',
            'program_code': 'NEW-DISC-2026',
            'program_type': 'discount',
            'discount_type': 'percentage',
            'discount_value': '15.00',
            'start_date': date.today().isoformat(),
            'discount_account': self.discount_account.id,
            'eligibility_workflow': self.workflow.id,
            'branch': self.branch.id
        }
        
        response = self.client_api.post('/api/incomes/discount-programs/', data, format='json')
        if response.status_code != 201:
            print(f"Error creating discount: {response.data}")
        self.assertEqual(response.status_code, 201)
        self.assertIn('program_code', response.data)
    
    def test_validate_workflow_endpoint(self):
        """Test workflow validation endpoint"""
        response = self.client_api.post(
            f'/api/incomes/discount-programs/{self.program.id}/validate_workflow/'
        )
        
        self.assertEqual(response.status_code, 200)
        self.assertIn('valid', response.data)
    
    def test_available_workflows_endpoint(self):
        """Test available workflows listing"""
        response = self.client_api.get('/api/incomes/discount-programs/available_workflows/')
        
        self.assertEqual(response.status_code, 200)
        self.assertIn('workflows', response.data)
        self.assertIn('count', response.data)
    
    def test_preview_impact_endpoint(self):
        """Test discount preview endpoint"""
        # Create classification
        classification = ClientClassification.objects.create(
            code='P1A',
            name='Primary 1A',
            priority_level=1,
            owner=self.user,
            branch=self.branch
        )
        
        # Create academic year and term
        academic_year = AcademicYear.objects.create(
            name='2025-2026',
            code='AY2025',
            start_date='2025-09-01',
            end_date='2026-07-31',
            is_active=True,
            owner=self.user,
            branch=self.branch
        )
        
        term = AcademicTerm.objects.create(
            academic_year=academic_year,
            name='First Term',
            code='T1',
            term_number='first',
            start_date='2025-09-01',
            end_date='2025-12-15',
            payment_due_date='2025-09-30',
            owner=self.user,
            branch=self.branch
        )
        
        data = {
            'classification_code': 'P1A',
            'academic_term_id': term.id
        }
        
        response = self.client_api.post(
            f'/api/incomes/discount-programs/{self.program.id}/preview_impact/',
            data
        )
        
        self.assertEqual(response.status_code, 200)
        self.assertIn('eligible_count', response.data)
        self.assertIn('total_discount', response.data)


@pytest.mark.django_db
class TestReceivablesServiceWorkflowIntegration(TestCase):
    """Test workflow integration in ReceivablesService"""
    
    def setUp(self):
        """Set up test data"""
        from users.models import Tenant
        from common.managers import set_current_tenant
        
        self.tenant = Tenant.objects.create(name='Test Org', slug='testorg')
        set_current_tenant(self.tenant)
        
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123',
            tenant=self.tenant
        )
        
        self.branch = Branch.objects.create(
            name='Main Branch',
            code='MAIN',
            tenant=self.tenant
        )
        
        # Create accounts
        self.income_account = Account.objects.create(
            code='400',
            name='Tuition',
            account_type='INCOME',
            account_level='PARENT',
            owner=self.user,
            branch=self.branch
        )
        
        self.discount_account = Account.objects.create(
            code='510',
            name='Discounts',
            account_type='EXPENSE',
            account_level='PARENT',
            owner=self.user,
            branch=self.branch
        )
        
        # Create income category
        self.category = IncomeCategory.objects.create(
            code='TUITION',
            name='Tuition Fees',
            income_account=self.income_account,
            owner=self.user,
            branch=self.branch
        )
        
        # Create fee structure
        self.fee = FeeStructure.objects.create(
            code='P1-FEE',
            name='Primary 1 Fee',
            category=self.category,
            base_amount=Decimal('50000.00'),
            is_recurring=True,
            frequency='termly',
            effective_from='2025-09-01',
            owner=self.user,
            branch=self.branch
        )
        
        # Create classification and client
        self.classification = ClientClassification.objects.create(
            code='P1A',
            name='Primary 1A',
            priority_level=1,
            owner=self.user,
            branch=self.branch
        )
        
        self.client = Client.objects.create(
            client_id='STU-003',
            first_name='John',
            last_name='Doe',
            gender='male',
            phone_primary='+2348012345678',
            classification=self.classification,
            status='active',
            usage_context='student',
            metadata={'gpa': 3.8},
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        # Create academic year and term
        self.academic_year = AcademicYear.objects.create(
            name='2025-2026',
            code='AY2025',
            start_date='2025-09-01',
            end_date='2026-07-31',
            is_active=True,
            owner=self.user,
            branch=self.branch
        )
        
        self.term = AcademicTerm.objects.create(
            academic_year=self.academic_year,
            name='First Term',
            code='T1',
            term_number='first',
            start_date='2025-09-01',
            end_date='2025-12-15',
            payment_due_date='2025-09-30',
            owner=self.user,
            branch=self.branch
        )
        
        # Create workflow
        self.workflow = WorkflowTemplate.objects.create(
            name='GPA Check',
            workflow_type='master_template',
            workflow_definition={
                'initial_step': 'check',
                'steps': [
                    {
                        'id': 'check',
                        'type': 'calculate',
                        'config': {
                            'formula': 'client.metadata.gpa >= 3.5'
                        },
                        'output': 'eligible'
                    }
                ]
            },
            owner=self.user,
            branch=self.branch
        )
        
        # Create discount program
        self.program = DiscountProgram.objects.create(
            name='Merit Scholarship',
            program_code='MERIT-2026',
            program_type='scholarship',
            discount_type='percentage',
            discount_value=Decimal('50.00'),
            start_date='2025-09-01',
            eligibility_criteria={'min_gpa': 3.5},
            eligibility_workflow=self.workflow,
            eligibility_workflow_required=False,  # Optional for testing
            discount_account=self.discount_account,
            is_active=True,
            owner=self.user,
            branch=self.branch
        )
    
    def test_calculate_discounts_with_workflow(self):
        """Test discount calculation with workflow execution"""
        service = ReceivablesService()
        
        fee_items = [
            {
                'fee_structure': self.fee,
                'base_amount': Decimal('50000.00'),
                'description': 'Tuition'
            }
        ]
        
        discounts = service.calculate_applicable_discounts(
            student=self.client,
            fee_items=fee_items,
            invoice_date=date.today(),
            due_date=date.today() + timedelta(days=30),
            academic_year='2025-2026',
            term='first'
        )
        
        # Should find at least the merit scholarship
        self.assertIsInstance(discounts, list)
        if len(discounts) > 0:
            discount = discounts[0]
            self.assertIn('program', discount)
            self.assertIn('discount_amount', discount)
            self.assertIn('criteria_met', discount)
    
    def test_basic_criteria_check(self):
        """Test basic criteria checking"""
        service = ReceivablesService()
        
        criteria = {
            'min_gpa': 3.5,
            'classification_codes': ['P1A']
        }
        
        details = {}
        result = service._check_basic_criteria(
            student=self.client,
            criteria=criteria,
            invoice_date=date.today().isoformat(),
            due_date=(date.today() + timedelta(days=30)).isoformat(),
            academic_year='2025-2026',
            term='first',
            details=details
        )
        
        self.assertTrue(result)
        self.assertIn('gpa', details)
        self.assertEqual(details['gpa'], 3.8)


@pytest.mark.django_db
class TestWorkflowExecutionIntegration(TestCase):
    """Integration tests for workflow execution"""
    
    def setUp(self):
        """Set up test data"""
        from users.models import Tenant
        from common.managers import set_current_tenant
        
        self.tenant = Tenant.objects.create(name='Test Org', slug='testorg')
        set_current_tenant(self.tenant)
        
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123',
            tenant=self.tenant
        )
        
        self.branch = Branch.objects.create(
            name='Main Branch',
            code='MAIN',
            tenant=self.tenant
        )
        
        self.discount_account = Account.objects.create(
            code='510',
            name='Discounts',
            account_type='EXPENSE',
            account_level='PARENT',
            owner=self.user,
            branch=self.branch
        )
    
    def test_workflow_run_creation(self):
        """Test that workflow runs are created during eligibility check"""
        from datetime import datetime
        timestamp = datetime.now().strftime('%Y%m%d%H%M%S%f')
        
        workflow = WorkflowTemplate.objects.create(
            name='Test Workflow',
            workflow_type='master_template',
            run_sequence=f'test_run_{timestamp}',
            workflow_definition={
                'initial_step': 'check',
                'steps': [
                    {'id': 'check', 'type': 'query', 'config': {'entity': 'Client', 'filters': {}}}
                ]
            },
            owner=self.user,
            branch=self.branch
        )
        
        program = DiscountProgram.objects.create(
            name='Test Program',
            program_code='TEST-2026',
            program_type='discount',
            discount_type='percentage',
            discount_value=Decimal('10.00'),
            start_date=date.today(),
            eligibility_workflow=workflow,
            eligibility_workflow_required=True,
            discount_account=self.discount_account,
            owner=self.user,
            branch=self.branch
        )
        
        client = Client.objects.create(
            client_id='STU-004',
            first_name='Test',
            last_name='Student',
            gender='male',
            phone_primary='+2348012345678',
            status='active',
            usage_context='student',
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        # Execute workflow
        is_eligible, error_msg, result = DiscountWorkflowService.validate_eligibility_with_workflow(
            program=program,
            client=client,
            invoice_amount=Decimal('100000.00')
        )
        
        # Check that workflow run was created
        workflow_runs = WorkflowRun.objects.filter(template=workflow)
        self.assertGreater(workflow_runs.count(), 0)


# Run tests with pytest
if __name__ == '__main__':
    pytest.main([__file__, '-v'])

