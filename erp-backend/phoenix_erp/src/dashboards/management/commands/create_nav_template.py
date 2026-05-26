from django.core.management.base import BaseCommand, CommandError
from django.utils.text import slugify
from dashboards.models import Dashboard, Widget
from users.models import User
from branches.models import Branch
import uuid

class Command(BaseCommand):
    help = 'Creates a navigation bar dashboard template'

    def add_arguments(self, parser):
        parser.add_argument('--owner', type=int, help='User ID of the owner (required)')
        parser.add_argument('--branch', type=int, help='Branch ID (optional)')

    def handle(self, *args, **options):
        if not options.get('owner'):
            raise CommandError('--owner parameter is required')

        try:
            owner = User.objects.get(id=options['owner'])
        except User.DoesNotExist:
            raise CommandError(f'User with ID {options["owner"]} does not exist')

        branch = None
        if options.get('branch'):
            try:
                branch = Branch.objects.get(id=options['branch'])
            except Branch.DoesNotExist:
                raise CommandError(f'Branch with ID {options["branch"]} does not exist')

        # Create navigation links
        nav_links = [
            {'label': 'Dashboard', 'url': '/dashboard', 'icon': 'dashboard'},
            {'label': 'Accounting', 'url': '/accounting', 'icon': 'account_balance'},
            {'label': 'Clients', 'url': '/clients', 'icon': 'people'},
            {'label': 'Expenses', 'url': '/expenses', 'icon': 'receipt'},
            {'label': 'Income', 'url': '/income', 'icon': 'trending_up'},
            {'label': 'Reports', 'url': '/reports', 'icon': 'assessment'},
            {'label': 'Settings', 'url': '/settings', 'icon': 'settings'},
        ]

        # Create the dashboard
        dashboard = Dashboard.objects.create(
            name='Navigation Template',
            slug=f'nav-template-{slugify(str(uuid.uuid4())[:8])}',
            description='A template dashboard with a navigation bar',
            is_default=False,
            owner=owner,
            created_by=owner,
            branch=branch
        )

        # Create the navigation widget
        nav_widget = Widget.objects.create(
            dashboard=dashboard,
            widget_type='navigation',
            instance_key=f'nav-{uuid.uuid4()}',
            config={
                'title': 'Main Navigation',
                'description': 'Main application navigation',
                'items': nav_links,
                'orientation': 'vertical',
                'variant': 'menu',
                'style': {
                    'backgroundColor': '#ffffff',
                    'color': '#2c3e50',
                    'width': '100%'
                }
            },
            layout_x=0,
            layout_y=0,
            layout_w=12,  # Full width
            layout_h=2    # Short height for nav bar
        )

        # Create some quick access link widgets
        quick_links = [
            {
                'title': 'Create Invoice',
                'url': '/accounting/invoices/new',
                'icon': 'add_circle',
                'variant': 'button',
                'style': {
                    'backgroundColor': '#1a73e8',
                    'color': '#ffffff',
                    'borderRadius': '8px'
                }
            },
            {
                'title': 'Add Expense',
                'url': '/expenses/new',
                'icon': 'add_circle',
                'variant': 'button',
                'style': {
                    'backgroundColor': '#34a853',
                    'color': '#ffffff',
                    'borderRadius': '8px'
                }
            },
            {
                'title': 'New Client',
                'url': '/clients/new',
                'icon': 'person_add',
                'variant': 'button',
                'style': {
                    'backgroundColor': '#ea4335',
                    'color': '#ffffff',
                    'borderRadius': '8px'
                }
            }
        ]

        for i, link in enumerate(quick_links):
            Widget.objects.create(
                dashboard=dashboard,
                widget_type='link',
                instance_key=f'quick-link-{uuid.uuid4()}',
                config={
                    'title': link['title'],
                    'url': link['url'],
                    'icon': link['icon'],
                    'variant': link['variant'],
                    'style': link['style']
                },
                layout_x=i * 4,  # Place them side by side
                layout_y=2,      # Below the navigation
                layout_w=4,      # Each takes 1/3 of the width
                layout_h=1       # Small height for buttons
            )

        self.stdout.write(
            self.style.SUCCESS(
                f'Successfully created navigation template dashboard with ID {dashboard.id}'
            )
        )