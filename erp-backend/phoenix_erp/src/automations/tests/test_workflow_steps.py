"""
Comprehensive tests for all workflow step handlers
"""
from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from decimal import Decimal
from datetime import datetime, timedelta
from django.utils import timezone
import json

from automations.models import WorkflowTemplate, WorkflowRun
from automations.workflow_steps import (
    DelayStepHandler,
    LoopStepHandler,
    VariableStepHandler,
    ValidationStepHandler,
    ScriptStepHandler,
    AggregateStepHandler,
    FilterStepHandler,
    MapStepHandler,
    CalculationStepHandler,
    ConditionStepHandler,
)
from branches.models import Branch

User = get_user_model()


@override_settings(SECURE_SSL_REDIRECT=False, SECURE_PROXY_SSL_HEADER=None)
class DelayStepHandlerTest(TestCase):
    """Test DelayStepHandler"""
    
    def setUp(self):
        self.branch = Branch.objects.create(
            name="Test Branch",
            code="TB001"
        )
        self.user = User.objects.create_user(
            username="testuser",
            email="test@test.com",
            password="testpass123",
            branch=self.branch
        )
        
        # Create workflow template
        self.template = WorkflowTemplate.objects.create(
            name="Test Delay Workflow",
            trigger_type="manual",
            workflow_definition={'steps': [], 'initial_step': 'step1'},
            owner=self.user,
            branch=self.branch
        )
        
        # Create workflow run
        self.run = WorkflowRun.objects.create(
            template=self.template,
            context={},
            owner=self.user,
            branch=self.branch
        )
        
        self.handler = DelayStepHandler()
    
    def test_duration_delay(self):
        """Test duration-based delay"""
        step = {
            'type': 'delay',
            'config': {
                'delay_type': 'duration',
                'duration': 5,
                'duration_unit': 'minutes'
            }
        }
        
        result = self.handler.execute(step, self.run, {})
        
        self.assertTrue(result['success'])
        self.assertTrue(result['paused'])
        self.assertEqual(result['delay_seconds'], 300)  # 5 minutes = 300 seconds
        self.assertIn('resume_at', result)
        
        # Check run status updated
        self.run.refresh_from_db()
        self.assertEqual(self.run.status, 'waiting')
    
    def test_until_delay(self):
        """Test delay until specific datetime"""
        future_time = (timezone.now() + timedelta(hours=2)).isoformat()
        
        step = {
            'type': 'delay',
            'config': {
                'delay_type': 'until',
                'until_datetime': future_time
            }
        }
        
        result = self.handler.execute(step, self.run, {})
        
        self.assertTrue(result['success'])
        self.assertTrue(result['paused'])
        self.assertIn('resume_at', result)
    
    def test_delay_past_time(self):
        """Test delay with past time continues immediately"""
        past_time = (timezone.now() - timedelta(hours=1)).isoformat()
        
        step = {
            'type': 'delay',
            'config': {
                'delay_type': 'until',
                'until_datetime': past_time
            }
        }
        
        result = self.handler.execute(step, self.run, {})
        
        self.assertTrue(result['success'])
        self.assertFalse(result['paused'])


@override_settings(SECURE_SSL_REDIRECT=False, SECURE_PROXY_SSL_HEADER=None)
class LoopStepHandlerTest(TestCase):
    """Test LoopStepHandler"""
    
    def setUp(self):
        self.branch = Branch.objects.create(
            name="Test Branch",
            code="TB001"
        )
        self.user = User.objects.create_user(
            username="testuser",
            email="test@test.com",
            password="testpass123",
            branch=self.branch
        )
        
        self.template = WorkflowTemplate.objects.create(
            name="Test Loop Workflow",
            trigger_type="manual",
            workflow_definition={'steps': [], 'initial_step': 'step1'},
            owner=self.user,
            branch=self.branch
        )
        
        self.run = WorkflowRun.objects.create(
            template=self.template,
            context={},
            owner=self.user,
            branch=self.branch
        )
        
        self.handler = LoopStepHandler()
    
    def test_simple_loop(self):
        """Test basic loop over collection"""
        context = {
            'items': [
                {'id': 1, 'amount': 100},
                {'id': 2, 'amount': 200},
                {'id': 3, 'amount': 300}
            ]
        }
        
        step = {
            'type': 'loop',
            'config': {
                'collection': '${items}',
                'item_variable': 'item',
                'steps': [
                    {
                        'id': 'calc',
                        'type': 'calculation',
                        'config': {
                            'formula': '${item.amount} * 1.1',
                            'result_name': 'adjusted'
                        }
                    }
                ]
            }
        }
        
        result = self.handler.execute(step, self.run, context)
        
        self.assertTrue(result['success'])
        self.assertEqual(result['iterations'], 3)
        self.assertEqual(result['successful'], 3)
        self.assertEqual(result['failed'], 0)
    
    def test_loop_with_error_handling(self):
        """Test loop with break_on_error"""
        context = {
            'items': [1, 2, 3, 4, 5]
        }
        
        step = {
            'type': 'loop',
            'config': {
                'collection': '${items}',
                'item_variable': 'num',
                'max_iterations': 10,
                'break_on_error': True,
                'steps': [
                    {
                        'type': 'calculation',
                        'config': {
                            'formula': '${num} * 2',
                            'result_name': 'doubled'
                        }
                    }
                ]
            }
        }
        
        result = self.handler.execute(step, self.run, context)
        
        self.assertTrue(result['success'])
        self.assertEqual(result['iterations'], 5)
    
    def test_loop_max_iterations(self):
        """Test loop respects max_iterations"""
        context = {
            'items': list(range(100))  # 100 items
        }
        
        step = {
            'type': 'loop',
            'config': {
                'collection': '${items}',
                'max_iterations': 10,  # Only allow 10
                'steps': []
            }
        }
        
        result = self.handler.execute(step, self.run, context)
        
        self.assertFalse(result['success'])
        self.assertIn('exceeds max_iterations', result['error'])


@override_settings(SECURE_SSL_REDIRECT=False, SECURE_PROXY_SSL_HEADER=None)
class VariableStepHandlerTest(TestCase):
    """Test VariableStepHandler"""
    
    def setUp(self):
        self.branch = Branch.objects.create(
            name="Test Branch",
            code="TB001"
        )
        self.user = User.objects.create_user(
            username="testuser",
            email="test@test.com",
            password="testpass123",
            branch=self.branch
        )
        
        self.template = WorkflowTemplate.objects.create(
            name="Test Variable Workflow",
            trigger_type="manual",
            workflow_definition={'steps': [], 'initial_step': 'step1'},
            owner=self.user,
            branch=self.branch
        )
        
        self.run = WorkflowRun.objects.create(
            template=self.template,
            context={},
            owner=self.user,
            branch=self.branch
        )
        
        self.handler = VariableStepHandler()
    
    def test_set_variables(self):
        """Test setting variables"""
        context = {'amount': 1000}
        
        step = {
            'type': 'variable',
            'config': {
                'mode': 'set',
                'variables': {
                    'tax_rate': 0.1,
                    'status': 'processed',
                    'total': '${amount}'
                }
            }
        }
        
        result = self.handler.execute(step, self.run, context)
        
        self.assertTrue(result['success'])
        self.assertEqual(result['variables_set'], 3)
        self.assertEqual(context['tax_rate'], 0.1)
        self.assertEqual(context['status'], 'processed')
        self.assertEqual(context['total'], 1000)
    
    def test_merge_variables(self):
        """Test merging variables (only if not exists)"""
        context = {'existing': 'value'}
        
        step = {
            'type': 'variable',
            'config': {
                'mode': 'merge',
                'variables': {
                    'existing': 'new_value',  # Should be skipped
                    'new_var': 'new_value'     # Should be added
                }
            }
        }
        
        result = self.handler.execute(step, self.run, context)
        
        self.assertTrue(result['success'])
        self.assertEqual(result['variables_merged'], 1)
        self.assertEqual(result['variables_skipped'], 1)
        self.assertEqual(context['existing'], 'value')  # Unchanged
        self.assertEqual(context['new_var'], 'new_value')  # Added
    
    def test_delete_variables(self):
        """Test deleting variables"""
        context = {
            'var1': 'value1',
            'var2': 'value2',
            'var3': 'value3'
        }
        
        step = {
            'type': 'variable',
            'config': {
                'mode': 'delete',
                'variables': ['var1', 'var2', 'nonexistent']
            }
        }
        
        result = self.handler.execute(step, self.run, context)
        
        self.assertTrue(result['success'])
        self.assertEqual(result['variables_deleted'], 2)
        self.assertNotIn('var1', context)
        self.assertNotIn('var2', context)
        self.assertIn('var3', context)


@override_settings(SECURE_SSL_REDIRECT=False, SECURE_PROXY_SSL_HEADER=None)
class ValidationStepHandlerTest(TestCase):
    """Test ValidationStepHandler"""
    
    def setUp(self):
        self.branch = Branch.objects.create(
            name="Test Branch",
            code="TB001"
        )
        self.user = User.objects.create_user(
            username="testuser",
            email="test@test.com",
            password="testpass123",
            branch=self.branch
        )
        
        self.template = WorkflowTemplate.objects.create(
            name="Test Validation Workflow",
            trigger_type="manual",
            workflow_definition={'steps': [], 'initial_step': 'step1'},
            owner=self.user,
            branch=self.branch
        )
        
        self.run = WorkflowRun.objects.create(
            template=self.template,
            context={},
            owner=self.user,
            branch=self.branch
        )
        
        self.handler = ValidationStepHandler()
    
    def test_valid_data(self):
        """Test validation with valid data"""
        context = {
            'form': {
                'amount': 1000,
                'email': 'test@example.com',
                'status': 'pending'
            }
        }
        
        step = {
            'type': 'validation',
            'config': {
                'validations': [
                    {
                        'field': '${form.amount}',
                        'rules': ['required', 'numeric', {'min': 0}, {'max': 10000}]
                    },
                    {
                        'field': '${form.email}',
                        'rules': ['required', 'email']
                    }
                ]
            }
        }
        
        result = self.handler.execute(step, self.run, context)
        
        self.assertTrue(result['success'])
        self.assertTrue(result['valid'])
        self.assertIsNone(result['errors'])
    
    def test_invalid_data(self):
        """Test validation with invalid data"""
        context = {
            'form': {
                'amount': -100,  # Negative
                'email': 'invalid-email'  # Invalid format
            }
        }
        
        step = {
            'type': 'validation',
            'config': {
                'validations': [
                    {
                        'field': '${form.amount}',
                        'rules': ['required', 'numeric', {'min': 0}]
                    },
                    {
                        'field': '${form.email}',
                        'rules': ['required', 'email']
                    }
                ],
                'fail_on_error': True
            }
        }
        
        result = self.handler.execute(step, self.run, context)
        
        self.assertFalse(result['success'])
        self.assertFalse(result['valid'])
        self.assertIsNotNone(result['errors'])
        self.assertGreater(len(result['errors']), 0)
    
    def test_validation_rules(self):
        """Test various validation rules"""
        context = {'test_value': 'hello@example.com'}
        
        # Test email validation
        step = {
            'type': 'validation',
            'config': {
                'validations': [
                    {
                        'field': '${test_value}',
                        'rules': ['email']
                    }
                ]
            }
        }
        
        result = self.handler.execute(step, self.run, context)
        self.assertTrue(result['valid'])


@override_settings(SECURE_SSL_REDIRECT=False, SECURE_PROXY_SSL_HEADER=None)
class ScriptStepHandlerTest(TestCase):
    """Test ScriptStepHandler"""
    
    def setUp(self):
        self.branch = Branch.objects.create(
            name="Test Branch",
            code="TB001"
        )
        self.user = User.objects.create_user(
            username="testuser",
            email="test@test.com",
            password="testpass123",
            branch=self.branch
        )
        
        self.template = WorkflowTemplate.objects.create(
            name="Test Script Workflow",
            trigger_type="manual",
            workflow_definition={'steps': [], 'initial_step': 'step1'},
            owner=self.user,
            branch=self.branch
        )
        
        self.run = WorkflowRun.objects.create(
            template=self.template,
            context={},
            owner=self.user,
            branch=self.branch
        )
        
        self.handler = ScriptStepHandler()
    
    def test_simple_calculation(self):
        """Test simple calculation in script"""
        context = {'amount': 1000}
        
        step = {
            'type': 'script',
            'config': {
                'script': 'result = amount * 1.1',
                'result_variable': 'total'
            }
        }
        
        result = self.handler.execute(step, self.run, context)
        
        self.assertTrue(result['success'])
        self.assertEqual(result['result'], 1100)
        self.assertEqual(context['total'], 1100)
    
    def test_complex_logic(self):
        """Test complex logic in script"""
        context = {'amount': 15000}
        
        step = {
            'type': 'script',
            'config': {
                'script': '''
if amount > 10000:
    result = amount * 0.9  # 10% discount
    status = 'high_value'
else:
    result = amount
    status = 'normal'
''',
                'result_variable': 'calculation'
            }
        }
        
        result = self.handler.execute(step, self.run, context)
        
        self.assertTrue(result['success'])
        # Script handler returns newvars dict with both result and status when multiple variables are set
        if isinstance(result['result'], dict):
            self.assertIn('result', result['result'])
            self.assertIn('status', result['result'])
            self.assertEqual(result['result']['result'], 13500)
            self.assertEqual(result['result']['status'], 'high_value')
        else:
            # If single variable, just check the value
            self.assertEqual(result['result'], 13500)
    
    def test_math_functions(self):
        """Test math functions in script"""
        context = {'value': 16}
        
        step = {
            'type': 'script',
            'config': {
                'script': 'result = math.sqrt(value)',
                'result_variable': 'sqrt_result'
            }
        }
        
        result = self.handler.execute(step, self.run, context)
        
        self.assertTrue(result['success'])
        self.assertEqual(result['result'], 4.0)


@override_settings(SECURE_SSL_REDIRECT=False, SECURE_PROXY_SSL_HEADER=None)
class AggregateStepHandlerTest(TestCase):
    """Test AggregateStepHandler"""
    
    def setUp(self):
        self.branch = Branch.objects.create(
            name="Test Branch",
            code="TB001"
        )
        self.user = User.objects.create_user(
            username="testuser",
            email="test@test.com",
            password="testpass123",
            branch=self.branch
        )
        
        self.template = WorkflowTemplate.objects.create(
            name="Test Aggregate Workflow",
            trigger_type="manual",
            workflow_definition={'steps': [], 'initial_step': 'step1'},
            owner=self.user,
            branch=self.branch
        )
        
        self.run = WorkflowRun.objects.create(
            template=self.template,
            context={},
            owner=self.user,
            branch=self.branch
        )
        
        self.handler = AggregateStepHandler()
    
    def test_sum_aggregate(self):
        """Test sum aggregation"""
        context = {
            'items': [
                {'amount': 100},
                {'amount': 200},
                {'amount': 300}
            ]
        }
        
        step = {
            'type': 'aggregate',
            'config': {
                'collection': '${items}',
                'operations': [
                    {
                        'type': 'sum',
                        'field': 'amount',
                        'result_name': 'total'
                    }
                ]
            }
        }
        
        result = self.handler.execute(step, self.run, context)
        
        self.assertTrue(result['success'])
        self.assertEqual(result['total'], 600)
        self.assertEqual(context['total'], 600)
    
    def test_multiple_aggregates(self):
        """Test multiple aggregate operations"""
        context = {
            'items': [
                {'amount': 100},
                {'amount': 200},
                {'amount': 300},
                {'amount': 400}
            ]
        }
        
        step = {
            'type': 'aggregate',
            'config': {
                'collection': '${items}',
                'operations': [
                    {'type': 'sum', 'field': 'amount', 'result_name': 'total'},
                    {'type': 'avg', 'field': 'amount', 'result_name': 'average'},
                    {'type': 'count', 'result_name': 'count'},
                    {'type': 'min', 'field': 'amount', 'result_name': 'minimum'},
                    {'type': 'max', 'field': 'amount', 'result_name': 'maximum'}
                ]
            }
        }
        
        result = self.handler.execute(step, self.run, context)
        
        self.assertTrue(result['success'])
        self.assertEqual(result['total'], 1000)
        self.assertEqual(result['average'], 250)
        self.assertEqual(result['count'], 4)
        self.assertEqual(result['minimum'], 100)
        self.assertEqual(result['maximum'], 400)
    
    def test_grouped_aggregate(self):
        """Test grouped aggregation"""
        context = {
            'transactions': [
                {'account': 'A', 'amount': 100},
                {'account': 'A', 'amount': 200},
                {'account': 'B', 'amount': 150},
                {'account': 'B', 'amount': 250}
            ]
        }
        
        step = {
            'type': 'aggregate',
            'config': {
                'collection': '${transactions}',
                'group_by': 'account',
                'operations': [
                    {'type': 'sum', 'field': 'amount', 'result_name': 'total'},
                    {'type': 'count', 'result_name': 'count'}
                ]
            }
        }
        
        result = self.handler.execute(step, self.run, context)
        
        self.assertTrue(result['success'])
        self.assertEqual(result['group_count'], 2)
        self.assertIn('grouped_results', result)
        self.assertEqual(result['grouped_results']['A']['total'], 300)
        self.assertEqual(result['grouped_results']['B']['total'], 400)


@override_settings(SECURE_SSL_REDIRECT=False, SECURE_PROXY_SSL_HEADER=None)
class FilterStepHandlerTest(TestCase):
    """Test FilterStepHandler"""
    
    def setUp(self):
        self.branch = Branch.objects.create(
            name="Test Branch",
            code="TB001"
        )
        self.user = User.objects.create_user(
            username="testuser",
            email="test@test.com",
            password="testpass123",
            branch=self.branch
        )
        
        self.template = WorkflowTemplate.objects.create(
            name="Test Filter Workflow",
            trigger_type="manual",
            workflow_definition={'steps': [], 'initial_step': 'step1'},
            owner=self.user,
            branch=self.branch
        )
        
        self.run = WorkflowRun.objects.create(
            template=self.template,
            context={},
            owner=self.user,
            branch=self.branch
        )
        
        self.handler = FilterStepHandler()
    
    def test_simple_filter(self):
        """Test simple filtering"""
        context = {
            'items': [
                {'id': 1, 'amount': 500, 'status': 'active'},
                {'id': 2, 'amount': 1500, 'status': 'active'},
                {'id': 3, 'amount': 2500, 'status': 'inactive'},
                {'id': 4, 'amount': 3500, 'status': 'active'}
            ]
        }
        
        step = {
            'type': 'filter',
            'config': {
                'collection': '${items}',
                'conditions': [
                    {'field': 'amount', 'operator': 'gt', 'value': 1000},
                    {'field': 'status', 'operator': 'eq', 'value': 'active'}
                ],
                'logic': 'AND',
                'result_variable': 'filtered'
            }
        }
        
        result = self.handler.execute(step, self.run, context)
        
        self.assertTrue(result['success'])
        self.assertEqual(result['original_count'], 4)
        self.assertEqual(result['filtered_count'], 2)  # IDs 2 and 4
        self.assertEqual(len(context['filtered']), 2)
    
    def test_filter_with_or_logic(self):
        """Test filtering with OR logic"""
        context = {
            'items': [
                {'id': 1, 'amount': 100},
                {'id': 2, 'amount': 5000},
                {'id': 3, 'amount': 15000}
            ]
        }
        
        step = {
            'type': 'filter',
            'config': {
                'collection': '${items}',
                'conditions': [
                    {'field': 'amount', 'operator': 'lt', 'value': 500},
                    {'field': 'amount', 'operator': 'gt', 'value': 10000}
                ],
                'logic': 'OR',
                'result_variable': 'filtered'
            }
        }
        
        result = self.handler.execute(step, self.run, context)
        
        self.assertTrue(result['success'])
        self.assertEqual(result['filtered_count'], 2)  # IDs 1 and 3
    
    def test_filter_operators(self):
        """Test various filter operators"""
        context = {
            'items': [
                {'name': 'apple'},
                {'name': 'banana'},
                {'name': 'cherry'}
            ]
        }
        
        step = {
            'type': 'filter',
            'config': {
                'collection': '${items}',
                'conditions': [
                    {'field': 'name', 'operator': 'in', 'value': ['apple', 'cherry']}
                ],
                'result_variable': 'filtered'
            }
        }
        
        result = self.handler.execute(step, self.run, context)
        
        self.assertTrue(result['success'])
        self.assertEqual(result['filtered_count'], 2)


@override_settings(SECURE_SSL_REDIRECT=False, SECURE_PROXY_SSL_HEADER=None)
class MapStepHandlerTest(TestCase):
    """Test MapStepHandler"""
    
    def setUp(self):
        self.branch = Branch.objects.create(
            name="Test Branch",
            code="TB001"
        )
        self.user = User.objects.create_user(
            username="testuser",
            email="test@test.com",
            password="testpass123",
            branch=self.branch
        )
        
        self.template = WorkflowTemplate.objects.create(
            name="Test Map Workflow",
            trigger_type="manual",
            workflow_definition={'steps': [], 'initial_step': 'step1'},
            owner=self.user,
            branch=self.branch
        )
        
        self.run = WorkflowRun.objects.create(
            template=self.template,
            context={},
            owner=self.user,
            branch=self.branch
        )
        
        self.handler = MapStepHandler()
    
    def test_simple_map(self):
        """Test simple mapping transformation"""
        context = {
            'users': [
                {'id': 1, 'first_name': 'John', 'last_name': 'Doe', 'amount': 100},
                {'id': 2, 'first_name': 'Jane', 'last_name': 'Smith', 'amount': 200}
            ]
        }
        
        step = {
            'type': 'map',
            'config': {
                'collection': '${users}',
                'transform': {
                    'id': '${item.id}',
                    'full_name': '${item.first_name} ${item.last_name}',
                    'amount_with_tax': '${item.amount * 1.1}'
                },
                'result_variable': 'transformed'
            }
        }
        
        result = self.handler.execute(step, self.run, context)
        
        self.assertTrue(result['success'])
        self.assertEqual(result['item_count'], 2)
        
        transformed = context['transformed']
        self.assertEqual(transformed[0]['full_name'], 'John Doe')
        self.assertEqual(transformed[1]['full_name'], 'Jane Smith')
        self.assertAlmostEqual(float(transformed[0]['amount_with_tax']), 110.0)
    
    def test_map_with_static_values(self):
        """Test mapping with static values"""
        context = {
            'items': [
                {'id': 1},
                {'id': 2}
            ]
        }
        
        step = {
            'type': 'map',
            'config': {
                'collection': '${items}',
                'transform': {
                    'id': '${item.id}',
                    'status': 'processed',  # Static value
                    'version': 1
                },
                'result_variable': 'transformed'
            }
        }
        
        result = self.handler.execute(step, self.run, context)
        
        self.assertTrue(result['success'])
        transformed = context['transformed']
        self.assertEqual(transformed[0]['status'], 'processed')
        self.assertEqual(transformed[0]['version'], 1)
