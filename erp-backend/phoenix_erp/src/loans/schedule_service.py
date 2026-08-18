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
  2. Step through payment dates from the first naturally-occurring due date
     (disbursement + one frequency period, buffer NOT applied yet) to that
     maturity date, advancing by one frequency period each step.
  3. The count of those dates is the number of installments — always driven
     purely by term ÷ frequency, never by the buffer.
  4. Only then is the buffer applied: every due date in the list (including
     the effective maturity) is shifted forward by buffer_days as a block.

This means:
  • Monthly frequency + 6-month term  → exactly 6 installments, regardless
    of buffer.
  • Weekly  frequency + 3-month term  → however many Mondays (or whatever
    day) fall within the 3-month window, regardless of buffer.
  • The buffer delays the whole schedule (and therefore pushes the loan's
    effective maturity out by the same amount) — it never eats an
    installment. E.g. weekly frequency + 7-day buffer still yields the
    installment count implied by the term; it just moves every due date,
    including the last one, one week later than it would otherwise land.
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

    Steps forward by date_increment from the first naturally-occurring due
    date until the (unbuffered) maturity date is reached — this fixes the
    installment count from term ÷ frequency alone.  The buffer is then
    applied as a uniform shift across every date in the list, so it delays
    the schedule without ever dropping an installment.
    """
    first_due = disbursement_date + date_increment

    due_dates = []
    current = first_due
    while current <= maturity_date:
        due_dates.append(current)
        current += date_increment

    # Always at least one payment even for a term shorter than one period
    if not due_dates:
        due_dates = [first_due]

    if buffer_days > 0:
        shift = timedelta(days=buffer_days)
        due_dates = [d + shift for d in due_dates]

    return due_dates


# ── Pure schedule builders (no DB access) ────────────────────────────────────

def flat_schedule(
    disbursed_amount: Decimal,
    interest_rate: Decimal,
    num_installments: int,
) -> list[dict]:
    """
    Flat / straight-line schedule.

    Interest = principal × rate%.  The rate is the total flat percentage of
    the loan amount — NOT an annual rate — so no term weighting is applied.
    Each installment gets an equal share; the last row absorbs rounding.

    Returns a list of dicts: [{principal_due, interest_due, total_due}, ...]
    """
    rate = interest_rate / Decimal('100')
    total_interest = (disbursed_amount * rate).quantize(
        Decimal('0.01'), rounding=ROUND_HALF_UP
    )

    n = Decimal(str(num_installments))
    base_principal = (disbursed_amount  / n).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    base_interest  = (total_interest    / n).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    # total_due is derived from the rounded components, never rounded on its
    # own — three independent quantize() calls (principal, interest, total)
    # can each round in a different direction and leave total_due a cent off
    # from principal_due + interest_due, which later shows up as an
    # unbalanced GL posting when a payment closes out that installment.
    base_total = base_principal + base_interest

    rows = [
        {'principal_due': base_principal, 'interest_due': base_interest, 'total_due': base_total}
        for _ in range(num_installments - 1)
    ]
    # Last installment absorbs rounding differences
    last_principal = disbursed_amount - base_principal * (num_installments - 1)
    last_interest  = total_interest   - base_interest  * (num_installments - 1)
    rows.append({
        'principal_due': last_principal,
        'interest_due':  last_interest,
        'total_due':     last_principal + last_interest,
    })
    return rows


def reducing_balance_schedule(
    disbursed_amount: Decimal,
    interest_rate: Decimal,
    num_installments: int,
) -> list[dict]:
    """
    Reducing-balance (amortising) schedule.

    interest_rate is the per-period rate (%) — NOT an annual rate — so it is
    applied directly to the outstanding balance each period without dividing
    by periods_per_year.

    Returns a list of dicts: [{principal_due, interest_due, total_due}, ...]
    """
    period_rate = interest_rate / Decimal('100')
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
        else:
            principal = (emi - interest).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
            # Clamping principal to the remaining balance (payoff lands early)
            # must not leave total_due pinned to the un-clamped emi — total_due
            # is always derived from the actual principal+interest below, same
            # reasoning as flat_schedule().
            principal = max(Decimal('0'), min(principal, balance))
        total = principal + interest
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
    def generate(cls, loan, principal_override: Decimal = None) -> None:
        """
        Build and persist the full amortisation schedule for `loan`.

        Reads from:
            loan.term_months            — raw term value
            loan.term_unit              — 'days' | 'weeks' | 'months'
            loan.repayment_frequency    — 'daily' | 'weekly' | … | 'quarterly'
            loan.disbursement_date      — start date
            loan.disbursed_amount       — principal (unless principal_override is given)
            loan.interest_rate          — flat % of principal (flat) or per-period % (reducing balance)
            loan.product.interest_calculation_method
            loan.product.first_repayment_buffer_days

        Args:
            principal_override: Amortise this amount instead of loan.disbursed_amount.
                Used by LoanAccount.restructure(), which amortises the current
                outstanding_principal (the remaining balance), not the original
                disbursed amount.

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
        principal   = principal_override if principal_override is not None else loan.disbursed_amount

        date_increment, _ = FREQ_CONFIG.get(frequency, _DEFAULT_FREQ)

        # ── Due dates: step from first payment to maturity ────────────────────
        maturity = _maturity_date(loan.disbursement_date, term_value, term_unit)
        due_dates = _build_due_dates(loan.disbursement_date, date_increment, maturity, buffer_days)
        num_installments = len(due_dates)

        loan.number_of_installments = num_installments

        # ── Compute amounts ───────────────────────────────────────────────────
        method = loan.product.interest_calculation_method
        if method == 'reducing_balance':
            rows = reducing_balance_schedule(
                principal,
                Decimal(str(loan.interest_rate)),
                num_installments,
            )
        else:
            rows = flat_schedule(
                principal,
                Decimal(str(loan.interest_rate)),
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
                tenant=loan.tenant,
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

        date_increment, _ = FREQ_CONFIG.get(repayment_frequency, _DEFAULT_FREQ)

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
                disbursed_amount, interest_rate, num_installments
            )
        else:
            rows = flat_schedule(
                disbursed_amount, interest_rate, num_installments
            )

        if due_dates:
            for i, (row, due_date) in enumerate(zip(rows, due_dates), start=1):
                row['installment_number'] = i
                row['due_date'] = due_date
        else:
            for i, row in enumerate(rows, start=1):
                row['installment_number'] = i

        return rows
