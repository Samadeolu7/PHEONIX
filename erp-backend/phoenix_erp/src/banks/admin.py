# banks/admin.py
"""
Django Admin configuration for Bank Management
"""
from django.contrib import admin
from .models import Bank, BankAccount, BankTransfer, BankAccountBalanceLog


@admin.register(Bank)
class BankAdmin(admin.ModelAdmin):
    list_display = ['bank_name', 'branch_name', 'bank_code', 'is_active', 'created_at']
    list_filter = ['is_active', 'branch']
    search_fields = ['bank_name', 'bank_code', 'branch_name', 'account_manager_name']
    readonly_fields = ['created_at', 'updated_at']
    
    fieldsets = (
        ('Basic Information', {
            'fields': ('bank_name', 'bank_code', 'branch_name')
        }),
        ('Contact Details', {
            'fields': ('address', 'phone', 'email')
        }),
        ('Account Manager', {
            'fields': ('account_manager_name', 'account_manager_phone', 'account_manager_email')
        }),
        ('Status', {
            'fields': ('is_active', 'notes')
        }),
        ('System Fields', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


@admin.register(BankAccount)
class BankAccountAdmin(admin.ModelAdmin):
    list_display = [
        'account_number', 'account_name', 'bank', 'account_type',
        'current_balance', 'account_manager', 'is_active', 'is_suspended'
    ]
    list_filter = [
        'is_active', 'is_suspended', 'account_type',
        'is_cashier_collection_account', 'requires_dual_approval', 'bank'
    ]
    search_fields = ['account_number', 'account_name', 'bank__bank_name', 'iban']
    readonly_fields = ['current_balance', 'created_at', 'updated_at']
    autocomplete_fields = ['bank', 'gl_account', 'account_manager']
    
    fieldsets = (
        ('Bank Details', {
            'fields': ('bank', 'account_type', 'currency')
        }),
        ('Account Information', {
            'fields': ('account_number', 'account_name', 'iban', 'swift_code', 'date_opened')
        }),
        ('GL Integration', {
            'fields': ('gl_account', 'current_balance')
        }),
        ('Management', {
            'fields': ('account_manager',)
        }),
        ('Limits & Controls', {
            'fields': (
                'daily_withdrawal_limit', 'monthly_transaction_limit',
                'requires_dual_approval', 'dual_approval_threshold'
            )
        }),
        ('Status & Flags', {
            'fields': ('is_active', 'is_suspended', 'is_cashier_collection_account')
        }),
        ('Additional Information', {
            'fields': ('notes',)
        }),
        ('System Fields', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


@admin.register(BankTransfer)
class BankTransferAdmin(admin.ModelAdmin):
    list_display = [
        'transfer_number', 'transfer_date', 'source_type',
        'amount', 'status', 'initiated_by', 'approved_by'
    ]
    list_filter = ['status', 'source_type', 'transfer_date']
    search_fields = ['transfer_number', 'description', 'reference_number']
    readonly_fields = [
        'transfer_number', 'initiated_by', 'initiated_at',
        'approved_by', 'approved_at', 'second_approved_by', 'second_approved_at',
        'rejected_by', 'rejected_at', 'completed_by', 'completed_at',
        'journal_entry', 'created_at', 'updated_at'
    ]
    autocomplete_fields = [
        'source_cashier_account', 'source_bank_account', 'destination_bank_account'
    ]
    
    fieldsets = (
        ('Transfer Details', {
            'fields': ('transfer_number', 'transfer_date', 'amount', 'description', 'reference_number')
        }),
        ('Source Account', {
            'fields': ('source_type', 'source_cashier_account', 'source_bank_account')
        }),
        ('Destination Account', {
            'fields': ('destination_bank_account',)
        }),
        ('Status', {
            'fields': ('status',)
        }),
        ('Workflow - Initiation', {
            'fields': ('initiated_by', 'initiated_at')
        }),
        ('Workflow - First Approval', {
            'fields': ('approved_by', 'approved_at', 'approval_notes')
        }),
        ('Workflow - Second Approval', {
            'fields': ('second_approved_by', 'second_approved_at', 'second_approval_notes')
        }),
        ('Workflow - Rejection', {
            'fields': ('rejected_by', 'rejected_at', 'rejection_reason')
        }),
        ('Completion', {
            'fields': ('completed_by', 'completed_at', 'journal_entry')
        }),
        ('Attachments', {
            'fields': ('attachment',)
        }),
        ('System Fields', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


@admin.register(BankAccountBalanceLog)
class BankAccountBalanceLogAdmin(admin.ModelAdmin):
    list_display = [
        'bank_account', 'previous_balance', 'new_balance',
        'change_amount', 'transaction_type', 'created_at'
    ]
    list_filter = ['transaction_type', 'created_at']
    search_fields = ['bank_account__account_number', 'reference_number']
    readonly_fields = [
        'bank_account', 'previous_balance', 'new_balance', 'change_amount',
        'transaction_type', 'reference_number', 'changed_by', 'created_at'
    ]
    
    def has_add_permission(self, request):
        """Prevent manual creation of balance logs"""
        return False
    
    def has_change_permission(self, request, obj=None):
        """Prevent editing of balance logs"""
        return False
    
    def has_delete_permission(self, request, obj=None):
        """Prevent deletion of balance logs"""
        return False


from .models import ReconciliationException  # noqa: E402


@admin.register(ReconciliationException)
class ReconciliationExceptionAdmin(admin.ModelAdmin):
    """Read-only view of reconciliation gaps, including who has claimed a
    line on the Pending Bank Repayments page. Read-only on purpose:
    resolving goes through the app so the director/dual-approval rules apply."""
    list_display = [
        'id', 'exception_type', 'direction', 'amount', 'date', 'bank_account',
        'branch', 'officer', 'claimed_by', 'claimed_at', 'resolved',
    ]
    list_filter = ['exception_type', 'direction', 'resolved', 'reconciliation__branch']
    search_fields = [
        'bank_narration', 'erp_narration', 'claim_note',
        'officer__username', 'officer__first_name', 'officer__last_name',
        'claimed_by__username', 'claimed_by__first_name', 'claimed_by__last_name',
    ]
    list_select_related = ['reconciliation__bank_account', 'reconciliation__branch', 'officer', 'claimed_by']
    date_hierarchy = 'created_at'
    ordering = ['-created_at']

    @admin.display(description='Amount')
    def amount(self, obj):
        return obj.erp_amount if obj.exception_type == 'erp_only' else obj.bank_amount

    @admin.display(description='Date')
    def date(self, obj):
        return obj.erp_date if obj.exception_type == 'erp_only' else obj.bank_date

    @admin.display(description='Bank account')
    def bank_account(self, obj):
        return obj.reconciliation.bank_account

    @admin.display(description='Branch')
    def branch(self, obj):
        return obj.reconciliation.branch

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


from .models import ReconciliationResolution  # noqa: E402


@admin.register(ReconciliationResolution)
class ReconciliationResolutionAdmin(admin.ModelAdmin):
    """Read-only audit view of resolution cases (maker -> branch manager ->
    director). Actions happen in the app so the maker-checker rules apply."""
    list_display = [
        'reference_number', 'kind', 'status', 'amount', 'branch',
        'proposed_by', 'reviewed_by', 'approved_by', 'respondent', 'proposed_at',
    ]
    list_filter = ['kind', 'status', 'branch']
    search_fields = [
        'reference_number', 'reason', 'review_notes', 'approval_notes',
        'proposed_by__username', 'reviewed_by__username', 'approved_by__username',
    ]
    list_select_related = ['branch', 'proposed_by', 'reviewed_by', 'approved_by', 'respondent']
    date_hierarchy = 'proposed_at'
    ordering = ['-proposed_at']

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
