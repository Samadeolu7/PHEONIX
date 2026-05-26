from django.contrib import admin

from .models import TransactionEntry, Transaction, TransactionSeries

@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    list_display = ('id', 'date', 'description', 'created_at')
    search_fields = ('description',)
    list_filter = ('date', 'created_at')

@admin.register(TransactionEntry)
class TransactionEntryAdmin(admin.ModelAdmin):
    list_display = ('id', 'transaction', 'account', 'amount', 'side')
    search_fields = ('transaction__description', 'account__name', 'account__code')
    list_filter = ('side',)
    raw_id_fields = ('transaction', 'account')

    def account_name(self, obj):
        return obj.account.name
