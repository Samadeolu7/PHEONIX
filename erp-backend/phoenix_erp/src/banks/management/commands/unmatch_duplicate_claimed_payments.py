"""
banks/management/commands/unmatch_duplicate_claimed_payments.py
==================================================================
Frees the wrong claimant(s) when the SAME ERP payment is currently
matched=True on more than one ReconciliationBankTransaction at once —
structurally impossible under one-to-one matching, but confirmed live in
production: 21 payments each simultaneously claimed by 2-3 different bank
lines. Root cause: matched_erp_payment_id is a plain IntegerField with no
DB-level uniqueness guard, and run_reconciliation_match's row lock only
covers the DailyReconciliation row itself — two task runs with
overlapping ±window_days on the same bank_account could each see a
payment as unclaimed and both commit a match to it during the ~90s the
Java HTTP call was in flight. See banks/tasks.py's _persist_outcome for
the persist-time guard now closing this going forward; this command only
cleans up the existing backlog.

For each duplicate group this picks the one genuinely correct claimant and
frees the rest:
  1. If exactly one claimant has match_confidence='MANUAL' (a director
     already confirmed it by hand), that one is kept and every other
     claimant in the group is unmatched — a human decision beats a
     heuristic regardless of what the reference check would say.
  2. Otherwise, if exactly one claimant's bank_ref/narration actually
     contains the payment's own embedded reference
     (reference_confirms_bank_line), that one is kept and the rest are
     unmatched.
  3. Anything else (two-or-more MANUAL claimants conflicting, or zero/two-
     or-more reference-confirmed claimants) is genuinely ambiguous —
     reported for manual review, nothing is touched.

Usage:
    python manage.py unmatch_duplicate_claimed_payments --user-id <id> --dry-run
    python manage.py unmatch_duplicate_claimed_payments --user-id <id> --apply
"""
from django.core.management.base import BaseCommand, CommandError

REPAIR_REASON = (
    'Automated repair: this ERP payment was simultaneously matched=True on '
    'more than one bank line (a race between overlapping reconciliation '
    'runs let two different lines each claim it) — unmatched in favor of '
    'the one claimant that genuinely corresponds to it.'
)


class Command(BaseCommand):
    help = (
        "Frees the wrong claimant(s) for every ERP payment currently "
        "matched=True on more than one bank line at once, keeping only the "
        "MANUAL-confirmed or reference-confirmed one. Groups with no single "
        "clear winner are reported but left untouched."
    )

    def add_arguments(self, parser):
        parser.add_argument('--user-id', type=int, required=True, help='User to attribute the unmatch action to.')
        parser.add_argument('--apply', action='store_true', help='Actually unmatch (default is a dry-run report).')
        parser.add_argument('--dry-run', action='store_true', help='Preview only — the default behaviour; accepted for explicitness.')
        parser.add_argument(
            '--free-unconfirmed-groups', action='store_true',
            help='When the payment HAS an explicit embedded reference and ZERO claimants '
                 'contain it, every claimant is individually reference-contradicted — free '
                 'them ALL (keep none) instead of reporting the group as ambiguous. Groups '
                 'whose payment has no reference to check, and groups with 2+ reference-'
                 'confirmed claimants, still always require a human.',
        )

    def handle(self, *args, **options):
        from django.contrib.auth import get_user_model
        from django.core.exceptions import ValidationError

        from banks.reconciliation_utils import (
            extract_embedded_reference,
            find_duplicate_claimed_payments,
            reference_confirms_bank_line,
        )
        from transactions.models import Transaction

        User = get_user_model()
        try:
            acting_user = User.objects.get(pk=options['user_id'])
        except User.DoesNotExist:
            raise CommandError(f"No user with id={options['user_id']}")

        apply_changes = options['apply']
        free_unconfirmed = options['free_unconfirmed_groups']

        groups = find_duplicate_claimed_payments()
        if not groups:
            self.stdout.write(self.style.SUCCESS('No duplicate-claimed payments found.'))
            return

        if not apply_changes:
            self.stdout.write(self.style.WARNING('DRY RUN — no changes will be saved.\n'))
        self.stdout.write(f'Found {len(groups)} payment(s) claimed by more than one bank line.\n')

        payments_by_id = {t.id: t for t in Transaction.objects.filter(id__in=groups.keys())}

        freed = 0
        ambiguous = 0
        for payment_id, claimants in groups.items():
            payment = payments_by_id.get(payment_id)
            description = repr(payment.description[:80]) if payment else 'MISSING'
            self.stdout.write(
                f'payment={payment_id} ({description}) claimed by {len(claimants)} line(s):'
            )
            for tx in claimants:
                self.stdout.write(
                    f'    tx={tx.id} {tx.bank_account} {tx.direction} ₦{tx.amount} on {tx.value_date} '
                    f'confidence={tx.match_confidence or "?"} narration={tx.narration[:80]!r}'
                )

            if payment is None:
                self.stdout.write(self.style.WARNING(
                    '    -> payment no longer qualifies at all — handled by '
                    'unmatch_double_blocked_matches instead, skipping here.'
                ))
                self.stdout.write('')
                continue

            manual_claimants = [tx for tx in claimants if tx.match_confidence == 'MANUAL']
            if len(manual_claimants) == 1:
                keep = manual_claimants[0]
                reason_label = 'MANUAL-confirmed'
            elif len(manual_claimants) >= 2:
                self.stdout.write(self.style.WARNING(
                    '    -> AMBIGUOUS: more than one MANUAL-confirmed claimant — needs a human decision.'
                ))
                ambiguous += 1
                self.stdout.write('')
                continue
            else:
                confirmed = [tx for tx in claimants if reference_confirms_bank_line(tx, payment)]
                if len(confirmed) == 1:
                    keep = confirmed[0]
                    reason_label = 'reference-confirmed'
                elif (
                    len(confirmed) == 0
                    and free_unconfirmed
                    and extract_embedded_reference(payment.description)
                ):
                    # The payment names an explicit reference and NOT ONE
                    # claimant contains it — every claimant is individually
                    # reference-contradicted, so there is no "right one" to
                    # keep. Free them all; the payment's true owner (if its
                    # line exists) gets paired on rerun.
                    keep = None
                    reason_label = None
                    self.stdout.write(
                        '    -> payment has an explicit reference and NO claimant contains it '
                        '— every claimant is wrong, freeing all (--free-unconfirmed-groups)'
                    )
                else:
                    self.stdout.write(self.style.WARNING(
                        f'    -> AMBIGUOUS: {len(confirmed)} reference-confirmed claimant(s) — needs a human decision.'
                    ))
                    ambiguous += 1
                    self.stdout.write('')
                    continue

            if keep is not None:
                self.stdout.write(f'    -> keeping tx={keep.id} ({reason_label}), freeing the rest')
            for tx in claimants:
                if keep is not None and tx.id == keep.id:
                    continue
                self.stdout.write(
                    f'    {"[DRY RUN] " if not apply_changes else ""}unmatching tx={tx.id}'
                )
                if not apply_changes:
                    freed += 1
                    continue
                try:
                    tx.unmatch(acting_user, REPAIR_REASON)
                    freed += 1
                except ValidationError as exc:
                    self.stdout.write(self.style.WARNING(f'        skipped: {exc}'))
            self.stdout.write('')

        action = 'Would free' if not apply_changes else 'Freed'
        self.stdout.write(f'{action} {freed} wrong claimant(s); {ambiguous} group(s) left for manual review.')
