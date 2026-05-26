"""
Setup Purchase Requisition Approval Workflow Template
"""
from django.core.management.base import BaseCommand
from automations.models import WorkflowTemplate


class Command(BaseCommand):
    help = 'Setup Purchase Requisition Approval Workflow Template'
    
    def handle(self, *args, **kwargs):
        workflow_def = {
            'name': 'PR Approval Standard',
            'description': 'Approve purchase requisitions with amount-based routing',
            'steps': [
                {
                    'id': 'validate_pr',
                    'name': 'Validate PR',
                    'type': 'python_function',
                    'config': {
                        'handler': 'procurement.services.workflow_service.ProcurementWorkflowService.handle_pr_validation'
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
                        'handler': 'procurement.services.workflow_service.ProcurementWorkflowService.route_to_approver'
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
                        'timeout_hours': 48,
                        'approval_message': 'Please review and approve Purchase Requisition ${pr_number}'
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
                        'handler': 'procurement.services.workflow_service.ProcurementWorkflowService.handle_pr_approval'
                    },
                    'transitions': {
                        'success': 'notify',
                        'failure': 'end'
                    }
                },
                {
                    'id': 'notify',
                    'name': 'Notify Requester',
                    'type': 'notification',
                    'config': {
                        'notification_type': 'email',
                        'recipients': ['${requested_by_email}'],
                        'subject': 'PR ${pr_number} ${decision}',
                        'message': 'Your purchase requisition has been ${decision}'
                    },
                    'transitions': {
                        'success': 'end'
                    }
                }
            ],
            'initial_step': 'validate_pr'
        }
        
        template, created = WorkflowTemplate.objects.update_or_create(
            name='PRApprovalStandard',
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
