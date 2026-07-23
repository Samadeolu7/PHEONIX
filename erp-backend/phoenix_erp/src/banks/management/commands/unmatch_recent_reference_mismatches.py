"""
banks/management/commands/unmatch_recent_reference_mismatches.py
==================================================================
Bulk fix for the exact production pattern find_reference_mismatched_matches
detects: a bank line auto-matched by Bank-Recon (Java) whose ERP payment
carries its own explicit bank reference that does NOT appear anywhere in
that bank line — the old algorithm's amount+date-only coincidence overrode
what should have been a one-to-one, reference-verified pairing (root cause
now fixed — see Bank-Recon's TransactionMatcher.java). One-to-one matching
means a bank line that already has its own genuine claimant must never
ALSO sit there blocking a different, correct pairing from ever being made.

Scope, exactly as specified:
  - Only bank lines with value_date in the last N days (default 5) — this
    is a targeted cleanup of the recent backlog, not a blanket historical
    rewrite.
  - Only matched=True rows whose match_confidence is NOT 'MANUAL' — that
    marker means a director (or confirm_unambiguous_ghost_matches, acting
    on a director's behalf for an unambiguous case) already reviewed and
    confirmed this specific pairing; those are left alone entirely,
    regardless of what the reference check would say.
  - Only rows where reference_mismatches_bank_line() finds an EXPLICIT
    contradiction (the payment names a reference and it genuinely isn't
    there) — a row with no embedded reference to check at all is left
    alone; absence of evidence isn't evidence of a wrong match.

For each qualifying row, calls the existing, audited
ReconciliationBankTransaction.unmatch() (same action as the UI's Unmatch
button / unmatch_transaction_by_id) — never touches the underlying GL
Transaction/TransactionEntry, only reconciliation-side state. This is a
bulk version of running unmatch_transaction_by_id on every row
find_reference_mismatched_matches would flag within the window, so you
don't have to unmatch each one by hand.

Usage:
    python manage.py unmatch_recent_reference_mismatches --user-id <id> --dry-run
    python manage.py unmatch_recent_reference_mismatches --user-id <id> --apply
    python manage.py unmatch_recent_reference_mismatches --user-id <id> --apply --days 5
"""
from django.core.management.base import BaseCommand, CommandError

REPAIR_REASON = (
    'Automated repair: this bank line was auto-matched by the old Java '
    'scoring (amount+date coincidence alone, no reference corroboration '
    'required — now fixed upstream), but the ERP payment\'s own embedded '
    'bank reference does not appear anywhere in this line. Unmatched so '
    'one-to-one, reference-verified matching can be re-derived correctly.'
)


class Command(BaseCommand):
    help = (
        "Bulk-unmatches recent auto-matched bank lines whose ERP payment's "
        "own embedded reference doesn't appear in the bank line — leaves "
        "manually-confirmed matches (match_confidence='MANUAL') untouched."
    )

    def add_arguments(self, parser):
        parser.add_argument('--user-id', type=int, required=True, help='User to attribute the unmatch action to.')
        parser.add_argument('--apply', action='store_true', help='Actually unmatch (default is a dry-run report).')
        parser.add_argument('--dry-run', action='store_true', help='Preview only — the default behaviour; accepted for explicitness.')
        parser.add_argument('--days', type=int, default=5, help='Only consider bank lines within this many days (default 5).')
        parser.add_argument('--bank-account-id', type=int, default=None, help='Restrict to a single bank account.')

    def handle(self, *args, **options):
        from datetime import timedelta

        from django.contrib.auth import get_user_model
        from django.core.exceptions import ValidationError
        from django.utils import timezone

        from banks.models import ReconciliationBankTransaction
        from banks.reconciliation_utils import extract_embedded_reference, reference_mismatches_bank_line
        from transactions.models import Transaction

        User = get_user_model()
        try:
            acting_user = User.objects.get(pk=options['user_id'])
        except User.DoesNotExist:
            raise CommandError(f"No user with id={options['user_id']}")

        apply_changes = options['apply']
        days = options['days']
        bank_account_id = options['bank_account_id']
        cutoff = timezone.now().date() - timedelta(days=days)

        qs = ReconciliationBankTransaction.objects.filter(
            matched=True,
            matched_erp_payment_id__isnull=False,
            value_date__gte=cutoff,
        ).exclude(match_confidence='MANUAL').select_related('bank_account').order_by('value_date')
        if bank_account_id:
            qs = qs.filter(bank_account_id=bank_account_id)

        rows = list(qs)
        if not rows:
            self.stdout.write(self.style.SUCCESS(f'No auto-matched lines in the last {days} day(s) to check.'))
            return

        payments_by_id = {
            t.id: t for t in Transaction.objects.filter(
                id__in=[tx.matched_erp_payment_id for tx in rows]
            )
        }

        if apply_changes:
            self.stdout.write(f'Scanning {len(rows)} auto-matched line(s) from the last {days} day(s)...\n')
        else:
            self.stdout.write(self.style.WARNING('DRY RUN — no changes will be saved.\n'))
            self.stdout.write(f'Scanning {len(rows)} auto-matched line(s) from the last {days} day(s)...\n')

        fixed = 0
        no_ref_skipped = 0
        for tx in rows:
            payment = payments_by_id.get(tx.matched_erp_payment_id)
            if payment is None:
                continue
            if not extract_embedded_reference(payment.description):
                no_ref_skipped += 1
                continue
            if not reference_mismatches_bank_line(tx, payment):
                continue  # reference genuinely matches — a correct one-to-one pairing, leave it

            self.stdout.write(
                f'  {"[DRY RUN] " if not apply_changes else ""}unmatching tx={tx.id} {tx.bank_account} '
                f'{tx.direction} ₦{tx.amount} on {tx.value_date} — matched to payment {payment.id} '
                f'({payment.reference_number}), reference does not correspond'
            )
            if not apply_changes:
                fixed += 1
                continue
            try:
                tx.unmatch(acting_user, REPAIR_REASON)
                fixed += 1
            except ValidationError as exc:
                self.stdout.write(self.style.WARNING(f'    skipped: {exc}'))

        action = 'Would unmatch' if not apply_changes else 'Unmatched'
        self.stdout.write(f'\n{action} {fixed} reference-mismatched line(s).')
        self.stdout.write(
            f'{no_ref_skipped} line(s) had no explicit reference to check and were left untouched.'
        )
