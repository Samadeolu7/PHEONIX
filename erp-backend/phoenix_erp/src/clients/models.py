import re
from django.db import models
from django.core.exceptions import ValidationError
from django.db import transaction as db_transaction
from common.base import TimeStampedModel, BranchScopedModel, SoftDeleteModel
from common.managers import OwnerBranchManager, SoftDeleteManager
from django.conf import settings
from django.utils import timezone


def validate_nin(value):
    """Nigerian National Identification Number: exactly 11 digits."""
    if value and not re.fullmatch(r'\d{11}', str(value)):
        raise ValidationError(
            'NIN must be exactly 11 digits (e.g. 12345678901).'
        )


def validate_bvn(value):
    """Bank Verification Number: exactly 11 digits (CBN standard)."""
    if value and not re.fullmatch(r'\d{11}', str(value)):
        raise ValidationError(
            'BVN must be exactly 11 digits (e.g. 22345678901).'
        )

class Client(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Enhanced client model with comprehensive KYC and relationship tracking
    """
    # Basic Information
    client_id = models.CharField(max_length=50, unique=True, db_index=True)
    title = models.CharField(max_length=10, blank=True, choices=[
        ('mr', 'Mr'),
        ('mrs', 'Mrs'),
        ('miss', 'Miss'),
        ('dr', 'Dr'),
        ('chief', 'Chief'),
    ])
    first_name = models.CharField(max_length=100)
    middle_name = models.CharField(max_length=100, blank=True)
    last_name = models.CharField(max_length=100)
    gender = models.CharField(max_length=10, choices=[
        ('male', 'Male'),
        ('female', 'Female'),
        ('other', 'Other')
    ])
    date_of_birth = models.DateField(null=True, blank=True)
    place_of_birth = models.CharField(max_length=100, blank=True, null=True)
    
    # Classification and Status
    classification = models.ForeignKey(
        'ClientClassification',
        null=True, blank=True,
        on_delete=models.SET_NULL
    )
    status = models.CharField(max_length=20, choices=[
        ('active', 'Active'),
        ('inactive', 'Inactive'),
        ('suspended', 'Suspended'),
        ('blacklisted', 'Blacklisted')
    ], default='active')
    risk_level = models.CharField(max_length=20, choices=[
        ('low', 'Low Risk'),
        ('medium', 'Medium Risk'),
        ('high', 'High Risk')
    ], default='low')

    # Contact Information
    email = models.EmailField(blank=True, null=True)
    phone_primary = models.CharField(max_length=20)
    phone_secondary = models.CharField(max_length=20, blank=True, null=True)
    address_street = models.CharField(max_length=200, blank=True, null=True)
    address_city = models.CharField(max_length=100, null=True, blank=True)
    address_state = models.CharField(max_length=100, blank=True, null=True)
    address_postal_code = models.CharField(max_length=20, blank=True)
    address_country = models.CharField(max_length=100, default='Nigeria', blank=True, null=True)
    
    # Identification
    id_type = models.CharField(max_length=50, choices=[
        ('national_id', 'National ID'),
        ('nin', 'NIN (National Identification Number)'),
        ('drivers_license', 'Driver\'s License'),
        ('passport', 'International Passport'),
        ('voters_card', 'Voter\'s Card'),
    ], blank=True, null=True)
    id_number = models.CharField(max_length=100, blank=True, null=True)
    id_issue_date = models.DateField(null=True, blank=True)
    id_expiry_date = models.DateField(null=True, blank=True)

    # Dedicated NIN field — unique across ALL branches (branch-agnostic)
    nin = models.CharField(
        max_length=11,
        unique=True,
        null=True,
        blank=True,
        db_index=True,
        validators=[validate_nin],
        help_text='National Identification Number (11 digits). Must be globally unique.',
    )
    
    # Employment and Income
    occupation = models.CharField(max_length=200, blank=True, null=True)
    employer_name = models.CharField(max_length=200, blank=True, null=True)
    employer_address = models.TextField(blank=True, null=True)
    employment_status = models.CharField(max_length=50, choices=[
        ('employed', 'Employed'),
        ('self_employed', 'Self Employed'),
        ('unemployed', 'Unemployed'),
        ('retired', 'Retired'),
        ('student', 'Student')
    ], blank=True, null=True)
    annual_income = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)
    income_source = models.CharField(max_length=100, blank=True, null=True)

    # Personal Details
    marital_status = models.CharField(
        max_length=20, choices=[
            ('single', 'Single'),
            ('married', 'Married'),
            ('divorced', 'Divorced'),
            ('widowed', 'Widowed')
        ]
    , blank=True, null=True)
    education_level = models.CharField(max_length=50, choices=[
        ('none', 'None'),
        ('primary', 'Primary'),
        ('secondary', 'Secondary'),
        ('tertiary', 'Tertiary'),
        ('graduate', 'Graduate'),
        ('post_graduate', 'Post Graduate')
    ], blank=True, null=True)
    
    # Next of Kin / Emergency Contact
    next_of_kin_name = models.CharField(max_length=200, blank=True, null=True)
    next_of_kin_relationship = models.CharField(max_length=100, blank=True, null=True)
    next_of_kin_phone = models.CharField(max_length=20, blank=True, null=True)
    next_of_kin_email = models.EmailField(blank=True, null=True)
    next_of_kin_address = models.TextField(blank=True, null=True)
    
    # Banking Information
    bank_name = models.CharField(max_length=100, blank=True, null=True)
    bank_account_name = models.CharField(max_length=200, blank=True, null=True)
    bank_account_number = models.CharField(max_length=50, blank=True, null=True)
    bank_verification_number = models.CharField(max_length=100, blank=True, null=True)

    # BVN — strict 11-digit validated field (CBN Bank Verification Number)
    bvn = models.CharField(
        max_length=11,
        unique=True,
        null=True,
        blank=True,
        db_index=True,
        validators=[validate_bvn],
        help_text='CBN Bank Verification Number (11 digits). Globally unique across all clients.',
    )

    # KYC verification tracking
    kyc_verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='kyc_verifications_performed',
        help_text="Staff member who verified this client's KYC documents.",
    )
    
    # Marketing and Communication
    preferred_language = models.CharField(max_length=50, default='English')
    communication_preference = models.CharField(max_length=20, choices=[
        ('email', 'Email'),
        ('sms', 'SMS'),
        ('whatsapp', 'WhatsApp'),
        ('call', 'Phone Call')
    ], default='sms')
    marketing_consent = models.BooleanField(default=False)
    
    # Student-Specific Fields (populated when usage_context='student')
    admission_number = models.CharField(max_length=50, blank=True, null=True, db_index=True, 
                                       help_text="Unique student admission/registration number")
    admission_date = models.DateField(null=True, blank=True, help_text="Date of admission to institution")
    class_name = models.CharField(max_length=100, blank=True, null=True, help_text="Current class/form (e.g., 'Grade 5', 'Form 2', 'Year 1')")
    grade_level = models.CharField(max_length=50, blank=True, null=True, help_text="Academic level or year")
    section = models.CharField(max_length=50, blank=True, null=True, help_text="Class section (e.g., 'A', 'B', 'Blue', 'Red')")
    roll_number = models.CharField(max_length=50, blank=True, null=True, help_text="Roll/seat number in class")
    academic_year = models.CharField(max_length=20, blank=True, null=True, help_text="Current academic year (e.g., '2025/2026')")
    student_status = models.CharField(max_length=20, blank=True, null=True, choices=[
        ('enrolled', 'Enrolled'),
        ('graduated', 'Graduated'),
        ('transferred', 'Transferred'),
        ('withdrawn', 'Withdrawn'),
        ('suspended', 'Suspended'),
        ('expelled', 'Expelled')
    ], help_text="Academic status for students")
    school_house = models.CharField(max_length=50, blank=True, null=True,
                                   help_text="Student's house (e.g., 'Blue', 'Green', 'Red', 'Yellow')")
    previous_school_class = models.CharField(max_length=100, blank=True, null=True,
                                            help_text="Last class attended at previous school")
    previous_school_name = models.CharField(max_length=200, blank=True, null=True,
                                           help_text="Name of the previous school attended")
    state_of_origin = models.CharField(max_length=100, blank=True, null=True,
                                       help_text="State of origin for the student")
    lga = models.CharField(max_length=100, blank=True, null=True,
                           help_text="Local Government Area (LGA) of origin")
    proposed_entry_month = models.CharField(max_length=20, blank=True, null=True,
                                            help_text="Proposed month of entry (e.g., 'September')")
    who_pays_fees = models.CharField(max_length=100, blank=True, null=True,
                                    help_text="Who is responsible for paying the student's fees")
    
    # Guardian/Parent Information (for students)
    primary_guardian_name = models.CharField(max_length=200, blank=True, null=True, 
                                            help_text="Name of primary parent/guardian")
    primary_guardian_relationship = models.CharField(max_length=50, blank=True, null=True,
                                                     choices=[
                                                         ('father', 'Father'),
                                                         ('mother', 'Mother'),
                                                         ('grandfather', 'Grandfather'),
                                                         ('grandmother', 'Grandmother'),
                                                         ('uncle', 'Uncle'),
                                                         ('aunt', 'Aunt'),
                                                         ('guardian', 'Legal Guardian'),
                                                         ('other', 'Other')
                                                     ])
    primary_guardian_phone = models.CharField(max_length=20, blank=True, null=True)
    primary_guardian_email = models.EmailField(blank=True, null=True)
    primary_guardian_occupation = models.CharField(max_length=200, blank=True, null=True)
    primary_guardian_home_address = models.TextField(blank=True, null=True,
                                                    help_text="Home address of primary guardian")
    primary_guardian_office_address = models.TextField(blank=True, null=True,
                                                      help_text="Office address of primary guardian")
    
    secondary_guardian_name = models.CharField(max_length=200, blank=True, null=True,
                                              help_text="Name of secondary parent/guardian")
    secondary_guardian_relationship = models.CharField(max_length=50, blank=True, null=True,
                                                       choices=[
                                                           ('father', 'Father'),
                                                           ('mother', 'Mother'),
                                                           ('grandfather', 'Grandfather'),
                                                           ('grandmother', 'Grandmother'),
                                                           ('uncle', 'Uncle'),
                                                           ('aunt', 'Aunt'),
                                                           ('guardian', 'Legal Guardian'),
                                                           ('other', 'Other')
                                                       ])
    secondary_guardian_phone = models.CharField(max_length=20, blank=True, null=True)
    secondary_guardian_email = models.EmailField(blank=True, null=True)
    secondary_guardian_occupation = models.CharField(max_length=200, blank=True, null=True)
    secondary_guardian_home_address = models.TextField(blank=True, null=True,
                                                      help_text="Home address of secondary guardian")
    secondary_guardian_office_address = models.TextField(blank=True, null=True,
                                                        help_text="Office address of secondary guardian")
    
    # Medical Information (for students/patients)
    blood_group = models.CharField(max_length=10, blank=True, null=True,
                                  choices=[
                                      ('A+', 'A+'), ('A-', 'A-'),
                                      ('B+', 'B+'), ('B-', 'B-'),
                                      ('AB+', 'AB+'), ('AB-', 'AB-'),
                                      ('O+', 'O+'), ('O-', 'O-')
                                  ])
    allergies = models.TextField(blank=True, null=True, help_text="Known allergies")
    medical_conditions = models.TextField(blank=True, null=True, help_text="Pre-existing medical conditions")
    emergency_contact_name = models.CharField(max_length=200, blank=True, null=True)
    emergency_contact_phone = models.CharField(max_length=20, blank=True, null=True)
    emergency_contact_relationship = models.CharField(max_length=50, blank=True, null=True)
    
    # Document Management
    image = models.ImageField(upload_to='clients/images/', blank=True, null=True)
    signature = models.ImageField(upload_to='clients/signatures/', blank=True, null=True)
    
    # System Fields
    referral_source = models.CharField(max_length=100, blank=True, null=True)
    kyc_status = models.CharField(max_length=20, choices=[
        ('pending', 'Pending'),
        ('submitted', 'Submitted'),
        ('verified', 'Verified'),
        ('rejected', 'Rejected')
    ], default='pending')
    kyc_last_update = models.DateTimeField(null=True, blank=True)
    last_kyc_check = models.DateField(null=True, blank=True)
    
    metadata = models.JSONField(
        default=dict,
        blank=True,
        help_text="Domain-specific additional data"
    )
    
    # Usage tags for filtering
    usage_context = models.CharField(
        max_length=50,
        choices=[
            ('client', 'Client'),
            ('financial', 'Financial Client'),
            ('student', 'Student'),
            ('patient', 'Patient'),
            ('customer', 'Customer'),
        ],
        default='client',
        db_index=True
    )
    
    # Previous/external system reference
    external_id = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        db_index=True,
        help_text="ID from previous/external system"
    )

    # ── KTIL microfinance fields ───────────────────────────────────────────────

    # Primary loan product type for this client
    CLIENT_TYPE_CHOICES = [
        ('dc', 'Daily Contributor'),
        ('wl', 'Weekly Client'),
        ('ml', 'Monthly Client'),
        ('pr', 'Prospect'),
    ]
    client_type = models.CharField(
        max_length=5,
        choices=CLIENT_TYPE_CHOICES,
        blank=True,
        null=True,
        db_index=True,
        help_text="Primary client type (dc=daily, wl=weekly, ml=monthly, pr=prospect)"
    )

    # Ajo group membership (for DC / daily-contribution clients)
    group = models.ForeignKey(
        'ClientGroup',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='members',
        help_text="Ajo/group savings group this client belongs to"
    )

    # Assigned credit officer — drives data-access scoping
    assigned_officer = models.ForeignKey(
        'hr.Staff',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='assigned_clients',
        help_text='Credit officer responsible for this client. '
                  'Officers only see clients assigned to them; '
                  'supervisors see their team\'s clients too.',
    )

    # Account manager — relationship manager (different from credit officer)
    account_manager = models.ForeignKey(
        'hr.Staff',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='managed_clients',
        help_text='Account / relationship manager responsible for this client.',
    )

    class Meta:
        ordering = ['last_name', 'first_name']
        indexes = [
            models.Index(fields=['client_id']),
            models.Index(fields=['usage_context', 'status']),
            models.Index(fields=['external_id']),
            models.Index(fields=['phone_primary']),
            models.Index(fields=['last_name', 'first_name']),
            models.Index(fields=['nin']),
        ]
    
    def set_metadata(self, key, value):
        """Safely set metadata value"""
        if not isinstance(self.metadata, dict):
            self.metadata = {}
        self.metadata[key] = value
    
    def get_metadata(self, key, default=None):
        """Safely get metadata value"""
        if not isinstance(self.metadata, dict):
            return default
        return self.metadata.get(key, default)

    def __str__(self):
        return f"{self.last_name}, {self.first_name} ({self.client_id})"

    @property
    def full_name(self):
        """Returns the client's full name."""
        parts = [self.first_name]
        if self.middle_name:
            parts.append(self.middle_name)
        parts.append(self.last_name)
        return ' '.join(parts)
    
    @property
    def name(self):
        """Alias for full_name for backward compatibility"""
        return self.full_name

    @property
    def age(self):
        """Calculate client's current age"""
        if not self.date_of_birth:
            return None
        today = timezone.now().date()
        return today.year - self.date_of_birth.year - (
            (today.month, today.day) < (self.date_of_birth.month, self.date_of_birth.day)
        )
    
    def clean(self):
        """Validate client data"""
        if self.date_of_birth and self.date_of_birth > timezone.now().date():
            raise ValidationError({'date_of_birth': 'Date of birth cannot be in the future'})

        if self.id_expiry_date and self.id_issue_date and self.id_expiry_date <= self.id_issue_date:
            raise ValidationError({'id_expiry_date': 'ID expiry date must be after issue date'})

        # NIN cross-branch duplicate check
        if self.nin:
            validate_nin(self.nin)  # format check
            qs = Client.objects.filter(nin=self.nin)
            if self.pk:
                qs = qs.exclude(pk=self.pk)
            existing = qs.select_related('branch').first()
            if existing:
                branch_name = existing.branch.name if existing.branch else 'unknown branch'
                raise ValidationError({
                    'nin': (
                        f'A client with NIN {self.nin} already exists '
                        f'({existing.first_name} {existing.last_name}, {branch_name}). '
                        'Each NIN must be unique across all branches.'
                    )
                })

    def save(self, *args, **kwargs):
        """Auto-generate client_id and auto-assign tenant if not provided"""
        # Auto-assign tenant using three-level fallback
        if not self.tenant_id:
            from common.managers import get_current_tenant
            tenant = get_current_tenant()
            if tenant:
                self.tenant = tenant
            elif self.owner and hasattr(self.owner, 'tenant'):
                self.tenant = self.owner.tenant
            elif self.branch and hasattr(self.branch, 'tenant'):
                self.tenant = self.branch.tenant
        
        if not self.client_id:
            # Microfinance client types use type-specific prefixes (matches legacy system IDs)
            # so that WL-00001, ML-00001, DC-00001, PR-00001 are generated instead of CLI-00001.
            _TYPE_PREFIX_MAP = {
                'wl': 'WL',
                'ml': 'ML',
                'dc': 'DC',
                'pr': 'PR',
            }
            if self.client_type and self.client_type.lower() in _TYPE_PREFIX_MAP:
                prefix = _TYPE_PREFIX_MAP[self.client_type.lower()]
            else:
                # Fall back to usage-context prefix for non-microfinance clients
                _CONTEXT_PREFIX_MAP = {
                    'client': 'CLI',
                    'financial': 'CLI',
                    'student': 'STU',
                    'patient': 'PAT',
                    'customer': 'CUS',
                }
                prefix = _CONTEXT_PREFIX_MAP.get(self.usage_context, 'CLI')

            # Find the highest existing number for this prefix.
            # client_id is globally unique (not branch-scoped, like nin/bvn),
            # so the counter must span all branches or new branches collide
            # with numbers already used elsewhere. Include soft-deleted rows
            # too since their client_id still occupies the unique slot.
            last_client = Client.all_objects.filter(
                client_id__startswith=prefix + '-',
            ).order_by('-client_id').first()

            if last_client and last_client.client_id:
                try:
                    # Extract number from last client_id (e.g., WL-00042 → 42)
                    last_num = int(last_client.client_id.split('-')[-1])
                    new_num = last_num + 1
                except (ValueError, IndexError):
                    new_num = 1
            else:
                new_num = 1

            self.client_id = f"{prefix}-{new_num:05d}"
        
        super().save(*args, **kwargs)

    def update_kyc_status(self, status, notes=None):
        """Update KYC status and record the change"""
        self.kyc_status = status
        self.kyc_last_update = timezone.now()
        if status == 'verified':
            self.last_kyc_check = timezone.now().date()
        if notes:
            if self.notes:
                self.notes += f"\n[{timezone.now()}] KYC Status Update to {status}: {notes}"
            else:
                self.notes = f"[{timezone.now()}] KYC Status Update to {status}: {notes}"
        self.save()


class ClientRegistrationConfig(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Branch-scoped registration and ID-card fee configuration by client type.

    Fees are collected in cash at registration (or conversion from prospect)
    and posted to income accounts.
    """
    # Income GL accounts (separate per requirement)
    registration_income_account = models.ForeignKey(
        'accounts.Account',
        on_delete=models.PROTECT,
        related_name='client_registration_income_configs',
        limit_choices_to={'account_type': 'INCOME'},
    )
    id_fee_income_account = models.ForeignKey(
        'accounts.Account',
        on_delete=models.PROTECT,
        related_name='client_id_fee_income_configs',
        limit_choices_to={'account_type': 'INCOME'},
    )
    # Falls back to registration_income_account when unset, so reactivation
    # fee collection works out of the box without requiring a separate
    # Administration setup step.
    reactivation_income_account = models.ForeignKey(
        'accounts.Account',
        on_delete=models.PROTECT,
        related_name='client_reactivation_income_configs',
        limit_choices_to={'account_type': 'INCOME'},
        null=True,
        blank=True,
    )

    # Daily client fees
    daily_registration_fee = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    daily_id_fee = models.DecimalField(max_digits=18, decimal_places=2, default=0)

    # Weekly client fees
    weekly_registration_fee = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    weekly_id_fee = models.DecimalField(max_digits=18, decimal_places=2, default=0)

    # Monthly client fees
    monthly_registration_fee = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    monthly_id_fee = models.DecimalField(max_digits=18, decimal_places=2, default=0)

    # Flat fee charged when restoring a suspended/inactive/blacklisted/dormant
    # client to active status.
    reactivation_fee = models.DecimalField(max_digits=18, decimal_places=2, default=1000)

    # Active config marker per branch
    is_active = models.BooleanField(default=True)

    objects = OwnerBranchManager()
    all_objects = OwnerBranchManager(include_deleted=True)

    class Meta:
        ordering = ['-updated_at']

    def __str__(self):
        branch_name = self.branch.name if self.branch else 'No Branch'
        return f"Client Registration Config - {branch_name}"

    def get_fees_for_client_type(self, client_type: str):
        ctype = (client_type or '').lower()
        if ctype == 'dc':
            return self.daily_registration_fee, self.daily_id_fee
        if ctype == 'wl':
            return self.weekly_registration_fee, self.weekly_id_fee
        if ctype == 'ml':
            return self.monthly_registration_fee, self.monthly_id_fee
        return 0, 0


class ClientClassification(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Classification categories for clients (e.g. VIP, Regular, Corporate)
    """
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=20, db_index=True)
    description = models.TextField(blank=True)
    priority_level = models.PositiveIntegerField(default=0)
    credit_limit = models.DecimalField(
        max_digits=18, decimal_places=2,
        null=True, blank=True,
        help_text="Default credit limit for clients in this classification"
    )
    special_rates = models.JSONField(
        default=dict, blank=True,
        help_text="Special interest rates or fees for this classification"
    )

    objects = OwnerBranchManager()
    all_objects = OwnerBranchManager(include_deleted=True)
    
    def save(self, *args, **kwargs):
        """Auto-assign tenant if not provided"""
        if not self.tenant_id:
            from common.managers import get_current_tenant
            tenant = get_current_tenant()
            if tenant:
                self.tenant = tenant
            elif self.owner and hasattr(self.owner, 'tenant'):
                self.tenant = self.owner.tenant
            elif self.branch and hasattr(self.branch, 'tenant'):
                self.tenant = self.branch.tenant
        super().save(*args, **kwargs)

    class Meta:
        ordering = ['priority_level', 'name']
        unique_together = [('owner', 'branch', 'code')]

    def __str__(self):
        return self.name


class ClientGroup(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Ajo / group savings group for daily-contribution (DC) clients.

    Members of an Ajo group meet on a fixed day each week, make daily cash
    contributions, and collect in rotation. The group leader is responsible
    for coordinating collections and disbursements.
    """
    MEETING_DAYS = [
        ('monday', 'Monday'),
        ('tuesday', 'Tuesday'),
        ('wednesday', 'Wednesday'),
        ('thursday', 'Thursday'),
        ('friday', 'Friday'),
        ('saturday', 'Saturday'),
        ('sunday', 'Sunday'),
    ]

    name = models.CharField(max_length=100)
    code = models.CharField(max_length=20, db_index=True)
    meeting_day = models.CharField(
        max_length=10,
        choices=MEETING_DAYS,
        blank=True,
        null=True,
        help_text="Day of the week on which the group meets"
    )
    leader = models.ForeignKey(
        'Client',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='led_groups',
        help_text="Group leader — must be a registered client"
    )
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    assigned_officer = models.ForeignKey(
        'hr.Staff',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='managed_groups',
        help_text='Primary credit officer for this group — cascades to '
                   'Client.assigned_officer on every member client, driving '
                   'data-access scoping. Always kept as a member of '
                   'member_officers (see assign_officer action).',
    )
    member_officers = models.ManyToManyField(
        'hr.Staff',
        blank=True,
        related_name='member_of_groups',
        help_text='Full roster of officers who can view/manage this group and '
                   'its clients (e.g. a supervisor covering for the primary '
                   'officer). Does not by itself change any client\'s '
                   'assigned_officer — only assigned_officer cascades to '
                   'clients.',
    )

    objects = OwnerBranchManager()
    all_objects = OwnerBranchManager(include_deleted=True)

    class Meta:
        ordering = ['name']
        unique_together = [('owner', 'code')]
        indexes = [
            models.Index(fields=['is_active']),
            models.Index(fields=['assigned_officer']),
        ]

    def __str__(self):
        return f"{self.name} ({self.code})"


class ClientDocument(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Store client-related documents (ID cards, proof of address, etc.)
    """
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name='documents')
    document_type = models.CharField(max_length=50, choices=[
        ('id_card', 'ID Card'),
        ('passport', 'Passport'),
        ('utility_bill', 'Utility Bill'),
        ('bank_statement', 'Bank Statement'),
        ('employment_letter', 'Employment Letter'),
        ('salary_slip', 'Salary Slip'),
        ('tax_id', 'Tax ID'),
        ('business_reg', 'Business Registration'),
        ('other', 'Other Document')
    ])
    document_number = models.CharField(max_length=100, blank=True)
    issue_date = models.DateField(null=True, blank=True)
    expiry_date = models.DateField(null=True, blank=True)
    issuing_authority = models.CharField(max_length=200, blank=True)
    document_file = models.FileField(upload_to='clients/documents/')
    verification_status = models.CharField(max_length=20, choices=[
        ('pending', 'Pending'),
        ('verified', 'Verified'),
        ('rejected', 'Rejected')
    ], default='pending')
    verification_notes = models.TextField(blank=True)
    verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='verified_documents'
    )
    verified_at = models.DateTimeField(null=True, blank=True)

    objects = OwnerBranchManager()
    all_objects = OwnerBranchManager(include_deleted=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.client.full_name} - {self.get_document_type_display()}"

    def verify(self, user, status='verified', notes=None):
        """Mark document as verified"""
        self.verification_status = status
        self.verified_by = user
        self.verified_at = timezone.now()
        if notes:
            self.verification_notes = notes
        self.save()

class ClientRelationship(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Track relationships between clients (e.g. family members, business partners)
    """
    from_client = models.ForeignKey(
        Client,
        on_delete=models.CASCADE,
        related_name='relationships_from'
    )
    to_client = models.ForeignKey(
        Client,
        on_delete=models.CASCADE,
        related_name='relationships_to'
    )
    relationship_type = models.CharField(max_length=50, choices=[
        ('spouse', 'Spouse'),
        ('parent', 'Parent'),
        ('child', 'Child'),
        ('sibling', 'Sibling'),
        ('father', 'Father'),
        ('mother', 'Mother'),
        ('guardian', 'Guardian'),
        ('grandfather', 'Grandfather'),
        ('grandmother', 'Grandmother'),
        ('uncle', 'Uncle'),
        ('aunt', 'Aunt'),
        ('cousin', 'Cousin'),
        ('emergency_contact', 'Emergency Contact'),
        ('business_partner', 'Business Partner'),
        ('employer', 'Employer'),
        ('employee', 'Employee'),
        ('other', 'Other')
    ])
    description = models.TextField(blank=True)
    start_date = models.DateField(default=timezone.now)
    end_date = models.DateField(null=True, blank=True)
    is_guarantor = models.BooleanField(default=False)
    
    objects = OwnerBranchManager()
    all_objects = OwnerBranchManager(include_deleted=True)

    class Meta:
        ordering = ['-created_at']
        unique_together = ['from_client', 'to_client', 'relationship_type']

    def __str__(self):
        return f"{self.from_client.full_name} -> {self.get_relationship_type_display()} -> {self.to_client.full_name}"

    def save(self, *args, **kwargs):
        if self.end_date and self.end_date < self.start_date:
            raise ValidationError('End date must be after start date')
        super().save(*args, **kwargs)

class Guarantor(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Standalone guarantor profile — NOT a Client record, so it does not
    inflate client numbers.  A guarantor can later be promoted to a full
    Client via the convert-to-client endpoint.

    NIN is globally unique across both Guarantor and Client tables so that
    one person cannot be both a client and a guarantor under different IDs.
    """
    first_name = models.CharField(max_length=100)
    middle_name = models.CharField(max_length=100, blank=True, default='')
    last_name = models.CharField(max_length=100)

    # NIN — globally unique across both Guarantor and Client
    nin = models.CharField(
        max_length=11,
        unique=True,
        null=True,
        blank=True,
        db_index=True,
        validators=[validate_nin],
        help_text='National Identification Number (11 digits). Must be globally unique across clients and guarantors.',
    )

    image = models.ImageField(
        upload_to='guarantors/images/',
        blank=True, null=True,
        help_text="Guarantor photograph",
    )

    phone = models.CharField(max_length=20, blank=True, default='')
    email = models.EmailField(blank=True, null=True)
    gender = models.CharField(
        max_length=10,
        choices=[('male', 'Male'), ('female', 'Female'), ('other', 'Other')],
        blank=True, default='',
    )
    date_of_birth = models.DateField(null=True, blank=True)
    occupation = models.CharField(max_length=200, blank=True, default='')
    address = models.TextField(blank=True, default='')

    # When a guarantor is promoted to a full client, this FK is populated.
    converted_to_client = models.ForeignKey(
        'Client',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='guarantor_profiles',
        help_text='Client record created when this guarantor was promoted.',
    )

    objects = OwnerBranchManager()
    all_objects = OwnerBranchManager(include_deleted=True)

    class Meta:
        ordering = ['last_name', 'first_name']
        indexes = [
            models.Index(fields=['nin']),
            models.Index(fields=['last_name', 'first_name']),
        ]

    @property
    def full_name(self):
        parts = [self.first_name]
        if self.middle_name:
            parts.append(self.middle_name)
        parts.append(self.last_name)
        return ' '.join(parts)

    @property
    def name(self):
        return self.full_name

    def __str__(self):
        return f"{self.full_name} (Guarantor #{self.pk})"


class ClientNote(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Track important notes and interactions with clients
    """
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name='notes')
    note_type = models.CharField(max_length=50, choices=[
        ('general', 'General Note'),
        ('meeting', 'Meeting Note'),
        ('call', 'Call Note'),
        ('complaint', 'Complaint'),
        ('followup', 'Follow-up'),
        ('warning', 'Warning'),
        ('other', 'Other')
    ])
    title = models.CharField(max_length=200)
    content = models.TextField()
    is_private = models.BooleanField(default=False)
    reminder_date = models.DateTimeField(null=True, blank=True)
    
    objects = OwnerBranchManager()
    all_objects = OwnerBranchManager(include_deleted=True)

    def __str__(self):
        return f"{self.client.full_name} - {self.title}"

    class Meta:
        ordering = ['-created_at']


# ─────────────────────────────────────────────────────────────────────────────
# Feature #4 — Customer Audit Trail
# ─────────────────────────────────────────────────────────────────────────────

class CustomerAuditLog(models.Model):
    """
    Immutable, append-only log of every change made to a Client record.

    Rules:
    - Created automatically by the post_save signal on Client (see apps.py).
    - No update or delete operations are exposed or permitted — even by superusers.
    - Stores old and new values for changed fields so reviewers can see exactly
      what was altered.
    - IP address is captured via the request context threaded through the signal.
    """

    ACTION_CHOICES = [
        ('created', 'Profile Created'),
        ('updated', 'Profile Updated'),
        ('status_changed', 'Status Changed'),
        ('kyc_updated', 'KYC Status Updated'),
        ('loan_created', 'Loan Created'),
        ('loan_status_changed', 'Loan Status Changed'),
        ('savings_deposit', 'Savings Deposit'),
        ('savings_withdrawal', 'Savings Withdrawal'),
        ('assigned_officer_changed', 'Assigned Officer Changed'),
        ('account_manager_changed', 'Account Manager Changed'),
        ('document_uploaded', 'Document Uploaded'),
        ('note_added', 'Note Added'),
        ('deleted', 'Profile Soft-Deleted'),
        ('restored', 'Profile Restored'),
        ('other', 'Other'),
    ]

    client = models.ForeignKey(
        Client,
        on_delete=models.CASCADE,
        related_name='audit_logs',
        db_index=True,
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='client_audit_actions',
        help_text='User who performed the action (null = system/automated).',
    )
    timestamp = models.DateTimeField(
        default=timezone.now,
        db_index=True,
        editable=False,
    )
    ip_address = models.GenericIPAddressField(
        null=True,
        blank=True,
        help_text='IP address of the user at the time of the action.',
    )
    action = models.CharField(
        max_length=50,
        choices=ACTION_CHOICES,
        db_index=True,
    )
    # Which fields changed (list of field names)
    changed_fields = models.JSONField(
        default=list,
        help_text='List of field names that were changed.',
    )
    old_values = models.JSONField(
        default=dict,
        help_text='Field values BEFORE the change.',
    )
    new_values = models.JSONField(
        default=dict,
        help_text='Field values AFTER the change.',
    )
    description = models.TextField(
        blank=True,
        help_text='Human-readable description of the action.',
    )

    class Meta:
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['client', '-timestamp']),
            models.Index(fields=['user', '-timestamp']),
            models.Index(fields=['action']),
        ]
        # Enforce immutability at the ORM level
        default_permissions = ('view',)  # No add/change/delete in admin by default

    def __str__(self):
        return f"[{self.timestamp:%Y-%m-%d %H:%M}] {self.client} — {self.get_action_display()}"

    def save(self, *args, **kwargs):
        """Prevent updates — this log is append-only."""
        if self.pk:
            raise ValidationError(
                'CustomerAuditLog entries are immutable and cannot be modified.'
            )
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        """Prevent deletion."""
        raise ValidationError(
            'CustomerAuditLog entries cannot be deleted.'
        )

    @classmethod
    def log(cls, client, action, user=None, ip_address=None,
            changed_fields=None, old_values=None, new_values=None, description=''):
        """
        Convenience factory method to write a log entry.

        Usage::
            CustomerAuditLog.log(
                client=client_instance,
                action='updated',
                user=request.user,
                ip_address=get_client_ip(request),
                changed_fields=['status', 'risk_level'],
                old_values={'status': 'active', 'risk_level': 'low'},
                new_values={'status': 'suspended', 'risk_level': 'high'},
            )
        """
        return cls.objects.create(
            client=client,
            user=user,
            ip_address=ip_address,
            action=action,
            changed_fields=changed_fields or [],
            old_values=old_values or {},
            new_values=new_values or {},
            description=description,
        )