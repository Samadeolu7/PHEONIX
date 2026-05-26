"""
Integration tests for complete workflow execution
Tests end-to-end workflow scenarios with multiple steps
"""
from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from decimal import Decimal

from automations.models import WorkflowTemplate, WorkflowRun
from automations.workflow_executor import WorkflowExecutor, WorkflowTestExecutor
from branches.models import Branch
from users.models import Tenant

User = get_user_model()


@override_settings(SECURE_SSL_REDIRECT=False, SECURE_PROXY_SSL_HEADER=None)
class WorkflowExecutionIntegrationTest(TestCase):
    """Integration tests for complete workflow execution"""
    
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
    
    def test_simple_workflow_with_calculation_and_condition(self):
        """Test workflow with calculation and condition steps"""
        steps = [
            {
                'id': 'calc_tax',
                'type': 'calculation',
                'config': {
                    'formula': '${amount} * 0.1',
                    'result_name': 'tax'
                },
                'next': 'check_amount'
            },
            {
                'id': 'check_amount',
                'type': 'condition',
                'config': {
                    'logic': 'AND',
                    'conditions': [
                        {'field': '${amount}', 'operator': 'gt', 'value': 1000}
                    ],
                    'on_true': 'high_value',
                    'on_false': 'low_value'
                }
            },
            {
                'id': 'high_value',
                'type': 'variable',
                'config': {
                    'mode': 'set',
                    'variables': {
                        'category': 'high',
                        'requires_approval': True
                    }
                }
            },
            {
                'id': 'low_value',
                'type': 'variable',
                'config': {
                    'mode': 'set',
                    'variables': {
                        'category': 'low',
                        'requires_approval': False
                    }
                }
            }
        ]
        
        template = WorkflowTemplate.objects.create(
            name="Tax Calculation Workflow",
            trigger_type="manual",
            workflow_definition={'steps': steps, 'initial_step': steps[0]['id'] if steps else 'step1'},
            owner=self.user,
            branch=self.branch
        )
        
        # Test with high value
        run = WorkflowRun.objects.create(
            template=template,
            context={'amount': 5000},
            owner=self.user,
            branch=self.branch,
            current_step_id='calc_tax'
        )
        
        executor = WorkflowExecutor(run)
        success = executor.execute()
        
        self.assertTrue(success)
        run.refresh_from_db()
        self.assertEqual(run.status, 'completed')
        self.assertIn('category', run.context)
        self.assertEqual(run.context['category'], 'high')
    
    def test_workflow_with_loop_and_aggregate(self):
        """Test workflow with loop over collection and aggregation"""
        steps = [
            {
                'id': 'apply_discount',
                'type': 'loop',
                'config': {
                    'collection': '${items}',
                    'item_variable': 'item',
                    'steps': [
                        {
                            'type': 'calculation',
                            'config': {
                                'formula': '${item.price} * 0.9',
                                'result_name': 'discounted_price'
                            }
                        }
                    ]
                },
                'next': 'calculate_total'
            },
            {
                'id': 'calculate_total',
                'type': 'aggregate',
                'config': {
                    'collection': '${items}',
                    'operations': [
                        {'type': 'sum', 'field': 'price', 'result_name': 'total'},
                        {'type': 'count', 'result_name': 'item_count'}
                    ]
                }
            }
        ]
        
        template = WorkflowTemplate.objects.create(
            name="Discount and Total Workflow",
            trigger_type="manual",
            workflow_definition={'steps': steps, 'initial_step': steps[0]['id'] if steps else 'step1'},
            owner=self.user,
            branch=self.branch
        )
        
        run = WorkflowRun.objects.create(
            template=template,
            context={
                'items': [
                    {'id': 1, 'price': 100},
                    {'id': 2, 'price': 200},
                    {'id': 3, 'price': 300}
                ]
            },
            owner=self.user,
            branch=self.branch,
            current_step_id='apply_discount'
        )
        
        executor = WorkflowExecutor(run)
        success = executor.execute()
        
        self.assertTrue(success)
        run.refresh_from_db()
        self.assertEqual(run.status, 'completed')
        self.assertEqual(run.context['total'], 600)
        self.assertEqual(run.context['item_count'], 3)
    
    def test_workflow_with_validation_and_script(self):
        """Test workflow with validation followed by script execution"""
        steps = [
            {
                'id': 'validate_input',
                'type': 'validation',
                'config': {
                    'validations': [
                        {
                            'field': '${amount}',
                            'rules': ['required', 'numeric', {'min': 0}]
                        },
                        {
                            'field': '${email}',
                            'rules': ['required', 'email']
                        }
                    ],
                    'fail_on_error': True
                },
                'next': 'process_data'
            },
            {
                'id': 'process_data',
                'type': 'script',
                'config': {
                    'script': '''
result = {
    'processed_amount': amount * 1.1,
    'fee': amount * 0.02,
    'total': amount * 1.12
}
''',
                    'result_variable': 'calculation_result'
                }
            }
        ]
        
        template = WorkflowTemplate.objects.create(
            name="Validation and Processing Workflow",
            trigger_type="manual",
            workflow_definition={'steps': steps, 'initial_step': steps[0]['id'] if steps else 'step1'},
            owner=self.user,
            branch=self.branch
        )
        
        # Test with valid data
        run = WorkflowRun.objects.create(
            template=template,
            context={
                'amount': 1000,
                'email': 'test@example.com'
            },
            owner=self.user,
            branch=self.branch,
            current_step_id='validate_input'
        )
        
        executor = WorkflowExecutor(run)
        success = executor.execute()
        
        self.assertTrue(success)
        run.refresh_from_db()
        self.assertEqual(run.status, 'completed')
        self.assertIn('calculation_result', run.context)
    
    def test_workflow_with_filter_and_map(self):
        """Test workflow with filter followed by map transformation"""
        steps = [
            {
                'id': 'filter_active',
                'type': 'filter',
                'config': {
                    'collection': '${users}',
                    'conditions': [
                        {'field': 'status', 'operator': 'eq', 'value': 'active'},
                        {'field': 'balance', 'operator': 'gt', 'value': 0}
                    ],
                    'logic': 'AND',
                    'result_variable': 'active_users'
                },
                'next': 'transform_users'
            },
            {
                'id': 'transform_users',
                'type': 'map',
                'config': {
                    'collection': '${active_users}',
                    'transform': {
                        'id': '${item.id}',
                        'name': '${item.first_name} ${item.last_name}',
                        'balance_with_interest': '${item.balance * 1.05}'
                    },
                    'result_variable': 'processed_users'
                }
            }
        ]
        
        template = WorkflowTemplate.objects.create(
            name="Filter and Transform Users",
            trigger_type="manual",
            workflow_definition={'steps': steps, 'initial_step': steps[0]['id'] if steps else 'step1'},
            owner=self.user,
            branch=self.branch
        )
        
        run = WorkflowRun.objects.create(
            template=template,
            context={
                'users': [
                    {'id': 1, 'first_name': 'John', 'last_name': 'Doe', 'status': 'active', 'balance': 1000},
                    {'id': 2, 'first_name': 'Jane', 'last_name': 'Smith', 'status': 'inactive', 'balance': 500},
                    {'id': 3, 'first_name': 'Bob', 'last_name': 'Johnson', 'status': 'active', 'balance': 0},
                    {'id': 4, 'first_name': 'Alice', 'last_name': 'Williams', 'status': 'active', 'balance': 2000}
                ]
            },
            owner=self.user,
            branch=self.branch,
            current_step_id='filter_active'
        )
        
        executor = WorkflowExecutor(run)
        success = executor.execute()
        
        self.assertTrue(success)
        run.refresh_from_db()
        self.assertEqual(run.status, 'completed')
        
        # Should have 2 users (IDs 1 and 4 - active with positive balance)
        processed_users = run.context.get('processed_users', [])
        self.assertEqual(len(processed_users), 2)
        self.assertIn('name', processed_users[0])
        self.assertIn('balance_with_interest', processed_users[0])
    
    def test_complex_multi_branch_workflow(self):
        """Test complex workflow with multiple branches and conditions"""
        steps = [
            {
                'id': 'validate',
                'type': 'validation',
                'config': {
                    'validations': [
                        {'field': '${amount}', 'rules': ['required', 'numeric']}
                    ]
                },
                'next': 'calculate'
            },
            {
                'id': 'calculate',
                'type': 'calculation',
                'config': {
                    'formula': '${amount} * 1.1',
                    'result_name': 'total'
                },
                'next': 'check_threshold'
            },
            {
                'id': 'check_threshold',
                'type': 'condition',
                'config': {
                    'conditions': [
                        {'field': '${total}', 'operator': 'gt', 'value': 10000}
                    ],
                    'on_true': 'high_processing',
                    'on_false': 'normal_processing'
                }
            },
            {
                'id': 'high_processing',
                'type': 'script',
                'config': {
                    'script': '''
result = {
    'category': 'high',
    'discount': total * 0.05,
    'final_amount': total * 0.95
}
''',
                    'result_variable': 'processing_result'
                }
            },
            {
                'id': 'normal_processing',
                'type': 'variable',
                'config': {
                    'mode': 'set',
                    'variables': {
                        'category': 'normal',
                        'discount': 0,
                        'final_amount': '${total}'
                    }
                }
            }
        ]
        
        template = WorkflowTemplate.objects.create(
            name="Complex Processing Workflow",
            trigger_type="manual",
            workflow_definition={'steps': steps, 'initial_step': steps[0]['id'] if steps else 'step1'},
            owner=self.user,
            branch=self.branch
        )
        
        # Test high value path
        run_high = WorkflowRun.objects.create(
            template=template,
            context={'amount': 15000},
            owner=self.user,
            branch=self.branch,
            current_step_id='validate'
        )
        
        executor = WorkflowExecutor(run_high)
        success = executor.execute()
        
        self.assertTrue(success)
        run_high.refresh_from_db()
        self.assertEqual(run_high.status, 'completed')
        self.assertIn('processing_result', run_high.context)
        
        # Test normal value path
        run_normal = WorkflowRun.objects.create(
            template=template,
            context={'amount': 5000},
            owner=self.user,
            branch=self.branch,
            current_step_id='validate'
        )
        
        executor = WorkflowExecutor(run_normal)
        success = executor.execute()
        
        self.assertTrue(success)
        run_normal.refresh_from_db()
        self.assertEqual(run_normal.status, 'completed')
        self.assertEqual(run_normal.context.get('category'), 'normal')


@override_settings(SECURE_SSL_REDIRECT=False, SECURE_PROXY_SSL_HEADER=None)
class WorkflowTestExecutorTest(TestCase):
    """Test the WorkflowTestExecutor for workflow testing"""
    
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
    
    def test_test_executor_basic(self):
        """Test basic workflow execution in test mode"""
        steps = [
            {
                'id': 'calc',
                'type': 'calculation',
                'config': {
                    'formula': '${amount} * 1.1',
                    'result_name': 'total'
                }
            }
        ]
        
        context = {'amount': 1000}
        
        executor = WorkflowTestExecutor(steps, context, self.user, self.branch)
        result = executor.execute()
        
        self.assertTrue(result['success'])
        self.assertEqual(len(result['step_results']), 1)
    
    def test_test_executor_with_validation(self):
        """Test workflow validation in test mode"""
        steps = [
            {
                'id': 'validate',
                'type': 'validation',
                'config': {
                    'validations': [
                        {'field': '${amount}', 'rules': ['required', 'numeric']}
                    ]
                }
            }
        ]
        
        context = {'amount': 'invalid'}  # Invalid data
        
        executor = WorkflowTestExecutor(steps, context, self.user, self.branch)
        result = executor.execute()
        
        # Should complete but show validation error
        self.assertIn('step_results', result)


class WorkflowBindingFieldTestCase(TestCase):
    """Test WorkflowBinding model field correctness"""
    
    def setUp(self):
        """Set up test data"""
        from clients.models import Client
        from accounts.models import Account
        from automations.models import FormSchema, WorkflowBinding
        
        # Create tenant for owner
        self.tenant = Tenant.objects.create(
            name='Field Test Organization',
            slug='fieldtest'
        )
        
        self.owner = User.objects.create_user(
            username='owner_field_test',
            email='owner_field@test.com',
            password='testpass123',
            tenant=self.tenant
        )
        
        self.branch = Branch.objects.create(
            name='Test Branch Fields',
            code='TBF'
        )
        
        # Create form schema
        self.form_schema = FormSchema.objects.create(
            name='Test Form Schema',
            description='Test form for field validation',
            schema={'fields': []},
            trigger_event_name='invoice_created',
            owner=self.owner,
            branch=self.branch
        )
        
        # Create workflow template
        self.workflow_template = WorkflowTemplate.objects.create(
            name='Test Workflow Template',
            description='Test workflow',
            workflow_type='master_template',
            workflow_definition={'steps': []},
            trigger_type='manual',
            owner=self.owner,
            branch=self.branch,
            created_by=self.owner
        )
        
        # Create workflow binding
        self.binding = WorkflowBinding.objects.create(
            form_schema=self.form_schema,
            workflow_template=self.workflow_template,
            parameters={'test': 'param'},
            priority=1,
            is_active=True,
            owner=self.owner,
            branch=self.branch
        )
    
    def test_workflow_binding_has_no_trigger_event_field(self):
        """Test WorkflowBinding does NOT have trigger_event field"""
        from automations.models import WorkflowBinding
        
        # Get field names
        field_names = [f.name for f in WorkflowBinding._meta.get_fields()]
        
        # Verify trigger_event is NOT in fields
        self.assertNotIn('trigger_event', field_names)
        
        # Verify correct fields ARE present
        self.assertIn('form_schema', field_names)
        self.assertIn('workflow_template', field_names)
    
    def test_form_schema_has_trigger_event_name_field(self):
        """Test FormSchema HAS trigger_event_name field"""
        from automations.models import FormSchema
        
        # Get field names
        field_names = [f.name for f in FormSchema._meta.get_fields()]
        
        # Verify trigger_event_name IS in fields
        self.assertIn('trigger_event_name', field_names)
    
    def test_correct_workflow_binding_query_pattern(self):
        """Test correct query pattern for WorkflowBinding"""
        from automations.models import WorkflowBinding
        
        # CORRECT pattern - query through form_schema relationship
        bindings = WorkflowBinding.objects.filter(
            form_schema__trigger_event_name='invoice_created',
            is_active=True
        ).select_related('workflow_template', 'form_schema')
        
        # Should work without error
        self.assertEqual(bindings.count(), 1)
        self.assertEqual(bindings.first(), self.binding)
    
    def test_incorrect_query_pattern_raises_error(self):
        """Test incorrect query pattern raises FieldError"""
        from automations.models import WorkflowBinding
        from django.core.exceptions import FieldError
        
        # INCORRECT pattern - trigger_event doesn't exist
        with self.assertRaises(FieldError) as context:
            list(WorkflowBinding.objects.filter(
                trigger_event='invoice_created',
                is_active=True
            ))
        
        # Error should mention trigger_event
        self.assertIn('trigger_event', str(context.exception))
    
    def test_workflow_run_creation_with_binding(self):
        """Test WorkflowRun can be created with binding reference"""
        from automations.models import WorkflowRun
        
        # Create WorkflowRun with binding
        run = WorkflowRun.objects.create(
            template=self.workflow_template,
            binding=self.binding,
            context={
                'event_name': 'invoice_created',
                'entity_type': 'Invoice',
                'entity_id': 123
            },
            status='queued',
            owner=self.owner,
            branch=self.branch,
            created_by=self.owner
        )
        
        # Verify fields
        self.assertEqual(run.template, self.workflow_template)
        self.assertEqual(run.binding, self.binding)
        self.assertIn('event_name', run.context)
        
        # Verify old fields don't exist
        field_names = [f.name for f in WorkflowRun._meta.get_fields()]
        self.assertNotIn('trigger_event', field_names)
        self.assertNotIn('trigger_entity_type', field_names)
        self.assertNotIn('trigger_entity_id', field_names)


class WorkflowSignalIntegrationTestCase(TestCase):
    """Test workflow signal integration with correct field usage"""
    
    def setUp(self):
        """Set up test data"""
        # Create tenant for owner
        self.tenant = Tenant.objects.create(
            name='Signal Test Organization',
            slug='signaltest'
        )
        
        self.owner = User.objects.create_user(
            username='owner_signal_test',
            email='owner_signal@test.com',
            password='testpass123',
            tenant=self.tenant
        )
        
        self.branch = Branch.objects.create(
            name='Signal Test Branch',
            code='STB'
        )
    
    def test_trigger_workflow_function_uses_correct_query(self):
        """Test trigger_workflow_for_event uses correct query pattern"""
        from incomes.signals import trigger_workflow_for_event
        import inspect
        
        # Get function source
        source = inspect.getsource(trigger_workflow_for_event)
        
        # Verify it uses form_schema__trigger_event_name
        self.assertIn('form_schema__trigger_event_name', source)
        
        # Verify it doesn't use old trigger_event field
        # (it might appear in strings/comments, but not in filter)
        lines = source.split('\n')
        filter_lines = [line for line in lines if 'WorkflowBinding.objects.filter' in line]
        
        # If there are filter lines, check they don't use trigger_event=
        for line in filter_lines:
            # Get the next few lines after filter
            start_idx = lines.index(line)
            filter_block = '\n'.join(lines[start_idx:start_idx+10])
            
            # Should not have trigger_event= in filter parameters
            if 'trigger_event=' in filter_block and 'form_schema__trigger_event_name' not in filter_block:
                self.fail("Found trigger_event= without form_schema__ prefix in workflow binding query")

