from django.db import models
from django.conf import settings
from common.base import TimeStampedModel, SoftDeleteModel
from common.hub import Tenant
from pages.models import ModulePage as Page

class WidgetDefinition(TimeStampedModel, SoftDeleteModel):
    """Model for storing widget type definitions."""
    tenant = models.ForeignKey(
        Tenant, 
        on_delete=models.CASCADE,
        help_text="Tenant this widget definition belongs to"
    )
    code = models.SlugField(
        max_length=50,
        help_text="Unique code for this widget type"
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    schema = models.JSONField(
        default=dict,
        help_text="JSON Schema for widget configuration"
    )
    default_config = models.JSONField(
        default=dict,
        help_text="Default configuration values"
    )
    refresh_interval = models.IntegerField(
        default=0,
        help_text="Default auto-refresh interval in seconds (0 for no auto-refresh)"
    )
    
    class Meta:
        verbose_name = 'Widget Definition'
        verbose_name_plural = 'Widget Definitions'
        ordering = ['code']
        unique_together = ('tenant', 'code')
        
    def __str__(self):
        return f"{self.tenant.name} - {self.name}"

    def user_has_permission(self, user):
        """Check if user has permission to manage this definition"""
        return user.has_perm('widgets.manage_widgetdefinition')

class WidgetInstance(TimeStampedModel, SoftDeleteModel):
    """Model for storing widget instances on pages."""
    tenant = models.ForeignKey(
        Tenant, 
        on_delete=models.CASCADE,
        help_text="Tenant this widget instance belongs to"
    )
    definition = models.ForeignKey(
        WidgetDefinition,
        on_delete=models.PROTECT,
        help_text="Widget type definition"
    )
    page = models.ForeignKey(
        Page,
        on_delete=models.CASCADE,
        related_name='widgets',
        help_text="Page this widget is placed on"
    )
    title = models.CharField(max_length=255)
    position = models.JSONField(
        default=dict,
        help_text="Widget position and size in the grid"
    )
    configuration = models.JSONField(
        default=dict,
        help_text="Widget-specific configuration"
    )
    refresh_interval = models.IntegerField(
        null=True, blank=True,
        help_text="Override default refresh interval (null uses definition default)"
    )
    last_refresh = models.DateTimeField(
        null=True, blank=True,
        help_text="When the widget data was last refreshed"
    )
    
    class Meta:
        verbose_name = 'Widget Instance'
        verbose_name_plural = 'Widget Instances'
        ordering = ['page', 'title']
        unique_together = ('page', 'title')
        
    def __str__(self):
        return f"{self.page.title} - {self.title}"

    def user_has_permission(self, user):
        """Check if user has permission to access this widget"""
        # First check page permission
        if not self.page.user_has_permission(user):
            return False
        # Then check widget-specific permission
        return user.has_perm('widgets.view_widgetinstance')
