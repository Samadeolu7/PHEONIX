"""
pages/management/commands/backfill_module_tenant.py

Force-sets tenant on every Module/ModulePage row to the single tenant in a
single-tenant deployment — re-runnable, unlike the one-time data migration
this duplicates (pages/migrations/0005_backfill_module_page_tenant.py).

Needed as a repeatable step (not just a one-off migration) because several
things in the catalog-seeding sequence reintroduce tenant=NULL rows after
the migration already ran once:
  - seed_permissions / regenerate_account_components create rows via a bare
    CLI invocation with no request context, so TimeStampedModel.save()'s
    tenant-from-thread-local fallback has nothing to fall back to.
  - fix_module_catalog_duplicates --fix explicitly sets the merged
    canonical module's tenant back to None (its own "global catalog"
    convention, which this deployment has deliberately moved away from).

Safe to run any number of times, including as the final step after
seed_permissions -> fix_module_catalog_duplicates -> regenerate_account_components.

If more than one Tenant row exists (e.g. an unused row left over from
users/migrations/0002_setup_default_tenant.py alongside the real one),
pass --tenant-id or --tenant-slug explicitly rather than guessing.

Usage:
    python manage.py backfill_module_tenant
    python manage.py backfill_module_tenant --tenant-id 1
    python manage.py backfill_module_tenant --tenant-slug mt
"""
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = 'Force-set tenant on every Module/ModulePage row to the single existing tenant.'

    def add_arguments(self, parser):
        parser.add_argument('--tenant-id', type=int, default=None)
        parser.add_argument('--tenant-slug', type=str, default=None)

    def handle(self, *args, **options):
        from pages.models import Module, ModulePage
        from users.models import Tenant

        tenant_id = options.get('tenant_id')
        tenant_slug = options.get('tenant_slug')

        if tenant_id or tenant_slug:
            lookup = {'pk': tenant_id} if tenant_id else {'slug': tenant_slug}
            try:
                tenant = Tenant.objects.get(**lookup)
            except Tenant.DoesNotExist:
                raise CommandError(f'No Tenant matching {lookup}.')
        else:
            tenant_count = Tenant.objects.count()
            if tenant_count != 1:
                existing = ', '.join(f'id={t.id} slug={t.slug!r}' for t in Tenant.objects.all())
                raise CommandError(
                    f'Expected exactly one Tenant, found {tenant_count} ({existing}) — '
                    'refusing to guess. Re-run with --tenant-id or --tenant-slug.'
                )
            tenant = Tenant.objects.get()

        modules_updated = Module.all_objects.all_tenants().update(tenant=tenant)
        pages_updated = ModulePage.all_objects.all_tenants().update(tenant=tenant)

        self.stdout.write(self.style.SUCCESS(
            f'Set tenant={tenant.name!r} (id={tenant.id}, slug={tenant.slug!r}) on '
            f'{modules_updated} Module row(s) and {pages_updated} ModulePage row(s).'
        ))
