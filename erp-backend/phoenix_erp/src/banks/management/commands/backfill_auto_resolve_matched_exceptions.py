"""
banks/management/commands/backfill_auto_resolve_matched_exceptions.py
================================================================
One-time (and safely re-runnable) backfill for bank_only/erp_only
exceptions whose underlying bank line / ERP payment turns out to already
be matched — a phantom exception born from a cross-reconciliation race:
two dates' reconciliation windows commonly overlap
(±RECONCILIATION_MATCH_WINDOW_DAYS), so one date's run can successfully
match a bank line/ERP payment while a DIFFERENT date's run — running
concurrently, or simply later, against a slightly stale
exclude_payment_ids snapshot taken at the start of ITS OWN run — reports
that same payment as unmatched and creates an exception for it. The
existing auto-resolve step in _persist_outcome (banks/tasks.py) only
catches exceptions that existed BEFORE a match was found in the SAME run;
it has no way to reach back and fix one created by a different, later run.

_persist_outcome now guards against this going forward (re-checks live
match state immediately before persisting a new exception, right where it
used to trust the run's own stale snapshot). This command is the one-time
catch-up for exceptions created before that fix — confirmed on production
via a batch of loan-disbursement erp_only exceptions whose own
Transaction was already matched to a bank line, sometimes for days,
while the exception itself sat unresolved.

Usage:
    python manage.py backfill_auto_resolve_matched_exceptions --dry-run
    python manage.py backfill_auto_resolve_matched_exceptions
"""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = (
        "Auto-resolves bank_only/erp_only exceptions whose underlying bank line "
        "or ERP payment is already matched elsewhere — phantom exceptions born "
        "from a cross-reconciliation race between overlapping match windows."
    )

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='Preview without making changes.')

    def handle(self, *args, **options):
        from django.utils import timezone

        from banks.models import DailyReconciliation, ReconciliationBankTransaction, ReconciliationException
        from banks.reconciliation_utils import recompute_reconciliation_counts
        from banks.tasks import AUTO_RESOLVE_NOTE

        dry_run = options['dry_run']
        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN — no changes will be saved.\n'))

        now = timezone.now()
        touched_recon_ids = set()
        resolved_count = 0

        matched_bank_tx_ids = set(
            ReconciliationBankTransaction.objects.filter(matched=True).values_list('id', flat=True)
        )
        bank_only_qs = ReconciliationException.objects.filter(
            exception_type='bank_only', resolved=False, bank_transaction_id__isnull=False,
        )
        for exc in bank_only_qs:
            if exc.bank_transaction_id not in matched_bank_tx_ids:
                continue
            self.stdout.write(
                f'  {"[DRY RUN] " if dry_run else ""}bank_only exception id={exc.id} '
                f'(bank_transaction_id={exc.bank_transaction_id}) -> auto-resolving, bank line already matched'
            )
            if not dry_run:
                exc.resolved = True
                exc.resolved_at = now
                exc.resolution_notes = AUTO_RESOLVE_NOTE
                exc.save(update_fields=['resolved', 'resolved_at', 'resolution_notes'])
            touched_recon_ids.add(exc.reconciliation_id)
            resolved_count += 1

        matched_erp_payment_ids = set(
            ReconciliationBankTransaction.objects.filter(
                matched=True, matched_erp_payment_id__isnull=False,
            ).values_list('matched_erp_payment_id', flat=True)
        )
        erp_only_qs = ReconciliationException.objects.filter(
            exception_type='erp_only', resolved=False, loan_payment_id__isnull=False,
        )
        for exc in erp_only_qs:
            if exc.loan_payment_id not in matched_erp_payment_ids:
                continue
            self.stdout.write(
                f'  {"[DRY RUN] " if dry_run else ""}erp_only exception id={exc.id} '
                f'(loan_payment_id={exc.loan_payment_id}) -> auto-resolving, ERP payment already matched'
            )
            if not dry_run:
                exc.resolved = True
                exc.resolved_at = now
                exc.resolution_notes = AUTO_RESOLVE_NOTE
                exc.save(update_fields=['resolved', 'resolved_at', 'resolution_notes'])
            touched_recon_ids.add(exc.reconciliation_id)
            resolved_count += 1

        action = 'Would resolve' if dry_run else 'Resolved'
        self.stdout.write(f'\n{action} {resolved_count} exception(s).')

        if dry_run:
            if touched_recon_ids:
                self.stdout.write(
                    f'Would recompute counts for {len(touched_recon_ids)} affected reconciliation(s).'
                )
            return

        if not touched_recon_ids:
            self.stdout.write(self.style.SUCCESS('No phantom matched exceptions found.'))
            return

        self.stdout.write('\nRecomputing counts for affected reconciliations...')
        for recon in DailyReconciliation.objects.filter(id__in=touched_recon_ids).select_related('bank_account'):
            recompute_reconciliation_counts(recon)
            self.stdout.write(
                f'  recon {recon.id} ({recon.bank_account} — {recon.reconciliation_date}): '
                f'unmatched_bank={recon.unmatched_bank_count} unmatched_erp={recon.unmatched_erp_count}'
            )
