from datetime import date, timedelta
from decimal import Decimal
from unittest import mock

from django.test import SimpleTestCase, TestCase
from django.utils import timezone

from common.managers import set_current_tenant
from treasury.services import borrowings as svc
from treasury.services.forecast import (
    OUT_BORROWING_INSTALMENT,
    OUT_BORROWING_SHARE,
    branch_cash,
    branch_forecast,
    earliest_date_for,
    impact_of,
)
from treasury.tests.helpers import make_bank_account, make_borrowing, make_env, set_balance

D = Decimal


class ForecastHelpersTests(SimpleTestCase):
    def test_earliest_date_requires_every_later_day_to_stay_funded(self):
        today = date(2026, 11, 1)
        f = {'today': today, '_closing': [D('0'), D('100'), D('50'), D('300'), D('300')]}
        # A dip to 50 on day 2 means 100 is only safe from day 3 onward.
        self.assertEqual(earliest_date_for(f, D('0')), today)
        self.assertEqual(earliest_date_for(f, D('50')), today + timedelta(days=1))
        self.assertEqual(earliest_date_for(f, D('250')), today + timedelta(days=3))
        self.assertIsNone(earliest_date_for(f, D('400')))

    def test_impact_lists_only_days_that_carry_an_obligation(self):
        today = date(2026, 11, 1)
        ob = {'type': OUT_BORROWING_SHARE, 'description': 'Share', 'amount': D('500'), 'overdue': False}
        f = {'days': [
            {'date': today, 'closing': D('400'), 'outflows': []},
            {'date': today + timedelta(days=1), 'closing': D('100'), 'outflows': [ob]},
        ]}
        breaches, worst = impact_of(f, D('300'))
        self.assertEqual(len(breaches), 1)
        self.assertEqual(breaches[0]['shortfall'], D('200'))
        self.assertEqual(worst, D('200'))


class BranchForecastTests(TestCase):
    def setUp(self):
        self.env = make_env("fc")
        self.hq_bank = make_bank_account(self.env, self.env['hq'], "1001")
        self.ik_bank = make_bank_account(self.env, self.env['ikeja'], "1002")

    def tearDown(self):
        set_current_tenant(None)

    def test_idle_branch_can_lend_everything(self):
        set_balance(self.ik_bank.gl_account, '750000')
        f = branch_forecast(self.env['ikeja'])
        self.assertEqual(branch_cash(self.env['ikeja']), D('750000'))
        self.assertEqual(f['available_today'], D('750000'))
        self.assertEqual(f['lookahead_days'], 45)
        self.assertEqual(len(f['days']), 46)

    def test_branch_share_is_reserved_from_the_cash(self):
        today = timezone.localdate()
        b = make_borrowing(self.env, self.hq_bank, self.ik_bank, principal='1000000.00', rate='0', tenor=2,
                           first_due=today + timedelta(days=10))
        f = branch_forecast(self.env['ikeja'])
        # Ikeja received 1,000,000 but owes the whole of it back in two shares: nothing is lendable.
        self.assertEqual(f['cash_now'], D('1000000.00'))
        self.assertEqual(f['available_today'], D('0.00'))
        events = [e for row in f['days'] for e in row['outflows']]
        self.assertEqual([e['type'] for e in events], [OUT_BORROWING_SHARE, OUT_BORROWING_SHARE])
        self.assertEqual(events[0]['amount'], D('500000.00'))
        # First share is due lead_days (3) before the instalment.
        first_day = next(row['date'] for row in f['days'] if row['outflows'])
        self.assertEqual(first_day, today + timedelta(days=7))

        # Extra cash above what is committed is lendable.
        set_balance(self.ik_bank.gl_account, '1300000')
        self.assertEqual(branch_forecast(self.env['ikeja'])['available_today'], D('300000'))
        # ...and sending a share removes that obligation.
        svc.send_contribution(b.instalments.get(number=1).contributions.get(), self.env['owner'])
        f2 = branch_forecast(self.env['ikeja'])
        self.assertEqual(len([e for row in f2['days'] for e in row['outflows']]), 1)

    def test_debit_branch_sees_instalment_out_and_unsent_shares_in(self):
        today = timezone.localdate()
        make_borrowing(self.env, self.hq_bank, self.ik_bank, principal='1000000.00', rate='0', tenor=2,
                       first_due=today + timedelta(days=10))
        f = branch_forecast(self.env['hq'])
        out = [e for row in f['days'] for e in row['outflows']]
        self.assertEqual([e['type'] for e in out], [OUT_BORROWING_INSTALMENT, OUT_BORROWING_INSTALMENT])
        self.assertEqual(sum(row['inflow'] for row in f['days']), D('1000000.00'))  # both shares expected in
        self.assertEqual(f['available_today'], D('0.00'))  # HQ holds no money of its own

    def test_overdue_obligation_counts_today(self):
        today = timezone.localdate()
        # First share was due yesterday (instalment in 2 days, 3-day lead).
        make_borrowing(self.env, self.hq_bank, self.ik_bank, principal='1000000.00', rate='0', tenor=2,
                       first_due=today + timedelta(days=2))
        f = branch_forecast(self.env['ikeja'])
        today_events = f['days'][0]['outflows']
        self.assertEqual(len(today_events), 1)
        self.assertTrue(today_events[0]['overdue'])

    def test_expected_repayments_are_scaled_by_collection_rate(self):
        set_balance(self.ik_bank.gl_account, '100000')
        with mock.patch('treasury.services.forecast.collection_rate',
                        return_value=(D('0.5'), D('50'), D('100'))):
            f = branch_forecast(self.env['ikeja'])
        self.assertEqual(f['collection_rate'], D('0.5'))
        self.assertEqual(f['expected_inflows_total'], D('0'))  # no schedule rows in this tenant
