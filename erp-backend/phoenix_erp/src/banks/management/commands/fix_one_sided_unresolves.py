"""
banks/management/commands/fix_one_sided_unresolves.py
=====================================================
One-time (and safely re-runnable) fix for one-sided resolve state:
a bank_only and erp_only exception on the same bank account, same
direction, same amount where one side was resolved standalone (the
plain per-row Resolve action — netted_with=None, pending_bank_payment=None)
while its real counterpart on the same bank account is still sitting
unresolved.

This is the exact production pattern that motivated the two-sided
unresolve fix and BulkCleanUpStrandedPairsView: a director resolved
an erp_only exception with a generic note like "Inter bank" instead
of being Linked to the bank_only line it actually belonged to,
permanently consuming the one valid match and stranding the other
side.

This command:
  1. Finds every standalone-resolved exception (resolved=True,
     netted_with=None, pending_bank_payment=None) that has exactly
     one unresolved counterpart on the same bank account (same
     direction, same resolve_amount, opposite exception_type,
     resolved=False).
  2. Unresolves the resolved side with a system-generated reason,
     freeing both sides to be properly linked via Link/Bulk-Link.
  3. Recomputes DailyReconciliation counts for every affected
     reconciliation.

Safe to re-run — a second pass finds nothing once pairs are consistent.

Usage:
    python manage.py fix_one_sided_unresolves --dry-run
    python manage.py fix_one_sided_unresolves
"""
from __future__ import annotations

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.utils import timezone

OPPOSITE_TYPE = {'bank_only': 'erp_only', 'erp_only': 'bank_only'}


class Command(BaseCommand):
    help = (
        "Fixes one-sided resolve state where a bank_only/erp_only exception "
        "was resolved standalone while its real counterpart is still unresolved."
    )

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='Preview without making changes.')

    def handle(self, *args, **options):
        from banks.models import DailyReconciliation, ReconciliationException
        from banks.reconciliation_utils import recompute_reconciliation_counts

        dry_run = options['dry_run']
        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN — no changes will be saved.\n'))

        system_user = get_user_model().objects.filter(is_superuser=True).first()
        if not system_user:
            self.stdout.write(self.style.ERROR('No superuser found — cannot assign unresolved_by.'))
            return

        # All unresolved bank_only/erp_only exceptions (the "stranded" side).
        # Index by (bank_account_id, direction, resolve_amount, exception_type)
        # for O(1) lookup.
        unresolved_qs = ReconciliationException.objects.filter(
            exception_type__in=('bank_only', 'erp_only'),
            resolved=False,
            netted_with__isnull=True,
        ).select_related('reconciliation')

        unresolved_index: dict[tuple, list] = {}
        for exc in unresolved_qs:
            key = (
                exc.reconciliation.bank_account_id,
                exc.direction,
                exc.resolve_amount,
                exc.exception_type,
            )
            unresolved_index.setdefault(key, []).append(exc)

        # All standalone-resolved exceptions — the "one-sided" side that
        # needs to be unreolved so both sides return to the pool.
        resolved_qs = ReconciliationException.objects.filter(
            exception_type__in=('bank_only', 'erp_only'),
            resolved=True,
            netted_with__isnull=True,
            pending_bank_payment__isnull=True,
        ).select_related('reconciliation')

        fix_count = 0
        touched_recon_ids: set[int] = set()
        now = timezone.now()
        reason = 'Auto-fix: one-sided resolve — counterpart was still unresolved, reopening to allow proper linking'

        for resolved_exc in resolved_qs:
            counterpart_type = OPPOSITE_TYPE.get(resolved_exc.exception_type)
            if not counterpart_type or resolved_exc.resolve_amount is None:
                continue

            key = (
                resolved_exc.reconciliation.bank_account_id,
                resolved_exc.direction,
                resolved_exc.resolve_amount,
                counterpart_type,
            )
            candidates = unresolved_index.get(key, [])
            if len(candidates) != 1:
                # 0 = no counterpart (legitimately standalone) or
                # >1 = ambiguous, leave for manual cleanup
                continue

            unresolved_exc = candidates[0]
            fix_count += 1
            touched_recon_ids.add(resolved_exc.reconciliation_id)
            touched_recon_ids.add(unresolved_exc.reconciliation_id)

            self.stdout.write(
                f'  {"[DRY RUN] " if dry_run else ""}'
                f'unreolving resolved id={resolved_exc.pk} '
                f'({resolved_exc.exception_type} {resolved_exc.resolve_amount}) '
                f'on recon {resolved_exc.reconciliation_id} — '
                f'counterpart: unresolved id={unresolved_exc.pk} '
                f'({unresolved_exc.exception_type})'
            )

            if not dry_run:
                resolved_exc.resolved = False
                resolved_exc.unresolved_by = system_user
                resolved_exc.unresolved_at = now
                resolved_exc.unresolved_reason = reason
                resolved_exc.save(update_fields=[
                    'resolved', 'unresolved_by', 'unresolved_at', 'unresolved_reason',
                ])
                # Remove from index so it's not matched again
                unresolved_index[key] = [c for c in candidates if c.pk != unresolved_exc.pk]

        if fix_count == 0:
            self.stdout.write(self.style.SUCCESS('No one-sided resolves found.'))
        else:
            action = 'Would fix' if dry_run else 'Fixed'
            self.stdout.write(f'\n{action} {fix_count} one-sided resolve(s).')

        # --- recompute counts for every touched reconciliation ---
        if not touched_recon_ids:
            return

        if dry_run:
            self.stdout.write(
                f'\nWould recompute counts for {len(touched_recon_ids)} affected reconciliation(s).'
            )
            return

        self.stdout.write('\nRecomputing counts for affected reconciliations...')
        for recon in DailyReconciliation.objects.filter(id__in=touched_recon_ids).select_related('bank_account'):
            recompute_reconciliation_counts(recon)
            self.stdout.write(
                f'  recon {recon.id} ({recon.bank_account} — {recon.reconciliation_date}): '
                f'total={recon.total_bank_transactions} matched={recon.matched_count} '
                f'unmatched_bank={recon.unmatched_bank_count} unmatched_erp={recon.unmatched_erp_count}'
            )
