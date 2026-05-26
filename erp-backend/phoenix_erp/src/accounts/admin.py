from django.contrib import admin

from .models import (
	Account,
	AccountCategory,
	AccountTransactionPattern,
	PatternContraAccount,
)


@admin.register(Account)
class AccountAdmin(admin.ModelAdmin):
	list_display = (
		'id', 'code', 'name', 'account_type', 'account_level', 'branch', 'owner', 'tenant', 'balance', 'is_system_account'
	)
	list_filter = ('account_type', 'account_level', 'is_system_account', 'branch')
	search_fields = ('code', 'name')
	readonly_fields = ('balance', 'balance_bf', 'version')
	raw_id_fields = ('parent', 'category', 'branch', 'owner', 'tenant', 'created_by')


@admin.register(AccountCategory)
class AccountCategoryAdmin(admin.ModelAdmin):
	list_display = ('id', 'code_prefix', 'name', 'section', 'is_system_category', 'branch', 'owner')
	search_fields = ('name', 'code_prefix')
	list_filter = ('section', 'is_system_category')
	raw_id_fields = ('branch', 'owner', 'created_by')


@admin.register(AccountTransactionPattern)
class AccountTransactionPatternAdmin(admin.ModelAdmin):
	list_display = ('id', 'name', 'code', 'account', 'branch')
	search_fields = ('name', 'code', 'account__code', 'account__name')
	raw_id_fields = ('account', 'branch')


@admin.register(PatternContraAccount)
class PatternContraAccountAdmin(admin.ModelAdmin):
	list_display = ('id', 'pattern', 'contra_account', 'form_label', 'display_order')
	search_fields = ('pattern__name', 'contra_account__code', 'contra_account__name')
	raw_id_fields = ('pattern', 'contra_account')

