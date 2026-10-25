"""Smart Saver withdrawal requests get a payout deadline, and open requests reserve the branch's cash."""
from datetime import timedelta
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.test import TestCase
from django.utils import timezone

from accounts.models import Account
from clients.models import Client
from common.managers import set_current_tenant
from products.models import Product
from savings.models import SavingsAccount, SavingsWithdrawalRequest, SmartSavingsAccount
from savings.services import initiate_withdrawal
from treasury.services.forecast import OUT_SAVINGS, branch_forecast
from treasury.tasks import collect_alerts
from treasury.tests.helpers import make_bank_account, make_env, set_balance

D = Decimal


class WithdrawalNoticeTests(TestCase):
    def setUp(self):
        self.env = make_env("wn")
        self.owner, self.branch, self.tenant = self.env['owner'], self.env['ikeja'], self.env['tenant']
        self.today = timezone.localdate()
        self.bank = make_bank_account(self.env, self.branch, "5001")
        set_balance(self.bank.gl_account, '1000000')

        parent = Account.objects.create(
            name="Savings", code="2100", account_type=Account.SAVINGS, account_level=Account.LEVEL_PARENT,
            owner=self.owner, created_by=self.owner, branch=self.branch)
        self.product = Product.objects.create(
            name="Regular Savings", product_type="SAVINGS", owner=self.owner, branch=self.branch)
        self.counter = 0
        self.parent = parent

    def tearDown(self):
        set_current_tenant(None)

    def _account(self, smart):
        self.counter += 1
        gl = Account.objects.create(
            name=f"Saver {self.counter}", code=f"210{self.counter}", account_type=Account.SAVINGS,
            account_level=Account.LEVEL_CHILD, parent=self.parent, owner=self.owner, created_by=self.owner,
            branch=self.branch)
        set_balance(gl, '500000')
        client = Client.objects.create(
            client_id=f"S-{self.counter}", first_name="Jane", last_name=f"Saver{self.counter}", gender="female",
            phone_primary=f"0802222222{self.counter}", tenant=self.tenant, owner=self.owner, branch=self.branch)
        sa = SavingsAccount.objects.create(
            client=client, account=gl, product=self.product, account_number=f"SAV-{self.counter}",
            interest_rate=D('3.50'), interest_calculation_method="monthly", minimum_balance=D('0'),
            opened_on=self.today, status="active", owner=self.owner, branch=self.branch)
        if smart:
            SmartSavingsAccount.objects.create(
                savings=sa, is_active=True, start_date=self.today - timedelta(days=80),
                opening_balance=D('500000'), owner=self.owner)
        return sa

    def test_regular_account_is_due_the_day_it_was_asked(self):
        wr = initiate_withdrawal(self._account(smart=False), D('100000'), self.owner)
        self.assertEqual(wr.client_requested_on, self.today)
        self.assertEqual(wr.payout_due_date, self.today)

    def test_smart_saver_gets_the_notice_period(self):
        wr = initiate_withdrawal(self._account(smart=True), D('100000'), self.owner)
        self.assertEqual(wr.payout_due_date, self.today + timedelta(days=14))

    def test_late_keyed_request_counts_from_the_day_the_client_asked(self):
        asked = self.today - timedelta(days=5)
        wr = initiate_withdrawal(self._account(smart=True), D('100000'), self.owner, client_requested_on=asked)
        self.assertEqual(wr.client_requested_on, asked)
        self.assertEqual(wr.payout_due_date, asked + timedelta(days=14))

    def test_request_date_cannot_be_in_the_future(self):
        with self.assertRaises(ValidationError):
            initiate_withdrawal(self._account(smart=True), D('100000'), self.owner,
                                client_requested_on=self.today + timedelta(days=1))

    def test_open_request_reserves_cash_from_its_due_date(self):
        initiate_withdrawal(self._account(smart=True), D('300000'), self.owner)
        f = branch_forecast(self.branch)
        events = [(row['date'], e) for row in f['days'] for e in row['outflows']]
        self.assertEqual(len(events), 1)
        day, event = events[0]
        self.assertEqual(day, self.today + timedelta(days=14))
        self.assertEqual(event['type'], OUT_SAVINGS)
        self.assertEqual(event['amount'], D('300000'))
        self.assertEqual(f['available_today'], D('700000.00'))

    def test_overdue_request_counts_today_and_is_flagged(self):
        asked = self.today - timedelta(days=20)  # Smart Saver deadline passed 6 days ago
        initiate_withdrawal(self._account(smart=True), D('300000'), self.owner, client_requested_on=asked)
        f = branch_forecast(self.branch)
        today_events = f['days'][0]['outflows']
        self.assertEqual(len(today_events), 1)
        self.assertTrue(today_events[0]['overdue'])

    def test_completed_or_cancelled_requests_no_longer_reserve_cash(self):
        wr = initiate_withdrawal(self._account(smart=True), D('300000'), self.owner)
        SavingsWithdrawalRequest.objects.filter(pk=wr.pk).update(status=SavingsWithdrawalRequest.STATUS_COMPLETED)
        self.assertEqual(branch_forecast(self.branch)['available_today'], D('1000000.00'))

    def test_daily_watch_flags_payouts_near_their_deadline(self):
        asked = self.today - timedelta(days=12)  # due in 2 days
        initiate_withdrawal(self._account(smart=True), D('250000'), self.owner, client_requested_on=asked)
        alerts = collect_alerts(self.today)
        lines = [line for bucket in alerts.values() for line in bucket['lines']]
        self.assertEqual(len(lines), 1)
        self.assertIn('Savings payout', lines[0])
        self.assertIn('250,000.00', lines[0])


class DigestNoiseTests(WithdrawalNoticeTests):
    def test_fresh_regular_withdrawal_is_not_in_the_digest_but_a_stale_one_is(self):
        initiate_withdrawal(self._account(smart=False), D('1000'), self.owner)  # asked today
        self.assertEqual(sum(len(b['lines']) for b in collect_alerts(self.today).values()), 0)
        initiate_withdrawal(self._account(smart=False), D('2000'), self.owner,
                            client_requested_on=self.today - timedelta(days=4))
        lines = [l for b in collect_alerts(self.today).values() for l in b['lines']]
        self.assertEqual(len(lines), 1)
        self.assertIn('2,000.00', lines[0])
