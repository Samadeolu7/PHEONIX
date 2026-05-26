"""Budget Admin Configuration"""
from django.contrib import admin
from .models import BudgetPeriod, BudgetLine


class BudgetLineInline(admin.TabularInline):
    model = BudgetLine
    extra = 1
    fields = ['account', 'amount', 'notes']
    raw_id_fields = ['account']


@admin.register(BudgetPeriod)
class BudgetPeriodAdmin(admin.ModelAdmin):
    list_display = ['name', 'start_date', 'end_date', 'status', 'get_total_budget', 'owner']
    list_filter = ['status', 'start_date', 'owner']
    search_fields = ['name', 'notes']
    date_hierarchy = 'start_date'
    readonly_fields = ['approved_by', 'approved_at']
    inlines = [BudgetLineInline]
    
    fieldsets = [
        ('Period Information', {
            'fields': ['name', 'start_date', 'end_date', 'owner', 'branch']
        }),
        ('Status', {
            'fields': ['status', 'approved_by', 'approved_at']
        }),
        ('Notes', {
            'fields': ['notes'],
            'classes': ['collapse']
        }),
    ]


@admin.register(BudgetLine)
class BudgetLineAdmin(admin.ModelAdmin):
    list_display = ['budget_period', 'account', 'amount', 'owner']
    list_filter = ['budget_period__status', 'owner']
    search_fields = ['account__name', 'account__code', 'notes']
    raw_id_fields = ['budget_period', 'account']
    
    fieldsets = [
        ('Budget Allocation', {
            'fields': ['budget_period', 'account', 'amount']
        }),
        ('Tenant Info', {
            'fields': ['owner', 'branch']
        }),
        ('Notes', {
            'fields': ['notes'],
            'classes': ['collapse']
        }),
    ]
