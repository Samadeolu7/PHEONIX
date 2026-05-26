from django.db import models
from django.conf import settings
from .managers import OwnerBranchManager

class TimeStampedModel(models.Model):
    """
    Abstract base model providing ownership and audit fields.
    Now includes tenant isolation - all inheriting models are tenant-aware.
    """
    tenant = models.ForeignKey(
        'users.Tenant',
        on_delete=models.CASCADE,
        related_name="%(app_label)s_%(class)s_set",
        help_text="Tenant (organization) this record belongs to",
        null=True,  # Temporary during migration - will be required after data migration
        blank=True,
        db_index=True  # Index for fast filtering
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="%(class)s_owned",
        help_text="User who owns/manages this record",
        null=True,
        blank=True
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="%(class)s_created",
        help_text="User who created this record",
        null=True,
        blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True
        # Add composite indexes in concrete models like:
        # indexes = [models.Index(fields=['tenant', 'created_at'])]

class BranchScopedModel(models.Model):
    """
    Abstract base model providing branch scoping.
    """
    branch = models.ForeignKey(
        'branches.Branch',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        help_text="Branch this record belongs to"
    )

    class Meta:
        abstract = True

class SoftDeleteModel(models.Model):
    """
    Abstract base model providing soft-delete functionality.
    """
    is_deleted = models.BooleanField(default=False)

    # managers
    objects = OwnerBranchManager()
    all_objects = OwnerBranchManager(include_deleted=True)

    class Meta:
        abstract = True
