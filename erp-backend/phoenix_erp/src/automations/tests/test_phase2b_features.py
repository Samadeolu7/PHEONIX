# automations/tests/test_phase2b_features.py
"""
Comprehensive test suite for Phase 2B: Advanced Workflow Features

Tests:
1. Approval Delegation
2. Bulk Approval Actions
3. Conditional Routing
4. Auto-Escalation
5. Parallel Approvals
"""

from django.test import TestCase
from django.utils import timezone
from django.contrib.auth import get_user_model
from datetime import timedelta, date
from decimal import Decimal

from automations.models import (
    WorkflowTemplate,
    WorkflowRun,
    WorkflowApproval,
    ApprovalDelegation,
    WorkflowConditionEvaluator,
)
from branches.models import Branch
from automations.workflow_executor import WorkflowExecutor
from automations.tasks import check_approval_timeouts, find_escalation_approver
from branches.models import Branch

User = get_user_model()


class ApprovalDelegationTest(TestCase):
    """Test approval delegation functionality"""
    
    def setUp(self):
        """Set up test data"""
        # Create branch
        self.branch = Branch.objects.create(
            name="Test Branch",
            code="TB001"
        )
        
        # Create users
        self.manager = User.objects.create_user(
            username='manager',
            email='manager@test.com',
            password='test123',
            first_name='Manager',
            last_name='User'
        )
        
        self.supervisor = User.objects.create_user(
            username='supervisor',
            email='supervisor@test.com',
            password='test123',
            first_name='Supervisor',
            last_name='User'
        )
        
        self.employee = User.objects.create_user(
            username='employee',
            email='employee@test.com',
            password='test123'
        )
    
    def test_delegation_validation_no_self_delegation(self):
        """Test that users cannot delegate to themselves"""
        delegation = ApprovalDelegation(
            delegator=self.manager,
            delegate=self.manager,  # Same user
            start_date=date.today(),
            end_date=date.today() + timedelta(days=7),
            reason="Test",

            created_by=self.manager
        )
        
        with self.assertRaises(Exception):
            delegation.clean()
    
    def test_delegation_validation_date_range(self):
        """Test that end date must be after start date"""
        delegation = ApprovalDelegation(
            delegator=self.manager,
            delegate=self.supervisor,
            start_date=date.today() + timedelta(days=7),
            end_date=date.today(),  # Before start date
            reason="Test",

            created_by=self.manager
        )
        
        with self.assertRaises(Exception):
            delegation.clean()
    
    def test_is_currently_active(self):
        """Test is_currently_active() method"""
        # Create delegation for past dates
        past_delegation = ApprovalDelegation.objects.create(
            delegator=self.manager,
            delegate=self.supervisor,
            start_date=date.today() - timedelta(days=10),
            end_date=date.today() - timedelta(days=3),
            is_active=True,
            reason="Past delegation",

            created_by=self.manager
        )
        
        self.assertFalse(past_delegation.is_currently_active())
        
        # Create delegation for current dates
        current_delegation = ApprovalDelegation.objects.create(
            delegator=self.manager,
            delegate=self.supervisor,
            start_date=date.today() - timedelta(days=1),
            end_date=date.today() + timedelta(days=5),
            is_active=True,
            reason="Current delegation",

            created_by=self.manager
        )
        
        self.assertTrue(current_delegation.is_currently_active())
        
        # Create delegation for future dates
        future_delegation = ApprovalDelegation.objects.create(
            delegator=self.manager,
            delegate=self.supervisor,
            start_date=date.today() + timedelta(days=5),
            end_date=date.today() + timedelta(days=10),
            is_active=True,
            reason="Future delegation",

            created_by=self.manager
        )
        
        self.assertFalse(future_delegation.is_currently_active())
    
    def test_get_active_delegate_basic(self):
        """Test finding active delegate without filters"""
        # Create active delegation
        ApprovalDelegation.objects.create(
            delegator=self.manager,
            delegate=self.supervisor,
            start_date=date.today(),
            end_date=date.today() + timedelta(days=7),
            is_active=True,
            reason="Vacation",

            created_by=self.manager
        )
        
        # Find delegate
        delegate = ApprovalDelegation.get_active_delegate(
            delegator=self.manager
        )
        
        self.assertEqual(delegate, self.supervisor)
    
    def test_get_active_delegate_with_workflow_type(self):
        """Test delegation filtering by workflow type"""
        # Create delegation only for purchase_requisition
        ApprovalDelegation.objects.create(
            delegator=self.manager,
            delegate=self.supervisor,
            start_date=date.today(),
            end_date=date.today() + timedelta(days=7),
            is_active=True,
            reason="Vacation",
            workflow_types=['purchase_requisition'],

            created_by=self.manager
        )
        
        # Should find delegate for purchase_requisition
        delegate = ApprovalDelegation.get_active_delegate(
            delegator=self.manager,
            workflow_type='purchase_requisition'
        )
        self.assertEqual(delegate, self.supervisor)
        
        # Should not find delegate for expense_claim
        delegate = ApprovalDelegation.get_active_delegate(
            delegator=self.manager,
            workflow_type='expense_claim'
        )
        self.assertIsNone(delegate)
    
    def test_get_active_delegate_with_approval_limit(self):
        """Test delegation filtering by approval limit"""
        # Create delegation with 5000 limit
        ApprovalDelegation.objects.create(
            delegator=self.manager,
            delegate=self.supervisor,
            start_date=date.today(),
            end_date=date.today() + timedelta(days=7),
            is_active=True,
            reason="Limited authority",
            approval_limit=Decimal('5000.00'),

            created_by=self.manager
        )
        
        # Should find delegate for amount <= 5000
        delegate = ApprovalDelegation.get_active_delegate(
            delegator=self.manager,
            amount=Decimal('3000.00')
        )
        self.assertEqual(delegate, self.supervisor)
        
        # Should not find delegate for amount > 5000
        delegate = ApprovalDelegation.get_active_delegate(
            delegator=self.manager,
            amount=Decimal('7000.00')
        )
        self.assertIsNone(delegate)


class BulkApprovalTest(TestCase):
    """Test bulk approval actions"""
    
    def setUp(self):
        """Set up test data"""
        from rest_framework.test import APIClient
        
        self.client = APIClient()
        
        # Create branch
        self.branch = Branch.objects.create(
            name="Test Branch",
            code="TB001"
        )
        
        # Create user
        self.approver = User.objects.create_user(
            username='approver',
            email='approver@test.com',
            password='test123'
        )
        
        # Create workflow template
        self.template = WorkflowTemplate.objects.create(
            name="Test Workflow",
            workflow_type="test",
            trigger_type="manual",
            workflow_definition={
                'initial_step': 'approval_step',
                'steps': [
                    {
                        'id': 'approval_step',
                        'type': 'approval',
                        'config': {'approval_message': 'Test approval'}
                    }
                ]
            },

            created_by=self.approver
        )
        
        # Authenticate
        self.client.force_authenticate(user=self.approver)
    
    def test_bulk_approve_success(self):
        """Test successful bulk approval"""
        # Create 3 workflow runs with pending approvals
        approval_ids = []
        
        for i in range(3):
            run = WorkflowRun.objects.create(
                template=self.template,
    
                created_by=self.approver,
                status='awaiting_approval'
            )
            
            approval = WorkflowApproval.objects.create(
                workflow_run=run,
                step_id='approval_step',
                approver=self.approver,
                status='pending'
            )
            
            approval_ids.append(approval.id)
        
        # Bulk approve
        response = self.client.post(
            '/api/automations/approvals/bulk-approve/',
            {
                'approval_ids': approval_ids,
                'comment': 'All approved'
            },
            format='json'
        )
        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['approved_count'], 3)
        self.assertEqual(response.data['total_requested'], 3)
        
        # Verify all approvals are approved
        for approval_id in approval_ids:
            approval = WorkflowApproval.objects.get(id=approval_id)
            self.assertEqual(approval.status, 'approved')
    
    def test_bulk_reject_requires_reason(self):
        """Test that bulk reject requires a reason"""
        # Create approval
        run = WorkflowRun.objects.create(
            template=self.template,

            created_by=self.approver,
            status='awaiting_approval'
        )
        
        approval = WorkflowApproval.objects.create(
            workflow_run=run,
            step_id='approval_step',
            approver=self.approver,
            status='pending'
        )
        
        # Try to reject without reason
        response = self.client.post(
            '/api/automations/approvals/bulk-reject/',
            {
                'approval_ids': [approval.id]
                # No reason provided
            },
            format='json'
        )
        
        self.assertEqual(response.status_code, 400)
    
    def test_bulk_approve_partial_failure(self):
        """Test bulk approval with some failures"""
        # Create approvals for different users
        other_user = User.objects.create_user(
            username='other',
            email='other@test.com',
            password='test123'
        )
        
        # Approval for current user (should succeed)
        run1 = WorkflowRun.objects.create(
            template=self.template,

            created_by=self.approver,
            status='awaiting_approval'
        )
        approval1 = WorkflowApproval.objects.create(
            workflow_run=run1,
            step_id='approval_step',
            approver=self.approver,
            status='pending'
        )
        
        # Approval for other user (should fail authorization)
        run2 = WorkflowRun.objects.create(
            template=self.template,

            created_by=other_user,
            status='awaiting_approval'
        )
        approval2 = WorkflowApproval.objects.create(
            workflow_run=run2,
            step_id='approval_step',
            approver=other_user,
            status='pending'
        )
        
        # Bulk approve both
        response = self.client.post(
            '/api/automations/approvals/bulk-approve/',
            {
                'approval_ids': [approval1.id, approval2.id],
                'comment': 'Approve all'
            },
            format='json'
        )
        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['approved_count'], 1)  # Only one succeeded
        self.assertEqual(response.data['total_requested'], 2)


class ConditionalRoutingTest(TestCase):
    """Test conditional routing feature"""
    
    def test_simple_condition_equal(self):
        """Test simple equality condition"""
        condition_rules = {
            'operator': 'AND',
            'conditions': [
                {'field': 'amount', 'operator': '==', 'value': 1000}
            ]
        }
        
        context = {'amount': 1000}
        
        result = WorkflowConditionEvaluator.evaluate(condition_rules, context)
        self.assertTrue(result)
        
        context = {'amount': 2000}
        result = WorkflowConditionEvaluator.evaluate(condition_rules, context)
        self.assertFalse(result)
    
    def test_comparison_operators(self):
        """Test comparison operators (>, <, >=, <=)"""
        # Greater than
        condition_rules = {
            'operator': 'AND',
            'conditions': [
                {'field': 'amount', 'operator': '>', 'value': 10000}
            ]
        }
        
        self.assertTrue(
            WorkflowConditionEvaluator.evaluate(condition_rules, {'amount': 15000})
        )
        self.assertFalse(
            WorkflowConditionEvaluator.evaluate(condition_rules, {'amount': 5000})
        )
        
        # Less than or equal
        condition_rules = {
            'operator': 'AND',
            'conditions': [
                {'field': 'amount', 'operator': '<=', 'value': 5000}
            ]
        }
        
        self.assertTrue(
            WorkflowConditionEvaluator.evaluate(condition_rules, {'amount': 5000})
        )
        self.assertTrue(
            WorkflowConditionEvaluator.evaluate(condition_rules, {'amount': 3000})
        )
        self.assertFalse(
            WorkflowConditionEvaluator.evaluate(condition_rules, {'amount': 7000})
        )
    
    def test_and_condition(self):
        """Test AND operator"""
        condition_rules = {
            'operator': 'AND',
            'conditions': [
                {'field': 'amount', 'operator': '>', 'value': 10000},
                {'field': 'department', 'operator': '==', 'value': 'IT'}
            ]
        }
        
        # Both conditions true
        self.assertTrue(
            WorkflowConditionEvaluator.evaluate(
                condition_rules,
                {'amount': 15000, 'department': 'IT'}
            )
        )
        
        # One condition false
        self.assertFalse(
            WorkflowConditionEvaluator.evaluate(
                condition_rules,
                {'amount': 5000, 'department': 'IT'}
            )
        )
        
        # Both conditions false
        self.assertFalse(
            WorkflowConditionEvaluator.evaluate(
                condition_rules,
                {'amount': 5000, 'department': 'Finance'}
            )
        )
    
    def test_or_condition(self):
        """Test OR operator"""
        condition_rules = {
            'operator': 'OR',
            'conditions': [
                {'field': 'amount', 'operator': '>', 'value': 50000},
                {'field': 'priority', 'operator': '==', 'value': 'urgent'}
            ]
        }
        
        # First condition true
        self.assertTrue(
            WorkflowConditionEvaluator.evaluate(
                condition_rules,
                {'amount': 60000, 'priority': 'normal'}
            )
        )
        
        # Second condition true
        self.assertTrue(
            WorkflowConditionEvaluator.evaluate(
                condition_rules,
                {'amount': 10000, 'priority': 'urgent'}
            )
        )
        
        # Both conditions false
        self.assertFalse(
            WorkflowConditionEvaluator.evaluate(
                condition_rules,
                {'amount': 10000, 'priority': 'normal'}
            )
        )
    
    def test_nested_conditions(self):
        """Test nested AND/OR conditions"""
        condition_rules = {
            'operator': 'AND',
            'conditions': [
                {'field': 'amount', 'operator': '>', 'value': 50000},
                {
                    'operator': 'OR',
                    'conditions': [
                        {'field': 'department', 'operator': '==', 'value': 'IT'},
                        {'field': 'department', 'operator': '==', 'value': 'Finance'}
                    ]
                }
            ]
        }
        
        # Amount > 50000 AND (department = IT OR Finance)
        self.assertTrue(
            WorkflowConditionEvaluator.evaluate(
                condition_rules,
                {'amount': 60000, 'department': 'IT'}
            )
        )
        
        self.assertTrue(
            WorkflowConditionEvaluator.evaluate(
                condition_rules,
                {'amount': 75000, 'department': 'Finance'}
            )
        )
        
        # Amount too low
        self.assertFalse(
            WorkflowConditionEvaluator.evaluate(
                condition_rules,
                {'amount': 30000, 'department': 'IT'}
            )
        )
        
        # Wrong department
        self.assertFalse(
            WorkflowConditionEvaluator.evaluate(
                condition_rules,
                {'amount': 60000, 'department': 'HR'}
            )
        )
    
    def test_in_operator(self):
        """Test 'in' operator"""
        condition_rules = {
            'operator': 'AND',
            'conditions': [
                {'field': 'status', 'operator': 'in', 'value': ['pending', 'approved', 'in_progress']}
            ]
        }
        
        self.assertTrue(
            WorkflowConditionEvaluator.evaluate(condition_rules, {'status': 'pending'})
        )
        self.assertFalse(
            WorkflowConditionEvaluator.evaluate(condition_rules, {'status': 'rejected'})
        )
    
    def test_contains_operator(self):
        """Test 'contains' operator"""
        condition_rules = {
            'operator': 'AND',
            'conditions': [
                {'field': 'description', 'operator': 'contains', 'value': 'urgent'}
            ]
        }
        
        self.assertTrue(
            WorkflowConditionEvaluator.evaluate(
                condition_rules,
                {'description': 'This is an urgent request'}
            )
        )
        self.assertFalse(
            WorkflowConditionEvaluator.evaluate(
                condition_rules,
                {'description': 'This is a normal request'}
            )
        )


class EscalationTest(TestCase):
    """Test auto-escalation feature"""
    
    def setUp(self):
        """Set up test data"""
        # Create tenant first
        from users.models import Tenant
        self.tenant = Tenant.objects.create(name="Test Tenant")
        
        # Create branch
        self.branch = Branch.objects.create(
            name="Test Branch",
            code="TB001"
        )
        
        # Create users with tenant
        self.employee = User.objects.create_user(
            username='employee',
            email='employee@test.com',
            password='test123',
            tenant=self.tenant
        )
        
        self.manager = User.objects.create_user(
            username='manager',
            email='manager@test.com',
            password='test123',
            tenant=self.tenant
        )
        
        self.cfo = User.objects.create_user(
            username='cfo',
            email='cfo@test.com',
            password='test123',
            tenant=self.tenant
        )
        
        # Set manager relationship (for future use if User model adds manager field)
        self.employee.manager = self.manager
        self.employee.save()
        
        self.manager.manager = self.cfo
        self.manager.save()
        
        # Set branch for role-based escalation
        branch = Branch.objects.first()
        if not branch:
            branch = Branch.objects.create(name="Test Branch")
        self.employee.branch = branch
        self.manager.branch = branch
        self.cfo.branch = branch
        self.employee.save()
        self.manager.save()
        self.cfo.save()
        
        # Create roles for escalation (use tenant from employee)
        from users.models import Role
        tenant = self.employee.tenant
        manager_role, _ = Role.objects.get_or_create(name='manager', tenant=tenant)
        cfo_role, _ = Role.objects.get_or_create(name='cfo', tenant=tenant)
        self.manager.roles.add(manager_role)
        self.cfo.roles.add(cfo_role)
        
        # Create workflow template
        self.template = WorkflowTemplate.objects.create(
            name="Test Workflow",
            workflow_type="test",
            trigger_type="manual",
            workflow_definition={
                'initial_step': 'approval_step',
                'steps': [
                    {
                        'id': 'approval_step',
                        'type': 'approval',
                        'timeout_hours': 24,
                        'escalation': {
                            'max_levels': 2,
                            'escalate_to_role': 'manager',  # Use role-based escalation
                        },
                        'config': {'approval_message': 'Test approval'}
                    }
                ]
            },

            created_by=self.employee
        )
    
    def test_escalation_by_manager(self):
        """Test escalation to user with manager role"""
        # Create workflow run with timed-out approval
        run = WorkflowRun.objects.create(
            template=self.template,
            created_by=self.employee,
            status='awaiting_approval',
            current_step_id='approval_step',
            branch=self.employee.branch  # Add branch for role-based escalation
        )
        
        # Create approval with timeout in past
        approval = WorkflowApproval.objects.create(
            workflow_run=run,
            step_id='approval_step',
            approver=self.employee,
            status='pending',
            timeout_at=timezone.now() - timedelta(hours=1)
        )
        
        # Run escalation task
        result = check_approval_timeouts()
        
        # Verify escalation occurred
        self.assertGreater(result['escalated'], 0)
        
        # Verify original approval marked as timeout
        approval.refresh_from_db()
        self.assertEqual(approval.status, 'timeout')
        
        # Verify escalated approval created
        escalated = WorkflowApproval.objects.filter(
            workflow_run=run,
            escalation_level=1,
            status='pending'
        ).first()
        
        self.assertIsNotNone(escalated)
        # Verify escalated to user with manager role
        self.assertEqual(escalated.approver, self.manager)
        self.assertEqual(escalated.escalated_from, self.employee)
    
    def test_max_escalation_levels(self):
        """Test workflow fails after max escalation levels"""
        # Create workflow run
        run = WorkflowRun.objects.create(
            template=self.template,

            created_by=self.employee,
            status='awaiting_approval',
            current_step_id='approval_step'
        )
        
        # Create approval at max escalation level
        approval = WorkflowApproval.objects.create(
            workflow_run=run,
            step_id='approval_step',
            approver=self.manager,
            status='pending',
            escalation_level=2,  # At max (max_levels = 2)
            timeout_at=timezone.now() - timedelta(hours=1)
        )
        
        # Run escalation task
        result = check_approval_timeouts()
        
        # Verify workflow failed
        self.assertGreater(result['failed'], 0)
        
        # Verify approval marked as timeout
        approval.refresh_from_db()
        self.assertEqual(approval.status, 'timeout')
        
        # Verify workflow run marked as failed
        run.refresh_from_db()
        self.assertEqual(run.status, 'failed')
        self.assertIn('max escalation', run.error_message.lower())
    
    def test_find_escalation_approver(self):
        """Test finding next escalation approver"""
        # Test escalation to manager
        next_approver = find_escalation_approver(
            current_approver=self.employee,
            escalate_to_role=None,
            branch=self.branch
        )
        
        self.assertEqual(next_approver, self.manager)
        
        # Test escalation from manager to CFO
        next_approver = find_escalation_approver(
            current_approver=self.manager,
            escalate_to_role=None,
            branch=self.branch
        )
        
        self.assertEqual(next_approver, self.cfo)
        
        # Test no escalation path
        next_approver = find_escalation_approver(
            current_approver=self.cfo,
            escalate_to_role=None,
            branch=self.branch
        )
        
        self.assertIsNone(next_approver)


class ParallelApprovalTest(TestCase):
    """Test parallel approval feature"""
    
    def setUp(self):
        """Set up test data"""
        # Create branch
        self.branch = Branch.objects.create(
            name="Test Branch",
            code="TB001"
        )
        
        # Create users
        self.manager1 = User.objects.create_user(
            username='manager1',
            email='manager1@test.com',
            password='test123'
        )
        
        self.manager2 = User.objects.create_user(
            username='manager2',
            email='manager2@test.com',
            password='test123'
        )
        
        self.manager3 = User.objects.create_user(
            username='manager3',
            email='manager3@test.com',
            password='test123'
        )
        
        self.employee = User.objects.create_user(
            username='employee',
            email='employee@test.com',
            password='test123'
        )
        
        # Create workflow template with parallel approval
        self.template = WorkflowTemplate.objects.create(
            name="Parallel Approval Workflow",
            workflow_type="test",
            trigger_type="manual",
            workflow_definition={
                'initial_step': 'parallel_approval',
                'steps': [
                    {
                        'id': 'parallel_approval',
                        'type': 'approval',
                        'approval_mode': 'parallel',
                        'approvers': [self.manager1.id, self.manager2.id, self.manager3.id],
                        'approval_threshold': {'type': 'all'},
                        'config': {'approval_message': 'Parallel approval required'}
                    }
                ]
            },

            created_by=self.employee
        )
    
    def test_parallel_approval_all_threshold(self):
        """Test parallel approval with 'all' threshold"""
        # Create and start workflow run
        run = WorkflowRun.objects.create(
            template=self.template,

            created_by=self.employee,
            status='queued'
        )
        
        # Execute workflow
        executor = WorkflowExecutor(run)
        executor.execute()
        
        # Verify 3 approvals created
        approvals = WorkflowApproval.objects.filter(workflow_run=run)
        self.assertEqual(approvals.count(), 3)
        
        # Verify workflow is paused
        run.refresh_from_db()
        self.assertEqual(run.status, 'awaiting_approval')
        
        # Approve first two
        approvals[0].approve(self.manager1)
        approvals[1].approve(self.manager2)
        
        # Verify workflow still awaiting
        run.refresh_from_db()
        self.assertEqual(run.status, 'awaiting_approval')
        
        # Approve third
        approvals[2].approve(self.manager3)
        
        # Verify workflow completed
        run.refresh_from_db()
        self.assertEqual(run.status, 'completed')
    
    def test_parallel_approval_majority_threshold(self):
        """Test parallel approval with 'majority' threshold"""
        # Update template threshold
        workflow_def = self.template.workflow_definition.copy()
        workflow_def['steps'][0]['approval_threshold'] = {'type': 'majority'}
        self.template.workflow_definition = workflow_def
        self.template.save()
        
        # Create and start workflow run
        run = WorkflowRun.objects.create(
            template=self.template,

            created_by=self.employee,
            status='queued'
        )
        
        # Execute workflow
        executor = WorkflowExecutor(run)
        executor.execute()
        
        # Get approvals
        approvals = WorkflowApproval.objects.filter(workflow_run=run)
        self.assertEqual(approvals.count(), 3)
        
        # Approve 2 out of 3 (majority)
        approvals[0].approve(self.manager1)
        approvals[1].approve(self.manager2)
        
        # Verify workflow completed (majority met)
        run.refresh_from_db()
        self.assertEqual(run.status, 'completed')
    
    def test_parallel_approval_count_threshold(self):
        """Test parallel approval with 'count' threshold"""
        # Update template threshold
        workflow_def = self.template.workflow_definition.copy()
        workflow_def['steps'][0]['approval_threshold'] = {'type': 'count', 'count': 2}
        self.template.workflow_definition = workflow_def
        self.template.save()
        
        # Create and start workflow run
        run = WorkflowRun.objects.create(
            template=self.template,

            created_by=self.employee,
            status='queued'
        )
        
        # Execute workflow
        executor = WorkflowExecutor(run)
        executor.execute()
        
        # Get approvals
        approvals = WorkflowApproval.objects.filter(workflow_run=run)
        
        # Approve exactly 2
        approvals[0].approve(self.manager1)
        approvals[1].approve(self.manager2)
        
        # Verify workflow completed (count threshold met)
        run.refresh_from_db()
        self.assertEqual(run.status, 'completed')
    
    def test_parallel_approval_rejection(self):
        """Test parallel approval with rejection"""
        # Create and start workflow run
        run = WorkflowRun.objects.create(
            template=self.template,

            created_by=self.employee,
            status='queued'
        )
        
        # Execute workflow
        executor = WorkflowExecutor(run)
        executor.execute()
        
        # Get approvals
        approvals = WorkflowApproval.objects.filter(workflow_run=run)
        
        # Approve first, reject second (with 'all' threshold, one rejection fails workflow)
        approvals[0].approve(self.manager1)
        approvals[1].reject(self.manager2, reason="Rejected")
        
        # Verify workflow failed (rejection with 'all' threshold)
        run.refresh_from_db()
        self.assertEqual(run.status, 'failed')


class IntegrationTest(TestCase):
    """Integration tests combining multiple Phase 2B features"""
    
    def setUp(self):
        """Set up test data"""
        # Create branch
        self.branch = Branch.objects.create(
            name="Test Branch",
            code="TB001"
        )
        
        # Create users
        self.employee = User.objects.create_user(
            username='employee',
            email='employee@test.com',
            password='test123'
        )
        
        self.manager = User.objects.create_user(
            username='manager',
            email='manager@test.com',
            password='test123'
        )
        
        self.supervisor = User.objects.create_user(
            username='supervisor',
            email='supervisor@test.com',
            password='test123'
        )
        
        self.cfo = User.objects.create_user(
            username='cfo',
            email='cfo@test.com',
            password='test123'
        )
    
    def test_delegation_with_conditional_routing(self):
        """Test delegation combined with conditional routing"""
        # Create delegation
        ApprovalDelegation.objects.create(
            delegator=self.manager,
            delegate=self.supervisor,
            start_date=date.today(),
            end_date=date.today() + timedelta(days=7),
            is_active=True,
            reason="Vacation",

            created_by=self.manager
        )
        
        # Create workflow with conditional routing
        template = WorkflowTemplate.objects.create(
            name="Conditional + Delegation Workflow",
            workflow_type="purchase_requisition",
            trigger_type="manual",
            workflow_definition={
                'initial_step': 'check_amount',
                'steps': [
                    {
                        'id': 'check_amount',
                        'type': 'condition',
                        'transitions': [
                            {
                                'target_step': 'high_value_approval',
                                'condition_rules': {
                                    'operator': 'AND',
                                    'conditions': [
                                        {'field': 'amount', 'operator': '>=', 'value': 10000}
                                    ]
                                }
                            },
                            {
                                'target_step': 'normal_approval',
                                'condition_rules': {
                                    'operator': 'AND',
                                    'conditions': [
                                        {'field': 'amount', 'operator': '<', 'value': 10000}
                                    ]
                                }
                            }
                        ]
                    },
                    {
                        'id': 'high_value_approval',
                        'type': 'approval',
                        'config': {
                            'approver_type': 'user',
                            'approver_id': self.cfo.id,
                            'approval_message': 'High value approval'
                        }
                    },
                    {
                        'id': 'normal_approval',
                        'type': 'approval',
                        'config': {
                            'approver_type': 'user',
                            'approver_id': self.manager.id,
                            'approval_message': 'Normal approval'
                        }
                    }
                ]
            },

            created_by=self.employee
        )
        
        # Create run with amount < 10000 (should route to manager, but delegated to supervisor)
        run = WorkflowRun.objects.create(
            template=template,

            created_by=self.employee,
            status='queued',
            context={'amount': 5000}
        )
        
        # Execute
        executor = WorkflowExecutor(run)
        executor.execute()
        
        # Verify routed to normal_approval step
        run.refresh_from_db()
        self.assertEqual(run.current_step_id, 'normal_approval')
        
        # Verify approval assigned to supervisor (delegate), not manager
        approval = WorkflowApproval.objects.filter(workflow_run=run).first()
        self.assertIsNotNone(approval)
        self.assertEqual(approval.approver, self.supervisor)
        self.assertTrue(approval.context_data.get('delegated', False))
