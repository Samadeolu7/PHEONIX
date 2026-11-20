"""
Estimate how many SMS receipts we would have sent, per month, for budgeting
and for talking to SMS providers.

Counts the money movements that trigger a receipt (from the financial audit
log, the same methods the receipts hook into):
  loan disbursements, loan repayments, savings deposits, savings withdrawals,
  loan approvals, registration/reactivation fees, penalties charged
for EVERY customer, including those whose phone number is missing or invalid
(those are shown separately so you know how many numbers to collect). Every receipt fits in one SMS unit (160 GSM characters), so
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
        missing_phone_customers = set()
        customers = defaultdict(set)
        by_branch = defaultdict(lambda: defaultdict(int))
        for event, rtype, rid, ts, branch in rows:
            key = (rtype, int(rid)) if str(rid).isdigit() else None
            info = owner.get(key)
            month = timezone.localtime(ts).strftime('%Y-%m') if timezone.is_aware(ts) else ts.strftime('%Y-%m')
            sendable[month][event] += 1
            if info:
                customers[month].add(info[0])
            if not info or not info[1]:
                no_phone[month] += 1
                if info:
                    missing_phone_customers.add(info[0])
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
        out('\nEveryone is counted. "No phone" = how many of those SMS are for customers whose number is missing')
        out(f'or invalid today. Numbers to collect: {len(missing_phone_customers):,} customers in this period.')
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

        self._penalty_warnings(months, start, today, opts, out)

    def _penalty_warnings(self, months, start, today, opts, out):
        """
        Warnings before a penalty is added: one SMS per instalment.
          * 'Due reminder'   - every instalment falling due that month (sent a day or two before).
          * 'Missed warning' - only instalments NOT fully paid by their due date, i.e. the ones a
                               penalty would hit (sent on the due date / during the grace period).
        """
        from django.db.models import F, Q
        from loans.models import LoanRepaymentSchedule
        from notifications.receipts import normalise_ng_mobile

        qs = LoanRepaymentSchedule.objects.filter(
            due_date__gte=start, due_date__lte=today, is_deleted=False)
        if opts['tenant']:
            qs = qs.filter(loan__tenant__slug=opts['tenant'])
        missed_q = (Q(days_late__gt=0) | Q(penalty_due__gt=0)
                    | (Q(status__in=['pending', 'partial', 'overdue']) & Q(due_date__lt=today))
                    | (Q(status='paid') & Q(payment_date__gt=F('due_date'))))
        due = defaultdict(int)
        missed = defaultdict(int)
        missed_customers = defaultdict(set)
        phone_ok = {}
        no_phone = defaultdict(int)
        missing = set()
        missed_ids = set(qs.filter(missed_q).values_list('pk', flat=True))
        for pk, d, cid, phone in qs.values_list('pk', 'due_date', 'loan__client_id',
                                                'loan__client__phone_primary').iterator(chunk_size=5000):
            if cid not in phone_ok:
                phone_ok[cid] = bool(normalise_ng_mobile(phone))
            m = d.strftime('%Y-%m')
            if not phone_ok[cid]:
                no_phone[m] += 1
                missing.add(cid)
            due[m] += 1
            if pk in missed_ids:
                missed[m] += 1
                missed_customers[m].add(cid)
        current = today.strftime('%Y-%m')
        price = opts['price']
        out('Warnings before penalties (1 SMS per instalment, everyone counted):')
        head = f"{'Month':<17}{'Due reminders':>16}{'Missed warnings':>17}{'Customers missed':>18}{'No phone':>10}"
        if price:
            head += f"{'Cost reminders':>16}{'Cost missed':>13}"
        out(head)
        out('-' * len(head))
        for m in months:
            label = m + (' (to date)' if m == current else '')
            line = f'{label:<17}{due[m]:>16,}{missed[m]:>17,}{len(missed_customers[m]):>18,}{no_phone[m]:>10,}'
            if price:
                line += f'{due[m] * price:>16,.2f}{missed[m] * price:>13,.2f}'
            out(line)
        out(f'"No phone" = reminders for customers with no valid number yet; {len(missing):,} customers to collect.')
        out('Due reminders = every instalment that fell due (warn everyone 1-2 days before).')
        out('Missed warnings = instalments not fully paid by the due date (warn only those a penalty would hit).')
        out('Double the missed column if you send two warnings (on the due date and at the end of the grace period).\n')
