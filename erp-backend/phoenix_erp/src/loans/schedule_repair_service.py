"""
Self-service loan schedule repair: backward-fill payments across the flat
schedule, and/or retire any stale rows beyond what's genuinely owed.

Generalizes the two-step data repair already proven for 'monthly'
repayment_frequency loans (see loans/management/commands/
restore_flat_schedule_backward_v4.py and retire_stale_legacy_schedule_rows.py)
to any loan, regardless of repayment_frequency. The corruption both scripts
repair — payments not moving outstanding_principal/the schedule, because
allocation prioritized the loan's whole-term aggregate outstanding_interest/
outstanding_fees over real per-installment amounts (loans/models.py:1296-
1303, fixed in commit 7f2a6c2, 2026-07-24) — was frequency-agnostic, so the
repair needs to be too.

The two steps have genuinely different eligibility requirements and were
historically applied independently to different loans (v4 needs schedule
row count == number_of_installments to trust its flat-formula math; the
stale-row retirement that LN-858 needed had far MORE rows than that, which
is exactly the shape v4 refuses). Gating step 2 behind step 1's stricter
precondition would silently skip the stale-row cleanup on precisely the
loans that need it most, so the two steps are evaluated and applied
independently here — one step being unavailable never blocks the other.

Deliberately NOT a refactor of those two commands — they're still mid-use
for the ongoing book-wide legacy cleanup. This is a fresh implementation
reusing the same proven math and tolerances, minus the --force bypass:
--force is a CLI-only, engineer-confirmed override and is never exposed to
self-service callers — step 1 simply skips itself rather than guessing.

Only step 1 supports 'flat' interest_calculation_method loans (see
flat_schedule() in schedule_service.py) — reducing-balance loans have a
legitimately varying per-installment amount, so the flat formula it depends
on would misstate them. Step 2 is calculation-method-agnostic.

No GL entry is posted by either step — outstanding_principal/interest/fees/
penalties themselves are never changed, only how they're attributed across
schedule rows. A hard reconciliation failure in either step (the numbers
genuinely don't add up, not just "this step doesn't apply here") aborts the
whole transaction — better to refuse everything than write a partial fix.
"""
from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction as db_transaction

TOLERANCE = Decimal('0.01')

# (schedule field prefix, LoanAccount outstanding_* field name) — same
# component list retire_stale_legacy_schedule_rows.py uses.
_COMPONENTS = [
    ('principal', 'outstanding_principal'),
    ('interest', 'outstanding_interest'),
    ('fees', 'outstanding_fees'),
    ('penalty', 'outstanding_penalties'),
]


def _row_snapshot(row):
    return {
        'total_due': str(row.total_due), 'total_paid': str(row.total_paid),
        'principal_due': str(row.principal_due), 'principal_paid': str(row.principal_paid),
        'interest_due': str(row.interest_due), 'interest_paid': str(row.interest_paid),
        'fees_due': str(row.fees_due), 'fees_paid': str(row.fees_paid),
        'penalty_due': str(row.penalty_due), 'penalty_paid': str(row.penalty_paid),
        'status': row.status,
        'payment_date': str(row.payment_date) if row.payment_date else None,
    }


class _HardFailure(Exception):
    """A safety reconciliation genuinely failed — abort the whole repair, not just one step."""
    def __init__(self, message):
        self.message = message


def _try_backward_fill(loan, rows, today):
    """
    Step 1. Returns (skipped_reason, flat_amount, penalty_shortfall) — mutates
    `rows` in place (via direct field assignment) only when it actually runs.
    Raises _HardFailure if its own preconditions pass but the numbers don't
    reconcile (a genuine data problem, not just "doesn't apply here").
    """
    if len(rows) != loan.number_of_installments or loan.number_of_installments == 0:
        return (
            f'Backward-fill skipped: schedule row count ({len(rows)}) does not match '
            f'number_of_installments ({loan.number_of_installments}).',
            None, Decimal('0.00'),
        )
    if loan.interest_rate is None:
        return 'Backward-fill skipped: loan has no interest_rate set.', None, Decimal('0.00')

    method = getattr(loan.product, 'interest_calculation_method', 'flat')
    if method == 'reducing_balance':
        return (
            "Backward-fill skipped: this loan's product uses reducing-balance interest — the "
            'flat-installment formula this step depends on would misstate it.',
            None, Decimal('0.00'),
        )

    total_obligation = loan.disbursed_amount * (Decimal('1') + loan.interest_rate / Decimal('100'))
    flat_amount = (total_obligation / loan.number_of_installments).quantize(
        Decimal('0.01'), rounding=ROUND_HALF_UP
    )

    intact = [r for r in rows if r.status != 'restructured' and r.total_due > 1]
    below_flat = [r for r in intact if r.total_due < flat_amount - TOLERANCE]
    if below_flat:
        example = below_flat[0]
        return (
            f'Backward-fill skipped: formula gives {flat_amount:,.2f} per installment but row '
            f'due={example.due_date} shows {example.total_due:,.2f} — below the formula, not '
            'explainable as an add-on. An engineer can bypass this via the CLI '
            'restore_flat_schedule_backward_v4 --force command if independently confirmed safe.',
            None, Decimal('0.00'),
        )

    for r in rows:
        r._new_due = flat_amount

    pool = loan.outstanding_principal
    for r in reversed(rows):
        owed = min(r._new_due, pool)
        r._new_paid = r._new_due - owed
        pool -= owed

    total_still_owed = sum(r._new_due - r._new_paid for r in rows)
    if abs(total_still_owed - loan.outstanding_principal) > TOLERANCE:
        raise _HardFailure(
            f'Redistributed total ({total_still_owed:,.2f}) does not match outstanding_principal '
            f'({loan.outstanding_principal:,.2f}).'
        )

    open_rows_after = []
    for r in rows:
        remaining = r._new_due - r._new_paid
        if remaining <= TOLERANCE:
            r._new_status = 'paid'
        elif r.due_date > today:
            r._new_status = 'pending'
        elif r._new_paid > 0:
            r._new_status = 'partial'
        else:
            r._new_status = 'overdue'
        if r._new_status != 'paid':
            open_rows_after.append(r)

    open_penalty_after = sum((r.penalty_due - r.penalty_paid) for r in open_rows_after) or Decimal('0.00')
    penalty_shortfall = loan.outstanding_penalties - open_penalty_after
    if abs(penalty_shortfall) > TOLERANCE and not open_rows_after:
        raise _HardFailure(
            f'Penalty shortfall ({penalty_shortfall:,.2f}) but every row would be fully paid; no '
            'open row to carry it.'
        )

    earliest_open = open_rows_after[0] if open_rows_after else None
    for r in rows:
        r.principal_due = r._new_due
        r.total_due = r._new_due
        r.interest_due = Decimal('0.00')
        r.fees_due = Decimal('0.00')
        r.principal_paid = r._new_paid
        r.total_paid = r._new_paid
        r.interest_paid = Decimal('0.00')
        r.fees_paid = Decimal('0.00')
        r.status = r._new_status
        if r._new_status != 'paid':
            r.payment_date = None
        # total_due must never include penalty — it's principal_due + interest_due +
        # fees_due only (see restore_flat_schedule_backward_v4.py for the prior
        # corruption this avoids). Only penalty_due gets the shortfall top-up.
        if abs(penalty_shortfall) > TOLERANCE and earliest_open is not None and r.pk == earliest_open.pk:
            r.penalty_due += penalty_shortfall

    return None, flat_amount, penalty_shortfall


def _try_retire_stale(loan, rows):
    """
    Step 2. Only touches rows in the UNDERSTATED direction (schedule owes
    more than the loan's trusted outstanding_* totals say). Returns
    (skipped_reason, retired_count, capped_count) — mutates `rows` in place
    only when it actually retires/caps something. Raises _HardFailure if it
    runs but the result doesn't reconcile.
    """
    open_rows = [r for r in rows if r.status != 'paid']
    before_remaining = {
        comp: sum((getattr(r, f'{comp}_due') - getattr(r, f'{comp}_paid')) for r in open_rows)
        for comp, _ in _COMPONENTS
    }
    schedule_owed = sum(before_remaining.values())
    drift = loan.total_outstanding - schedule_owed

    if drift >= -TOLERANCE:
        return None, 0, 0  # nothing overstated in the schedule — no-op, not an error

    pools = {comp: getattr(loan, field) for comp, field in _COMPONENTS}
    retired_count = 0
    capped_count = 0
    for r in open_rows:
        changed = False
        for comp, _ in _COMPONENTS:
            due_field, paid_field = f'{comp}_due', f'{comp}_paid'
            due, paid = getattr(r, due_field), getattr(r, paid_field)
            row_remaining = due - paid
            if row_remaining <= 0:
                continue
            row_pool = pools[comp]
            if row_pool <= 0:
                new_due = paid
            elif row_remaining <= row_pool:
                new_due = due
                pools[comp] -= row_remaining
            else:
                new_due = paid + row_pool
                pools[comp] = Decimal('0.00')
            if new_due != due:
                setattr(r, due_field, new_due)
                changed = True
        if changed:
            r.total_due = r.principal_due + r.interest_due + r.fees_due
            fully_retired = (
                r.principal_due <= r.principal_paid and r.interest_due <= r.interest_paid
                and r.fees_due <= r.fees_paid and r.penalty_due <= r.penalty_paid
            )
            if fully_retired:
                r.status = 'restructured'
                retired_count += 1
            else:
                capped_count += 1

    after_remaining = {
        comp: sum((getattr(r, f'{comp}_due') - getattr(r, f'{comp}_paid')) for r in open_rows)
        for comp, _ in _COMPONENTS
    }
    reconciles = all(
        abs(after_remaining[comp] - getattr(loan, field)) <= TOLERANCE
        for comp, field in _COMPONENTS
    )
    if not reconciles:
        raise _HardFailure(
            'After retiring stale rows, schedule remaining does not reconcile to outstanding_* '
            'within tolerance.'
        )

    return None, retired_count, capped_count


def repair_schedule(loan, *, apply: bool, user=None, reason: str = '') -> dict:
    """
    Preview (apply=False) or apply (apply=True) the backward-fill and/or
    retire-stale repair for one loan. The two steps are independent — one
    being skipped (e.g. a reducing-balance product, or a row-count mismatch)
    never blocks the other from running.

    Returns a dict shaped the same whether previewing or applying:
        {
            'eligible': bool,
            'needs_review_reason': str | None,   # set only when NEITHER step could do anything
            'step1_skipped_reason': str | None,   # why backward-fill didn't run, if it didn't
            'step2_skipped_reason': str | None,   # currently always None; reserved for parity
            'loan_number': str,
            'flat_installment': str | None,
            'penalty_shortfall': str,
            'rows': [{'installment_number', 'due_date', 'before': {...}, 'after': {...}}, ...],
            'retired_count': int,
            'capped_count': int,
            'applied': bool,
        }

    A hard reconciliation failure (the numbers genuinely don't add up, not
    just "this step doesn't apply here") aborts the whole transaction and
    comes back as eligible=False — better to refuse everything than write a
    partial fix.
    """
    from django.utils import timezone
    from common.models import FinancialAuditLog, log_financial_event
    from loans.models import LoanAccount

    today = timezone.localdate()

    def _ineligible(msg):
        return {
            'eligible': False, 'needs_review_reason': msg,
            'step1_skipped_reason': None, 'step2_skipped_reason': None,
            'loan_number': loan.loan_number, 'flat_installment': None,
            'penalty_shortfall': '0.00', 'rows': [], 'retired_count': 0,
            'capped_count': 0, 'applied': False,
        }

    with db_transaction.atomic():
        sid = db_transaction.savepoint()
        try:
            locked_loan = LoanAccount.all_objects.select_for_update().get(pk=loan.pk)
        except LoanAccount.DoesNotExist:
            db_transaction.savepoint_rollback(sid)
            return _ineligible('Loan not found.')

        rows = list(locked_loan.repayment_schedule.select_for_update().order_by('due_date'))
        if not rows:
            db_transaction.savepoint_rollback(sid)
            return _ineligible('No schedule rows found for this loan.')

        before_snapshot = {r.pk: _row_snapshot(r) for r in rows}

        try:
            step1_skipped_reason, flat_amount, penalty_shortfall = _try_backward_fill(locked_loan, rows, today)
            step2_skipped_reason, retired_count, capped_count = _try_retire_stale(locked_loan, rows)
        except _HardFailure as exc:
            db_transaction.savepoint_rollback(sid)
            return _ineligible(f'{exc.message} Refusing.')

        step1_ran = step1_skipped_reason is None
        step2_ran = retired_count > 0 or capped_count > 0
        if not step1_ran and not step2_ran:
            db_transaction.savepoint_rollback(sid)
            reasons = ' '.join(r for r in (step1_skipped_reason, step2_skipped_reason) if r)
            return _ineligible(reasons or "Nothing to repair — this loan's schedule already reconciles.")

        row_diffs = [
            {
                'installment_number': r.installment_number,
                'due_date': str(r.due_date),
                'before': before_snapshot[r.pk],
                'after': _row_snapshot(r),
            }
            for r in rows
        ]

        result_base = {
            'eligible': True, 'needs_review_reason': None,
            'step1_skipped_reason': step1_skipped_reason, 'step2_skipped_reason': step2_skipped_reason,
            'loan_number': locked_loan.loan_number,
            'flat_installment': str(flat_amount) if flat_amount is not None else None,
            'penalty_shortfall': str(penalty_shortfall), 'rows': row_diffs,
            'retired_count': retired_count, 'capped_count': capped_count,
        }

        if not apply:
            db_transaction.savepoint_rollback(sid)
            return {**result_base, 'applied': False}

        for r in rows:
            r.save(update_fields=[
                'principal_due', 'total_due', 'interest_due', 'fees_due',
                'principal_paid', 'total_paid', 'interest_paid', 'fees_paid',
                'penalty_due', 'status', 'payment_date', 'updated_at',
            ])

        locked_loan._calculate_arrears()
        locked_loan.refresh_from_db()
        locked_loan.update_risk_classification()
        locked_loan.save(update_fields=[
            'risk_classification', 'provision_pct', 'provision_amount', 'updated_at',
        ])

        log_financial_event(
            FinancialAuditLog.LOAN_BALANCE_CORRECTION,
            acted_by=user,
            record_type='LoanAccount',
            record_id=str(locked_loan.pk),
            amount=Decimal('0.00'),
            description=(
                f'Self-service schedule repair on {locked_loan.loan_number}: '
                + (
                    f'backward-filled payments across the flat schedule ({flat_amount:,.2f}/installment) '
                    f'from outstanding_principal. '
                    if step1_ran else f'{step1_skipped_reason} '
                )
                + f'Retired {retired_count} stale row(s) ({capped_count} capped). Reason: {reason}'
            ),
            extra={
                'loan_number': locked_loan.loan_number,
                'flat_installment': str(flat_amount) if flat_amount is not None else None,
                'penalty_shortfall': str(penalty_shortfall),
                'retired_count': retired_count,
                'capped_count': capped_count,
                'step1_skipped_reason': step1_skipped_reason,
                'reason': reason,
                'source': 'schedule_repair_service.repair_schedule (self-service)',
            },
        )

        db_transaction.savepoint_commit(sid)
        return {**result_base, 'applied': True}
