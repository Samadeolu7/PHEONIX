"""
Management command: reverse_penalty_income_reclass_batch

EMERGENCY UNDO for `draft_penalty_income_reclass --apply` (run 2026-07-24).
That command used sum(LoanRepaymentSchedule.penalty_paid) as "penalty cash
misrouted into Loan Receivable" — but LoanRepaymentSchedule.penalty_paid is
computed by a broken proportional allocation in
LoanAccount._update_schedule_with_payment() (it ignores the actual
penalty/interest/fees/principal split computed in record_payment() and
recomputes its own ratio-based split instead), so it does NOT correspond to
real GL-posted penalty amounts. Confirmed on LN-659: the reclass debited its
receivable account 671,599.91, but that account has only ever received
97,333.32 in total credits across its entire history — the reclass amount
is larger than everything ever posted to the account. Every PENRC-series
transaction from that run needs reversing.

Uses Transaction.reverse() (the same mechanism as the app's own "reverse
transaction" UI/API action) so each reversal is a proper linked opposite
entry, not a raw delete — full audit trail preserved.

Usage:
    python manage.py reverse_penalty_income_reclass_batch                # dry-run
    python manage.py reverse_penalty_income_reclass_batch --confirm      # reverses them
"""
from decimal import Decimal

from django.core.management.base import BaseCommand


SERIES_CODE = 'PENRC'
REASON = (
    "Reclass amount was computed from LoanRepaymentSchedule.penalty_paid, which "
    "_update_schedule_with_payment() populates via a broken proportional allocation "
    "unrelated to actual GL-posted penalty amounts (confirmed: reclass debit exceeded "
    "the receivable account's entire lifetime credit total on LN-659). Reversing "
    "pending a corrected calculation based on LoanAccount.penalties_paid."
)


class Command(BaseCommand):
    help = 'Reverse all PENRC-series (penalty income reclass) transactions posted by the flawed draft_penalty_income_reclass run.'

    def add_arguments(self, parser):
        parser.add_argument('--confirm', action='store_true',
                             help='Actually reverse. Without this, only lists what would be reversed.')

    def handle(self, *args, **options):
        from transactions.models import Transaction, TransactionSeries

        confirm = options['confirm']

        try:
            series = TransactionSeries.objects.get(code=SERIES_CODE)
        except TransactionSeries.DoesNotExist:
            self.stdout.write(self.style.SUCCESS(f"No '{SERIES_CODE}' series found — nothing to reverse."))
            return

        txns = Transaction.objects.filter(series=series, is_reversed=False, is_reversal=False)
        count = txns.count()

        if count == 0:
            self.stdout.write(self.style.SUCCESS('Nothing to reverse.'))
            return

        total = sum((t.get_total_amount() for t in txns), Decimal('0.00'))
        for t in txns:
            self.stdout.write(f"  {t.reference_number:30s} {t.date} amount={t.get_total_amount():>14,.2f}  \"{t.description}\"")
        self.stdout.write(self.style.WARNING(f"\n{count} transaction(s), total {total:,.2f}"))

        if not confirm:
            self.stdout.write(self.style.WARNING('\nDRY-RUN — nothing reversed. Re-run with --confirm to reverse all of the above.'))
            return

        reversed_count = 0
        for t in txns:
            t.reverse(user=None, reason=REASON)
            reversed_count += 1

        self.stdout.write(self.style.SUCCESS(f'\nReversed {reversed_count} transaction(s).'))
