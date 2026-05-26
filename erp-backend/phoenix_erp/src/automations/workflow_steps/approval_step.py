# automations/workflow_steps/approval.py

from typing import Dict, Any
from django.utils import timezone
from django.core.mail import send_mail
from django.conf import settings
import logging
from automations.product_validation import ProductValidator, ProductValidationError, get_product_for_account
from decimal import Decimal

logger = logging.getLogger(__name__)


class ApprovalStepHandler:
    """
    Handles approval steps in workflows
    
    Features:
    - Pause workflow execution
    - Send notification to approver(s)
    - Wait for approval/rejection
    - Resume workflow on decision
    - Timeout handling
    """
    
    def execute(self, step: Dict[str, Any], run, context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute approval step with product validation
        
        Config structure:
        {
            "approver_type": "user",  # user, role, dynamic
            "approver_id": 123,  # User ID (if type=user)
            "approver_role": "manager",  # Role name (if type=role)
            "approver_field": "form.manager_id",  # Dynamic field (if type=dynamic)
            "approval_message": "Transaction requires approval",
            "timeout_hours": 24,  # Optional timeout
            "on_approve": "next_step_id",  # Step to go to on approve
            "on_reject": "rejection_step_id",  # Step to go to on reject
            "on_validation_error": "validation_error_step",  # Step for validation failures
            "notification_channels": ["email", "in_app"],
        }
        """
        config = step['config']
        
        # PRODUCT VALIDATION - Check before creating approval request
        validation_result = self._validate_product_rules(config, context, run)
        if not validation_result['valid']:
            # Check if workflow defines on_validation_error handler
            error_step = config.get('on_validation_error')
            if error_step:
                # Route to error handling step
                return {
                    'success': False,
                    'validation_failed': True,
                    'validation_result': validation_result,
                    'next_step': error_step,
                    'error': validation_result['checks'][-1]['message']
                }
            else:
                # Fail the workflow
                raise ProductValidationError(
                    validation_result['checks'][-1]['message']
                )
        
        # Check if approval already exists for this run
        from automations.models import WorkflowApproval
        
        existing_approval = WorkflowApproval.objects.filter(
            workflow_run=run,
            step_id=step['id']
        ).first()
        
        if existing_approval:
            # Check approval status
            if existing_approval.status == 'approved':
                return {
                    'success': True,
                    'approved': True,
                    'approved_by': existing_approval.approved_by.email if existing_approval.approved_by else None,
                    'approved_at': existing_approval.approved_at.isoformat() if existing_approval.approved_at else None,
                    'next_step': config.get('on_approve'),
                    'validation_result': validation_result,
                }
            elif existing_approval.status == 'rejected':
                return {
                    'success': False,
                    'approved': False,
                    'rejected_by': existing_approval.approved_by.email if existing_approval.approved_by else None,
                    'rejected_at': existing_approval.approved_at.isoformat() if existing_approval.approved_at else None,
                    'rejection_reason': existing_approval.rejection_reason,
                    'next_step': config.get('on_reject'),
                }
            else:
                # Still pending - pause workflow
                return {
                    'success': True,
                    'paused': True,
                    'waiting_for_approval': True,
                    'approval_id': existing_approval.id,
                }
        
        # Create new approval request (Phase 2B: supports parallel and delegation)
        approval_mode = step.get('approval_mode', 'sequential')
        approvers = step.get('approvers', [])
        
        # Handle parallel approval mode (Phase 2B)
        if approval_mode == 'parallel' and approvers:
            # Create multiple approval records for parallel processing
            created_approvals = self._create_parallel_approvals(
                step, run, approvers, config, context, validation_result
            )
            
            # Mark run as awaiting approval
            run.status = 'awaiting_approval'
            run.save()
            
            logger.info(f"Parallel approval created for run {run.id}, status set to: {run.status}")
            
            return {
                'success': True,
                'paused': True,
                'waiting_for_approval': True,
                'approval_ids': [a.id for a in created_approvals],
                'approval_mode': 'parallel',
                'approvers': [a.approver.email for a in created_approvals],
                'validation_result': validation_result,
            }
        else:
            # Sequential or single approval (legacy behavior)
            approver = self._get_approver(config, context, run)
            
            if not approver:
                raise ValueError("Could not determine approver for approval step")
            
            # Phase 2B: Check for active delegation
            original_approver = approver
            approver = self._check_delegation(approver, run, context)
            
            # Calculate timeout
            timeout = None
            if config.get('timeout_hours'):
                from datetime import timedelta
                timeout = timezone.now() + timedelta(hours=config['timeout_hours'])
            
            # Prepare approval context with validation info
            approval_context = self._prepare_approval_context(context)
            approval_context['validation_result'] = validation_result
            
            # Add delegation metadata if delegated (Phase 2B)
            if approver != original_approver:
                approval_context['delegated_from'] = original_approver.id
                approval_context['original_approver_name'] = original_approver.get_full_name()
                approval_context['delegated'] = True
            
            # Create approval record
            approval = WorkflowApproval.objects.create(
                workflow_run=run,
                step_id=step['id'],
                approver=approver,
                approval_message=config.get('approval_message', 'Approval required'),
                timeout_at=timeout,
                status='pending',
                context_data=approval_context
            )
        
        # Send notifications
        self._send_notifications(approval, config, run, validation_result)
        
        # Mark run as awaiting approval
        run.status = 'awaiting_approval'
        run.save()
        
        return {
            'success': True,
            'paused': True,
            'waiting_for_approval': True,
            'approval_id': approval.id,
            'approver': approver.email,
            'timeout_at': timeout.isoformat() if timeout else None,
            'validation_result': validation_result,
        }
    
    def _validate_product_rules(
        self,
        config: Dict[str, Any],
        context: Dict[str, Any],
        run
    ) -> Dict[str, Any]:
        """
        Validate transaction against product rules before approval
        Returns validation result dict
        """
        from accounts.models import Account
        
        # Try to extract transaction details from context
        form_data = context.get('form', {})
        
        # Get account and amount from context
        account_id = form_data.get('account_id') or context.get('account_id')
        amount = form_data.get('amount') or context.get('amount')
        
        if not account_id or not amount:
            # Can't validate without account and amount
            return {'valid': True, 'checks': [], 'warnings': [], 'insufficient_context': True}
        
        try:
            # Get account
            account = Account.objects.get(id=account_id, branch=run.branch)
            
            # Get product for account
            product = get_product_for_account(account)
            if not product:
                # No product configured - skip validation
                return {'valid': True, 'checks': [], 'warnings': [], 'no_product': True}
            
            # Convert amount to Decimal
            amount = Decimal(str(amount))
            
            # Get expense category if applicable
            category = None
            if hasattr(account, 'expense_categories_main'):
                categories = account.expense_categories_main.all()
                if categories.exists():
                    category = categories.first()
            
            # Create validator
            validator = ProductValidator(
                product=product,
                account=account,
                user=run.created_by,
                category=category
            )
            
            # Validate transaction
            return validator.validate_transaction(amount, transaction_type='debit')
            
        except Account.DoesNotExist:
            logger.warning(f"Account {account_id} not found for validation")
            return {'valid': True, 'checks': [], 'warnings': [], 'account_not_found': True}
        except Exception as e:
            logger.error(f"Error during product validation: {str(e)}", exc_info=True)
            # Don't block approval on validation errors - log and continue
            return {'valid': True, 'checks': [], 'warnings': [], 'validation_error': str(e)}
    
    def _get_approver(self, config: Dict[str, Any], context: Dict[str, Any], run):
        """Determine who should approve based on config"""
        from django.contrib.auth import get_user_model
        User = get_user_model()
        
        approver_type = config.get('approver_type', 'user')
        
        if approver_type == 'user':
            # Specific user
            approver_id = config.get('approver_id')
            if not approver_id:
                raise ValueError("approver_id required for approver_type=user")
            return User.objects.get(id=approver_id)
        
        elif approver_type == 'role':
            # User with specific role
            role_name = config.get('approver_role')
            if not role_name:
                raise ValueError("approver_role required for approver_type=role")
            
            # Find user with this role (implementation depends on your role system)
            # Example: return User.objects.filter(role__name=role_name).first()
            # For now, return run owner's manager (simplified)
            return run.owner
        
        elif approver_type == 'dynamic':
            # Approver specified in form data
            approver_field = config.get('approver_field')
            if not approver_field:
                raise ValueError("approver_field required for approver_type=dynamic")
            
            # Resolve field from context
            approver_id = self._resolve_field(approver_field, context)
            if not approver_id:
                raise ValueError(f"Could not resolve approver from {approver_field}")
            
            return User.objects.get(id=approver_id)
        
        else:
            raise ValueError(f"Unknown approver_type: {approver_type}")
    
    def _check_delegation(self, original_approver, run, context: Dict[str, Any]):
        """
        Check if approver has delegated their approval authority (Phase 2B feature)
        
        Returns: Delegate user if active delegation exists, otherwise original approver
        """
        from automations.models import ApprovalDelegation
        
        try:
            # Get workflow type and amount from context
            workflow_type = run.template.workflow_type
            amount = context.get('amount') or context.get('form', {}).get('amount')
            
            # Find active delegate
            delegate = ApprovalDelegation.get_active_delegate(
                delegator=original_approver,
                workflow_type=workflow_type,
                amount=amount
            )
            
            if delegate:
                logger.info(
                    f"Approval delegated from {original_approver.username} to {delegate.username} "
                    f"for workflow {run.run_reference}"
                )
                return delegate
            
            return original_approver
            
        except Exception as e:
            logger.error(f"Error checking delegation: {str(e)}", exc_info=True)
            # On error, return original approver
            return original_approver
    
    def _create_parallel_approvals(self, step, run, approvers, config, context, validation_result):
        """
        Create multiple approval records for parallel approval mode (Phase 2B feature)
        
        Returns: List of created WorkflowApproval objects
        """
        from automations.models import WorkflowApproval
        from django.contrib.auth import get_user_model
        from datetime import timedelta
        
        User = get_user_model()
        created_approvals = []
        
        # Calculate timeout
        timeout = None
        if config.get('timeout_hours'):
            timeout = timezone.now() + timedelta(hours=config['timeout_hours'])
        
        # Prepare base approval context
        approval_context = self._prepare_approval_context(context)
        approval_context['validation_result'] = validation_result
        approval_context['parallel_approval'] = True
        
        for approver_id in approvers:
            try:
                # Get approver user
                approver = User.objects.get(id=approver_id)
                
                # Check for delegation (Phase 2B)
                original_approver = approver
                approver = self._check_delegation(approver, run, context)
                
                # Add delegation metadata if different
                current_context = approval_context.copy()
                if approver != original_approver:
                    current_context['delegated_from'] = original_approver.id
                    current_context['original_approver_name'] = original_approver.get_full_name()
                    current_context['delegated'] = True
                
                # Create approval record
                approval = WorkflowApproval.objects.create(
                    workflow_run=run,
                    step_id=step['id'],
                    approver=approver,
                    approval_message=config.get('approval_message', 'Approval required'),
                    timeout_at=timeout,
                    status='pending',
                    context_data=current_context
                )
                
                created_approvals.append(approval)
                
                # Send notification
                self._send_notifications(approval, config, run, validation_result)
                
            except User.DoesNotExist:
                logger.error(f"Approver with ID {approver_id} not found")
                continue
            except Exception as e:
                logger.error(f"Error creating approval for approver {approver_id}: {str(e)}")
                continue
        
        if not created_approvals:
            raise ValueError("Failed to create any approval records for parallel approval")
        
        return created_approvals
    
    def _resolve_field(self, field_path: str, context: Dict[str, Any]) -> Any:
        """Resolve field from context (e.g., 'form.manager_id')"""
        parts = field_path.split('.')
        value = context
        
        for part in parts:
            if isinstance(value, dict):
                value = value.get(part)
            else:
                value = getattr(value, part, None)
            
            if value is None:
                return None
        
        return value
    
    def _prepare_approval_context(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """Prepare context data for approval display"""
        # Extract key information for approval UI
        return {
            'form_data': context.get('form', {}),
            'calculated_values': {k: v for k, v in context.items() if k.startswith('calc_')},
        }
    
    def _send_notifications(self, approval, config: Dict[str, Any], run, validation_result: Dict[str, Any] = None):
        """Send approval request notifications with validation info"""
        channels = config.get('notification_channels', ['email', 'in_app'])
        
        if 'email' in channels:
            self._send_email_notification(approval, run, validation_result)
        
        if 'in_app' in channels:
            self._create_in_app_notification(approval, run, validation_result)
    
    def _send_email_notification(self, approval, run, validation_result=None):
        """Send email to approver with validation details"""
        try:
            subject = f"Approval Required: {run.template.name}"
            
            validation_info = ""
            if validation_result and validation_result.get('checks'):
                validation_info = "\n\nValidation Results:\n"
                for check in validation_result['checks']:
                    status = "✓" if check['passed'] else "✗"
                    validation_info += f"{status} {check['message']}\n"
            
            message = f"""
You have a pending approval request.

Workflow: {run.template.name}
Run Reference: {run.run_reference}
Message: {approval.approval_message}
{validation_info}
Please review and approve/reject at:
{settings.FRONTEND_URL}/approvals/{approval.id}

This approval will timeout at: {approval.timeout_at if approval.timeout_at else 'No timeout'}
            """
            
            send_mail(
                subject=subject,
                message=message,
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[approval.approver.email],
                fail_silently=False,
            )
            
            logger.info(f"Sent approval email to {approval.approver.email}")
        
        except Exception as e:
            logger.error(f"Failed to send approval email: {str(e)}")
    
    def _create_in_app_notification(self, approval, run, validation_result=None):
        """Create in-app notification with validation info"""
        try:
            from notifications.models import Notification
            
            notification_data = {
                'approval_id': approval.id,
                'workflow_run_id': run.id,
                'run_reference': run.run_reference,
            }
            
            if validation_result:
                notification_data['validation_result'] = validation_result
            
            Notification.objects.create(
                recipient=approval.approver,
                notification_type='approval_request',
                title=f"Approval Required: {run.template.name}",
                message=approval.approval_message,
                data=notification_data,
                link=f"/approvals/{approval.id}",
            )
            
            logger.info(f"Created in-app notification for {approval.approver.email}")
        
        except Exception as e:
            logger.error(f"Failed to create in-app notification: {str(e)}")


# automations/models.py - Add WorkflowApproval model

from django.db import models
from django.contrib.auth import get_user_model



# Create migration
# python manage.py makemigrations automations
# python manage.py migrate