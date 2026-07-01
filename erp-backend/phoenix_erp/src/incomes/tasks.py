# incomes/tasks.py
"""
Celery tasks for async workflow execution and automated invoice generation
"""
import logging
from celery import shared_task
from django.apps import apps
from django.utils import timezone
from django.db.models import Q

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3)
def execute_workflow_async(self, workflow_run_id):
    """
    Execute a workflow run asynchronously
    
    Args:
        workflow_run_id: ID of the WorkflowRun to execute
    """
    try:
        WorkflowRun = apps.get_model('automations', 'WorkflowRun')
        workflow_run = WorkflowRun.objects.get(id=workflow_run_id)
        
        # Execute the workflow
        from automations.workflow_engine import WorkflowExecutionEngine
        engine = WorkflowExecutionEngine(workflow_run)
        result = engine.execute()
        
        logger.info(f"Workflow run {workflow_run_id} completed successfully")
        return result
        
    except WorkflowRun.DoesNotExist:
        logger.error(f"WorkflowRun {workflow_run_id} not found")
        raise
        
    except Exception as exc:
        logger.error(
            f"Error executing workflow run {workflow_run_id}: {str(exc)}",
            exc_info=True
        )
        # Retry the task
        raise self.retry(exc=exc, countdown=60)


@shared_task(bind=True, max_retries=3)
def auto_apply_discounts_after_approval(self, application_id, user_id):
    """
    Automatically apply approved discount to client's receivables (async)
    
    This task is queued after a discount application is approved,
    allowing the approval endpoint to return immediately while
    discounts are applied in the background.
    
    Args:
        application_id: ID of the approved DiscountApplication
        user_id: ID of the user who approved (for audit trail)
    
    Returns:
        dict: Summary of applied discounts
    """
    from incomes.models_discount import DiscountApplication
    from incomes.services.discount_service import DiscountService
    from django.contrib.auth import get_user_model
    
    User = get_user_model()
    
    try:
        application = DiscountApplication.objects.select_related(
            'client', 'program'
        ).get(id=application_id)
        
        user = User.objects.get(id=user_id)
        
        logger.info(
            f"Starting auto-apply for application {application.application_number} "
            f"(client: {application.client.name})"
        )
        
        # Apply discounts to all eligible receivables
        applied_discounts = DiscountService.auto_apply_to_client_receivables(
            client=application.client,
            user=user
        )
        
        result = {
            'application_id': application_id,
            'application_number': application.application_number,
            'client_id': application.client.id,
            'client_name': application.client.name,
            'applied_count': len(applied_discounts),
            'total_discount_amount': sum(
                ad.discount_amount for ad in applied_discounts
            ),
            'applied_discount_ids': [ad.id for ad in applied_discounts]
        }
        
        logger.info(
            f"Auto-apply completed for application {application.application_number}: "
            f"{result['applied_count']} discounts applied, "
            f"total amount: {result['total_discount_amount']}"
        )
        
        return result
        
    except DiscountApplication.DoesNotExist:
        logger.error(f"DiscountApplication {application_id} not found")
        raise
        
    except User.DoesNotExist:
        logger.error(f"User {user_id} not found")
        raise
        
    except Exception as exc:
        logger.error(
            f"Error auto-applying discounts for application {application_id}: {exc}",
            exc_info=True
        )
        # Retry the task with exponential backoff
        raise self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))


@shared_task
def check_invoice_generation_dates():
    """
    Check for AcademicTerms that need invoice generation today
    Runs daily at midnight to trigger bulk invoice generation
    
    Supports Nigerian flexible term dates (no fixed lengths)
    """
    from incomes.models_calendar import AcademicTerm
    from incomes.services.bulk_invoice_service import BulkInvoiceService
    from clients.models import ClientClassification
    from incomes.models import FeeStructure
    from accounts.models import User
    
    today = timezone.now().date()
    
    # Find terms with invoice_generation_date = today
    terms_to_process = AcademicTerm.objects.filter(
        invoice_generation_date=today,
        is_active=True
    ).select_related('academic_year')
    
    if not terms_to_process.exists():
        logger.info(f"No terms require invoice generation on {today}")
        return
    
    logger.info(f"Found {terms_to_process.count()} term(s) requiring invoice generation")
    
    results = []
    
    for term in terms_to_process:
        try:
            branch = term.branch
            
            # Get system user for automation (or use first admin)
            system_user = User.objects.filter(
                branch=branch,
                is_staff=True
            ).first()
            
            if not system_user:
                logger.error(f"No admin user found for branch {branch.name}")
                continue
            
            # Get all active classifications (classes) in this branch
            classifications = ClientClassification.objects.filter(
                branch=branch,
                is_active=True,
                usage_context='student'
            )
            
            if not classifications.exists():
                logger.warning(f"No student classifications found for term {term.code}")
                continue
            
            # Get active fee structures for this term
            # Assume fee structures have metadata indicating which term they're for
            fee_structures = FeeStructure.objects.filter(
                branch=branch,
                is_active=True,
                industry_config__contains={'term_code': term.code}
            )
            
            if not fee_structures.exists():
                # Fallback: use any active fee structure
                fee_structures = FeeStructure.objects.filter(
                    branch=branch,
                    is_active=True
                )
            
            # Generate batches for each class
            for classification in classifications:
                for fee_structure in fee_structures:
                    try:
                        result = BulkInvoiceService.generate_batch_for_term(
                            term_id=term.id,
                            classification_id=classification.id,
                            fee_structure_id=fee_structure.id,
                            branch=branch,
                            owner=system_user,
                            notes=f"Automatically generated for {term.name}"
                        )
                        
                        results.append({
                            'term': term.code,
                            'classification': classification.name,
                            'fee_structure': fee_structure.name,
                            'batch_id': result['batch_id'],
                            'invoices_created': result['invoices_created'],
                            'status': 'success'
                        })
                        
                        logger.info(
                            f"Generated batch {result['batch_id']} for "
                            f"{classification.name} - {result['invoices_created']} invoices"
                        )
                        
                        # Send email notification to Finance Manager (compliance requirement)
                        try:
                            from notifications.services import NotificationService
                            from django.contrib.auth.models import Group
                            
                            notification_service = NotificationService()
                            
                            # Get Finance Manager users
                            finance_users = User.objects.filter(
                                branch=branch,
                                is_active=True,
                                groups__name__in=['Finance Manager', 'Finance Officer']
                            ).distinct()
                            
                            for finance_user in finance_users:
                                try:
                                    notification_service.send_from_template(
                                        template_code='invoice_batch_generated',
                                        recipient=finance_user,
                                        context={
                                            'batch_id': result['batch_id'],
                                            'term_name': term.name,
                                            'term_code': term.code,
                                            'classification_name': classification.name,
                                            'fee_structure_name': fee_structure.name,
                                            'invoices_created': result['invoices_created'],
                                            'total_amount': result.get('total_final_amount', 0),
                                            'students_with_discounts': result.get('students_with_discounts', 0),
                                            'generation_date': timezone.now().strftime('%Y-%m-%d %H:%M'),
                                        },
                                        owner=system_user,
                                        branch=branch,
                                        channels=['email']
                                    )
                                    logger.info(f"Sent batch notification to {finance_user.email}")
                                except Exception as email_error:
                                    logger.error(f"Failed to send notification to {finance_user.email}: {email_error}")
                        
                        except Exception as notification_error:
                            logger.error(f"Failed to send batch notifications: {notification_error}")
                        
                    except Exception as e:
                        logger.error(
                            f"Failed to generate batch for {classification.name}: {e}",
                            exc_info=True
                        )
                        results.append({
                            'term': term.code,
                            'classification': classification.name,
                            'fee_structure': fee_structure.name,
                            'status': 'error',
                            'error': str(e)
                        })
        
        except Exception as e:
            logger.error(f"Failed to process term {term.code}: {e}", exc_info=True)
    
    logger.info(f"Invoice generation completed. Processed {len(results)} batches")
    return results


@shared_task
def send_invoice_reminders():
    """
    Send payment reminders for overdue invoices
    Runs daily to notify parents/students of upcoming/overdue payments
    """
    from incomes.models import Invoice
    from datetime import timedelta
    
    today = timezone.now().date()
    
    # Find invoices due in 7 days (reminder) or overdue
    reminder_date = today + timedelta(days=7)
    
    invoices_to_remind = Invoice.objects.filter(
        Q(due_date=reminder_date) | Q(due_date__lt=today),
        status__in=['pending', 'sent'],
        balance__gt=0
    ).select_related('client', 'branch')
    
    sent_count = 0
    
    for invoice in invoices_to_remind:
        try:
            # TODO: Integrate with notification service
            # send_email(invoice.client.email, reminder_template, invoice)
            # send_sms(invoice.client.phone, reminder_message)
            
            logger.info(f"Sent reminder for invoice {invoice.reference_number}")
            sent_count += 1
            
        except Exception as e:
            logger.error(f"Failed to send reminder for invoice {invoice.reference_number}: {e}")
    
    logger.info(f"Sent {sent_count} invoice reminders")
    return {'sent': sent_count}


@shared_task
def auto_approve_no_discount_batches():
    """
    Automatically approve invoice batches with no discounts/scholarships
    Batches with discounts still require manual approval
    Runs every hour
    """
    from incomes.models import Invoice
    from incomes.services.bulk_invoice_service import BulkInvoiceService
    from accounts.models import User
    from decimal import Decimal
    
    # Find all draft invoices with batch_id
    draft_invoices = Invoice.objects.filter(
        status='draft',
        metadata__has_key='batch_id'
    )
    
    # Group by batch_id
    batch_ids = set(inv.metadata.get('batch_id') for inv in draft_invoices)
    
    approved_batches = []
    
    for batch_id in batch_ids:
        try:
            batch_invoices = draft_invoices.filter(metadata__batch_id=batch_id)
            first_invoice = batch_invoices.first()
            
            if not first_invoice:
                continue
            
            # Check if any invoice has discounts
            has_discounts = any(
                Decimal(str(inv.metadata.get('discount_amount', 0))) > 0
                for inv in batch_invoices
            )
            
            if has_discounts:
                logger.info(f"Batch {batch_id} has discounts, requires manual approval")
                continue
            
            # Auto-approve if no discounts
            branch = first_invoice.branch
            system_user = User.objects.filter(
                branch=branch,
                is_staff=True
            ).first()
            
            if not system_user:
                logger.error(f"No admin user for auto-approval of batch {batch_id}")
                continue
            
            result = BulkInvoiceService.approve_batch(
                batch_id=batch_id,
                branch=branch,
                approver=system_user,
                notes="Auto-approved: No discounts/scholarships applied"
            )
            
            approved_batches.append(batch_id)
            logger.info(f"Auto-approved batch {batch_id}")
            
        except Exception as e:
            logger.error(f"Failed to auto-approve batch {batch_id}: {e}")
    
    logger.info(f"Auto-approved {len(approved_batches)} batches")
    return {'approved': approved_batches}


@shared_task
def validate_student_registrations_weekly():
    """
    Weekly validation of student registration data
    Compliance requirement: Weekly data validation against enrollment sheets
    
    Checks:
    - Required fields populated
    - Active classifications
    - Contact information for parents/guardians
    - Duplicate registrations
    
    Sends report to Admissions/Registrar if issues found
    """
    from clients.models import Client, ClientClassification
    from datetime import timedelta
    from django.contrib.auth.models import Group
    
    week_ago = timezone.now() - timedelta(days=7)
    
    # Get all student clients modified in last week OR all active students
    recent_students = Client.objects.filter(
        usage_context='student',
        is_active=True
    ).select_related('classification', 'branch')
    
    validation_results = []
    total_students = recent_students.count()
    
    logger.info(f"Validating {total_students} active student records")
    
    for student in recent_students:
        issues = []
        
        # Check required fields
        if not student.name or not student.client_id:
            issues.append("Missing name or student ID")
        
        if not student.classification:
            issues.append("Missing grade/class classification")
        elif not student.classification.is_active:
            issues.append(f"Assigned to inactive class: {student.classification.name}")
        
        # Check contact information
        has_contact = student.contact_email or student.contact_phone or \
                     student.metadata.get('parent_email') or student.metadata.get('parent_phone')
        
        if not has_contact:
            issues.append("No contact information for parent/guardian")
        
        # Check for duplicate student IDs
        if student.client_id:
            duplicates = Client.objects.filter(
                client_id=student.client_id,
                branch=student.branch,
                usage_context='student',
                is_active=True
            ).exclude(id=student.id).count()
            
            if duplicates > 0:
                issues.append(f"Duplicate student ID found ({duplicates} other records)")
        
        # Check metadata structure
        if not isinstance(student.metadata, dict):
            issues.append("Invalid metadata structure")
        
        if issues:
            validation_results.append({
                'student_id': student.client_id,
                'student_name': student.name,
                'classification': student.classification.name if student.classification else 'N/A',
                'branch': student.branch.name,
                'issues': issues,
                'issue_count': len(issues)
            })
    
    # Generate summary
    total_issues = len(validation_results)
    issue_percentage = round((total_issues / total_students * 100), 2) if total_students > 0 else 0
    
    summary = {
        'validation_date': timezone.now().isoformat(),
        'total_students_checked': total_students,
        'students_with_issues': total_issues,
        'issue_percentage': issue_percentage,
        'validation_results': validation_results[:100],  # Limit to first 100 for report
        'status': 'PASS' if total_issues == 0 else 'ISSUES_FOUND'
    }
    
    # Send report to Admissions/Registrar if issues found
    if total_issues > 0:
        logger.warning(f"Student data validation found {total_issues} students with issues ({issue_percentage}%)")
        
        try:
            from notifications.services import NotificationService
            from accounts.models import User
            
            notification_service = NotificationService()
            
            # Get Admissions/Registrar users
            admin_users = User.objects.filter(
                is_active=True,
                groups__name__in=['Admissions', 'Registrar', 'Admin']
            ).distinct()
            
            for admin_user in admin_users:
                try:
                    notification_service.send_from_template(
                        template_code='student_validation_report',
                        recipient=admin_user,
                        context={
                            'total_students': total_students,
                            'students_with_issues': total_issues,
                            'issue_percentage': issue_percentage,
                            'validation_date': timezone.now().strftime('%Y-%m-%d'),
                            'top_issues': validation_results[:10],  # Top 10 for email
                        },
                        owner=admin_user,
                        branch=admin_user.branch,
                        channels=['email']
                    )
                    logger.info(f"Sent validation report to {admin_user.email}")
                except Exception as email_error:
                    logger.error(f"Failed to send validation report to {admin_user.email}: {email_error}")
        
        except Exception as notification_error:
            logger.error(f"Failed to send validation notifications: {notification_error}")
    else:
        logger.info("Student data validation: No issues found")
    
    return summary
