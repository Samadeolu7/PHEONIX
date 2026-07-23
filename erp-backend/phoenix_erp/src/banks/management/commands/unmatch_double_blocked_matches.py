"""
banks/management/commands/unmatch_double_blocked_matches.py
==============================================================
Frees bank lines matched to a payment that no longer actually qualifies
as one — the "double blocking" pattern spotted live in Payment Trace: a
bank line shows as currently Matched, yet ALSO surfaces under "Unattached
Statement Lines" for a search on its own amount, because the payment it
claims would never come back from that same search itself.

This replicates PaymentTraceView's own "payments" query (banks/views.py)
exactly — see claimed_payment_visible_in_trace (reconciliation_utils.py):
a payment only counts if it is approved, not deleted, has an entry on the
bank line's own GL account, AND has an entry equal to the bank line's
amount. matched_erp_payment_id is a plain IntegerField, not a real
foreign key — nothing clears or updates it if the claimed Transaction is
later corrected, unapproved, or deleted, so the bank line keeps pointing
at a payment that no longer exists in any meaningful sense while sitting
there as "Matched", blocking anyone else from claiming it.

Per instruction: frees on this signal alone, without also verifying what
the line's true counterpart should be — "usually matched to something
else" is trusted here, the same way unmatch_recent_reference_mismatches
trusts an explicit reference contradiction. Not scoped to a recent date
window — this can be stale from any point in history.

Scope:
  - matched=True, matched_erp_payment_id set.
  - Excludes match_confidence='MANUAL' — director/script-confirmed
    pairings are left alone regardless.
  - claimed_payment_visible_in_trace(tx) is False.

Usage:
    python manage.py unmatch_double_blocked_matches --user-id <id> --dry-run
    python manage.py unmatch_double_blocked_matches --user-id <id> --apply
"""
from django.core.management.base import BaseCommand, CommandError

REPAIR_REASON = (
    'Automated repair: this bank line was matched=True but the ERP payment '
    'it claims no longer qualifies as one (not approved / deleted / no '
    'entry on this GL account or at this amount) — it was showing as '
    'Matched yet also surfacing under Payment Trace\'s own Unattached '
    'Statement Lines for its own amount. Unmatched so the correct pairing '
    'can be made instead.'
)


class Command(BaseCommand):
    help = (
        "Frees matched=True bank lines whose claimed ERP payment would not "
        "actually appear in a Payment Trace search for the line's own amount "
        "(not approved, deleted, or amount/account mismatch on the claimed "
        "transaction). Leaves MANUAL matches untouched."
    )

    def add_arguments(self, parser):
        parser.add_argument('--user-id', type=int, required=True, help='User to attribute the unmatch action to.')
        parser.add_argument('--apply', action='store_true', help='Actually unmatch (default is a dry-run report).')
        parser.add_argument('--dry-run', action='store_true', help='Preview only — the default behaviour; accepted for explicitness.')
        parser.add_argument('--bank-account-id', type=int, default=None, help='Restrict to a single bank account.')

    def handle(self, *args, **options):
        from django.contrib.auth import get_user_model
        from django.core.exceptions import ValidationError

        from banks.models import ReconciliationBankTransaction
        from banks.reconciliation_utils import claimed_payment_visible_in_trace

        User = get_user_model()
        try:
            acting_user = User.objects.get(pk=options['user_id'])
        except User.DoesNotExist:
            raise CommandError(f"No user with id={options['user_id']}")

        apply_changes = options['apply']
        bank_account_id = options['bank_account_id']

        qs = ReconciliationBankTransaction.objects.filter(
            matched=True, matched_erp_payment_id__isnull=False,
        ).exclude(match_confidence='MANUAL').select_related('bank_account').order_by('value_date')
        if bank_account_id:
            qs = qs.filter(bank_account_id=bank_account_id)

        rows = list(qs)
        if not rows:
            self.stdout.write(self.style.SUCCESS('No auto-matched lines to check.'))
            return

        if not apply_changes:
            self.stdout.write(self.style.WARNING('DRY RUN — no changes will be saved.\n'))
        self.stdout.write(f'Scanning {len(rows)} auto-matched line(s)...\n')

        fixed = 0
        for tx in rows:
            if claimed_payment_visible_in_trace(tx):
                continue  # still a genuine, visible payment — leave it alone

            self.stdout.write(
                f'  {"[DRY RUN] " if not apply_changes else ""}unmatching tx={tx.id} {tx.bank_account} '
                f'{tx.direction} ₦{tx.amount} on {tx.value_date} — matched to payment '
                f'{tx.matched_erp_payment_id} (no longer appears as a valid payment: '
                f'not approved, deleted, or amount/account mismatch)'
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
        self.stdout.write(f'\n{action} {fixed} double-blocked match(es).')
