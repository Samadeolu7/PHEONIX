from django.contrib import admin

# Register your models here.
from .models import LoanAccount, LoanDisbursement, LoanGuarantor, LoanProduct

admin.site.register(LoanAccount)
admin.site.register(LoanDisbursement)


@admin.register(LoanProduct)
class LoanProductAdmin(admin.ModelAdmin):
    list_display = ('__str__', 'default_interest_rate', 'interest_calculation_method')
    search_fields = ('product__name', 'product__code')
    raw_id_fields = ('product', 'parent_account')
    fieldsets = (
        (None, {
            'fields': ('product', 'parent_account'),
        }),
        ('Repayment Terms', {
            'fields': ('first_repayment_buffer_days',),
            'description': (
                'Extra calendar days added on top of the first naturally-occurring repayment '
                'date. 0 = follows normal cadence.'
            ),
        }),
        ('GL Accounts', {
            'fields': (
                'disbursement_account',
                'interest_income_account',
                'fee_income_account',
                'penalty_income_account',
                'insurance_income_account',
                'provision_expense_account',
                'allowance_account',
                'interest_suspense_account',
                'accrued_interest_account',
                'unearned_interest_income_account',
                'interest_writeoff_expense_account',
            ),
            'description': (
                'unearned_interest_income_account, interest_income_account, and '
                'accrued_interest_account must all be set to enable deferred/unearned '
                'interest income recognition for loans disbursed under this product. '
                'interest_writeoff_expense_account is required for write-offs on such loans '
                'to flush any remaining unearned interest correctly.'
            ),
        }),
    )


@admin.register(LoanGuarantor)
class LoanGuarantorAdmin(admin.ModelAdmin):
    list_display = ('__str__', 'loan', 'guaranteed_amount', 'status', 'created_at')
    list_filter = ('status', 'created_at')
    search_fields = ('loan__loan_number',)
    raw_id_fields = ('loan', 'guarantor', 'guarantor_person')