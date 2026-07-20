"""
banks/management/commands/fix_one_sided_unresolves.py
=====================================================
One-time (and safely re-runnable) fix for one-sided unresolve state:
a bank_only and erp_only exception on the same bank account, same
direction, same amount where one side was resolved standalone and then
unresolved (resolved=False, unresolved_at set) while the other side
is still sitting resolved (resolved=True, netted_with=None,
pending_bank_payment=None).

This happens when a director unresolves one side of a pair without
the two-sided logic (added in ReconciliationException.unresolve()),
leaving the counterpart still resolved and unable to be linked.

This command:
  1. Finds every still-resolved standalone exception (netted_with=None,
     pending_bank_payment=None) that has an unreolved counterpart on the
     same bank account (same direction, same resolve_amount, opposite
     exception_type, resolved=False, unresolved_at set).
  2. Unresolves the still-resolved counterpart with a system-generated
     reason, matching the two-sided unresolve behavior.
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
from django.db import transaction as db_transaction
from django.utils import timezone

OPPOSITE_TYPE = {'bank_only': 'erp_only', 'erp_only': 'bank_only'}


class Command(BaseCommand):
    help = (
        "Fixes one-sided unresolve state where one side of a bank_only/erp_only "
        "pair was unreolved but the counterpart is still resolved standalone."
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

        # All unresolved standalone exceptions (the "good" side that was
        # already reopened). Group by bank account for efficient pairing.
        unreolved_qs = ReconciliationException.objects.filter(
            exception_type__in=('bank_only', 'erp_only'),
            resolved=False,
            unresolved_at__isnull=False,
            netted_with__isnull=True,
            pending_bank_payment__isnull=True,
        ).select_related('reconciliation')

        # All still-resolved standalone exceptions (the "stranded" side).
        resolved_qs = ReconciliationException.objects.filter(
            exception_type__in=('bank_only', 'erp_only'),
            resolved=True,
            netted_with__isnull=True,
            pending_bank_payment__isnull=True,
        ).select_related('reconciliation')

        # Index resolved exceptions by (bank_account_id, direction, resolve_amount, exception_type)
        resolved_index: dict[tuple, list] = {}
        for exc in resolved_qs:
            key = (
                exc.reconciliation.bank_account_id,
                exc.direction,
                exc.resolve_amount,
                exc.exception_type,
            )
            resolved_index.setdefault(key, []).append(exc)

        fix_count = 0
        touched_recon_ids: set[int] = set()
        now = timezone.now()
        reason = 'Auto-fix: one-sided unresolve — counterpart was still resolved standalone'

        for unreolved_exc in unreolved_qs:
            counterpart_type = OPPOSITE_TYPE.get(unreolved_exc.exception_type)
            if not counterpart_type or unreolved_exc.resolve_amount is None:
                continue

            key = (
                unreolved_exc.reconciliation.bank_account_id,
                unreolved_exc.direction,
                unreolved_exc.resolve_amount,
                counterpart_type,
            )
            candidates = resolved_index.get(key, [])
            if len(candidates) != 1:
                continue

            resolved_exc = candidates[0]
            fix_count += 1
            touched_recon_ids.add(unreolved_exc.reconciliation_id)
            touched_recon_ids.add(resolved_exc.reconciliation_id)

            self.stdout.write(
                f'  {"[DRY RUN] " if dry_run else ""}'
                f'unreolving resolved exception id={resolved_exc.pk} '
                f'({resolved_exc.exception_type} {resolved_exc.resolve_amount}) '
                f'on recon {resolved_exc.reconciliation_id} — '
                f'counterpart of unreolved id={unreolved_exc.pk}'
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
                resolved_index[key] = [c for c in candidates if c.pk != resolved_exc.pk]

        if fix_count == 0:
            self.stdout.write(self.style.SUCCESS('No one-sided unresolves found.'))
        else:
            action = 'Would fix' if dry_run else 'Fixed'
            self.stdout.write(f'\n{action} {fix_count} one-sided unresolve(s).')

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
