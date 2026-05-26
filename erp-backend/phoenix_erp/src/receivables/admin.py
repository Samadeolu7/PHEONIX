from django.contrib import admin
from .models import (
    CustomerReceivable,
    ReceivableActivityLog,
    CustomerStatement
)


@admin.register(CustomerReceivable)
class CustomerReceivableAdmin(admin.ModelAdmin):
    list_display = ['reference_number', 'client', 'receivable_type', 'original_amount', 'balance', 'status', 'aging_bucket', 'due_date']
    list_filter = ['receivable_type', 'status', 'aging_bucket', 'branch']
    search_fields = ['reference_number', 'client__name']
    readonly_fields = ['created_at', 'updated_at', 'days_overdue', 'accrued_interest']


@admin.register(ReceivableActivityLog)
class ReceivableActivityLogAdmin(admin.ModelAdmin):
    list_display = ['receivable', 'activity_type', 'amount', 'description', 'created_at']
    list_filter = ['activity_type']
    search_fields = ['receivable__reference_number', 'description']


@admin.register(CustomerStatement)
class CustomerStatementAdmin(admin.ModelAdmin):
    list_display = ['statement_number', 'client', 'statement_date', 'period_start', 'period_end', 'closing_balance']
    list_filter = ['statement_date']
    search_fields = ['statement_number', 'client__name']