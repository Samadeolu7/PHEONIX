"""
Management command: audit_penalty_income_reclass_legitimacy

Read-only. Triggered by LN-571: after correct_penalty_not_capped_at_payoff
zeroed its phantom penalty (69,416.43), the ledger still showed a real
balance — 30,604.46, the exact amount the client already paid off on
16 Jul 2026 (LNPMT-20260716-1046). The remaining debt traces to a THIRD,
separate bug: PENRC-20260724-0047, posted by draft_penalty_income_reclass,
which re-debited Loan Receivable by 30,604.44 on the theory that this amount
was "penalty income misrouted to Loan Receivable" (because the product's
penalty_income_account was NULL at the time).

Why that theory is very likely wrong for loans like LN-571: draft_penalty_
income_reclass's corrected version sums FinancialAuditLog(LOAN_REPAY).
extra['penalty'] per loan — the AGGREGATE penalty figure record_payment()
computed at payment time. But before 2026-08-05 (see LoanAccount.
record_payment()'s history / the "Penalty proportional split" fix),
record_payment() drained a payment against outstanding_penalties FIRST,
before principal/interest/fees. On a legacy-imported loan whose
outstanding_penalties was inflated by the SAME pre-cutover-seeding bug this
whole investigation has been chasing (see audit_penalty_not_capped_at_payoff),
a real payment that actually satisfied principal+interest+fees (confirmed by
the schedule showing those installments' principal_due/interest_due/fees_due
fully paid) could still get logged with a huge, fictitious extra['penalty']
figure at the AGGREGATE level, purely because the old "drain-penalty-first"
order + an inflated outstanding_penalties absorbed the whole payment before
ever reaching the aggregate principal/interest counters. The schedule-level
per-installment record and the aggregate FinancialAuditLog record can
disagree on the SAME payment, and draft_penalty_income_reclass only ever
trusted the aggregate one.

This command cross-checks every currently-posted (non-reversed) PENRC-series
transaction against LoanRepaymentAllocation — the per-(payment, installment)
ground truth created at payment time by LoanAccount._update_schedule_with_
payment() (see its own docstring: "record_payment() only mutates running
totals... nothing else remembers which installments a specific historical
payment affected or by how much. Without this row, reversing one payment out
of a loan's history isn't just imprecise, it's not mechanically possible.").
For each loan with a PENRC transaction, sums LoanRepaymentAllocation.
penalty_applied across its ENTIRE history (every real payment, not just the
one behind the reclass) — the most granular, installment-level record of
penalty actually collected — and flags any reclass whose amount exceeds that
lifetime real total (with tolerance) as ILLEGITIMATE: manufactured penalty
income and manufactured receivable debt with no real collection behind it.

Makes no changes — report only. Reversal (once confirmed) is
reverse_penalty_income_reclass_batch.py, which already exists for exactly
this series but currently reverses ALL non-reversed PENRC transactions
unconditionally — this audit is what tells you whether that's safe to run
as-is or whether some remaining PENRC entries are legitimate and should be
excluded.

Usage:
    python manage.py audit_penalty_income_reclass_legitimacy
    python manage.py audit_penalty_income_reclass_legitimacy --loan LN-571
"""
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db.models import Sum

SERIES_CODE = 'PENRC'
TOLERANCE = Decimal('0.01')


class Command(BaseCommand):
    help = (
        'Read-only: cross-checks every non-reversed PENRC (penalty income reclass) transaction '
        'against LoanRepaymentAllocation (the per-payment, per-installment ground truth) to find '
        'reclass entries larger than the real lifetime penalty ever actually collected on that loan.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--loan', dest='loan_number', default=None,
                             help='Only check a single loan by loan_number.')

    def handle(self, *args, **options):
        from loans.models import LoanAccount, LoanRepaymentAllocation
        from transactions.models import Transaction, TransactionSeries

        loan_number = options['loan_number']

        try:
            series = TransactionSeries.objects.get(code=SERIES_CODE)
        except TransactionSeries.DoesNotExist:
            self.stdout.write(self.style.SUCCESS(f"No '{SERIES_CODE}' series found — nothing to check."))
            return

        txns = Transaction.objects.filter(
            series=series, is_reversed=False, is_reversal=False,
        ).order_by('date', 'id')
        if loan_number:
            txns = txns.filter(description__icontains=f' {loan_number} ')

        illegitimate = []
        legitimate = []
        no_match = []

        for txn in txns:
            amount = txn.get_total_amount()

            # description format: "Penalty income reclass – {loan_number} (misrouted ...)"
            desc = txn.description or ''
            matched_loan = None
            for loan in LoanAccount.all_objects.filter(is_deleted=False):
                if f' {loan.loan_number} ' in f' {desc} ':
                    matched_loan = loan
                    break
            if not matched_loan:
                no_match.append(txn)
                continue

            lifetime_real_penalty = matched_loan.repayment_allocations.aggregate(
                total=Sum('penalty_applied')
            )['total'] or Decimal('0.00')

            if amount > lifetime_real_penalty + TOLERANCE:
                illegitimate.append((txn, matched_loan, amount, lifetime_real_penalty))
            else:
                legitimate.append((txn, matched_loan, amount, lifetime_real_penalty))

        total_illegitimate = sum(f[2] for f in illegitimate)

        self.stdout.write(self.style.ERROR(
            f'{len(illegitimate)} ILLEGITIMATE reclass transaction(s), total {total_illegitimate:,.2f} '
            '— reclass amount exceeds the loan\'s entire real lifetime penalty collection:\n'
        ))
        for txn, loan, amount, lifetime in illegitimate:
            self.stdout.write(
                f'  {txn.reference_number:24s} [{loan.loan_number}]  reclass_amount={amount:>12,.2f}  '
                f'lifetime_real_penalty_applied={lifetime:>12,.2f}  date={txn.date}'
            )

        if legitimate:
            self.stdout.write(self.style.SUCCESS(
                f'\n{len(legitimate)} transaction(s) look legitimate (reclass amount <= real lifetime penalty):'
            ))
            for txn, loan, amount, lifetime in legitimate:
                self.stdout.write(
                    f'  {txn.reference_number:24s} [{loan.loan_number}]  reclass_amount={amount:>12,.2f}  '
                    f'lifetime_real_penalty_applied={lifetime:>12,.2f}'
                )

        if no_match:
            self.stdout.write(self.style.WARNING(
                f'\n{len(no_match)} transaction(s) could not be matched to a loan by description — needs manual look:'
            ))
            for txn in no_match:
                self.stdout.write(f'  {txn.reference_number:24s} "{txn.description}"')

        self.stdout.write(self.style.WARNING(
            f'\nNo changes made. Reversal tool: reverse_penalty_income_reclass_batch.py — it currently '
            'reverses ALL non-reversed PENRC transactions unconditionally, so only use it once you\'ve '
            'confirmed (via this report) that every remaining one is actually illegitimate, or modify it '
            'to target only the reference_numbers listed above.'
        ))
