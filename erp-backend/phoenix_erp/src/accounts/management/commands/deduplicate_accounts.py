"""
Management command to find and collapse duplicate Account records that share
the same (code, tenant, branch) but were created under different owners or
exist as soft-deleted tombstones alongside an active record.

This is a prerequisite step before applying migration
0010_fix_account_unique_constraint which tightens the unique constraint from
(code, owner, branch) to (code, tenant, branch).

Usage:
    # Preview duplicates (no changes made)
    python manage.py deduplicate_accounts --dry-run

    # Fix all tenants
    python manage.py deduplicate_accounts

    # Fix a specific tenant
    python manage.py deduplicate_accounts --tenant-id=1

HOW IT WORKS:
    For every (code, tenant, branch) group that has more than one row:

    1.  Soft-deleted tombstones are hard-deleted first (they have no active
        transactions and their code slot needs to be freed).

    2.  If multiple ACTIVE (is_deleted=False) rows remain, the canonical row
        is chosen as follows:
            - The row with the most linked transactions, OR
            - If tied, the row with the highest balance, OR
            - If still tied, the row with the smallest id (oldest).

        For each non-canonical duplicate:
            a.  Reassign all ForeignKey references (Transaction.account, etc.)
                from the duplicate to the canonical row.
            b.  Hard-delete the duplicate.

    3.  After merging, the canonical row's owner is updated to the tenant's
        earliest-created user so future runs are consistent.
"""

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
import logging

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Collapse duplicate Account rows (same code+tenant+branch) into one'

    def add_arguments(self, parser):
        parser.add_argument(
            '--tenant-id',
            type=int,
            help='Limit deduplication to a specific tenant ID',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be changed without making any modifications',
        )

    def handle(self, *args, **options):
        from accounts.models import Account
        from users.models import User
        from django.db.models import Count

        tenant_id = options.get('tenant_id')
        dry_run = options.get('dry_run', False)

        if dry_run:
            self.stdout.write(self.style.WARNING('DRY-RUN mode \u2014 no changes will be made.\n'))

        # Find every (code, tenant, branch) group with more than one row (including
        # soft-deleted ones, because a deleted + active pair is also a "duplicate"
        # in the sense that the slot should be occupied by exactly one row).
        dup_groups = (
            Account.all_objects
            .values('code', 'tenant_id', 'branch_id')
            .annotate(cnt=Count('id'))
            .filter(cnt__gt=1)
            .order_by('tenant_id', 'code')
        )

        if tenant_id:
            dup_groups = dup_groups.filter(tenant_id=tenant_id)

        total_groups = dup_groups.count()
        if total_groups == 0:
            self.stdout.write(self.style.SUCCESS(
                '\u2705 No duplicate accounts found. Database is already clean.'
            ))
            return

        self.stdout.write(
            f'Found {total_groups} duplicate group(s) to process.\n'
        )

        deleted_count = 0
        merged_count = 0
        error_count = 0

        for group in dup_groups:
            code = group['code']
            tenant_id_val = group['tenant_id']
            branch_id = group['branch_id']

            rows = list(
                Account.all_objects.filter(
                    code=code,
                    tenant_id=tenant_id_val,
                    branch_id=branch_id,
                ).order_by('is_deleted', 'id')  # non-deleted first, oldest first
            )

            active = [r for r in rows if not r.is_deleted]
            deleted = [r for r in rows if r.is_deleted]

            self.stdout.write(
                f'  code={code} tenant={tenant_id_val} branch={branch_id}: '
                f'{len(active)} active, {len(deleted)} deleted'
            )

            try:
                with transaction.atomic():
                    # 1. Hard-delete soft-deleted tombstones
                    for dead in deleted:
                        if dry_run:
                            self.stdout.write(f'    [dry-run] would hard-delete tombstone id={dead.pk}')
                        else:
                            Account.all_objects.filter(pk=dead.pk).hard_delete()
                            deleted_count += 1
                            self.stdout.write(f'    Hard-deleted tombstone id={dead.pk}')

                    # 2. Collapse multiple active rows into one canonical row
                    if len(active) <= 1:
                        # Normalise owner on the single active row
                        if active and not dry_run:
                            canonical = active[0]
                            canonical_owner = (
                                User.objects.filter(tenant_id=tenant_id_val)
                                .order_by('id').first()
                            )
                            if canonical_owner and canonical.owner_id != canonical_owner.pk:
                                canonical.owner = canonical_owner
                                canonical.save(update_fields=['owner', 'updated_at'])
                        continue

                    # Multiple active rows: pick canonical, merge others into it
                    canonical = self._pick_canonical(active)

                    self.stdout.write(
                        f'    Canonical row: id={canonical.pk} (owner={canonical.owner_id})'
                    )

                    for dup in active:
                        if dup.pk == canonical.pk:
                            continue
                        self.stdout.write(
                            f'    Merging duplicate id={dup.pk} -> canonical id={canonical.pk}'
                        )
                        if not dry_run:
                            self._reassign_references(dup, canonical)
                            Account.all_objects.filter(pk=dup.pk).hard_delete()
                        merged_count += 1

                    # Normalise owner on the canonical row
                    if not dry_run:
                        canonical_owner = (
                            User.objects.filter(tenant_id=tenant_id_val)
                            .order_by('id').first()
                        )
                        if canonical_owner and canonical.owner_id != canonical_owner.pk:
                            canonical.owner = canonical_owner
                            canonical.save(update_fields=['owner', 'updated_at'])

            except Exception as exc:
                error_count += 1
                self.stdout.write(self.style.ERROR(
                    f'    ERROR processing group code={code} tenant={tenant_id_val}: {exc}'
                ))
                logger.exception(
                    'deduplicate_accounts: failed on code=%s tenant=%s: %s',
                    code, tenant_id_val, exc,
                )

        self.stdout.write('\n' + '=' * 70)
        action = '[DRY-RUN] would have' if dry_run else 'Total'
        self.stdout.write(self.style.SUCCESS(
            f'{action} hard-deleted {deleted_count} tombstones and '
            f'merged {merged_count} duplicate active rows. '
            f'Errors: {error_count}'
        ))

        if not dry_run and error_count == 0:
            self.stdout.write(self.style.SUCCESS(
                '\n\u2705 Deduplication complete.  '
                'You may now apply migration 0010_fix_account_unique_constraint.'
            ))
        elif not dry_run:
            self.stdout.write(self.style.WARNING(
                f'\n\u26a0\ufe0f  Completed with {error_count} error(s). '
                'Resolve errors before applying the migration.'
            ))

    # -------------------------------------------------------------------------

    @staticmethod
    def _pick_canonical(active_rows):
        """
        From a list of active (non-deleted) Account instances, return the one
        that should be kept:
          - Most linked transactions (broadest usage)
          - Highest balance as tiebreaker
          - Smallest pk (oldest) as final tiebreaker
        """
        def _score(acct):
            try:
                from accounting.models import TransactionEntry
                tx_count = TransactionEntry.objects.filter(account=acct).count()
            except Exception:
                tx_count = 0
            return (tx_count, float(acct.balance), -acct.pk)

        return max(active_rows, key=_score)

    @staticmethod
    def _reassign_references(from_acct, to_acct):
        """
        Redirect FK references that point to `from_acct` so they point to
        `to_acct` instead, before hard-deleting `from_acct`.
        """
        # Child accounts that list from_acct as their parent
        from accounts.models import Account
        Account.all_objects.filter(parent=from_acct).update(parent=to_acct)

        # Transaction entries (try both common model paths)
        for model_path in [
            ('accounting', 'TransactionEntry', 'account'),
            ('accounts', 'TransactionEntry', 'account'),
            ('ledger', 'LedgerEntry', 'account'),
        ]:
            app_label, model_name, field = model_path
            try:
                from django.apps import apps
                Model = apps.get_model(app_label, model_name)
                Model.objects.filter(**{field: from_acct}).update(**{field: to_acct})
            except (LookupError, Exception):
                pass

        # WorkflowBinding parameters (JSON field — update text-match)
        try:
            from automations.models import WorkflowBinding
            for binding in WorkflowBinding.objects.filter(
                parameters__parent_account_id=from_acct.pk
            ):
                binding.parameters['parent_account_id'] = to_acct.pk
                binding.save(update_fields=['parameters'])
        except Exception:
            pass
