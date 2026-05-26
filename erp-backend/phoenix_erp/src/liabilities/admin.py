from django.contrib import admin
from django.utils.html import format_html
from django.urls import reverse
from django.utils.safestring import mark_safe

from .models import AccountsPayable, AccruedLiability, TaxLiability


@admin.register(AccountsPayable)
class AccountsPayableAdmin(admin.ModelAdmin):
    list_display = [
        'reference_number', 'vendor_name', 'invoice_number', 'invoice_date', 
        'due_date', 'amount', 'amount_paid', 'amount_due', 'status_display', 
        'days_overdue'
    ]
    list_filter = ['status', 'invoice_date', 'due_date', 'content_type']
    search_fields = ['reference_number', 'invoice_number', 'description']
    readonly_fields = ['reference_number', 'vendor_name', 'amount_due', 'created_at', 'updated_at']
    date_hierarchy = 'invoice_date'
    
    fieldsets = (
        ('Vendor Information', {
            'fields': ('vendor_name', 'content_type', 'object_id')
        }),
        ('Invoice Details', {
            'fields': ('reference_number', 'invoice_number', 'invoice_date', 'due_date', 'description')
        }),
        ('Financial Information', {
            'fields': ('account', 'amount', 'amount_paid', 'amount_due', 'status')
        }),
        ('Audit Trail', {
            'fields': ('created_at', 'updated_at', 'branch', 'owner'),
            'classes': ('collapse',)
        })
    )
    
    def status_display(self, obj):
        """Display status with color coding"""
        colors = {
            'unpaid': 'red',
            'partial': 'orange', 
            'paid': 'green',
            'overdue': 'darkred',
            'cancelled': 'gray'
        }
        color = colors.get(obj.status, 'black')
        return format_html(
            '<span style="color: {}; font-weight: bold;">{}</span>',
            color,
            obj.get_status_display()
        )
    status_display.short_description = 'Status'
    
    def days_overdue(self, obj):
        """Calculate and display days overdue"""
        if obj.status in ['paid', 'cancelled']:
            return '-'
        
        from django.utils import timezone
        today = timezone.now().date()
        
        if obj.due_date < today:
            days = (today - obj.due_date).days
            return format_html(
                '<span style="color: red; font-weight: bold;">{} days</span>',
                days
            )
        else:
            days = (obj.due_date - today).days
            return format_html(
                '<span style="color: green;">Due in {} days</span>',
                days
            )
    days_overdue.short_description = 'Days Overdue'
    
    def get_queryset(self, request):
        """Optimize queryset with related objects"""
        return super().get_queryset(request).select_related('account', 'content_type')


@admin.register(AccruedLiability)
class AccruedLiabilityAdmin(admin.ModelAdmin):
    list_display = [
        'description', 'expense_category', 'accrual_date', 
        'expected_payment_date', 'accrued_amount', 'paid_amount', 
        'remaining_balance'
    ]
    list_filter = ['accrual_date', 'expected_payment_date', 'expense_category']
    search_fields = ['description']
    date_hierarchy = 'accrual_date'
    
    def remaining_balance(self, obj):
        """Calculate remaining balance"""
        balance = obj.accrued_amount - obj.paid_amount
        color = 'green' if balance == 0 else 'red'
        return format_html(
            '<span style="color: {}; font-weight: bold;">{}</span>',
            color,
            balance
        )
    remaining_balance.short_description = 'Remaining Balance'


@admin.register(TaxLiability)
class TaxLiabilityAdmin(admin.ModelAdmin):
    list_display = [
        'tax_type', 'period_start', 'period_end', 'taxable_amount', 
        'tax_rate', 'tax_amount', 'paid_amount', 'remaining_balance'
    ]
    list_filter = ['tax_type', 'period_start', 'period_end']
    search_fields = ['tax_type']
    date_hierarchy = 'period_start'
    
    def remaining_balance(self, obj):
        """Calculate remaining tax balance"""
        balance = obj.tax_amount - obj.paid_amount
        color = 'green' if balance == 0 else 'red'
        return format_html(
            '<span style="color: {}; font-weight: bold;">{}</span>',
            color,
            balance
        )
    remaining_balance.short_description = 'Tax Balance'
