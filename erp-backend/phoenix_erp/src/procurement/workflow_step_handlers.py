# procurement/workflow_step_handlers.py
"""
Procurement-specific step handlers for the existing workflow executor.
These plug into automations.workflow_executor.WorkflowExecutor
"""
import logging
from decimal import Decimal
from typing import Dict, Any

from procurement.models import PurchaseOrder, GoodsReceivedNote
from procurement.config_models import ProcurementConfig
from procurement.services.three_way_matching import ThreeWayMatchingService

logger = logging.getLogger(__name__)


class ThreeWayMatchingStepHandler:
    """
    Workflow step handler for 3-way matching (PO → GRN → Invoice).
    
    Integrates with existing WorkflowExecutor - just add to step_handlers dict!
    
    Step config example:
    {
        "id": "match_invoice",
        "type": "three_way_matching",
        "name": "Match Invoice to PO and GRN",
        "config": {
            "po_id": "${context.po_id}",
            "grn_id": "${context.grn_id}",
            "invoice_amount": "${form.invoice_amount}",
            "invoice_items": "${form.invoice_items}"  // optional
        },
        "on_passed": "approve_payment",
        "on_failed": "require_manager_approval",
        "on_warning": "notify_finance"
    }
    """
    
    def execute(self, step: Dict[str, Any], workflow_run, context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute 3-way matching check.
        
        Returns:
            {
                "success": True/False,
                "matching_result": {...},
                "requires_approval": True/False,
                "next_step": "step_id" or None
            }
        """
        config = step.get('config', {})
        
        try:
            # Get PO and GRN
            po_id = self._resolve_value(config.get('po_id'), context)
            grn_id = self._resolve_value(config.get('grn_id'), context)
            
            if not po_id or not grn_id:
                return {
                    'success': False,
                    'error': 'Missing PO ID or GRN ID',
                    'next_step': step.get('on_error')
                }
            
            po = PurchaseOrder.objects.get(id=po_id)
            grn = GoodsReceivedNote.objects.get(id=grn_id)
            
            # Get procurement config
            proc_config = ProcurementConfig.get_for_branch(workflow_run.branch)
            
            if not proc_config.enable_three_way_matching:
                logger.info("3-way matching disabled for branch, skipping")
                return {
                    'success': True,
                    'skipped': True,
                    'message': '3-way matching is disabled',
                    'next_step': step.get('next')
                }
            
            # Perform matching
            matching_service = ThreeWayMatchingService(workflow_config=proc_config)
            
            # Check if invoice amount provided (full 3-way match)
            invoice_amount = config.get('invoice_amount')
            invoice_items = config.get('invoice_items')
            
            if invoice_amount:
                invoice_amount = self._resolve_value(invoice_amount, context)
                if invoice_items:
                    invoice_items = self._resolve_value(invoice_items, context)
                
                result = matching_service.match_po_grn_invoice(
                    po=po,
                    grn=grn,
                    invoice_amount=Decimal(str(invoice_amount)),
                    invoice_items=invoice_items
                )
            else:
                # Just PO-GRN match
                result = matching_service.match_po_grn(po, grn)
            
            # Determine next step based on result
            next_step = None
            overall_status = result.get('overall_status', 'passed')
            
            if overall_status == 'passed':
                next_step = step.get('on_passed') or step.get('next')
            elif overall_status == 'failed':
                # Failed status means critical failure or approval required
                if result.get('requires_approval'):
                    # Pause workflow for approval if configured
                    if step.get('require_approval_on_mismatch', True):
                        return {
                            'success': True,
                            'matching_result': result,
                            'requires_approval': True,
                            'approver_roles': result.get('approver_roles', []),
                            'paused': True,  # Pause workflow
                            'approval_message': self._build_approval_message(result),
                            'next_step': step.get('on_failed')
                        }
                    else:
                        next_step = step.get('on_failed') or step.get('on_error')
                else:
                    # Critical failure without possibility of approval
                    next_step = step.get('on_failed') or step.get('on_error')
            elif overall_status == 'warning':
                # Warning status - within tolerance or minor issues
                next_step = step.get('on_warning') or step.get('next')
            else:
                # Unknown status, default to passed path
                next_step = step.get('on_passed') or step.get('next')
            
            return {
                'success': True,
                'matching_result': result,
                'can_proceed': result.get('can_proceed', True),
                'requires_manual_review': result.get('requires_approval', False),
                'requires_approval': result.get('requires_approval', False),  # For backward compatibility
                'summary': result.get('summary', 'Matching completed'),
                'next_step': next_step
            }
        
        except PurchaseOrder.DoesNotExist:
            return {
                'success': False,
                'error': f'Purchase Order {po_id} not found',
                'next_step': step.get('on_failed') or step.get('on_error')
            }
        except GoodsReceivedNote.DoesNotExist:
            return {
                'success': False,
                'error': f'Goods Received Note {grn_id} not found',
                'next_step': step.get('on_failed') or step.get('on_error')
            }
        except Exception as e:
            logger.exception("3-way matching failed")
            return {
                'success': False,
                'error': str(e),
                'next_step': step.get('on_error')
            }
    
    def _resolve_value(self, value, context):
        """Resolve ${variable} references from context"""
        if isinstance(value, str) and value.startswith('${') and value.endswith('}'):
            path = value[2:-1]  # Remove ${ and }
            parts = path.split('.')
            
            result = context
            for part in parts:
                if isinstance(result, dict):
                    result = result.get(part)
                else:
                    return None
            return result
        return value
    
    def _build_approval_message(self, matching_result):
        """Build approval request message"""
        msg = f"Invoice Matching Review Required\n\n"
        msg += f"Status: {matching_result['overall_status']}\n"
        msg += f"Summary: {matching_result['summary']}\n\n"
        
        if matching_result.get('critical_failures'):
            msg += f"Critical Issues: {matching_result['critical_failures']}\n"
        if matching_result.get('warnings'):
            msg += f"Warnings: {matching_result['warnings']}\n"
        
        msg += "\nPlease review the matching discrepancies and approve or reject this payment."
        return msg


class GRNCreationStepHandler:
    """
    Step handler for creating GRN from PO.
    
    Step config example:
    {
        "id": "create_grn",
        "type": "create_grn",
        "name": "Create Goods Received Note",
        "config": {
            "po_id": "${context.po_id}",
            "received_date": "${form.received_date}",
            "received_location_id": "${form.location_id}",
            "items": "${form.grn_items}",
            "quality_status": "pending"
        }
    }
    """
    
    def execute(self, step: Dict[str, Any], workflow_run, context: Dict[str, Any]) -> Dict[str, Any]:
        """Create GRN from configuration"""
        config = step.get('config', {})
        
        try:
            po_id = self._resolve_value(config.get('po_id'), context)
            po = PurchaseOrder.objects.get(id=po_id)
            
            # GRN creation logic here...
            # This would create the GRN record
            
            return {
                'success': True,
                'grn_id': 'NEW_GRN_ID',  # Replace with actual GRN ID
                'message': 'GRN created successfully',
                'next_step': step.get('next')
            }
        
        except Exception as e:
            logger.exception("GRN creation failed")
            return {
                'success': False,
                'error': str(e),
                'next_step': step.get('on_error')
            }
    
    def _resolve_value(self, value, context):
        """Resolve ${variable} references from context"""
        if isinstance(value, str) and value.startswith('${') and value.endswith('}'):
            path = value[2:-1]
            parts = path.split('.')
            result = context
            for part in parts:
                if isinstance(result, dict):
                    result = result.get(part)
                else:
                    return None
            return result
        return value


# Register these handlers with WorkflowExecutor in automations/workflow_executor.py:
# 
# from procurement.workflow_step_handlers import ThreeWayMatchingStepHandler, GRNCreationStepHandler
#
# self.step_handlers = {
#     ...
#     'three_way_matching': ThreeWayMatchingStepHandler(),
#     'create_grn': GRNCreationStepHandler(),
# }
