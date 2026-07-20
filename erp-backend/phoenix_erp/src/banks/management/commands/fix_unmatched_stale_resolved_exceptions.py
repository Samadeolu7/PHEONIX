"""
banks/management/commands/fix_unmatched_stale_resolved_exceptions.py
====================================================================
One-time (and safely re-runnable) fix for exceptions left in a stale
resolved state after a director unmatch-ed a bank transaction.

The bug: ReconciliationBankTransaction.unmatch() called
get_or_create_bank_only_exception() which used get_or_create but never
reopened an already-resolved row, AND it never touched the erp_only
exception for the matched ERP payment.  Result: after unmatch, both
the bank_only and erp_only exceptions stayed resolved=True while the
bank line sat unmatched — invisible to LinkCandidatesView (which
filters resolved=False).

This command:
  1. Finds every ReconciliationBankTransaction where matched=False
     but matched_erp_payment_id is NOT NULL (was matched, now
     unmatched — the unmatch action).
  2. Reopens any still-resolved bank_only exception for that bank
     transaction.
  3. Reopens any still-resolved erp_only exception for the ERP
     payment the line was matched to.
  4. Recomputes DailyReconciliation counts for every affected
     reconciliation.

Safe to re-run — a second pass finds nothing once exceptions are
consistent.

Usage:
    python manage.py fix_unmatched_stale_resolved_exceptions --dry-run
    python manage.py fix_unmatched_stale_resolved_exceptions
"""
from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db.models import Q


class Command(BaseCommand):
    help = (
        "Reopens bank_only and erp_only exceptions that stayed resolved after "
        "a director unmatch-ed a bank transaction (stale resolved state)."
    )

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='Preview without making changes.')

    def handle(self, *args, **options):
        from banks.models import DailyReconciliation, ReconciliationBankTransaction, ReconciliationException
        from banks.reconciliation_utils import recompute_reconciliation_counts

        dry_run = options['dry_run']
        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN — no changes will be saved.\n'))

        # All unmatched bank transactions that WERE matched (have a
        # matched_erp_payment_id).  These are the ones that went through
        # the old buggy unmatch path.
        stale_txs = ReconciliationBankTransaction.objects.filter(
            matched=False,
            matched_erp_payment_id__isnull=False,
        ).select_related('bank_account')

        fix_count = 0
        touched_recon_ids: set[int] = set()

        for tx in stale_txs:
            # Find the reconciliation for this bank line's date
            recon = DailyReconciliation.objects.filter(
                bank_account=tx.bank_account,
                reconciliation_date=tx.value_date,
            ).first()
            if recon is None:
                continue

            tx_fixed = False

            # 1. Reopen bank_only exception for this bank transaction
            bank_exc = ReconciliationException.objects.filter(
                reconciliation=recon,
                exception_type='bank_only',
                bank_transaction_id=tx.id,
                resolved=True,
            ).first()
            if bank_exc:
                fix_count += 1
                tx_fixed = True
                self.stdout.write(
                    f'  {"[DRY RUN] " if dry_run else ""}'
                    f'reopening bank_only exception id={bank_exc.pk} '
                    f'({bank_exc.bank_amount}) on recon {recon.id} — '
                    f'bank tx {tx.id} was unmatched'
                )
                if not dry_run:
                    bank_exc.resolved = False
                    bank_exc.save(update_fields=['resolved'])

            # 2. Reopen erp_only exception for the ERP payment
            erp_exc = ReconciliationException.objects.filter(
                reconciliation__bank_account=tx.bank_account,
                exception_type='erp_only',
                loan_payment_id=tx.matched_erp_payment_id,
                resolved=True,
            ).first()
            if erp_exc:
                fix_count += 1
                tx_fixed = True
                self.stdout.write(
                    f'  {"[DRY RUN] " if dry_run else ""}'
                    f'reopening erp_only exception id={erp_exc.pk} '
                    f'({erp_exc.erp_amount}) on recon {erp_exc.reconciliation_id} — '
                    f'bank tx {tx.id} was unmatched'
                )
                if not dry_run:
                    erp_exc.resolved = False
                    erp_exc.save(update_fields=['resolved'])
                    touched_recon_ids.add(erp_exc.reconciliation_id)

            if tx_fixed:
                touched_recon_ids.add(recon.id)

        if fix_count == 0:
            self.stdout.write(self.style.SUCCESS('No stale resolved exceptions found.'))
        else:
            action = 'Would fix' if dry_run else 'Fixed'
            self.stdout.write(f'\n{action} {fix_count} stale resolved exception(s).')

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
