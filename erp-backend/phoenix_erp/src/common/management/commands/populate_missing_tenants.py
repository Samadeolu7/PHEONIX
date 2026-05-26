from django.core.management.base import BaseCommand, CommandError
from django.apps import apps
from django.db import transaction, IntegrityError
from django.conf import settings
from django.utils.module_loading import import_string

from common.managers import set_current_tenant, get_current_tenant


class Command(BaseCommand):
    help = (
        "Populate NULL tenant fields across models that define a 'tenant' ForeignKey. "
        "Use --tenant-id to set the tenant. Supports --apps (comma-separated app labels), "
        "--dry-run and --batch-size."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--tenant-id', type=int, required=True,
            help='ID of the Tenant to assign to NULL tenant fields'
        )
        parser.add_argument(
            '--apps', type=str, required=False,
            help='Comma-separated list of app labels to target (e.g. accounts,expenses). Defaults to all installed apps.'
        )
        parser.add_argument(
            '--dry-run', action='store_true', help='Show what would be updated without making changes.'
        )
        parser.add_argument(
            '--batch-size', type=int, default=1000, help='Batch size for per-object fallback updates.'
        )

    def handle(self, *args, **options):
        tenant_id = options.get('tenant_id')
        apps_arg = options.get('apps')
        dry_run = options.get('dry_run')
        batch_size = options.get('batch_size') or 1000

        # Resolve Tenant lazily to avoid circular imports when command loaded
        try:
            Tenant = apps.get_model('users', 'Tenant')
        except LookupError:
            raise CommandError('Could not find users.Tenant model')

        try:
            tenant = Tenant.objects.get(pk=tenant_id)
        except Tenant.DoesNotExist:
            raise CommandError(f'Tenant with id={tenant_id} does not exist')

        # Build app list
        if apps_arg:
            target_apps = [a.strip() for a in apps_arg.split(',') if a.strip()]
        else:
            target_apps = [app_config.label for app_config in apps.get_app_configs()]

        self.stdout.write(self.style.NOTICE(f"Populating tenant={tenant} for apps: {', '.join(target_apps)}"))

        original_tenant = get_current_tenant()

        summary = {
            'models_checked': 0,
            'models_updated': 0,
            'total_updated': 0,
            'failures': 0,
        }

        for app_label in target_apps:
            try:
                app_config = apps.get_app_config(app_label)
            except LookupError:
                # skip unknown app labels
                continue

            for model in app_config.get_models():
                # Only consider concrete models that declare a tenant field
                model_meta = getattr(model, '_meta', None)
                if not model_meta:
                    continue

                tenant_field = None
                for f in model_meta.fields:
                    if f.name == 'tenant':
                        tenant_field = f
                        break
                if not tenant_field:
                    continue

                summary['models_checked'] += 1
                model_label = f"{model._meta.app_label}.{model._meta.object_name}"
                self.stdout.write(f"\nChecking model: {model_label}")

                # Disable tenant scoping in managers by clearing thread-local tenant
                set_current_tenant(None)

                qs = model.objects.filter(tenant__isnull=True)
                try:
                    total = qs.count()
                except Exception:
                    total = 0

                if total == 0:
                    self.stdout.write(self.style.SUCCESS(f"  No NULL tenant rows (0)"))
                    continue

                self.stdout.write(self.style.WARNING(f"  Found {total} rows with NULL tenant"))

                if dry_run:
                    summary['models_updated'] += 1
                    summary['total_updated'] += total
                    continue

                # Try bulk update first for speed
                try:
                    with transaction.atomic():
                        updated = qs.update(tenant=tenant)
                    self.stdout.write(self.style.SUCCESS(f"  Bulk-updated {updated} rows"))
                    summary['models_updated'] += 1
                    summary['total_updated'] += updated
                    continue
                except IntegrityError as ie:
                    # Bulk update violated constraints for this model; fall back to per-object
                    self.stdout.write(self.style.ERROR(f"  Bulk update failed due to IntegrityError: {ie}. Falling back to per-object updates."))

                # Per-object fallback (batched)
                failures = []
                processed = 0
                qs_iter = qs.iterator()
                batch = []
                for obj in qs_iter:
                    batch.append(obj)
                    if len(batch) >= batch_size:
                        for o in batch:
                            try:
                                with transaction.atomic():
                                    o.tenant = tenant
                                    o.save()
                                    processed += 1
                            except Exception as ex:
                                failures.append((o.pk, str(ex)))
                        batch = []

                # remaining
                for o in batch:
                    try:
                        with transaction.atomic():
                            o.tenant = tenant
                            o.save()
                            processed += 1
                    except Exception as ex:
                        failures.append((o.pk, str(ex)))

                self.stdout.write(self.style.SUCCESS(f"  Per-object updated: {processed}"))
                if failures:
                    self.stdout.write(self.style.ERROR(f"  Failures: {len(failures)} (first 5 shown)"))
                    for pk, err in failures[:5]:
                        self.stdout.write(f"    pk={pk} error={err}")

                summary['models_updated'] += 1
                summary['total_updated'] += processed
                summary['failures'] += len(failures)

        # restore original tenant
        set_current_tenant(original_tenant)

        self.stdout.write(self.style.NOTICE('\nSummary:'))
        self.stdout.write(f"  Models checked: {summary['models_checked']}")
        self.stdout.write(f"  Models updated: {summary['models_updated']}")
        self.stdout.write(f"  Total rows updated: {summary['total_updated']}")
        self.stdout.write(f"  Total failures: {summary['failures']}")

        if summary['failures']:
            self.stdout.write(self.style.WARNING('Some records failed to update. Inspect logs and re-run with narrower --apps or debug those models.'))
