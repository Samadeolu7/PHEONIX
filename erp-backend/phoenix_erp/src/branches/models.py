from django.db import models
from django.conf import settings
from django.core.validators import MinValueValidator, MaxValueValidator
from common.base import TimeStampedModel, SoftDeleteModel

class Branch(TimeStampedModel, SoftDeleteModel):
    """
    Represents a physical branch or business unit.
    """
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=10, unique=True)
    address = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    # ── Branch Contact Details ─────────────────────────────────────────────────
    phone = models.CharField(max_length=50, blank=True, help_text='Branch phone number')
    email = models.EmailField(blank=True, help_text='Branch email address')

    # ── Branch Address (structured) ────────────────────────────────────────────
    city = models.CharField(max_length=100, blank=True)
    state = models.CharField(max_length=100, blank=True)
    country = models.CharField(max_length=100, blank=True)
    postal_code = models.CharField(max_length=20, blank=True)
    
    # GPS coordinates for attendance validation
    latitude = models.DecimalField(
        max_digits=9,
        decimal_places=6,
        null=True,
        blank=True,
        validators=[MinValueValidator(-90), MaxValueValidator(90)],
        help_text="Branch latitude for GPS-based attendance validation"
    )
    longitude = models.DecimalField(
        max_digits=9,
        decimal_places=6,
        null=True,
        blank=True,
        validators=[MinValueValidator(-180), MaxValueValidator(180)],
        help_text="Branch longitude for GPS-based attendance validation"
    )
    
    # Multi-tenancy support
    tenant = models.ForeignKey(
        'users.Tenant',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='%(app_label)s_%(class)s_set',
        help_text='Tenant (organization) this record belongs to'
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='%(class)s_owned',
        help_text='User who owns/manages this record'
    )

    # ── Default bank account for EOD cash sweep (Feature #13) ─────────────────
    main_bank_account = models.ForeignKey(
        'banks.BankAccount',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='primary_for_branches',
        help_text=(
            "The branch's main bank account. "
            "Cash collected by COs is swept into this account's GL during daily reconciliation."
        ),
    )

    class Meta:
        ordering = ['name']
        verbose_name_plural = 'branches'

    def __str__(self):
        return f"{self.code} - {self.name}"

    def get_formatted_address(self) -> str:
        """Return a printable multi-line address for this branch."""
        parts = [p for p in [
            self.address,
            self.city,
            ', '.join(filter(None, [self.state, self.postal_code])),
            self.country,
        ] if p]
        return '\n'.join(parts)

    def get_full_contact_block(self) -> str:
        """Return a one-liner contact string (phone + email) for document footers."""
        parts = []
        if self.phone:
            parts.append(f"Tel: {self.phone}")
        if self.email:
            parts.append(f"Email: {self.email}")
        return '  |  '.join(parts)
