"""
management/commands/fix_null_branch_records.py

Finds every record stored without a branch (branch=NULL) for models that
represent configuration / reference data and assigns them the correct branch.

Run in dry-run mode first to see what would be changed:
    python manage.py fix_null_branch_records --dry-run

Then apply:
    python manage.py fix_null_branch_records --tenant <slug-or-pk>

If only one tenant exists, --tenant is optional.
"""
from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction


# Models to audit/fix.  Each entry: (app_label.ModelName, description)
_TARGETS = [
    ('incomes.FeeStructure',          'Fee structures'),
    ('loans.LoanProduct',             'Loan products'),
    ('savings.SavingsProduct',        'Savings products'),
    ('clients.ClientClassification',  'Client classifications'),
    ('incomes.ServiceItem',           'Service items'),
    ('incomes.IncomeCategory',        'Income categories'),
]


def _get_model(dotted):
    from django.apps import apps
    app_label, model_name = dotted.split('.')
    return apps.get_model(app_label, model_name)


class Command(BaseCommand):
    help = 'Report and optionally fix records that have branch=NULL on config/reference models'

    def add_arguments(self, parser):
        parser.add_argument(
            '--tenant',
            default=None,
            help='Tenant slug or PK to target (optional when only one tenant exists)',
        )
        parser.add_argument(
            '--branch',
            default=None,
            help='Branch PK to assign (optional — defaults to the first branch of the tenant)',
        )
        parser.add_argument(
            '--dry-run', action='store_true',
            help='Print what would change without writing to the database',
        )

    def handle(self, *args, **options):
        from users.models import Tenant
        from branches.models import Branch

        dry = options['dry_run']

        # ── Resolve tenant ─────────────────────────────────────────────────────
        tenant_arg = options.get('tenant')
        if tenant_arg:
            try:
                tenant = Tenant.objects.get(pk=int(tenant_arg))
            except (ValueError, Tenant.DoesNotExist):
                tenant = Tenant.objects.filter(slug=tenant_arg).first()
            if not tenant:
                raise CommandError(f'Tenant {tenant_arg!r} not found.')
        else:
            tenants = Tenant.objects.all()
            if tenants.count() == 1:
                tenant = tenants.first()
            else:
                raise CommandError(
                    'Multiple tenants found. Pass --tenant <slug-or-pk> to choose one.\n'
                    'Available: ' + ', '.join(f'{t.pk}:{t.slug}' for t in tenants)
                )

        self.stdout.write(f'Tenant: {tenant} (pk={tenant.pk})')

        # ── Resolve branch ─────────────────────────────────────────────────────
        branch_arg = options.get('branch')
        if branch_arg:
            try:
                branch = Branch.objects.get(pk=int(branch_arg), tenant=tenant)
            except (ValueError, Branch.DoesNotExist):
                raise CommandError(f'Branch pk={branch_arg} not found under tenant {tenant}.')
        else:
            branch = Branch.objects.filter(tenant=tenant, is_deleted=False).order_by('pk').first()
            if not branch:
                raise CommandError(f'No branches found for tenant {tenant}.')

        self.stdout.write(f'Branch to assign: {branch} (pk={branch.pk})')
        if dry:
            self.stdout.write(self.style.WARNING('DRY RUN — no changes will be written.\n'))

        total_fixed = 0

        for model_path, label in _TARGETS:
            try:
                model = _get_model(model_path)
            except LookupError:
                self.stdout.write(f'  {label}: model {model_path!r} not found — skipped')
                continue

            field_names = {f.name for f in model._meta.get_fields()}
            if 'branch' not in field_names:
                self.stdout.write(f'  {label}: no branch field — skipped')
                continue

            # Build filter: tenant-scoped OR tenant field missing
            qs_kwargs = {'branch__isnull': True}
            if 'tenant' in field_names:
                qs_kwargs['tenant'] = tenant

            try:
                qs = model.objects.filter(**qs_kwargs)
                if hasattr(qs, 'filter'):
                    # Exclude soft-deleted if the model has is_deleted
                    if 'is_deleted' in field_names:
                        qs = qs.filter(is_deleted=False)

                count = qs.count()
            except Exception as exc:
                self.stdout.write(f'  {label}: query failed — {exc}')
                continue

            if count == 0:
                self.stdout.write(f'  {label}: all records have a branch assigned ✓')
                continue

            self.stdout.write(
                self.style.WARNING(f'  {label}: {count} record(s) with branch=NULL')
            )

            if not dry:
                try:
                    with transaction.atomic():
                        updated = qs.update(branch=branch)
                    self.stdout.write(
                        self.style.SUCCESS(f'    → assigned branch {branch.pk} to {updated} record(s)')
                    )
                    total_fixed += updated
                except Exception as exc:
                    self.stdout.write(self.style.ERROR(f'    → update failed: {exc}'))
            else:
                # Show first few examples
                for obj in qs[:5]:
                    name = getattr(obj, 'name', None) or str(obj)
                    self.stdout.write(f'    would fix: {name} (pk={obj.pk})')
                if count > 5:
                    self.stdout.write(f'    ... and {count - 5} more')

        if dry:
            self.stdout.write('\nRe-run without --dry-run to apply changes.')
        else:
            self.stdout.write(self.style.SUCCESS(f'\nDone. Total records fixed: {total_fixed}'))
