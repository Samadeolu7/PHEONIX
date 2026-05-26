"""
Comprehensive tests for additional workflow step handlers
Tests for: Calculation, Condition, Transaction, Approval, Notification, Query, HTTP, Sub-workflow, Update
"""
from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from decimal import Decimal
from datetime import datetime
from django.utils import timezone
from unittest.mock import patch, Mock
import json

from automations.models import WorkflowTemplate, WorkflowRun
from automations.workflow_steps import (
    CalculationStepHandler,
    ConditionStepHandler,
    TransactionStepHandler,
    ApprovalStepHandler,
    NotificationStepHandler,
    QueryStepHandler,
    HttpRequestStepHandler,
    SubWorkflowStepHandler,
    UpdateStepHandler,
)
from branches.models import Branch
from accounts.models import Account, AccountCategory

User = get_user_model()


@override_settings(SECURE_SSL_REDIRECT=False, SECURE_PROXY_SSL_HEADER=None)
class CalculationStepHandlerTest(TestCase):
    """Test CalculationStepHandler"""
    
    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123'
        )
        self.branch = Branch.objects.create(
            name='Test Branch',
            code='TB01',
            owner=self.user
        )
        self.template = WorkflowTemplate.objects.create(
            name='Test Calculation Workflow',
            trigger_type='manual',
            workflow_definition={'steps': []},
            owner=self.user,
            branch=self.branch
        )
        self.run = WorkflowRun.objects.create(
            template=self.template,
            context={},
            owner=self.user,
            branch=self.branch,
            current_step_id='calc'
        )
        self.handler = CalculationStepHandler()
    
    def test_simple_arithmetic(self):
        """Test: Simple arithmetic calculations"""
        step = {
            'id': 'calc',
            'name': 'Calculate Total',
            'type': 'calculation',
            'config': {
                'formula': '100 + 50',
                'result_name': 'total'
            }
        }
        context = {}
        
        result = self.handler.execute(step, self.run, context)
        
        self.assertTrue(result['success'])
        self.assertEqual(context['total'], 150)
    
    def test_calculation_with_variables(self):
        """Test: Calculations using context variables"""
        step = {
            'id': 'calc',
            'name': 'Calculate Discount',
            'type': 'calculation',
            'config': {
                'formula': '${amount} * ${discount_rate}',
                'result_name': 'discount'
            }
        }
        context = {
            'amount': 1000,
            'discount_rate': 0.1
        }
        
        result = self.handler.execute(step, self.run, context)
        
        self.assertTrue(result['success'])
        self.assertEqual(context['discount'], 100)
    
    def test_complex_formula(self):
        """Test: Complex mathematical formulas"""
        step = {
            'id': 'calc',
            'name': 'Calculate Interest',
            'type': 'calculation',
            'config': {
                'formula': '${principal} * ${rate} * ${time} / 100',
                'result_name': 'interest'
            }
        }
        context = {
            'principal': 10000,
            'rate': 12,
            'time': 2
        }
        
        result = self.handler.execute(step, self.run, context)
        
        self.assertTrue(result['success'])
        self.assertEqual(context['interest'], 2400)
    
    def test_calculation_with_decimal(self):
        """Test: Precise decimal calculations"""
        step = {
            'id': 'calc',
            'name': 'Calculate VAT',
            'type': 'calculation',
            'config': {
                'formula': '${amount} * 0.075',
                'result_name': 'vat'
            }
        }
        context = {
            'amount': Decimal('1000.00')
        }
        
        result = self.handler.execute(step, self.run, context)
        
        self.assertTrue(result['success'])
        self.assertAlmostEqual(float(context['vat']), 75.0, places=2)
    
    def test_calculation_error_handling(self):
        """Test: Invalid formula returns error"""
        step = {
            'id': 'calc',
            'name': 'Bad Calculation',
            'type': 'calculation',
            'config': {
                'formula': '${missing} + 100',
                'result_name': 'result'
            }
        }
        context = {}
        
        result = self.handler.execute(step, self.run, context)
        
        self.assertFalse(result['success'])
        self.assertIn('error', result)


@override_settings(SECURE_SSL_REDIRECT=False, SECURE_PROXY_SSL_HEADER=None)
class ConditionStepHandlerTest(TestCase):
    """Test ConditionStepHandler"""
    
    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123'
        )
        self.branch = Branch.objects.create(
            name='Test Branch',
            code='TB01',
            owner=self.user
        )
        self.template = WorkflowTemplate.objects.create(
            name='Test Condition Workflow',
            trigger_type='manual',
            workflow_definition={'steps': []},
            owner=self.user,
            branch=self.branch
        )
        self.run = WorkflowRun.objects.create(
            template=self.template,
            context={},
            owner=self.user,
            branch=self.branch,
            current_step_id='condition'
        )
        self.handler = ConditionStepHandler()
    
    def test_simple_equality_condition(self):
        """Test: Simple equality check"""
        step = {
            'id': 'condition',
            'name': 'Check Status',
            'type': 'condition',
            'config': {
                'conditions': [{
                    'field': 'status',
                    'operator': '==',
                    'value': 'active'
                }],
                'logic': 'AND',
                'on_true': 'next_step',
                'on_false': 'error_step'
            }
        }
        context = {'status': 'active'}
        
        result = self.handler.execute(step, self.run, context)
        
        self.assertTrue(result['success'])
        self.assertTrue(result['condition_result'])
        self.assertEqual(result['next_step'], 'next_step')
    
    def test_numeric_comparison(self):
        """Test: Numeric greater than comparison"""
        step = {
            'id': 'condition',
            'name': 'Check Amount',
            'type': 'condition',
            'config': {
                'conditions': [{
                    'field': 'amount',
                    'operator': '>',
                    'value': 1000
                }],
                'logic': 'AND',
                'on_true': 'approve',
                'on_false': 'reject'
            }
        }
        context = {'amount': 1500}
        
        result = self.handler.execute(step, self.run, context)
        
        self.assertTrue(result['success'])
        self.assertTrue(result['condition_result'])
    
    def test_multiple_conditions_and(self):
        """Test: Multiple conditions with AND logic"""
        step = {
            'id': 'condition',
            'name': 'Check Criteria',
            'type': 'condition',
            'config': {
                'conditions': [
                    {'field': 'amount', 'operator': '>', 'value': 1000},
                    {'field': 'status', 'operator': '==', 'value': 'approved'}
                ],
                'logic': 'AND'
            }
        }
        context = {'amount': 1500, 'status': 'approved'}
        
        result = self.handler.execute(step, self.run, context)
        
        self.assertTrue(result['success'])
        self.assertTrue(result['condition_result'])
    
    def test_multiple_conditions_or(self):
        """Test: Multiple conditions with OR logic"""
        step = {
            'id': 'condition',
            'name': 'Check Any',
            'type': 'condition',
            'config': {
                'conditions': [
                    {'field': 'priority', 'operator': '==', 'value': 'high'},
                    {'field': 'amount', 'operator': '>', 'value': 10000}
                ],
                'logic': 'OR'
            }
        }
        context = {'priority': 'low', 'amount': 15000}
        
        result = self.handler.execute(step, self.run, context)
        
        self.assertTrue(result['success'])
        self.assertTrue(result['condition_result'])  # True because amount > 10000
    
    def test_condition_with_null_value(self):
        """Test: Condition handles null values"""
        step = {
            'id': 'condition',
            'name': 'Check Null',
            'type': 'condition',
            'config': {
                'conditions': [{
                    'field': 'optional_field',
                    'operator': 'is_null',
                    'value': None
                }],
                'logic': 'AND'
            }
        }
        context = {'optional_field': None}
        
        result = self.handler.execute(step, self.run, context)
        
        self.assertTrue(result['success'])
        self.assertTrue(result['condition_result'])
    
    def test_string_contains_condition(self):
        """Test: String contains operator"""
        step = {
            'id': 'condition',
            'name': 'Check Description',
            'type': 'condition',
            'config': {
                'conditions': [{
                    'field': 'description',
                    'operator': 'contains',
                    'value': 'urgent'
                }],
                'logic': 'AND'
            }
        }
        context = {'description': 'This is an urgent request'}
        
        result = self.handler.execute(step, self.run, context)
        
        self.assertTrue(result['success'])
        self.assertTrue(result['condition_result'])


@override_settings(SECURE_SSL_REDIRECT=False, SECURE_PROXY_SSL_HEADER=None)
class TransactionStepHandlerTest(TestCase):
    """Test TransactionStepHandler"""
    
    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123'
        )
        self.branch = Branch.objects.create(
            name='Test Branch',
            code='TB01',
            owner=self.user
        )
        
        # Create account categories
        asset_category = AccountCategory.objects.create(
            name='Assets',
            section=1,
            owner=self.user,
            branch=self.branch
        )
        liability_category = AccountCategory.objects.create(
            name='Liabilities',
            section=2,
            owner=self.user,
            branch=self.branch
        )
        
        # Create accounts
        self.cash_account = Account.objects.create(
            code='101',
            name='Cash',
            account_type='ASSET',
            account_level='PARENT',
            category=asset_category,
            owner=self.user,
            branch=self.branch
        )
        self.payable_account = Account.objects.create(
            code='201',
            name='Accounts Payable',
            account_type='LIABILITY',
            account_level='PARENT',
            category=liability_category,
            owner=self.user,
            branch=self.branch
        )
        
        # Create a transaction series
        from transactions.models import TransactionSeries
        self.series = TransactionSeries.objects.create(
            code='GEN',
            description='General Transactions'
        )
        
        self.template = WorkflowTemplate.objects.create(
            name='Test Transaction Workflow',
            trigger_type='manual',
            workflow_definition={'steps': []},
            owner=self.user,
            branch=self.branch
        )
        self.run = WorkflowRun.objects.create(
            template=self.template,
            context={},
            owner=self.user,
            branch=self.branch,
            current_step_id='transaction'
        )
        self.handler = TransactionStepHandler()
    
    def test_create_simple_transaction(self):
        """Test: Create a simple balanced transaction"""
        from datetime import date
        step = {
            'id': 'transaction',
            'name': 'Record Payment',
            'type': 'transaction',
            'config': {
                'series_code': 'GEN',  # Use the series we created in setUp
                'date': date.today().isoformat(),
                'description': 'Payment to supplier',
                'entries': [
                    {
                        'account_id': self.payable_account.id,
                        'side': 'DR',
                        'amount': 1000,
                        'description': 'Reduce payable'
                    },
                    {
                        'account_id': self.cash_account.id,
                        'side': 'CR',
                        'amount': 1000,
                        'description': 'Cash payment'
                    }
                ]
            }
        }
        context = {}
        
        result = self.handler.execute(step, self.run, context)
        
        self.assertTrue(result['success'])
        self.assertIn('reference_number', result)
    
    def test_transaction_with_variables(self):
        """Test: Create transaction using context variables"""
        from datetime import date
        step = {
            'id': 'transaction',
            'name': 'Record Variable Payment',
            'type': 'transaction',
            'config': {
                'series_code': 'GEN',  # Use the series we created in setUp
                'date': date.today().isoformat(),
                'description': 'Payment for ${invoice_number}',
                'entries': [
                    {
                        'account_id': self.payable_account.id,
                        'side': 'DR',
                        'amount': '${amount}',
                        'description': 'Payment'
                    },
                    {
                        'account_id': self.cash_account.id,
                        'side': 'CR',
                        'amount': '${amount}',
                        'description': 'Cash out'
                    }
                ]
            }
        }
        context = {
            'invoice_number': 'INV-001',
            'amount': 500
        }
        
        result = self.handler.execute(step, self.run, context)
        
        self.assertTrue(result['success'])
        self.assertIn('reference_number', result)


@override_settings(SECURE_SSL_REDIRECT=False, SECURE_PROXY_SSL_HEADER=None)
class ApprovalStepHandlerTest(TestCase):
    """Test ApprovalStepHandler"""
    
    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123'
        )
        self.approver = User.objects.create_user(
            username='approver',
            email='approver@example.com',
            password='testpass123'
        )
        self.branch = Branch.objects.create(
            name='Test Branch',
            code='TB01',
            owner=self.user
        )
        self.template = WorkflowTemplate.objects.create(
            name='Test Approval Workflow',
            trigger_type='manual',
            workflow_definition={'steps': []},
            owner=self.user,
            branch=self.branch
        )
        self.run = WorkflowRun.objects.create(
            template=self.template,
            context={},
            owner=self.user,
            branch=self.branch,
            current_step_id='approval'
        )
        self.handler = ApprovalStepHandler()
    
    def test_create_approval_request(self):
        """Test: Create approval request pauses workflow"""
        step = {
            'id': 'approval',
            'name': 'Manager Approval',
            'type': 'approval',
            'config': {
                'approver_type': 'user',
                'approver_id': self.approver.id,
                'approval_message': 'Please approve this request',
                'on_approve': 'next_step',
                'on_reject': 'reject_step'
            }
        }
        context = {}
        
        result = self.handler.execute(step, self.run, context)
        
        self.assertTrue(result['success'])
        self.assertTrue(result.get('paused', False))
        self.assertIn('approval_id', result)  # Changed from approval_request_id


@override_settings(SECURE_SSL_REDIRECT=False, SECURE_PROXY_SSL_HEADER=None)
class NotificationStepHandlerTest(TestCase):
    """Test NotificationStepHandler"""
    
    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123'
        )
        self.branch = Branch.objects.create(
            name='Test Branch',
            code='TB01',
            owner=self.user
        )
        self.template = WorkflowTemplate.objects.create(
            name='Test Notification Workflow',
            trigger_type='manual',
            workflow_definition={'steps': []},
            owner=self.user,
            branch=self.branch
        )
        self.run = WorkflowRun.objects.create(
            template=self.template,
            context={},
            owner=self.user,
            branch=self.branch,
            current_step_id='notify'
        )
        self.handler = NotificationStepHandler()
    
    @patch('notifications.services.NotificationService')
    def test_send_email_notification(self, mock_service_class):
        """Test: Send email notification"""
        mock_service = mock_service_class.return_value
        # Mock should return list of notification objects with .id
        mock_notif = Mock()
        mock_notif.id = 'notif-123'
        mock_service.send_from_template.return_value = [mock_notif]
        
        step = {
            'id': 'notify',
            'name': 'Send Email',
            'type': 'notification',
            'config': {
                'template_code': 'test_template',
                'recipient_source': 'custom',
                'recipient_field': 'user_email'
            }
        }
        context = {'user_email': 'user@example.com'}
        
        result = self.handler.execute(step, self.run, context)
        
        self.assertTrue(result['success'])
    
    @patch('notifications.services.NotificationService')
    def test_notification_with_template(self, mock_service_class):
        """Test: Send notification with variable substitution"""
        mock_service = mock_service_class.return_value
        # Mock should return list of notification objects with .id
        mock_notif = Mock()
        mock_notif.id = 'notif-456'
        mock_service.send_from_template.return_value = [mock_notif]
        
        step = {
            'id': 'notify',
            'name': 'Send Template Email',
            'type': 'notification',
            'config': {
                'template_code': 'invoice_notification',
                'recipient_source': 'custom',
                'recipient_field': 'user_email',
                'context_mapping': {
                    'invoice_number': '${invoice_number}',
                    'amount': '${amount}'
                }
            }
        }
        context = {
            'user_email': 'user@example.com',
            'invoice_number': 'INV-001',
            'amount': 1000
        }
        
        result = self.handler.execute(step, self.run, context)
        
        self.assertTrue(result['success'])


@override_settings(SECURE_SSL_REDIRECT=False, SECURE_PROXY_SSL_HEADER=None)
class QueryStepHandlerTest(TestCase):
    """Test QueryStepHandler"""
    
    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123'
        )
        self.branch = Branch.objects.create(
            name='Test Branch',
            code='TB01',
            owner=self.user
        )
        self.template = WorkflowTemplate.objects.create(
            name='Test Query Workflow',
            trigger_type='manual',
            workflow_definition={'steps': []},
            owner=self.user,
            branch=self.branch
        )
        self.run = WorkflowRun.objects.create(
            template=self.template,
            context={},
            owner=self.user,
            branch=self.branch,
            current_step_id='query'
        )
        self.handler = QueryStepHandler()
    
    def test_query_accounts(self):
        """Test: Query accounts from database"""
        # Create test account
        category = AccountCategory.objects.create(
            name='Assets',
            section=1,
            owner=self.user,
            branch=self.branch
        )
        Account.objects.create(
            code='101',
            name='Test Account',
            account_type='ASSET',
            account_level='PARENT',
            category=category,
            owner=self.user,
            branch=self.branch
        )
        
        step = {
            'id': 'query',
            'name': 'Get Accounts',
            'type': 'query',
            'config': {
                'entity': 'Account',
                'where': {'account_type': 'ASSET'},
                'result_variable': 'accounts'
            }
        }
        context = {}
        
        result = self.handler.execute(step, self.run, context)
        
        self.assertTrue(result['success'])
        self.assertIn('results', result)
        self.assertGreater(len(result['results']), 0)


@override_settings(SECURE_SSL_REDIRECT=False, SECURE_PROXY_SSL_HEADER=None)
class HttpRequestStepHandlerTest(TestCase):
    """Test HttpRequestStepHandler"""
    
    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123'
        )
        self.branch = Branch.objects.create(
            name='Test Branch',
            code='TB01',
            owner=self.user
        )
        self.template = WorkflowTemplate.objects.create(
            name='Test HTTP Workflow',
            trigger_type='manual',
            workflow_definition={'steps': []},
            owner=self.user,
            branch=self.branch
        )
        self.run = WorkflowRun.objects.create(
            template=self.template,
            context={},
            owner=self.user,
            branch=self.branch,
            current_step_id='http'
        )
        self.handler = HttpRequestStepHandler()
    
    @patch('automations.workflow_steps.http_request_step.requests.get')
    def test_http_get_request(self, mock_get):
        """Test: Make HTTP GET request"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {'data': 'test'}
        mock_response.headers = {'Content-Type': 'application/json'}
        mock_get.return_value = mock_response
        
        step = {
            'id': 'http',
            'name': 'Fetch Data',
            'type': 'http_request',
            'config': {
                'method': 'GET',
                'url': 'https://api.example.com/data',
                'result_variable': 'api_response'
            }
        }
        context = {}
        
        result = self.handler.execute(step, self.run, context)
        
        self.assertTrue(result['success'])
        self.assertIn('response', result)
        self.assertEqual(result['response'], {'data': 'test'})
    
    @patch('automations.workflow_steps.http_request_step.requests.post')
    def test_http_post_request(self, mock_post):
        """Test: Make HTTP POST request with body"""
        mock_response = Mock()
        mock_response.status_code = 201
        mock_response.json.return_value = {'id': 123}
        mock_response.headers = {'Content-Type': 'application/json'}
        mock_post.return_value = mock_response
        
        step = {
            'id': 'http',
            'name': 'Create Resource',
            'type': 'http_request',
            'config': {
                'method': 'POST',
                'url': 'https://api.example.com/resources',
                'body': {'name': 'test'},
                'result_variable': 'created'
            }
        }
        context = {}
        
        result = self.handler.execute(step, self.run, context)
        
        self.assertTrue(result['success'])
        self.assertIn('response', result)
        self.assertEqual(result['response'], {'id': 123})


@override_settings(SECURE_SSL_REDIRECT=False, SECURE_PROXY_SSL_HEADER=None)
class UpdateStepHandlerTest(TestCase):
    """Test UpdateStepHandler"""
    
    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123'
        )
        self.branch = Branch.objects.create(
            name='Test Branch',
            code='TB01',
            owner=self.user
        )
        self.template = WorkflowTemplate.objects.create(
            name='Test Update Workflow',
            trigger_type='manual',
            workflow_definition={'steps': []},
            owner=self.user,
            branch=self.branch
        )
        self.run = WorkflowRun.objects.create(
            template=self.template,
            context={},
            owner=self.user,
            branch=self.branch,
            current_step_id='update'
        )
        self.handler = UpdateStepHandler()
    
    def test_update_account_record(self):
        """Test: Update existing database record"""
        # Create test account
        category = AccountCategory.objects.create(
            name='Assets',
            section=1,
            owner=self.user,
            branch=self.branch
        )
        account = Account.objects.create(
            code='101',
            name='Old Name',
            account_type='ASSET',
            account_level='PARENT',
            category=category,
            owner=self.user,
            branch=self.branch
        )
        
        step = {
            'id': 'update',
            'name': 'Update Account',
            'type': 'update',
            'config': {
                'entity': 'Account',
                'id': account.id,
                'fields': {
                    'name': 'New Name'
                }
            }
        }
        context = {}
        
        result = self.handler.execute(step, self.run, context)
        
        self.assertTrue(result['success'])
        account.refresh_from_db()
        self.assertEqual(account.name, 'New Name')
