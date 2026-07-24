"""
banks/management/commands/confirm_unambiguous_ghost_matches.py
================================================================
Directly confirms the subset of "ghost matches" (see
audit_unattached_statement_lines) that have EXACTLY ONE same-amount ERP
candidate in the current unmatched pool — what that audit command calls
a "strong lead". Everything else is left completely untouched:

  - Ambiguous ghost matches (2+ candidates, e.g. the "GOD IS GOOD" ₦4,000
    cluster or the two ₦150,000 lines that both list paymentId 215 AND
    920 as candidates) are skipped and reported — those need a human who
    can read the narrations, not a script guessing between look-alikes.
  - Ghost matches with NO candidate at all are skipped and reported —
    there's nothing to confirm.
  - Ordinary "never matched" bank_only exceptions (no matched_erp_payment_id
    history at all) are never touched by this command — it only ever
    queries matched=False rows that DO have a matched_erp_payment_id.

Why this is safe to auto-confirm rather than waiting for a Java rerun:
the known bug behind this whole backlog (see repair_adjacent_day_match_
cascade) was Java scoring an adjacent-day candidate identically to an
exact-day one, which only produces a WRONG pick when there are multiple
plausible candidates to confuse. A bank line with exactly one same-amount
candidate in the entire ±window was never at risk of that confusion —
there was nothing else to pick — so re-establishing that pairing directly
carries the same evidentiary weight as the "1 strong lead" a director
would see and confirm by hand, without depending on a live Java call
getting it right a second time.

Mirrors exactly what _persist_outcome (banks/tasks.py) does for a
genuine Java HIGH match — sets matched/matched_erp_payment_id/matched_at
and the same accountability fields (posting_lag_days,
matched_erp_had_reference, matched_erp_officer), then resolves the
bank_only/erp_only exception pair — EXCEPT match_confidence is recorded
as 'MANUAL', not 'HIGH': this was never scored by Java, and silently
claiming otherwise would be exactly the kind of misleading provenance
this whole investigation started from.

Safe to re-run — a line already matched=True is no longer a ghost match
and won't be reconsidered.

Usage:
    python manage.py confirm_unambiguous_ghost_matches --dry-run
    python manage.py confirm_unambiguous_ghost_matches
"""
from __future__ import annotations

from datetime import date

from django.core.management.base import BaseCommand
from django.db import transaction as db_transaction
from django.utils import timezone

CONFIRM_NOTE = (
    'Auto-confirmed: this ghost match had exactly one same-amount ERP '
    'candidate in the current unmatched pool (see confirm_unambiguous_ghost_'
    'matches) — never scored by Java, so recorded as MANUAL confidence.'
)


class Command(BaseCommand):
    help = (
        "Confirms ghost matches (matched=False with matched_erp_payment_id set) "
        "that have exactly one same-amount ERP candidate. Skips ambiguous ghost "
        "matches, ones with no candidate, and never touches ordinary never-"
        "matched bank_only exceptions."
    )

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='Preview without making changes.')

    def handle(self, *args, **options):
        from banks.models import (
            DailyReconciliation,
            ReconciliationBankTransaction,
            ReconciliationException,
        )
        from banks.reconciliation_utils import (
            _BANK_REFERENCE_RE,
            find_same_amount_erp_candidates,
            recompute_reconciliation_counts,
        )
        from transactions.models import Transaction

        dry_run = options['dry_run']
        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN — no changes will be saved.\n'))

        ghost_txs = ReconciliationBankTransaction.objects.filter(
            matched=False,
            matched_erp_payment_id__isnull=False,
        ).select_related('bank_account').order_by('value_date')

        confirmed = 0
        ambiguous = 0
        no_candidate = 0
        touched_recon_ids: set[int] = set()
        now = timezone.now()

        for tx in ghost_txs:
            # Queried fresh every iteration (never cached across the loop) —
            # confirming an earlier tx in this same run sets matched=True on
            # it, which changes the already-matched-payment exclusion set
            # find_same_amount_erp_candidates uses. Caching here could offer
            # the same ERP payment to two different bank lines in one run.
            candidates = find_same_amount_erp_candidates(tx)

            if not candidates:
                no_candidate += 1
                continue
            if len(candidates) > 1:
                ambiguous += 1
                self.stdout.write(
                    f'  SKIP (ambiguous, {len(candidates)} candidates) tx={tx.id} '
                    f'₦{tx.amount} on {tx.value_date} — {tx.narration[:80]!r}'
                )
                continue

            candidate = candidates[0]
            old_payment_id = tx.matched_erp_payment_id
            new_payment_id = candidate['paymentId']
            reassigned = ' (was pointed at a DIFFERENT payment before)' if old_payment_id != new_payment_id else ''

            self.stdout.write(
                f'  {"[DRY RUN] " if dry_run else ""}CONFIRM tx={tx.id} ₦{tx.amount} '
                f'on {tx.value_date} -> ERP payment {new_payment_id} '
                f'({candidate["paymentDate"]}, {candidate["narration"][:80]!r}){reassigned}'
            )
            confirmed += 1
            if dry_run:
                continue

            with db_transaction.atomic():
                txn = Transaction.objects.filter(id=new_payment_id).select_related('created_by').first()

                tx.matched = True
                tx.match_confidence = 'MANUAL'
                tx.matched_erp_payment_id = new_payment_id
                tx.matched_at = now
                erp_date = date.fromisoformat(candidate['paymentDate'])
                tx.posting_lag_days = (tx.value_date - erp_date).days
                tx.matched_erp_had_reference = bool(_BANK_REFERENCE_RE.search(candidate.get('narration') or ''))
                tx.matched_erp_officer = txn.created_by if txn else None
                tx.save(update_fields=[
                    'matched', 'match_confidence', 'matched_erp_payment_id', 'matched_at',
                    'posting_lag_days', 'matched_erp_had_reference', 'matched_erp_officer',
                ])

                # .update() on the full filtered queryset, not .first() +
                # single save() — the SAME loan_payment_id can have SEPARATE
                # erp_only exception rows on multiple different
                # reconciliation dates (natural key is (reconciliation,
                # exception_type, loan_payment_id); the ±window_days
                # matching lets one unresolved ERP payment surface on more
                # than one date's page over its history). Resolving only
                # the first one found left every other date's copy silently
                # open — found live: the UI's exception counts stayed far
                # higher than any command-line report after applying
                # confirmations, because those other rows never closed.
                bank_excs = ReconciliationException.objects.filter(
                    exception_type='bank_only', bank_transaction_id=tx.id, resolved=False,
                )
                any_bank = bank_excs.exists()
                touched_recon_ids.update(bank_excs.values_list('reconciliation_id', flat=True))
                bank_excs.update(resolved=True, resolved_at=now, resolution_notes=CONFIRM_NOTE)

                erp_excs = ReconciliationException.objects.filter(
                    exception_type='erp_only', loan_payment_id=new_payment_id, resolved=False,
                )
                any_erp = erp_excs.exists()
                touched_recon_ids.update(erp_excs.values_list('reconciliation_id', flat=True))
                erp_excs.update(resolved=True, resolved_at=now, resolution_notes=CONFIRM_NOTE)

                # Might not exist yet if the exception-bookkeeping repair
                # hasn't run first — fall back to the bank line's own date
                # so its reconciliation still gets its counts recomputed.
                if not any_bank and not any_erp:
                    recon = DailyReconciliation.objects.filter(
                        bank_account=tx.bank_account, reconciliation_date=tx.value_date,
                    ).first()
                    if recon:
                        touched_recon_ids.add(recon.id)

        self.stdout.write(
            f'\n{"Would confirm" if dry_run else "Confirmed"} {confirmed} unambiguous ghost match(es). '
            f'Skipped {ambiguous} ambiguous, {no_candidate} with no candidate.'
        )

        if dry_run or not touched_recon_ids:
            return

        self.stdout.write('\nRecomputing counts for affected reconciliations...')
        for recon in DailyReconciliation.objects.filter(id__in=touched_recon_ids).select_related('bank_account'):
            recompute_reconciliation_counts(recon)
            self.stdout.write(
                f'  recon {recon.id} ({recon.bank_account} — {recon.reconciliation_date}): '
                f'matched={recon.matched_count} unmatched_bank={recon.unmatched_bank_count} '
                f'unmatched_erp={recon.unmatched_erp_count}'
            )
