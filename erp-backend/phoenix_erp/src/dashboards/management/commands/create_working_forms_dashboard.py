# management/commands/create_working_forms_dashboard.py
"""
Create a fully working forms dashboard with real data
This version creates widgets that work with your existing API endpoints
"""

from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.db import transaction
from dashboards.models import Dashboard, Widget, WidgetDataSource, DashboardTheme
from pages.models import Module, ModulePage
from automations.models import FormSchema

User = get_user_model()


class Command(BaseCommand):
    help = 'Create a working forms dashboard with real endpoints'

    def add_arguments(self, parser):
        parser.add_argument(
            '--owner-email',
            type=str,
            help='Email of the owner user',
            required=True
        )
        parser.add_argument(
            '--slug',
            type=str,
            default='forms-hub',
            help='Dashboard slug',
        )

    @transaction.atomic
    def handle(self, *args, **options):
        try:
            owner = User.objects.get(email=options['owner_email'])
            branch = owner.branches.first()
            
            if not branch:
                self.stdout.write(self.style.ERROR('User has no branches'))
                return
            
            self.stdout.write("\n" + "="*80)
            self.stdout.write(self.style.SUCCESS("📊 CREATING WORKING FORMS DASHBOARD"))
            self.stdout.write("="*80 + "\n")
            
            # 1. Create theme
            theme = self.create_theme(owner, branch)
            
            # 2. Create or update dashboard
            dashboard = self.create_dashboard(owner, branch, options['slug'], theme)
            
            # 3. Get forms and modules data
            forms_data = self.get_forms_data(owner, branch)
            modules_data = self.get_modules_data(owner, branch)
            
            # 4. Create widgets based on actual data
            self.create_dashboard_widgets(dashboard, forms_data, modules_data)
            
            self.stdout.write("\n" + "="*80)
            self.stdout.write(self.style.SUCCESS("✅ DASHBOARD CREATED!"))
            self.stdout.write("="*80)
            self.stdout.write(f"\n🌐 Access at: http://localhost:3000/dashboard/{dashboard.slug}/")
            self.stdout.write(f"📊 Widgets created: {dashboard.widgets.count()}")
            self.stdout.write(f"📝 Forms found: {len(forms_data)}")
            self.stdout.write(f"📁 Modules with forms: {len(modules_data)}\n")
            
        except User.DoesNotExist:
            self.stdout.write(
                self.style.ERROR(f'User not found: {options["owner_email"]}')
            )
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'Error: {str(e)}'))
            import traceback
            traceback.print_exc()

    def create_theme(self, owner, branch):
        """Create modern theme"""
        theme, created = DashboardTheme.objects.get_or_create(
            owner=owner,
            branch=branch,
            name='Forms Hub Theme',
            defaults={
                'description': 'Clean theme for forms dashboard',
                'primary_color': '#3b82f6',
                'secondary_color': '#8b5cf6',
                'accent_color': '#10b981',
                'background_color': '#f8fafc',
                'text_color': '#1e293b',
                'font_family': 'Inter, system-ui, sans-serif',
                'widget_border_radius': 12,
            }
        )
        
        status = 'Created' if created else 'Using'
        self.stdout.write(f"  {status} theme: {theme.name}")
        return theme

    def create_dashboard(self, owner, branch, slug, theme):
        """Create dashboard"""
        dashboard, created = Dashboard.objects.get_or_create(
            owner=owner,
            branch=branch,
            slug=slug,
            defaults={
                'name': 'Forms & Workflows Hub',
                'description': 'Central hub for all forms and workflows',
                'is_active': True,
                'is_default': True,
                'theme': theme,
                'grid_columns': 12,
                'auto_refresh': False,
            }
        )
        
        if not created:
            # Clear existing widgets for fresh start
            dashboard.widgets.all().delete()
            self.stdout.write("  Cleared existing widgets")
        
        status = 'Created' if created else 'Updated'
        self.stdout.write(f"  {status} dashboard: {dashboard.name}")
        return dashboard

    def get_forms_data(self, owner, branch):
        """Get all forms with their module pages"""
        forms_with_pages = []
        
        # Get all form schemas
        forms = FormSchema.objects.filter(
            owner=owner,
            branch=branch,
            is_deleted=False
        )
        
        self.stdout.write(f"\n📝 Found {forms.count()} form schemas")
        
        for form in forms:
            # Find pages that use this form
            pages = ModulePage.objects.filter(
                owner=owner,
                branch=branch,
                page_type='form',
                page_config__form_schema_id=str(form.id),
                is_active=True,
                is_deleted=False
            ).select_related('module')
            
            for page in pages:
                forms_with_pages.append({
                    'form': form,
                    'page': page,
                    'module': page.module
                })
                self.stdout.write(
                    f"  • {form.name} → {page.module.name}/{page.title}"
                )
        
        return forms_with_pages

    def get_modules_data(self, owner, branch):
        """Organize forms by module"""
        modules_dict = {}
        
        # Get all modules with form pages
        modules = Module.objects.filter(
            owner=owner,
            branch=branch,
            is_active=True,
            is_deleted=False
        ).prefetch_related('pages')
        
        for module in modules:
            form_pages = module.pages.filter(
                page_type='form',
                is_active=True,
                is_deleted=False
            ).order_by('order')
            
            if form_pages.exists():
                modules_dict[module.code] = {
                    'module': module,
                    'pages': list(form_pages)
                }
        
        self.stdout.write(f"\n📁 Found {len(modules_dict)} modules with form pages")
        return modules_dict

    def create_dashboard_widgets(self, dashboard, forms_data, modules_data):
        """Create all widgets"""
        self.stdout.write("\n📦 Creating widgets...")
        
        current_y = 0
        
        # 1. Create header text widget
        Widget.objects.create(
            dashboard=dashboard,
            owner=dashboard.owner,
            branch=dashboard.branch,
            widget_type='text',
            instance_key='header-welcome',
            title='',
            config={
                'content': '''
                    <div style="padding: 1rem;">
                        <h2 style="font-size: 1.5rem; font-weight: bold; margin-bottom: 0.5rem;">
                            📋 Forms & Workflows
                        </h2>
                        <p style="color: #6b7280;">
                            Quick access to all forms. Click any form to get started.
                        </p>
                    </div>
                '''
            },
            layout_x=0,
            layout_y=current_y,
            layout_w=12,
            layout_h=2,
            is_visible=True
        )
        self.stdout.write("  ✓ Header widget")
        current_y += 2
        
        # 2. Create KPI widgets for form stats
        kpi_configs = [
            {
                'title': 'Total Forms',
                'instance_key': 'kpi-total-forms',
                'icon': 'file-text',
                'color': '#3b82f6',
                'value': len(forms_data),
                'x': 0, 'w': 3
            },
            {
                'title': 'Modules',
                'instance_key': 'kpi-modules',
                'icon': 'folder',
                'color': '#8b5cf6',
                'value': len(modules_data),
                'x': 3, 'w': 3
            },
            {
                'title': 'Form Pages',
                'instance_key': 'kpi-pages',
                'icon': 'layout',
                'color': '#10b981',
                'value': len(forms_data),
                'x': 6, 'w': 3
            },
            {
                'title': 'Active',
                'instance_key': 'kpi-active',
                'icon': 'check-circle',
                'color': '#f59e0b',
                'value': len([f for f in forms_data if f['page'].is_active]),
                'x': 9, 'w': 3
            }
        ]
        
        for kpi in kpi_configs:
            Widget.objects.create(
                dashboard=dashboard,
                owner=dashboard.owner,
                branch=dashboard.branch,
                widget_type='kpi',
                instance_key=kpi['instance_key'],
                title=kpi['title'],
                config={
                    'format': 'number',
                    'icon': kpi['icon'],
                    'color': kpi['color'],
                    'show_trend': False,
                    'static_value': kpi['value']  # Static value, no API call needed
                },
                layout_x=kpi['x'],
                layout_y=current_y,
                layout_w=kpi['w'],
                layout_h=3,
                is_visible=True
            )
        
        self.stdout.write("  ✓ KPI widgets (4)")
        current_y += 3
        
        # 3. Create navigation widgets for each module
        for module_code, module_info in modules_data.items():
            module = module_info['module']
            pages = module_info['pages']
            
            # Build navigation links
            links = []
            for page in pages:
                # Get form schema for description
                form_schema_id = page.page_config.get('form_schema_id')
                description = page.description or ''
                
                if form_schema_id:
                    try:
                        form_schema = FormSchema.objects.get(id=form_schema_id)
                        description = form_schema.description or description
                    except FormSchema.DoesNotExist:
                        pass
                
                links.append({
                    'label': page.title,
                    'description': description[:100] if description else f'Access {page.title.lower()}',
                    'url': page.url_path,
                    'icon': page.icon or module.icon or 'file-text',
                    'color': module.color or '#3b82f6',
                })
            
            # Determine widget size based on number of forms
            num_forms = len(links)
            widget_width = 6 if num_forms <= 3 else 12
            widget_height = max(4, min(8, (num_forms + 1) // 2 * 2 + 2))
            
            Widget.objects.create(
                dashboard=dashboard,
                owner=dashboard.owner,
                branch=dashboard.branch,
                widget_type='navigation',
                instance_key=f'nav-{module_code}',
                title=f'{module.name} Forms',
                description=f'Quick access to {module.name.lower()} forms',
                icon=module.icon,
                config={
                    'links': links,
                    'layout': 'grid' if num_forms > 2 else 'list',
                    'show_icons': True,
                    'show_descriptions': True,
                },
                layout_x=0 if widget_width == 12 else (0 if len(modules_data) % 2 == 1 else 6),
                layout_y=current_y,
                layout_w=widget_width,
                layout_h=widget_height,
                background_color='#ffffff',
                is_visible=True
            )
            
            self.stdout.write(f"  ✓ Navigation: {module.name} ({num_forms} forms)")
            
            # Move to next row if widget is full width
            if widget_width == 12:
                current_y += widget_height
        
        # 4. Create "All Forms" list widget if there are forms
        if forms_data:
            current_y = max([w.layout_y + w.layout_h for w in dashboard.widgets.all()], default=0)
            
            all_forms_data = []
            for item in forms_data:
                all_forms_data.append({
                    'name': item['form'].name,
                    'module': item['module'].name,
                    'page': item['page'].title,
                    'url': item['page'].url_path,
                    'icon': item['module'].icon,
                })
            
            Widget.objects.create(
                dashboard=dashboard,
                owner=dashboard.owner,
                branch=dashboard.branch,
                widget_type='list',
                instance_key='all-forms-list',
                title='All Forms',
                description='Complete list of available forms',
                config={
                    'items': all_forms_data,
                    'show_icon': True,
                    'clickable': True,
                },
                layout_x=0,
                layout_y=current_y,
                layout_w=12,
                layout_h=6,
                is_visible=True
            )
            
            self.stdout.write(f"  ✓ All Forms list")


# ============================================================================
# STANDALONE VERSION
# ============================================================================

def create_working_dashboard_standalone(owner_email, slug='forms-hub'):
    """
    Standalone function to create dashboard
    """
    import django
    import os
    
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'phoenix.settings')
    django.setup()
    
    from django.contrib.auth import get_user_model
    User = get_user_model()
    
    owner = User.objects.get(email=owner_email)
    branch = owner.branches.first()
    
    if not branch:
        raise ValueError("User has no branches")
    
    command = Command()
    command.stdout = type('obj', (object,), {
        'write': print,
        'style': type('obj', (object,), {
            'SUCCESS': lambda x: f'\033[92m{x}\033[0m',
            'ERROR': lambda x: f'\033[91m{x}\033[0m',
        })()
    })()
    
    with transaction.atomic():
        theme = command.create_theme(owner, branch)
        dashboard = command.create_dashboard(owner, branch, slug, theme)
        forms_data = command.get_forms_data(owner, branch)
        modules_data = command.get_modules_data(owner, branch)
        command.create_dashboard_widgets(dashboard, forms_data, modules_data)
    
    print(f"\n✅ Dashboard created: http://localhost:3000/dashboard/{dashboard.slug}/")
    return dashboard