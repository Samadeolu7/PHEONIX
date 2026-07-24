"""
banks/management/commands/bulk_match_by_amount_and_date.py
=============================================================
CLIENT-APPROVED, EXPLICITLY SCOPED EXCEPTION to the reference+amount
matching policy (see match_is_reference_and_amount_verified,
unmatch_unverified_matches) — for a bounded date range, pairs unmatched
bank lines to unclaimed ERP payments purely by AMOUNT + closest date
proximity, with NO reference verification at all.

Why this exists: the goal for this specific period is confirming the
AGGREGATE total of money that should be in the bank actually is there,
not re-establishing the precise per-transaction paper trail for every
line — the client explicitly signed off on that trade-off for this
catch-up pass. It is not a return to amount+date-only auto-matching in
general (Bank-Recon's own matcher still requires reference+amount for
everything it auto-commits going forward — see MatchScorer.
autoCommitEligible); it is a one-time, human-authorized, date-bounded
exception.

Every match this command makes is recorded as match_confidence='MANUAL' —
the same marker confirm_unambiguous_ghost_matches uses for a real
director decision — specifically so it is excluded from every reference-
based cleanup tool forever after (unmatch_unverified_matches,
find_reference_mismatched_matches, unmatch_usurped_reference_matches,
etc.). Recording it as HIGH would be a lie about provenance: nothing here
was reference-verified.

Algorithm, per bank_account and per direction:
  1. List unmatched bank lines and unclaimed ERP payments in
     [--start-date, --end-date], grouped by exact amount — the "unique
     amounts in bank vs in ERP" report this command always prints first,
     even in --apply mode, so the decision is visible before it's acted on.
  2. For every amount present on BOTH sides, greedily pair by nearest
     date: repeatedly take the (bank line, ERP payment) combination with
     the smallest date difference remaining in that amount's pool, assign
     it, remove both, repeat until one side is exhausted for that amount.
  3. Whatever is left over (an amount with more lines than payments, or
     vice versa, or an amount present on only one side) is reported, not
     guessed at — a real discrepancy for this period, or a payment/line
     still to arrive.

Commits exactly like confirm_unambiguous_ghost_matches: sets matched/
match_confidence='MANUAL'/matched_erp_payment_id/matched_at and the same
accountability fields, resolves the bank_only/erp_only exception pair if
one exists, recomputes affected reconciliation counts.

Usage:
    python manage.py bulk_match_by_amount_and_date --start-date 2026-07-01 --end-date 2026-07-18 --dry-run
    python manage.py bulk_match_by_amount_and_date --start-date 2026-07-01 --end-date 2026-07-18 --apply
    python manage.py bulk_match_by_amount_and_date --start-date 2026-07-01 --end-date 2026-07-18 --apply --bank-account-id 1
    python manage.py bulk_match_by_amount_and_date --start-date 2026-07-01 --end-date 2026-07-18 --apply --include-debits
"""
from datetime import date as date_cls
from decimal import Decimal, InvalidOperation

from django.core.management.base import BaseCommand, CommandError

CONFIRM_NOTE = (
    'Bulk-confirmed: client-approved amount+date-proximity match for the '
    '{start} to {end} catch-up period (see bulk_match_by_amount_and_date) — '
    'never reference-verified, recorded as MANUAL confidence.'
)


class Command(BaseCommand):
    help = (
        "CLIENT-APPROVED EXCEPTION: pairs unmatched bank lines to unclaimed "
        "ERP payments by amount + closest date proximity within a bounded "
        "date range, no reference check. Recorded as MANUAL. Dry-run unless --apply."
    )

    def add_arguments(self, parser):
        parser.add_argument('--start-date', type=str, required=True, help='YYYY-MM-DD, inclusive.')
        parser.add_argument('--end-date', type=str, required=True, help='YYYY-MM-DD, inclusive.')
        parser.add_argument('--apply', action='store_true', help='Actually commit matches (default is a dry-run report).')
        parser.add_argument('--dry-run', action='store_true', help='Preview only — the default behaviour; accepted for explicitness.')
        parser.add_argument('--bank-account-id', type=int, default=None, help='Restrict to a single bank account.')
        parser.add_argument('--include-debits', action='store_true', help='Also pair DEBIT-direction lines/payments (default: CREDIT only).')

    def handle(self, *args, **options):
        from banks.models import BankAccount, DailyReconciliation, ReconciliationBankTransaction, ReconciliationException
        from banks.reconciliation_utils import (
            _BANK_REFERENCE_RE,
            fetch_erp_payments,
            narration_relationship,
            recompute_reconciliation_counts,
        )
        from django.utils import timezone
        from transactions.models import Transaction

        try:
            start = date_cls.fromisoformat(options['start_date'])
            end = date_cls.fromisoformat(options['end_date'])
        except ValueError as exc:
            raise CommandError(f'Invalid date: {exc}')
        if start > end:
            raise CommandError('--start-date must not be after --end-date')

        apply_changes = options['apply']
        directions = ['CREDIT', 'DEBIT'] if options['include_debits'] else ['CREDIT']

        accounts_qs = BankAccount.objects.filter(gl_account_id__isnull=False)
        if options['bank_account_id']:
            accounts_qs = accounts_qs.filter(pk=options['bank_account_id'])
        accounts = list(accounts_qs)
        if not accounts:
            self.stdout.write(self.style.WARNING('No bank account(s) with a linked GL account in scope.'))
            return

        if not apply_changes:
            self.stdout.write(self.style.WARNING('DRY RUN — no changes will be saved.\n'))
        self.stdout.write(
            self.style.WARNING(
                f'CLIENT-APPROVED EXCEPTION: matching by amount + date proximity only, '
                f'no reference check, {start} to {end}. Every match recorded as MANUAL.\n'
            )
        )

        now = timezone.now()
        total_matched = 0
        touched_recon_ids: set[int] = set()

        for bank_account in accounts:
            for direction in directions:
                bank_lines = list(
                    ReconciliationBankTransaction.objects.filter(
                        bank_account=bank_account, matched=False,
                        direction=direction, value_date__range=(start, end),
                    ).order_by('value_date')
                )

                already_matched_ids = list(
                    ReconciliationBankTransaction.objects.filter(
                        bank_account=bank_account, matched=True, matched_erp_payment_id__isnull=False,
                    ).values_list('matched_erp_payment_id', flat=True)
                )
                erp_payments = fetch_erp_payments(
                    bank_account, start, end, direction=direction,
                    exclude_payment_ids=already_matched_ids,
                )

                if not bank_lines and not erp_payments:
                    continue

                bank_by_amount: dict[Decimal, list] = {}
                for tx in bank_lines:
                    bank_by_amount.setdefault(tx.amount, []).append(tx)

                erp_by_amount: dict[Decimal, list] = {}
                for p in erp_payments:
                    try:
                        amt = Decimal(p['amount'])
                    except (InvalidOperation, TypeError, KeyError):
                        continue
                    erp_by_amount.setdefault(amt, []).append(p)

                all_amounts = sorted(set(bank_by_amount) | set(erp_by_amount))
                if not all_amounts:
                    continue

                self.stdout.write(
                    f'\n=== {bank_account} — {direction} ({start} to {end}) — '
                    f'{len(all_amounts)} unique amount(s) ==='
                )

                for amount in all_amounts:
                    bank_group = bank_by_amount.get(amount, [])
                    erp_group = erp_by_amount.get(amount, [])
                    self.stdout.write(
                        f'  ₦{amount}: {len(bank_group)} bank line(s), {len(erp_group)} ERP payment(s)'
                    )
                    if not bank_group or not erp_group:
                        continue  # only on one side — nothing to pair, reported above

                    pairs, contradicted = self._best_pairs(bank_group, erp_group, narration_relationship)
                    for tx, payment in pairs:
                        self.stdout.write(
                            f'    {"[DRY RUN] " if not apply_changes else ""}'
                            f'match tx={tx.id} ({tx.value_date}, {tx.narration[:60]!r}) '
                            f'-> payment {payment["paymentId"]} '
                            f'({payment["paymentDate"]}, {(payment.get("narration") or "")[:60]!r})'
                        )
                        total_matched += 1
                        if not apply_changes:
                            continue
                        touched_recon_ids.update(self._commit_match(
                            tx, payment, now, start, end,
                            Transaction, ReconciliationException, DailyReconciliation,
                            _BANK_REFERENCE_RE, CONFIRM_NOTE,
                        ))

                    # `contradicted` is the full remaining cross-product after
                    # pairing stopped early (every combination among what's
                    # left looked like a conflict) — purely informational,
                    # not additional items to subtract: `pairs` is the only
                    # thing that actually consumes bank lines/payments, so
                    # the leftover counts below are still just bank_group/
                    # erp_group minus what got paired.
                    for tx, payment in contradicted:
                        self.stdout.write(self.style.ERROR(
                            f'    SKIPPED (narration conflict) tx={tx.id} ({tx.value_date}, '
                            f'{tx.narration[:50]!r}) vs payment {payment["paymentId"]} '
                            f'({payment["paymentDate"]}, {(payment.get("narration") or "")[:50]!r}) '
                            f'— looks like a different customer/transaction, needs a human.'
                        ))

                    leftover_bank = len(bank_group) - len(pairs)
                    leftover_erp = len(erp_group) - len(pairs)
                    if leftover_bank:
                        self.stdout.write(self.style.WARNING(
                            f'    {leftover_bank} bank line(s) at ₦{amount} left over — no ERP counterpart in this period.'
                        ))
                    if leftover_erp:
                        self.stdout.write(self.style.WARNING(
                            f'    {leftover_erp} ERP payment(s) at ₦{amount} left over — no bank line in this period.'
                        ))

        action = 'Would match' if not apply_changes else 'Matched'
        self.stdout.write(f'\n{action} {total_matched} pair(s) for {start} to {end}.')

        if apply_changes and touched_recon_ids:
            self.stdout.write('\nRecomputing counts for affected reconciliations...')
            for recon in DailyReconciliation.objects.filter(id__in=touched_recon_ids).select_related('bank_account'):
                recompute_reconciliation_counts(recon)
                self.stdout.write(
                    f'  recon {recon.id} ({recon.bank_account} — {recon.reconciliation_date}): '
                    f'matched={recon.matched_count} unmatched_bank={recon.unmatched_bank_count} '
                    f'unmatched_erp={recon.unmatched_erp_count}'
                )

    @staticmethod
    def _best_pairs(bank_group, erp_group, narration_relationship):
        """
        Greedy bipartite pairing within one amount bucket — checks
        reference/narration correspondence to an extent (narration_
        relationship, reconciliation_utils.py) as a soft preference and
        safety net layered on top of the amount+date-only policy this
        tool otherwise runs on:

          - CONFIRMED pairs (share a meaningful word or id token) are
            preferred over NEUTRAL ones at any date distance — a genuine
            textual match beats a merely-closer-in-time coincidence.
          - NEUTRAL pairs (not enough distinguishing text either way) fall
            back to nearest-date, same as before — this is the actual
            "cheat" the tool exists for when there's no information to
            go on.
          - CONTRADICTED pairs (both sides name something specific, and
            they don't overlap at all — e.g. "KAFILAT A" vs "MARVELLOU")
            are NEVER eligible to be chosen, even as a last resort. Found
            live: a bank line whose real counterpart was a split entry not
            present in this amount bucket at all got nearest-date-paired
            with a completely unrelated customer's loan payment purely
            because it was the only same-amount option available.

        Returns (pairs, contradicted) — pairs is what actually got
        assigned; contradicted is every remaining (bank, erp) combination
        left over once assignment stopped because nothing eligible
        remained, purely for reporting (not additional consumed items —
        see the caller).
        """
        remaining_bank = list(bank_group)
        remaining_erp = list(erp_group)
        pairs = []
        rank = {'CONFIRMED': 0, 'NEUTRAL': 1}

        while remaining_bank and remaining_erp:
            best = None
            best_key = None
            for tx in remaining_bank:
                for payment in remaining_erp:
                    relationship = narration_relationship(
                        f'{tx.bank_ref or ""} {tx.narration or ""}',
                        payment.get('narration') or '',
                    )
                    if relationship == 'CONTRADICTED':
                        continue
                    erp_date = date_cls.fromisoformat(payment['paymentDate'])
                    diff = abs((tx.value_date - erp_date).days)
                    key = (rank[relationship], diff)
                    if best_key is None or key < best_key:
                        best_key = key
                        best = (tx, payment)
            if best is None:
                break  # every remaining combination is CONTRADICTED
            pairs.append(best)
            remaining_bank.remove(best[0])
            remaining_erp.remove(best[1])

        contradicted = [
            (tx, payment) for tx in remaining_bank for payment in remaining_erp
        ] if remaining_bank and remaining_erp else []
        return pairs, contradicted

    @staticmethod
    def _commit_match(tx, payment, now, start, end, Transaction, ReconciliationException, DailyReconciliation,
                       bank_reference_re, note_template):
        """
        Returns the SET of DailyReconciliation ids touched (never a single
        id) — an erp_only exception for the same loan_payment_id can exist
        as SEPARATE rows on multiple different reconciliation dates (the
        ±window_days matching lets the same unresolved ERP payment surface
        on more than one date's page over its history; natural key is
        (reconciliation, exception_type, loan_payment_id), so each date
        gets its own row, not one shared row). Resolving only the first
        one found (.first()) left every other date's copy silently open —
        found live: the UI's exception counts stayed far higher than any
        command-line report after applying matches, because those other
        rows never got closed. .update() on the full filtered queryset
        closes every row, not just one.
        """
        new_payment_id = payment['paymentId']
        txn = Transaction.objects.filter(id=new_payment_id).select_related('created_by').first()

        tx.matched = True
        tx.match_confidence = 'MANUAL'
        tx.matched_erp_payment_id = new_payment_id
        tx.matched_at = now
        erp_date = date_cls.fromisoformat(payment['paymentDate'])
        tx.posting_lag_days = (tx.value_date - erp_date).days
        tx.matched_erp_had_reference = bool(bank_reference_re.search(payment.get('narration') or ''))
        tx.matched_erp_officer = txn.created_by if txn else None
        tx.save(update_fields=[
            'matched', 'match_confidence', 'matched_erp_payment_id', 'matched_at',
            'posting_lag_days', 'matched_erp_had_reference', 'matched_erp_officer',
        ])

        note = note_template.format(start=start, end=end)
        touched_recon_ids = set()

        bank_excs = ReconciliationException.objects.filter(
            exception_type='bank_only', bank_transaction_id=tx.id, resolved=False,
        )
        touched_recon_ids.update(bank_excs.values_list('reconciliation_id', flat=True))
        bank_excs.update(resolved=True, resolved_at=now, resolution_notes=note)

        erp_excs = ReconciliationException.objects.filter(
            exception_type='erp_only', loan_payment_id=new_payment_id, resolved=False,
        )
        touched_recon_ids.update(erp_excs.values_list('reconciliation_id', flat=True))
        erp_excs.update(resolved=True, resolved_at=now, resolution_notes=note)

        if not touched_recon_ids:
            recon = DailyReconciliation.objects.filter(
                bank_account=tx.bank_account, reconciliation_date=tx.value_date,
            ).first()
            if recon:
                touched_recon_ids.add(recon.id)

        return touched_recon_ids
