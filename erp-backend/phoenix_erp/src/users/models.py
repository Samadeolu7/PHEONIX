from django.db import models, transaction as db_tx
from django.contrib.auth.models import AbstractUser, Permission, Group
from django.utils.translation import gettext_lazy as _
from django.conf import settings
from django.apps import apps

def get_branch_model():
    return apps.get_model('branches', 'Branch')


class Tenant(models.Model):
    """Represents a microfinance company (owner and their staff operate under this tenant)."""
    name = models.CharField(max_length=150, unique=True)
    owner = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='tenant_owned',
        help_text='The primary owner user for this tenant',
        null=True,
        blank=True
    )
    slug = models.SlugField(
        max_length=200, 
        unique=True,
        help_text='URL-safe identifier for subdomain (e.g., school1 for school1.yourdomain.com)'
    )
    
    # Custom domain for premium tenants
    custom_domain = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        unique=True,
        help_text='Custom domain (e.g., www.schoolname.com)'
    )
    
    # Domain Type
    DOMAIN_CHOICES = [
        ('microfinance', 'Microfinance Institution'),
        ('school', 'School'),
        ('hospital', 'Hospital'),
        ('retail', 'Retail Business'),
        ('multi', 'Multi-Domain'),
    ]
    domain_type = models.CharField(
        max_length=20,
        choices=DOMAIN_CHOICES,
        default='microfinance',
        help_text="Primary domain type of this tenant",
    )
    # Domain-specific configuration
    domain_config = models.JSONField(
        default=dict,
        null=True,
        blank=True,
        help_text="Domain-specific settings and customizations"
    )
    
    # Feature flags
    enabled_features = models.JSONField(
        default=list,
        null=True,
        blank=True,
        help_text="List of enabled features for this tenant (e.g., ['inventory', 'hr', 'payroll'])"
    )
    
    # Custom labels
    custom_labels = models.JSONField(
        default=dict,
        null=True,
        blank=True,
        help_text="Custom field labels for this tenant"
    )

    settings = models.JSONField(
        default=dict,
        null=True,
        blank=True,
        help_text="General settings for this tenant"
    )
    
    # Subscription/Limits
    subscription_tier = models.CharField(
        max_length=20,
        choices=[
            ('free', 'Free'),
            ('basic', 'Basic'),
            ('professional', 'Professional'),
            ('enterprise', 'Enterprise'),
        ],
        default='basic',
        help_text='Subscription tier'
    )
    subscription_expires = models.DateField(
        null=True,
        blank=True,
        help_text='Subscription expiry date'
    )
    max_users = models.IntegerField(
        default=10,
        help_text='Maximum number of users allowed'
    )
    max_storage_gb = models.IntegerField(
        default=5,
        help_text='Maximum storage in GB'
    )
    
    # ── Organisation Contact Details ──────────────────────────────────────────
    # Stored as first-class fields (not buried in the JSON settings blob) so
    # they can be queried, validated and surfaced on documents.
    phone = models.CharField(
        max_length=50, blank=True,
        help_text='Primary contact phone number'
    )
    email = models.EmailField(
        blank=True,
        help_text='Primary contact / accounts email address'
    )
    website = models.URLField(
        blank=True,
        help_text='Organisation website (e.g. https://www.example.com)'
    )

    # ── Organisation Address ───────────────────────────────────────────────────
    address = models.TextField(
        blank=True,
        help_text='Street / postal address (line 1 and 2)'
    )
    city = models.CharField(max_length=100, blank=True)
    state = models.CharField(max_length=100, blank=True)
    country = models.CharField(max_length=100, blank=True, default='Nigeria')
    postal_code = models.CharField(max_length=20, blank=True)

    # ── Regulatory / Tax Identifiers ──────────────────────────────────────────
    registration_number = models.CharField(
        max_length=100, blank=True,
        help_text='Company/Organisation registration number (CAC, etc.)'
    )
    tax_identification_number = models.CharField(
        max_length=100, blank=True,
        help_text='Tax Identification Number (TIN / VAT registration)'
    )

    # ── Branding ──────────────────────────────────────────────────────────────
    logo = models.ImageField(
        upload_to='tenant_logos/',
        null=True,
        blank=True,
        help_text='Upload tenant/organisation logo (PNG, JPG, SVG)'
    )
    logo_url = models.URLField(blank=True, help_text='External URL to tenant logo (used if no file uploaded)')
    primary_color = models.CharField(
        max_length=7, 
        default='#0066cc',
        help_text='Primary brand color (hex)'
    )

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'users_tenant'
        ordering = ['name']
        indexes = [
            models.Index(fields=['slug']),
            models.Index(fields=['custom_domain']),
            models.Index(fields=['is_active']),
        ]
    
    def __str__(self):
        return f"{self.name} ({self.get_domain_type_display()})"
    
    # Feature Management Methods
    def has_feature(self, feature_name):
        """
        Check if tenant has a specific feature enabled.
        
        Args:
            feature_name (str): Feature to check (e.g., 'inventory', 'payroll')
        
        Returns:
            bool: True if feature is enabled
        
        Example:
            if tenant.has_feature('payroll'):
                # Show payroll menu
        """
        if not isinstance(self.enabled_features, list):
            return False
        return feature_name in self.enabled_features
    
    def enable_feature(self, feature_name):
        """Add a feature to enabled features list"""
        if not isinstance(self.enabled_features, list):
            self.enabled_features = []
        if feature_name not in self.enabled_features:
            self.enabled_features.append(feature_name)
            self.save(update_fields=['enabled_features'])
    
    def disable_feature(self, feature_name):
        """Remove a feature from enabled features list"""
        if isinstance(self.enabled_features, list) and feature_name in self.enabled_features:
            self.enabled_features.remove(feature_name)
            self.save(update_fields=['enabled_features'])
    
    # Domain/URL Methods
    def get_subdomain_url(self, base_domain='yourdomain.com'):
        """
        Get the subdomain URL for this tenant.
        
        Args:
            base_domain (str): Base domain for the application
        
        Returns:
            str: Full subdomain URL (e.g., https://school1.yourdomain.com)
        """
        return f"https://{self.slug}.{base_domain}"
    
    def get_access_url(self, base_domain='yourdomain.com'):
        """
        Get the primary access URL (custom domain if set, otherwise subdomain).
        
        Returns:
            str: Primary URL for accessing this tenant
        """
        if self.custom_domain:
            return f"https://{self.custom_domain}"
        return self.get_subdomain_url(base_domain)
    
    # Subscription Methods
    def is_subscription_active(self):
        """Check if subscription is active (not expired)"""
        if not self.subscription_expires:
            return True  # No expiry date means unlimited
        from django.utils import timezone
        return self.subscription_expires >= timezone.now().date()
    
    def is_within_user_limit(self):
        """Check if tenant is within user limit"""
        return self.users.filter(is_active=True).count() < self.max_users
    
    def can_add_user(self):
        """Check if tenant can add more users"""
        return self.is_active and self.is_subscription_active() and self.is_within_user_limit()
    
    # Statistics
    def get_user_count(self):
        """Get active user count"""
        return self.users.filter(is_active=True).count()
    
    def get_branch_count(self):
        """Get branch count"""
        return self.branches_branch_set.filter(is_deleted=False).count() if hasattr(self, 'branches_branch_set') else 0

    # Document / PDF helpers
    def get_formatted_address(self) -> str:
        """
        Return a multi-line address string suitable for printing on documents.
        Falls back to the legacy ``settings['address']`` JSON value if the
        structured fields are not yet populated.
        """
        parts = [p for p in [
            self.address,
            self.city,
            ', '.join(filter(None, [self.state, self.postal_code])),
            self.country,
        ] if p]
        if parts:
            return '\n'.join(parts)
        # Legacy fallback
        if isinstance(self.settings, dict):
            return self.settings.get('address', '')
        return ''

    def get_contact_phone(self) -> str:
        """Return phone, falling back to legacy settings JSON."""
        return self.phone or (
            self.settings.get('phone', '') if isinstance(self.settings, dict) else ''
        )

    def get_contact_email(self) -> str:
        """Return email, falling back to legacy settings JSON."""
        return self.email or (
            self.settings.get('email', '') if isinstance(self.settings, dict) else ''
        )

    def get_website(self) -> str:
        """Return website, falling back to legacy settings JSON."""
        return self.website or (
            self.settings.get('website', '') if isinstance(self.settings, dict) else ''
        )

    def get_invoice_bank_accounts(self):
        """
        Return BankAccount queryset flagged as primary for invoices.
        Returns all active primary accounts ordered by account_name.
        """
        try:
            from banks.models import BankAccount
            return BankAccount.objects.filter(
                branch__tenant=self,
                is_primary_for_invoices=True,
                is_active=True,
                is_deleted=False,
            ).select_related('bank').order_by('account_name')
        except Exception:
            return []



class Role(models.Model):
    """Custom roles defined per tenant."""
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='roles')
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True, help_text='Role description')
    permissions = models.ManyToManyField(Permission, blank=True)

    # Dashboard assignment at role level
    default_dashboard = models.ForeignKey(
        'dashboards.Dashboard',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='default_for_roles',
        help_text='Default dashboard for users with this role'
    )

    # Access control
    can_access_dashboards = models.JSONField(
        default=list,
        help_text='List of dashboard IDs this role can access'
    )
    can_access_modules = models.JSONField(
        default=list,
        help_text='List of module codes this role can access'
    )
    can_access_pages = models.JSONField(
        default=list,
        help_text='List of page codes this role can access'
    )

    # ── Legacy flat-code permission fields (kept for backward-compat) ──────────
    # The canonical permission source is now RolePermissionPolicy in the
    # permissions app.  These JSONFields remain so existing API consumers
    # continue to work; they are populated by the management command and
    # by the serializer's get_action_permissions() helper.
    permission_codes = models.JSONField(
        default=list,
        help_text='[LEGACY] Flat list of action permission codes used by the frontend '
                  '(e.g. ["pr-list", "loan-approve"]).  Populated automatically from '
                  'RolePermissionPolicy.  Do not edit directly.',
    )
    excluded_permission_codes = models.JSONField(
        default=list,
        blank=True,
        help_text='[LEGACY] Permission codes explicitly denied for this role.',
    )

    # ── Scope ─────────────────────────────────────────────────────────────────
    SCOPE_GLOBAL           = 'global'
    SCOPE_OWN_BRANCH       = 'own_branch'
    SCOPE_ASSIGNED_CLIENTS = 'assigned_clients'
    SCOPE_AJO_GROUP        = 'ajo_group'
    SCOPE_OWN_RECORDS      = 'own_records'

    SCOPE_CHOICES = [
        (SCOPE_GLOBAL,           'All Branches (Global)'),
        (SCOPE_OWN_BRANCH,       'Own Branch Only'),
        (SCOPE_ASSIGNED_CLIENTS, 'Assigned Clients Only'),
        (SCOPE_AJO_GROUP,        'Specific Ajo/Savings Group'),
        (SCOPE_OWN_RECORDS,      'Own Records Only'),
    ]

    default_scope = models.CharField(
        max_length=20,
        choices=SCOPE_CHOICES,
        default=SCOPE_OWN_BRANCH,
        help_text='Default data-visibility scope for all users with this role. '
                  'Individual RolePermissionPolicy entries can narrow or widen this.',
    )

    # ── Monetary approval ceiling ──────────────────────────────────────────────
    default_approval_limit = models.DecimalField(
        max_digits=18, decimal_places=2,
        null=True, blank=True,
        help_text='Default monetary approval ceiling for this role. '
                  'NULL = unlimited.  Can be overridden per-policy and per-user.',
    )

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('tenant', 'name')

    def __str__(self):
        return f"{self.tenant.name} / {self.name}"


class User(AbstractUser):
    """Custom user model with tenant association."""
    tenant = models.ForeignKey(
        Tenant,
        on_delete=models.CASCADE,
        related_name='users',
        null=True
    )
    branch = models.ForeignKey(
        'branches.Branch',
        on_delete=models.SET_NULL,
        null=True,
        related_name='users'
    )

    # Override these fields to add custom related_names
    groups = models.ManyToManyField(
        Group,
        verbose_name=_('groups'),
        blank=True,
        help_text=_(
            'The groups this user belongs to. A user will get all permissions '
            'granted to each of their groups.'
        ),
        related_name='custom_user_set',  # Changed from user_set
        related_query_name='user'
    )
    user_permissions = models.ManyToManyField(
        Permission,
        verbose_name=_('user permissions'),
        blank=True,
        help_text=_('Specific permissions for this user.'),
        related_name='custom_user_set',  # Changed from user_set
        related_query_name='user'
    )

    roles = models.ManyToManyField(Role, blank=True, related_name='users')
    
    # Dashboard assignment (individual level)
    assigned_dashboard = models.ForeignKey(
        'dashboards.Dashboard',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='assigned_users',
        help_text='Individual dashboard assignment (overrides role default)'
    )
    
    # User status and preferences
    is_active_user = models.BooleanField(
        default=True,
        help_text='Whether this user account is active for the tenant'
    )
    
    # SaaS Admin flag
    is_system_admin = models.BooleanField(
        default=False,
        help_text="True for system owner who manages all tenant subscriptions"
    )
    
    # User-level action permissions override
    permission_codes = models.JSONField(
        default=list,
        blank=True,
        help_text='User-specific permission codes that override/extend role permissions (e.g., ["pr-approve", "po-delete"])'
    )

    def is_owner(self):
        return hasattr(self, 'tenant_owned')
    
    @property
    def owner(self):
        """Alias for tenant to match system conventions"""
        return self.tenant
    
    @owner.setter
    def owner(self, value):
        """Allow setting owner by updating tenant"""
        self.tenant = value
    
    def get_all_action_permissions(self):
        """
        Return the flat list of permission codes for this user.

        Delegates to PermissionResolver so the new policy-based system is the
        canonical source.  Falls back gracefully to the legacy JSONField approach
        if the permissions app is not yet available (e.g. during initial migration).
        """
        if self.is_owner() or self.is_system_admin:
            return ['*']

        try:
            with db_tx.atomic():
                from permissions.services import PermissionResolver
                return PermissionResolver.get_all_permission_codes(self)
        except Exception:
            pass

        # Legacy fallback — wrapped in its own savepoint so a DB error in the
        # resolver above (which was caught) doesn't leave the transaction aborted
        # when we reach these queries.
        permissions = set()
        try:
            with db_tx.atomic():
                for role in self.roles.filter(is_active=True):
                    if isinstance(role.permission_codes, list):
                        permissions.update(role.permission_codes)
        except Exception:
            pass
        if isinstance(self.permission_codes, list):
            permissions.update(self.permission_codes)
        return sorted(permissions)

    def get_effective_permissions(self, *, module=None, page=None, action=None):
        """
        Return an EffectivePermission dataclass for this user on the given target.
        This is the primary method for permission checks in views/serializers.
        """
        try:
            with db_tx.atomic():
                from permissions.services import PermissionResolver
                return PermissionResolver.resolve(self, module=module, page=page, action=action)
        except Exception:
            # Graceful fallback during migrations
            from permissions.services import EffectivePermission
            return EffectivePermission()

    
    def has_action_permission(self, permission_code):
        """
        Check if user has a specific action permission code.

        Uses the new PermissionResolver when available; falls back to the
        legacy flat-list approach during migrations.
        """
        if self.is_owner() or self.is_system_admin:
            return True

        all_permissions = self.get_all_action_permissions()
        if '*' in all_permissions:
            return True
        if permission_code not in all_permissions:
            return False

        # Check excluded codes from all active roles
        for role in self.roles.filter(is_active=True):
            if (
                isinstance(role.excluded_permission_codes, list)
                and permission_code in role.excluded_permission_codes
            ):
                return False

        return True


    def has_perm(self, perm, obj=None):
        # owner bypasses all checks
        if self.is_owner():
            return True
        # aggregate permissions from roles
        if self.roles.filter(permissions__codename=perm.split('.')[-1]).exists():
            return True
        # fallback to default
        return super().has_perm(perm, obj)

    def has_module_perms(self, app_label):
        if self.is_owner():
            return True
        return super().has_module_perms(app_label)


    class Meta:
        ordering = ['username']

    def __str__(self):
        return f"{self.username} ({self.tenant})"


