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
reusing the same proven math and tolerances. The CLI's blind --force
bypass (an engineer manually confirming a below-flat mismatch is a known
capped-row artifact) is never exposed here — instead, see _behind_schedule()
below: a below-flat row is only auto-trusted when the loan's own repayment
calendar independently corroborates that the borrower isn't actually behind,
which is a verified judgment call this code can make safely on its own,
not a blind override.

Only step 1 supports 'flat' interest_calculation_method loans (see
flat_schedule() in schedule_service.py) — reducing-balance loans have a
legitimately varying per-installment amount, so the flat formula it depends
on would misstate them. Step 2 is calculation-method-agnostic.

Both steps are true no-ops on a loan that isn't actually broken. Step 1's
fold-into-principal rewrite only runs when the schedule's current principal+
interest+fees remaining doesn't already reconcile with outstanding_principal
+ outstanding_interest + outstanding_fees — otherwise a loan that was never
touched by the payment-allocation bug would still get its interest/fees
folded into principal on every run, cosmetically restructuring a schedule
that was already correct. Step 2 has the same shape (only fires when
drift < -TOLERANCE). This is what actually protects loans that are already
correct — not who has access to trigger the repair.

An aggregate sum matching is not sufficient on its own, though — see
_has_shape_inconsistency(). Caught live on LN-919: the aggregate reconciled
exactly, but an older row was still genuinely open/unpaid while 12 later
rows spanning real payment dates had already been zeroed under a fake
'restructured' status. Step 1 also checks for that shape before taking the
"already reconciles" shortcut, so a loan like that still gets evaluated
properly instead of being reported as needing nothing.

No GL entry is posted by either step — outstanding_principal/interest/fees/
penalties themselves are never changed, only how they're attributed across
schedule rows. A hard reconciliation failure in either step (the numbers
genuinely don't add up, not just "this step doesn't apply here") aborts the
whole transaction — better to refuse everything than write a partial fix.
"""
from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction as db_transaction

TOLERANCE = Decimal('0.01')

# A row this close to the formula (below it) is treated as rounding/
# capped-row noise, full stop — never flagged as a below-flat mismatch at
# all, regardless of whether the loan looks behind schedule. Caught live on
# LN-919 (8 kobo short) and LN-897 (4 kobo short): a genuine rate/term
# mismatch shows up as a deviation far larger than a few kobo, not this —
# the plain TOLERANCE (0.01) threshold was flagging rounding-level noise as
# "not explainable as an add-on" and routing it into manual review for no
# reason. Deliberately a flat amount, not a percentage of flat_amount — the
# rounding this covers is kobo-scale regardless of loan size.
ROUNDING_TOLERANCE = Decimal('1.00')

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


def _has_shape_inconsistency(rows):
    """
    True if any open (non-'paid', non-'restructured') row's due_date is on
    or before a 'restructured' row's due_date.

    A genuine restructure always cancels PRIOR installments and creates new
    ones going forward — it never leaves an older row dangling open behind
    a later one that's already been retired. Caught live on LN-919: the
    aggregate schedule remaining matched outstanding_principal exactly (an
    older row still carried the whole real balance, unpaid), while 12
    LATER rows spanning real payment dates from the GL ledger had already
    been zeroed under a fake 'restructured' status — a pure aggregate-sum
    reconciliation check can't see this, since the total still adds up.
    Without this check the "already reconciles" shortcut below would have
    wrongly reported a genuinely broken loan as needing nothing.
    """
    open_due_dates = [r.due_date for r in rows if r.status not in ('paid', 'restructured')]
    if not open_due_dates:
        return False
    earliest_open = min(open_due_dates)
    return any(r.status == 'restructured' and r.due_date >= earliest_open for r in rows)


def _behind_schedule(loan, rows, flat_amount, today):
    """
    Cross-check "how many payments should this loan have made by now" — using
    only the loan's own due dates and trusted totals, independent of the
    schedule rows' current *_paid/status (which may themselves be exactly
    what's corrupted) — against what's actually been repaid over the loan's
    whole life. Returns True only if the borrower is genuinely behind.

    This is what lets a below-formula row (see below_flat below) be trusted
    as an explainable rounding/capped-row artifact rather than requiring a
    human override: caught live on LN-919, where a single row sat 8 kobo
    under the formula amount, and the below_flat guard alone couldn't tell
    whether that meant a real rate/term mismatch or a harmless leftover from
    an earlier correction. Reconstructing the loan's own calendar (20 of 23
    installments due by today, ₦101,739.13 expected) against its total ever
    repaid (₦109,565.28, derived from disbursed*(1+rate/100) minus
    outstanding_*) showed the borrower had actually paid ahead, not behind —
    proving the row-level shortfall was rounding noise, not a genuine
    mismatch, and safe to fix automatically.
    """
    num_due_by_today = sum(1 for r in rows if r.due_date <= today)
    expected_repaid_by_today = flat_amount * num_due_by_today
    total_obligation = loan.disbursed_amount * (Decimal('1') + loan.interest_rate / Decimal('100'))
    actual_repaid_ever = total_obligation - (
        loan.outstanding_principal + loan.outstanding_interest + loan.outstanding_fees
    )
    return actual_repaid_ever < expected_repaid_by_today - TOLERANCE


def _try_backward_fill(loan, rows, today):
    """
    Step 1. Returns (skipped_reason, flat_amount, penalty_shortfall) — mutates
    `rows` in place (via direct field assignment) only when it actually runs.
    Raises _HardFailure if its own preconditions pass but the numbers don't
    reconcile (a genuine data problem, not just "doesn't apply here").

    First checks whether the schedule (principal+interest+fees — penalty is
    handled separately) already reconciles to what the loan's own
    outstanding_* totals say is owed. If so this is a silent no-op: nothing
    is touched, not even to fold interest_due/fees_due into principal_due.
    Without this check, a loan that was never touched by the payment-
    allocation bug (or any healthy flat loan that legitimately tracks
    principal and interest separately) would still get cosmetically
    restructured on every run, since the fold-into-principal rewrite below
    was previously applied unconditionally.
    """
    before_pif_remaining = sum(
        (r.principal_due - r.principal_paid) + (r.interest_due - r.interest_paid) + (r.fees_due - r.fees_paid)
        for r in rows
    )
    trusted_pif = loan.outstanding_principal + loan.outstanding_interest + loan.outstanding_fees
    if abs(before_pif_remaining - trusted_pif) <= TOLERANCE and not _has_shape_inconsistency(rows):
        return None, None, Decimal('0.00')

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
    below_flat = [r for r in intact if r.total_due < flat_amount - ROUNDING_TOLERANCE]
    if below_flat and _behind_schedule(loan, rows, flat_amount, today):
        example = below_flat[0]
        return (
            f'Backward-fill skipped: formula gives {flat_amount:,.2f} per installment but row '
            f'due={example.due_date} shows {example.total_due:,.2f} — below the formula, not '
            'explainable as an add-on, AND the loan is genuinely behind its own repayment '
            "calendar (total repaid falls short of what's due by today), so this can't be "
            'trusted as a harmless rounding/capped-row artifact automatically. An engineer can '
            'bypass this via the CLI restore_flat_schedule_backward_v4 --force command if '
            'independently confirmed safe.',
            None, Decimal('0.00'),
        )
    # A below-flat row where the borrower is NOT behind their own repayment
    # calendar is trusted as explainable (rounding, or a leftover capped-row
    # artifact from an earlier correction) and proceeds automatically —
    # see _behind_schedule()'s docstring for why this is safe.

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
            'needs_review_reason': str | None,   # set only on a hard failure — see below
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

    'rows' always reflects the current state whether or not anything needed
    changing — a loan that's already correct comes back eligible=True with
    'rows' showing before == after for every installment (empty diff), not
    ineligible; 'applied' stays False in that case since there's nothing to
    write or log. eligible=False / needs_review_reason set is reserved for
    hard failures only: the loan or its schedule can't be found, or a
    genuine reconciliation mismatch (the numbers don't add up) aborts the
    whole transaction — better to refuse everything than write a partial fix.
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

        row_diffs = [
            {
                'installment_number': r.installment_number,
                'due_date': str(r.due_date),
                'before': before_snapshot[r.pk],
                'after': _row_snapshot(r),
            }
            for r in rows
        ]
        anything_changed = any(rd['before'] != rd['after'] for rd in row_diffs)

        result_base = {
            'eligible': True, 'needs_review_reason': None,
            'step1_skipped_reason': step1_skipped_reason, 'step2_skipped_reason': step2_skipped_reason,
            'loan_number': locked_loan.loan_number,
            'flat_installment': str(flat_amount) if flat_amount is not None else None,
            'penalty_shortfall': str(penalty_shortfall), 'rows': row_diffs,
            'retired_count': retired_count, 'capped_count': capped_count,
        }

        if not anything_changed or not apply:
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
                    if flat_amount is not None
                    else (f'{step1_skipped_reason} ' if step1_skipped_reason else '')
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
