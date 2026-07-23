"""
banks/management/commands/repair_adjacent_day_match_cascade.py
================================================================
One-time (and safely re-runnable) repair for a Java Bank-Recon scoring bug,
now fixed upstream: ExactAmountDateMatcher used to award the SAME top score
to any same-amount bank line within the ±1-day date tolerance, with no
preference for the exact same day over a merely-nearby one. For a daily-
recurring identical-amount fee (VAT, stamp duty, FIP charges, ...) this was
an outright, arbitrarily-broken tie — confirmed in production as a
cascading criss-cross: day D's own bank line got claimed by day D+1's ERP
payment, which pushed day D+1's own line onto day D+2's, and so on across
several consecutive days, while day D's true payment sat as an open
erp_only/bank_only exception.

The Java fix (graduated scoring: an exact-day match now strictly outscores
a within-tolerance-but-not-exact one) stops this from happening again, but
does nothing for pairs the old scorer already mismatched historically —
that's what this command finds and repairs.
  1. DETECT: every currently-matched ReconciliationBankTransaction whose
     stored posting_lag_days is exactly +-1 (the only lag the old scorer
     could tie at the top score — anything further apart never scored the
     full 100 even under the old rule) is a suspect. For each:
       - Verify the matched ERP payment's own GL amount is EXACTLY equal to
         the bank line's amount. A lag-1 match with a near-but-not-exact
         amount was scored by ToleranceMatcher + a strong narration/
         reference signal, not by the buggy exact-tier tie — leave those
         alone entirely, they're unrelated legitimate matches.
       - Look for the one bank line that actually belongs on the ERP
         payment's real date (same bank account, direction, amount). Zero
         or more-than-one candidates there means this either isn't the bug
         (e.g. a genuine one-day posting lag with nothing else competing
         for it) or is too ambiguous to touch automatically — reported
         separately, never repaired.
       - Exactly one candidate confirms a cascade victim.
  2. REPAIR (--apply only): unmatch() every confirmed victim — the
     existing, audited, non-destructive action (ReconciliationBankTransaction
     .unmatch(), banks/models.py) that frees the ERP payment and reopens the
     bank line as a bank_only exception — then queue a re-run (via .delay(),
     same as the "Re-run matching" button — banks/tasks.py's
     run_pool_reconciliation_match must never be called synchronously here,
     since Bank-Recon is only reachable from the celery_worker container),
     one dispatch per distinct bank_account touched (not per date — the
     pool task re-queries which dates are actually processing once it
     holds that account's lock), so the now-fixed Java scorer re-derives
     each correct exact-day pairing on its own.

--include-ambiguous additionally unmatches the "No exact-day candidate" and
"Ambiguous (>1 candidate)" buckets. Those are left alone by default because
my own amount+date-only heuristic genuinely can't tell them apart — but
re-running them through Java's FULL scorer (narration + reference +
tolerance, not just amount+date) is safe either way: if Java can
disambiguate, it fixes them properly; if it can't, they correctly surface
as open exceptions instead of silently staying on a possibly-wrong old
match. Never worse than leaving them as-is, just a much bigger action (more
unmatches, more notifications, more Java calls) — hence the separate flag
rather than doing it by default.

Usage:
    python manage.py repair_adjacent_day_match_cascade --user-id <id> --dry-run
    python manage.py repair_adjacent_day_match_cascade --user-id <id> --apply
    python manage.py repair_adjacent_day_match_cascade --user-id <id> --apply --bank-account-id <id>
    python manage.py repair_adjacent_day_match_cascade --user-id <id> --apply --include-ambiguous

Always run --dry-run first and review the report before --apply.
"""
from django.core.management.base import BaseCommand, CommandError

REPAIR_REASON = (
    'Automated repair: Java ExactAmountDateMatcher used to score an '
    'adjacent-day match identically to an exact-day match, so this line '
    'was claimed by the wrong day\'s payment (now fixed upstream — see '
    'repair_adjacent_day_match_cascade). Unmatched so the correct exact-day '
    'pairing can be re-derived on rerun.'
)


class Command(BaseCommand):
    help = (
        "Detects and repairs ReconciliationBankTransaction rows wrongly matched "
        "to an adjacent day's ERP payment by the old Java date-tolerance tie bug."
    )

    def add_arguments(self, parser):
        parser.add_argument('--user-id', type=int, required=True, help='User to attribute the unmatch action to.')
        parser.add_argument('--apply', action='store_true', help='Actually unmatch and re-run matching (default is a dry-run report).')
        parser.add_argument('--dry-run', action='store_true', help='Preview only — the default behaviour; this flag is accepted for explicitness and does not change anything.')
        parser.add_argument('--bank-account-id', type=int, default=None, help='Restrict to a single bank account.')
        parser.add_argument(
            '--include-ambiguous', action='store_true',
            help='Also unmatch the "no exact-day candidate" and "ambiguous" buckets and let '
                 "Java's full scorer (narration/reference, not just amount+date) re-derive them on rerun.",
        )

    def handle(self, *args, **options):
        from datetime import timedelta

        from django.contrib.auth import get_user_model
        from django.core.exceptions import ValidationError
        from django.db.models import F

        from banks.models import DailyReconciliation, ReconciliationBankTransaction
        from banks.tasks import run_pool_reconciliation_match
        from transactions.models import TransactionEntry

        User = get_user_model()
        try:
            acting_user = User.objects.get(pk=options['user_id'])
        except User.DoesNotExist:
            raise CommandError(f"No user with id={options['user_id']}")

        apply_changes = options['apply']
        bank_account_id = options['bank_account_id']

        qs = ReconciliationBankTransaction.objects.filter(
            matched=True, posting_lag_days__in=(-1, 1), matched_erp_payment_id__isnull=False,
        ).select_related('bank_account')
        if bank_account_id:
            qs = qs.filter(bank_account_id=bank_account_id)

        confirmed = []       # (tx, sibling, erp_date)
        skipped_amount = []  # tx whose ERP-side amount doesn't exactly match — not this bug
        skipped_no_gl = []   # tx whose bank account has no gl_account — can't verify
        no_candidate = []    # tx with no exact-day sibling bank line — possibly a genuine lag
        ambiguous = []       # tx with more than one exact-day candidate

        for tx in qs.order_by('bank_account_id', 'amount', 'value_date'):
            bank_account = tx.bank_account
            if not bank_account.gl_account_id:
                skipped_no_gl.append(tx)
                continue

            side = TransactionEntry.CREDIT if tx.direction == 'DEBIT' else TransactionEntry.DEBIT
            entry = TransactionEntry.objects.filter(
                transaction_id=tx.matched_erp_payment_id,
                account_id=bank_account.gl_account_id,
                side=side,
            ).select_related('transaction').first()
            if entry is None or entry.amount != tx.amount:
                skipped_amount.append(tx)
                continue

            erp_date = tx.value_date - timedelta(days=tx.posting_lag_days)
            candidates = list(ReconciliationBankTransaction.objects.filter(
                bank_account_id=bank_account.id, direction=tx.direction,
                value_date=erp_date, amount=tx.amount,
            ))
            if len(candidates) == 0:
                no_candidate.append((tx, erp_date))
            elif len(candidates) > 1:
                ambiguous.append((tx, erp_date))
            else:
                confirmed.append((tx, candidates[0], erp_date))

        self.stdout.write(self.style.WARNING('DRY RUN — no changes will be made.\n') if not apply_changes else '')
        self.stdout.write(f'Scanned {qs.count()} lag-1 match(es).')
        self.stdout.write(f'  Confirmed cascade victims : {len(confirmed)}')
        self.stdout.write(f'  No exact-day candidate    : {len(no_candidate)} (left alone — may be a genuine 1-day lag)')
        self.stdout.write(f'  Ambiguous (>1 candidate)  : {len(ambiguous)} (left alone — needs manual review)')
        self.stdout.write(f'  Amount not exact match    : {len(skipped_amount)} (left alone — not this bug)')
        self.stdout.write(f'  No GL account on bank_acct: {len(skipped_no_gl)} (left alone — cannot verify)\n')

        if confirmed:
            self.stdout.write('Confirmed cascade victims:')
            for tx, sibling, erp_date in confirmed:
                self.stdout.write(
                    f'  bank_tx id={tx.id} ({tx.bank_account} — {tx.direction} {tx.amount} on {tx.value_date}) '
                    f'wrongly matched to erp_payment_id={tx.matched_erp_payment_id} (real date {erp_date}) — '
                    f'true bank line id={sibling.id} on {sibling.value_date} is '
                    f'{"unmatched" if not sibling.matched else f"matched to erp_payment_id={sibling.matched_erp_payment_id}"}'
                )
            self.stdout.write('')

        if ambiguous:
            self.stdout.write('Ambiguous — more than one same-day/amount candidate, needs manual review:')
            for tx, _erp_date in ambiguous:
                self.stdout.write(f'  bank_tx id={tx.id} ({tx.bank_account} — {tx.direction} {tx.amount} on {tx.value_date})')
            self.stdout.write('')

        include_ambiguous = options['include_ambiguous']
        to_unmatch = [(tx, erp_date) for tx, sibling, erp_date in confirmed]
        if include_ambiguous:
            to_unmatch += no_candidate + ambiguous

        if not apply_changes:
            if to_unmatch:
                touched_dates = self._touched_dates(to_unmatch)
                self.stdout.write(f'Would unmatch {len(to_unmatch)} transaction(s) and re-run matching for {len(touched_dates)} reconciliation date(s).')
            return

        if to_unmatch:
            self.stdout.write(f'Unmatching {len(to_unmatch)} transaction(s)...')
            for tx, erp_date in to_unmatch:
                try:
                    tx.unmatch(acting_user, REPAIR_REASON)
                    self.stdout.write(f'  unmatched bank_tx id={tx.id}')
                except ValidationError as exc:
                    self.stdout.write(self.style.WARNING(f'  skipped bank_tx id={tx.id}: {exc}'))

        touched_dates = self._touched_dates(to_unmatch)

        # Recovery: a previous --apply may have unmatched rows but failed
        # before (or without) queuing their rerun — e.g. run from a
        # container with no route to the Bank-Recon service. Re-discover
        # those dates by the repair's own marker on unmatched_reason so a
        # re-run of this command finishes the job rather than silently
        # doing nothing because `confirmed` is now empty (the rows are
        # already unmatched, so they no longer match the detection query).
        pending_qs = ReconciliationBankTransaction.objects.filter(
            matched=False, unmatched_reason=REPAIR_REASON,
        )
        if bank_account_id:
            pending_qs = pending_qs.filter(bank_account_id=bank_account_id)
        for tx in pending_qs:
            touched_dates.add((tx.bank_account_id, tx.value_date))

        if not touched_dates:
            self.stdout.write(self.style.SUCCESS('No confirmed cascade victims to repair.'))
            return

        # Queued via Celery (.delay()), not called synchronously — same
        # pattern the "Re-run matching" button uses (RerunReconciliationView).
        # Bank-Recon is only reachable from the celery_worker container
        # (BANK_RECON_SERVICE_URL/INTERNAL_SERVICE_TOKEN are only set
        # there — see docker-compose.yml), so this command must never call
        # the task directly regardless of which container it's run from.
        self.stdout.write(f'\nQueuing a re-run for {len(touched_dates)} affected reconciliation date(s)...')
        queued = 0
        queued_bank_account_ids = set()
        for bank_account_id_, recon_date in sorted(touched_dates):
            recon = DailyReconciliation.objects.filter(
                bank_account_id=bank_account_id_, reconciliation_date=recon_date,
            ).first()
            if recon is None:
                self.stdout.write(f'  no reconciliation exists for bank_account={bank_account_id_} date={recon_date} — skipped')
                continue
            if recon.status == 'processing':
                self.stdout.write(f'  recon {recon.id} ({recon_date}) already processing — skipped')
                continue
            recon.status = 'processing'
            recon.rerun_count = F('rerun_count') + 1
            recon.save(update_fields=['status', 'rerun_count', 'updated_at'])
            queued_bank_account_ids.add(bank_account_id_)
            self.stdout.write(f'  queued recon {recon.id} ({recon_date})')
            queued += 1

        # One pool task per distinct bank_account, not one per date — see
        # run_pool_reconciliation_match (banks/tasks.py).
        for bank_account_id_ in queued_bank_account_ids:
            run_pool_reconciliation_match.delay(bank_account_id_)

        self.stdout.write(self.style.SUCCESS(
            f'\nDone — {len(to_unmatch)} unmatched this run, {queued} reconciliation date(s) queued for re-run. '
            f'Check each recon\'s status/exception counts once the celery_worker has processed the queue.'
        ))

    @staticmethod
    def _touched_dates(tx_erp_date_pairs):
        """Every (bank_account_id, date) pair whose reconciliation needs a rerun —
        both the wrongly-matched line's own date and the freed ERP payment's date."""
        dates = set()
        for tx, erp_date in tx_erp_date_pairs:
            dates.add((tx.bank_account_id, tx.value_date))
            dates.add((tx.bank_account_id, erp_date))
        return dates
