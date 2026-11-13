"""
Finds the penalty reductions the daily update_loan_status job posted before
2026-11-13, when it recomputed each overdue installment's penalty from
scratch and so reversed part of the already-charged penalty after every
repayment (Dr Penalty Income / Cr Loan Receivable, described as an ordinary
"Loan penalty accrual — <loan> (installment due …)").

Shared by audit_penalty_reduced_by_repayment (read-only report) and
restore_penalty_reduced_by_repayment (re-charges them), so both commands
always agree on exactly which entries count.
"""
import re
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, timedelta

DAILY_JOB_PREFIX = 'Loan penalty accrual — '
RESTORE_PREFIX = 'Loan penalty restored — '
OPEN_STATUSES = ('active', 'disbursed', 'defaulted')
_INSTALLMENT_RE = re.compile(r'\(installment due (\d{4}-\d{2}-\d{2})\)')


def restore_marker(txn):
    """Tag put in a restoring entry's description, naming the reduction it undoes."""
    return f'[restores {txn.reference_number or txn.pk}]'


@dataclass
class PenaltyReduction:
    loan: object          # LoanAccount
    entry: object         # TransactionEntry crediting loan.account
    repayment_driven: bool

    @property
    def txn(self):
        return self.entry.transaction

    @property
    def amount(self):
        return self.entry.amount

    @property
    def installment_due_date(self):
        m = _INSTALLMENT_RE.search(self.txn.description)
        return date.fromisoformat(m.group(1)) if m else None


def find_penalty_reductions(loan_number=None, window_days=7):
    """
    Every posted, non-reversed daily-job LNPEN entry that credited a loan's
    own Loan Receivable account, oldest first. repayment_driven is True when
    the same loan received a posted LNPMT repayment within window_days
    before it (the bug pattern).
    """
    from loans.models import LoanAccount
    from transactions.models import TransactionEntry

    window = timedelta(days=window_days)
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

    payment_dates = defaultdict(list)
    for account_id, txn_date in TransactionEntry.objects.filter(
        transaction__series__code='LNPMT',
        transaction__approved=True,
        transaction__is_reversal=False,
        transaction__is_reversed=False,
        side=TransactionEntry.CREDIT,
        account_id__in=list(loans_by_account),
    ).values_list('account_id', 'transaction__date'):
        payment_dates[account_id].append(txn_date)

    return [
        PenaltyReduction(
            loan=loans_by_account[e.account_id],
            entry=e,
            repayment_driven=any(
                e.transaction.date - window <= d <= e.transaction.date
                for d in payment_dates.get(e.account_id, ())
            ),
        )
        for e in entries
    ]
