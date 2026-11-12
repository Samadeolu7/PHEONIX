"""
Client-facing (customer) portal.

SECURITY MODEL — read this before changing anything in this app.

1. Customers are NOT staff.  ``PortalCustomer`` is deliberately a separate
   table from ``users.User``.  The ERP's default DRF permission is
   ``IsAuthenticated`` and hundreds of staff endpoints rely on it; if
   customers were ``User`` rows, any registered member of the public would
   pass that check.  A portal session can only ever authenticate the views
   in this app (see ``portal.authentication``), and staff JWTs are never
   accepted by portal views.

2. Online applications are a staging area.  Nothing a customer submits is
   written into ``clients.Client``, ``loans.LoanAccount`` or the GL.  A staff
   member with the right permission reviews the application and converts it
   (``portal.services.convert_application``), which goes through the same
   rules a counter-entered loan does.

3. Sessions are opaque random tokens held in an httpOnly cookie.  Only the
   SHA-256 hash is stored, so a database leak does not leak live sessions.

4. Everything is tenant-bound and fails closed: the portal only works for a
   tenant that has explicitly enabled it, and a customer's session is only
   valid on requests resolved to the customer's own tenant.

5. NIN / BVN are encrypted at rest and only ever returned masked to the
   customer.
"""
import hashlib
import secrets
import string
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.db import models
from django.utils import timezone
from django_cryptography.fields import encrypt


def _portal_setting(name, default):
    return getattr(settings, 'PORTAL', {}).get(name, default)


def hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode('utf-8')).hexdigest()


def mask_identifier(value: str | None) -> str:
    """'22345678901' -> '*******8901'."""
    if not value:
        return ''
    value = str(value)
    return '*' * max(len(value) - 4, 0) + value[-4:]


# ─────────────────────────────────────────────────────────────────────────────
# Tenant-level configuration (staff-managed)
# ─────────────────────────────────────────────────────────────────────────────

class PortalConfig(models.Model):
    """
    Per-tenant switch for the customer portal.  No row (or ``is_enabled``
    False) means every portal endpoint for that tenant returns 404.
    """
    tenant = models.OneToOneField(
        'users.Tenant', on_delete=models.CASCADE, related_name='portal_config',
    )
    is_enabled = models.BooleanField(
        default=False,
        help_text='Master switch. When off, the portal is invisible for this organisation.',
    )
    allow_registration = models.BooleanField(
        default=True,
        help_text='Turn off to stop new sign-ups while keeping existing customers able to log in.',
    )
    max_open_applications = models.PositiveSmallIntegerField(
        default=1,
        help_text='How many unresolved applications one customer may have at a time.',
    )
    support_phone = models.CharField(max_length=30, blank=True)
    support_email = models.EmailField(blank=True)
    terms_url = models.URLField(blank=True)
    privacy_url = models.URLField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Portal configuration'

    def __str__(self):
        return f"Portal config — {self.tenant} ({'on' if self.is_enabled else 'off'})"


class PortalLoanOffering(models.Model):
    """
    Explicit allow-list of loan products the public may apply for online.
    A product is never exposed just because it exists.
    """
    tenant = models.ForeignKey('users.Tenant', on_delete=models.CASCADE, related_name='portal_offerings')
    loan_product = models.ForeignKey(
        'loans.LoanProduct', on_delete=models.CASCADE, related_name='portal_offerings',
    )
    is_active = models.BooleanField(default=True)
    display_name = models.CharField(
        max_length=150, blank=True,
        help_text='Customer-facing name. Defaults to the product name.',
    )
    public_description = models.TextField(blank=True)
    max_online_amount = models.DecimalField(
        max_digits=18, decimal_places=2, null=True, blank=True,
        help_text='Optional cap for online applications, below the product maximum.',
    )
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['sort_order', 'id']
        constraints = [
            models.UniqueConstraint(fields=['tenant', 'loan_product'], name='uniq_portal_offering_per_product'),
        ]

    def __str__(self):
        return self.display_name or str(self.loan_product)

    def clean(self):
        from django.core.exceptions import ValidationError
        # Never expose another organisation's product.
        if self.loan_product_id and self.tenant_id and self.loan_product.tenant_id != self.tenant_id:
            raise ValidationError({'loan_product': 'The loan product must belong to the same organisation.'})
        if (
            self.max_online_amount is not None and self.loan_product_id
            and self.max_online_amount < self.loan_product.min_loan_amount
        ):
            raise ValidationError({'max_online_amount': 'Online cap cannot be below the product minimum.'})

    @property
    def effective_max_amount(self):
        product_max = self.loan_product.max_loan_amount
        if self.max_online_amount is not None:
            return min(product_max, self.max_online_amount)
        return product_max


# ─────────────────────────────────────────────────────────────────────────────
# Customer identity
# ─────────────────────────────────────────────────────────────────────────────

class PortalCustomer(models.Model):
    """
    A member of the public with a portal login.  NOT a ``users.User``.

    ``client`` is only set by staff during conversion, after they have
    verified the person's identity.  It is never set from customer input.
    """
    tenant = models.ForeignKey('users.Tenant', on_delete=models.CASCADE, related_name='portal_customers')
    email = models.EmailField()
    phone = models.CharField(max_length=20)
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    password = models.CharField(max_length=128)

    is_active = models.BooleanField(default=True)
    email_verified_at = models.DateTimeField(null=True, blank=True)

    failed_login_count = models.PositiveSmallIntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)
    last_login = models.DateTimeField(null=True, blank=True)
    password_changed_at = models.DateTimeField(null=True, blank=True)

    accepted_terms_at = models.DateTimeField()

    client = models.ForeignKey(
        'clients.Client', null=True, blank=True, on_delete=models.SET_NULL,
        related_name='portal_customers',
        help_text='Linked by staff on conversion only.',
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Lets DRF's IsAuthenticated work inside portal views.  These are only
    # ever placed on request.user by PortalSessionAuthentication, which is
    # used by portal views alone.
    is_authenticated = True
    is_anonymous = False
    is_portal_customer = True
    # Defensive: anything that checks staff-ness must see "no".
    is_staff = False
    is_superuser = False
    is_system_admin = False

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['tenant', 'email'], name='uniq_portal_customer_email_per_tenant'),
        ]
        indexes = [models.Index(fields=['tenant', 'phone'])]

    def __str__(self):
        return f"{self.first_name} {self.last_name} <{self.email}>"

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}".strip()

    @property
    def is_email_verified(self):
        return self.email_verified_at is not None

    # Password handling — Django's configured hashers (PBKDF2 by default).
    def set_password(self, raw_password):
        self.password = make_password(raw_password)
        self.password_changed_at = timezone.now()

    def check_password(self, raw_password):
        return check_password(raw_password, self.password)

    # Lockout
    def is_locked(self):
        return bool(self.locked_until and self.locked_until > timezone.now())

    def register_failed_login(self):
        self.failed_login_count += 1
        threshold = _portal_setting('LOCKOUT_THRESHOLD', 5)
        if self.failed_login_count >= threshold:
            self.locked_until = timezone.now() + timedelta(
                minutes=_portal_setting('LOCKOUT_MINUTES', 15)
            )
            self.failed_login_count = 0
        self.save(update_fields=['failed_login_count', 'locked_until', 'updated_at'])

    def register_successful_login(self):
        self.failed_login_count = 0
        self.locked_until = None
        self.last_login = timezone.now()
        self.save(update_fields=['failed_login_count', 'locked_until', 'last_login', 'updated_at'])


class PortalSession(models.Model):
    """Server-side session; the cookie carries the raw token, we store only its hash."""
    customer = models.ForeignKey(PortalCustomer, on_delete=models.CASCADE, related_name='sessions')
    token_hash = models.CharField(max_length=64, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_seen_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField()
    revoked_at = models.DateTimeField(null=True, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=300, blank=True)

    class Meta:
        indexes = [models.Index(fields=['customer', 'revoked_at'])]

    @classmethod
    def issue(cls, customer, *, ip_address=None, user_agent=''):
        raw = secrets.token_urlsafe(32)
        now = timezone.now()
        session = cls.objects.create(
            customer=customer,
            token_hash=hash_token(raw),
            last_seen_at=now,
            expires_at=now + timedelta(hours=_portal_setting('SESSION_ABSOLUTE_HOURS', 12)),
            ip_address=ip_address,
            user_agent=(user_agent or '')[:300],
        )
        return session, raw

    def is_valid(self, now=None):
        now = now or timezone.now()
        if self.revoked_at is not None or self.expires_at <= now:
            return False
        idle = timedelta(minutes=_portal_setting('SESSION_IDLE_MINUTES', 30))
        return self.last_seen_at + idle > now

    def revoke(self):
        if self.revoked_at is None:
            self.revoked_at = timezone.now()
            self.save(update_fields=['revoked_at'])

    @classmethod
    def revoke_all_for(cls, customer):
        cls.objects.filter(customer=customer, revoked_at__isnull=True).update(revoked_at=timezone.now())


# ─────────────────────────────────────────────────────────────────────────────
# Online loan application (staging)
# ─────────────────────────────────────────────────────────────────────────────

_REF_ALPHABET = ''.join(c for c in string.ascii_uppercase + string.digits if c not in 'O0I1L')


def generate_application_reference():
    """Non-sequential, non-guessable reference, e.g. OLA-7KQ2-M9XH-CT4P."""
    chunks = [''.join(secrets.choice(_REF_ALPHABET) for _ in range(4)) for _ in range(3)]
    return 'OLA-' + '-'.join(chunks)


class OnlineLoanApplication(models.Model):
    STATUS_SUBMITTED = 'submitted'
    STATUS_UNDER_REVIEW = 'under_review'
    STATUS_CONVERTED = 'converted'
    STATUS_REJECTED = 'rejected'
    STATUS_WITHDRAWN = 'withdrawn'
    STATUS_CHOICES = [
        (STATUS_SUBMITTED, 'Submitted'),
        (STATUS_UNDER_REVIEW, 'Under review'),
        (STATUS_CONVERTED, 'Accepted for processing'),
        (STATUS_REJECTED, 'Declined'),
        (STATUS_WITHDRAWN, 'Withdrawn'),
    ]
    OPEN_STATUSES = (STATUS_SUBMITTED, STATUS_UNDER_REVIEW)

    GENDER_CHOICES = [('male', 'Male'), ('female', 'Female'), ('other', 'Other')]
    MARITAL_CHOICES = [
        ('single', 'Single'), ('married', 'Married'), ('divorced', 'Divorced'),
        ('widowed', 'Widowed'),
    ]
    # Kept identical to clients.Client choices so conversion is a straight copy.
    TITLE_CHOICES = [('mr', 'Mr'), ('mrs', 'Mrs'), ('miss', 'Miss'), ('dr', 'Dr'), ('chief', 'Chief')]
    EMPLOYMENT_CHOICES = [
        ('employed', 'Employed'), ('self_employed', 'Self-employed / Business owner'),
        ('unemployed', 'Unemployed'), ('retired', 'Retired'), ('student', 'Student'),
    ]

    tenant = models.ForeignKey('users.Tenant', on_delete=models.CASCADE, related_name='online_loan_applications')
    branch = models.ForeignKey('branches.Branch', on_delete=models.PROTECT, related_name='online_loan_applications')
    customer = models.ForeignKey(PortalCustomer, on_delete=models.PROTECT, related_name='applications')
    reference = models.CharField(max_length=20, unique=True, default=generate_application_reference, editable=False)

    # What they want
    offering = models.ForeignKey(PortalLoanOffering, on_delete=models.PROTECT, related_name='applications')
    loan_product = models.ForeignKey('loans.LoanProduct', on_delete=models.PROTECT, related_name='online_applications')
    requested_amount = models.DecimalField(max_digits=18, decimal_places=2)
    term = models.PositiveIntegerField()
    term_unit = models.CharField(max_length=10)
    repayment_frequency = models.CharField(max_length=20)
    loan_purpose = models.TextField(max_length=1000)

    # Applicant snapshot (copied to Client on conversion, after staff review)
    title = models.CharField(max_length=10, blank=True, choices=TITLE_CHOICES)
    first_name = models.CharField(max_length=100)
    middle_name = models.CharField(max_length=100, blank=True)
    last_name = models.CharField(max_length=100)
    gender = models.CharField(max_length=10, choices=GENDER_CHOICES)
    date_of_birth = models.DateField()
    marital_status = models.CharField(max_length=20, choices=MARITAL_CHOICES, blank=True)
    email = models.EmailField()
    phone_primary = models.CharField(max_length=20)
    phone_secondary = models.CharField(max_length=20, blank=True)
    address_street = models.CharField(max_length=200)
    address_city = models.CharField(max_length=100)
    address_state = models.CharField(max_length=100)

    nin = encrypt(models.CharField(max_length=11))
    bvn = encrypt(models.CharField(max_length=11))
    # Keyed hashes so staff can detect duplicates without decrypting every row.
    nin_fingerprint = models.CharField(max_length=64, db_index=True)
    bvn_fingerprint = models.CharField(max_length=64, db_index=True)

    employment_status = models.CharField(max_length=20, choices=EMPLOYMENT_CHOICES)
    occupation = models.CharField(max_length=200, blank=True)
    employer_name = models.CharField(max_length=200, blank=True)
    employer_address = models.TextField(blank=True)
    monthly_income = models.DecimalField(max_digits=18, decimal_places=2)

    next_of_kin_name = models.CharField(max_length=200)
    next_of_kin_relationship = models.CharField(max_length=100)
    next_of_kin_phone = models.CharField(max_length=20)

    bank_name = models.CharField(max_length=100, blank=True)
    bank_account_name = models.CharField(max_length=200, blank=True)
    bank_account_number = encrypt(models.CharField(max_length=10, blank=True))

    consent_credit_check = models.BooleanField(default=False)
    consent_data_processing = models.BooleanField(default=False)

    # Workflow
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_SUBMITTED, db_index=True)
    submitted_at = models.DateTimeField(auto_now_add=True)
    submitted_ip = models.GenericIPAddressField(null=True, blank=True)
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='assigned_online_applications',
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='reviewed_online_applications',
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    staff_notes = models.TextField(blank=True, help_text='Internal — never shown to the customer.')
    customer_message = models.TextField(blank=True, help_text='Shown to the customer (e.g. reason for decline).')
    converted_client = models.ForeignKey(
        'clients.Client', null=True, blank=True, on_delete=models.SET_NULL, related_name='online_applications',
    )
    converted_loan = models.OneToOneField(
        'loans.LoanAccount', null=True, blank=True, on_delete=models.SET_NULL, related_name='online_application',
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-submitted_at']
        indexes = [
            models.Index(fields=['tenant', 'status']),
            models.Index(fields=['tenant', 'branch', 'status']),
        ]

    def __str__(self):
        return f"{self.reference} — {self.first_name} {self.last_name}"

    @property
    def is_open(self):
        return self.status in self.OPEN_STATUSES

    @property
    def full_name(self):
        return ' '.join(p for p in [self.first_name, self.middle_name, self.last_name] if p)


def identifier_fingerprint(value: str) -> str:
    """HMAC of NIN/BVN with SECRET_KEY — lets us find duplicates without decryption."""
    import hmac
    return hmac.new(
        settings.SECRET_KEY.encode('utf-8'), f'portal-id:{value}'.encode('utf-8'), hashlib.sha256,
    ).hexdigest()


# ─────────────────────────────────────────────────────────────────────────────
# Security audit trail
# ─────────────────────────────────────────────────────────────────────────────

class PortalAuditEvent(models.Model):
    EVENT_CHOICES = [
        ('register', 'Registered'),
        ('register_duplicate', 'Registration attempt for existing email'),
        ('email_verified', 'Email verified'),
        ('login_success', 'Login success'),
        ('login_failed', 'Login failed'),
        ('login_locked', 'Login blocked — account locked'),
        ('account_locked', 'Account locked'),
        ('logout', 'Logout'),
        ('password_reset_requested', 'Password reset requested'),
        ('password_reset_completed', 'Password reset completed'),
        ('password_changed', 'Password changed'),
        ('application_submitted', 'Application submitted'),
        ('application_withdrawn', 'Application withdrawn'),
        ('application_review_started', 'Staff started review'),
        ('application_rejected', 'Staff declined application'),
        ('application_converted', 'Staff converted application'),
    ]
    tenant = models.ForeignKey('users.Tenant', null=True, blank=True, on_delete=models.SET_NULL)
    customer = models.ForeignKey(PortalCustomer, null=True, blank=True, on_delete=models.SET_NULL)
    application = models.ForeignKey(OnlineLoanApplication, null=True, blank=True, on_delete=models.SET_NULL)
    staff_user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    event = models.CharField(max_length=40, choices=EVENT_CHOICES, db_index=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=300, blank=True)
    detail = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.created_at:%Y-%m-%d %H:%M} {self.event}"
