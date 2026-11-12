from django.contrib import admin

from .models import (
    OnlineLoanApplication, PortalAuditEvent, PortalConfig, PortalCustomer, PortalLoanOffering,
)


@admin.register(PortalConfig)
class PortalConfigAdmin(admin.ModelAdmin):
    list_display = ('tenant', 'is_enabled', 'allow_registration', 'max_open_applications', 'updated_at')
    list_filter = ('is_enabled',)


@admin.register(PortalLoanOffering)
class PortalLoanOfferingAdmin(admin.ModelAdmin):
    list_display = ('__str__', 'tenant', 'loan_product', 'is_active', 'max_online_amount', 'sort_order')
    list_filter = ('tenant', 'is_active')


@admin.register(PortalCustomer)
class PortalCustomerAdmin(admin.ModelAdmin):
    list_display = ('email', 'first_name', 'last_name', 'tenant', 'is_active', 'email_verified_at', 'last_login')
    list_filter = ('tenant', 'is_active')
    search_fields = ('email', 'first_name', 'last_name', 'phone')
    # Credentials and lockout state are never hand-edited.
    exclude = ('password',)
    readonly_fields = (
        'tenant', 'email', 'email_verified_at', 'failed_login_count', 'locked_until', 'last_login',
        'password_changed_at', 'accepted_terms_at', 'client', 'created_at', 'updated_at',
    )


@admin.register(OnlineLoanApplication)
class OnlineLoanApplicationAdmin(admin.ModelAdmin):
    """Read-only here — decisions go through the staff API so they're audited."""
    list_display = ('reference', 'first_name', 'last_name', 'tenant', 'branch', 'status', 'submitted_at')
    list_filter = ('tenant', 'status')
    search_fields = ('reference', 'first_name', 'last_name', 'phone_primary', 'email')
    exclude = ('nin', 'bvn', 'bank_account_number', 'nin_fingerprint', 'bvn_fingerprint')

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(PortalAuditEvent)
class PortalAuditEventAdmin(admin.ModelAdmin):
    list_display = ('created_at', 'event', 'tenant', 'customer', 'application', 'staff_user', 'ip_address')
    list_filter = ('event', 'tenant')

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
