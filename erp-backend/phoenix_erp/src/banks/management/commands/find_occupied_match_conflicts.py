"""
banks/management/commands/find_occupied_match_conflicts.py
=============================================================
Finds unattached bank lines (matched=False) whose true counterpart ERP
payment is sitting right there in the window, same amount — but currently
held by a DIFFERENT bank transaction, so it never shows up as a link
candidate at all. This is exactly the pattern reported live: "the payment
I needed wasn't coming up as a candidate because it was already matched to
something else, so I had to unmatch that one first to free it."

Rather than discovering these one at a time via ad hoc Payment Trace
searches, this scans every currently-unattached line at once and reports
each occupied conflict: the line, the payment it should plausibly claim,
and the OTHER bank transaction currently holding that payment (with enough
narration/date context to judge whether that other match is actually the
wrong one).

This is READ-ONLY. Deciding which occupying match is wrong needs a human
comparing narrations — automating that guess is exactly the kind of call
this whole investigation found gets made silently wrong (see
AUTO_MATCH_MIN_CONFIDENCE, banks/tasks.py). Once you've identified which
occupying transaction to free, use:

    python manage.py unmatch_transaction_by_id --tx-id <uuid> --user-id <id> --reason "..."

then the freed payment becomes a normal link candidate for the correct
line (re-run audit_unattached_statement_lines or confirm_unambiguous_
ghost_matches to pick it up).

Usage:
    python manage.py find_occupied_match_conflicts
    python manage.py find_occupied_match_conflicts --bank-account=3
"""
from __future__ import annotations

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = (
        "Reports unattached bank lines whose true-candidate ERP payment is "
        "currently held by a different bank transaction, so it never shows "
        "up as a link candidate. Read-only."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--bank-account', type=int, default=None,
            help='Restrict to a single BankAccount id.',
        )

    def handle(self, *args, **options):
        from banks.models import ReconciliationBankTransaction
        from banks.reconciliation_utils import find_occupied_erp_candidates

        bank_account_id = options['bank_account']

        qs = ReconciliationBankTransaction.objects.filter(matched=False)
        if bank_account_id:
            qs = qs.filter(bank_account_id=bank_account_id)
        qs = qs.select_related('bank_account').order_by('value_date')

        lines = list(qs)
        if not lines:
            self.stdout.write(self.style.SUCCESS('No unattached statement lines to check.'))
            return

        conflicts_found = 0
        for tx in lines:
            occupied = find_occupied_erp_candidates(tx)
            if not occupied:
                continue
            conflicts_found += 1
            self.stdout.write(
                f'[CONFLICT] tx={tx.id} {tx.bank_account} {tx.direction} ₦{tx.amount} '
                f'on {tx.value_date}'
            )
            self.stdout.write(f'    narration: {tx.narration[:120]!r}')
            for payment, occupying_tx in occupied:
                self.stdout.write(
                    f'    -> paymentId={payment["paymentId"]} {payment["paymentDate"]} '
                    f'officer={payment["officerName"]!r} narration={payment["narration"][:100]!r}'
                )
                self.stdout.write(
                    f'       currently held by tx={occupying_tx.id} on {occupying_tx.value_date} '
                    f'(confidence={occupying_tx.match_confidence or "?"}) '
                    f'narration={occupying_tx.narration[:100]!r}'
                )
                self.stdout.write(
                    f'       to free: python manage.py unmatch_transaction_by_id '
                    f'--tx-id {occupying_tx.id} --user-id <id> --reason "..."'
                )
            self.stdout.write('')

        if conflicts_found == 0:
            self.stdout.write(self.style.SUCCESS('No occupied-candidate conflicts found.'))
        else:
            self.stdout.write(f'Found {conflicts_found} line(s) with an occupied-candidate conflict.')
