"""
Finds the penalty reductions the daily update_loan_status job posted before
2026-11-13, when it recomputed each overdue installment's penalty from
scratch and so reversed part of the already-charged penalty after every
repayment (Dr Penalty Income / Cr Loan Receivable, described as an ordinary
"Loan penalty accrual — <loan> (installment due …)").

Shared by audit_penalty_reduced_by_repayment (read-only report) and
restore_penalty_reduced_by_repayment (reverses them), so both commands
always agree on exactly which entries count.

Not every such reduction was the bug: some were the job correcting a penalty
that had genuinely been overcharged (e.g. right after the 2026-08-13 cutover
change or the 2026-08-22 formula fixes). So each reduction is VERIFIED
against the repayment that should have caused it, using
LoanRepaymentAllocation (exactly how much of each repayment went to each
installment, and when; recorded since 2026-08-05):

  - paid = principal + interest + fees applied to THIS installment by
    repayments recorded between the job's previous entry for the installment
    and this one;
  - the old formula was  penalty = rate% x unpaid balance x periods late,
    so the reduction it should have produced is
        rate% x (balance_after x periods_now - (balance_after + paid) x periods_before)
  - CONFIRMED only when the actual reduction matches that to within ₦1 (or
    1%). Anything else is left alone for manual review, with the reason.
"""
import re
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal

DAILY_JOB_PREFIX = 'Loan penalty accrual — '
OPEN_STATUSES = ('active', 'disbursed', 'defaulted')
_INSTALLMENT_RE = re.compile(r'\(installment due (\d{4}-\d{2}-\d{2})\)')

CONFIRMED = 'confirmed: caused by a repayment'
NO_INSTALLMENT = 'installment not found'
NO_PAYMENT = 'no repayment on this installment before it'
PAYMENT_REVERSED = 'the repayment was later reversed'
FIXED_PENALTY = 'fixed penalty — repayments cannot change it'
MISMATCH = 'amount does not match the repayment'

_CENT = Decimal('0.01')
# How far back to look for a repayment when the job has no earlier entry for
# the installment to bound the search.
_FIRST_ENTRY_LOOKBACK = timedelta(days=7)


@dataclass
class PenaltyReduction:
    loan: object          # LoanAccount
    entry: object         # TransactionEntry crediting loan.account
    verdict: str = ''
    sched: object = None  # LoanRepaymentSchedule, when found
    paid: Decimal = Decimal('0.00')
    expected: Decimal = None   # reduction the repayment explains, when computed
    details: dict = field(default_factory=dict)

    @property
    def txn(self):
        return self.entry.transaction

    @property
    def amount(self):
        return self.entry.amount

    @property
    def repayment_driven(self):
        return self.verdict == CONFIRMED

    @property
    def installment_due_date(self):
        m = _INSTALLMENT_RE.search(self.txn.description)
        return date.fromisoformat(m.group(1)) if m else None


def _q(value):
    return value.quantize(_CENT, rounding=ROUND_HALF_UP)


def _non_penalty(alloc):
    return alloc.principal_applied + alloc.interest_applied + alloc.fees_applied


def verify_reduction(r):
    """Set r.verdict (and the supporting numbers) for one reduction."""
    from loans.models import LoanRepaymentAllocation
    from transactions.models import Transaction

    loan, txn = r.loan, r.txn
    due = r.installment_due_date
    sched = None
    if due:
        sched = (
            loan.repayment_schedule.filter(due_date=due, is_deleted=False)
            .order_by('installment_number').first()
        )
    r.sched = sched
    if sched is None:
        r.verdict = NO_INSTALLMENT
        return r

    product = loan.product
    if product.late_payment_penalty_type == 'fixed':
        r.verdict = FIXED_PENALTY
        return r

    # The job's previous entry for this same installment (either direction,
    # including ones a correction later reversed: the run still happened).
    # Between two entries the balance and period count were unchanged, so
    # only repayments recorded in that gap can explain this one.
    prev = (
        Transaction.objects.filter(
            series__code='LNPEN',
            description=txn.description,
            is_reversal=False,
            created_at__lt=txn.created_at,
        )
        .order_by('-created_at').values_list('created_at', flat=True).first()
    )
    lower = prev or (txn.created_at - _FIRST_ENTRY_LOOKBACK)

    allocs = list(
        LoanRepaymentAllocation.objects.filter(schedule=sched)
        .select_related('journal_entry')
    )
    in_gap = [a for a in allocs if lower < a.created_at < txn.created_at]
    paid = sum((_non_penalty(a) for a in in_gap), Decimal('0.00'))
    r.paid = paid
    if paid <= 0:
        r.verdict = NO_PAYMENT
        return r
    if any(a.journal_entry.is_reversed for a in in_gap):
        r.verdict = PAYMENT_REVERSED
        return r

    # Unpaid balance right after this run = unpaid now + whatever was paid
    # on this installment after the run (and not since reversed).
    remaining_now = max(Decimal('0.00'), (
        (sched.principal_due + sched.interest_due + sched.fees_due)
        - (sched.principal_paid + sched.interest_paid + sched.fees_paid)
    ))
    balance_after = remaining_now + sum(
        (_non_penalty(a) for a in allocs
         if a.created_at >= txn.created_at and not a.journal_entry.is_reversed),
        Decimal('0.00'),
    )
    balance_before = balance_after + paid

    def periods_at(d):
        if product.effective_days_late(sched.due_date, d) <= product.grace_period_days:
            return 0
        return loan.periods_late_for_installment(sched, d)

    run_date = txn.date
    periods_now = periods_at(run_date)
    periods_before = periods_at(run_date - timedelta(days=1))
    rate = product.late_payment_penalty
    expected = (
        _q(rate * balance_before * periods_before / 100)
        - _q(rate * balance_after * periods_now / 100)
    )
    r.expected = expected
    r.details = {
        'rate': rate, 'balance_before': balance_before, 'balance_after': balance_after,
        'periods_before': periods_before, 'periods_now': periods_now,
    }
    tolerance = max(Decimal('1.00'), r.amount * Decimal('0.01'))
    r.verdict = CONFIRMED if abs(expected - r.amount) <= tolerance else MISMATCH
    return r


def find_penalty_reductions(loan_number=None):
    """
    Every posted, non-reversed daily-job LNPEN entry that credited a loan's
    own Loan Receivable account, oldest first, each verified (see module
    docstring). Only verdict == CONFIRMED is the bug.
    """
    from loans.models import LoanAccount
    from transactions.models import TransactionEntry

    loans = LoanAccount.all_objects.filter(is_deleted=False).select_related('client', 'product')
    if loan_number:
        loans = loans.filter(loan_number=loan_number)
    loans_by_account = {loan.account_id: loan for loan in loans}
    if not loans_by_account:
        return []

    entries = (
        TransactionEntry.objects.filter(
            transaction__series__code='LNPEN',
            transaction__approved=True,
            transaction__description__startswith=DAILY_JOB_PREFIX,
            transaction__is_reversal=False,
            transaction__is_reversed=False,
            side=TransactionEntry.CREDIT,
            account_id__in=list(loans_by_account),
        )
        .select_related('transaction')
        .order_by('transaction__date', 'transaction_id')
    )

    return [
        verify_reduction(PenaltyReduction(loan=loans_by_account[e.account_id], entry=e))
        for e in entries
    ]
