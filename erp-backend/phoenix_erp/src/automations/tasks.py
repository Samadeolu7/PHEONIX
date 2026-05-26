
# automations/tasks.py - Celery tasks for async execution

from celery import shared_task
from django.utils import timezone
import logging

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def execute_workflow_task(self, run_id: int):
    """
    Execute workflow asynchronously
    
    Args:
        run_id: WorkflowRun ID to execute
    
    This task is called by WorkflowOrchestrator.trigger_workflow()
    """
    from automations.models import WorkflowRun
    from automations.workflow_executor import WorkflowExecutor
    
    try:
        # Get workflow run
        run = WorkflowRun.objects.select_related('template').get(id=run_id)
        
        logger.info(f"Starting workflow execution: {run.run_reference}")
        
        # Create executor
        executor = WorkflowExecutor(run)
        
        # Execute workflow
        success = executor.execute()
        
        if success:
            logger.info(f"Workflow {run.run_reference} completed successfully")
        else:
            logger.error(f"Workflow {run.run_reference} failed: {run.error_message}")
        
        return {
            'run_id': run_id,
            'run_reference': run.run_reference,
            'success': success,
            'status': run.status,
        }
    
    except WorkflowRun.DoesNotExist:
        logger.error(f"WorkflowRun {run_id} not found")
        return {'error': 'WorkflowRun not found'}
    
    except Exception as exc:
        logger.exception(f"Workflow execution failed: {run_id}")
        
        # Update run status
        try:
            run = WorkflowRun.objects.get(id=run_id)
            run.status = 'failed'
            run.error_message = f"Task execution error: {str(exc)}"
            run.completed_at = timezone.now()
            run.save()
        except:
            pass
        
        # Retry task
        raise self.retry(exc=exc)


@shared_task
def cleanup_old_workflow_runs(days: int = 90):
    """
    Cleanup old completed workflow runs
    
    Args:
        days: Delete runs older than this many days
    
    Usage: Schedule this to run daily via celery beat
    """
    from automations.models import WorkflowRun
    from django.utils import timezone
    from datetime import timedelta
    
    cutoff_date = timezone.now() - timedelta(days=days)
    
    # Only delete completed/failed runs
    deleted_count = WorkflowRun.objects.filter(
        status__in=['completed', 'failed', 'cancelled'],
        completed_at__lt=cutoff_date
    ).delete()[0]
    
    logger.info(f"Cleaned up {deleted_count} old workflow runs")
    
    return {'deleted': deleted_count, 'cutoff_date': cutoff_date.isoformat()}


@shared_task
def retry_failed_workflows(hours: int = 24):
    """
    Automatically retry recently failed workflows
    
    Args:
        hours: Retry workflows that failed within this many hours
    
    Usage: Schedule this to run hourly via celery beat
    """
    from automations.models import WorkflowRun
    from automations.workflow_executor import WorkflowOrchestrator
    from django.utils import timezone
    from datetime import timedelta
    
    cutoff_date = timezone.now() - timedelta(hours=hours)
    
    # Find failed runs that haven't been retried yet
    # Note: Removed execution_log filter - WorkflowRun doesn't have retry_count field
    # Each retry creates a new WorkflowRun, so we just look for recent failed runs
    failed_runs = WorkflowRun.objects.filter(
        status='failed',
        completed_at__gte=cutoff_date,
        is_deleted=False
    )
    
    retried_count = 0
    
    for run in failed_runs:
        try:
            # Check if error is retryable (not validation errors)
            if 'validation' not in run.error_message.lower():
                WorkflowOrchestrator.retry_failed_workflow(run.id)
                retried_count += 1
        except Exception as e:
            logger.error(f"Failed to retry workflow {run.id}: {str(e)}")
    
    logger.info(f"Retried {retried_count} failed workflows")
    
    return {'retried': retried_count}


# ============================================
# PHASE 2B: AUTO-ESCALATION TASK
# ============================================

@shared_task
def check_approval_timeouts():
    """
    Check for timed-out approvals and escalate them
    
    This task should be scheduled to run every hour via celery beat.
    Escalates approvals that have exceeded their timeout_at timestamp.
    """
    from automations.models import WorkflowApproval
    from django.utils import timezone
    
    now = timezone.now()
    
    # Find pending approvals that have timed out
    timed_out_approvals = WorkflowApproval.objects.filter(
        status='pending',
        timeout_at__lte=now,
        timeout_at__isnull=False
    ).select_related('approver', 'workflow_run')
    
    escalated_count = 0
    failed_count = 0
    
    for approval in timed_out_approvals:
        try:
            # Get escalation configuration from workflow step
            step = approval.workflow_run.template.get_step_by_id(approval.step_id)
            if not step:
                logger.warning(f"Step {approval.step_id} not found for approval {approval.id}")
                continue
            
            escalation_config = step.get('escalation', {})
            max_escalations = escalation_config.get('max_levels', 2)
            escalate_to_role = escalation_config.get('escalate_to_role')
            
            # Check if we've reached max escalations
            if approval.escalation_level >= max_escalations:
                # Max escalations reached - mark as timeout
                approval.status = 'timeout'
                approval.save()
                
                # Optionally fail the workflow
                if escalation_config.get('fail_on_max_escalation', True):
                    approval.workflow_run.status = 'failed'
                    approval.workflow_run.error_message = f"Approval timed out after reaching max escalation levels ({max_escalations})"
                    approval.workflow_run.completed_at = now
                    approval.workflow_run.save()
                    failed_count += 1
                
                logger.info(f"Approval {approval.id} marked as timeout after {max_escalations} escalations")
                continue
            
            # Find next level approver  
            # Get branch from workflow run if available
            run_branch = getattr(approval.workflow_run, 'branch', None)
            
            next_approver = find_escalation_approver(
                approval.approver,
                escalate_to_role,
                run_branch
            )
            
            if not next_approver:
                logger.warning(f"No escalation approver found for approval {approval.id}")
                # Mark as timeout if no escalation path
                approval.status = 'timeout'
                approval.save()
                continue
            
            # Create new escalated approval
            escalated_approval = WorkflowApproval.objects.create(
                workflow_run=approval.workflow_run,
                step_id=approval.step_id,
                approver=next_approver,
                status='pending',
                approval_message=f"ESCALATED: {approval.approval_message}",
                context_data=approval.context_data,
                escalation_level=approval.escalation_level + 1,
                escalated_from=approval.approver,
                escalated_at=now,
                timeout_at=now + timezone.timedelta(hours=escalation_config.get('timeout_hours', 24))
            )
            
            # Mark original approval as escalated (using timeout status for now)
            approval.status = 'timeout'
            approval.save()
            
            escalated_count += 1
            logger.info(
                f"Escalated approval {approval.id} to {next_approver.username} "
                f"(level {escalated_approval.escalation_level})"
            )
            
            # TODO: Send notification to new approver
            
        except Exception as e:
            failed_count += 1
            logger.exception(f"Failed to escalate approval {approval.id}: {str(e)}")
    
    return {
        'checked': timed_out_approvals.count(),
        'escalated': escalated_count,
        'failed': failed_count,
        'timestamp': now.isoformat()
    }


def find_escalation_approver(current_approver, escalate_to_role, branch):
    """
    Find the next approver for escalation
    
    Args:
        current_approver: Current approver User object
        escalate_to_role: Role name to escalate to (e.g., 'manager', 'supervisor', 'cfo')
        branch: Branch object
    
    Returns:
        User object or None
    """
    from users.models import User
    
    # Strategy 1: If role specified, find user with that role in same branch
    if escalate_to_role and branch:
        potential_approvers = User.objects.filter(
            branch=branch,
            roles__name=escalate_to_role,
            is_active=True
        ).exclude(id=current_approver.id)
        
        return potential_approvers.first()
    
    # Strategy 2: Find user's manager/supervisor
    # Check if manager attribute exists and is not None
    try:
        manager = getattr(current_approver, 'manager', None)
        if manager and manager != current_approver:
            return manager
    except (AttributeError, Exception) as e:
        logger.debug(f"No manager found for user {current_approver.id}: {str(e)}")
        pass
    
    # Strategy 3: Find branch manager
    if branch:
        try:
            if branch.manager and branch.manager != current_approver:
                return branch.manager
        except AttributeError:
            pass
    
    # Strategy 4: Find any user with higher role level
    # This assumes roles have a level/hierarchy field
    # Fallback: return None and let timeout handling decide
    
    return None