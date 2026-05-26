"""
Celery Tasks for SaaS Subscription Billing Automation

Tasks:
1. check_subscription_reminders - Send payment reminders 7, 3, 1 days before due
2. check_overdue_subscriptions - Auto-suspend subscriptions 3 days after due date
3. generate_monthly_invoices - Generate invoices for subscriptions due today
4. track_subscription_usage - Daily usage tracking for plan limits
"""

from celery import shared_task
from django.utils import timezone
from django.core.mail import send_mail
from django.conf import settings
from datetime import timedelta
from dateutil.relativedelta import relativedelta
import logging

logger = logging.getLogger(__name__)


@shared_task
def check_subscription_reminders():
    """
    Send payment reminders at 7, 3, and 1 day(s) before due date
    
    Runs: Daily at 8:00 AM
    """
    from accounts.subscription_models import TenantSubscription
    
    today = timezone.now().date()
    reminder_days = [7, 3, 1]
    
    for days in reminder_days:
        target_date = today + timedelta(days=days)
        
        subscriptions = TenantSubscription.objects.filter(
            status='active',
            next_billing_date=target_date,
            is_deleted=False
        ).select_related('tenant_owner', 'subscription_product')
        
        for subscription in subscriptions:
            try:
                send_payment_reminder(subscription, days_remaining=days)
                logger.info(f"Sent {days}-day reminder to {subscription.tenant_owner.email}")
            except Exception as e:
                logger.error(f"Failed to send reminder to {subscription.tenant_owner.email}: {e}")
    
    return f"Processed reminders for {len(reminder_days)} date ranges"


def send_payment_reminder(subscription, days_remaining):
    """Send payment reminder email to tenant"""
    subject = f"Payment Reminder: {days_remaining} day{'s' if days_remaining > 1 else ''} until due"
    
    message = f"""
Dear {subscription.tenant_owner.get_full_name() or subscription.tenant_owner.email},

This is a friendly reminder that your subscription payment is due soon.

Subscription Details:
- Plan: {subscription.subscription_product.name}
- Billing Frequency: {subscription.get_billing_frequency_display()}
- Amount Due: ₦{subscription.current_amount_due:,.2f}
- Due Date: {subscription.next_billing_date.strftime('%B %d, %Y')}
- Days Remaining: {days_remaining}

Please ensure payment is made before the due date to avoid service interruption.

To submit payment proof after making payment:
1. Log in to your account
2. Navigate to Settings > Subscription
3. Click "Submit Payment Proof"
4. Upload your payment receipt and details

If you have already made payment, please disregard this reminder and ensure you've submitted your payment proof for verification.

Thank you for using {getattr(settings, 'COMPANY_NAME', 'our service')}!

Best regards,
{getattr(settings, 'COMPANY_NAME', 'The Team')}

---
This is an automated reminder. Please do not reply to this email.
    """
    
    send_mail(
        subject=subject,
        message=message,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[subscription.tenant_owner.email],
        fail_silently=False,
    )


@shared_task
def check_overdue_subscriptions():
    """
    Auto-suspend subscriptions that are 3+ days overdue
    
    Runs: Daily at 1:00 AM
    """
    from accounts.subscription_models import TenantSubscription
    
    today = timezone.now().date()
    grace_period_days = getattr(settings, 'SUBSCRIPTION_GRACE_PERIOD_DAYS', 3)
    cutoff_date = today - timedelta(days=grace_period_days)
    
    overdue_subscriptions = TenantSubscription.objects.filter(
        status='active',
        next_billing_date__lte=cutoff_date,
        is_deleted=False
    ).select_related('tenant_owner', 'subscription_product')
    
    suspended_count = 0
    for subscription in overdue_subscriptions:
        try:
            subscription.suspend(reason="Payment overdue")
            send_suspension_email(subscription)
            logger.info(f"Suspended subscription for {subscription.tenant_owner.email}")
            suspended_count += 1
        except Exception as e:
            logger.error(f"Failed to suspend subscription for {subscription.tenant_owner.email}: {e}")
    
    return f"Suspended {suspended_count} overdue subscriptions"


def send_suspension_email(subscription):
    """Notify tenant of subscription suspension"""
    subject = "Account Suspended - Payment Required"
    
    days_overdue = subscription.days_overdue()
    
    message = f"""
Dear {subscription.tenant_owner.get_full_name() or subscription.tenant_owner.email},

Your subscription has been suspended due to non-payment.

Subscription Details:
- Plan: {subscription.subscription_product.name}
- Payment Due Date: {subscription.next_billing_date.strftime('%B %d, %Y')}
- Amount Due: ₦{subscription.current_amount_due:,.2f}
- Days Overdue: {days_overdue}

Your account access has been restricted. You can only access the payment submission page.

To reactivate your account:
1. Make your payment using the bank details provided in your invoice
2. Log in to your account (you will be redirected to the payment page)
3. Click "Submit Payment Proof"
4. Upload your payment receipt with transaction details
5. Wait for admin approval (usually within 24 hours)

Once your payment is verified and approved, your account will be reactivated immediately.

Payment Details:
{getattr(settings, 'PAYMENT_INSTRUCTIONS', 'Contact support for payment instructions')}

For urgent assistance, please contact:
Email: {settings.DEFAULT_FROM_EMAIL}
Phone: {getattr(settings, 'SUPPORT_PHONE', 'Not specified')}

{getattr(settings, 'COMPANY_NAME', 'The Team')}

---
This is an automated notification. Please do not reply to this email.
    """
    
    send_mail(
        subject=subject,
        message=message,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[subscription.tenant_owner.email],
        fail_silently=False,
    )


@shared_task
def generate_monthly_invoices():
    """
    Generate invoices for subscriptions due today
    
    Runs: Daily at 12:00 AM (midnight) to catch all due dates
    """
    from accounts.subscription_models import TenantSubscription
    from accounts.subscription_accounting import generate_subscription_invoice
    
    today = timezone.now().date()
    
    due_subscriptions = TenantSubscription.objects.filter(
        status__in=['active', 'trial'],
        next_billing_date=today,
        is_deleted=False
    ).select_related('tenant_owner', 'subscription_product')
    
    generated_count = 0
    for subscription in due_subscriptions:
        try:
            # Determine billing period based on frequency
            period_start = subscription.next_billing_date
            
            if subscription.billing_frequency == 'monthly':
                period_end = period_start + relativedelta(months=1, days=-1)
            elif subscription.billing_frequency == 'quarterly':
                period_end = period_start + relativedelta(months=3, days=-1)
            elif subscription.billing_frequency == 'yearly':
                period_end = period_start + relativedelta(years=1, days=-1)
            else:
                # Custom frequency - default to monthly
                period_end = period_start + relativedelta(months=1, days=-1)
            
            # Generate invoice and accounting transactions
            invoice = generate_subscription_invoice(subscription, period_start, period_end)
            
            # Send invoice email
            send_invoice_email(subscription, invoice)
            
            logger.info(f"Generated invoice {invoice.invoice_number} for {subscription.tenant_owner.email}")
            generated_count += 1
            
        except Exception as e:
            logger.error(f"Failed to generate invoice for {subscription.tenant_owner.email}: {e}")
    
    return f"Generated {generated_count} invoices"


def send_invoice_email(subscription, invoice):
    """Send invoice notification to tenant"""
    subject = f"New Invoice: {invoice.invoice_number}"
    
    message = f"""
Dear {subscription.tenant_owner.get_full_name() or subscription.tenant_owner.email},

A new invoice has been generated for your subscription.

Invoice Details:
- Invoice Number: {invoice.invoice_number}
- Invoice Date: {invoice.invoice_date.strftime('%B %d, %Y')}
- Due Date: {invoice.due_date.strftime('%B %d, %Y')}
- Amount: ₦{invoice.amount:,.2f}

Billing Period: {invoice.period_start.strftime('%B %d, %Y')} to {invoice.period_end.strftime('%B %d, %Y')}

Subscription Plan: {subscription.subscription_product.name}
Billing Frequency: {subscription.get_billing_frequency_display()}

Payment Instructions:
{getattr(settings, 'PAYMENT_INSTRUCTIONS', 'Contact support for payment instructions')}

After making payment:
1. Log in to your account
2. Navigate to Settings > Subscription
3. Click "Submit Payment Proof"
4. Upload your payment receipt and enter transaction details
5. Your payment will be verified within 24 hours

Important: Payment must be received by {invoice.due_date.strftime('%B %d, %Y')} to avoid service interruption.

If you have any questions about this invoice, please contact us at {settings.DEFAULT_FROM_EMAIL}

Thank you for your business!

Best regards,
{getattr(settings, 'COMPANY_NAME', 'The Team')}

---
This is an automated notification. Please do not reply to this email.
    """
    
    send_mail(
        subject=subject,
        message=message,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[subscription.tenant_owner.email],
        fail_silently=False,
    )


@shared_task
def track_subscription_usage():
    """
    Track daily usage for all active subscriptions
    
    Records:
    - User count
    - Branch count
    - Transaction count (for the month)
    - Storage usage
    
    Runs: Daily at 11:00 PM
    """
    from accounts.subscription_models import TenantSubscription, SubscriptionUsageLog
    from users.models import User
    from branches.models import Branch
    from transactions.models import Transaction
    from django.db.models import Count, Sum
    
    today = timezone.now().date()
    
    active_subscriptions = TenantSubscription.objects.filter(
        status__in=['active', 'trial'],
        is_deleted=False
    ).select_related('tenant_owner')
    
    tracked_count = 0
    for subscription in active_subscriptions:
        try:
            tenant_owner = subscription.tenant_owner
            
            # Count users
            users_count = User.objects.filter(
                tenant=tenant_owner.tenant
            ).count()
            
            # Count branches
            branches_count = Branch.objects.filter(
                owner=tenant_owner,
                is_deleted=False
            ).count()
            
            # Count transactions for current month
            month_start = today.replace(day=1)
            transactions_count = Transaction.objects.filter(
                owner=tenant_owner,
                date__gte=month_start,
                is_deleted=False
            ).count()
            
            # Calculate storage usage (placeholder - implement based on your file storage)
            # This would need to query file attachments, documents, etc.
            storage_used_gb = 0  # TODO: Implement actual storage calculation
            
            # Update subscription usage
            subscription.current_users_count = users_count
            subscription.current_branches_count = branches_count
            subscription.current_transactions_count = transactions_count
            subscription.storage_used_gb = storage_used_gb
            subscription.save()
            
            # Check if limits are exceeded
            within_limits, message = subscription.is_within_usage_limits()
            exceeded_limits = [] if within_limits else [message]
            
            # Create usage log
            SubscriptionUsageLog.objects.update_or_create(
                subscription=subscription,
                log_date=today,
                defaults={
                    'users_count': users_count,
                    'branches_count': branches_count,
                    'transactions_count': transactions_count,
                    'storage_used_gb': storage_used_gb,
                    'exceeded_limits': exceeded_limits
                }
            )
            
            # Send warning email if limits exceeded
            if not within_limits:
                send_usage_limit_warning(subscription, message)
            
            tracked_count += 1
            logger.info(f"Tracked usage for {tenant_owner.email}: {users_count} users, {branches_count} branches")
            
        except Exception as e:
            logger.error(f"Failed to track usage for subscription {subscription.id}: {e}")
    
    return f"Tracked usage for {tracked_count} subscriptions"


def send_usage_limit_warning(subscription, limit_message):
    """Send warning email when usage limits are exceeded"""
    subject = "Usage Limit Exceeded - Upgrade Required"
    
    message = f"""
Dear {subscription.tenant_owner.get_full_name() or subscription.tenant_owner.email},

Your current usage has exceeded the limits of your subscription plan.

Current Plan: {subscription.subscription_product.name}
Issue: {limit_message}

Current Usage:
- Users: {subscription.current_users_count} / {subscription.max_users}
- Branches: {subscription.current_branches_count} / {subscription.max_branches}
- Transactions (this month): {subscription.current_transactions_count} / {subscription.max_transactions_per_month or 'Unlimited'}
- Storage: {subscription.storage_used_gb}GB / {subscription.storage_limit_gb or 'Unlimited'}GB

To continue using all features without interruption, please consider upgrading to a higher plan.

Available Plans:
- Professional Plan: More users, branches, and features
- Enterprise Plan: Unlimited usage and priority support

To upgrade or for assistance, please contact us at {settings.DEFAULT_FROM_EMAIL}

Best regards,
{getattr(settings, 'COMPANY_NAME', 'The Team')}

---
This is an automated notification. Please do not reply to this email.
    """
    
    send_mail(
        subject=subject,
        message=message,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[subscription.tenant_owner.email],
        fail_silently=False,
    )


@shared_task
def mark_invoices_overdue():
    """
    Mark pending invoices as overdue if past due date
    
    Runs: Daily at 2:00 AM
    """
    from accounts.subscription_models import SubscriptionInvoice
    
    today = timezone.now().date()
    
    pending_invoices = SubscriptionInvoice.objects.filter(
        status='pending',
        due_date__lt=today,
        is_deleted=False
    )
    
    updated_count = pending_invoices.update(status='overdue')
    
    logger.info(f"Marked {updated_count} invoices as overdue")
    return f"Marked {updated_count} invoices as overdue"


@shared_task
def send_admin_daily_report():
    """
    Send daily subscription report to system admin
    
    Includes:
    - New subscriptions
    - Pending payments
    - Suspended accounts
    - Income summary
    
    Runs: Daily at 9:00 AM
    """
    from accounts.subscription_models import TenantSubscription, PaymentProof, SubscriptionInvoice
    from users.models import User
    from django.db.models import Count, Sum
    from decimal import Decimal
    
    today = timezone.now().date()
    yesterday = today - timedelta(days=1)
    
    # Get system admin
    system_admin = User.objects.filter(is_system_admin=True).first()
    if not system_admin:
        logger.warning("No system admin found for daily report")
        return "No system admin found"
    
    # Gather statistics
    new_subscriptions = TenantSubscription.objects.filter(
        created_at__date=yesterday
    ).count()
    
    pending_payments = PaymentProof.objects.filter(
        status='submitted',
        is_deleted=False
    ).count()
    
    suspended_count = TenantSubscription.objects.filter(
        status='suspended',
        is_deleted=False
    ).count()
    
    active_count = TenantSubscription.objects.filter(
        status='active',
        is_deleted=False
    ).count()
    
    trial_count = TenantSubscription.objects.filter(
        status='trial',
        is_deleted=False
    ).count()
    
    # Income summary
    total_due = SubscriptionInvoice.objects.filter(
        status__in=['pending', 'overdue'],
        is_deleted=False
    ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
    
    paid_yesterday = SubscriptionInvoice.objects.filter(
        paid_at__date=yesterday,
        is_deleted=False
    ).aggregate(total=Sum('paid_amount'))['total'] or Decimal('0.00')
    
    # Send report
    subject = f"Daily Subscription Report - {today.strftime('%B %d, %Y')}"
    
    message = f"""
Daily Subscription Management Report
Date: {today.strftime('%B %d, %Y')}

SUBSCRIPTION STATUS:
- Active Subscriptions: {active_count}
- Trial Subscriptions: {trial_count}
- Suspended Accounts: {suspended_count}
- New Subscriptions (yesterday): {new_subscriptions}

PAYMENT STATUS:
- Pending Payment Approvals: {pending_payments}
- Total Outstanding Balance: ₦{total_due:,.2f}
- Payments Received Yesterday: ₦{paid_yesterday:,.2f}

ACTION REQUIRED:
{f"- Review {pending_payments} pending payment proof(s)" if pending_payments > 0 else "- No pending actions"}
{f"- Follow up with {suspended_count} suspended account(s)" if suspended_count > 0 else ""}

Log in to the admin panel to review and take action:
{getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')}/admin/

---
This is an automated daily report.
    """
    
    send_mail(
        subject=subject,
        message=message,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[system_admin.email],
        fail_silently=False,
    )
    
    logger.info(f"Sent daily report to {system_admin.email}")
    return "Daily report sent to system admin"
