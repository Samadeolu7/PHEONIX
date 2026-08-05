# cash_management/admin.py
from django.contrib import admin
from .models import (
    CashierAccount, CashCollection, CashTransfer, CashReconciliation,
    PettyCashFund, PettyCashVoucher, PettyCashVoucherLine, PettyCashReplenishment, PettyCashReceipt
)


class PettyCashReceiptInline(admin.TabularInline):
    model = PettyCashReceipt
    extra = 0
    fields = ['file', 'description', 'uploaded_by', 'uploaded_at']
    readonly_fields = ['uploaded_by', 'uploaded_at']


class PettyCashVoucherLineInline(admin.TabularInline):
    model = PettyCashVoucherLine
    extra = 0
    fields = ['line_order', 'expense_category', 'description', 'amount']


@admin.register(CashierAccount)
class CashierAccountAdmin(admin.ModelAdmin):
    list_display = ['account_number', 'name', 'cashier', 'current_balance', 'is_active', 'last_reconciled_at']
    list_filter = ['is_active', 'is_suspended', 'branch']
    search_fields = ['account_number', 'name', 'cashier__username', 'cashier__email']
    readonly_fields = ['current_balance', 'last_reconciled_at', 'last_reconciled_by', 'created_at', 'updated_at']
    
    fieldsets = (
        ('Basic Information', {
            'fields': ('account_number', 'name', 'cashier', 'account', 'branch')
        }),
        ('Balance & Limits', {
            'fields': ('current_balance', 'daily_collection_limit')
        }),
        ('Status & Controls', {
            'fields': ('is_active', 'is_suspended', 'requires_dual_approval')
        }),
        ('Reconciliation', {
            'fields': ('last_reconciled_at', 'last_reconciled_by')
        }),
        ('System Fields', {
            'fields': ('owner', 'created_by', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        })
    )


@admin.register(CashCollection)
class CashCollectionAdmin(admin.ModelAdmin):
    list_display = ['receipt_number', 'client', 'cashier_account', 'amount_collected', 'collection_date', 'is_posted']
    list_filter = ['collection_date', 'is_posted', 'collection_mode', 'branch']
    search_fields = ['receipt_number', 'client__first_name', 'client__last_name', 'payment_purpose']
    readonly_fields = ['variance', 'is_posted', 'posted_at', 'posted_by', 'journal_entry', 'created_at']
    date_hierarchy = 'collection_date'
    
    fieldsets = (
        ('Collection Details', {
            'fields': ('receipt_number', 'cashier_account', 'client', 'collection_date')
        }),
        ('Amounts', {
            'fields': ('amount_due', 'amount_collected', 'variance', 'variance_action')
        }),
        ('Payment Information', {
            'fields': ('payment_purpose', 'collection_mode', 'reference_number', 'notes')
        }),
        ('Posting Status', {
            'fields': ('is_posted', 'posted_at', 'posted_by', 'journal_entry')
        }),
        ('System Fields', {
            'fields': ('owner', 'branch', 'created_by', 'created_at'),
            'classes': ('collapse',)
        })
    )


@admin.register(CashTransfer)
class CashTransferAdmin(admin.ModelAdmin):
    list_display = ['transfer_number', 'cashier_account', 'amount', 'transfer_date', 'status', 'approved_by']
    list_filter = ['status', 'transfer_date', 'branch']
    search_fields = ['transfer_number', 'bank_deposit_slip', 'bank_reference']
    readonly_fields = [
        'status', 'submitted_at', 'submitted_by', 
        'approved_at', 'approved_by', 'second_approved_at', 'second_approved_by',
        'rejected_at', 'rejected_by', 'posted_at', 'posted_by', 
        'journal_entry', 'created_at'
    ]
    date_hierarchy = 'transfer_date'
    
    fieldsets = (
        ('Transfer Details', {
            'fields': ('transfer_number', 'cashier_account', 'destination_account', 'amount', 'transfer_date')
        }),
        ('Bank Details', {
            'fields': ('bank_deposit_slip', 'bank_reference', 'deposit_proof')
        }),
        ('Workflow Status', {
            'fields': (
                'status',
                'submitted_at', 'submitted_by',
                'approved_at', 'approved_by', 'approval_notes',
                'second_approved_at', 'second_approved_by',
                'rejected_at', 'rejected_by', 'rejection_reason'
            )
        }),
        ('Posting', {
            'fields': ('posted_at', 'posted_by', 'journal_entry')
        }),
        ('Additional Information', {
            'fields': ('notes',)
        }),
        ('System Fields', {
            'fields': ('owner', 'branch', 'created_by', 'created_at'),
            'classes': ('collapse',)
        })
    )


@admin.register(CashReconciliation)
class CashReconciliationAdmin(admin.ModelAdmin):
    list_display = ['cashier_account', 'reconciliation_date', 'system_balance', 'physical_count', 'variance', 'status']
    list_filter = ['status', 'reconciliation_date', 'branch']
    search_fields = ['cashier_account__name', 'cashier_account__account_number']
    readonly_fields = ['variance', 'status', 'verified_at', 'created_at']
    date_hierarchy = 'reconciliation_date'
    
    fieldsets = (
        ('Reconciliation Details', {
            'fields': ('cashier_account', 'reconciliation_date', 'reconciled_by')
        }),
        ('Balances', {
            'fields': ('system_balance', 'physical_count', 'variance', 'status')
        }),
        ('Day Summary', {
            'fields': ('total_collections', 'total_transfers', 'denomination_details')
        }),
        ('Variance Resolution', {
            'fields': ('variance_explanation', 'verified_by', 'verified_at')
        }),
        ('Additional Information', {
            'fields': ('notes',)
        }),
        ('System Fields', {
            'fields': ('owner', 'branch', 'created_by', 'created_at'),
            'classes': ('collapse',)
        })
    )


# ============================================
# PETTY CASH ADMIN
# ============================================

@admin.register(PettyCashFund)
class PettyCashFundAdmin(admin.ModelAdmin):
    list_display = ['fund_code', 'fund_name', 'custodian', 'float_amount', 'current_balance', 'status', 'needs_replenishment']
    list_filter = ['status', 'branch', 'established_date']
    search_fields = ['fund_code', 'fund_name', 'custodian__username']
    readonly_fields = ['current_balance', 'last_replenishment_date', 'needs_replenishment', 'disbursed_amount', 'created_at', 'updated_at']
    date_hierarchy = 'established_date'
    
    fieldsets = (
        ('Fund Information', {
            'fields': ('fund_name', 'fund_code', 'petty_cash_account', 'status')
        }),
        ('Custodians', {
            'fields': ('custodian', 'alternate_custodian')
        }),
        ('Limits & Controls', {
            'fields': ('float_amount', 'current_balance', 'replenishment_threshold', 'single_transaction_limit')
        }),
        ('Status', {
            'fields': ('needs_replenishment', 'disbursed_amount', 'last_replenishment_date', 'last_audit_date')
        }),
        ('Setup', {
            'fields': ('established_date', 'established_by', 'setup_journal_entry')
        }),
        ('Additional Info', {
            'fields': ('notes',)
        }),
        ('System Fields', {
            'fields': ('branch', 'owner', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        })
    )


@admin.register(PettyCashVoucher)
class PettyCashVoucherAdmin(admin.ModelAdmin):
    list_display = ['voucher_number', 'fund', 'requested_by', 'amount', 'status', 'voucher_date']
    list_filter = ['status', 'voucher_date', 'fund', 'branch']
    search_fields = ['voucher_number', 'purpose', 'payee_name', 'requested_by__username']
    readonly_fields = [
        'voucher_number', 'status', 'variance', 'submitted_at', 
        'approved_by', 'approved_at', 'rejected_by', 'rejected_at',
        'disbursed_by', 'disbursed_at', 'retired_by', 'retired_at',
        'created_at', 'updated_at'
    ]
    date_hierarchy = 'voucher_date'
    inlines = [PettyCashVoucherLineInline, PettyCashReceiptInline]
    
    fieldsets = (
        ('Voucher Details', {
            'fields': ('voucher_number', 'fund', 'voucher_date', 'status')
        }),
        ('Request Information', {
            'fields': ('requested_by', 'purpose', 'amount', 'expense_category')
        }),
        ('Payee Details', {
            'fields': ('payee_name', 'payee_phone')
        }),
        ('Approval', {
            'fields': ('submitted_at', 'approved_by', 'approved_at', 'approval_notes')
        }),
        ('Rejection', {
            'fields': ('rejected_by', 'rejected_at', 'rejection_reason'),
            'classes': ('collapse',)
        }),
        ('Disbursement', {
            'fields': ('disbursed_by', 'disbursed_at', 'actual_amount_disbursed')
        }),
        ('Receipt & Retirement', {
            'fields': (
                'receipt_submitted', 'receipt_amount', 'receipt_date', 
                'receipt_reference', 'receipt_attachment',
                'retired_by', 'retired_at', 'variance', 'variance_explanation'
            )
        }),
        ('Replenishment', {
            'fields': ('replenishment',)
        }),
        ('Additional Info', {
            'fields': ('notes',)
        }),
        ('System Fields', {
            'fields': ('branch', 'owner', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        })
    )


@admin.register(PettyCashReplenishment)
class PettyCashReplenishmentAdmin(admin.ModelAdmin):
    list_display = ['replenishment_number', 'fund', 'replenishment_date', 'replenishment_amount', 'status']
    list_filter = ['status', 'replenishment_date', 'fund', 'branch']
    search_fields = ['replenishment_number', 'fund__fund_name', 'submitted_by__username']
    readonly_fields = [
        'replenishment_number', 'status', 'fund_balance_after', 'expense_breakdown',
        'submitted_at', 'verified_by', 'verified_at', 'approved_by', 'approved_at',
        'rejected_by', 'rejected_at', 'posted_by', 'posted_at', 'journal_entry',
        'created_at', 'updated_at'
    ]
    date_hierarchy = 'replenishment_date'
    
    fieldsets = (
        ('Replenishment Details', {
            'fields': ('replenishment_number', 'fund', 'replenishment_date', 'status')
        }),
        ('Period', {
            'fields': ('period_start', 'period_end')
        }),
        ('Amounts', {
            'fields': (
                'total_vouchers_amount', 'total_receipts_amount', 'total_variance',
                'replenishment_amount', 'fund_balance_before', 'fund_balance_after'
            )
        }),
        ('Replenishment Source', {
            'fields': ('replenishment_source',)
        }),
        ('Submission', {
            'fields': ('submitted_by', 'submitted_at')
        }),
        ('Verification', {
            'fields': ('verified_by', 'verified_at', 'verification_notes')
        }),
        ('Approval', {
            'fields': ('approved_by', 'approved_at', 'approval_notes')
        }),
        ('Rejection', {
            'fields': ('rejected_by', 'rejected_at', 'rejection_reason'),
            'classes': ('collapse',)
        }),
        ('Posting', {
            'fields': ('posted_by', 'posted_at', 'journal_entry')
        }),
        ('Expense Breakdown', {
            'fields': ('expense_breakdown',),
            'classes': ('collapse',)
        }),
        ('Additional Info', {
            'fields': ('notes',)
        }),
        ('System Fields', {
            'fields': ('branch', 'owner', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        })
    )


@admin.register(PettyCashReceipt)
class PettyCashReceiptAdmin(admin.ModelAdmin):
    list_display = ['voucher', 'file_name', 'file_type', 'file_size', 'uploaded_by', 'uploaded_at']
    list_filter = ['file_type', 'uploaded_at', 'uploaded_by']
    search_fields = ['voucher__voucher_number', 'file_name', 'description']
    readonly_fields = ['file_size', 'file_type', 'uploaded_by', 'uploaded_at']
    
    fieldsets = (
        ('Receipt Details', {
            'fields': ('voucher', 'file', 'description')
        }),
        ('File Information', {
            'fields': ('file_name', 'file_size', 'file_type')
        }),
        ('Upload Info', {
            'fields': ('uploaded_by', 'uploaded_at')
        })
    )
