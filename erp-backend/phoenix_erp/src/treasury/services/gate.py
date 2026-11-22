"""
Liquidity gate for loan approval and disbursement.

Approval:     blocked when the branch cannot fund the loan without eating into committed
              obligations. A director may override with a written reason after seeing the impact.
Disbursement: if the loan was approved under an override, or is unaffordable by now, a
              (different) director must disburse and acknowledge the recalculated impact.
"""
import json
import logging
from contextlib import contextmanager
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Optional

from django.core.serializers.json import DjangoJSONEncoder
from django.db import connection, transaction

from common.models import FinancialAuditLog, log_financial_event
from treasury.models import LiquidityDecision
from treasury.services.forecast import branch_forecast, earliest_date_for, impact_of

logger = logging.getLogger(__name__)

LOCK_NAMESPACE = 7421  # arbitrary app-level key for pg advisory locks (per-branch second key)

CODE_BLOCKED = 'liquidity_blocked'
CODE_OVERRIDE_REQUIRED = 'liquidity_override_required'
CODE_DIRECTOR_REQUIRED = 'liquidity_director_required'
CODE_SAME_DIRECTOR = 'liquidity_same_director'
CODE_ACK_REQUIRED = 'liquidity_ack_required'


class LiquidityBlocked(Exception):
    """Raised by the disbursement gate; views translate it to a 409 response."""

    def __init__(self, code, assessment, message):
        super().__init__(message)
        self.code = code
        self.assessment = assessment
        self.message = message

    def payload(self):
        return {'code': self.code, 'detail': self.message, 'assessment': self.assessment}


@dataclass
class GateResult:
    allowed: bool
    code: Optional[str] = None
    assessment: dict = field(default_factory=dict)
    outcome: Optional[str] = None      # set when allowed via override
    reason: str = ''
    message: str = ''

    def payload(self):
        return {'code': self.code, 'detail': self.message, 'assessment': self.assessment}


def _naira(value) -> str:
    return f"₦{Decimal(value):,.2f}"


def _jsonable(obj):
    return json.loads(json.dumps(obj, cls=DjangoJSONEncoder))


def is_director(user) -> bool:
    from common.views import is_elevated_user
    return is_elevated_user(user)


@contextmanager
def branch_liquidity_lock(branch):
    """
    Serialise "check the branch's liquidity, then spend it" per branch so two approvals
    racing can't both claim the same cash. No-op lock on non-PostgreSQL databases.
    """
    with transaction.atomic():
        if branch is not None and connection.vendor == 'postgresql':
            with connection.cursor() as cur:
                cur.execute("SELECT pg_advisory_xact_lock(%s, %s)", [LOCK_NAMESPACE, int(branch.pk)])
        yield


def loan_amount(loan) -> Decimal:
    if loan.status == 'approved' and loan.approved_amount:
        return Decimal(loan.approved_amount)
    return Decimal(loan.requested_amount or 0)


def assess_amount(branch, amount, exclude_loan_pk=None) -> dict:
    """Core assessment for paying `amount` out of `branch` today. JSON-friendly values (Decimal/date)."""
    f = branch_forecast(branch, exclude_loan_pk=exclude_loan_pk)
    amount = Decimal(amount)
    available = f['available_today']
    breaches, worst = impact_of(f, amount)
    earliest = earliest_date_for(f, amount)
    ok = amount <= available

    advice = []
    if not ok:
        shortfall_today = amount - available
        if available > 0:
            advice.append(
                f"{_naira(available)} can be paid out today without touching committed payments; "
                f"the remaining {_naira(shortfall_today)} would have to wait.")
        else:
            advice.append("Nothing can be paid out today without touching committed payments.")
        if earliest is not None:
            if earliest == f['today']:
                pass
            else:
                advice.append(
                    f"Expected repayments should make the full {_naira(amount)} available on {earliest:%d %b %Y}. "
                    f"Delaying until then avoids the shortfall.")
        else:
            advice.append(
                f"The full amount does not become available within the next {f['lookahead_days']} days "
                f"at the current collection rate ({f['collection_rate'] * 100:.0f}%).")
        for b in breaches[:3]:
            names = '; '.join(o['description'] for o in b['obligations'][:3])
            advice.append(
                f"If paid out now, {f['branch_name']} would be {_naira(b['shortfall'])} short on "
                f"{b['date']:%d %b %Y}, when: {names}.")

    return {
        'ok': ok,
        'branch_id': f['branch_id'], 'branch_name': f['branch_name'],
        'amount': amount,
        'available_today': available,
        'shortfall_today': max(Decimal('0.00'), amount - available),
        'earliest_available_date': earliest,
        'worst_shortfall': worst,
        'breaches': breaches,
        'cash_now': f['cash_now'],
        'collection_rate': f['collection_rate'],
        'expected_inflows_total': f['expected_inflows_total'],
        'expected_scheduled_total': f['expected_scheduled_total'],
        'expected_recovery_total': f['expected_recovery_total'],
        'arrears_outstanding': f['arrears_outstanding'],
        'recovery_rate': f['recovery_rate'],
        'committed_outflows_total': f['committed_outflows_total'],
        'lookahead_days': f['lookahead_days'],
        'reserve_buffer_days': f['reserve_buffer_days'],
        'advice': advice,
    }


def assess_loan(loan, stage) -> dict:
    branch = loan.branch
    if branch is None:
        return {'ok': True, 'amount': loan_amount(loan), 'available_today': loan_amount(loan), 'advice': [],
                'breaches': [], 'branch_name': '', 'lookahead_days': 0, 'stage': stage}
    exclude = loan.pk if stage == LiquidityDecision.STAGE_DISBURSEMENT else None
    a = assess_amount(branch, loan_amount(loan), exclude_loan_pk=exclude)
    a['stage'] = stage
    a['loan_number'] = loan.loan_number
    return a


def _summary(assessment, prefix) -> str:
    lines = [f"{prefix} {assessment['branch_name']} can fund {_naira(assessment['available_today'])} of this "
             f"{_naira(assessment['amount'])} today."]
    lines.extend(assessment.get('advice', []))
    return ' '.join(lines)


# ── Approval ────────────────────────────────────────────────────────────────

def evaluate_approval(loan, user, override_reason='') -> GateResult:
    """Pure evaluation (no writes). Call inside branch_liquidity_lock(loan.branch)."""
    a = assess_loan(loan, LiquidityDecision.STAGE_APPROVAL)
    if a['ok']:
        return GateResult(True, assessment=a)
    if not is_director(user):
        return GateResult(
            False, CODE_BLOCKED, a,
            message=_summary(a, "Cannot approve:") + " A director can override this block.")
    reason = (override_reason or '').strip()
    if not reason:
        return GateResult(
            False, CODE_OVERRIDE_REQUIRED, a,
            message=_summary(a, "Liquidity warning:") + " Provide a reason to override and approve anyway.")
    return GateResult(True, code=None, assessment=a, outcome=LiquidityDecision.OUTCOME_OVERRIDDEN, reason=reason)


def record_decision(loan, stage, outcome, user, reason, assessment) -> LiquidityDecision:
    decision = LiquidityDecision.objects.create(
        tenant=getattr(loan, 'tenant', None), owner=loan.owner, created_by=user,
        loan=loan, branch=loan.branch, stage=stage, outcome=outcome, user=user, reason=reason or '',
        amount=assessment.get('amount') or Decimal('0'),
        available_today=assessment.get('available_today') or Decimal('0'),
        snapshot=_jsonable(assessment),
    )
    if outcome in (LiquidityDecision.OUTCOME_OVERRIDDEN, LiquidityDecision.OUTCOME_ACKNOWLEDGED):
        log_financial_event(
            FinancialAuditLog.LIQUIDITY_OVERRIDE, acted_by=user, record_type='LoanAccount',
            record_id=str(loan.pk), amount=assessment.get('amount'),
            description=f"Liquidity {outcome} at {stage} for {loan.loan_number}: {reason}",
            extra={'stage': stage, 'outcome': outcome, 'available_today': str(assessment.get('available_today')),
                   'worst_shortfall': str(assessment.get('worst_shortfall'))},
        )
        _notify_directors(loan, stage, outcome, user, reason, assessment)
    return decision


def _notify_directors(loan, stage, outcome, user, reason, assessment):
    try:
        from notifications.telegram_alerts import notify_directors
        who = user.get_full_name() or user.username
        verb = 'overrode a liquidity block on' if outcome == LiquidityDecision.OUTCOME_OVERRIDDEN \
            else 'acknowledged the liquidity impact of disbursing'
        notify_directors(
            'liquidity_override',
            f"⚠️ Liquidity {outcome} - {loan.loan_number}",
            (f"{who} {verb} {loan.loan_number} ({_naira(assessment['amount'])}) at {stage}. "
             f"{assessment['branch_name']} could fund {_naira(assessment['available_today'])} today. "
             f"Reason: {reason or 'n/a'}"),
            owner=loan.owner, branch=loan.branch, related_object=loan,
        )
    except Exception:
        logger.exception("Failed to send liquidity override alert for loan %s", loan.loan_number)


# ── Disbursement ────────────────────────────────────────────────────────────

def enforce_disbursement(loan, user, acknowledge_impact=False, note='') -> Optional[LiquidityDecision]:
    """
    Raises LiquidityBlocked when the disbursement may not proceed yet; returns the acknowledgement
    decision (or None when no gate applies). Call inside branch_liquidity_lock(loan.branch).
    """
    stage = LiquidityDecision.STAGE_DISBURSEMENT
    override = LiquidityDecision.objects.filter(
        loan=loan, stage=LiquidityDecision.STAGE_APPROVAL, outcome=LiquidityDecision.OUTCOME_OVERRIDDEN,
    ).select_related('user').order_by('-created_at').first()

    a = assess_loan(loan, stage)
    if override is not None:
        a['override'] = {
            'by': override.user.get_full_name() or override.user.username if override.user else None,
            'reason': override.reason, 'at': override.created_at,
            'available_then': override.available_today,
        }

    if a['ok'] and override is None:
        return None

    if not is_director(user):
        if override is not None:
            msg = (f"{loan.loan_number} was approved under a liquidity override, so a different director must "
                   f"disburse it. " + _summary(a, "Current position:"))
        else:
            msg = _summary(a, "Cannot disburse now:") + " A director must disburse this loan."
        raise LiquidityBlocked(CODE_DIRECTOR_REQUIRED, a, msg)

    if override is not None and override.user_id == user.pk:
        raise LiquidityBlocked(
            CODE_SAME_DIRECTOR, a,
            "The director who overrode the liquidity block cannot also disburse this loan. "
            "Another director must do it (maker-checker).")

    if not acknowledge_impact:
        raise LiquidityBlocked(
            CODE_ACK_REQUIRED, a,
            _summary(a, "Review before disbursing:") + " Confirm you accept this impact to continue.")

    return record_decision(loan, stage, LiquidityDecision.OUTCOME_ACKNOWLEDGED, user, note, a)


# ── Heads-up: pending approvals vs. what the branch can lend ───────────────

def pending_approvals_heads_up(branch, today=None) -> dict:
    """
    Read-only heads-up for whoever approves loans in `branch`: do all loans currently waiting for
    approval fit in what the branch can lend today?

    Each loan is checked on its own at approval time, so four loans can each look affordable while
    together they are not: approving one uses up cash the next one was counting on. This sums every
    pending application against `available_today` (which already sets aside approved-but-undisbursed
    loans and committed payouts) so the approver knows up front to prioritise.

    Loans are listed oldest application first. `fits_alone` says whether a loan could be approved on its
    own today; `fits_in_order` whether it still fits after every older application ahead of it.
    """
    from loans.models import LoanAccount

    f = branch_forecast(branch, today=today)
    available = f['available_today']
    loans = (LoanAccount.objects.filter(branch=branch, status='pending', is_deleted=False)
             .select_related('client', 'product__product')
             .order_by('application_date', 'pk'))

    rows = []
    total = Decimal('0.00')
    running = Decimal('0.00')
    for loan in loans:
        amount = Decimal(loan.requested_amount or 0)
        total += amount
        running += amount
        client = loan.client
        product = getattr(getattr(loan, 'product', None), 'product', None)
        rows.append({
            'loan_id': loan.pk,
            'loan_number': loan.loan_number,
            'client_name': (getattr(client, 'full_name', None) or str(client)) if client else '',
            'product_name': getattr(product, 'name', '') or '',
            'amount': amount,
            'application_date': loan.application_date,
            'days_waiting': (f['today'] - loan.application_date).days if loan.application_date else None,
            'fits_alone': amount <= available,
            'fits_in_order': running <= available,
        })

    shortfall = max(Decimal('0.00'), total - available)
    over = bool(rows) and total > available
    message = ''
    if over:
        fit_alone = sum(1 for r in rows if r['fits_alone'])
        message = (
            f"{len(rows)} loan{'s' if len(rows) != 1 else ''} totalling {_naira(total)} "
            f"{'are' if len(rows) != 1 else 'is'} waiting for approval, but {f['branch_name']} can only lend "
            f"{_naira(available)} today ({_naira(shortfall)} short). Approving one reduces what is left for "
            f"the others, so decide which to approve first."
        )
        if available <= 0:
            message += " Nothing can be lent today without touching committed payments."
        elif fit_alone < len(rows):
            message += (f" {len(rows) - fit_alone} of them cannot be funded today even on "
                        f"{'its' if len(rows) - fit_alone == 1 else 'their'} own.")

    return {
        'branch_id': f['branch_id'],
        'branch_name': f['branch_name'],
        'today': f['today'],
        'available_today': available,
        'cash_now': f['cash_now'],
        'committed_outflows_total': f['committed_outflows_total'],
        'pending_count': len(rows),
        'pending_total': total,
        'shortfall': shortfall,
        'over_capacity': over,
        'message': message,
        'loans': rows,
    }
