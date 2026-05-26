"""
users/management/commands/setup_mf_roles.py

Creates (or updates) the 9 standard microfinance roles for a tenant.

Usage
─────
  python manage.py setup_mf_roles                         # default tenant
  python manage.py setup_mf_roles --tenant <tenant_id>    # specific tenant
  python manage.py setup_mf_roles --tenant <tenant_id> --dry-run

Role matrix
───────────
  Role               Scope            Approval Limit   Notes
  ─────────────────  ───────────────  ───────────────  ─────────────────────────────
  MD / CEO           global           unlimited         All flags
  Operations Manager global           10,000,000        All flags
  Branch Manager     own_branch       5,000,000         All flags
  Loan Officer       assigned_clients 500,000           No delete; can approve loans
  Recovery Officer   own_branch       0                 View + post repayments only
  Teller / Cashier   own_branch       0                 Create + edit, no approve
  Accountant         own_branch       0                 Full GL; no approve
  Auditor            global           0                 VIEW ONLY — all else False
  Data Entry Clerk   own_branch       0                 Create + edit; no approve/delete
"""

from decimal import Decimal
from django.core.management.base import BaseCommand, CommandError
from users.models import Tenant, Role


ROLE_DEFINITIONS = [
    {
        'name': 'MD / CEO',
        'description': 'Managing Director / Chief Executive Officer — full system access.',
        'default_scope': 'global',
        'default_approval_limit': None,  # unlimited
        'permission_codes': ['*'],
        'excluded_permission_codes': [],
    },
    {
        'name': 'Operations Manager',
        'description': 'Oversees day-to-day operations across all branches.',
        'default_scope': 'global',
        'default_approval_limit': Decimal('10000000.00'),
        'permission_codes': ['*'],
        'excluded_permission_codes': [],
    },
    {
        'name': 'Branch Manager',
        'description': 'Manages a single branch — full access within branch scope.',
        'default_scope': 'own_branch',
        'default_approval_limit': Decimal('5000000.00'),
        'permission_codes': ['*'],
        'excluded_permission_codes': [],
    },
    {
        'name': 'Loan Officer',
        'description': 'Originates and manages loans for assigned clients.',
        'default_scope': 'assigned_clients',
        'default_approval_limit': Decimal('500000.00'),
        'permission_codes': [
            'loan-list', 'loan-view', 'loan-create', 'loan-edit', 'loan-approve',
            'client-list', 'client-view', 'client-create', 'client-edit',
            'repayment-list', 'repayment-view', 'repayment-create',
            'collateral-list', 'collateral-view', 'collateral-create', 'collateral-edit',
            'disbursement-list', 'disbursement-view', 'disbursement-create',
        ],
        'excluded_permission_codes': ['loan-delete', 'client-delete'],
    },
    {
        'name': 'Recovery Officer',
        'description': 'Handles collections and repayments for delinquent accounts.',
        'default_scope': 'own_branch',
        'default_approval_limit': Decimal('0.00'),
        'permission_codes': [
            'loan-list', 'loan-view',
            'client-list', 'client-view',
            'repayment-list', 'repayment-view', 'repayment-create',
            'collection-list', 'collection-view', 'collection-create',
        ],
        'excluded_permission_codes': [
            'loan-create', 'loan-edit', 'loan-delete', 'loan-approve',
        ],
    },
    {
        'name': 'Teller / Cashier',
        'description': 'Processes cash transactions, deposits and withdrawals.',
        'default_scope': 'own_branch',
        'default_approval_limit': Decimal('0.00'),
        'permission_codes': [
            'transaction-list', 'transaction-view', 'transaction-create', 'transaction-edit',
            'savings-list', 'savings-view', 'savings-deposit', 'savings-withdrawal',
            'cash-management-list', 'cash-management-view', 'cash-management-create',
        ],
        'excluded_permission_codes': [
            'transaction-delete', 'transaction-approve',
            'savings-delete',
        ],
    },
    {
        'name': 'Accountant',
        'description': 'Full GL access within branch; no financial approval rights.',
        'default_scope': 'own_branch',
        'default_approval_limit': Decimal('0.00'),
        'permission_codes': [
            'account-list', 'account-view', 'account-create', 'account-edit',
            'transaction-list', 'transaction-view', 'transaction-create', 'transaction-edit',
            'report-list', 'report-view', 'report-export',
            'budget-list', 'budget-view', 'budget-create', 'budget-edit',
            'expense-list', 'expense-view', 'expense-create', 'expense-edit',
            'income-list', 'income-view', 'income-create',
        ],
        'excluded_permission_codes': [
            'account-delete', 'transaction-approve', 'expense-approve',
        ],
    },
    {
        'name': 'Auditor',
        'description': 'Read-only access to everything across all branches.',
        'default_scope': 'global',
        'default_approval_limit': Decimal('0.00'),
        # Auditor gets only view/export codes — no write permissions
        'permission_codes': [
            'loan-list', 'loan-view',
            'client-list', 'client-view',
            'account-list', 'account-view',
            'transaction-list', 'transaction-view',
            'report-list', 'report-view', 'report-export',
            'expense-list', 'expense-view',
            'repayment-list', 'repayment-view',
            'permissions-view-exceptions', 'permissions-view-elevation-log',
            'hr-list', 'hr-view',
            'inventory-list', 'inventory-view',
            'procurement-list', 'procurement-view',
        ],
        'excluded_permission_codes': [
            # Explicitly deny any write operations even if accidentally granted
            'loan-create', 'loan-edit', 'loan-delete', 'loan-approve',
            'client-create', 'client-edit', 'client-delete',
            'account-create', 'account-edit', 'account-delete',
            'transaction-create', 'transaction-edit', 'transaction-delete', 'transaction-approve',
            'expense-create', 'expense-edit', 'expense-delete', 'expense-approve',
        ],
    },
    {
        'name': 'Data Entry Clerk',
        'description': 'Creates and edits records within own branch; no approvals.',
        'default_scope': 'own_branch',
        'default_approval_limit': Decimal('0.00'),
        'permission_codes': [
            'client-list', 'client-view', 'client-create', 'client-edit',
            'loan-list', 'loan-view', 'loan-create', 'loan-edit',
            'repayment-list', 'repayment-view', 'repayment-create',
            'transaction-list', 'transaction-view', 'transaction-create',
        ],
        'excluded_permission_codes': [
            'client-delete', 'loan-delete', 'loan-approve',
            'transaction-approve', 'transaction-delete',
        ],
    },
]


class Command(BaseCommand):
    help = 'Create or update the 9 standard microfinance roles for a tenant.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--tenant', type=int, default=None,
            help='Tenant ID to set up roles for (default: first tenant found).',
        )
        parser.add_argument(
            '--dry-run', action='store_true', default=False,
            help='Print what would be done without saving.',
        )

    def handle(self, *args, **options):
        tenant_id = options['tenant']
        dry_run   = options['dry_run']

        if tenant_id:
            try:
                tenant = Tenant.objects.get(pk=tenant_id)
            except Tenant.DoesNotExist:
                raise CommandError(f'Tenant with id={tenant_id} does not exist.')
        else:
            tenant = Tenant.objects.first()
            if not tenant:
                raise CommandError('No tenants found. Create a tenant first.')

        self.stdout.write(
            self.style.MIGRATE_HEADING(
                f'{"[DRY RUN] " if dry_run else ""}Setting up MF roles for tenant: {tenant}'
            )
        )

        created_count = 0
        updated_count = 0

        for defn in ROLE_DEFINITIONS:
            role, created = Role.objects.get_or_create(
                tenant=tenant,
                name=defn['name'],
                defaults={
                    'description':            defn['description'],
                    'default_scope':          defn['default_scope'],
                    'default_approval_limit': defn['default_approval_limit'],
                    'permission_codes':       defn['permission_codes'],
                    'excluded_permission_codes': defn['excluded_permission_codes'],
                    'is_active': True,
                },
            )

            if created:
                action_str = self.style.SUCCESS('CREATED')
                created_count += 1
            else:
                # Update the scope / limit / codes if they changed
                changed = False
                for field in ('description', 'default_scope', 'default_approval_limit',
                              'permission_codes', 'excluded_permission_codes'):
                    if getattr(role, field) != defn[field]:
                        setattr(role, field, defn[field])
                        changed = True
                if changed:
                    action_str = self.style.WARNING('UPDATED')
                    updated_count += 1
                else:
                    action_str = '  OK   '

            scope_display = defn['default_scope']
            limit_display = str(defn['default_approval_limit']) if defn['default_approval_limit'] is not None else 'unlimited'
            self.stdout.write(
                f'  {action_str}  {defn["name"]:<25} scope={scope_display:<18} limit={limit_display}'
            )

            if not dry_run and not created:
                if changed:
                    role.save()

        if not dry_run:
            self.stdout.write(self.style.SUCCESS(
                f'\nDone. Created: {created_count}, Updated: {updated_count}.'
            ))
        else:
            self.stdout.write(self.style.WARNING('\n[DRY RUN] No changes saved.'))
