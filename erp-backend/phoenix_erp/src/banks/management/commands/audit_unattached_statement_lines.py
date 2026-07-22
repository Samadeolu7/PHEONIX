"""
banks/management/commands/audit_unattached_statement_lines.py
===============================================================
Read-only audit of every currently "unattached" bank statement line —
a ReconciliationBankTransaction sitting matched=False with an open
bank_only exception — surfaced as one report so a director can clear
the backlog proactively instead of discovering each one only when it
happens to collide with a payment trace search.

Two shapes are reported, since they carry different risk:

  GHOST MATCHES  — matched=False but matched_erp_payment_id IS NOT NULL.
    This line WAS auto-matched, then a director manually unmatch()-ed it
    (unmatched_by/unmatched_at/unmatched_reason are set) because the
    match was wrong — see ReconciliationBankTransaction.unmatch()'s own
    docstring. These are exactly the pattern behind the "Unattached
    Statement Lines" the Payment Trace page shows for a line with
    historical-but-not-current matches: a bad auto-match Java proposed
    (commonly a same-amount, different-purpose ERP payment — a loan
    repayment standing in for what was actually a savings deposit, or
    vice versa) that was silently committed and only caught by a human
    afterwards. run_reconciliation_match now gates auto-commit on HIGH
    confidence (see banks/tasks.py's AUTO_MATCH_MIN_CONFIDENCE) so new
    ones of this exact shape should stop appearing; this command finds
    what's already in the system from before that fix.

  NEVER MATCHED — matched=False and matched_erp_payment_id IS NULL.
    Ordinary bank_only exceptions that have simply never found a match.
    Most of these are genuine (cash the ERP doesn't know about yet), but
    some may have a same-amount ERP candidate sitting right next to them
    that nobody has manually linked — this command flags those too.

  MATCHED WITH NOTHING — matched=True but matched_erp_payment_id IS NULL.
    A different, worse corruption shape than a ghost match: the row claims
    to be matched, but was never actually tied to any ERP payment at all.
    Invisible to the two categories above (both require matched=False) and
    to every other tool in this file, since none of them look at matched=
    True rows. See repair_matched_with_no_erp_payment for the fix (root
    cause closed in banks/tasks.py's is_auto_committable).

For every line, this command searches the SAME candidate pool
run_reconciliation_match would offer Java (fetch_erp_payments, ±window
days, excluding payments some other line already claims) for an exact
amount match, and reports:
  - no candidate      → likely a genuine unmatched bank transaction
  - exactly 1 candidate → strong lead; a director can confirm via the
    existing Link picker (LinkResolveExceptionsView) in one click
  - >1 candidates     → ambiguous; needs a human to read the narrations

This command NEVER mutates anything — it only reports. Resolving/linking
individual lines is left to the existing UI so a human always makes the
final call on real money.

Usage:
    python manage.py audit_unattached_statement_lines
    python manage.py audit_unattached_statement_lines --bank-account=3
    python manage.py audit_unattached_statement_lines --min-age-days=1
"""
from __future__ import annotations

from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone


class Command(BaseCommand):
    help = (
        "Reports every unattached (matched=False) bank statement line with an "
        "open bank_only exception, split into ghost-matches (previously "
        "wrongly auto-matched, then manually undone) vs never-matched, with a "
        "same-amount ERP candidate search for each. Read-only."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--bank-account', type=int, default=None,
            help='Restrict to a single BankAccount id.',
        )
        parser.add_argument(
            '--min-age-days', type=int, default=0,
            help='Only report lines whose value_date is at least this many days old.',
        )

    def handle(self, *args, **options):
        from banks.models import ReconciliationBankTransaction, ReconciliationException
        from banks.reconciliation_utils import find_same_amount_erp_candidates

        bank_account_id = options['bank_account']
        min_age_days = options['min_age_days']

        cutoff = timezone.now().date() - timedelta(days=min_age_days)

        qs = ReconciliationBankTransaction.objects.filter(matched=False, value_date__lte=cutoff)
        if bank_account_id:
            qs = qs.filter(bank_account_id=bank_account_id)
        qs = qs.select_related('bank_account').order_by('value_date')

        matched_with_nothing_qs = ReconciliationBankTransaction.objects.filter(
            matched=True, matched_erp_payment_id__isnull=True, value_date__lte=cutoff,
        )
        if bank_account_id:
            matched_with_nothing_qs = matched_with_nothing_qs.filter(bank_account_id=bank_account_id)
        matched_with_nothing = list(matched_with_nothing_qs.select_related('bank_account').order_by('value_date'))

        lines = list(qs)
        if not lines and not matched_with_nothing:
            self.stdout.write(self.style.SUCCESS('No unattached statement lines found.'))
            return

        ghosts = [tx for tx in lines if tx.matched_erp_payment_id is not None]
        never_matched = [tx for tx in lines if tx.matched_erp_payment_id is None]

        self.stdout.write(
            f'Found {len(lines)} unattached statement line(s): '
            f'{len(ghosts)} ghost match(es) (wrongly auto-matched, then undone), '
            f'{len(never_matched)} never matched. '
            f'Plus {len(matched_with_nothing)} matched-with-nothing row(s) (matched=True, no ERP id).\n'
        )

        # Cache candidate ERP payments per bank tx id — this command never
        # mutates anything, so nothing changes between the two passes over
        # the same tx (the per-line describe() and the final summary), and
        # a run touching many lines doesn't re-run the same query twice.
        candidate_cache: dict = {}

        def candidates_for(tx):
            if tx.id not in candidate_cache:
                candidate_cache[tx.id] = find_same_amount_erp_candidates(tx)
            return candidate_cache[tx.id]

        def describe(tx, label):
            exc = ReconciliationException.objects.filter(
                exception_type='bank_only', bank_transaction_id=tx.id,
            ).order_by('-id').first()
            if exc is None:
                exc_state = 'no bank_only exception found (!)'
            elif exc.resolved:
                # For a GHOST match, unmatch() is supposed to reopen this —
                # resolved=True here means it's genuinely stuck (a bug, or a
                # gap this same session's fix_unmatched_stale_resolved_
                # exceptions targets). For a NEVER-MATCHED line there's no
                # such expectation — a director may have deliberately
                # resolved it (e.g. "own account transfer, no ERP entry
                # expected") without any match ever existing, which is a
                # perfectly normal end state, not a bug.
                exc_state = (
                    'RESOLVED (stale — should be open)' if label == 'GHOST'
                    else 'resolved (likely a deliberate director resolution, not a bug)'
                )
            else:
                exc_state = 'open'

            self.stdout.write(
                f'[{label}] tx={tx.id} {tx.bank_account} {tx.direction} '
                f'₦{tx.amount} on {tx.value_date} — exception: {exc_state}'
            )
            self.stdout.write(f'    narration: {tx.narration[:120]!r}')
            if tx.matched_erp_payment_id is not None:
                self.stdout.write(
                    f'    previously matched to ERP payment id={tx.matched_erp_payment_id} '
                    f'(confidence={tx.match_confidence or "?"}), unmatched by '
                    f'{tx.unmatched_by} at {tx.unmatched_at}: {tx.unmatched_reason!r}'
                )
                # Flag lines where matched=True was set with no erp_only
                # exception ever recorded for the ERP payment it claimed —
                # i.e. this line was marked matched without ever being
                # genuinely tied to a real ERP-side record via the exception
                # bookkeeping, so unmatch() had nothing to reopen on that side.
                erp_exc_exists = ReconciliationException.objects.filter(
                    exception_type='erp_only', loan_payment_id=tx.matched_erp_payment_id,
                ).exists()
                if not erp_exc_exists:
                    self.stdout.write(self.style.ERROR(
                        f'    ⚠ NO erp_only exception exists for ERP payment '
                        f'{tx.matched_erp_payment_id} — this line was marked matched with '
                        f'nothing genuinely tying it to that payment on the ERP side.'
                    ))

            candidates = candidates_for(tx)
            if not candidates:
                self.stdout.write('    candidates: none — likely genuinely unmatched')
            elif len(candidates) == 1:
                p = candidates[0]
                self.stdout.write(
                    f'    candidates: 1 strong lead → paymentId={p["paymentId"]} '
                    f'{p["paymentDate"]} officer={p["officerName"]!r} '
                    f'narration={p["narration"][:100]!r}'
                )
            else:
                self.stdout.write(f'    candidates: {len(candidates)} — ambiguous, needs manual review')
                for p in candidates:
                    self.stdout.write(
                        f'      - paymentId={p["paymentId"]} {p["paymentDate"]} '
                        f'officer={p["officerName"]!r} narration={p["narration"][:100]!r}'
                    )
            self.stdout.write('')

        if ghosts:
            self.stdout.write(self.style.WARNING('=== GHOST MATCHES (wrongly auto-matched, then undone) ==='))
            for tx in ghosts:
                describe(tx, 'GHOST')

        if never_matched:
            self.stdout.write(self.style.WARNING('=== NEVER MATCHED ==='))
            for tx in never_matched:
                describe(tx, 'UNMATCHED')

        if matched_with_nothing:
            self.stdout.write(self.style.ERROR(
                f'=== MATCHED WITH NOTHING ({len(matched_with_nothing)}) — matched=True, '
                f'no ERP payment id attached at all ==='
            ))
            for tx in matched_with_nothing:
                self.stdout.write(
                    f'[NOTHING] tx={tx.id} {tx.bank_account} {tx.direction} ₦{tx.amount} '
                    f'on {tx.value_date} (confidence={tx.match_confidence or "?"}, '
                    f'matched_at={tx.matched_at}) — narration: {tx.narration[:100]!r}'
                )
            self.stdout.write('')

        strong_leads = sum(1 for tx in lines if len(candidates_for(tx)) == 1)
        untied_ghosts = sum(
            1 for tx in ghosts
            if not ReconciliationException.objects.filter(
                exception_type='erp_only', loan_payment_id=tx.matched_erp_payment_id,
            ).exists()
        )
        self.stdout.write(
            f'\nSummary: {len(lines)} total, {strong_leads} with exactly one same-amount '
            f'candidate (fastest to clear via the Link picker), {untied_ghosts} ghost '
            f'match(es) with no erp_only exception ever recorded on the ERP side.'
        )
