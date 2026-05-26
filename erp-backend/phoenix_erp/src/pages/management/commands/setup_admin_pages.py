# pages/management/commands/setup_admin_pages.py
"""
Create admin/management pages that aren't tied to workflow forms
These are pages like:
- Account Creation
- Product Management  
- Dashboard Builder
- Report Builder
- User Management
etc.
"""

from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from pages.models import Module, ModulePage

User = get_user_model()


class Command(BaseCommand):
    help = 'Setup admin and management pages (account creation, product management, etc.)'
    
    def add_arguments(self, parser):
        parser.add_argument(
            '--owner-id',
            type=int,
            required=True,
            help='User ID to use as owner'
        )
        parser.add_argument(
            '--branch-id',
            type=int,
            required=True,
            help='Branch ID'
        )
    
    def handle(self, *args, **options):
        owner_id = options['owner_id']
        branch_id = options['branch_id']
        
        try:
            from branches.models import Branch
            owner = User.objects.get(id=owner_id)
            branch = Branch.objects.get(id=branch_id)
        except (User.DoesNotExist, Branch.DoesNotExist) as e:
            self.stdout.write(self.style.ERROR(f'Error: {e}'))
            return
        
        self.stdout.write(self.style.SUCCESS(f'\n📄 Creating Admin Pages for {owner.email}...\n'))
        
        created_count = 0
        
        # Define admin pages by module
        admin_pages = {
            'accounts': [
                {
                    'code': 'create-account',
                    'title': 'Create Account',
                    'description': 'Add new account to chart of accounts',
                    'icon': 'plus-circle',
                    'page_type': 'form',
                    'page_config': {
                        'entity': 'Account',
                        'form_type': 'create',
                        'redirect_on_success': '/accounts'
                    },
                    'show_in_menu': True,
                    'required_permission': 'accounts.add_account'
                },
                {
                    'code': 'account-categories',
                    'title': 'Account Categories',
                    'description': 'Manage account categories and workflow inheritance',
                    'icon': 'folder',
                    'page_type': 'list',
                    'page_config': {
                        'entity': 'AccountCategory',
                        'columns': ['name', 'code', 'workflow_template', 'is_active'],
                        'actions': ['edit', 'delete']
                    },
                    'show_in_menu': True,
                    'required_permission': 'accounts.view_accountcategory'
                },
                {
                    'code': 'edit-account',
                    'title': 'Edit Account',
                    'description': 'Update account details',
                    'icon': 'edit',
                    'page_type': 'form',
                    'page_config': {
                        'entity': 'Account',
                        'form_type': 'edit',
                        'redirect_on_success': '/accounts'
                    },
                    'show_in_menu': False,  # Accessed via list actions
                    'required_permission': 'accounts.change_account'
                },
            ],
            'products': [
                {
                    'code': 'create-product',
                    'title': 'Create Product',
                    'description': 'Add new product or service',
                    'icon': 'package-plus',
                    'page_type': 'form',
                    'page_config': {
                        'entity': 'Product',
                        'form_type': 'create',
                        'redirect_on_success': '/products'
                    },
                    'show_in_menu': True,
                    'required_permission': 'products.add_product'
                },
                {
                    'code': 'product-categories',
                    'title': 'Product Categories',
                    'description': 'Manage product categories',
                    'icon': 'folder-tree',
                    'page_type': 'list',
                    'page_config': {
                        'entity': 'ProductCategory',
                        'columns': ['name', 'code', 'parent', 'is_active'],
                        'actions': ['edit', 'delete']
                    },
                    'show_in_menu': True,
                    'required_permission': 'products.view_productcategory'
                },
                {
                    'code': 'edit-product',
                    'title': 'Edit Product',
                    'description': 'Update product details',
                    'icon': 'edit',
                    'page_type': 'form',
                    'page_config': {
                        'entity': 'Product',
                        'form_type': 'edit',
                        'redirect_on_success': '/products'
                    },
                    'show_in_menu': False,
                    'required_permission': 'products.change_product'
                },
            ],
            'dashboard': [
                {
                    'code': 'dashboard-builder',
                    'title': 'Dashboard Builder',
                    'description': 'Create and customize dashboards',
                    'icon': 'layout-dashboard',
                    'page_type': 'custom',
                    'page_config': {
                        'component': 'DashboardBuilder',
                        'features': ['add_widgets', 'drag_drop', 'resize', 'save_layout']
                    },
                    'show_in_menu': True,
                    'required_permission': ''  # Available to all
                },
            ],
            'reports': [
                {
                    'code': 'report-builder',
                    'title': 'Report Builder',
                    'description': 'Create custom reports',
                    'icon': 'file-bar-chart',
                    'page_type': 'custom',
                    'page_config': {
                        'component': 'ReportBuilder',
                        'features': ['select_data', 'filters', 'grouping', 'charts']
                    },
                    'show_in_menu': True,
                    'required_permission': ''  # Available to all
                },
            ],
            'admin': [
                {
                    'code': 'user-management',
                    'title': 'User Management',
                    'description': 'Manage users, roles, and permissions',
                    'icon': 'users',
                    'page_type': 'list',
                    'page_config': {
                        'entity': 'User',
                        'columns': ['username', 'email', 'roles', 'is_active'],
                        'actions': ['edit', 'deactivate', 'reset_password']
                    },
                    'show_in_menu': True,
                    'required_permission': 'users.view_user',
                    'is_admin_only': True
                },
                {
                    'code': 'workflow-management',
                    'title': 'Workflow Management',
                    'description': 'Create and manage workflows',
                    'icon': 'git-branch',
                    'page_type': 'list',
                    'page_config': {
                        'entity': 'WorkflowTemplate',
                        'columns': ['name', 'trigger_type', 'is_active'],
                        'actions': ['edit', 'duplicate', 'delete']
                    },
                    'show_in_menu': True,
                    'required_permission': 'automations.view_workflowtemplate',
                    'is_admin_only': True
                },
                {
                    'code': 'form-management',
                    'title': 'Form Management',
                    'description': 'Create and manage forms',
                    'icon': 'file-text',
                    'page_type': 'list',
                    'page_config': {
                        'entity': 'FormSchema',
                        'columns': ['name', 'form_type', 'is_active'],
                        'actions': ['edit', 'duplicate', 'delete']
                    },
                    'show_in_menu': True,
                    'required_permission': 'automations.view_formschema',
                    'is_admin_only': True
                },
            ],
        }
        
        for module_code, pages in admin_pages.items():
            # Get or create module
            module = Module.objects.filter(
                owner=owner,
                branch=branch,
                code=module_code
            ).first()
            
            if not module:
                self.stdout.write(f'  ⚠️  Module {module_code} not found, skipping...')
                continue
            
            self.stdout.write(f'\n📁 Module: {module.name}')
            
            for page_data in pages:
                # Build URL path
                url_path = f'/{module_code}/{page_data["code"]}'
                
                page, created = ModulePage.objects.get_or_create(
                    owner=owner,
                    branch=branch,
                    module=module,
                    code=page_data['code'],
                    defaults={
                        'title': page_data['title'],
                        'description': page_data['description'],
                        'icon': page_data['icon'],
                        'page_type': page_data['page_type'],
                        'page_config': page_data['page_config'],
                        'url_path': url_path,
                        'show_in_menu': page_data['show_in_menu'],
                        'required_permission': page_data.get('required_permission', ''),
                        'is_active': True,
                        'order': 100  # Put admin pages at end
                    }
                )
                
                if created:
                    created_count += 1
                    menu_mark = '📋' if page.show_in_menu else '🔒'
                    self.stdout.write(f'  {menu_mark} {page.title} → {url_path}')
        
        self.stdout.write(self.style.SUCCESS(f'\n✅ Created {created_count} admin pages\n'))
        self.stdout.write('Now run: python manage.py setup_default_modules (if not already done)\n')
