"""
One-off: enrol a client in Smart Savings from a past date, moving the chosen
amount out of their savings account ON that date and posting every missed
cycle's interest on its own maturity date.

Same rules as the Enrol screen (compulsory minimum, 10% of loan debt stays
behind, holds, open withdrawals, product limits), plus: the source account
must have held enough on every day from the start date until today.

Without --apply the whole thing runs inside a transaction and is rolled back,
so the preview shows exactly what would be posted.

Usage:
    python manage.py enrol_smart_savings_backdated --client DC0369 --amount 1000000 --start-date 2026-05-11
    python manage.py enrol_smart_savings_backdated --client DC0369 --amount 1000000 --start-date 2026-05-11 --apply
    (optional) --source 2140-02211   pick the account the money comes from
    (optional) --user admin          who the postings are recorded as
"""
from datetime import datetime

from dateutil.relativedelta import relativedelta
from decimal import Decimal, InvalidOperation

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction


class _Rollback(Exception):
    pass


class Command(BaseCommand):
    help = 'One-off: backdated Smart Savings enrolment with a chosen amount, plus missed interest.'

    def add_arguments(self, parser):
        parser.add_argument('--client', required=True, help='Client ID (e.g. DC-00426) or the number in /clients/<n>')
        parser.add_argument('--amount', required=True, help='Amount to move into Smart Savings')
        parser.add_argument('--start-date', required=True, help='YYYY-MM-DD the cycle really started')
        parser.add_argument('--source', help='Account number the money comes from (default: their only eligible account)')
        parser.add_argument('--user', help='Username the postings are recorded as (default: first superuser)')
        parser.add_argument('--move-open-withdrawals', action='store_true',
                            help='Move open withdrawal requests to the Smart account (paid from there instead).')
        parser.add_argument('--apply', action='store_true', help='Commit. Without it, preview and roll back.')

    def handle(self, *args, **opts):
        from clients.models import Client
        from savings.models import SavingsAccount, SmartSavingsEvent
        from savings.smart_enrolment import (
            SMART_PRODUCT_CODE, check_source, enrol_with_amount, max_movable_to_smart,
        )
        from savings.tasks import process_smart_savings_account

        try:
            start = datetime.strptime(opts['start_date'], '%Y-%m-%d').date()
        except ValueError:
            raise CommandError('--start-date must be YYYY-MM-DD')
        try:
            amount = Decimal(opts['amount'].replace(',', ''))
        except InvalidOperation:
            raise CommandError('--amount must be a number')

        # Accept the client ID in any case (DC-00426 / dc-00426) or the number
        # in the client page's URL (/clients/1013).
        ref = opts['client'].strip()
        client = Client.objects.filter(client_id__iexact=ref).first()
        if client is None and ref.isdigit():
            client = Client.objects.filter(pk=int(ref)).first()
        if client is None:
            raise CommandError(f"No client with client ID or page number {ref!r}")

        accounts = SavingsAccount.objects.filter(client=client).exclude(status='closed').select_related('product')
        if opts['source']:
            source = accounts.filter(account_number=opts['source']).first()
            if not source:
                raise CommandError(f"{opts['source']} is not an open savings account of {client.full_name}")
        else:
            eligible = [a for a in accounts if a.product.code != SMART_PRODUCT_CODE]
            if len(eligible) != 1:
                listing = ', '.join(f'{a.account_number} ({a.product.name})' for a in eligible) or 'none'
                raise CommandError(f'Pick one with --source. Eligible accounts: {listing}')
            source = eligible[0]

        User = get_user_model()
        user = (User.objects.filter(username=opts['user']).first() if opts['user']
                else User.objects.filter(is_superuser=True).order_by('pk').first())
        if user is None:
            raise CommandError('Could not find the user to record postings as (use --user).')

        w = self.stdout.write
        w(f'Client      : {client.full_name} ({client.client_id})')
        w(f'Source      : {source.account_number} ({source.product.name}), balance today NGN {source.current_balance:,.2f}')
        w(f'Amount      : NGN {amount:,.2f}')
        w(f'Start date  : {start}')
        try:
            check_source(source)
        except ValidationError as exc:
            raise CommandError(exc.messages[0])
        lim = max_movable_to_smart(source, start, opts['move_open_withdrawals'])
        w('Limits on the source account:')
        w(f"  must stay behind     NGN {lim['must_stay']:,.2f}  (compulsory NGN {lim['minimum_balance']:,.2f}, "
          f"10% of loan debt NGN {lim['loan_outstanding']:,.2f} = NGN {lim['loan_cover_required']:,.2f})")
        w(f"  holds / open w/d     NGN {lim['holds']:,.2f} / NGN {lim['open_withdrawals']:,.2f}")
        w(f"  lowest bal since start NGN {lim['lowest_balance_since_start'] if lim['lowest_balance_since_start'] is not None else source.current_balance:,.2f}")
        w(f"  max that can move    NGN {lim['max_movable']:,.2f}")
        from savings.smart_enrolment import open_withdrawal_requests
        moving = list(open_withdrawal_requests(source)) if opts['move_open_withdrawals'] else []
        if moving:
            maturity = start + relativedelta(months=3)
            w('Open withdrawal requests moving to the Smart account:')
            for wr in moving:
                w(f'  #{wr.pk}  NGN {wr.amount:,.2f}  {wr.get_status_display()}  '
                  f'asked {wr.client_requested_on}, payout due {wr.payout_due_date}')
            self.stdout.write(self.style.WARNING(
                f'  NOTE: paid out before the cycle matures on {maturity}, these trigger the early-withdrawal '
                f'penalty and restart the cycle (the client loses this cycle 6% interest). '
                f'Paying on or after {maturity} avoids that.'))

        try:
            with transaction.atomic():
                try:
                    smart = enrol_with_amount(source, amount, user, start_date=start,
                                              move_open_withdrawals=opts['move_open_withdrawals'])
                except ValidationError as exc:
                    raise CommandError(exc.messages[0])
                counts = process_smart_savings_account(smart.pk)
                smart.refresh_from_db()
                smart.savings.account.refresh_from_db()
                w('')
                w(f'Smart account {smart.savings.account_number} (transfer dated {start})')
                for ev in SmartSavingsEvent.objects.filter(account=smart).order_by('created_at'):
                    w(f'  interest NGN {ev.amount:,.2f}  ' + ev.details.encode('ascii', 'replace').decode())
                w(f"  cycles posted: {counts['processed']}  (manual-JV skips: {counts['manual_jv']})")
                w(f'  Smart balance now      NGN {smart.savings.current_balance:,.2f}')
                w(f'  current cycle          {smart.start_date} -> {smart.maturity_date}, '
                  f'opening NGN {smart.opening_balance:,.2f}')
                source.account.refresh_from_db()
                w(f'  Source balance now     NGN {source.current_balance:,.2f}')
                if not opts['apply']:
                    raise _Rollback()
        except _Rollback:
            self.stdout.write(self.style.WARNING('\nPREVIEW ONLY - everything above was rolled back. Re-run with --apply.'))
            return
        self.stdout.write(self.style.SUCCESS('\nDone - committed.'))
