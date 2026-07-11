# receivables/services.py
"""
Business logic for receivables management:
- Aging updates (batch processing)
- Overdue interest calculations
- Reporting and analytics

NOTE: PaymentAllocation, CustomerCreditLimit, InstallmentPlan removed - not needed
- Invoice.amount_paid tracks payments directly
- Credit scoring belongs in loans app
"""
from decimal import Decimal
from datetime import date, timedelta
from django.db import transaction
from django.db.models import Sum, Q
from django.core.exceptions import ValidationError

from .models import (
    CustomerReceivable,
    ReceivableActivityLog
)


class ReceivablesService:
    """Service for receivables business logic"""
    
    @staticmethod
    def calculate_aging_for_all():
        """Batch update aging for all open receivables"""
        receivables = CustomerReceivable.objects.filter(
            status__in=['pending', 'partial', 'overdue']
        )
        
        count = 0
        for receivable in receivables:
            receivable.update_aging()
            count += 1
        
        return count
    
    @staticmethod
    def apply_overdue_interest_batch():
        """Apply overdue interest to all overdue receivables with interest configured"""
        overdue_receivables = CustomerReceivable.objects.filter(
            status='overdue',
            overdue_interest_rate__gt=0
        )
        
        count = 0
        for receivable in overdue_receivables:
            interest = receivable.calculate_overdue_interest()
            if interest > 0:
                receivable.apply_overdue_interest()
                count += 1
                
                # Log activity
                ReceivableActivityLog.objects.create(
                    receivable=receivable,
                    activity_type='interest_applied',
                    amount=interest,
                    description=f"Overdue interest applied at {receivable.overdue_interest_rate}% annual",
                    owner=receivable.owner,
                    branch=receivable.branch,
                    tenant=receivable.tenant,
                )
        
        return count
    
    @staticmethod
    def get_customer_aging_summary(client):
        """
        Get aging summary for a customer.
        
        Returns:
            dict with aging buckets and totals
        """
        receivables = CustomerReceivable.objects.filter(
            client=client,
            status__in=['pending', 'partial', 'overdue']
        )
        
        summary = {
            'current': Decimal('0'),
            '1-30': Decimal('0'),
            '31-60': Decimal('0'),
            '61-90': Decimal('0'),
            '90+': Decimal('0'),
            'total': Decimal('0')
        }
        
        for receivable in receivables:
            bucket = receivable.aging_bucket
            summary[bucket] += receivable.balance
            summary['total'] += receivable.balance
        
        return summary
    
    @staticmethod
    def get_aging_report(branch=None, owner=None):
        """
        Get system-wide aging report.
        
        Returns:
            List of dicts with customer info and aging buckets
        """
        filters = Q(status__in=['pending', 'partial', 'overdue'])
        
        if branch:
            filters &= Q(branch=branch)
        if owner:
            filters &= Q(owner=owner)
        
        receivables = CustomerReceivable.objects.filter(filters).select_related('client')
        
        # Group by customer
        customer_data = {}
        for receivable in receivables:
            client_id = receivable.client.id
            
            if client_id not in customer_data:
                customer_data[client_id] = {
                    'client': receivable.client,
                    'client_name': receivable.client.name,
                    'current': Decimal('0'),
                    '1-30': Decimal('0'),
                    '31-60': Decimal('0'),
                    '61-90': Decimal('0'),
                    '90+': Decimal('0'),
                    'total': Decimal('0')
                }
            
            bucket = receivable.aging_bucket
            customer_data[client_id][bucket] += receivable.balance
            customer_data[client_id]['total'] += receivable.balance
        
        return list(customer_data.values())
