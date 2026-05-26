# reports/models.py
"""
Professional-grade report system with security, flexibility, and ERP-standard features
"""
from django.db import models, transaction
from django.core.exceptions import ValidationError
from django.utils import timezone
from django.contrib.contenttypes.models import ContentType
from django.contrib.contenttypes.fields import GenericForeignKey
import json
import re
from decimal import Decimal
from typing import Dict, List, Any

from common.base import TimeStampedModel, BranchScopedModel, SoftDeleteModel
from common.managers import OwnerBranchManager
from accounts.models import Account


class ReportCategory(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Categories for organizing reports
    """
    name = models.CharField(max_length=100)
    code = models.SlugField(max_length=50, unique=True)
    description = models.TextField(blank=True)
    icon = models.CharField(max_length=50, default='file-text')
    color = models.CharField(max_length=7, default='#3b82f6')
    parent = models.ForeignKey(
        'self',
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='subcategories'
    )
    order = models.IntegerField(default=0)
    
    objects = OwnerBranchManager()
    
    class Meta:
        db_table = 'report_categories'
        verbose_name_plural = 'Report Categories'
        ordering = ['order', 'name']
    
    def __str__(self):
        return self.name


class ReportTemplate(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Report template defining structure, data sources, and calculations
    """
    REPORT_TYPES = [
        ('financial', 'Financial Report'),
        ('operational', 'Operational Report'),
        ('analytical', 'Analytical Report'),
        ('compliance', 'Compliance Report'),
        ('custom', 'Custom Report'),
    ]
    
    ACCESS_LEVELS = [
        ('public', 'Public'),
        ('internal', 'Internal'),
        ('restricted', 'Restricted'),
        ('private', 'Private'),
    ]
    
    # Basic Info
    name = models.CharField(max_length=200)
    code = models.SlugField(max_length=100, unique=True, db_index=True)
    description = models.TextField(blank=True)
    category = models.ForeignKey(
        ReportCategory,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='templates'
    )
    
    # Type and Access
    report_type = models.CharField(max_length=20, choices=REPORT_TYPES, default='custom')
    access_level = models.CharField(max_length=20, choices=ACCESS_LEVELS, default='private')
    
    # Auto-generation settings
    is_auto_generated = models.BooleanField(
        default=False,
        help_text="Was this report auto-generated for an account or product?"
    )
    linked_account = models.ForeignKey(
        Account,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='generated_reports',
        help_text="Account this report was generated for"
    )
    linked_product = models.ForeignKey(
        'products.Product',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='generated_reports',
        help_text="Product this report was generated for"
    )
    
    # Report Definition
    report_config = models.JSONField(
        default=dict,
        help_text="""
        Complete report configuration:
        {
            "data_sources": [...],
            "columns": [...],
            "grouping": {...},
            "filters": [...],
            "calculations": [...],
            "charts": [...],
            "layout": {...}
        }
        """
    )
    
    # Data Source Configuration
    primary_entity = models.CharField(
        max_length=100,
        help_text="Primary model for data (Transaction, Account, Client, etc.)"
    )
    allowed_entities = models.JSONField(
        default=list,
        help_text="List of entities that can be queried"
    )
    
    # Security & Validation
    allowed_fields = models.JSONField(
        default=list,
        help_text="Whitelisted fields that can be accessed"
    )
    allowed_calculations = models.JSONField(
        default=list,
        help_text="Allowed calculation functions (sum, avg, count, etc.)"
    )
    max_rows = models.IntegerField(
        default=10000,
        help_text="Maximum rows to return"
    )
    
    # Display Settings
    default_date_range = models.CharField(
        max_length=50,
        default='current_month',
        help_text="Default date range filter"
    )
    refresh_interval = models.IntegerField(
        default=0,
        help_text="Auto-refresh interval in seconds (0 = no refresh)"
    )
    
    # Permissions
    required_permission = models.CharField(max_length=100, blank=True)
    restricted_to_roles = models.JSONField(
        default=list,
        help_text="Role codes that can access this report"
    )
    
    # Status
    is_active = models.BooleanField(default=True)
    is_system = models.BooleanField(
        default=False,
        help_text="System report (cannot be deleted)"
    )
    is_editable = models.BooleanField(
        default=True,
        help_text="Can users edit this report?"
    )
    
    # Usage Tracking
    usage_count = models.IntegerField(default=0)
    last_run_at = models.DateTimeField(null=True, blank=True)
    
    # Version Control
    version = models.IntegerField(default=1)
    
    objects = OwnerBranchManager()
    
    class Meta:
        db_table = 'report_templates'
        ordering = ['category', 'name']
        indexes = [
            models.Index(fields=['code']),
            models.Index(fields=['report_type', 'is_active']),
            # models.Index(fields=['linked_account']),
        ]
    
    def __str__(self):
        return f"{self.name} ({self.code})"
    
    def validate_config(self):
        """Validate report configuration"""
        errors = []
        config = self.report_config
        
        # Validate data sources
        if not config.get('data_sources'):
            errors.append("At least one data source is required")
        
        # Validate columns
        if not config.get('columns'):
            errors.append("At least one column is required")
        
        # Validate field access
        for column in config.get('columns', []):
            field = column.get('field')
            if field and not self._is_field_allowed(field):
                errors.append(f"Field '{field}' is not in allowed fields list")
        
        # Validate calculations
        for calc in config.get('calculations', []):
            func = calc.get('function')
            if func and func not in self.allowed_calculations:
                errors.append(f"Calculation function '{func}' is not allowed")
        
        if errors:
            raise ValidationError('; '.join(errors))
    
    def _is_field_allowed(self, field: str) -> bool:
        """Check if field is in allowed list"""
        if not self.allowed_fields:
            return True  # No restrictions
        return field in self.allowed_fields
    
    def user_can_access(self, user) -> bool:
        """
        Check if user has permission to access this report
        
        Args:
            user: User instance
            
        Returns:
            bool: True if user can access, False otherwise
        """
        # Check if report is active
        if not self.is_active:
            return False
        
        # Check permission requirement
        if self.required_permission:
            if not user.has_perm(self.required_permission):
                return False
        
        # Check role restrictions
        if self.restricted_to_roles:
            user_role = getattr(user, 'role', None)
            if user_role not in self.restricted_to_roles:
                return False
        
        # Check access level
        if self.access_level == 'private':
            # Only owner can access
            return self.owner == user
        elif self.access_level == 'restricted':
            # Only users with permission can access
            return bool(self.required_permission and user.has_perm(self.required_permission))
        
        # public and internal are accessible if other checks pass
        return True
    
    def increment_usage(self):
        """Track report usage"""
        self.usage_count += 1
        self.last_run_at = timezone.now()
        self.save(update_fields=['usage_count', 'last_run_at'])


class ReportParameter(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Parameters for report filtering and customization
    """
    PARAMETER_TYPES = [
        ('date', 'Date'),
        ('date_range', 'Date Range'),
        ('number', 'Number'),
        ('text', 'Text'),
        ('select', 'Single Select'),
        ('multi_select', 'Multi Select'),
        ('account', 'Account Selector'),
        ('client', 'Client Selector'),
        ('product', 'Product Selector'),
        ('product_type', 'Product Type Selector'),
        ('boolean', 'Yes/No'),
    ]
    
    template = models.ForeignKey(
        ReportTemplate,
        on_delete=models.CASCADE,
        related_name='parameters'
    )
    
    name = models.CharField(max_length=100)
    code = models.SlugField(max_length=50)
    parameter_type = models.CharField(max_length=20, choices=PARAMETER_TYPES)
    
    label = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    
    # Validation
    is_required = models.BooleanField(default=False)
    default_value = models.JSONField(null=True, blank=True)
    
    # Options for select types
    options = models.JSONField(
        default=list,
        help_text="Options for select/multi-select parameters"
    )
    
    # Validation rules
    validation_rules = models.JSONField(
        default=dict,
        help_text="Min/max values, regex patterns, etc."
    )
    
    order = models.IntegerField(default=0)
    
    objects = OwnerBranchManager()
    
    class Meta:
        db_table = 'report_parameters'
        ordering = ['template', 'order']
        unique_together = [('template', 'code')]
    
    def __str__(self):
        return f"{self.template.name} - {self.label}"


class ReportColumn(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Column definitions for reports
    """
    COLUMN_TYPES = [
        ('field', 'Database Field'),
        ('calculation', 'Calculated Field'),
        ('aggregation', 'Aggregation'),
        ('formula', 'Custom Formula'),
    ]
    
    AGGREGATION_FUNCTIONS = [
        ('sum', 'Sum'),
        ('avg', 'Average'),
        ('count', 'Count'),
        ('min', 'Minimum'),
        ('max', 'Maximum'),
        ('count_distinct', 'Count Distinct'),
    ]
    
    FORMAT_TYPES = [
        ('text', 'Text'),
        ('number', 'Number'),
        ('currency', 'Currency'),
        ('percentage', 'Percentage'),
        ('date', 'Date'),
        ('datetime', 'Date & Time'),
        ('boolean', 'Yes/No'),
    ]
    
    template = models.ForeignKey(
        ReportTemplate,
        on_delete=models.CASCADE,
        related_name='columns'
    )
    
    name = models.CharField(max_length=100)
    code = models.SlugField(max_length=50)
    column_type = models.CharField(max_length=20, choices=COLUMN_TYPES)
    
    # Display
    label = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    
    # Data Source
    field_path = models.CharField(
        max_length=200,
        blank=True,
        help_text="Dot notation path to field (e.g., 'client.full_name')"
    )
    
    # Calculation
    aggregation_function = models.CharField(
        max_length=20,
        choices=AGGREGATION_FUNCTIONS,
        blank=True
    )
    formula = models.TextField(
        blank=True,
        help_text="Custom formula for calculated fields"
    )
    
    # Formatting
    format_type = models.CharField(max_length=20, choices=FORMAT_TYPES, default='text')
    format_options = models.JSONField(
        default=dict,
        help_text="Decimal places, date format, etc."
    )
    
    # Display Options
    width = models.IntegerField(default=150, help_text="Column width in pixels")
    is_visible = models.BooleanField(default=True)
    is_sortable = models.BooleanField(default=True)
    is_filterable = models.BooleanField(default=True)
    
    # Ordering
    order = models.IntegerField(default=0)
    
    # Conditional Formatting
    conditional_formatting = models.JSONField(
        default=list,
        help_text="""
        Rules for conditional formatting:
        [
            {
                "condition": "value > 1000",
                "style": {"color": "red", "fontWeight": "bold"}
            }
        ]
        """
    )
    
    objects = OwnerBranchManager()
    
    class Meta:
        db_table = 'report_columns'
        ordering = ['template', 'order']
        unique_together = [('template', 'code')]
    
    def __str__(self):
        return f"{self.template.name} - {self.label}"


class ReportChart(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Chart/visualization configuration for reports
    """
    CHART_TYPES = [
        ('line', 'Line Chart'),
        ('bar', 'Bar Chart'),
        ('pie', 'Pie Chart'),
        ('donut', 'Donut Chart'),
        ('area', 'Area Chart'),
        ('scatter', 'Scatter Plot'),
        ('gauge', 'Gauge'),
        ('kpi', 'KPI Card'),
    ]
    
    template = models.ForeignKey(
        ReportTemplate,
        on_delete=models.CASCADE,
        related_name='charts'
    )
    
    name = models.CharField(max_length=100)
    chart_type = models.CharField(max_length=20, choices=CHART_TYPES)
    
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    
    # Data Configuration
    data_config = models.JSONField(
        default=dict,
        help_text="""
        Chart data configuration:
        {
            "x_axis": "date",
            "y_axis": "amount",
            "series": ["debit", "credit"],
            "aggregation": "sum"
        }
        """
    )
    
    # Display Configuration
    display_config = models.JSONField(
        default=dict,
        help_text="""
        Display options:
        {
            "colors": ["#3b82f6", "#10b981"],
            "show_legend": true,
            "show_grid": true,
            "height": 400
        }
        """
    )
    
    # Layout
    position = models.CharField(
        max_length=20,
        choices=[
            ('top', 'Top'),
            ('bottom', 'Bottom'),
            ('left', 'Left'),
            ('right', 'Right'),
            ('inline', 'Inline'),
        ],
        default='top'
    )
    order = models.IntegerField(default=0)
    
    is_visible = models.BooleanField(default=True)
    
    objects = OwnerBranchManager()
    
    class Meta:
        db_table = 'report_charts'
        ordering = ['template', 'order']
    
    def __str__(self):
        return f"{self.template.name} - {self.title}"


class ReportExecution(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Track report executions for auditing and caching
    """
    template = models.ForeignKey(
        ReportTemplate,
        on_delete=models.CASCADE,
        related_name='executions'
    )
    
    # Execution Details
    executed_at = models.DateTimeField(auto_now_add=True)
    executed_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        related_name='report_executions'
    )
    
    # Parameters Used
    parameters = models.JSONField(
        default=dict,
        help_text="Parameter values used for this execution"
    )
    
    # Results
    row_count = models.IntegerField(default=0)
    execution_time_ms = models.IntegerField(default=0)
    
    # Status
    STATUS_CHOICES = [
        ('running', 'Running'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
        ('cached', 'Cached Result'),
    ]
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='running')
    error_message = models.TextField(blank=True)
    
    # Caching
    result_cache = models.JSONField(
        null=True,
        blank=True,
        help_text="Cached result data (if enabled)"
    )
    cache_expires_at = models.DateTimeField(null=True, blank=True)
    
    objects = OwnerBranchManager()
    
    class Meta:
        db_table = 'report_executions'
        ordering = ['-executed_at']
        indexes = [
            models.Index(fields=['template', 'executed_at']),
            models.Index(fields=['status', 'cache_expires_at']),
        ]
    
    def __str__(self):
        return f"{self.template.name} - {self.executed_at}"
    
    @property
    def is_cache_valid(self) -> bool:
        """Check if cached result is still valid"""
        if not self.cache_expires_at:
            return False
        return timezone.now() < self.cache_expires_at


class ReportSchedule(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Schedule automatic report generation and distribution
    """
    FREQUENCY_CHOICES = [
        ('daily', 'Daily'),
        ('weekly', 'Weekly'),
        ('monthly', 'Monthly'),
        ('quarterly', 'Quarterly'),
        ('annually', 'Annually'),
    ]
    
    template = models.ForeignKey(
        ReportTemplate,
        on_delete=models.CASCADE,
        related_name='schedules'
    )
    
    name = models.CharField(max_length=200)
    frequency = models.CharField(max_length=20, choices=FREQUENCY_CHOICES)
    
    # Schedule Configuration
    run_time = models.TimeField(help_text="Time of day to run")
    day_of_week = models.IntegerField(
        null=True,
        blank=True,
        help_text="For weekly (0=Monday, 6=Sunday)"
    )
    day_of_month = models.IntegerField(
        null=True,
        blank=True,
        help_text="For monthly (1-31)"
    )
    
    # Parameters
    default_parameters = models.JSONField(
        default=dict,
        help_text="Default parameters for scheduled runs"
    )
    
    # Distribution
    recipients = models.JSONField(
        default=list,
        help_text="Email addresses to send report to"
    )
    export_format = models.CharField(
        max_length=10,
        choices=[
            ('pdf', 'PDF'),
            ('excel', 'Excel'),
            ('csv', 'CSV'),
        ],
        default='pdf'
    )
    
    # Status
    is_active = models.BooleanField(default=True)
    last_run_at = models.DateTimeField(null=True, blank=True)
    next_run_at = models.DateTimeField(null=True, blank=True)
    
    objects = OwnerBranchManager()
    
    class Meta:
        db_table = 'report_schedules'
        ordering = ['template', 'name']
    
    def __str__(self):
        return f"{self.template.name} - {self.name}"