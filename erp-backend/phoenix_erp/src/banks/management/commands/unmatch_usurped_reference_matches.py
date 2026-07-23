"""
banks/management/commands/unmatch_usurped_reference_matches.py
=================================================================
Systematically frees "usurped" matches — the generalization of the
payment-1685 case found live: a bank line holds a payment whose own
embedded reference contradicts it, while a DIFFERENT, currently-unmatched
bank line's narration actually contains that reference. The holder is
provably wrong and the true owner is provably waiting, so the hold can be
freed without a human having to spot each case in Payment Trace one at a
time (find_occupied_match_conflicts only catches the subset where the two
lines coincidentally share a digit-heavy token — this covers the rest).

A line is only freed when ALL of these hold:
  - matched=True with a real, still-valid payment (missing/invalid
    payments are unmatch_double_blocked_matches' job, not this one's);
  - match_confidence != 'MANUAL' — director-confirmed pairings are never
    bulk-undone;
  - the payment has an explicit embedded reference
    (reference_mismatches_bank_line returns True — an absent reference is
    not evidence of anything);
  - EXACTLY ONE unmatched line on the same bank account, with the same
    amount and direction, is reference-CONFIRMED for that payment
    (reference_confirms_bank_line). Zero confirmers means the true owner
    hasn't arrived/settled yet — freeing the hold would only reopen churn;
    two-plus confirmers is genuinely ambiguous and needs a human.

Freeing uses the standard audited unmatch() (bank_only + erp_only
exception pair reopened), after which a reconciliation rerun lets the
matcher pair the payment with its reference-confirmed true owner.

Usage:
    python manage.py unmatch_usurped_reference_matches --user-id <id> --dry-run
    python manage.py unmatch_usurped_reference_matches --user-id <id> --apply
"""
from django.core.management.base import BaseCommand, CommandError

REPAIR_REASON = (
    'Automated repair: the ERP payment this line held has an explicit '
    'embedded reference that does not correspond to this line, and exactly '
    'one currently-unmatched bank line contains that reference — this line '
    'was blocking the payment\'s true owner. Freed so the correct pairing '
    'can be made on rerun.'
)


class Command(BaseCommand):
    help = (
        "Frees matched lines whose payment's embedded reference contradicts "
        "them while exactly one unmatched line (same account/amount/"
        "direction) is reference-confirmed as the true owner. Leaves MANUAL "
        "matches and ambiguous cases untouched."
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
        from banks.reconciliation_utils import (
            reference_confirms_bank_line,
            reference_mismatches_bank_line,
        )
        from transactions.models import Transaction

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

        payments_by_id = {
            t.id: t for t in Transaction.objects.filter(
                id__in={tx.matched_erp_payment_id for tx in rows},
                approved=True, is_deleted=False,
            )
        }

        if not apply_changes:
            self.stdout.write(self.style.WARNING('DRY RUN — no changes will be saved.\n'))
        self.stdout.write(f'Scanning {len(rows)} auto-matched line(s) for usurped references...\n')

        freed = 0
        waiting = 0
        ambiguous = 0
        for tx in rows:
            payment = payments_by_id.get(tx.matched_erp_payment_id)
            if payment is None:
                continue  # invalid payment — unmatch_double_blocked_matches territory
            if not reference_mismatches_bank_line(tx, payment):
                continue  # reference corresponds (or none to check) — leave alone

            confirmers = [
                other for other in ReconciliationBankTransaction.objects.filter(
                    bank_account_id=tx.bank_account_id, matched=False,
                    amount=tx.amount, direction=tx.direction,
                )
                if reference_confirms_bank_line(other, payment)
            ]

            if not confirmers:
                waiting += 1
                continue  # true owner not visible yet — don't churn

            if len(confirmers) > 1:
                ambiguous += 1
                self.stdout.write(self.style.WARNING(
                    f'  AMBIGUOUS tx={tx.id} payment={payment.id} — '
                    f'{len(confirmers)} unmatched line(s) all contain its reference; needs a human.'
                ))
                continue

            true_owner = confirmers[0]
            self.stdout.write(
                f'  {"[DRY RUN] " if not apply_changes else ""}freeing tx={tx.id} {tx.bank_account} '
                f'{tx.direction} ₦{tx.amount} on {tx.value_date} — holds payment {payment.id} '
                f'whose reference does not correspond; true owner waiting: '
                f'tx={true_owner.id} on {true_owner.value_date} ({true_owner.narration[:70]!r})'
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
        self.stdout.write(
            f'\n{action} {freed} usurped match(es); {ambiguous} ambiguous (2+ confirmers) left '
            f'for review; {waiting} mismatched hold(s) with no visible true owner left alone.'
        )
        if apply_changes and freed:
            self.stdout.write(
                'Re-run reconciliation for the affected account(s) so the freed payments '
                'pair with their reference-confirmed true owners.'
            )
