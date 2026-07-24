"""
banks/management/commands/fix_unmatched_stale_resolved_exceptions.py
====================================================================
Repairs exception bookkeeping for every "ghost match" — a
ReconciliationBankTransaction sitting matched=False but with
matched_erp_payment_id still set (it WAS auto-matched, then a director
manually unmatch()-ed it, or a low-confidence Java guess was rejected by
the AUTO_MATCH_MIN_CONFIDENCE gate in banks/tasks.py — either way, this
is a "corrupted" row: matched=False but nothing visibly open to review
it against).

Originally written for one specific bug (unmatch() calling
get_or_create_bank_only_exception(), which used get_or_create but never
reopened an already-resolved row, and never touched the erp_only side at
all) — that bug in unmatch() itself is long since fixed (see
ReconciliationBankTransaction.unmatch(), models.py). But two more corrupted
shapes turned up investigating a production case where a bank line was
found matched=True with NO erp_only exception ever recorded for the ERP
payment it claimed — i.e. the exception was never created in the first
place, not just left stale-resolved:

  1. Never created at all — the bank_only and/or erp_only exception row
     for a ghost match simply doesn't exist. This is the shape a low-
     confidence match rejected before the AUTO_MATCH_MIN_CONFIDENCE fix
     existed would leave behind (it was silently committed as matched=True
     with no exception ever opened), and also the shape a since-patched
     gap in unmatch() itself could produce historically.
  2. Left in a stale resolved state — the row exists but resolved=True
     even though the underlying bank line is genuinely unmatched (the
     original bug this command was written for).

This command finds every ghost match and, for each side (bank_only against
the bank transaction, erp_only against matched_erp_payment_id), CREATES the
exception if it doesn't exist and REOPENS it if it's resolved — using the
same get_or_create_bank_only_exception/get_or_create_erp_only_exception
helpers unmatch() itself uses (reconciliation_utils.py), so the end state
is identical to what a correct unmatch() would have produced.

A second phase enforces the general invariant directly, catching strays
the ghost walk can't see: an "Auto-resolved: matched in a later re-run"
resolution may only stand while a LIVE match actually exists. Found in
production: a payment's own-date exception was auto-resolved when a
(wrong) match was committed, the wrong claimants were later freed by the
cleanup tools, and those claimant lines were then re-matched to OTHER
payments — overwriting their pointers, so no ghost line referenced the
payment anymore and phase 1 never examined it, leaving the exception
closed with no match behind it. Phase 2 scans every exception still
carrying the auto-resolve note and reopens any whose bank line isn't
currently matched (bank_only) / whose payment isn't currently claimed by
any matched line (erp_only). Resolutions made by a human (resolved_by
set, or any other note) are never touched — a director's decision is
permanent.

A third phase runs the invariant in the OPPOSITE direction, closing the
damage left behind by a separate, now-fixed bug: the natural key for an
exception is (reconciliation, exception_type, loan_payment_id/
bank_transaction_id), and the ±window_days matching lets the SAME bank
line or ERP payment surface an exception row on more than one date's
reconciliation over its history. Both bulk_match_by_amount_and_date and
confirm_unambiguous_ghost_matches used to resolve only the FIRST such row
(`.filter(...).first()` + single save()) when committing a match, leaving
every duplicate row on other dates silently stuck open even though the
match that would explain them already exists. Both commands now bulk-
resolve every unresolved row via `.update()`, but that only prevents NEW
orphans — it does nothing for rows already left open by earlier runs.
Phase 3 finds exactly that: any bank_only exception still unresolved
whose bank transaction is already matched=True, or any erp_only exception
still unresolved whose loan_payment_id is already claimed by some
matched=True line, and resolves it. This is the direct fix for "the UI's
erp_only/bank_only counts are higher than the command-line match report"
— those counts were the duplicate rows this phase closes.

Never touches the underlying GL Transaction/TransactionEntry — only
reconciliation-side bookkeeping. Safe to re-run — a second pass finds
nothing left to do.

Usage:
    python manage.py fix_unmatched_stale_resolved_exceptions --dry-run
    python manage.py fix_unmatched_stale_resolved_exceptions
"""
from __future__ import annotations

from django.core.management.base import BaseCommand
from django.utils import timezone


class Command(BaseCommand):
    help = (
        "Creates or reopens bank_only/erp_only exceptions for every ghost match "
        "(matched=False with matched_erp_payment_id still set) whose exception "
        "bookkeeping is missing or stuck resolved. Also reopens auto-resolutions "
        "whose match no longer exists, and resolves exceptions left orphaned open "
        "by a duplicate-row bug in earlier bulk-resolve commands."
    )

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='Preview without making changes.')

    def handle(self, *args, **options):
        from banks.models import DailyReconciliation, ReconciliationBankTransaction, ReconciliationException
        from banks.reconciliation_utils import (
            get_or_create_bank_only_exception,
            get_or_create_erp_only_exception,
            recompute_reconciliation_counts,
        )

        dry_run = options['dry_run']
        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN — no changes will be saved.\n'))

        now = timezone.now()

        ghost_txs = ReconciliationBankTransaction.objects.filter(
            matched=False,
            matched_erp_payment_id__isnull=False,
        ).select_related('bank_account')

        fix_count = 0
        no_recon_count = 0
        touched_recon_ids: set[int] = set()

        for tx in ghost_txs:
            recon = DailyReconciliation.objects.filter(
                bank_account=tx.bank_account,
                reconciliation_date=tx.value_date,
            ).first()
            if recon is None:
                no_recon_count += 1
                self.stdout.write(
                    f'  skipping bank tx {tx.id} ({tx.bank_account}, {tx.value_date}, '
                    f'₦{tx.amount}) — no DailyReconciliation exists for that date'
                )
                continue

            # --- bank_only side ---
            existing_bank_exc = ReconciliationException.objects.filter(
                reconciliation=recon, exception_type='bank_only', bank_transaction_id=tx.id,
            ).first()
            bank_state = (
                'missing entirely' if existing_bank_exc is None else
                'stuck resolved' if existing_bank_exc.resolved else None
            )
            if bank_state:
                fix_count += 1
                touched_recon_ids.add(recon.id)
                self.stdout.write(
                    f'  {"[DRY RUN] " if dry_run else ""}bank_only exception for tx {tx.id} '
                    f'(₦{tx.amount} on {tx.value_date}) was {bank_state} — '
                    f'{"would create/reopen" if dry_run else "creating/reopening"}'
                )
                if not dry_run:
                    get_or_create_bank_only_exception(recon, tx)

            # --- erp_only side ---
            # Looked up WITHOUT a reconciliation filter — the natural key for
            # erp_only is (reconciliation, loan_payment_id), and the widened
            # ±window matching means a stale-resolved row for this same ERP
            # payment could legitimately live on a different date's
            # reconciliation than tx's own. If one is found, it's reopened
            # directly (never via get_or_create_erp_only_exception, which
            # would create a SECOND row under `recon` instead of reopening
            # the one that already exists elsewhere). get_or_create is only
            # used when none exists anywhere yet.
            existing_erp_exc = ReconciliationException.objects.filter(
                exception_type='erp_only', loan_payment_id=tx.matched_erp_payment_id,
            ).first()
            erp_state = (
                'missing entirely' if existing_erp_exc is None else
                'stuck resolved' if existing_erp_exc.resolved else None
            )
            if erp_state:
                fix_count += 1
                self.stdout.write(
                    f'  {"[DRY RUN] " if dry_run else ""}erp_only exception for ERP payment '
                    f'{tx.matched_erp_payment_id} (bank tx {tx.id}) was {erp_state} — '
                    f'{"would create/reopen" if dry_run else "creating/reopening"}'
                )
                if not dry_run:
                    if existing_erp_exc is None:
                        erp_exc = get_or_create_erp_only_exception(recon, tx)
                        if erp_exc is not None:
                            touched_recon_ids.add(erp_exc.reconciliation_id)
                    else:
                        existing_erp_exc.resolved = False
                        existing_erp_exc.save(update_fields=['resolved'])
                        touched_recon_ids.add(existing_erp_exc.reconciliation_id)

        # --- phase 2: auto-resolutions with no live match behind them ---
        # The ghost walk above only reaches exceptions some unmatched line
        # still points at; an auto-resolved exception whose former claimant
        # has since been re-matched ELSEWHERE (pointer overwritten) is
        # invisible to it. The invariant is checked directly instead: the
        # "matched in a later re-run" note may only stand while that match
        # still exists. Human resolutions (resolved_by set, or any other
        # note) are never touched.
        from banks.tasks import AUTO_RESOLVE_NOTE

        stale_auto = 0
        for exc in ReconciliationException.objects.filter(
            resolved=True,
            resolved_by__isnull=True,
            resolution_notes=AUTO_RESOLVE_NOTE,
            exception_type__in=('bank_only', 'erp_only'),
        ).select_related('reconciliation'):
            if exc.exception_type == 'bank_only':
                if not exc.bank_transaction_id:
                    continue
                live = ReconciliationBankTransaction.objects.filter(
                    pk=exc.bank_transaction_id, matched=True,
                ).exists()
            else:
                if not exc.loan_payment_id:
                    continue
                live = ReconciliationBankTransaction.objects.filter(
                    matched=True, matched_erp_payment_id=exc.loan_payment_id,
                ).exists()
            if live:
                continue

            stale_auto += 1
            fix_count += 1
            touched_recon_ids.add(exc.reconciliation_id)
            subject = (
                f'bank tx {exc.bank_transaction_id}' if exc.exception_type == 'bank_only'
                else f'ERP payment {exc.loan_payment_id}'
            )
            self.stdout.write(
                f'  {"[DRY RUN] " if dry_run else ""}{exc.exception_type} exception {exc.id} '
                f'(recon {exc.reconciliation_id}) says "matched in a later re-run" but '
                f'{subject} has no live match — {"would reopen" if dry_run else "reopening"}'
            )
            if not dry_run:
                exc.resolved = False
                exc.save(update_fields=['resolved'])

        if stale_auto:
            self.stdout.write(
                f'\n{"Would reopen" if dry_run else "Reopened"} {stale_auto} auto-resolved '
                f'exception(s) whose match no longer exists.'
            )

        # --- phase 3: exceptions still open despite a live match already
        # existing (the opposite direction of phase 2) ---
        # Damage left behind by a now-fixed bug: bulk_match_by_amount_and_date
        # and confirm_unambiguous_ghost_matches used to resolve only the
        # FIRST unresolved exception row found for a given bank_transaction_id
        # / loan_payment_id (`.first()`), but the natural key allows separate
        # rows across multiple reconciliation dates for the same line/payment
        # (the ±window_days matching surfaces one unresolved item on more
        # than one date's page). Every duplicate row past the first was left
        # open even though the match resolving it already exists. Both
        # commands now bulk-.update() every unresolved row, which prevents
        # NEW orphans, but does nothing for rows already orphaned by earlier
        # runs — this phase closes those directly.
        SWEEP_NOTE = (
            'Auto-resolved: a live match already exists for this bank line/ERP '
            'payment — this row was left open by a bug in earlier bulk-resolve '
            'commands that only closed the first duplicate exception row when '
            'the same line/payment had one on multiple reconciliation dates '
            '(see fix_unmatched_stale_resolved_exceptions, phase 3).'
        )

        orphaned_open = 0
        open_qs = ReconciliationException.objects.filter(
            resolved=False,
            exception_type__in=('bank_only', 'erp_only'),
        )

        open_bank_excs = open_qs.filter(
            exception_type='bank_only',
            bank_transaction_id__in=ReconciliationBankTransaction.objects.filter(
                matched=True,
            ).values_list('id', flat=True),
        )
        for exc in open_bank_excs.select_related('reconciliation'):
            orphaned_open += 1
            fix_count += 1
            touched_recon_ids.add(exc.reconciliation_id)
            self.stdout.write(
                f'  {"[DRY RUN] " if dry_run else ""}bank_only exception {exc.id} '
                f'(recon {exc.reconciliation_id}, tx {exc.bank_transaction_id}) is still open '
                f'but that line is already matched — {"would resolve" if dry_run else "resolving"}'
            )
        if not dry_run:
            open_bank_excs.update(resolved=True, resolved_at=now, resolution_notes=SWEEP_NOTE)

        matched_payment_ids = ReconciliationBankTransaction.objects.filter(
            matched=True, matched_erp_payment_id__isnull=False,
        ).values_list('matched_erp_payment_id', flat=True)
        open_erp_excs = open_qs.filter(
            exception_type='erp_only',
            loan_payment_id__in=matched_payment_ids,
        )
        for exc in open_erp_excs.select_related('reconciliation'):
            orphaned_open += 1
            fix_count += 1
            touched_recon_ids.add(exc.reconciliation_id)
            self.stdout.write(
                f'  {"[DRY RUN] " if dry_run else ""}erp_only exception {exc.id} '
                f'(recon {exc.reconciliation_id}, payment {exc.loan_payment_id}) is still open '
                f'but that payment is already claimed — {"would resolve" if dry_run else "resolving"}'
            )
        if not dry_run:
            open_erp_excs.update(resolved=True, resolved_at=now, resolution_notes=SWEEP_NOTE)

        if orphaned_open:
            self.stdout.write(
                f'\n{"Would resolve" if dry_run else "Resolved"} {orphaned_open} exception(s) '
                f'orphaned open by the earlier duplicate-row bug.'
            )

        if fix_count == 0:
            self.stdout.write(self.style.SUCCESS('\nNo corrupted exception bookkeeping found.'))
        else:
            action = 'Would fix' if dry_run else 'Fixed'
            self.stdout.write(f'\n{action} {fix_count} missing/stale exception(s).')
        if no_recon_count:
            self.stdout.write(
                f'{no_recon_count} ghost match(es) skipped — no reconciliation exists for their date yet.'
            )

        if not touched_recon_ids or dry_run:
            if touched_recon_ids:
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
