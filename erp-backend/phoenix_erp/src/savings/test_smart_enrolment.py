"""Smart Savings enrolment with a chosen amount, and backdated catch-up of missed interest."""
from datetime import timedelta
from decimal import Decimal
from unittest import mock

from dateutil.relativedelta import relativedelta
from django.core.exceptions import ValidationError
from django.test import TestCase
from django.utils import timezone

from accounts.models import Account
from clients.models import Client
from common.managers import set_current_tenant
from products.models import Product
from savings.models import SavingsAccount, SmartSavingsEvent
from savings.smart_enrolment import SMART_PRODUCT_CODE, enrol_with_amount, max_movable_to_smart
from savings.tasks import process_smart_savings_account
from transactions.models import Transaction
from treasury.tests.helpers import make_env

D = Decimal
LOANS = 'savings.smart_enrolment.client_loan_outstanding'


class SmartEnrolmentTests(TestCase):
    def setUp(self):
        env = make_env("se")
        self.user, self.branch, self.tenant = env['owner'], env['ikeja'], env['tenant']
        self.today = timezone.localdate()
        common = dict(owner=self.user, created_by=self.user, branch=self.branch, tenant=self.tenant)
        Account.objects.create(name="Customer Savings", code="2140", account_type=Account.SAVINGS,
                               account_level=Account.LEVEL_PARENT, **common)
        Account.objects.create(name="Expenses", code="5000", account_type=Account.EXPENSE,
                               account_level=Account.LEVEL_PARENT, **common)
        Account.objects.create(name="Income", code="4000", account_type=Account.INCOME,
                               account_level=Account.LEVEL_PARENT, **common)
        self.cash = Account.objects.create(name="Cash", code="1000", account_type=Account.ASSET,
                                           account_level=Account.LEVEL_PARENT, **common)
        product = Product.objects.create(name="Regular Savings", code="SAV-REG", product_type="SAVINGS",
                                         product_class="FINANCIAL", owner=self.user, branch=self.branch,
                                         tenant=self.tenant)
        self.client_ = Client.objects.create(
            client_id="SE-1", first_name="Ada", last_name="Saver", gender="female", phone_primary="08030000001",
            tenant=self.tenant, owner=self.user, branch=self.branch)
        # Creating a client auto-opens their Regular Savings (savings/signals.py).
        self.source = SavingsAccount.objects.get(client=self.client_, product=product)
        SavingsAccount.objects.filter(pk=self.source.pk).update(
            minimum_balance=D('1000'), opened_on=self.today - timedelta(days=400))
        self.source.refresh_from_db()
        # 500,000 deposited well before any start date used below
        self.source.deposit(D('500000'), cashier_account=self.cash, transacted_by=self.user,
                            date=self.today - timedelta(days=300))
        self.source.account.refresh_from_db()

    def tearDown(self):
        set_current_tenant(None)

    def _bal(self, sav):
        sav.account.refresh_from_db()
        return sav.current_balance

    def test_limits_keep_compulsory_and_ten_percent_of_loan_debt(self):
        with mock.patch(LOANS, return_value=D('200000')):
            lim = max_movable_to_smart(self.source)
        self.assertEqual(lim['must_stay'], D('20000.00'))  # 10% of 200k beats the 1,000 floor
        self.assertEqual(lim['max_movable'], D('480000.00'))
        with mock.patch(LOANS, return_value=D('0')):
            self.assertEqual(max_movable_to_smart(self.source)['max_movable'], D('499000.00'))

    def test_enrol_today_moves_money_and_starts_cycle(self):
        with mock.patch(LOANS, return_value=D('0')):
            smart = enrol_with_amount(self.source, D('300000'), self.user)
        self.assertEqual(self._bal(self.source), D('200000'))
        self.assertEqual(self._bal(smart.savings), D('300000'))
        self.assertEqual(smart.savings.product.code, SMART_PRODUCT_CODE)
        self.assertEqual(smart.start_date, self.today)
        self.assertEqual(smart.opening_balance, D('300000'))
        self.assertTrue(smart.savings.product.savings_product_config.has_savings_cycle)

    def test_too_much_is_refused_with_reason(self):
        with mock.patch(LOANS, return_value=D('200000')), self.assertRaises(ValidationError) as ctx:
            enrol_with_amount(self.source, D('490000'), self.user)
        self.assertIn('480,000.00', ctx.exception.messages[0])
        self.assertEqual(self._bal(self.source), D('500000'))

    def test_cannot_enrol_twice(self):
        with mock.patch(LOANS, return_value=D('0')):
            enrol_with_amount(self.source, D('100000'), self.user)
            with self.assertRaises(ValidationError):
                enrol_with_amount(self.source, D('100000'), self.user)

    def test_backdated_enrolment_catches_up_each_cycle_on_its_maturity_date(self):
        start = self.today - relativedelta(months=7)  # two full cycles have matured
        with mock.patch(LOANS, return_value=D('0')):
            smart = enrol_with_amount(self.source, D('100000'), self.user, start_date=start)
        transfer = Transaction.objects.get(series__code='SVSMT')
        self.assertEqual(transfer.date, start)

        counts = process_smart_savings_account(smart.pk, self.today)
        self.assertEqual(counts['processed'], 2)
        interest = Transaction.objects.filter(series__code='SSI').order_by('date')
        self.assertEqual([t.date for t in interest],
                         [start + relativedelta(months=3), start + relativedelta(months=6)])
        # 6% of 100,000 then 6% of 106,000
        self.assertEqual(list(SmartSavingsEvent.objects.order_by('created_at').values_list('amount', flat=True)),
                         [D('6000.00'), D('6360.00')])
        smart.refresh_from_db()
        self.assertEqual(self._bal(smart.savings), D('112360.00'))
        self.assertEqual(smart.start_date, start + relativedelta(months=6))
        self.assertEqual(self._bal(self.source), D('400000'))

    def test_backdated_needs_the_money_to_have_been_there_all_along(self):
        # 450,000 only arrived today, after the start date
        self.source.deposit(D('450000'), cashier_account=self.cash, transacted_by=self.user, date=self.today)
        start = self.today - relativedelta(months=4)
        with mock.patch(LOANS, return_value=D('0')):
            self.assertEqual(max_movable_to_smart(self.source)['max_movable'], D('949000.00'))
            lim = max_movable_to_smart(self.source, start)
            self.assertEqual(lim['lowest_balance_since_start'], D('500000'))
            self.assertEqual(lim['max_movable'], D('499000.00'))
            with self.assertRaises(ValidationError):
                enrol_with_amount(self.source, D('600000'), self.user, start_date=start)

    def test_open_withdrawal_request_can_move_with_the_money(self):
        from savings.services import initiate_withdrawal
        wr = initiate_withdrawal(self.source, D('60000'), self.user)
        with mock.patch(LOANS, return_value=D('0')):
            self.assertEqual(max_movable_to_smart(self.source)['max_movable'], D('439000.00'))
            with self.assertRaises(ValidationError):
                enrol_with_amount(self.source, D('499000'), self.user)
            smart = enrol_with_amount(self.source, D('499000'), self.user, move_open_withdrawals=True)
        wr.refresh_from_db()
        self.assertEqual(wr.savings_account_id, smart.savings_id)
        self.assertEqual(self._bal(self.source), D('1000'))
        self.assertEqual(self._bal(smart.savings), D('499000'))

    def test_investigate_open_withdrawals_flags_hidden_and_duplicates(self):
        from io import StringIO
        from django.core.management import call_command
        from savings.models import SavingsWithdrawalRequest
        from savings.services import initiate_withdrawal
        a = initiate_withdrawal(self.source, D('120000'), self.user)
        b = initiate_withdrawal(self.source, D('120000'), self.user)
        SavingsWithdrawalRequest.all_objects.filter(pk=b.pk).update(tenant=None)
        out = StringIO()
        call_command('investigate_open_withdrawals', '--client', 'ada saver', stdout=out)
        text = out.getvalue()
        self.assertIn(f'Request #{a.pk}', text)
        self.assertIn(f'Request #{b.pk}', text)
        self.assertIn('NO tenant', text)
        self.assertIn('DUPLICATED', text)
        self.assertIn('2 open request(s)', text)
