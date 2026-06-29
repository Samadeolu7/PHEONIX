from django.contrib import admin

# Register your models here.
from .models import LoanAccount, LoanDisbursement

admin.site.register(LoanAccount)
admin.site.register(LoanDisbursement)