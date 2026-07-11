"""
Accounting functions for SaaS subscription billing

Handles double-entry transactions on both sides:
- System admin's books
- Tenant's books
"""

from django.db import transaction as db_transaction
from django.utils import timezone
from decimal import Decimal


def generate_invoice_transactions(invoice):
    """
    Generate accounting transactions when invoice is created
    
    YOUR BOOKS:
        Debit: Accounts Receivable (Tenant ABC - Outstanding)
        Credit: Income (Tenant ABC - Subscription Income)
    
    TENANT'S BOOKS:
        Debit: Expense (SaaS Subscription Expense)
        Credit: Payable (SaaS Vendor Payable)
    """
    from transactions.models import Transaction, TransactionEntry as TransactionLine
    
    subscription = invoice.subscription
    
    with db_transaction.atomic():
        # 1. Transaction in YOUR admin account
        admin_tx = Transaction.objects.create(
            owner=subscription.income_account.owner,
            branch=subscription.income_account.branch,
            tenant=subscription.income_account.tenant,
            transaction_type='journal',
            date=invoice.invoice_date,
            description=f"Subscription invoice for {subscription.tenant_owner.email}",
            reference=invoice.invoice_number,
        )
        
        # Debit: Accounts Receivable
        admin_debit = TransactionLine.objects.create(
            transaction=admin_tx,
            account=subscription.receivable_account,
            side=TransactionLine.DEBIT,
            amount=invoice.amount,
            description=f"Invoice {invoice.invoice_number}"
        )

        # Credit: Subscription Income
        admin_credit = TransactionLine.objects.create(
            transaction=admin_tx,
            account=subscription.income_account,
            side=TransactionLine.CREDIT,
            amount=invoice.amount,
            description=f"Invoice {invoice.invoice_number}"
        )
        
        # Validate and post admin transaction
        admin_tx.full_clean()
        from accounts.models import Account
        Account.objects.select_for_update().filter(pk__in=[subscription.receivable_account.pk, subscription.income_account.pk])
        admin_debit.post()
        admin_credit.post()
        
        invoice.admin_transaction = admin_tx
        
        # 2. Transaction in TENANT's account
        tenant_tx = Transaction.objects.create(
            owner=subscription.tenant_owner,
            branch=subscription.tenant_owner.branch,
            tenant=subscription.tenant_owner.tenant,
            transaction_type='journal',
            date=invoice.invoice_date,
            description=f"SaaS subscription expense for {invoice.period_start} to {invoice.period_end}",
            reference=invoice.invoice_number,
        )
        
        # Debit: SaaS Subscription Expense
        tenant_debit = TransactionLine.objects.create(
            transaction=tenant_tx,
            account=subscription.tenant_expense_account,
            side=TransactionLine.DEBIT,
            amount=invoice.amount,
            description=f"Invoice {invoice.invoice_number}"
        )

        # Credit: SaaS Vendor Payable
        tenant_credit = TransactionLine.objects.create(
            transaction=tenant_tx,
            account=subscription.tenant_payable_account,
            side=TransactionLine.CREDIT,
            amount=invoice.amount,
            description=f"Invoice {invoice.invoice_number}"
        )
        
        # Validate and post tenant transaction
        tenant_tx.full_clean()
        Account.objects.select_for_update().filter(pk__in=[subscription.tenant_expense_account.pk, subscription.tenant_payable_account.pk])
        tenant_debit.post()
        tenant_credit.post()
        
        invoice.tenant_transaction = tenant_tx
        invoice.save()


def record_payment_transactions(invoice, payment_proof):
    """
    Record payment after admin approval
    
    YOUR BOOKS:
        Debit: Cash
        Credit: Accounts Receivable (Tenant ABC - Outstanding)
    
    TENANT'S BOOKS:
        Debit: SaaS Vendor Payable
        Credit: Cash
    """
    from transactions.models import Transaction, TransactionLine
    from accounts.models import Account
    
    subscription = invoice.subscription
    
    with db_transaction.atomic():
        # 1. Payment transaction in YOUR admin account
        # Get or create cash account
        cash_account, created = Account.objects.get_or_create(
            code='1100',
            owner=subscription.income_account.owner,
            branch=subscription.income_account.branch,
            defaults={
                'name': 'Cash and Cash Equivalents',
                'account_type': 'ASSET',
                'account_level': 'PARENT',
                'allow_manual_entries': False,
                'is_system_account': True
            }
        )
        
        admin_payment_tx = Transaction.objects.create(
            owner=subscription.income_account.owner,
            branch=subscription.income_account.branch,
            tenant=subscription.income_account.tenant,
            transaction_type='receipt',
            date=payment_proof.payment_date,
            description=f"Payment received from {subscription.tenant_owner.email}",
            reference=payment_proof.reference_number,
        )
        
        # Debit: Cash
        admin_debit = TransactionLine.objects.create(
            transaction=admin_payment_tx,
            account=cash_account,
            side=TransactionLine.DEBIT,
            amount=payment_proof.amount,
            description=f"Payment for invoice {invoice.invoice_number}"
        )

        # Credit: Accounts Receivable
        admin_credit = TransactionLine.objects.create(
            transaction=admin_payment_tx,
            account=subscription.receivable_account,
            side=TransactionLine.CREDIT,
            amount=payment_proof.amount,
            description=f"Payment for invoice {invoice.invoice_number}"
        )
        
        # Validate and post admin payment transaction
        admin_payment_tx.full_clean()
        Account.objects.select_for_update().filter(pk__in=[cash_account.pk, subscription.receivable_account.pk])
        admin_debit.post()
        admin_credit.post()
        
        # 2. Payment transaction in TENANT's account
        # Get or create tenant's cash account
        tenant_cash_account, created = Account.objects.get_or_create(
            code='1100',
            owner=subscription.tenant_owner,
            branch=subscription.tenant_owner.branch,
            defaults={
                'name': 'Cash and Cash Equivalents',
                'account_type': 'ASSET',
                'account_level': 'PARENT',
                'allow_manual_entries': False,
                'is_system_account': True
            }
        )
        
        tenant_payment_tx = Transaction.objects.create(
            owner=subscription.tenant_owner,
            branch=subscription.tenant_owner.branch,
            tenant=subscription.tenant_owner.tenant,
            transaction_type='payment',
            date=payment_proof.payment_date,
            description=f"SaaS subscription payment",
            reference=payment_proof.reference_number,
        )
        
        # Debit: SaaS Vendor Payable
        tenant_debit = TransactionLine.objects.create(
            transaction=tenant_payment_tx,
            account=subscription.tenant_payable_account,
            side=TransactionLine.DEBIT,
            amount=payment_proof.amount,
            description=f"Payment for invoice {invoice.invoice_number}"
        )

        # Credit: Cash
        tenant_credit = TransactionLine.objects.create(
            transaction=tenant_payment_tx,
            account=tenant_cash_account,
            side=TransactionLine.CREDIT,
            amount=payment_proof.amount,
            description=f"Payment for invoice {invoice.invoice_number}"
        )
        
        # Validate and post tenant payment transaction
        tenant_payment_tx.full_clean()
        Account.objects.select_for_update().filter(pk__in=[subscription.tenant_payable_account.pk, tenant_cash_account.pk])
        tenant_debit.post()
        tenant_credit.post()


def generate_subscription_invoice(subscription, period_start, period_end):
    """
    Generate invoice and accounting transactions for a billing period
    
    Called by Celery task on billing date
    """
    from accounts.subscription_models import SubscriptionInvoice
    
    # Generate invoice number
    invoice_number = f"SUB-{subscription.id}-{timezone.now().strftime('%Y%m%d%H%M%S')}"
    
    # Create invoice
    invoice = SubscriptionInvoice.objects.create(
        subscription=subscription,
        invoice_number=invoice_number,
        invoice_date=timezone.now().date(),
        due_date=subscription.next_billing_date,
        amount=subscription.get_price_for_frequency(),
        period_start=period_start,
        period_end=period_end,
        status='pending'
    )
    
    # Update subscription amount due
    subscription.current_amount_due = invoice.amount
    subscription.save()
    
    # Generate accounting transactions
    generate_invoice_transactions(invoice)
    
    return invoice
