"""
banks/management/commands/unmatch_large_posting_lag_matches.py
=================================================================
Frees auto-matched bank lines whose claimed ERP payment sits an
implausibly large number of days away from the bank line's own value
date — the "double blocking" pattern spotted live in Payment Trace: a
bank line shows as currently Matched, yet also surfaces under
"Unattached Statement Lines" for an unrelated same-amount search,
because the payment it's actually claiming is old news next to more
recent activity of the same amount. A genuinely correct match is almost
always within a day or two of posting lag (see repair_adjacent_day_
match_cascade and the ADEYINKA/LN-1139 examples this session — both
correct pairings had 0-1 day lag); an 8+ day gap is exactly the shape of
a coincidental amount-only pick grabbing whatever was left over once the
real match was already taken (or never in the candidate window at all).

Per instruction: this frees on the lag signal ALONE, without also
requiring a reference mismatch or verifying what the line's true
counterpart is — "usually matched to something else" is trusted here,
same as unmatch_recent_reference_mismatches trusts an explicit reference
contradiction. Deliberately NOT scoped to a recent date window (unlike
unmatch_recent_reference_mismatches) — stale-lag matches can be old.

Scope:
  - matched=True, matched_erp_payment_id set, posting_lag_days recorded.
  - Excludes match_confidence='MANUAL' — director/script-confirmed
    pairings are left alone regardless of their lag.
  - abs(posting_lag_days) > --max-lag-days (default 3).

Usage:
    python manage.py unmatch_large_posting_lag_matches --user-id <id> --dry-run
    python manage.py unmatch_large_posting_lag_matches --user-id <id> --apply
    python manage.py unmatch_large_posting_lag_matches --user-id <id> --apply --max-lag-days 5
"""
from django.core.management.base import BaseCommand, CommandError

REPAIR_REASON = (
    'Automated repair: this bank line was auto-matched to an ERP payment an '
    'implausibly large number of days away (posting_lag_days beyond the '
    'configured threshold) — a coincidental amount-only pick, not a genuine '
    'correspondence. Unmatched so the correct pairing can be found instead.'
)


class Command(BaseCommand):
    help = (
        "Frees matched=True bank lines whose claimed ERP payment has an "
        "implausibly large posting lag (days between the bank line's value "
        "date and the payment's own date). Leaves MANUAL matches untouched."
    )

    def add_arguments(self, parser):
        parser.add_argument('--user-id', type=int, required=True, help='User to attribute the unmatch action to.')
        parser.add_argument('--apply', action='store_true', help='Actually unmatch (default is a dry-run report).')
        parser.add_argument('--dry-run', action='store_true', help='Preview only — the default behaviour; accepted for explicitness.')
        parser.add_argument('--max-lag-days', type=int, default=3, help='Flag matches with |posting_lag_days| beyond this (default 3).')
        parser.add_argument('--bank-account-id', type=int, default=None, help='Restrict to a single bank account.')

    def handle(self, *args, **options):
        from django.contrib.auth import get_user_model
        from django.core.exceptions import ValidationError
        from django.db.models import Q

        from banks.models import ReconciliationBankTransaction

        User = get_user_model()
        try:
            acting_user = User.objects.get(pk=options['user_id'])
        except User.DoesNotExist:
            raise CommandError(f"No user with id={options['user_id']}")

        apply_changes = options['apply']
        max_lag_days = options['max_lag_days']
        bank_account_id = options['bank_account_id']

        qs = ReconciliationBankTransaction.objects.filter(
            matched=True,
            matched_erp_payment_id__isnull=False,
            posting_lag_days__isnull=False,
        ).exclude(match_confidence='MANUAL').filter(
            Q(posting_lag_days__gt=max_lag_days) | Q(posting_lag_days__lt=-max_lag_days)
        ).select_related('bank_account').order_by('value_date')
        if bank_account_id:
            qs = qs.filter(bank_account_id=bank_account_id)

        rows = list(qs)
        if not rows:
            self.stdout.write(self.style.SUCCESS(
                f'No matches with |posting_lag_days| > {max_lag_days} found.'
            ))
            return

        if not apply_changes:
            self.stdout.write(self.style.WARNING('DRY RUN — no changes will be saved.\n'))
        self.stdout.write(f'Found {len(rows)} large-posting-lag match(es) (threshold: {max_lag_days} days).\n')

        fixed = 0
        for tx in rows:
            self.stdout.write(
                f'  {"[DRY RUN] " if not apply_changes else ""}unmatching tx={tx.id} {tx.bank_account} '
                f'{tx.direction} ₦{tx.amount} on {tx.value_date} — matched to payment '
                f'{tx.matched_erp_payment_id} (posting_lag_days={tx.posting_lag_days}, '
                f'confidence={tx.match_confidence or "?"})'
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
        self.stdout.write(f'\n{action} {fixed} large-posting-lag match(es).')
