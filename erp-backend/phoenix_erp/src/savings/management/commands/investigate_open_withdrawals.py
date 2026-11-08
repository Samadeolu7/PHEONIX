"""
Read-only: list every open savings withdrawal request the liquidity watch is
counting (pending / partially approved / fully approved), with everything
needed to find it, and the reasons it may be invisible on the Savings
Withdrawals page.

Why requests can be in the 8 AM alert but on no screen: the alert
(treasury forecast) runs with no logged-in user, so it filters by branch only.
The Withdrawals page also filters by the user's tenant and, for officers, by
the client's assigned officer. A request with a missing/different tenant, or
on a deleted account/client, is counted but not shown.

Usage:
    python manage.py investigate_open_withdrawals                     # all branches
    python manage.py investigate_open_withdrawals --branch Orimerunmu
    python manage.py investigate_open_withdrawals --client "ade wealth"
    python manage.py investigate_open_withdrawals --id 123 --id 124
"""
from collections import defaultdict
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db.models import Q
from django.utils import timezone


def _a(text) -> str:
    """Plain ASCII (the server/console may not handle the naira sign or arrows)."""
    return str(text if text is not None else '').encode('ascii', 'replace').decode()


def _money(v) -> str:
    return f'NGN {Decimal(str(v or 0)):,.2f}'


class Command(BaseCommand):
    help = 'Read-only: explain where each open savings withdrawal request comes from and why it may be hidden.'

    def add_arguments(self, parser):
        parser.add_argument('--branch', help='Branch name (or code), e.g. Orimerunmu')
        parser.add_argument('--client', help='Part of the client name, client ID or account number')
        parser.add_argument('--id', type=int, action='append', dest='ids', help='Request id (repeatable)')

    def handle(self, *args, **opts):
        from common.managers import set_current_tenant
        from savings.models import SavingsWithdrawalRequest

        set_current_tenant(None)  # see every tenant, exactly like the 8 AM job
        today = timezone.localdate()
        w = lambda s='': self.stdout.write(_a(s))  # noqa: E731

        open_statuses = (SavingsWithdrawalRequest.STATUS_PENDING, SavingsWithdrawalRequest.STATUS_PARTIAL,
                         SavingsWithdrawalRequest.STATUS_APPROVED)
        # all_objects: include soft-deleted requests too, so we can say so.
        qs = (SavingsWithdrawalRequest.all_objects
              .filter(status__in=open_statuses)
              .select_related('savings_account__client', 'savings_account__product', 'savings_account__account',
                              'savings_account__branch', 'branch', 'tenant', 'requested_by', 'applied_tier')
              .prefetch_related('approval_steps__approver')
              .order_by('branch__name', 'payout_due_date', 'pk'))
        if opts['ids']:
            qs = qs.filter(pk__in=opts['ids'])
        if opts['branch']:
            qs = qs.filter(Q(branch__name__iexact=opts['branch']) | Q(branch__code__iexact=opts['branch']))
        if opts['client']:
            t = opts['client'].strip()
            q = (Q(savings_account__account_number__icontains=t)
                 | Q(savings_account__client__client_id__icontains=t)
                 | Q(savings_account__nickname__icontains=t))
            for part in t.split():
                q |= (Q(savings_account__client__first_name__icontains=part)
                      | Q(savings_account__client__last_name__icontains=part))
            qs = qs.filter(q)

        rows = list(qs)
        if not rows:
            w('No open withdrawal requests match.')
            return

        dupes = defaultdict(list)
        for wr in rows:
            dupes[(wr.savings_account_id, wr.amount, wr.client_requested_on)].append(wr.pk)

        total_counted = Decimal('0.00')
        hidden_count = 0
        for wr in rows:
            sav = wr.savings_account
            client = getattr(sav, 'client', None)
            branch = wr.branch
            problems = []

            if getattr(wr, 'is_deleted', False):
                problems.append('request itself is soft-deleted (NOT counted by the alert, shown for completeness)')
            if wr.tenant_id is None:
                problems.append('request has NO tenant -> the Withdrawals page hides it from every user')
            elif branch is not None and getattr(branch, 'tenant_id', None) and wr.tenant_id != branch.tenant_id:
                problems.append(f'request tenant ({wr.tenant_id}) differs from its branch tenant ({branch.tenant_id})')
            if branch is None:
                problems.append('request has NO branch')
            elif sav.branch_id and sav.branch_id != wr.branch_id:
                problems.append(f'request branch ({branch.name}) differs from the account branch '
                                f'({sav.branch.name if sav.branch else "-"})')
            if sav.tenant_id != wr.tenant_id:
                problems.append(f'account tenant ({sav.tenant_id}) differs from request tenant ({wr.tenant_id})')
            if getattr(sav, 'is_deleted', False):
                problems.append('savings account is soft-deleted')
            if sav.status in ('closed', 'frozen'):
                problems.append(f'savings account is {sav.status}')
            if client is None:
                problems.append('savings account has no client')
            else:
                if getattr(client, 'is_deleted', False):
                    problems.append('client is soft-deleted')
                if getattr(client, 'tenant_id', None) != wr.tenant_id:
                    problems.append(f'client tenant ({getattr(client, "tenant_id", None)}) differs from request tenant')
            balance = Decimal(str(sav.current_balance or 0))
            if balance < wr.amount:
                problems.append(f'account balance {_money(balance)} is less than the request')
            dup = dupes[(wr.savings_account_id, wr.amount, wr.client_requested_on)]
            if len(dup) > 1:
                problems.append(f'looks DUPLICATED: same account, amount and asked-date as requests {dup}')

            counted = not getattr(wr, 'is_deleted', False)
            if counted:
                total_counted += wr.amount
            hidden = any(p.startswith(('request has NO tenant', 'request tenant', 'savings account is soft',
                                       'client is soft', 'account tenant', 'client tenant')) for p in problems)
            hidden_count += hidden

            due = wr.payout_due_date or wr.created_at.date()
            w('=' * 78)
            w(f'Request #{wr.pk}  {_money(wr.amount)}  {wr.get_status_display()}'
              f'  ({wr.approvals_received}/{wr.required_approvals} approvals)')
            w(f'  client        : {client.full_name if client else "-"} '
              f'({getattr(client, "client_id", "-")}, client pk {getattr(client, "pk", "-")})')
            w(f'  account       : {sav.account_number} ({sav.product.name}) status={sav.status} '
              f'balance={_money(balance)} account pk {sav.pk}')
            w(f'  branch/tenant : {branch.name if branch else "-"} / tenant {wr.tenant_id}')
            w(f'  created       : {wr.created_at:%Y-%m-%d %H:%M} by '
              f'{getattr(wr.requested_by, "username", "-")} '
              f'({getattr(wr.requested_by, "get_full_name", lambda: "")() or "-"})')
            w(f'  asked / due   : {wr.client_requested_on} / {due}'
              f'{"  (OVERDUE " + str((today - due).days) + "d)" if due < today else ""}')
            if wr.description:
                w(f'  description   : {wr.description[:200]}')
            for step in wr.approval_steps.all():
                w(f'  step {step.step_number}        : {step.status} by '
                  f'{getattr(step.approver, "username", "-")} {step.responded_at or ""} {step.comment[:80]}')
            if not wr.approval_steps.exists():
                w('  steps         : none recorded')
            w(f'  find it in UI : /savings/accounts/{sav.pk} (Withdrawals tab) or /savings/withdrawals')
            if problems:
                for p in problems:
                    self.stdout.write(self.style.WARNING(_a(f'  !! {p}')))
            else:
                w('  looks normal: should be visible on /savings/withdrawals to the right branch/officer')

        w('=' * 78)
        w(f'{len(rows)} open request(s), {_money(total_counted)} counted by the liquidity watch; '
          f'{hidden_count} likely hidden from the Withdrawals page.')
        w('Nothing was changed. To clear a stale request, cancel or reject it from the page, '
          'or tell Claude which request ids to close.')
