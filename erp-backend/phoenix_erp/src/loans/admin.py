from django.contrib import admin

# Register your models here.
from .models import LoanAccount, LoanDisbursement, LoanGuarantor

admin.site.register(LoanAccount)
admin.site.register(LoanDisbursement)


@admin.register(LoanGuarantor)
class LoanGuarantorAdmin(admin.ModelAdmin):
    list_display = ('__str__', 'loan', 'guaranteed_amount', 'status', 'created_at')
    list_filter = ('status', 'created_at')
    search_fields = ('loan__loan_number',)
    raw_id_fields = ('loan', 'guarantor', 'guarantor_person')