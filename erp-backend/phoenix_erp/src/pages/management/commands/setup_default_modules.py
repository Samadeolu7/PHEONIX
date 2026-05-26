from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from pages.models import Module, ModulePage
from branches.models import Branch

User = get_user_model()

class Command(BaseCommand):
    help = 'Create default modules and pages'
    
    def add_arguments(self, parser):
        parser.add_argument(
            '--owner-id',
            type=int,
            help='Owner user ID'
        )
        parser.add_argument(
            '--branch-id',
            type=int,
            help='Branch ID'
        )
    
    def handle(self, *args, **options):
        owner_id = options.get('owner_id')
        branch_id = options.get('branch_id')
        
        if not owner_id or not branch_id:
            self.stdout.write(
                self.style.ERROR('Both --owner-id and --branch-id are required')
            )
            return
        
        try:
            owner = User.objects.get(id=owner_id)
            branch = Branch.objects.get(id=branch_id)
        except (User.DoesNotExist, Branch.DoesNotExist) as e:
            self.stdout.write(self.style.ERROR(f'Error: {e}'))
            return
        
        self.create_default_modules(owner, branch)
        
        self.stdout.write(
            self.style.SUCCESS('Successfully created default modules and pages')
        )
    
    def create_default_modules(self, owner, branch):
        # Dashboard Module
        dashboard = Module.objects.create(
            owner=owner,
            branch=branch,
            created_by=owner,
            code='dashboard',
            name='Dashboard',
            description='Main dashboard and overview',
            icon='layout-dashboard',
            color='#6366F1',
            order=0
        )
        
        ModulePage.objects.create(
            owner=owner,
            branch=branch,
            created_by=owner,
            module=dashboard,
            code='home',
            title='Home Dashboard',
            page_type='dashboard',
            page_config={
                'widgets': []
            },
            show_in_menu=True,
            order=0
        )
        
        # Accounts Module
        accounts = Module.objects.create(
            owner=owner,
            branch=branch,
            created_by=owner,
            code='accounts',
            name='Accounts',
            description='Manage financial accounts and transactions',
            icon='wallet',
            color='#10B981',
            order=1
        )
        ModulePage.objects.create(
            owner=owner,
            branch=branch,
            created_by=owner,
            module=accounts,
            code='chart',
            title='Chart of Accounts',
            page_type='list',
            page_config={
                'list_type': 'accounts',
                'columns': ['code', 'name', 'balance'],
                'actions': ['view', 'transactions']
            },
            show_in_menu=True,
            order=0
        )
        ModulePage.objects.create(
            owner=owner,
            branch=branch,
            created_by=owner,
            module=accounts,
            code='transactions',
            title='Account Transactions',
            page_type='list',
            page_config={
                'list_type': 'transactions',
                'filters': ['date_range', 'account'],
                'actions': ['view', 'repeat']
            },
            show_in_menu=True,
            order=1
        )
        # Additional modules can be created similarly...