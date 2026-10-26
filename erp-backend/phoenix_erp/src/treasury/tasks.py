"""
Daily liquidity watch: one Telegram digest per tenant listing money that must move soon.

Covers: branch shares due to the debit branch, bank instalments, savings payouts approaching
their deadline, and loans that were blocked for lack of cash but are now affordable.
"""
import logging
from collections import defaultdict
from datetime import timedelta

from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)

CONTRIBUTION_WINDOW_DAYS = 2
INSTALMENT_WINDOW_DAYS = 3
WITHDRAWAL_WINDOW_DAYS = 3
# Regular (no-notice) withdrawals are "due" the day they are asked for; only flag ones left waiting this long.
REGULAR_WITHDRAWAL_STALE_DAYS = 3
BLOCKED_LOAN_LOOKBACK_DAYS = 14


def _naira(v):
    return f"₦{v:,.2f}"


def _when(due, today):
    if due < today:
        return f"OVERDUE by {(today - due).days}d"
    if due == today:
        return "due TODAY"
    return f"due {due:%d %b}"


def _shortfall_lines(today):
    """[(tenant_id, branch, line)] for every branch whose forecast dips below zero before an obligation."""
    from branches.models import Branch
    from treasury.services.forecast import branch_forecast

    forecasts = []
    for branch in Branch.all_objects.filter(is_active=True, is_deleted=False).select_related('owner'):
        try:
            forecasts.append((branch, branch_forecast(branch, today=today)))
        except Exception:
            logger.exception("Shortfall check failed for branch %s", branch.pk)

    spare_by_tenant = {}
    for branch, f in forecasts:
        if f['available_today'] > 0:
            spare_by_tenant.setdefault(branch.tenant_id, []).append((branch.name, f['available_today']))

    lines = []
    for branch, f in forecasts:
        first_short = next((row for row in f['days'] if row['closing'] < 0), None)
        if first_short is None:
            continue
        lowest = min(f['days'], key=lambda r: r['closing'])
        dues = '; '.join(o['description'] for o in first_short['outflows'][:3]) or 'committed payments'
        donors = [f"{name} ({_naira(amount)} spare)" for name, amount in spare_by_tenant.get(branch.tenant_id, [])
                  if name != branch.name][:3]
        donor_text = f" Branches with spare cash today: {', '.join(donors)}." if donors else ""
        lines.append((branch.tenant_id, branch, (
            f"SHORTFALL WARNING: {branch.name} is forecast to be {_naira(-first_short['closing'])} short on "
            f"{first_short['date']:%d %b} ({dues}). Lowest point {_naira(-lowest['closing'])} short on "
            f"{lowest['date']:%d %b}. Move cash in or chase collections before then.{donor_text}")))
    return lines


def collect_alerts(today=None):
    """Return {tenant_id: {'owner':..., 'branch':..., 'lines': [...]}} (pure read; used by the task and tests)."""
    from loans.models import LoanAccount
    from savings.models import SavingsWithdrawalRequest
    from treasury.models import BankBorrowing, BorrowingContribution, BorrowingInstalment, LiquidityDecision
    from treasury.services import gate as liquidity_gate

    today = today or timezone.localdate()
    out = defaultdict(lambda: {'owner': None, 'branch': None, 'lines': []})

    def add(obj, branch, line):
        bucket = out[obj.tenant_id]
        bucket['owner'] = bucket['owner'] or obj.owner
        bucket['branch'] = bucket['branch'] or branch
        bucket['lines'].append(line)

    active = BankBorrowing.all_objects.filter(status=BankBorrowing.STATUS_ACTIVE, is_deleted=False)

    for c in BorrowingContribution.all_objects.filter(
            instalment__borrowing__in=active, status=BorrowingContribution.STATUS_PENDING, is_deleted=False,
            due_date__lte=today + timedelta(days=CONTRIBUTION_WINDOW_DAYS),
    ).select_related('branch', 'instalment__borrowing__debit_branch'):
        b = c.instalment.borrowing
        add(c, c.branch, f"Branch share: {c.branch.name} must send {_naira(c.amount)} to "
                         f"{b.debit_branch.name} for {b.lender_name} instalment {c.instalment.number} "
                         f"({_when(c.due_date, today)})")

    for i in BorrowingInstalment.all_objects.filter(
            borrowing__in=active, status=BorrowingInstalment.STATUS_PENDING, is_deleted=False,
            due_date__lte=today + timedelta(days=INSTALMENT_WINDOW_DAYS),
    ).select_related('borrowing__debit_branch'):
        b = i.borrowing
        unsent = i.contributions.filter(status=BorrowingContribution.STATUS_PENDING).count()
        extra = f"; {unsent} branch share(s) still unsent" if unsent else ""
        add(i, b.debit_branch, f"Bank instalment: {b.lender_name} {i.number}/{b.tenor_months} "
                               f"{_naira(i.total_due)} from {b.debit_branch.name} ({_when(i.due_date, today)}){extra}")

    open_statuses = (
        SavingsWithdrawalRequest.STATUS_PENDING,
        SavingsWithdrawalRequest.STATUS_PARTIAL,
        SavingsWithdrawalRequest.STATUS_APPROVED,
    )
    for wr in SavingsWithdrawalRequest.all_objects.filter(
            status__in=open_statuses, is_deleted=False, payout_due_date__isnull=False,
            payout_due_date__lte=today + timedelta(days=WITHDRAWAL_WINDOW_DAYS),
    ).select_related('savings_account__client', 'branch'):
        asked = wr.client_requested_on or wr.created_at.date()
        has_notice = wr.payout_due_date > asked
        if not has_notice and (today - asked).days < REGULAR_WITHDRAWAL_STALE_DAYS:
            continue  # ordinary request still moving through approval; not a deadline issue yet
        client = getattr(wr.savings_account, 'client', None)
        who = getattr(client, 'full_name', None) or wr.savings_account.account_number
        add(wr, wr.branch, f"Savings payout: {_naira(wr.amount)} to {who} at "
                           f"{wr.branch.name if wr.branch else '?'} ({_when(wr.payout_due_date, today)}, "
                           f"status: {wr.get_status_display()})")

    # Early warning: money is only set aside as late as the forecast allows, so if collections run slower
    # than expected a branch can drift towards a shortfall. Re-check every branch daily (with no new
    # lending) and warn while there is still time to move cash in or chase collections.
    for line_tenant, branch, line in _shortfall_lines(today):
        out[line_tenant]['owner'] = out[line_tenant]['owner'] or branch.owner
        out[line_tenant]['branch'] = out[line_tenant]['branch'] or branch
        out[line_tenant]['lines'].insert(0, line)

    since = timezone.now() - timedelta(days=BLOCKED_LOAN_LOOKBACK_DAYS)
    seen = set()
    for d in LiquidityDecision.objects.filter(
            outcome=LiquidityDecision.OUTCOME_BLOCKED, stage=LiquidityDecision.STAGE_APPROVAL,
            created_at__gte=since, loan__status='pending',
    ).select_related('loan__branch').order_by('-created_at'):
        if d.loan_id in seen:
            continue
        seen.add(d.loan_id)
        try:
            if liquidity_gate.assess_loan(d.loan, LiquidityDecision.STAGE_APPROVAL)['ok']:
                add(d, d.loan.branch, f"Loan {d.loan.loan_number} was blocked for lack of cash and can now be "
                                      f"approved ({d.loan.branch.name if d.loan.branch else '?'})")
        except Exception:
            logger.exception("Liquidity re-check failed for loan %s", d.loan_id)
    return out


@shared_task(name='treasury.tasks.daily_liquidity_watch')
def daily_liquidity_watch():
    from notifications.telegram_alerts import notify_directors

    alerts = collect_alerts()
    sent = 0
    for tenant_id, bucket in alerts.items():
        if not bucket['lines'] or bucket['owner'] is None:
            continue
        message = "\n".join(f"- {line}" for line in bucket['lines'])
        notify_directors(
            'liquidity_daily_watch',
            f"Liquidity watch - {len(bucket['lines'])} item(s) need attention",
            message,
            owner=bucket['owner'], branch=bucket['branch'],
        )
        sent += 1
    logger.info("daily_liquidity_watch: %d digest(s) sent, %d item(s)", sent,
                sum(len(b['lines']) for b in alerts.values()))
    return {'digests': sent, 'items': sum(len(b['lines']) for b in alerts.values())}
