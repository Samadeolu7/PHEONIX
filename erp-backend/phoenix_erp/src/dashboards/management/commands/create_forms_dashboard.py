# management/commands/create_forms_dashboard.py
"""
Management command to create a comprehensive dashboard with navigation to all form pages
Creates widgets organized by module with beautiful navigation cards

Usage:
    python manage.py create_forms_dashboard --owner-email=admin@school.com
    python manage.py create_forms_dashboard --owner-email=admin@school.com --update
"""

from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.db import transaction
from dashboards.models import Dashboard, Widget, WidgetDataSource, DashboardTheme
from pages.models import Module, ModulePage
from automations.models import FormSchema

User = get_user_model()


class Command(BaseCommand):
    help = 'Create a comprehensive dashboard with navigation to all form pages'

    def add_arguments(self, parser):
        parser.add_argument(
            '--id',
            type=int,
            help='id of the owner user',
            required=True
        )
        parser.add_argument(
            '--update',
            action='store_true',
            help='Update existing dashboard instead of creating new one',
        )
        parser.add_argument(
            '--slug',
            type=str,
            default='forms-central',
            help='Dashboard slug (default: forms-central)',
        )

    @transaction.atomic
    def handle(self, *args, **options):
        try:
            owner = User.objects.get(id=options["id"])
            branch = owner.branch_owned.first()
            
            if not branch:
                self.stdout.write(
                    self.style.ERROR('User has no branch_owned')
                )
                return
            
            self.stdout.write("\n" + "="*80)
            self.stdout.write(self.style.SUCCESS("📊 CREATING FORMS DASHBOARD"))
            self.stdout.write("="*80 + "\n")
            
            # Create or get theme
            theme = self.create_theme(owner, branch)
            
            # Create or update dashboard
            dashboard = self.create_dashboard(
                owner, 
                branch, 
                options['slug'],
                options['update'],
                theme
            )
            
            # Create data sources for KPI widgets
            data_sources = self.create_data_sources(owner, branch)
            
            # Create widgets
            self.create_widgets(owner, branch, dashboard, data_sources)
            
            self.stdout.write("\n" + "="*80)
            self.stdout.write(self.style.SUCCESS("✅ DASHBOARD CREATED SUCCESSFULLY!"))
            self.stdout.write("="*80)
            self.stdout.write(f"\n📍 Access your dashboard at: /dashboard/{dashboard.slug}/")
            self.stdout.write(f"🎨 Theme: {theme.name}")
            self.stdout.write(f"📊 Widgets: {dashboard.widgets.count()}")
            self.stdout.write("\n")
            
        except User.DoesNotExist:
            self.stdout.write(
                self.style.ERROR(f'User not found: {options["id"]}')
            )
        except Exception as e:
            self.stdout.write(
                self.style.ERROR(f'Error: {str(e)}')
            )
            import traceback
            traceback.print_exc()

    def create_theme(self, owner, branch):
        """Create a beautiful theme for the dashboard"""
        theme, created = DashboardTheme.objects.get_or_create(
            owner=owner,
            branch=branch,
            name='Forms Dashboard Theme',
            defaults={
                'description': 'Modern theme for forms and workflows dashboard',
                'primary_color': '#6366f1',
                'secondary_color': '#8b5cf6',
                'accent_color': '#ec4899',
                'background_color': '#f8fafc',
                'text_color': '#1e293b',
                'font_family': 'Inter, system-ui, sans-serif',
                'font_size_base': 14,
                'widget_spacing': 16,
                'widget_border_radius': 12,
                'widget_shadow': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                'custom_css_variables': {
                    '--success-color': '#10b981',
                    '--warning-color': '#f59e0b',
                    '--error-color': '#ef4444',
                    '--info-color': '#3b82f6'
                }
            }
        )
        
        status = 'Created' if created else 'Using existing'
        self.stdout.write(f"  {status} theme: {theme.name}")
        return theme

    def create_dashboard(self, owner, branch, slug, update, theme):
        """Create or update the main dashboard"""
        
        if update:
            try:
                dashboard = Dashboard.objects.get(
                    owner=owner,
                    branch=branch,
                    slug=slug
                )
                self.stdout.write(f"  Updating existing dashboard: {dashboard.name}")
                
                # Clear existing widgets
                dashboard.widgets.all().delete()
                self.stdout.write("  Cleared existing widgets")
                
                return dashboard
            except Dashboard.DoesNotExist:
                pass
        
        dashboard, created = Dashboard.objects.get_or_create(
            owner=owner,
            branch=branch,
            slug=slug,
            defaults={
                'name': 'Forms & Workflows Central',
                'description': 'Quick access to all forms and workflow monitoring',
                'is_active': True,
                'is_default': False,
                'theme': theme,
                'grid_columns': 12,
                'layout_mode': 'grid',
                'show_navigation': True,
                'auto_refresh': True,
                'refresh_interval': 60
            }
        )
        
        status = 'Created new' if created else 'Using existing'
        self.stdout.write(f"  {status} dashboard: {dashboard.name}")
        return dashboard

    def create_data_sources(self, owner, branch):
        """Create data sources for KPI widgets"""
        
        self.stdout.write("\n📊 Creating data sources...")
        
        data_sources = {}
        
        # Total Forms Count
        ds1, created = WidgetDataSource.objects.get_or_create(
            owner=owner,
            branch=branch,
            identifier='total-forms-count',
            defaults={
                'name': 'Total Forms Count',
                'description': 'Total number of form schemas',
                'source_type': 'query',
                'source_config': {
                    'model': 'automations.FormSchema',
                    'filters': {'is_deleted': False},
                    'aggregation': {
                        'type': 'count',
                        'field': 'id'
                    }
                },
                'cache_enabled': True,
                'cache_duration': 300,
                'is_active': True
            }
        )
        data_sources['total_forms'] = ds1
        self.stdout.write(f"  {'✓' if created else '→'} Total Forms Count")
        
        # Total Submissions Today
        ds2, created = WidgetDataSource.objects.get_or_create(
            owner=owner,
            branch=branch,
            identifier='submissions-today',
            defaults={
                'name': 'Form Submissions Today',
                'description': 'Number of form submissions today',
                'source_type': 'query',
                'source_config': {
                    'model': 'automations.FormSubmission',
                    'filters': {
                        'is_deleted': False,
                        'created_at__date': '{{today}}'
                    },
                    'aggregation': {
                        'type': 'count',
                        'field': 'id'
                    }
                },
                'cache_enabled': True,
                'cache_duration': 60,
                'is_active': True
            }
        )
        data_sources['submissions_today'] = ds2
        self.stdout.write(f"  {'✓' if created else '→'} Submissions Today")
        
        # Pending Workflow Approvals
        ds3, created = WidgetDataSource.objects.get_or_create(
            owner=owner,
            branch=branch,
            identifier='pending-approvals',
            defaults={
                'name': 'Pending Workflow Approvals',
                'description': 'Number of pending approvals',
                'source_type': 'query',
                'source_config': {
                    'model': 'automations.WorkflowApproval',
                    'filters': {
                        'status': 'pending',
                        'is_deleted': False
                    },
                    'aggregation': {
                        'type': 'count',
                        'field': 'id'
                    }
                },
                'cache_enabled': True,
                'cache_duration': 30,
                'is_active': True
            }
        )
        data_sources['pending_approvals'] = ds3
        self.stdout.write(f"  {'✓' if created else '→'} Pending Approvals")
        
        # Active Workflow Runs
        ds4, created = WidgetDataSource.objects.get_or_create(
            owner=owner,
            branch=branch,
            identifier='active-workflow-runs',
            defaults={
                'name': 'Active Workflow Runs',
                'description': 'Currently running workflows',
                'source_type': 'query',
                'source_config': {
                    'model': 'automations.WorkflowRun',
                    'filters': {
                        'status': 'running',
                        'is_deleted': False
                    },
                    'aggregation': {
                        'type': 'count',
                        'field': 'id'
                    }
                },
                'cache_enabled': True,
                'cache_duration': 30,
                'is_active': True
            }
        )
        data_sources['active_runs'] = ds4
        self.stdout.write(f"  {'✓' if created else '→'} Active Workflow Runs")
        
        return data_sources

    def create_widgets(self, owner, branch, dashboard, data_sources):
        """Create all dashboard widgets"""
        
        self.stdout.write("\n📦 Creating widgets...")
        
        # Get all modules with form pages
        modules_with_forms = self.get_modules_with_forms(owner, branch)
        
        # Row 1: KPI Cards (4 across)
        self.create_kpi_widgets(dashboard, data_sources)
        
        # Row 2+: Navigation widgets by module
        self.create_navigation_widgets(dashboard, modules_with_forms)
        
        # Add workflow monitoring widget
        self.create_workflow_monitor_widget(dashboard)
        
        # Add recent submissions table
        self.create_recent_submissions_widget(dashboard)

    def get_modules_with_forms(self, owner, branch):
        """Get all modules that have form pages"""
        
        modules = []
        
        for module in Module.objects.filter(
            owner=owner,
            branch=branch,
            is_active=True,
            is_deleted=False
        ).order_by('order'):
            form_pages = ModulePage.objects.filter(
                module=module,
                page_type='form',
                is_active=True,
                is_deleted=False
            ).order_by('order')
            
            if form_pages.exists():
                modules.append({
                    'module': module,
                    'pages': list(form_pages)
                })
        
        return modules

    def create_kpi_widgets(self, dashboard, data_sources):
        """Create KPI cards at the top"""
        
        kpi_configs = [
            {
                'title': 'Total Forms',
                'instance_key': 'kpi-total-forms',
                'data_source': data_sources['total_forms'],
                'icon': 'file-text',
                'color': '#6366f1',
                'x': 0, 'y': 0, 'w': 3, 'h': 3
            },
            {
                'title': 'Submissions Today',
                'instance_key': 'kpi-submissions-today',
                'data_source': data_sources['submissions_today'],
                'icon': 'trending-up',
                'color': '#10b981',
                'x': 3, 'y': 0, 'w': 3, 'h': 3
            },
            {
                'title': 'Pending Approvals',
                'instance_key': 'kpi-pending-approvals',
                'data_source': data_sources['pending_approvals'],
                'icon': 'clock',
                'color': '#f59e0b',
                'x': 6, 'y': 0, 'w': 3, 'h': 3,
                'click_action': {
                    'type': 'navigate',
                    'url': '/workflows/approvals',
                    'target': '_self'
                }
            },
            {
                'title': 'Active Workflows',
                'instance_key': 'kpi-active-workflows',
                'data_source': data_sources['active_runs'],
                'icon': 'activity',
                'color': '#8b5cf6',
                'x': 9, 'y': 0, 'w': 3, 'h': 3,
                'click_action': {
                    'type': 'navigate',
                    'url': '/workflows/runs',
                    'target': '_self'
                }
            }
        ]
        
        for config in kpi_configs:
            widget = Widget.objects.create(
                dashboard=dashboard,
                owner=dashboard.owner,
                branch=dashboard.branch,
                widget_type='kpi',
                instance_key=config['instance_key'],
                title=config['title'],
                data_source=config['data_source'],
                config={
                    'format': 'number',
                    'icon': config['icon'],
                    'color': config['color'],
                    'show_trend': False
                },
                click_action=config.get('click_action', {}),
                layout_x=config['x'],
                layout_y=config['y'],
                layout_w=config['w'],
                layout_h=config['h'],
                layout_min_w=2,
                layout_min_h=2,
                is_visible=True,
                display_order=config['y'] * 12 + config['x']
            )
            self.stdout.write(f"  ✓ KPI: {widget.title}")

    def create_navigation_widgets(self, dashboard, modules_with_forms):
        """Create navigation widgets for each module"""
        
        current_y = 3  # Start after KPI row
        
        for module_data in modules_with_forms:
            module = module_data['module']
            pages = module_data['pages']
            
            # Build navigation links
            links = []
            for page in pages:
                # Get form schema for description
                form_schema_id = page.page_config.get('form_schema_id')
                description = page.description or ''
                
                if form_schema_id:
                    try:
                        from automations.models import FormSchema
                        form_schema = FormSchema.objects.get(id=form_schema_id)
                        description = form_schema.description or description
                    except:
                        pass
                
                links.append({
                    'label': page.title,
                    'description': description,
                    'url': page.url_path,
                    'icon': page.icon or module.icon or 'file-text',
                    'color': module.color or '#6366f1',
                    'module_code': module.code,
                    'page_code': page.code
                })
            
            # Determine widget width based on number of forms
            num_forms = len(links)
            widget_width = 6 if num_forms <= 3 else 12
            
            # Create navigation widget
            widget = Widget.objects.create(
                dashboard=dashboard,
                owner=dashboard.owner,
                branch=dashboard.branch,
                widget_type='navigation',
                instance_key=f'nav-{module.code}',
                title=f'{module.name} Forms',
                description=f'Quick access to {module.name.lower()} forms',
                icon=module.icon,
                config={
                    'links': links,
                    'layout': 'grid' if num_forms > 2 else 'list',
                    'show_icons': True,
                    'show_descriptions': True
                },
                layout_x=0,
                layout_y=current_y,
                layout_w=widget_width,
                layout_h=max(4, (num_forms + 1) // 2 * 2),  # Dynamic height
                layout_min_w=4,
                layout_min_h=3,
                background_color='#ffffff',
                is_visible=True,
                display_order=current_y * 12
            )
            
            self.stdout.write(f"  ✓ Navigation: {widget.title} ({num_forms} forms)")
            
            # Move to next row
            current_y += widget.layout_h

    def create_workflow_monitor_widget(self, dashboard):
        """Create workflow monitoring widget"""
        
        # Find the position (after all navigation widgets)
        max_y = max([w.layout_y + w.layout_h for w in dashboard.widgets.all()], default=3)
        
        widget = Widget.objects.create(
            dashboard=dashboard,
            owner=dashboard.owner,
            branch=dashboard.branch,
            widget_type='list',
            instance_key='workflow-monitor',
            title='Active Workflows',
            description='Currently running workflows',
            icon='activity',
            config={
                'data_source': '/api/workflow-runs/?status=running&limit=10',
                'show_icon': True,
                'item_template': {
                    'title_field': 'template.name',
                    'subtitle_field': 'run_reference',
                    'icon_field': 'template.icon',
                    'status_field': 'status'
                },
                'refresh_interval': 30,
                'empty_message': 'No active workflows',
                'clickable': True,
                'row_url': '/workflows/runs/{id}'
            },
            layout_x=0,
            layout_y=max_y,
            layout_w=6,
            layout_h=5,
            layout_min_w=4,
            layout_min_h=4,
            auto_refresh=True,
            refresh_interval=30,
            is_visible=True,
            display_order=max_y * 12
        )
        
        self.stdout.write(f"  ✓ List: {widget.title}")

    def create_recent_submissions_widget(self, dashboard):
        """Create recent form submissions table widget"""
        
        # Find the position
        max_y = max([w.layout_y + w.layout_h for w in dashboard.widgets.all()], default=3)
        
        widget = Widget.objects.create(
            dashboard=dashboard,
            owner=dashboard.owner,
            branch=dashboard.branch,
            widget_type='table',
            instance_key='recent-submissions',
            title='Recent Form Submissions',
            description='Latest form submissions across all forms',
            icon='list',
            config={
                'data_source': '/api/form-submissions/?limit=10&ordering=-created_at',
                'columns': [
                    {
                        'field': 'submission_reference',
                        'label': 'Reference',
                        'width': '150px'
                    },
                    {
                        'field': 'form_schema.name',
                        'label': 'Form',
                        'width': '200px'
                    },
                    {
                        'field': 'created_by.get_full_name',
                        'label': 'Submitted By',
                        'width': '150px'
                    },
                    {
                        'field': 'created_at',
                        'label': 'Date',
                        'type': 'datetime',
                        'format': 'date',
                        'width': '120px'
                    },
                    {
                        'field': 'status',
                        'label': 'Status',
                        'type': 'badge',
                        'width': '100px'
                    }
                ],
                'pagination': True,
                'page_size': 10,
                'show_search': True,
                'clickable_rows': True,
                'row_url': '/forms/submissions/{id}'
            },
            layout_x=6,
            layout_y=max_y,
            layout_w=6,
            layout_h=5,
            layout_min_w=6,
            layout_min_h=4,
            auto_refresh=True,
            refresh_interval=60,
            is_visible=True,
            display_order=max_y * 12 + 6
        )
        
        self.stdout.write(f"  ✓ Table: {widget.title}")


# ============================================================================
# STANDALONE SCRIPT VERSION (for running without management command)
# ============================================================================

def create_forms_dashboard_standalone(id, update=False, slug='forms-central'):
    """
    Standalone function to create dashboard
    Can be used in Django shell or other scripts
    """
    import django
    import os
    
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'phoenix.settings')
    django.setup()
    
    from django.contrib.auth import get_user_model
    User = get_user_model()
    
    owner = User.objects.get(id =id)
    branch = owner.branch_owned.first()
    
    if not branch:
        raise ValueError("User has no branch_owned")
    
    # Create command instance and execute
    command = Command()
    command.stdout = type('obj', (object,), {
        'write': print,
        'style': type('obj', (object,), {
            'SUCCESS': lambda x: f'\033[92m{x}\033[0m',
            'ERROR': lambda x: f'\033[91m{x}\033[0m',
            'WARNING': lambda x: f'\033[93m{x}\033[0m',
        })()
    })()
    
    with transaction.atomic():
        theme = command.create_theme(owner, branch)
        dashboard = command.create_dashboard(owner, branch, slug, update, theme)
        data_sources = command.create_data_sources(owner, branch)
        command.create_widgets(owner, branch, dashboard, data_sources)
    
    print(f"\n✅ Dashboard created: /dashboard/{dashboard.slug}/")
    return dashboard


# ============================================================================
# USAGE EXAMPLES
# ============================================================================

"""
# As Management Command:
python manage.py create_forms_dashboard --owner-email=admin@school.com

# Update existing dashboard:
python manage.py create_forms_dashboard --owner-email=admin@school.com --update

# Custom slug:
python manage.py create_forms_dashboard --owner-email=admin@school.com --slug=my-forms


# In Django Shell:
from management.commands.create_forms_dashboard import create_forms_dashboard_standalone

dashboard = create_forms_dashboard_standalone('admin@school.com')
print(f"Dashboard URL: /dashboard/{dashboard.slug}/")


# Programmatically:
from django.contrib.auth import get_user_model
from management.commands.create_forms_dashboard import Command

User = get_user_model()
owner = User.objects.get(email='admin@school.com')
branch = owner.branch_owned.first()

command = Command()
command.stdout = type('MockStdout', (), {'write': lambda x: None})()

with transaction.atomic():
    theme = command.create_theme(owner, branch)
    dashboard = command.create_dashboard(owner, branch, 'forms-central', False, theme)
    data_sources = command.create_data_sources(owner, branch)
    command.create_widgets(owner, branch, dashboard, data_sources)
"""