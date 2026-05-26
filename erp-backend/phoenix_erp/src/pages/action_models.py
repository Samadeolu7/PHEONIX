"""
Models for Page Actions and Role-based Action Permissions
"""
from django.db import models
from django.conf import settings
from common.base import TimeStampedModel, BranchScopedModel, SoftDeleteModel
from .models import Module, ModulePage


class PageAction(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Actions that can be performed on pages (view, create, edit, delete, approve, etc.)
    """
    module = models.ForeignKey(
        Module,
        on_delete=models.CASCADE,
        related_name='actions',
        help_text='Module this action belongs to'
    )
    
    page = models.ForeignKey(
        ModulePage,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='actions',
        help_text='Specific page this action belongs to (optional, can be module-wide)'
    )
    
    code = models.SlugField(
        max_length=100,
        help_text="Unique action code (e.g., 'view', 'create', 'edit', 'delete', 'approve')"
    )
    
    name = models.CharField(
        max_length=200,
        help_text="Human-readable action name (e.g., 'View Details', 'Create New')"
    )
    
    description = models.TextField(
        blank=True,
        help_text="Description of what this action does"
    )
    
    ACTION_TYPE_CHOICES = [
        ('view', 'View/Read'),
        ('create', 'Create'),
        ('edit', 'Edit/Update'),
        ('delete', 'Delete'),
        ('approve', 'Approve'),
        ('reject', 'Reject'),
        ('submit', 'Submit'),
        ('process', 'Process'),
        ('export', 'Export'),
        ('import', 'Import'),
        ('custom', 'Custom Action'),
    ]
    
    action_type = models.CharField(
        max_length=50,
        choices=ACTION_TYPE_CHOICES,
        default='custom'
    )
    
    # Permission mapping
    permission_codename = models.CharField(
        max_length=200,
        blank=True,
        help_text="Django permission codename (e.g., 'procurement.add_purchaserequisition')"
    )
    
    # Display properties
    icon = models.CharField(max_length=50, blank=True)
    color = models.CharField(max_length=7, blank=True, default='#3b82f6')
    order = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)
    
    # Whether this action appears in menus/UI
    show_in_list = models.BooleanField(
        default=True,
        help_text="Show this action in list views"
    )
    
    class Meta:
        db_table = 'page_actions'
        ordering = ['module', 'page', 'order', 'name']
        unique_together = [('module', 'page', 'code')]
        indexes = [
            models.Index(fields=['module', 'is_active']),
            models.Index(fields=['page', 'is_active']),
            models.Index(fields=['code']),
        ]
    
    def __str__(self):
        page_ref = f" → {self.page.title}" if self.page else ""
        return f"{self.module.name}{page_ref} → {self.name}"


class RoleActionPermission(TimeStampedModel):
    """
    Maps which roles can perform which actions
    """
    role = models.ForeignKey(
        'users.Role',
        on_delete=models.CASCADE,
        related_name='action_permissions'
    )
    
    action = models.ForeignKey(
        PageAction,
        on_delete=models.CASCADE,
        related_name='role_permissions'
    )
    
    # Permission level
    PERMISSION_LEVEL_CHOICES = [
        ('none', 'No Access'),
        ('read', 'Read Only'),
        ('write', 'Read & Write'),
        ('full', 'Full Control'),
    ]
    
    permission_level = models.CharField(
        max_length=20,
        choices=PERMISSION_LEVEL_CHOICES,
        default='none'
    )
    
    # Granular permissions
    can_view = models.BooleanField(default=False)
    can_create = models.BooleanField(default=False)
    can_edit = models.BooleanField(default=False)
    can_delete = models.BooleanField(default=False)
    can_approve = models.BooleanField(default=False)
    can_export = models.BooleanField(default=False)
    
    # Conditions (optional)
    conditions = models.JSONField(
        default=dict,
        blank=True,
        help_text="""
        Optional conditions for this permission:
        {
            "own_records_only": true,
            "branch_only": true,
            "max_amount": 10000
        }
        """
    )
    
    is_active = models.BooleanField(default=True)
    
    # Audit fields
    granted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='granted_permissions'
    )
    
    granted_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'role_action_permissions'
        unique_together = [('role', 'action')]
        indexes = [
            models.Index(fields=['role', 'is_active']),
            models.Index(fields=['action', 'is_active']),
        ]
    
    def __str__(self):
        return f"{self.role.name} → {self.action.name} ({self.permission_level})"
    
    def has_permission(self, action_type):
        """
        Check if this role has permission for a specific action type
        """
        if not self.is_active:
            return False
        
        if self.permission_level == 'full':
            return True
        
        permission_map = {
            'view': self.can_view,
            'create': self.can_create,
            'edit': self.can_edit,
            'delete': self.can_delete,
            'approve': self.can_approve,
            'export': self.can_export,
        }
        
        return permission_map.get(action_type, False)
