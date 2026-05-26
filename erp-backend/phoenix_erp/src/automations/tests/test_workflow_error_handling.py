# automations/tests/test_workflow_error_handling.py
"""
Comprehensive error handling and edge case tests for workflow system
Tests that the system gracefully handles errors and edge cases
"""
from django.test import TestCase
from django.contrib.auth import get_user_model
from decimal import Decimal
from datetime import date

from automations.models import WorkflowTemplate, WorkflowRun
from automations.workflow_executor import WorkflowExecutor
from branches.models import Branch
from accounts.models import Account, AccountCategory
from transactions.models import TransactionSeries

User = get_user_model()


class WorkflowErrorHandlingTest(TestCase):
    """Test error handling in workflow execution"""
    
    def setUp(self):
        """Create test data"""
        self.user = User.objects.create_user(
            username='testuser',
            email='test@test.com',
            password='testpass123'
        )
        
        self.branch = Branch.objects.create(
            name='Main Branch',
            code='MAIN',
            is_active=True
        )
        
        # Create account category and account for transaction tests
        self.category = AccountCategory.objects.create(
            section=1,
            name='Assets',
            owner=self.user,
            branch=self.branch
        )
        
        self.account = Account.objects.create(
            code='100',
            name='Cash',
            account_type=Account.ASSET,
            account_level=Account.LEVEL_PARENT,
            category=self.category,
            branch=self.branch,
            owner=self.user
        )
        
        self.series = TransactionSeries.objects.create(
            code='TXN',
            description='Transactions'
        )
    
    def test_calculation_with_division_by_zero(self):
        """Test: Calculation step handles division by zero gracefully"""
        workflow_def = {
            "steps": [
                {
                    "id": "divide",
                    "name": "Divide",
                    "type": "calculation",
                    "config": {
                        "formula": "${amount} / ${divisor}",
                        "result_name": "result"
                    }
                }
            ],
            "initial_step": "divide"
        }
        
        template = WorkflowTemplate.objects.create(
            name="Division Test",
            trigger_type="manual",
            workflow_definition=workflow_def,
            owner=self.user,
            branch=self.branch
        )
        
        run = WorkflowRun.objects.create(
            template=template,
            context={
                'amount': 100,
                'divisor': 0  # Division by zero!
            },
            owner=self.user,
            branch=self.branch,
            current_step_id='divide'
        )
        
        executor = WorkflowExecutor(run)
        success = executor.execute()
        
        run.refresh_from_db()
        self.assertFalse(success)
        self.assertEqual(run.status, 'failed')
        self.assertIn('error', run.context)
    
    def test_calculation_with_invalid_syntax(self):
        """Test: Calculation step handles invalid formula syntax"""
        workflow_def = {
            "steps": [
                {
                    "id": "calc",
                    "name": "Bad Calculation",
                    "type": "calculation",
                    "config": {
                        "formula": "${amount} ++ ${tax}",  # Invalid syntax
                        "result_name": "result"
                    }
                }
            ],
            "initial_step": "calc"
        }
        
        template = WorkflowTemplate.objects.create(
            name="Invalid Formula Test",
            trigger_type="manual",
            workflow_definition=workflow_def,
            owner=self.user,
            branch=self.branch
        )
        
        run = WorkflowRun.objects.create(
            template=template,
            context={'amount': 100, 'tax': 10},
            owner=self.user,
            branch=self.branch,
            current_step_id='calc'
        )
        
        executor = WorkflowExecutor(run)
        success = executor.execute()
        
        run.refresh_from_db()
        self.assertFalse(success)
        self.assertEqual(run.status, 'failed')
    
    def test_missing_variable_reference(self):
        """Test: Variable resolution fails gracefully when variable doesn't exist"""
        workflow_def = {
            "steps": [
                {
                    "id": "calc",
                    "name": "Calculate",
                    "type": "calculation",
                    "config": {
                        "formula": "${missing_variable} * 2",
                        "result_name": "result"
                    }
                }
            ],
            "initial_step": "calc"
        }
        
        template = WorkflowTemplate.objects.create(
            name="Missing Variable Test",
            trigger_type="manual",
            workflow_definition=workflow_def,
            owner=self.user,
            branch=self.branch
        )
        
        run = WorkflowRun.objects.create(
            template=template,
            context={},  # Empty context - no variables
            owner=self.user,
            branch=self.branch,
            current_step_id='calc'
        )
        
        executor = WorkflowExecutor(run)
        success = executor.execute()
        
        run.refresh_from_db()
        self.assertFalse(success)
        self.assertEqual(run.status, 'failed')
    
    def test_condition_with_invalid_comparison(self):
        """Test: Condition step handles invalid comparisons"""
        workflow_def = {
            "steps": [
                {
                    "id": "check",
                    "name": "Check Value",
                    "type": "condition",
                    "config": {
                        "field": "value",
                        "operator": "invalid_op",  # Invalid operator
                        "value": 100
                    },
                    "on_true": None,
                    "on_false": None
                }
            ],
            "initial_step": "check"
        }
        
        template = WorkflowTemplate.objects.create(
            name="Invalid Condition Test",
            trigger_type="manual",
            workflow_definition=workflow_def,
            owner=self.user,
            branch=self.branch
        )
        
        run = WorkflowRun.objects.create(
            template=template,
            context={'value': 50},
            owner=self.user,
            branch=self.branch,
            current_step_id='check'
        )
        
        executor = WorkflowExecutor(run)
        success = executor.execute()
        
        run.refresh_from_db()
        self.assertFalse(success)
        self.assertEqual(run.status, 'failed')
    
    def test_script_with_security_violation(self):
        """Test: Script step blocks dangerous operations"""
        workflow_def = {
            "steps": [
                {
                    "id": "dangerous",
                    "name": "Dangerous Script",
                    "type": "script",
                    "config": {
                        "code": "import os; os.system('rm -rf /')",  # Should be blocked
                        "timeout": 5
                    }
                }
            ],
            "initial_step": "dangerous"
        }
        
        template = WorkflowTemplate.objects.create(
            name="Security Test",
            trigger_type="manual",
            workflow_definition=workflow_def,
            owner=self.user,
            branch=self.branch
        )
        
        run = WorkflowRun.objects.create(
            template=template,
            context={},
            owner=self.user,
            branch=self.branch,
            current_step_id='dangerous'
        )
        
        executor = WorkflowExecutor(run)
        success = executor.execute()
        
        run.refresh_from_db()
        # Script should fail due to security restrictions
        self.assertFalse(success)
        self.assertEqual(run.status, 'failed')
    
    def test_validation_with_empty_data(self):
        """Test: Validation step handles empty/null data"""
        workflow_def = {
            "steps": [
                {
                    "id": "validate",
                    "name": "Validate",
                    "type": "validation",
                    "config": {
                        "validations": [
                            {
                                "field": "amount",
                                "rule": "required"
                            }
                        ]
                    }
                }
            ],
            "initial_step": "validate"
        }
        
        template = WorkflowTemplate.objects.create(
            name="Empty Data Test",
            trigger_type="manual",
            workflow_definition=workflow_def,
            owner=self.user,
            branch=self.branch
        )
        
        # Test with missing field
        run = WorkflowRun.objects.create(
            template=template,
            context={},  # No amount field
            owner=self.user,
            branch=self.branch,
            current_step_id='validate'
        )
        
        executor = WorkflowExecutor(run)
        success = executor.execute()
        
        run.refresh_from_db()
        self.assertFalse(success)
        self.assertIn('validation', run.context.get('error', '').lower())
    
    def test_filter_with_invalid_collection(self):
        """Test: Filter step handles non-collection data"""
        workflow_def = {
            "steps": [
                {
                    "id": "filter",
                    "name": "Filter Items",
                    "type": "filter",
                    "config": {
                        "collection": "${items}",
                        "conditions": [
                            {
                                "field": "status",
                                "operator": "eq",
                                "value": "active"
                            }
                        ],
                        "result_variable": "filtered"
                    }
                }
            ],
            "initial_step": "filter"
        }
        
        template = WorkflowTemplate.objects.create(
            name="Invalid Filter Test",
            trigger_type="manual",
            workflow_definition=workflow_def,
            owner=self.user,
            branch=self.branch
        )
        
        run = WorkflowRun.objects.create(
            template=template,
            context={
                'items': "not a list"  # String instead of list
            },
            owner=self.user,
            branch=self.branch,
            current_step_id='filter'
        )
        
        executor = WorkflowExecutor(run)
        success = executor.execute()
        
        run.refresh_from_db()
        self.assertFalse(success)
        self.assertEqual(run.status, 'failed')
    
    def test_aggregate_with_non_numeric_field(self):
        """Test: Aggregate step handles non-numeric data for sum/avg"""
        workflow_def = {
            "steps": [
                {
                    "id": "aggregate",
                    "name": "Calculate Total",
                    "type": "aggregate",
                    "config": {
                        "collection": "${items}",
                        "operations": [
                            {
                                "type": "sum",
                                "field": "name",  # String field!
                                "result_name": "total"
                            }
                        ]
                    }
                }
            ],
            "initial_step": "aggregate"
        }
        
        template = WorkflowTemplate.objects.create(
            name="Invalid Aggregate Test",
            trigger_type="manual",
            workflow_definition=workflow_def,
            owner=self.user,
            branch=self.branch
        )
        
        run = WorkflowRun.objects.create(
            template=template,
            context={
                'items': [
                    {'name': 'Item 1'},
                    {'name': 'Item 2'}
                ]
            },
            owner=self.user,
            branch=self.branch,
            current_step_id='aggregate'
        )
        
        executor = WorkflowExecutor(run)
        success = executor.execute()
        
        run.refresh_from_db()
        self.assertFalse(success)
        self.assertEqual(run.status, 'failed')
    
    def test_transaction_with_unbalanced_entries(self):
        """Test: Transaction step validates debits = credits"""
        workflow_def = {
            "steps": [
                {
                    "id": "create_txn",
                    "name": "Create Transaction",
                    "type": "transaction",
                    "config": {
                        "transaction_type": "journal",
                        "description": "Unbalanced Transaction",
                        "date": str(date.today()),
                        "entries": [
                            {
                                "account_id": self.account.id,
                                "side": "DR",
                                "amount": 1000
                            },
                            {
                                "account_id": self.account.id,
                                "side": "CR",
                                "amount": 500  # Doesn't balance!
                            }
                        ]
                    }
                }
            ],
            "initial_step": "create_txn"
        }
        
        template = WorkflowTemplate.objects.create(
            name="Unbalanced Transaction Test",
            trigger_type="manual",
            workflow_definition=workflow_def,
            owner=self.user,
            branch=self.branch
        )
        
        run = WorkflowRun.objects.create(
            template=template,
            context={},
            owner=self.user,
            branch=self.branch,
            current_step_id='create_txn'
        )
        
        executor = WorkflowExecutor(run)
        success = executor.execute()
        
        run.refresh_from_db()
        self.assertFalse(success)
        self.assertIn('balance', run.context.get('error', '').lower())
    
    def test_loop_with_excessive_iterations(self):
        """Test: Loop step respects max_iterations limit"""
        workflow_def = {
            "steps": [
                {
                    "id": "loop",
                    "name": "Process Items",
                    "type": "loop",
                    "config": {
                        "collection": "${items}",
                        "max_iterations": 5,
                        "steps": [
                            {
                                "type": "variable",
                                "config": {
                                    "mode": "set",
                                    "variables": {"processed": "true"}
                                }
                            }
                        ]
                    }
                }
            ],
            "initial_step": "loop"
        }
        
        template = WorkflowTemplate.objects.create(
            name="Loop Limit Test",
            trigger_type="manual",
            workflow_definition=workflow_def,
            owner=self.user,
            branch=self.branch
        )
        
        run = WorkflowRun.objects.create(
            template=template,
            context={
                'items': list(range(100))  # 100 items, limit is 5
            },
            owner=self.user,
            branch=self.branch,
            current_step_id='loop'
        )
        
        executor = WorkflowExecutor(run)
        success = executor.execute()
        
        run.refresh_from_db()
        self.assertFalse(success)
        self.assertIn('max_iterations', run.context.get('error', '').lower())
    
    def test_workflow_max_steps_exceeded(self):
        """Test: Workflow execution stops after max_steps to prevent infinite loops"""
        # Create a workflow with a loop back to itself
        workflow_def = {
            "steps": [
                {
                    "id": "step1",
                    "name": "Step 1",
                    "type": "variable",
                    "config": {
                        "mode": "set",
                        "variables": {"counter": "${counter + 1}"}
                    },
                    "next": "step1"  # Loop back to itself!
                }
            ],
            "initial_step": "step1",
            "max_steps": 10
        }
        
        template = WorkflowTemplate.objects.create(
            name="Infinite Loop Test",
            trigger_type="manual",
            workflow_definition=workflow_def,
            max_steps=10,
            owner=self.user,
            branch=self.branch
        )
        
        run = WorkflowRun.objects.create(
            template=template,
            context={'counter': 0},
            owner=self.user,
            branch=self.branch,
            current_step_id='step1'
        )
        
        executor = WorkflowExecutor(run)
        success = executor.execute()
        
        run.refresh_from_db()
        self.assertFalse(success)
        self.assertEqual(run.status, 'failed')
        self.assertIn('max_steps', run.context.get('error', '').lower())


class WorkflowEdgeCaseTest(TestCase):
    """Test edge cases in workflow execution"""
    
    def setUp(self):
        """Create test data"""
        self.user = User.objects.create_user(
            username='testuser',
            email='test@test.com',
            password='testpass123'
        )
        
        self.branch = Branch.objects.create(
            name='Main Branch',
            code='MAIN',
            is_active=True
        )
    
    def test_empty_workflow(self):
        """Test: Workflow with no steps completes immediately"""
        workflow_def = {
            "steps": [],
            "initial_step": None
        }
        
        template = WorkflowTemplate.objects.create(
            name="Empty Workflow",
            trigger_type="manual",
            workflow_definition=workflow_def,
            owner=self.user,
            branch=self.branch
        )
        
        run = WorkflowRun.objects.create(
            template=template,
            context={},
            owner=self.user,
            branch=self.branch
        )
        
        executor = WorkflowExecutor(run)
        success = executor.execute()
        
        run.refresh_from_db()
        self.assertTrue(success)
        self.assertEqual(run.status, 'completed')
    
    def test_condition_with_null_value(self):
        """Test: Condition handles null/None values correctly"""
        workflow_def = {
            "steps": [
                {
                    "id": "check",
                    "name": "Check Null",
                    "type": "condition",
                    "config": {
                        "field": "value",
                        "operator": "eq",
                        "value": None
                    },
                    "on_true": None,
                    "on_false": None
                }
            ],
            "initial_step": "check"
        }
        
        template = WorkflowTemplate.objects.create(
            name="Null Value Test",
            trigger_type="manual",
            workflow_definition=workflow_def,
            owner=self.user,
            branch=self.branch
        )
        
        run = WorkflowRun.objects.create(
            template=template,
            context={'value': None},
            owner=self.user,
            branch=self.branch,
            current_step_id='check'
        )
        
        executor = WorkflowExecutor(run)
        success = executor.execute()
        
        run.refresh_from_db()
        self.assertTrue(success)
        self.assertEqual(run.status, 'completed')
    
    def test_calculation_with_very_large_numbers(self):
        """Test: Calculation handles very large numbers correctly"""
        workflow_def = {
            "steps": [
                {
                    "id": "calc",
                    "name": "Large Number Calculation",
                    "type": "calculation",
                    "config": {
                        "formula": "${large_number} * 2",
                        "result_name": "result"
                    }
                }
            ],
            "initial_step": "calc"
        }
        
        template = WorkflowTemplate.objects.create(
            name="Large Number Test",
            trigger_type="manual",
            workflow_definition=workflow_def,
            owner=self.user,
            branch=self.branch
        )
        
        run = WorkflowRun.objects.create(
            template=template,
            context={'large_number': 10**18},  # Very large number
            owner=self.user,
            branch=self.branch,
            current_step_id='calc'
        )
        
        executor = WorkflowExecutor(run)
        success = executor.execute()
        
        run.refresh_from_db()
        self.assertTrue(success)
        self.assertEqual(run.context['result'], 2 * 10**18)
    
    def test_map_with_empty_collection(self):
        """Test: Map step handles empty collections"""
        workflow_def = {
            "steps": [
                {
                    "id": "transform",
                    "name": "Transform Data",
                    "type": "map",
                    "config": {
                        "collection": "${items}",
                        "transformations": {
                            "name": "${name}",
                            "value": "${value}"
                        },
                        "result_variable": "transformed"
                    }
                }
            ],
            "initial_step": "transform"
        }
        
        template = WorkflowTemplate.objects.create(
            name="Empty Map Test",
            trigger_type="manual",
            workflow_definition=workflow_def,
            owner=self.user,
            branch=self.branch
        )
        
        run = WorkflowRun.objects.create(
            template=template,
            context={'items': []},  # Empty list
            owner=self.user,
            branch=self.branch,
            current_step_id='transform'
        )
        
        executor = WorkflowExecutor(run)
        success = executor.execute()
        
        run.refresh_from_db()
        self.assertTrue(success)
        self.assertEqual(run.context['transformed'], [])
    
    def test_aggregate_with_empty_collection(self):
        """Test: Aggregate step handles empty collections"""
        workflow_def = {
            "steps": [
                {
                    "id": "aggregate",
                    "name": "Calculate Stats",
                    "type": "aggregate",
                    "config": {
                        "collection": "${items}",
                        "operations": [
                            {
                                "type": "sum",
                                "field": "amount",
                                "result_name": "total"
                            },
                            {
                                "type": "count",
                                "result_name": "count"
                            },
                            {
                                "type": "avg",
                                "field": "amount",
                                "result_name": "average"
                            }
                        ]
                    }
                }
            ],
            "initial_step": "aggregate"
        }
        
        template = WorkflowTemplate.objects.create(
            name="Empty Aggregate Test",
            trigger_type="manual",
            workflow_definition=workflow_def,
            owner=self.user,
            branch=self.branch
        )
        
        run = WorkflowRun.objects.create(
            template=template,
            context={'items': []},  # Empty list
            owner=self.user,
            branch=self.branch,
            current_step_id='aggregate'
        )
        
        executor = WorkflowExecutor(run)
        success = executor.execute()
        
        run.refresh_from_db()
        self.assertTrue(success)
        self.assertEqual(run.context['total'], 0)
        self.assertEqual(run.context['count'], 0)
        # Average of empty list should be 0 or None
        self.assertIn(run.context.get('average'), [0, None])
