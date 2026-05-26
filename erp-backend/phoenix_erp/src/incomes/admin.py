from django.contrib import admin
from django.utils.html import format_html

from incomes.models_discount import DiscountProgram, DiscountApplication, AppliedDiscount
from .models import (
    IncomeCategory, ServiceItem, Income, FeeStructure, Invoice,
    FeeEntitlement, PaymentPlan, PaymentPlanInstallment
)


@admin.register(IncomeCategory)
class IncomeCategoryAdmin(admin.ModelAdmin):
    """Admin configuration for IncomeCategory"""
    list_display = ['name', 'code', 'description', 'is_active']
    list_filter = ['is_active']
    search_fields = ['name', 'code']

@admin.register(ServiceItem)
class ServiceItemAdmin(admin.ModelAdmin):
    """Admin configuration for ServiceItem"""
    list_display = ['name', 'code', 'category', 'description', 'is_active']
    list_filter = ['category', 'is_active']
    search_fields = ['name', 'code']

@admin.register(Income)
class IncomeAdmin(admin.ModelAdmin):
    """Admin configuration for Income"""
    list_display = ['id', 'category', 'amount', 'income_date', 'client']
    list_filter = ['category', 'income_date']
    search_fields = ['category__name', 'client__name', 'reference_number']

@admin.register(FeeStructure)
class FeeStructureAdmin(admin.ModelAdmin):
    """Admin configuration for FeeStructure"""
    list_display = ['name', 'category', 'description', 'is_active']
    list_filter = ['category', 'is_active']
    search_fields = ['name']

@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    """Admin configuration for Invoice"""
    list_display = ['invoice_number', 'client', 'amount', 'status', 'invoice_date']
    list_filter = ['status', 'invoice_date']
    search_fields = ['invoice_number', 'client__name']

@admin.register(FeeEntitlement)
class FeeEntitlementAdmin(admin.ModelAdmin):
    """Admin configuration for FeeEntitlement"""
    list_display = ['client', 'service_item', 'fee_structure', 'created_at']
    list_filter = ['fee_structure', 'service_item', 'created_at']
    search_fields = ['client__name', 'fee_structure__name', 'service_item__name']

@admin.register(PaymentPlan)
class PaymentPlanAdmin(admin.ModelAdmin):
    """Admin configuration for PaymentPlan"""
    list_display = ['plan_name', 'entitlement', 'total_amount', 'status', 'start_date', 'end_date']
    list_filter = ['status', 'frequency', 'start_date']
    search_fields = ['plan_name', 'entitlement__client__name']

@admin.register(PaymentPlanInstallment)
class PaymentPlanInstallmentAdmin(admin.ModelAdmin):
    """Admin configuration for PaymentPlanInstallment"""
    list_display = ['payment_plan', 'installment_number', 'due_date', 'amount_due', 'amount_paid', 'status']
    list_filter = ['status', 'due_date']
    search_fields = ['payment_plan__plan_name', 'payment_plan__entitlement__client__name']


@admin.register(DiscountProgram)
class DiscountProgramAdmin(admin.ModelAdmin):
    """Admin configuration for DiscountProgram"""
    
    list_display = [
        'program_code', 'name', 'program_type', 'discount_type',
        'budget_display', 'recipients_display', 'is_active', 'validity_status'
    ]
    list_filter = ['program_type', 'discount_type', 'is_active', 'requires_approval']
    search_fields = ['program_code', 'name', 'description']
    readonly_fields = [
        'program_code', 'budget_used', 'current_recipients',
        'budget_remaining_display', 'created_at', 'updated_at'
    ]
    fieldsets = (
        ('Basic Information', {
            'fields': ('program_code', 'name', 'description', 'program_type')
        }),
        ('Discount Configuration', {
            'fields': ('discount_type', 'discount_value', 'discount_account')
        }),
        ('Budget & Capacity', {
            'fields': (
                'budget_allocated', 'budget_used', 'budget_remaining_display',
                'max_recipients', 'current_recipients'
            )
        }),
        ('Validity', {
            'fields': ('start_date', 'end_date', 'is_active')
        }),
        ('Renewal', {
            'fields': ('is_renewable', 'renewal_period')
        }),
        ('Approval', {
            'fields': ('requires_approval', 'approval_workflow')
        }),
        ('Eligibility', {
            'fields': ('eligibility_criteria',),
            'classes': ('collapse',)
        }),
        ('Notes', {
            'fields': ('notes',),
            'classes': ('collapse',)
        }),
        ('Metadata', {
            'fields': ('created_at', 'modified_at'),
            'classes': ('collapse',)
        }),
    )
    
    def budget_display(self, obj):
        """Display budget with utilization"""
        if obj.budget_allocated > 0:
            percent = obj.budget_utilization_percent
            color = 'green' if percent < 70 else 'orange' if percent < 90 else 'red'
            return format_html(
                '<strong>{:,.2f}</strong> / {:,.2f} <span style="color:{}">({:.1f}%)</span>',
                obj.budget_used, obj.budget_allocated, color, percent
            )
        return format_html('<em>Unlimited</em>')
    budget_display.short_description = 'Budget Used / Allocated'
    
    def recipients_display(self, obj):
        """Display recipients count"""
        if obj.max_recipients > 0:
            percent = (obj.current_recipients / obj.max_recipients) * 100
            color = 'green' if percent < 70 else 'orange' if percent < 90 else 'red'
            return format_html(
                '<strong>{}</strong> / {} <span style="color:{}">({:.0f}%)</span>',
                obj.current_recipients, obj.max_recipients, color, percent
            )
        return format_html('{} <em>(Unlimited)</em>', obj.current_recipients)
    recipients_display.short_description = 'Recipients'
    
    def validity_status(self, obj):
        """Display validity status"""
        if obj.is_valid:
            return format_html('<span style="color: green;">✓ Valid</span>')
        return format_html('<span style="color: red;">✗ Invalid</span>')
    validity_status.short_description = 'Validity'
    
    def budget_remaining_display(self, obj):
        """Display remaining budget"""
        if obj.budget_allocated > 0:
            return format_html('{:,.2f}', obj.budget_remaining)
        return format_html('<em>Unlimited</em>')
    budget_remaining_display.short_description = 'Budget Remaining'


@admin.register(DiscountApplication)
class DiscountApplicationAdmin(admin.ModelAdmin):
    """Admin configuration for DiscountApplication"""
    
    list_display = [
        'application_number', 'client', 'program', 'status',
        'application_date', 'reviewed_by', 'active_status'
    ]
    list_filter = ['status', 'program__program_type', 'application_date']
    search_fields = ['application_number', 'client__name', 'program__name']
    readonly_fields = [
        'application_number', 'reviewed_by', 'review_date',
        'effective_from', 'effective_to', 'actual_discount_value_display',
        'created_at', 'updated_at'
    ]
    fieldsets = (
        ('Application Details', {
            'fields': (
                'application_number', 'program', 'client',
                'application_date', 'reason'
            )
        }),
        ('Custom Discount', {
            'fields': ('custom_discount_value', 'actual_discount_value_display'),
            'classes': ('collapse',)
        }),
        ('Status', {
            'fields': ('status',)
        }),
        ('Review Information', {
            'fields': (
                'reviewed_by', 'review_date', 'review_notes',
                'effective_from', 'effective_to'
            ),
            'classes': ('collapse',)
        }),
        ('Supporting Documents', {
            'fields': ('supporting_documents',),
            'classes': ('collapse',)
        }),
        ('Metadata', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    def active_status(self, obj):
        """Display active status"""
        if obj.is_active:
            return format_html('<span style="color: green;">✓ Active</span>')
        return format_html('<span style="color: gray;">✗ Inactive</span>')
    active_status.short_description = 'Active'
    
    def actual_discount_value_display(self, obj):
        """Display actual discount value"""
        return obj.actual_discount_value
    actual_discount_value_display.short_description = 'Actual Discount Value'


@admin.register(AppliedDiscount)
class AppliedDiscountAdmin(admin.ModelAdmin):
    """Admin configuration for AppliedDiscount"""
    
    list_display = [
        'id', 'application', 'receivable', 'discount_amount',
        'posting_status', 'reversal_status', 'created_at'
    ]
    list_filter = ['is_posted', 'is_reversed', 'posted_at']
    search_fields = [
        'application__application_number',
        'application__client__name',
        'receivable__id'
    ]
    readonly_fields = [
        'is_posted', 'posted_at', 'posted_by', 'journal_entry',
        'is_reversed', 'reversed_at', 'reversed_by', 'reversal_entry',
        'created_at', 'updated_at'
    ]
    fieldsets = (
        ('Discount Details', {
            'fields': ('application', 'receivable', 'discount_amount')
        }),
        ('Posting Information', {
            'fields': ('is_posted', 'posted_at', 'posted_by', 'journal_entry')
        }),
        ('Reversal Information', {
            'fields': (
                'is_reversed', 'reversed_at', 'reversed_by',
                'reversal_reason', 'reversal_entry'
            ),
            'classes': ('collapse',)
        }),
        ('Metadata', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    def posting_status(self, obj):
        """Display posting status"""
        if obj.is_posted:
            return format_html(
                '<span style="color: green;">✓ Posted</span><br><small>{}</small>',
                obj.posted_at.strftime('%Y-%m-%d') if obj.posted_at else ''
            )
        return format_html('<span style="color: orange;">✗ Not Posted</span>')
    posting_status.short_description = 'Posted'
    
    def reversal_status(self, obj):
        """Display reversal status"""
        if obj.is_reversed:
            return format_html(
                '<span style="color: red;">✓ Reversed</span><br><small>{}</small>',
                obj.reversed_at.strftime('%Y-%m-%d') if obj.reversed_at else ''
            )
        return format_html('<span style="color: green;">✗ Active</span>')
    reversal_status.short_description = 'Reversal'

