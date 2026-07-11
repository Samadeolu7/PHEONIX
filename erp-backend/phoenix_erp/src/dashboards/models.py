# dashboards/models.py (ENHANCED)
"""
Enhanced Dashboard System with Rich Customization & Flexible Data Sources
"""

from django.db import models
from django.utils.text import slugify
from django.core.validators import FileExtensionValidator
from common.base import TimeStampedModel, SoftDeleteModel, BranchScopedModel
import json


class DashboardTheme(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Reusable themes for dashboards
    """
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    
    # Color scheme
    primary_color = models.CharField(max_length=7, default='#1a73e8', help_text='Hex color')
    secondary_color = models.CharField(max_length=7, default='#34a853')
    accent_color = models.CharField(max_length=7, default='#fbbc04')
    background_color = models.CharField(max_length=7, default='#f5f5f5')
    text_color = models.CharField(max_length=7, default='#202124')
    
    # Typography
    font_family = models.CharField(
        max_length=100, 
        default='Inter, system-ui, sans-serif',
        help_text='CSS font family'
    )
    font_size_base = models.IntegerField(default=14, help_text='Base font size in pixels')
    
    # Layout
    widget_spacing = models.IntegerField(default=16, help_text='Gap between widgets in pixels')
    widget_border_radius = models.IntegerField(default=8, help_text='Widget corner radius')
    widget_shadow = models.CharField(
        max_length=100,
        default='0 1px 3px rgba(0,0,0,0.12)',
        help_text='CSS box-shadow'
    )
    
    # Advanced styling (CSS variables)
    custom_css_variables = models.JSONField(
        default=dict,
        help_text='Additional CSS variables as key-value pairs'
    )
    
    is_public = models.BooleanField(default=False, help_text='Available to all users')
    
    class Meta:
        db_table = 'dashboard_themes'
        ordering = ['name']
    
    def __str__(self):
        return self.name
    
    def get_css_variables(self):
        """Generate CSS custom properties from theme"""
        variables = {
            '--primary-color': self.primary_color,
            '--secondary-color': self.secondary_color,
            '--accent-color': self.accent_color,
            '--background-color': self.background_color,
            '--text-color': self.text_color,
            '--font-family': self.font_family,
            '--font-size-base': f'{self.font_size_base}px',
            '--widget-spacing': f'{self.widget_spacing}px',
            '--widget-border-radius': f'{self.widget_border_radius}px',
            '--widget-shadow': self.widget_shadow,
        }
        # Merge with custom variables
        variables.update(self.custom_css_variables)
        return variables


class Dashboard(TimeStampedModel, SoftDeleteModel, BranchScopedModel):
    """Enhanced dashboard configuration"""
    name = models.CharField(max_length=200)
    slug = models.SlugField(max_length=250, unique=True)
    description = models.TextField(blank=True, null=True)
    
    # Visibility & Access
    is_default = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    is_public = models.BooleanField(
        default=False, 
        help_text='Accessible by all users in branch'
    )
    
    # Theme & Branding
    theme = models.ForeignKey(
        DashboardTheme,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='dashboards'
    )
    
    # Logo & Background
    logo = models.ImageField(
        upload_to='dashboards/logos/',
        blank=True,
        null=True,
        validators=[FileExtensionValidator(['png', 'jpg', 'jpeg', 'svg'])],
        help_text='Dashboard logo (recommended: 200x60px)'
    )
    background_image = models.ImageField(
        upload_to='dashboards/backgrounds/',
        blank=True,
        null=True,
        validators=[FileExtensionValidator(['png', 'jpg', 'jpeg'])],
        help_text='Background image (optional)'
    )
    background_opacity = models.FloatField(
        default=1.0,
        help_text='Background image opacity (0.0 to 1.0)'
    )
    
    # Layout Configuration
    grid_columns = models.IntegerField(
        default=12,
        help_text='Number of columns in grid (default: 12)'
    )
    layout_mode = models.CharField(
        max_length=20,
        choices=[
            ('grid', 'Grid Layout'),
            ('masonry', 'Masonry Layout'),
            ('flex', 'Flexible Layout'),
        ],
        default='grid'
    )
    
    # Navigation
    show_navigation = models.BooleanField(
        default=True,
        help_text='Show navigation bar on dashboard'
    )
    navigation_config = models.JSONField(
        default=dict,
        help_text='Navigation links and quick actions'
    )
    
    # Refresh Settings
    auto_refresh = models.BooleanField(
        default=False,
        help_text='Enable auto-refresh for all widgets'
    )
    refresh_interval = models.IntegerField(
        default=60,
        help_text='Auto-refresh interval in seconds'
    )
    
    # Custom Styling
    custom_css = models.TextField(
        blank=True,
        help_text='Custom CSS for this dashboard'
    )
    
    class Meta:
        db_table = 'dashboards'
        ordering = ['-is_default', '-updated_at']
    
    def __str__(self):
        return self.name
    
    def save(self, *args, **kwargs):
        if not self.slug:
            base_slug = slugify(self.name)
            slug = base_slug
            counter = 1
            while Dashboard.objects.filter(owner=self.owner, slug=slug).exists():
                slug = f"{base_slug}-{counter}"
                counter += 1
            self.slug = slug

        # Ensure only one default dashboard per user
        if self.is_default:
            Dashboard.objects.filter(owner=self.owner, is_default=True).exclude(
                id=self.id
            ).update(is_default=False)

        super().save(*args, **kwargs)


class WidgetDataSource(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Flexible data sources for widgets
    Can be API endpoints, workflows, database queries, or static data
    """
    name = models.CharField(max_length=200)
    identifier = models.CharField(
        max_length=200,
        unique=True,
        help_text='Unique identifier (e.g., "student-count", "monthly-income")'
    )
    description = models.TextField(blank=True)
    
    # Data Source Type
    source_type = models.CharField(
        max_length=20,
        choices=[
            ('api', 'API Endpoint'),
            ('workflow', 'Workflow Execution'),
            ('query', 'Database Query'),
            ('calculation', 'Calculated Value'),
            ('static', 'Static Data'),
        ]
    )
    
    # Source Configuration (polymorphic based on source_type)
    source_config = models.JSONField(
        default=dict,
        help_text="""
        Configuration varies by source_type:
        
        API:
        {
            "endpoint": "/api/widgets/students/count/",
            "method": "GET",
            "headers": {},
            "params": {},
            "response_path": "data.value"  // JSONPath to extract value
        }
        
        Workflow:
        {
            "workflow_template_id": 123,
            "input_params": {"period": "current_month"},
            "output_field": "total"  // Which workflow output to use
        }
        
        Query:
        {
            "model": "Client",
            "filters": {"classification__code": "STUDENT", "status": "ACTIVE"},
            "aggregation": {"count": "id"}
        }
        
        Calculation:
        {
            "formula": "{{income}} - {{expenses}}",
            "variables": {
                "income": {"source": "monthly-income"},
                "expenses": {"source": "monthly-expenses"}
            }
        }
        
        Static:
        {
            "value": 450,
            "last_updated": "2025-01-15"
        }
        """
    )
    
    # Caching
    cache_enabled = models.BooleanField(default=True)
    cache_duration = models.IntegerField(
        default=300,
        help_text='Cache duration in seconds (0 = no cache)'
    )
    
    # Permissions
    required_permission = models.CharField(
        max_length=100,
        blank=True,
        help_text='Permission required to access this data source'
    )
    
    # Metadata
    category = models.CharField(max_length=100, blank=True)
    tags = models.JSONField(default=list, help_text='Search tags')
    
    is_active = models.BooleanField(default=True)
    
    class Meta:
        db_table = 'widget_data_sources'
        ordering = ['category', 'name']
        indexes = [
            models.Index(fields=['identifier']),
            models.Index(fields=['source_type', 'is_active']),
        ]
    
    def __str__(self):
        return f"{self.name} ({self.get_source_type_display()})"
    
    def fetch_data(self, context=None):
        """
        Fetch data from the configured source
        Returns: dict with 'value', 'formatted', and any additional metadata
        """
        from dashboards.data_fetchers import DataSourceFetcher
        fetcher = DataSourceFetcher(self)
        return fetcher.fetch(context or {})


# dashboards/models.py (ENHANCED with navigation)
"""
Enhanced Widget model with smart navigation to dynamic pages
"""

from django.db import models
from django.utils.text import slugify
from django.core.validators import FileExtensionValidator
from common.base import TimeStampedModel, SoftDeleteModel, BranchScopedModel


class Widget(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """Enhanced widget with flexible navigation to module pages"""
    
    WIDGET_TYPES = [
        ('kpi', 'KPI Card'),
        ('line_chart', 'Line Chart'),
        ('bar_chart', 'Bar Chart'),
        ('pie_chart', 'Pie Chart'),
        ('donut_chart', 'Donut Chart'),
        ('area_chart', 'Area Chart'),
        ('table', 'Data Table'),
        ('list', 'List Widget'),
        ('stat_grid', 'Statistics Grid'),
        ('progress', 'Progress Bar'),
        ('gauge', 'Gauge Chart'),
        ('map', 'Map Widget'),
        ('calendar', 'Calendar Widget'),
        ('timeline', 'Timeline Widget'),
        ('text', 'Rich Text'),
        ('html', 'Custom HTML'),
        ('iframe', 'Embedded Content'),
        ('navigation', 'Navigation Links'),
        ('quick_actions', 'Quick Action Buttons'),
        ('form_embed', 'Embedded Form'),
        ('image', 'Image Widget'),
        ('video', 'Video Widget'),
    ]
    
    dashboard = models.ForeignKey(
        'Dashboard',
        on_delete=models.CASCADE,
        related_name='widgets'
    )
    
    widget_type = models.CharField(max_length=50, choices=WIDGET_TYPES)
    instance_key = models.CharField(max_length=255)
    
    # Display
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    icon = models.CharField(max_length=50, blank=True)
    
    # Data Source
    data_source = models.ForeignKey(
        'WidgetDataSource',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='widgets'
    )
    
    # Widget Configuration
    config = models.JSONField(
        default=dict,
        help_text="""
        Widget-specific configuration with navigation support:
        
        KPI with ModulePage navigation:
        {
            "format": "currency",
            "color": "#10b981",
            "icon": "users",
            "click_action": {
                "type": "module_page",
                "module_code": "students",
                "page_code": "list",
                "params": {"status": "active"}
            }
        }
        
        Table with row actions to module pages:
        {
            "columns": [...],
            "row_actions": [
                {
                    "label": "View Details",
                    "type": "module_page",
                    "module_code": "students",
                    "page_code": "detail",
                    "params": {"id": "{row.id}"}
                }
            ]
        }
        
        Navigation widget with module page links:
        {
            "links": [
                {
                    "label": "New Purchase Request",
                    "icon": "shopping-cart",
                    "type": "module_page",
                    "module_code": "procurement",
                    "page_code": "purchase-request",
                    "color": "#f59e0b"
                },
                {
                    "label": "All Requests",
                    "icon": "list",
                    "type": "module_page",
                    "module_code": "procurement",
                    "page_code": "requests"
                }
            ]
        }
        """
    )
    
    # Click Action (widget-level, overrides config)
    click_action = models.JSONField(
        default=dict,
        help_text="""
        Primary action when widget is clicked:
        
        Navigate to module page:
        {
            "type": "module_page",
            "module_code": "finance",
            "page_code": "debtor-aging",
            "params": {"period": "current"},
            "target": "_self"
        }
        
        Navigate to absolute URL:
        {
            "type": "navigate",
            "url": "/custom-path",
            "target": "_self"
        }
        
        Open modal with module page:
        {
            "type": "modal",
            "module_code": "students",
            "page_code": "enrollment-form",
            "modal_size": "large"
        }
        
        Trigger workflow:
        {
            "type": "trigger_workflow",
            "workflow_id": 42,
            "params": {}
        }
        
        Quick action (open form):
        {
            "type": "quick_action",
            "quick_action_code": "new-purchase-request"
        }
        """
    )
    
    # Refresh Settings
    auto_refresh = models.BooleanField(default=False)
    refresh_interval = models.IntegerField(default=60)
    
    # Layout
    layout_x = models.IntegerField(default=0)
    layout_y = models.IntegerField(default=0)
    layout_w = models.IntegerField(default=4)
    layout_h = models.IntegerField(default=4)
    layout_min_w = models.IntegerField(default=2)
    layout_min_h = models.IntegerField(default=2)
    layout_max_w = models.IntegerField(null=True, blank=True)
    layout_max_h = models.IntegerField(null=True, blank=True)
    
    # Styling
    background_color = models.CharField(max_length=7, blank=True)
    border_color = models.CharField(max_length=7, blank=True)
    text_color = models.CharField(max_length=7, blank=True)
    custom_style = models.JSONField(default=dict)
    
    # Visibility
    is_visible = models.BooleanField(default=True)
    visibility_conditions = models.JSONField(default=dict)
    
    display_order = models.IntegerField(default=0)
    
    class Meta:
        db_table = 'dashboard_widgets'
        ordering = ['display_order', 'layout_y', 'layout_x']
        unique_together = [('dashboard', 'instance_key')]
        indexes = [
            models.Index(fields=['dashboard', 'widget_type']),
            models.Index(fields=['instance_key']),
            models.Index(fields=['display_order']),
        ]
    
    def __str__(self):
        return f"{self.dashboard.name} - {self.title}"
    
    def get_layout_dict(self):
        """Return layout as dictionary for grid"""
        return {
            'i': self.instance_key,
            'x': self.layout_x,
            'y': self.layout_y,
            'w': self.layout_w,
            'h': self.layout_h,
            'minW': self.layout_min_w,
            'minH': self.layout_min_h,
            'maxW': self.layout_max_w,
            'maxH': self.layout_max_h,
        }
    
    def update_layout(self, layout_data):
        """Update layout from dictionary"""
        self.layout_x = layout_data.get('x', self.layout_x)
        self.layout_y = layout_data.get('y', self.layout_y)
        self.layout_w = layout_data.get('w', self.layout_w)
        self.layout_h = layout_data.get('h', self.layout_h)
    
    def resolve_navigation_url(self, params=None):
        """
        Resolve click_action to actual URL
        Supports module_page, navigate, modal, etc.
        """
        action = self.click_action or self.config.get('click_action', {})
        
        if not action:
            return None
        
        action_type = action.get('type')
        
        if action_type == 'module_page':
            # Build URL from module and page codes
            module_code = action.get('module_code')
            page_code = action.get('page_code')
            query_params = action.get('params', {})
            
            if params:
                # Merge with runtime params
                query_params = {**query_params, **params}
            
            url = f"/{module_code}/{page_code}"
            
            if query_params:
                query_string = '&'.join(f"{k}={v}" for k, v in query_params.items())
                url = f"{url}?{query_string}"
            
            return {
                'type': 'navigate',
                'url': url,
                'target': action.get('target', '_self')
            }
        
        elif action_type == 'navigate':
            return {
                'type': 'navigate',
                'url': action.get('url'),
                'target': action.get('target', '_self')
            }
        
        elif action_type == 'modal':
            module_code = action.get('module_code')
            page_code = action.get('page_code')
            
            return {
                'type': 'modal',
                'url': f"/{module_code}/{page_code}",
                'size': action.get('modal_size', 'medium')
            }
        
        elif action_type == 'quick_action':
            # Reference to QuickAction model
            from pages.models import QuickAction
            quick_action_code = action.get('quick_action_code')
            
            try:
                quick_action = QuickAction.objects.get(code=quick_action_code)
                # Resolve the quick action's target
                if quick_action.action_type == 'page' and quick_action.target_page:
                    return {
                        'type': 'navigate',
                        'url': quick_action.target_page.url_path,
                        'target': '_self'
                    }
            except QuickAction.DoesNotExist:
                pass
        
        return None
    
    def get_navigation_links(self):
        """
        Extract all navigation links from widget config
        Used for navigation-type widgets
        """
        if self.widget_type != 'navigation':
            return []
        
        links = self.config.get('links', [])
        resolved_links = []
        
        for link in links:
            link_type = link.get('type', 'navigate')
            
            if link_type == 'module_page':
                module_code = link.get('module_code')
                page_code = link.get('page_code')
                
                resolved_links.append({
                    'label': link.get('label'),
                    'icon': link.get('icon'),
                    'color': link.get('color'),
                    'url': f"/{module_code}/{page_code}",
                    'description': link.get('description')
                })
            
            elif link_type == 'navigate':
                resolved_links.append({
                    'label': link.get('label'),
                    'icon': link.get('icon'),
                    'color': link.get('color'),
                    'url': link.get('url'),
                    'description': link.get('description')
                })
        
        return resolved_links
    
    def check_visibility(self, user):
        """Check if widget should be visible to user"""
        if not self.is_visible:
            return False
        
        if not self.visibility_conditions:
            return True
        
        # Check user roles
        required_roles = self.visibility_conditions.get('user_roles', [])
        if required_roles:
            user_roles = user.roles.values_list('code', flat=True)
            if not any(role in user_roles for role in required_roles):
                return False
        
        # Check permissions
        required_perms = self.visibility_conditions.get('permissions', [])
        if required_perms:
            if not all(user.has_perm(perm) for perm in required_perms):
                return False
        
        return True


# Helper function for serializer
def resolve_widget_navigation(widget, user=None):
    """
    Helper to resolve all navigation in a widget for frontend
    Returns enhanced widget data with resolved URLs
    """
    data = {
        'id': widget.id,
        'instance_key': widget.instance_key,
        'widget_type': widget.widget_type,
        'title': widget.title,
        'description': widget.description,
        'icon': widget.icon,
        'config': widget.config,
        'layout': widget.get_layout_dict(),
        'data_source': {
            'id': widget.data_source.id,
            'identifier': widget.data_source.identifier,
            'name': widget.data_source.name
        } if widget.data_source else None,
    }
    
    # Resolve primary click action
    if widget.click_action or widget.config.get('click_action'):
        data['click_action'] = widget.resolve_navigation_url()
    
    # Resolve navigation links (for navigation widgets)
    if widget.widget_type == 'navigation':
        data['navigation_links'] = widget.get_navigation_links()
    
    # Check visibility
    if user:
        data['is_visible'] = widget.check_visibility(user)
    
    return data

class DashboardTemplate(TimeStampedModel, SoftDeleteModel, BranchScopedModel):
    """Pre-configured dashboard templates"""
    name = models.CharField(max_length=200)
    description = models.TextField()
    category = models.CharField(max_length=100, blank=True)
    
    # Preview
    preview_image = models.ImageField(
        upload_to='dashboard_templates/',
        blank=True,
        null=True
    )
    thumbnail = models.ImageField(
        upload_to='dashboard_templates/thumbnails/',
        blank=True,
        null=True
    )
    
    # Template Configuration
    template_config = models.JSONField(
        default=dict,
        help_text='Complete dashboard configuration including widgets and theme'
    )
    
    # Theme reference
    default_theme = models.ForeignKey(
        DashboardTheme,
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )
    
    # Availability
    is_active = models.BooleanField(default=True)
    is_public = models.BooleanField(
        default=False,
        help_text='Available to all branches'
    )
    
    # Usage tracking
    usage_count = models.IntegerField(default=0)
    
    # Tags for search
    tags = models.JSONField(default=list)
    
    class Meta:
        db_table = 'dashboard_templates'
        ordering = ['-usage_count', 'name']
    
    def __str__(self):
        return self.name
    
    def create_dashboard_from_template(self, owner, branch, name=None):
        """Create a new dashboard instance from this template"""
        dashboard = Dashboard.objects.create(
            owner=owner,
            branch=branch,
            tenant=self.tenant,
            name=name or f"{self.name} (Copy)",
            description=self.description,
            theme=self.default_theme,
            **self.template_config.get('dashboard_settings', {})
        )

        # Create widgets
        for widget_config in self.template_config.get('widgets', []):
            Widget.objects.create(
                dashboard=dashboard,
                owner=owner,
                branch=branch,
                tenant=self.tenant,
                **widget_config
            )
        
        # Increment usage count
        self.usage_count += 1
        self.save(update_fields=['usage_count'])
        
        return dashboard