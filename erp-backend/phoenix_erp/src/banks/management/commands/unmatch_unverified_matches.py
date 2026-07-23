"""
banks/management/commands/unmatch_unverified_matches.py
==========================================================
The historical half of the director's reference-AND-amount auto-match
policy: Bank-Recon (MatchScorer.autoCommitEligible) no longer auto-commits
anything that isn't exact-amount + reference-corroborated — this command
frees every EXISTING auto-match that wouldn't meet that same bar, so the
books converge on one simple, explainable rule: a committed match means
the amount corresponds exactly AND the reference genuinely corresponds.
Everything else becomes an open, linkable exception pair for review.

Verification per line (match_is_reference_and_amount_verified,
reconciliation_utils.py):
  - amount: the claimed payment is approved, not deleted, and has an entry
    on this line's own GL account at exactly this line's amount;
  - reference: the payment's embedded "| Ref:" appears in the line
    (whitespace-normalized, token-subset fallback for word-order/name
    references); payments with no "| Ref:" segment are verified against
    their whole description the same way (savings deposits whose
    description IS the raw narration still count).

match_confidence='MANUAL' rows are never touched — a human's confirmation
stands regardless of what the reference looks like.

Usage:
    python manage.py unmatch_unverified_matches --user-id <id> --dry-run
    python manage.py unmatch_unverified_matches --user-id <id> --apply
    python manage.py unmatch_unverified_matches --user-id <id> --apply --days 30
"""
from datetime import timedelta

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

REPAIR_REASON = (
    'Automated repair: matching policy is now reference-AND-amount only — '
    'this line\'s claimed payment does not correspond to it by both exact '
    'amount and a genuine reference, so the pairing was an amount/date '
    'coincidence or fuzzy guess from the old scoring. Freed so only '
    'verified matches remain; re-link via review if it was genuinely right.'
)


class Command(BaseCommand):
    help = (
        "Frees every auto-matched (non-MANUAL) line whose claimed payment "
        "is not verified by BOTH exact amount and a corresponding "
        "reference/description — converging the books on the "
        "reference-and-amount-only matching policy. Dry-run unless --apply."
    )

    def add_arguments(self, parser):
        parser.add_argument('--user-id', type=int, required=True, help='User to attribute the unmatch action to.')
        parser.add_argument('--apply', action='store_true', help='Actually unmatch (default is a dry-run report).')
        parser.add_argument('--dry-run', action='store_true', help='Preview only — the default behaviour; accepted for explicitness.')
        parser.add_argument('--days', type=int, default=None, help='Only lines with value_date within the last N days (default: all history).')
        parser.add_argument('--bank-account-id', type=int, default=None, help='Restrict to a single bank account.')

    def handle(self, *args, **options):
        from django.contrib.auth import get_user_model
        from django.core.exceptions import ValidationError

        from banks.models import ReconciliationBankTransaction
        from banks.reconciliation_utils import match_is_reference_and_amount_verified
        from transactions.models import Transaction

        User = get_user_model()
        try:
            acting_user = User.objects.get(pk=options['user_id'])
        except User.DoesNotExist:
            raise CommandError(f"No user with id={options['user_id']}")

        apply_changes = options['apply']

        qs = ReconciliationBankTransaction.objects.filter(
            matched=True, matched_erp_payment_id__isnull=False,
        ).exclude(match_confidence='MANUAL').select_related('bank_account').order_by('value_date')
        if options['days'] is not None:
            qs = qs.filter(value_date__gte=timezone.now().date() - timedelta(days=options['days']))
        if options['bank_account_id']:
            qs = qs.filter(bank_account_id=options['bank_account_id'])

        rows = list(qs)
        if not rows:
            self.stdout.write(self.style.SUCCESS('No auto-matched lines in scope.'))
            return

        payments_by_id = {
            t.id: t for t in Transaction.objects.filter(
                id__in={tx.matched_erp_payment_id for tx in rows},
            )
        }

        if not apply_changes:
            self.stdout.write(self.style.WARNING('DRY RUN — no changes will be saved.\n'))
        self.stdout.write(
            f'Verifying {len(rows)} auto-matched line(s) against the '
            f'reference-AND-amount policy...\n'
        )

        freed = 0
        kept = 0
        for tx in rows:
            payment = payments_by_id.get(tx.matched_erp_payment_id)
            if match_is_reference_and_amount_verified(tx, payment):
                kept += 1
                continue
            self.stdout.write(
                f'  {"[DRY RUN] " if not apply_changes else ""}freeing tx={tx.id} {tx.bank_account} '
                f'{tx.direction} ₦{tx.amount} on {tx.value_date} — payment '
                f'{tx.matched_erp_payment_id} '
                f'({(payment.description[:60] if payment else "MISSING")!r}) not '
                f'reference+amount verified ({tx.narration[:60]!r})'
            )
            if not apply_changes:
                freed += 1
                continue
            try:
                tx.unmatch(acting_user, REPAIR_REASON)
                freed += 1
            except ValidationError as exc:
                self.stdout.write(self.style.WARNING(f'    skipped: {exc}'))

        action = 'Would free' if not apply_changes else 'Freed'
        self.stdout.write(f'\n{action} {freed} unverified match(es); {kept} verified match(es) kept.')
        if apply_changes and freed:
            self.stdout.write(
                'Run fix_unmatched_stale_resolved_exceptions next (reopens bookkeeping), '
                'then a bulk rerun with no date filter — the strict matcher re-commits '
                'only reference+amount pairs and everything else lands in review.'
            )
