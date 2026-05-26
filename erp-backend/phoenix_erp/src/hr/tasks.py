# hr/tasks.py
"""
Scheduled tasks for HR & Payroll automation
"""
from celery import shared_task
from django.utils import timezone
from django.db import transaction
from decimal import Decimal
import logging

logger = logging.getLogger(__name__)


@shared_task(name='hr.tasks.auto_generate_monthly_payroll')
def auto_generate_monthly_payroll():
    """
    Auto-generate payroll on the 27th of each month
    
    This task should be scheduled to run on the 27th of every month.
    It will:
    1. Create a payroll for the current month
    2. Calculate payslips for all active staff
    3. Trigger the approval workflow
    
    Returns:
        dict: Summary of created payrolls per branch
    """
    from hr.models import Payroll, Staff, HRConfig
    from hr.services.payroll_service import PayrollService
    from users.models import Branch
    from automations.models import WorkflowTemplate, WorkflowRun
    
    today = timezone.now().date()
    
    # Verify it's the 27th
    if today.day != 27:
        logger.warning(f"Auto payroll task ran on day {today.day}, not 27th. Skipping.")
        return {'status': 'skipped', 'reason': 'Not the 27th of the month'}
    
    # Calculate payroll period (1st to last day of current month)
    period_start = today.replace(day=1)
    
    # Get last day of month
    if today.month == 12:
        next_month = today.replace(year=today.year + 1, month=1, day=1)
    else:
        next_month = today.replace(month=today.month + 1, day=1)
    period_end = next_month - timezone.timedelta(days=1)
    
    # Pay date is typically 1st of next month
    pay_date = next_month
    
    results = []
    branches = Branch.objects.filter(is_active=True, is_deleted=False)
    
    for branch in branches:
        try:
            with transaction.atomic():
                # Check if payroll already exists for this period
                existing = Payroll.objects.filter(
                    branch=branch,
                    period_start=period_start,
                    period_end=period_end,
                    is_deleted=False
                ).first()
                
                if existing:
                    logger.info(f"Payroll already exists for {branch.name}: {existing.reference_number}")
                    results.append({
                        'branch': branch.name,
                        'status': 'skipped',
                        'reason': 'Already exists',
                        'reference': existing.reference_number
                    })
                    continue
                
                # Generate reference number
                payroll_count = Payroll.objects.filter(
                    branch=branch,
                    period_start__year=today.year,
                    period_start__month=today.month
                ).count()
                reference_number = f"PAY-{branch.code}-{today.strftime('%Y%m')}-{payroll_count + 1:03d}"
                
                # Create payroll
                payroll = Payroll.objects.create(
                    tenant=getattr(branch.owner, 'tenant', None),
                    reference_number=reference_number,
                    period_start=period_start,
                    period_end=period_end,
                    pay_date=pay_date,
                    status='draft',
                    branch=branch,
                    owner=branch.owner,
                    notes=f'Auto-generated on {today.isoformat()}'
                )
                
                # Calculate payroll (generate payslips)
                service = PayrollService(payroll)
                staff_list = Staff.objects.filter(
                    branch=branch,
                    is_deleted=False
                )
                
                calculation_result = service.calculate_payroll(staff_list)
                
                logger.info(
                    f"Generated payroll {reference_number} for {branch.name}: "
                    f"{calculation_result['payslips_created']} payslips, "
                    f"Total: ${calculation_result['total_net_pay']}"
                )
                
                # Try to trigger workflow if configured
                try:
                    config = HRConfig.objects.filter(branch=branch).first()
                    if config and config.default_payroll_workflow:
                        workflow_run = WorkflowRun.objects.create(
                            tenant=getattr(branch.owner, 'tenant', None),
                            workflow=config.default_payroll_workflow,
                            triggered_by_system=True,
                            context_data={
                                'payroll_id': payroll.id,
                                'reference_number': payroll.reference_number,
                                'period': f"{period_start} to {period_end}",
                                'auto_generated': True
                            },
                            branch=branch,
                            owner=branch.owner
                        )
                        payroll.workflow_run = workflow_run
                        payroll.save()
                        
                        logger.info(f"Triggered workflow {workflow_run.id} for payroll {reference_number}")
                except Exception as workflow_error:
                    logger.error(f"Failed to trigger workflow for {reference_number}: {str(workflow_error)}")
                    # Continue anyway - workflow is optional
                
                results.append({
                    'branch': branch.name,
                    'status': 'success',
                    'reference': reference_number,
                    'payslips_created': calculation_result['payslips_created'],
                    'total_net_pay': str(calculation_result['total_net_pay'])
                })
                
        except Exception as e:
            logger.error(f"Failed to generate payroll for {branch.name}: {str(e)}", exc_info=True)
            results.append({
                'branch': branch.name,
                'status': 'error',
                'error': str(e)
            })
    
    return {
        'status': 'completed',
        'date': today.isoformat(),
        'results': results
    }


@shared_task(name='hr.tasks.test_payroll_generation')
def test_payroll_generation(branch_id=None):
    """
    Test task for payroll generation (can be run manually)
    
    Args:
        branch_id: Optional branch ID to test for specific branch
        
    Returns:
        dict: Test results
    """
    from hr.models import Payroll, Staff
    from hr.services.payroll_service import PayrollService
    from users.models import Branch
    
    today = timezone.now().date()
    period_start = today.replace(day=1)
    
    # Get last day of month
    if today.month == 12:
        next_month = today.replace(year=today.year + 1, month=1, day=1)
    else:
        next_month = today.replace(month=today.month + 1, day=1)
    period_end = next_month - timezone.timedelta(days=1)
    pay_date = next_month
    
    if branch_id:
        branches = Branch.objects.filter(id=branch_id, is_active=True)
    else:
        branches = Branch.objects.filter(is_active=True, is_deleted=False)[:1]  # Test with first branch
    
    results = []
    for branch in branches:
        try:
            reference_number = f"PAY-TEST-{branch.code}-{today.strftime('%Y%m%d%H%M')}"
            
            payroll = Payroll.objects.create(
                tenant=getattr(branch.owner, 'tenant', None),
                reference_number=reference_number,
                period_start=period_start,
                period_end=period_end,
                pay_date=pay_date,
                status='draft',
                branch=branch,
                owner=branch.owner,
                notes='Test payroll generation'
            )
            
            service = PayrollService(payroll)
            staff_list = Staff.objects.filter(branch=branch, is_deleted=False)[:5]  # Test with first 5 staff
            
            calculation_result = service.calculate_payroll(staff_list)
            
            results.append({
                'branch': branch.name,
                'status': 'success',
                'reference': reference_number,
                'payslips': calculation_result['payslips_created']
            })
        except Exception as e:
            results.append({
                'branch': branch.name,
                'status': 'error',
                'error': str(e)
            })
    
    return {'status': 'completed', 'results': results}


# ===========================================================================
# App 2 – notify compliance service after payroll approval
# ===========================================================================

@shared_task(
    bind=True,
    name='hr.tasks.notify_compliance_service',
    max_retries=5,
    default_retry_delay=60,  # seconds; Celery doubles for each retry up to 5×
)
def notify_compliance_service(self, payroll_pk: int):
    """
    Fired by PayrollService.approve_payroll() via .delay() immediately
    after the payroll status is set to 'approved'.

    Builds the internal-API URL for App 2 to consume:
        GET /api/internal/hr/payrolls/<pk>/statutory-summary/

    Java App 2 (phoenix-compliance-svc) is triggered by creating a
    ``PayrollStatutoryFiling`` stub for each filing type so that App 2
    can pick them up via its Spring Integration inbound gateway.  The
    Java app polls / subscribes to the filing-list endpoint.

    If the HR module is not yet fully operational (e.g. test env) this
    task degrades gracefully: it logs a warning and does not raise.
    """
    from hr.models import Payroll, PayrollStatutoryFiling
    from django.db import IntegrityError

    logger.info('notify_compliance_service: payroll_pk=%s', payroll_pk)

    try:
        payroll = Payroll.objects.get(pk=payroll_pk, is_deleted=False)
    except Payroll.DoesNotExist:
        # Payroll deleted between approval and task execution — nothing to do.
        logger.warning(
            'notify_compliance_service: Payroll pk=%s not found; skipping.', payroll_pk
        )
        return {'status': 'skipped', 'reason': 'Payroll not found'}

    if payroll.status != 'approved':
        logger.warning(
            'notify_compliance_service: Payroll pk=%s is in status=%s (expected approved); skipping.',
            payroll_pk, payroll.status,
        )
        return {'status': 'skipped', 'reason': f'Status is {payroll.status}'}

    # -----------------------------------------------------------------
    # Create PayrollStatutoryFiling stubs (idempotent) for each filing
    # type that App 2 needs to process.  App 2 polls
    # GET /api/internal/hr/statutory-filings/?status=pending and picks
    # up any new rows.
    # -----------------------------------------------------------------
    FILING_TYPES = ['paye', 'pension', 'nhf', 'nsitf']
    created_filings = []
    for filing_type in FILING_TYPES:
        try:
            filing, created = PayrollStatutoryFiling.objects.get_or_create(
                owner=payroll.owner,
                branch=payroll.branch,
                filing_type=filing_type,
                status='pending',
                reference_number__startswith=f'{payroll.reference_number}-{filing_type.upper()}',
                defaults={
                    'reference_number': f'{payroll.reference_number}-{filing_type.upper()}',
                    'period_start': payroll.period_start,
                    'period_end': payroll.period_end,
                    'total_amount': (
                        payroll.total_nhf if filing_type == 'nhf' else
                        payroll.total_nsitf if filing_type == 'nsitf' else
                        payroll.total_employee_pension if filing_type == 'pension' else
                        Decimal('0.00')   # PAYE total not yet on Payroll model
                    ),
                    'tenant': getattr(payroll, 'tenant', None),
                },
            )
            if created:
                filing.payrolls.add(payroll)
                created_filings.append(filing_type)
        except IntegrityError:
            # Already exists; no problem.
            pass

    logger.info(
        'notify_compliance_service: payroll_pk=%s — created filing stubs: %s',
        payroll_pk, created_filings or 'none (all already existed)',
    )
    return {'status': 'ok', 'payroll_pk': payroll_pk, 'created': created_filings}
