from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as AuthUserAdmin
from django.contrib.auth.forms import UserChangeForm, UserCreationForm
from .models import User, Tenant, Role


class CustomUserChangeForm(UserChangeForm):
    class Meta(UserChangeForm.Meta):
        model = User


class CustomUserCreationForm(UserCreationForm):
    class Meta(UserCreationForm.Meta):
        model = User
        fields = ('username', 'email')


@admin.register(User)
class UserAdmin(AuthUserAdmin):
    form = CustomUserChangeForm
    add_form = CustomUserCreationForm

    # Override add_fieldsets to exclude 'usable_password' (a Django 5.0+ form-only
    # field that does not exist on the User model and causes a FieldError).
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('username', 'email', 'password1', 'password2'),
        }),
    )

    list_display = ['email', 'first_name', 'last_name', 'tenant', 'branch', 'is_staff', 'is_active', 'date_joined']
    list_filter = ['is_staff', 'is_active', 'tenant', 'branch', 'date_joined']
    search_fields = ['email', 'first_name', 'last_name']
    readonly_fields = ['date_joined', 'last_login']

    fieldsets = (
        (None, {'fields': ('username', 'password')}),
        ('Personal Info', {
            'fields': ('email', 'first_name', 'last_name', 'roles', 'assigned_dashboard', 'is_active_user')
        }),
        ('Organization', {
            'fields': ('tenant', 'branch')
        }),
        ('Permissions', {
            'fields': ('is_staff', 'is_active', 'groups', 'user_permissions', 'is_system_admin')
        }),
        ('Important Dates', {
            'fields': ('last_login', 'date_joined'),
            'classes': ('collapse',)
        }),
    )

@admin.register(Tenant)
class TenantAdmin(admin.ModelAdmin):
    list_display = ['name', 'slug', 'domain_type', 'subscription_tier', 'custom_domain', 'is_active', 'created_at']
    list_filter = ['is_active', 'domain_type', 'subscription_tier', 'created_at']
    search_fields = ['name', 'slug', 'custom_domain', 'email', 'phone', 'registration_number']
    readonly_fields = ['created_at', 'updated_at']

    fieldsets = (
        ('Tenant Information', {
            'fields': ('name', 'slug', 'owner', 'domain_type', 'is_active')
        }),
        ('Contact Details', {
            'fields': ('phone', 'email', 'website'),
        }),
        ('Address', {
            'fields': ('address', 'city', 'state', 'postal_code', 'country'),
        }),
        ('Regulatory / Tax', {
            'fields': ('registration_number', 'tax_identification_number'),
        }),
        ('Branding', {
            'fields': ('logo', 'logo_url', 'primary_color'),
        }),
        ('Domain Configuration', {
            'fields': ('custom_domain',),
            'description': 'Set custom domain to allow access without subdomain (e.g., api.erp.krystartrust.ng)'
        }),
        ('Subscription & Limits', {
            'fields': ('subscription_tier', 'subscription_expires', 'max_users', 'max_storage_gb'),
        }),
        ('Features & Settings', {
            'fields': ('enabled_features', 'domain_config', 'custom_labels', 'settings'),
            'classes': ('collapse',)
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )

@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    list_display = ['name', 'tenant', 'is_active', 'created_at']
    list_filter = ['is_active', 'created_at']
    search_fields = ['name', 'tenant__name']
    readonly_fields = ['created_at', 'updated_at']
    
    fieldsets = (
        ('Role Details', {
            'fields': ('name', 'description', 'tenant', 'permissions', 'default_dashboard', 'can_access_dashboards', 'can_access_modules', 'can_access_pages', 'is_active')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )