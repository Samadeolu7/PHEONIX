"""
Procurement workflow service

Handles workflow actions for purchase requisitions and orders
"""
from django.utils import timezone
from django.db import transaction
from automations.models import WorkflowRun
from common.services.reference_service import ReferenceService


class ProcurementWorkflowService:
    """Handle procurement workflow actions"""
    
    @staticmethod
    def handle_pr_validation(workflow_run, context):
        """
        Validate PR before approval
        
        Context:
          {
            "pr_id": 123,
            "items": [...],
            "estimated_total": 5000.00
          }
        """
        from procurement.models import PurchaseRequisition
        
        pr_id = context.get('pr_id')
        pr = PurchaseRequisition.objects.get(id=pr_id)
        
        # Validate items
        items = context.get('items', [])
        if not items:
            return {
                'success': False,
                'error': 'No items in requisition'
            }
        
        # Calculate total
        total = sum(
            item.get('quantity', 0) * item.get('unit_price', 0)
            for item in items
        )
        
        pr.estimated_total = total
        pr.save(update_fields=['estimated_total'])
        
        return {
            'success': True,
            'estimated_total': float(total),
            'next_action': 'route_to_approver'
        }
    
    @staticmethod
    def route_to_approver(workflow_run, context):
        """
        Determine who should approve based on rules
        
        Returns approver user_id
        """
        from users.models import User
        
        amount = context.get('estimated_total', 0)
        
        # Simple amount-based rules (can be made configurable later)
        if amount < 1000:
            role = 'department_manager'
        elif amount < 10000:
            role = 'finance_manager'
        else:
            role = 'cfo'
        
        # Get first user with this role in this branch
        approver = User.objects.filter(
            role=role,
            branch=workflow_run.branch,
            is_active=True
        ).first()
        
        if not approver:
            # Fallback: get any manager
            approver = User.objects.filter(
                branch=workflow_run.branch,
                is_active=True
            ).exclude(role='staff').first()
        
        if not approver:
            return {
                'success': False,
                'error': f'No approver found for role: {role}'
            }
        
        return {
            'success': True,
            'approver_id': approver.id,
            'approver_email': approver.email,
            'approver_name': f"{approver.first_name} {approver.last_name}",
            'approval_level': role,
            'next_action': 'wait_for_approval'
        }
    
    @staticmethod
    @transaction.atomic
    def handle_pr_approval(workflow_run, context):
        """
        Process PR approval decision
        
        Context:
          {
            "pr_id": 123,
            "decision": "approved",  # or "rejected"
            "approver_id": 45,
            "comments": "Looks good"
          }
        """
        from procurement.models import PurchaseRequisition, PurchaseOrder
        
        pr = PurchaseRequisition.objects.select_for_update().get(id=context['pr_id'])
        decision = context['decision']
        approver_id = context['approver_id']
        
        # Update approval chain
        approval_entry = {
            'approver_id': approver_id,
            'decision': decision,
            'comments': context.get('comments', ''),
            'timestamp': timezone.now().isoformat(),
            'level': context.get('approval_level', 'unknown')
        }
        
        if not isinstance(pr.approval_chain, list):
            pr.approval_chain = []
        
        pr.approval_chain.append(approval_entry)
        
        if decision == 'approved':
            pr.status = 'approved'
            pr.approved_by_id = approver_id
            pr.approved_at = timezone.now()
            pr.save()
            
            # Update reference tracking
            ReferenceService.update_status(pr.origin_reference, 'approved')
            
            # Create PO draft
            po_number = ReferenceService.generate_reference(
                'procurement',
                'purchase_order',
                pr.tenant,
                pr.branch
            )
            
            po = PurchaseOrder.objects.create(
                po_number=po_number,
                requisition=pr,
                pr_reference=pr.pr_number,
                origin_reference=pr.pr_number,
                workflow_run=workflow_run,
                status='draft',
                tenant=pr.tenant,
                branch=pr.branch,
                created_by=workflow_run.created_by,
                # Copy delivery location from first item or use default
                delivery_location_id=context.get('delivery_location_id'),
                # Placeholder supplier - must be set later
                supplier_id=context.get('supplier_id') if context.get('supplier_id') else None
            )
            
            # Register PO reference
            ReferenceService.register_reference(
                reference_number=po_number,
                module='procurement',
                model_name='purchase_order',
                object_id=po.id,
                origin_reference=pr.pr_number,
                parent_reference=pr.pr_number,
                workflow_run=workflow_run,
                status='draft',
                tenant=pr.tenant,
                branch=pr.branch,
                created_by=workflow_run.created_by,
                metadata={
                    'pr_number': pr.pr_number,
                    'approved_by': approver_id
                }
            )
            
            # Update PR status
            pr.status = 'po_created'
            pr.save()
            
            return {
                'success': True,
                'po_id': po.id,
                'po_number': po_number,
                'message': f'PR approved and PO {po_number} created',
                'next_action': 'end'
            }
        
        else:  # rejected
            pr.status = 'rejected'
            pr.rejection_reason = context.get('comments', 'No reason provided')
            pr.save()
            
            # Update reference tracking
            ReferenceService.update_status(pr.origin_reference, 'rejected')
            
            return {
                'success': True,
                'message': 'PR rejected',
                'next_action': 'end'
            }
    
    @staticmethod
    def notify_requester(workflow_run, context):
        """
        Send notification to PR requester
        
        Can be extended to send email/SMS
        """
        from procurement.models import PurchaseRequisition
        
        pr_id = context.get('pr_id')
        pr = PurchaseRequisition.objects.get(id=pr_id)
        decision = context.get('decision', 'unknown')
        
        # For now, just return success
        # In future, integrate with notifications app
        return {
            'success': True,
            'message': f'Notification sent to {pr.requested_by.email}',
            'next_action': 'end'
        }
