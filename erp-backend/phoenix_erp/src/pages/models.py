from django.db import models
from django.conf import settings
from django.core.exceptions import ValidationError
from common.base import TimeStampedModel, BranchScopedModel, SoftDeleteModel

class Module(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Top-level navigation modules (Accounts, Clients, Transactions, etc.)
    """
    code = models.SlugField(
        max_length=50,
        help_text="Unique code (e.g., 'accounts', 'clients')"
    )
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    icon = models.CharField(
        max_length=50,
        help_text="Icon name (lucide-react icon names)"
    )
    color = models.CharField(
        max_length=7,
        default='#1a73e8',
        help_text="Hex color code"
    )
    order = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)
    
    # Access control
    required_permission = models.CharField(
        max_length=100,
        blank=True,
        help_text="Permission code required to view this module"
    )
    
    class Meta:
        db_table = 'modules'
        ordering = ['order', 'name']
        unique_together = [('owner', 'branch', 'code')]
        indexes = [
            models.Index(fields=['owner', 'branch', 'is_active']),
            models.Index(fields=['code']),
        ]
    
    def __str__(self):
        return f"{self.name} ({self.code})"

    def user_can_access(self, user):
        """Check if user has permission to access this module"""
        if not self.required_permission:
            return True
        return user.has_perm(self.required_permission)


class ModulePage(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Pages within modules - can be lists, forms, dashboards, etc.
    """
    module = models.ForeignKey(
        Module,
        on_delete=models.CASCADE,
        related_name='pages'
    )
    code = models.SlugField(max_length=50)
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    icon = models.CharField(max_length=50, blank=True)
    
    # Page type determines rendering
    PAGE_TYPES = [
        ('dashboard', 'Dashboard with Widgets'),
        ('form', 'Single Form Page'),
        ('list', 'Data List/Table'),
        ('detail', 'Detail View with Actions'),
        ('report', 'Report View'),
        ('iframe', 'Embedded iFrame'),
        ('custom', 'Custom Component'),
    ]
    page_type = models.CharField(max_length=50, choices=PAGE_TYPES)
    
    # Configuration based on page_type
    page_config = models.JSONField(
        default=dict,
        help_text="""
        Configuration varies by page_type:
        - dashboard: {widgets: [...]}
        - form: {form_schema_id: int, submitEndpoint: '/api/form-submissions/', successUrl: '/path'}
        - report: {report_id: int, report_code: 'code', default_parameters: {...}, show_export: bool}
        - list: {entity: 'Transaction', columns: [...], filters: [...]}
        - detail: {entity: 'Account', fields: [...], actions: [...]}
        """
    )
    
    # URL path (auto-generated)
    url_path = models.CharField(
        max_length=255,
        unique=True,
        editable=False
    )
    
    # Navigation
    show_in_menu = models.BooleanField(
        default=True,
        help_text="Show in navigation menu"
    )
    order = models.IntegerField(default=0)
    parent_page = models.ForeignKey(
        'self',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='sub_pages'
    )
    is_active = models.BooleanField(default=True)
    # Access control
    required_permission = models.CharField(max_length=100, blank=True)

    # Thread configuration
    is_threadable = models.BooleanField(
        default=False,
        help_text="Allow contextual discussion threads on this page"
    )

    class Meta:
        db_table = 'module_pages'
        ordering = ['module', 'order', 'title']
        unique_together = [('module', 'code')]
        indexes = [
            models.Index(fields=['module', 'show_in_menu']),
            models.Index(fields=['url_path']),
        ]
    
    def save(self, *args, **kwargs):
        if not self.url_path:
            self.url_path = f"/{self.module.code}/{self.code}/"
        # Validate page_config before saving
        self.validate_page_config()
        super().save(*args, **kwargs)
    
    def __str__(self):
        return f"{self.module.name} → {self.title}"
    
    def validate_page_config(self):
        """
        Validate page_config has required fields based on page_type
        """
        config = self.page_config or {}
        
        if self.page_type == 'form':
            # Forms require form_schema_id and submitEndpoint
            if not config.get('form_schema_id'):
                raise ValidationError(
                    f"Form page '{self.title}' must have 'form_schema_id' in page_config"
                )
            if not config.get('submitEndpoint'):
                raise ValidationError(
                    f"Form page '{self.title}' must have 'submitEndpoint' in page_config"
                )
        
        elif self.page_type == 'report':
            # Reports require either report_id or report_code
            if not config.get('report_id') and not config.get('report_code'):
                raise ValidationError(
                    f"Report page '{self.title}' must have either 'report_id' or 'report_code' in page_config"
                )
        
        # Add more validation for other page types as needed
        self.validate_thread_config()
        return True
    
    def user_can_access(self, user):
        """Check if user has permission to access this page"""
        # First check module permission
        if not self.module.user_can_access(user):
            return False
        # Then check page-specific permission
        if not self.required_permission:
            return True
        return user.has_perm(self.required_permission)

    def get_thread_config(self):
        return self.page_config.get('thread', {})

    def validate_thread_config(self):
        """Validate the optional 'thread' sub-object in page_config."""
        config = self.page_config or {}
        thread = config.get('thread')
        if not thread:
            return  # No thread config — that's fine
        if not isinstance(thread, dict):
            raise ValidationError("page_config.thread must be a JSON object.")
        # who_can_initiate was intentionally retired (not just left unenforced)
        # — role-gating who could start a thread previously locked a branch
        # manager out via a stale config (see user_can_initiate_thread below).
        # It's no longer a recognized key so admins can't configure something
        # that silently does nothing.
        valid_keys = {'auto_include_roles', 'max_open_threads', 'require_reason'}
        unknown = set(thread.keys()) - valid_keys
        if unknown:
            raise ValidationError(
                f"Unknown key(s) in page_config.thread: {', '.join(sorted(unknown))}. "
                f"Valid keys: {', '.join(sorted(valid_keys))}."
            )
        for list_key in ('auto_include_roles',):
            val = thread.get(list_key)
            if val is not None and not isinstance(val, list):
                raise ValidationError(f"page_config.thread.{list_key} must be a list of strings.")
        max_open = thread.get('max_open_threads')
        if max_open is not None and (not isinstance(max_open, int) or max_open < 0):
            raise ValidationError("page_config.thread.max_open_threads must be a non-negative integer.")
        req_reason = thread.get('require_reason')
        if req_reason is not None and not isinstance(req_reason, bool):
            raise ValidationError("page_config.thread.require_reason must be a boolean.")

    def user_can_initiate_thread(self, user):
        # Any user who can see a threadable page may start a discussion on
        # it — role-gating via page_config.thread.who_can_initiate used to
        # block this (a branch manager was locked out by a stale config),
        # so initiation is intentionally unrestricted now. Directors and the
        # relevant branch manager are notified of every new thread instead
        # (see threads/signals.py), which covers the oversight need without
        # blocking anyone from starting one.
        return self.is_threadable


class PageWidget(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Widgets placed on dashboard-type pages
    """
    page = models.ForeignKey(
        ModulePage,
        on_delete=models.CASCADE,
        related_name='page_widgets'
    )
    
    WIDGET_TYPES = [
        ('kpi', 'KPI Card'),
        ('chart', 'Chart Widget'),
        ('table', 'Data Table'),
        ('quick_actions', 'Quick Action Buttons'),
        ('form_links', 'Form Links'),
        ('recent_items', 'Recent Items'),
        ('account_summary', 'Account Summary'),
        ('custom', 'Custom Widget'),
    ]
    widget_type = models.CharField(max_length=50, choices=WIDGET_TYPES)
    
    title = models.CharField(max_length=200)
    widget_config = models.JSONField(
        default=dict,
        help_text="Widget-specific configuration"
    )
    
    # Grid layout
    layout_x = models.IntegerField(default=0)
    layout_y = models.IntegerField(default=0)
    layout_w = models.IntegerField(default=4)
    layout_h = models.IntegerField(default=4)
    layout_min_w = models.IntegerField(default=2)
    layout_min_h = models.IntegerField(default=2)
    
    order = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)
    
    class Meta:
        db_table = 'page_widgets'
        ordering = ['page', 'order']
    
    def __str__(self):
        return f"{self.page.title} - {self.title}"


class QuickAction(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Quick action buttons that appear contextually
    """
    code = models.SlugField(max_length=50)
    title = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    icon = models.CharField(max_length=50)
    color = models.CharField(max_length=7, default='#1a73e8')
    
    # Where this action appears
    CONTEXT_CHOICES = [
        ('global', 'Appears Everywhere'),
        ('module', 'Appears in Module'),
        ('page', 'Appears on Specific Page'),
        ('account', 'Appears on Account Detail'),
        ('client', 'Appears on Client Detail'),
        ('dashboard', 'Appears on Dashboard'),
    ]
    context = models.CharField(max_length=50, choices=CONTEXT_CHOICES)
    
    # Context references
    module = models.ForeignKey(
        Module,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='quick_actions'
    )
    page = models.ForeignKey(
        ModulePage,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='quick_actions'
    )
    
    # What happens when clicked
    ACTION_TYPES = [
        ('form', 'Open Form'),
        ('page', 'Navigate to Page'),
        ('modal', 'Open Modal'),
        ('external', 'External Link'),
    ]
    action_type = models.CharField(max_length=50, choices=ACTION_TYPES)
    
    action_config = models.JSONField(
        default=dict,
        help_text="""
        Configuration varies by action_type:
        - form: {pattern_id: 'xxx', prefill: {...}}
        - page: {page_id: 'xxx', params: {...}}
        - modal: {component: 'xxx', props: {...}}
        - external: {url: 'https://...', target: '_blank'}
        """
    )
    
    # For form actions
    pattern = models.ForeignKey(
        'accounts.AccountTransactionPattern',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='quick_actions'
    )
    
    # For page actions
    target_page = models.ForeignKey(
        ModulePage,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='action_targets'
    )
    
    # Conditional display
    display_condition = models.JSONField(
        default=dict,
        help_text="""
        Conditions for showing this action:
        {
            'account_type': 'SAVINGS',
            'minimum_balance': 1000,
            'user_role': 'manager'
        }
        """
    )
    
    # Access control
    required_permission = models.CharField(max_length=100, blank=True)
    
    order = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)
    is_featured = models.BooleanField(default=False)
    
    class Meta:
        db_table = 'quick_actions'
        ordering = ['context', 'order', 'title']
        unique_together = [('owner', 'branch', 'context', 'code')]
    
    def __str__(self):
        return f"{self.get_context_display()}: {self.title}"
    
    def user_can_access(self, user):
        """Check if user has permission to see this action"""
        if not self.required_permission:
            return True
        return user.has_perm(self.required_permission)
    
    def should_display(self, context_data=None):
        """Check if action should be displayed based on conditions"""
        if not self.display_condition:
            return True
        
        if not context_data:
            return True
        
        # Evaluate conditions
        for key, expected_value in self.display_condition.items():
            actual_value = context_data.get(key)
            
            # Handle different comparison types
            if isinstance(expected_value, dict):
                operator = expected_value.get('operator', '==')
                value = expected_value.get('value')
                
                if operator == '>=' and not (actual_value >= value):
                    return False
                elif operator == '>' and not (actual_value > value):
                    return False
                elif operator == '<=' and not (actual_value <= value):
                    return False
                elif operator == '<' and not (actual_value < value):
                    return False
                elif operator == '!=' and not (actual_value != value):
                    return False
                elif operator == 'in' and actual_value not in value:
                    return False
            else:
                # Direct equality check
                if actual_value != expected_value:
                    return False
        
        return True


class FormLink(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Links to forms - auto-generated from patterns
    """
    pattern = models.ForeignKey(
        'accounts.AccountTransactionPattern',
        on_delete=models.CASCADE,
        related_name='form_links'
    )
    
    # Display
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    icon = models.CharField(max_length=50)
    color = models.CharField(max_length=7)
    
    # Placement
    PLACEMENT_CHOICES = [
        ('menu', 'Main Menu'),
        ('dashboard', 'Dashboard Widget'),
        ('account_detail', 'Account Detail Page'),
        ('client_detail', 'Client Detail Page'),
        ('report', 'Report Page'),
        ('list_action', 'List Row Action'),
    ]
    placement = models.CharField(max_length=50, choices=PLACEMENT_CHOICES)
    
    # Context filtering
    context_filter = models.JSONField(
        default=dict,
        help_text="""
        When to show this link:
        {
            'account_type': 'SAVINGS',
            'account_status': 'active'
        }
        """
    )
    
    # Pre-fill mapping
    prefill_mapping = models.JSONField(
        default=dict,
        help_text="""
        Map context to form fields:
        {
            'client_id': 'context.client.id',
            'account_id': 'context.account.id',
            'amount': 'context.suggested_amount'
        }
        """
    )
    
    order = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)
    
    class Meta:
        db_table = 'form_links'
        ordering = ['placement', 'order']
    
    def __str__(self):
        return f"{self.get_placement_display()}: {self.title}"

