from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.db import transaction

from pages.models import Module, ModulePage


class Command(BaseCommand):
    help = 'Create Treasury module and Petty Cash ModulePage (if missing)'

    def add_arguments(self, parser):
        parser.add_argument('--owner-email', type=str, required=True, help='Owner user email')
        parser.add_argument('--branch-id', type=int, required=False, help='Branch id (optional)')

    def handle(self, *args, **options):
        User = get_user_model()
        try:
            owner = User.objects.get(email=options['owner_email'])
        except User.DoesNotExist:
            self.stderr.write(self.style.ERROR(f"User not found: {options['owner_email']}"))
            return

        branch_id = options.get('branch_id')

        with transaction.atomic():
            module, created = Module.objects.get_or_create(
                owner=owner,
                branch_id=branch_id,
                code='treasury',
                defaults={
                    'name': 'Treasury',
                    'description': 'Cash & treasury management',
                    'icon': 'dollar-sign',
                    'color': '#0ea5a4',
                    'order': 20,
                    'is_active': True,
                }
            )

            if created:
                self.stdout.write(self.style.SUCCESS('Created Module: treasury'))
            else:
                self.stdout.write('Module treasury already exists')

            # Create ModulePage for petty-cash
            page_defaults = {
                'title': 'Petty Cash',
                'description': 'Manage petty cash funds, vouchers, and replenishments',
                'icon': 'credit-card',
                'page_type': 'dashboard',
                'page_config': {
                    'widgets': [
                        {'type': 'quick_actions'},
                        {'type': 'recent_items'},
                        {'type': 'account_summary'},
                    ]
                },
                'show_in_menu': True,
                'is_active': True,
                'order': 10,
            }

            page, pcreated = ModulePage.objects.get_or_create(
                owner=owner,
                branch_id=branch_id,
                module=module,
                code='petty-cash',
                defaults=page_defaults,
            )

            if pcreated:
                self.stdout.write(self.style.SUCCESS('Created ModulePage: /treasury/petty-cash/'))
            else:
                self.stdout.write('ModulePage /treasury/petty-cash/ already exists')

            self.stdout.write(self.style.SUCCESS('Done'))
