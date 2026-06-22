# loans/schedule_service.py
"""
Repayment schedule generation.

Extracted from LoanAccount model so the logic is independently testable
and not entangled with Django model internals.

Public API
----------
RepaymentScheduleService.generate(loan)   — builds + persists schedule rows
RepaymentScheduleService.preview(...)     — returns rows without touching DB
"""
from __future__ import annotations

from datetime import timedelta
from decimal import Decimal, ROUND_HALF_UP

from dateutil.relativedelta import relativedelta


# ── Frequency configuration ───────────────────────────────────────────────────

# Maps repayment_frequency → (date increment, periods per year, period length in days)
FREQ_CONFIG: dict[str, tuple] = {
    'daily':     (relativedelta(days=1),   Decimal('365'), 1),
    'weekly':    (relativedelta(weeks=1),  Decimal('52'),  7),
    'biweekly':  (relativedelta(weeks=2),  Decimal('26'),  14),
    'monthly':   (relativedelta(months=1), Decimal('12'),  30),
    'quarterly': (relativedelta(months=3), Decimal('4'),   91),
}

_DEFAULT_FREQ = (relativedelta(months=1), Decimal('12'), 30)


def _term_to_days(term_value: int, term_unit: str) -> int:
    """Convert a term expressed in days/weeks/months to an approximate day count."""
    if term_unit == 'weeks':
        return term_value * 7
    if term_unit == 'days':
        return term_value
    # months — approximate
    return term_value * 30


def _term_to_years(term_value: int, term_unit: str) -> Decimal:
    """Convert term to a fraction of a year for interest calculations."""
    v = Decimal(str(term_value))
    if term_unit == 'weeks':
        return v / Decimal('52')
    if term_unit == 'days':
        return v / Decimal('365')
    return v / Decimal('12')


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

        date_increment, periods_per_year, period_days = FREQ_CONFIG.get(frequency, _DEFAULT_FREQ)

        # ── Installment count from term ───────────────────────────────────────
        total_days       = _term_to_days(term_value, term_unit)
        num_installments = max(1, round(total_days / period_days))

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

        # ── Date generation with first-repayment buffer ───────────────────────
        first_due = loan.disbursement_date + date_increment
        if buffer_days > 0:
            buffer_end = loan.disbursement_date + timedelta(days=buffer_days)
            while first_due < buffer_end:
                first_due += date_increment

        # Step back one period so the loop below adds correctly on i=1
        current_date = first_due - date_increment

        for i, row in enumerate(rows, start=1):
            current_date = current_date + date_increment
            LoanRepaymentSchedule.objects.create(
                loan=loan,
                installment_number=i,
                due_date=current_date,
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
        date_increment, periods_per_year, period_days = FREQ_CONFIG.get(
            repayment_frequency, _DEFAULT_FREQ
        )
        total_days       = _term_to_days(term_value, term_unit)
        num_installments = max(1, round(total_days / period_days))

        if calculation_method == 'reducing_balance':
            rows = reducing_balance_schedule(
                disbursed_amount, interest_rate, num_installments, periods_per_year
            )
        else:
            rows = flat_schedule(
                disbursed_amount, interest_rate, term_value, term_unit, num_installments
            )

        if disbursement_date:
            first_due = disbursement_date + date_increment
            if first_repayment_buffer_days > 0:
                buffer_end = disbursement_date + timedelta(days=first_repayment_buffer_days)
                while first_due < buffer_end:
                    first_due += date_increment
            current = first_due - date_increment
            for i, row in enumerate(rows, start=1):
                current = current + date_increment
                row['installment_number'] = i
                row['due_date'] = current
        else:
            for i, row in enumerate(rows, start=1):
                row['installment_number'] = i

        return rows
