"""
Estimate how many SMS receipts we would have sent, per month, for budgeting
and for talking to SMS providers.

Counts the money movements that trigger a receipt (from the financial audit
log, the same methods the receipts hook into):
  loan disbursements, loan repayments, savings deposits, savings withdrawals,
  loan approvals, registration/reactivation fees, penalties charged
and keeps only customers with a valid Nigerian mobile number (others can't
receive SMS). Every receipt fits in one SMS unit (160 GSM characters), so
messages = SMS units.

It's a slight UPPER bound: it also counts postings made by scripts/imports,
which never get a receipt. Read-only: it changes nothing.

Usage (on the server):
    docker compose exec backend python manage.py estimate_sms_volume
    docker compose exec backend python manage.py estimate_sms_volume --months 6 --price 6.5 --by-branch
    docker compose exec backend python manage.py estimate_sms_volume --csv > sms_estimate.csv
"""
import csv
from collections import defaultdict
from datetime import date
from decimal import Decimal

from django.core.management.base import BaseCommand

# Every logged financial action that involves a customer. The first four get a
# receipt today; the rest are counted so you can budget for them too.
EVENTS = {
    'loan_disburse': 'Loan disbursed',
    'loan_repay': 'Loan repayment',
    'savings_deposit': 'Savings deposit',
    'savings_withdraw': 'Savings withdraw',
    'loan_approve': 'Loan approved',
    'client_registration_fee': 'Registration fee',
    'client_reactivation_fee': 'Reactivation fee',
    'loan_penalty_accrual': 'Penalty charged',
}
LABEL_W = 17


def _month_start(d, back):
    y, m = d.year, d.month - back
    while m <= 0:
        m += 12
        y -= 1
    return date(y, m, 1)


class Command(BaseCommand):
    help = 'Estimate monthly SMS receipt volume from past transactions (read-only).'

    def add_arguments(self, parser):
        parser.add_argument('--months', type=int, default=3, help='Full past months to include (default 3).')
        parser.add_argument('--price', type=Decimal, default=None, help='Price per SMS in NGN, to estimate cost.')
        parser.add_argument('--by-branch', action='store_true', help='Also break the totals down by branch.')
        parser.add_argument('--tenant', default=None, help='Tenant slug (default: all tenants).')
        parser.add_argument('--csv', action='store_true', help='Output CSV instead of a table.')

    def handle(self, *args, **opts):
        from common.models import FinancialAuditLog
        from loans.models import LoanAccount
        from notifications.receipts import normalise_ng_mobile
        from savings.models import SavingsAccount
        from django.utils import timezone

        today = timezone.localdate()
        start = _month_start(today, opts['months'])
        qs = FinancialAuditLog.objects.filter(event_type__in=EVENTS, timestamp__date__gte=start)
        if opts['tenant']:
            qs = qs.filter(tenant__slug=opts['tenant'])

        rows = list(qs.values_list('event_type', 'record_type', 'record_id', 'timestamp', 'branch__name')
                    .iterator(chunk_size=5000))

        # record → (client_id, phone ok) without one query per row.
        loan_ids = {int(r[2]) for r in rows if r[1] == 'LoanAccount' and str(r[2]).isdigit()}
        sav_ids = {int(r[2]) for r in rows if r[1] == 'SavingsAccount' and str(r[2]).isdigit()}
        client_ids = {int(r[2]) for r in rows if r[1] == 'Client' and str(r[2]).isdigit()}
        owner = {}
        from clients.models import Client
        for pk, phone in Client.all_objects.filter(pk__in=client_ids).values_list(
                'pk', 'phone_primary').iterator(chunk_size=5000):
            owner[('Client', pk)] = (pk, bool(normalise_ng_mobile(phone)))
        for pk, cid, phone in LoanAccount.all_objects.filter(pk__in=loan_ids).values_list(
                'pk', 'client_id', 'client__phone_primary').iterator(chunk_size=5000):
            owner[('LoanAccount', pk)] = (cid, bool(normalise_ng_mobile(phone)))
        for pk, cid, phone in SavingsAccount.all_objects.filter(pk__in=sav_ids).values_list(
                'pk', 'client_id', 'client__phone_primary').iterator(chunk_size=5000):
            owner[('SavingsAccount', pk)] = (cid, bool(normalise_ng_mobile(phone)))

        # month -> event -> count (sendable only); plus no-phone and customers
        sendable = defaultdict(lambda: defaultdict(int))
        no_phone = defaultdict(int)
        customers = defaultdict(set)
        by_branch = defaultdict(lambda: defaultdict(int))
        for event, rtype, rid, ts, branch in rows:
            key = (rtype, int(rid)) if str(rid).isdigit() else None
            info = owner.get(key)
            month = timezone.localtime(ts).strftime('%Y-%m') if timezone.is_aware(ts) else ts.strftime('%Y-%m')
            if not info or not info[1]:
                no_phone[month] += 1
                continue
            sendable[month][event] += 1
            customers[month].add(info[0])
            by_branch[month][branch or '(no branch)'] += 1

        months = [(_month_start(today, b)).strftime('%Y-%m') for b in range(opts['months'], -1, -1)]
        current = today.strftime('%Y-%m')
        price = opts['price']

        if opts['csv']:
            w = csv.writer(self.stdout, lineterminator='\n')
            w.writerow(['month', *EVENTS.values(), 'total_sms', 'unique_customers', 'skipped_no_valid_phone']
                       + (['estimated_cost_ngn'] if price else []))
            for m in months:
                total = sum(sendable[m].values())
                w.writerow([m + (' (to date)' if m == current else ''), *[sendable[m][e] for e in EVENTS],
                            total, len(customers[m]), no_phone[m]] + ([f'{total * price:.2f}'] if price else []))
            return

        out = self.stdout.write
        out('\nEstimated SMS receipts per month (1 SMS each; read-only estimate)\n')
        header = f"{'Month':<17}" + ''.join(f'{v:>{LABEL_W}}' for v in EVENTS.values()) + f"{'TOTAL SMS':>12}{'Customers':>11}{'No phone':>10}"
        if price:
            header += f"{'Cost NGN':>14}"
        out(header)
        out('-' * len(header))
        full_totals = []
        for m in months:
            total = sum(sendable[m].values())
            label = m + (' (to date)' if m == current else '')
            line = f'{label:<17}' + ''.join(f'{sendable[m][e]:>{LABEL_W},}' for e in EVENTS) + f'{total:>12,}{len(customers[m]):>11,}{no_phone[m]:>10,}'
            if price:
                line += f'{total * price:>14,.2f}'
            out(line)
            if m != current:
                full_totals.append(total)
        if full_totals:
            avg = sum(full_totals) / len(full_totals)
            out('-' * len(header))
            out(f'Average of the {len(full_totals)} full month(s): {avg:,.0f} SMS/month'
                + (f'  ≈ NGN{avg * float(price):,.2f}/month' if price else ''))
            out(f'Peak full month: {max(full_totals):,} SMS. Plan for the peak plus ~20% headroom: '
                f'{int(max(full_totals) * 1.2):,} SMS/month.')
        out('\n"No phone" = events for customers without a valid Nigerian mobile number (they would get no SMS).')
        out('Upper bound: also includes postings made by scripts/imports, which never send receipts.')
        receipt_now = ('loan_disburse', 'loan_repay', 'savings_deposit', 'savings_withdraw')
        for m in months:
            r = sum(sendable[m][e] for e in receipt_now)
            out(f'{m}: {r:,} SMS for money in/out (receipts built today), '
                f'{sum(sendable[m].values()) - r:,} more for approvals, fees and penalties.')
        out('')

        if opts['by_branch']:
            out('By branch (SMS):')
            branches = sorted({b for m in months for b in by_branch[m]})
            out(f"{'Branch':<28}" + ''.join(f'{m:>12}' for m in months))
            for b in branches:
                out(f'{b[:27]:<28}' + ''.join(f'{by_branch[m][b]:>12,}' for m in months))
            out('')
