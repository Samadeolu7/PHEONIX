"""
Setup Direct Expense Approval Workflow Template
"""
from django.core.management.base import BaseCommand
from automations.models import WorkflowTemplate


class Command(BaseCommand):
    help = 'Setup Direct Expense Approval Workflow Template'
    
    def handle(self, *args, **kwargs):
        workflow_def = {
            'name': 'Expense Approval Direct',
            'description': 'Approve direct cash expenses with amount-based routing',
            'steps': [
                {
                    'id': 'validate_expense',
                    'name': 'Validate Expense',
                    'type': 'python_function',
                    'config': {
                        'handler': 'expenses.services.workflow_service.ExpenseWorkflowService.handle_expense_validation'
                    },
                    'transitions': {
                        'success': 'route_approver',
                        'failure': 'end'
                    }
                },
                {
                    'id': 'route_approver',
                    'name': 'Route to Approver',
                    'type': 'python_function',
                    'config': {
                        'handler': 'expenses.services.workflow_service.ExpenseWorkflowService.route_expense_approver'
                    },
                    'transitions': {
                        'success': 'wait_approval',
                        'failure': 'end'
                    }
                },
                {
                    'id': 'wait_approval',
                    'name': 'Wait for Approval Decision',
                    'type': 'approval',
                    'config': {
                        'approver_field': '${route_approver.approver_id}',
                        'timeout_hours': 24,
                        'approval_message': 'Please review and approve Expense ${reference_number}'
                    },
                    'transitions': {
                        'approved': 'process_approval',
                        'rejected': 'process_approval',
                        'timeout': 'end'
                    }
                },
                {
                    'id': 'process_approval',
                    'name': 'Process Approval Decision',
                    'type': 'python_function',
                    'config': {
                        'handler': 'expenses.services.workflow_service.ExpenseWorkflowService.handle_expense_approval'
                    },
                    'transitions': {
                        'success': 'process_payment',
                        'failure': 'end'
                    }
                },
                {
                    'id': 'process_payment',
                    'name': 'Process Payment',
                    'type': 'python_function',
                    'config': {
                        'handler': 'expenses.services.workflow_service.ExpenseWorkflowService.process_payment'
                    },
                    'transitions': {
                        'success': 'end'
                    }
                }
            ],
            'initial_step': 'validate_expense'
        }
        
        template, created = WorkflowTemplate.objects.update_or_create(
            name='ExpenseApprovalDirect',
            defaults={
                'description': workflow_def['description'],
                'trigger_type': 'manual',
                'workflow_type': 'approval',
                'workflow_definition': workflow_def,
                'is_active': True,
                'access_level': 'internal'
            }
        )
        
        action = 'Created' if created else 'Updated'
        self.stdout.write(
            self.style.SUCCESS(f'{action} workflow template: {template.name} (ID: {template.id})')
        )
