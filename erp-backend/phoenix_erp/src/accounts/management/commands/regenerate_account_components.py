"""
Management command to regenerate workflow/form/report components for parent
accounts that are missing them — typically because the post_save signal failed
during a bulk chart-of-accounts seed (UniqueViolation on run_sequence).

Usage:
    python manage.py regenerate_account_components
    python manage.py regenerate_account_components --tenant-id=5
    python manage.py regenerate_account_components --dry-run   # show what would be fixed
"""

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from accounts.models import Account
import logging

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Regenerate missing workflow/form/report components for parent accounts'

    def add_arguments(self, parser):
        parser.add_argument(
            '--tenant-id',
            type=int,
            help='Limit to a specific tenant ID',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Print which accounts need regeneration without making changes',
        )

    def handle(self, *args, **options):
        from automations.models import WorkflowBinding
        from django.db.models import Exists, OuterRef

        tenant_id = options.get('tenant_id')
        dry_run = options.get('dry_run', False)

        # Find all parent accounts
        parent_qs = Account.objects.filter(account_level=Account.LEVEL_PARENT)
        if tenant_id:
            parent_qs = parent_qs.filter(owner__tenant_id=tenant_id)

        # Parent accounts that have NO WorkflowBinding pointing to them.
        # WorkflowBinding.parameters is a JSONField; Django's __ traversal
        # lets us filter on a nested key against an OuterRef PK.
        has_binding = WorkflowBinding.objects.filter(
            parameters__parent_account_id=OuterRef('pk')
        )
        missing_qs = parent_qs.annotate(
            has_binding=Exists(has_binding)
        ).filter(has_binding=False)
        count = missing_qs.count()

        if count == 0:
            self.stdout.write(self.style.SUCCESS(
                '✅ All parent accounts already have workflow components.'
            ))
            return

        self.stdout.write(
            f"Found {count} parent account(s) missing workflow components."
        )

        if dry_run:
            for acct in missing_qs.order_by('code'):
                self.stdout.write(f"  • {acct.code}  {acct.name}  (type={acct.account_type})")
            self.stdout.write(self.style.WARNING(
                '\n⚠️  Dry-run mode — no changes made.'
            ))
            return

        # Import the private helpers from signals
        from accounts.signals import (
            _generate_form_schema,
            _get_or_create_master_workflow,
            _link_account_to_workflow,
            _generate_module_page,
            _create_report_page,
            _ensure_report_allowed_fields,
        )
        from reports.services.generator import ReportGenerator

        success = 0
        errors = 0

        for account in missing_qs.order_by('code'):
            self.stdout.write(f"  Regenerating: {account.code}  {account.name}")
            try:
                with transaction.atomic():
                    form_schema = _generate_form_schema(account)
                    workflow = _get_or_create_master_workflow(account)
                    _link_account_to_workflow(account, workflow, form_schema)

                    module_page = _generate_module_page(account, form_schema)

                    report = ReportGenerator.generate_for_account(
                        account=account,
                        created_by=account.created_by,
                    )
                    if report:
                        _ensure_report_allowed_fields(report)

                    if module_page and report:
                        _create_report_page(account, report, module_page.module)

                self.stdout.write(self.style.SUCCESS(f"    ✅ Done"))
                success += 1

            except Exception as exc:
                errors += 1
                self.stdout.write(self.style.ERROR(f"    ❌ Failed: {exc}"))
                logger.exception(
                    "Failed to regenerate components for account %s: %s",
                    account.code, exc,
                )

        self.stdout.write('\n' + '=' * 60)
        self.stdout.write(self.style.SUCCESS(
            f'SUMMARY: {success} regenerated, {errors} errors out of {count} accounts.'
        ))
