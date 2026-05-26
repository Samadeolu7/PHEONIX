from django.db import models
from django.conf import settings
from common.base import TimeStampedModel, SoftDeleteModel
from common.hub import Tenant

class SavedQuery(TimeStampedModel, SoftDeleteModel):
    """Model for storing saved SQL queries."""
    tenant = models.ForeignKey(
        Tenant, 
        on_delete=models.CASCADE,
        help_text="Tenant this query belongs to"
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    query = models.TextField(help_text="SQL query template")
    parameters = models.JSONField(
        default=dict,
        help_text="Parameters schema for the query"
    )
    
    class Meta:
        verbose_name = 'Saved Query'
        verbose_name_plural = 'Saved Queries'
        ordering = ['-created_at']
        unique_together = ('tenant', 'name')  # Ensure unique names per tenant
        
    def __str__(self):
        return f"{self.tenant.name} - {self.name}"

    def user_has_permission(self, user):
        """Check if user has permission to use this query"""
        return user.has_perm('queries.execute_savedquery')