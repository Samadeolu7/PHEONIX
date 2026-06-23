# loans/schedule_service.py
"""
Repayment schedule generation.

Extracted from LoanAccount model so the logic is independently testable
and not entangled with Django model internals.

Public API
----------
RepaymentScheduleService.generate(loan)   — builds + persists schedule rows
RepaymentScheduleService.preview(...)     — returns rows without touching DB

Installment count calculation
------------------------------
Installments are counted by date, not by dividing days by a period length.
Given a loan term and disbursement date:
  1. Compute the exact maturity date using calendar arithmetic (relativedelta).
  2. Step through payment dates from the first due date (honouring any buffer)
     to the maturity date, advancing by one frequency period each step.
  3. The count of those dates is the number of installments.

This means:
  • Monthly frequency + 6-month term  → exactly 6 installments
  • Weekly  frequency + 3-month term  → however many Mondays (or whatever day)
    fall within the 3-month window after the optional buffer period
  • The buffer period shifts the first payment forward; dates consumed by the
    buffer are naturally removed from the count, so the schedule never runs
    past the loan's maturity date.
"""
from __future__ import annotations

from datetime import timedelta
from decimal import Decimal, ROUND_HALF_UP

from dateutil.relativedelta import relativedelta


# ── Frequency configuration ───────────────────────────────────────────────────

# Maps repayment_frequency → (date increment, periods per year)
FREQ_CONFIG: dict[str, tuple] = {
    'daily':     (relativedelta(days=1),   Decimal('365')),
    'weekly':    (relativedelta(weeks=1),  Decimal('52')),
    'biweekly':  (relativedelta(weeks=2),  Decimal('26')),
    'monthly':   (relativedelta(months=1), Decimal('12')),
    'quarterly': (relativedelta(months=3), Decimal('4')),
}

_DEFAULT_FREQ = (relativedelta(months=1), Decimal('12'))


def _term_to_years(term_value: int, term_unit: str) -> Decimal:
    """Convert term to a fraction of a year for interest calculations."""
    v = Decimal(str(term_value))
    if term_unit == 'weeks':
        return v / Decimal('52')
    if term_unit == 'days':
        return v / Decimal('365')
    return v / Decimal('12')


def _maturity_date(start_date, term_value: int, term_unit: str):
    """Return the exact maturity date using calendar arithmetic."""
    if term_unit == 'weeks':
        return start_date + relativedelta(weeks=term_value)
    if term_unit == 'days':
        return start_date + timedelta(days=term_value)
    return start_date + relativedelta(months=term_value)


def _build_due_dates(disbursement_date, date_increment, maturity_date, buffer_days: int) -> list:
    """
    Return the list of payment due dates for a loan.

    Steps forward by date_increment from the first due date (after any buffer)
    until the maturity date is reached.  The maturity date is inclusive so the
    final installment can fall exactly on it.
    """
    first_due = disbursement_date + date_increment
    if buffer_days > 0:
        buffer_end = disbursement_date + timedelta(days=buffer_days)
        while first_due < buffer_end:
            first_due += date_increment

    due_dates = []
    current = first_due
    while current <= maturity_date:
        due_dates.append(current)
        current += date_increment

    # Always at least one payment even if the buffer consumed the whole term
    if not due_dates:
        due_dates = [first_due]

    return due_dates


# ── Pure schedule builders (no DB access) ────────────────────────────────────

def flat_schedule(
    disbursed_amount: Decimal,
    interest_rate: Decimal,
    term_value: int,
    term_unit: str,
    num_installments: int,
) -> list[dict]:
    """
    Flat / straight-line schedule.

    Interest = principal × annual_rate × (term as fraction of year).
    Each installment gets an equal share; the last row absorbs rounding.

    Returns a list of dicts: [{principal_due, interest_due, total_due}, ...]
    """
    rate = interest_rate / Decimal('100')
    term_years = _term_to_years(term_value, term_unit)
    total_interest = (disbursed_amount * rate * term_years).quantize(
        Decimal('0.01'), rounding=ROUND_HALF_UP
    )
    total_repayable = disbursed_amount + total_interest

    n = Decimal(str(num_installments))
    base_principal = (disbursed_amount  / n).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    base_interest  = (total_interest    / n).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    base_total     = (total_repayable   / n).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    rows = [
        {'principal_due': base_principal, 'interest_due': base_interest, 'total_due': base_total}
        for _ in range(num_installments - 1)
    ]
    # Last installment absorbs rounding differences
    rows.append({
        'principal_due': disbursed_amount - base_principal * (num_installments - 1),
        'interest_due':  total_interest   - base_interest  * (num_installments - 1),
        'total_due':     total_repayable  - base_total     * (num_installments - 1),
    })
    return rows


def reducing_balance_schedule(
    disbursed_amount: Decimal,
    interest_rate: Decimal,
    num_installments: int,
    periods_per_year: Decimal,
) -> list[dict]:
    """
    Reducing-balance (amortising) schedule.

    Each period's interest is computed on the remaining principal so that
    principal rises and interest falls over the life of the loan.

    Returns a list of dicts: [{principal_due, interest_due, total_due}, ...]
    """
    annual_rate = interest_rate / Decimal('100')
    period_rate = annual_rate / periods_per_year
    balance = disbursed_amount
    n = num_installments

    if period_rate > 0:
        factor = (1 + period_rate) ** n
        emi = (balance * period_rate * factor / (factor - 1)).quantize(
            Decimal('0.01'), rounding=ROUND_HALF_UP
        )
    else:
        emi = (balance / Decimal(str(n))).quantize(
            Decimal('0.01'), rounding=ROUND_HALF_UP
        )

    rows = []
    for i in range(n):
        interest = (balance * period_rate).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        if i == n - 1:
            # Final installment: clear any residual rounding
            principal = balance
            total = (balance + interest).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        else:
            principal = (emi - interest).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
            principal = max(Decimal('0'), min(principal, balance))
            total = emi
        rows.append({'principal_due': principal, 'interest_due': interest, 'total_due': total})
        balance = (balance - principal).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    return rows


# ── Main service ──────────────────────────────────────────────────────────────

class RepaymentScheduleService:
    """
    Generates and persists the repayment schedule for a LoanAccount.

    Usage::

        RepaymentScheduleService.generate(loan_account)

    This is called from LoanAccount._generate_repayment_schedule() which is
    itself called inside LoanAccount.disburse().
    """

    @classmethod
    def generate(cls, loan) -> None:
        """
        Build and persist the full amortisation schedule for `loan`.

        Reads from:
            loan.term_months            — raw term value
            loan.term_unit              — 'days' | 'weeks' | 'months'
            loan.repayment_frequency    — 'daily' | 'weekly' | … | 'quarterly'
            loan.disbursement_date      — start date
            loan.disbursed_amount       — principal
            loan.interest_rate          — annual rate (%)
            loan.product.interest_calculation_method
            loan.product.first_repayment_buffer_days

        Writes to:
            loan.number_of_installments
            loan.installment_amount
            LoanRepaymentSchedule rows (created fresh)
        """
        from .models import LoanRepaymentSchedule

        term_value  = loan.term_months
        term_unit   = getattr(loan, 'term_unit', 'months') or 'months'
        frequency   = loan.repayment_frequency
        buffer_days = int(getattr(loan.product, 'first_repayment_buffer_days', 0) or 0)

        date_increment, periods_per_year = FREQ_CONFIG.get(frequency, _DEFAULT_FREQ)

        # ── Due dates: step from first payment to maturity ────────────────────
        maturity = _maturity_date(loan.disbursement_date, term_value, term_unit)
        due_dates = _build_due_dates(loan.disbursement_date, date_increment, maturity, buffer_days)
        num_installments = len(due_dates)

        loan.number_of_installments = num_installments

        # ── Compute amounts ───────────────────────────────────────────────────
        method = loan.product.interest_calculation_method
        if method == 'reducing_balance':
            rows = reducing_balance_schedule(
                loan.disbursed_amount,
                Decimal(str(loan.interest_rate)),
                num_installments,
                periods_per_year,
            )
        else:
            rows = flat_schedule(
                loan.disbursed_amount,
                Decimal(str(loan.interest_rate)),
                term_value,
                term_unit,
                num_installments,
            )

        loan.installment_amount = rows[0]['total_due'] if rows else Decimal('0')
        loan.save()

        # ── Persist schedule rows ─────────────────────────────────────────────
        for i, (row, due_date) in enumerate(zip(rows, due_dates), start=1):
            LoanRepaymentSchedule.objects.create(
                loan=loan,
                installment_number=i,
                due_date=due_date,
                principal_due=row['principal_due'],
                interest_due=row['interest_due'],
                total_due=row['total_due'],
                owner=loan.owner,
                branch=loan.branch,
                created_by=loan.created_by,
            )

    @classmethod
    def preview(
        cls,
        disbursed_amount: Decimal,
        interest_rate: Decimal,
        term_value: int,
        term_unit: str,
        repayment_frequency: str,
        calculation_method: str,
        first_repayment_buffer_days: int = 0,
        disbursement_date=None,
    ) -> list[dict]:
        """
        Return schedule rows without touching the database.
        Useful for previewing a schedule before disbursement.

        Each returned dict has: installment_number, due_date (if
        disbursement_date supplied), principal_due, interest_due, total_due.
        """
        from datetime import date as date_cls

        date_increment, periods_per_year = FREQ_CONFIG.get(repayment_frequency, _DEFAULT_FREQ)

        if disbursement_date:
            maturity = _maturity_date(disbursement_date, term_value, term_unit)
            due_dates = _build_due_dates(
                disbursement_date, date_increment, maturity, first_repayment_buffer_days
            )
            num_installments = len(due_dates)
        else:
            # No disbursement date: fall back to approximate count for display
            from datetime import date as _date
            today = _date.today()
            maturity = _maturity_date(today, term_value, term_unit)
            due_dates_approx = _build_due_dates(
                today, date_increment, maturity, first_repayment_buffer_days
            )
            num_installments = len(due_dates_approx)
            due_dates = None

        if calculation_method == 'reducing_balance':
            rows = reducing_balance_schedule(
                disbursed_amount, interest_rate, num_installments, periods_per_year
            )
        else:
            rows = flat_schedule(
                disbursed_amount, interest_rate, term_value, term_unit, num_installments
            )

        if due_dates:
            for i, (row, due_date) in enumerate(zip(rows, due_dates), start=1):
                row['installment_number'] = i
                row['due_date'] = due_date
        else:
            for i, row in enumerate(rows, start=1):
                row['installment_number'] = i

        return rows
