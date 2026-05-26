# Create migrations
# python manage.py makemigrations modules automations
# python manage.py migrate

# # Create initial modules via management command
# python manage.py create_default_modules

# Management command: create_default_modules.py
from django.core.management.base import BaseCommand
from django.db.utils import ProgrammingError
from pages.models import Module, ModulePage

class Command(BaseCommand):
    def handle(self, *args, **kwargs):
        try:
            # Create Accounts Module
            accounts_module = Module.objects.create(
                code='accounts',
                name='Accounts',
                icon='wallet',
                color='#10B981',
                order=1
            )
        except ProgrammingError:
            self.stdout.write(self.style.ERROR('Database tables for Module do not exist. Run migrations first: `python manage.py makemigrations` and `python manage.py migrate`.'))
            return
        
        ModulePage.objects.create(
            module=accounts_module,
            code='chart',
            title='Chart of Accounts',
            page_type='list',
            page_config={
                'list_type': 'accounts',
                'columns': ['code', 'name', 'balance'],
                'actions': ['view', 'transactions']
            }
        )
        
        ModulePage.objects.create(
            module=accounts_module,
            code='transactions',
            title='Account Transactions',
            page_type='list',
            page_config={
                'list_type': 'transactions',
                'filters': ['date_range', 'account'],
                'actions': ['view', 'repeat']
            }
        )
        
        # Repeat for other modules...