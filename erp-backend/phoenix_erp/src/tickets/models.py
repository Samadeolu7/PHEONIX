from django.db import models
from django.conf import settings
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType

from common.base import TimeStampedModel, BranchScopedModel, SoftDeleteModel
from common.managers import OwnerBranchManager
from users.models import Tenant

class TicketCategory(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Allows tenants to define categories (e.g. 'Maintenance', 'Customer Issue', 'IT Support').
    """
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='ticket_categories')
    name   = models.CharField(max_length=100)
    sla_hours = models.PositiveIntegerField(
        default=0,
        help_text="Escalate after this many hours; 0 = no SLA"
    )

    class Meta:
        unique_together = [('tenant', 'name')]

    def __str__(self):
        return self.name

class Ticket(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    OPEN = 'OPEN'
    IN_PROGRESS = 'INPR'
    RESOLVED = 'RES'
    CLOSED = 'CLSD'
    STATUS_CHOICES = [
        (OPEN, 'Open'),
        (IN_PROGRESS, 'In Progress'),
        (RESOLVED, 'Resolved'),
        (CLOSED, 'Closed'),
    ]
    PRIORITY_LOW = 'LOW'
    PRIORITY_MEDIUM = 'MED'
    PRIORITY_HIGH = 'HIGH'
    PRIORITY_CHOICES = [
        (PRIORITY_LOW, 'Low'),
        (PRIORITY_MEDIUM, 'Medium'),
        (PRIORITY_HIGH, 'High'),
    ]

    title = models.CharField(max_length=255)
    description = models.TextField()
    status = models.CharField(max_length=4, choices=STATUS_CHOICES, default=OPEN)
    priority = models.CharField(max_length=4, choices=PRIORITY_CHOICES, default=PRIORITY_MEDIUM)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='tickets_created'
    )
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='tickets_assigned'
    )
    category = models.ForeignKey(
        TicketCategory,
        on_delete=models.PROTECT,
        related_name='tickets',
        help_text="Type of ticket (e.g. Maintenance, Customer Care)"
    )
    # optional link to any object: Asset, InventoryItem, Customer, etc.
    content_type = models.ForeignKey(ContentType, on_delete=models.SET_NULL, null=True, blank=True)
    object_id    = models.PositiveIntegerField(null=True, blank=True)
    linked_object = GenericForeignKey('content_type', 'object_id')

    # Scoped manager for owner/branch and soft-delete
    objects = OwnerBranchManager()
    all_objects = OwnerBranchManager(include_deleted=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Support Ticket'
        verbose_name_plural = 'Support Tickets'

    def __str__(self):
        return f"[{self.get_status_display()}] {self.title}"

class TicketComment(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    ticket = models.ForeignKey(
        Ticket,
        related_name='comments',
        on_delete=models.CASCADE
    )
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='ticket_comments'
    )
    message = models.TextField()

    objects = OwnerBranchManager()
    all_objects = OwnerBranchManager(include_deleted=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f"Comment by {self.author.username} on {self.ticket_id}"
