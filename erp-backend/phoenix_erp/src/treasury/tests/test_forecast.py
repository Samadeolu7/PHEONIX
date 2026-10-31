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


class CollectionRateTests(TestCase):
    """Rate is like-for-like on instalments due in the window, with a grace period and an adjustable cap."""

    def setUp(self):
        from treasury.tests.helpers import make_pending_loan
        self.env = make_env("cr")
        make_bank_account(self.env, self.env['ikeja'], "9001")
        self.loan = make_pending_loan(self.env, self.env['ikeja'])
        self.loan.status = 'active'
        self.loan.outstanding_principal = D('10000000')   # real balance well above any test schedule
        self.loan.save()
        self.today = timezone.localdate()
        self.n = 0

    def tearDown(self):
        set_current_tenant(None)

    def _row(self, days_ago, due, paid):
        from loans.models import LoanRepaymentSchedule
        self.n += 1
        return LoanRepaymentSchedule.objects.create(
            loan=self.loan, installment_number=self.n, due_date=self.today - timedelta(days=days_ago),
            principal_due=D(due), interest_due=D('0'), total_due=D(due), total_paid=D(paid),
            tenant=self.env['tenant'], owner=self.env['owner'], branch=self.env['ikeja'])

    def test_rate_is_paid_over_due_for_instalments_in_window(self):
        from treasury.services.forecast import collection_rate
        self._row(30, '100', '100')
        self._row(20, '100', '0')
        rate, paid, due = collection_rate(self.env['ikeja'], self.today, 90)
        self.assertEqual((rate, paid, due), (D('0.5'), D('100'), D('200')))

    def test_overpayment_and_old_arrears_cannot_push_the_rate_above_what_was_due(self):
        from treasury.services.forecast import collection_rate
        self._row(30, '100', '250')   # overpaid: only the 100 due counts
        self._row(20, '100', '0')
        self.assertEqual(collection_rate(self.env['ikeja'], self.today, 90)[0], D('0.5'))

    def test_instalments_due_in_the_last_week_are_ignored(self):
        from treasury.services.forecast import collection_rate
        self._row(3, '100', '0')      # due 3 days ago, not paid yet: inside the grace period
        self.assertEqual(collection_rate(self.env['ikeja'], self.today, 90)[0], D('0'))
        self._row(30, '100', '100')
        self.assertEqual(collection_rate(self.env['ikeja'], self.today, 90)[0], D('1'))

    def test_forecast_applies_the_cap_but_reports_the_measured_rate(self):
        self._row(30, '100', '100')   # measured 100%
        f = branch_forecast(self.env['ikeja'])
        self.assertEqual(f['measured_collection_rate'], D('1'))
        self.assertEqual(f['collection_rate'], D('0.9'))   # default cap 90%
        from treasury.models import TreasurySettings
        row = TreasurySettings.get_for(self.env['tenant'])
        row.max_collection_rate_pct = 60
        row.save()
        self.assertEqual(branch_forecast(self.env['ikeja'])['collection_rate'], D('0.6'))


class ArrearsRecoveryTests(CollectionRateTests):
    """Old debt the branch is recovering counts as expected cash, at its own recent recovery rate."""

    def _pay(self, row, days_ago, amount, reversed_=False):
        from loans.models import LoanRepaymentAllocation
        from transactions.models import Transaction, TransactionSeries
        series, _ = TransactionSeries.objects.get_or_create(code='LNPMT', defaults={'description': 'Loan payment'})
        txn = Transaction.objects.create(
            series=series, date=self.today - timedelta(days=days_ago), description='test payment',
            branch=self.env['ikeja'], owner=self.env['owner'], tenant=self.env['tenant'])
        if reversed_:
            Transaction.objects.filter(pk=txn.pk).update(is_reversed=True)
        return LoanRepaymentAllocation.objects.create(
            loan=self.loan, schedule=row, journal_entry=txn, principal_applied=D(amount),
            tenant=self.env['tenant'], owner=self.env['owner'])

    def test_recovery_rate_rebuilds_old_arrears_backwards(self):
        from treasury.services.forecast import recovery_rate
        # Due 120 days ago: 1000 due, 400 paid so far, of which 100 came in during the last 90 days
        # (the other 300 was paid long ago, e.g. before allocations were tracked).
        row = self._row(120, '1000', '400')
        self._pay(row, 30, '100')
        self._pay(row, 20, '500', reversed_=True)  # reversed payments never count
        rate, recovered, arrears_then = recovery_rate(self.env['ikeja'], self.today, 90)
        self.assertEqual(recovered, D('100'))
        self.assertEqual(arrears_then, D('700'))      # 600 unpaid now + 100 recovered since
        self.assertEqual(rate, D('100') / D('700'))

    def test_forecast_adds_expected_recovery_spread_over_the_window(self):
        row = self._row(120, '1000', '400')
        self._pay(row, 30, '100')
        self._row(2, '50', '0')                       # freshly overdue, also part of today's arrears
        f = branch_forecast(self.env['ikeja'])
        self.assertEqual(f['arrears_outstanding'], D('650'))
        per_day = (D('650') * (D('100') / D('700')) / D('90')).quantize(D('0.01'))
        self.assertEqual(f['expected_recovery_total'], per_day * 45)
        self.assertEqual(f['days'][0]['inflow'], D('0'))       # nothing assumed for today itself
        self.assertEqual(f['days'][1]['inflow'], per_day)

    def test_recovery_can_be_switched_off(self):
        from treasury.models import TreasurySettings
        row = self._row(120, '1000', '400')
        self._pay(row, 30, '100')
        s = TreasurySettings.get_for(self.env['tenant'])
        s.include_arrears_recovery = False
        s.save()
        f = branch_forecast(self.env['ikeja'])
        self.assertEqual(f['expected_recovery_total'], D('0'))

    def test_never_expects_back_more_than_is_owed(self):
        row = self._row(120, '100', '0')
        self._pay(row, 10, '100')                     # recovered fully -> measured rate 100%, capped 90%
        self._row(150, '10', '0')                     # 10 still owed today
        f = branch_forecast(self.env['ikeja'])
        self.assertLessEqual(f['expected_recovery_total'], f['arrears_outstanding'])


class ReserveBufferTests(TestCase):
    """Money must be ready `reserve_buffer_days` before an obligation is due; until then the branch can lend it."""

    def setUp(self):
        from treasury.models import TreasurySettings
        from treasury.tests.helpers import make_pending_loan
        self.env = make_env("buf")
        self.today = timezone.localdate()
        self.hq_bank = make_bank_account(self.env, self.env['hq'], "9101")
        self.ik_bank = make_bank_account(self.env, self.env['ikeja'], "9102")
        # Ikeja owes one 1,000,000 share, due in 7 days (instalment in 10, 3-day lead).
        make_borrowing(self.env, self.hq_bank, self.ik_bank, principal='1000000.00', rate='0', tenor=1,
                       first_due=self.today + timedelta(days=10))
        # 300,000 of repayments fall due in 6 days.
        loan = make_pending_loan(self.env, self.env['ikeja'])
        loan.status = 'active'
        loan.outstanding_principal = D('300000')
        loan.save()
        from loans.models import LoanRepaymentSchedule
        LoanRepaymentSchedule.objects.create(
            loan=loan, installment_number=1, due_date=self.today + timedelta(days=6),
            principal_due=D('300000'), interest_due=D('0'), total_due=D('300000'), total_paid=D('0'),
            tenant=self.env['tenant'], owner=self.env['owner'], branch=self.env['ikeja'])
        self.settings = TreasurySettings.get_for(self.env['tenant'])
        self.settings.max_collection_rate_pct = 100
        self.settings.include_arrears_recovery = False
        self.settings.save()

    def tearDown(self):
        set_current_tenant(None)

    def _forecast(self, buffer_days):
        self.settings.reserve_buffer_days = buffer_days
        self.settings.save()
        with mock.patch('treasury.services.forecast.collection_rate', return_value=(D('1'), D('1'), D('1'))):
            return branch_forecast(self.env['ikeja'])

    def test_without_buffer_repayments_arriving_before_the_due_date_free_up_cash(self):
        f = self._forecast(0)
        # 1,000,000 cash; +300,000 on day 6; -1,000,000 on day 7 -> 300,000 can be lent today.
        self.assertEqual(f['available_today'], D('300000.00'))

    def test_two_day_buffer_does_not_rely_on_repayments_in_the_last_two_days(self):
        f = self._forecast(2)
        # The share must be ready on day 5, before the day-6 repayments arrive -> nothing to spare today.
        self.assertEqual(f['available_today'], D('0.00'))
        day5 = f['days'][5]
        self.assertEqual(len(day5['outflows']), 1)
        self.assertEqual(day5['outflows'][0]['due_day'], self.today + timedelta(days=7))
        self.assertIn('must be ready by', day5['outflows'][0]['description'])

    def test_buffer_never_moves_an_obligation_before_today(self):
        self.settings.reserve_buffer_days = 14
        self.settings.save()
        f = branch_forecast(self.env['ikeja'])
        self.assertEqual(len(f['days'][0]['outflows']), 1)   # pulled to today, not into the past


class ShortfallWarningTests(TestCase):
    def setUp(self):
        self.env = make_env("sfw")
        self.hq_bank = make_bank_account(self.env, self.env['hq'], "9201")
        self.ik_bank = make_bank_account(self.env, self.env['ikeja'], "9202")
        make_borrowing(self.env, self.hq_bank, self.ik_bank, principal='1000000.00', rate='0', tenor=1,
                       first_due=timezone.localdate() + timedelta(days=10))

    def tearDown(self):
        set_current_tenant(None)

    def test_daily_watch_warns_when_a_branch_is_heading_for_a_shortfall_and_names_donor_branches(self):
        from treasury.tasks import collect_alerts
        set_balance(self.ik_bank.gl_account, '600000')    # owes 1,000,000 in 7 days, has 600,000
        set_balance(self.hq_bank.gl_account, '900000')    # HQ has spare cash (its inflow share covers its instalment)
        lines = [l for b in collect_alerts(timezone.localdate()).values() for l in b['lines']]
        warning = next(l for l in lines if l.startswith('SHORTFALL WARNING'))
        self.assertIn('Ikeja', warning)
        self.assertIn('400,000.00 short', warning)
        self.assertIn('HQ', warning)                       # suggested source of cash

    def test_no_warning_when_the_branch_can_cover_everything(self):
        from treasury.tasks import collect_alerts
        set_balance(self.ik_bank.gl_account, '1000000')
        lines = [l for b in collect_alerts(timezone.localdate()).values() for l in b['lines']]
        self.assertFalse([l for l in lines if l.startswith('SHORTFALL WARNING')])


class ReceivablesAccuracyTests(CollectionRateTests):
    """Review fixes: loan balance is the ceiling, loan branch wins, overpayments don't offset, petty cash excluded."""

    def test_schedule_showing_more_than_the_loan_owes_is_scaled_down(self):
        from treasury.services.forecast import loan_receivables
        self.loan.outstanding_principal = D('500')
        self.loan.save()
        self._row(-5, '600', '0')     # future instalment
        self._row(10, '400', '0')     # overdue instalment; schedule says 1,000 unpaid, loan owes 500
        arrears, future, excess, scaled = loan_receivables(self.env['ikeja'], self.today, self.today + timedelta(days=45))
        self.assertEqual(excess, D('500.00'))
        self.assertEqual(scaled, 1)
        self.assertEqual(arrears, D('200.00'))                                # 400 x 0.5
        self.assertEqual(future[self.today + timedelta(days=5)], D('300'))    # 600 x 0.5

    def test_settled_loan_with_stale_unpaid_rows_brings_in_nothing(self):
        from treasury.services.forecast import loan_receivables
        self.loan.outstanding_principal = D('0')
        self.loan.save()
        self._row(-5, '600', '0')
        arrears, future, _, _ = loan_receivables(self.env['ikeja'], self.today, self.today + timedelta(days=45))
        self.assertEqual((arrears, sum(future.values(), D('0'))), (D('0.00'), D('0')))

    def test_rows_count_under_the_loans_branch_even_if_the_row_says_otherwise(self):
        from treasury.services.forecast import loan_receivables
        row = self._row(-3, '100', '0')
        type(row).objects.filter(pk=row.pk).update(branch=self.env['hq'])   # stale/odd row branch
        _, future, _, _ = loan_receivables(self.env['ikeja'], self.today, self.today + timedelta(days=45))
        self.assertEqual(future[self.today + timedelta(days=3)], D('100'))
        _, hq_future, _, _ = loan_receivables(self.env['hq'], self.today, self.today + timedelta(days=45))
        self.assertEqual(sum(hq_future.values(), D('0')), D('0'))

    def test_an_overpaid_instalment_does_not_hide_another_due_the_same_day(self):
        from treasury.services.forecast import loan_receivables
        self._row(-4, '100', '300')   # overpaid
        self._row(-4, '100', '0')     # same day, unpaid
        _, future, _, _ = loan_receivables(self.env['ikeja'], self.today, self.today + timedelta(days=45))
        self.assertEqual(future[self.today + timedelta(days=4)], D('100'))

    def test_petty_cash_fund_and_unlinked_cash_accounts_are_listed_but_not_counted(self):
        from accounts.models import Account
        from cash_management.models import PettyCashFund
        from treasury.services.forecast import cash_breakdown
        from treasury.tests.helpers import set_balance
        bank = make_bank_account(self.env, self.env['ikeja'], "9301")
        set_balance(bank.gl_account, '1000')
        parent = bank.gl_account.parent
        petty = Account.objects.create(name="Petty Cash", code=str(int(parent.code) + 50), account_type=Account.ASSET,
                                       account_level=Account.LEVEL_CHILD, parent=parent, owner=self.env['owner'],
                                       created_by=self.env['owner'], branch=self.env['ikeja'])
        set_balance(petty, '70')
        PettyCashFund.objects.create(fund_name="Ikeja petty", fund_code="PC-IK", custodian=self.env['owner'],
                                     petty_cash_account=petty, float_amount=D('100'), replenishment_threshold=D('20'),
                                     single_transaction_limit=D('50'),
                                     owner=self.env['owner'], branch=self.env['ikeja'], tenant=self.env['tenant'])
        total, counted, excluded = cash_breakdown(self.env['ikeja'])
        self.assertEqual(total, D('1000'))
        self.assertIn(bank.gl_account_id, [r['account_id'] for r in counted])
        self.assertNotIn(petty.pk, [r['account_id'] for r in counted])
        self.assertEqual(excluded[0]['reason'], 'Petty cash fund')
        self.assertEqual(excluded[0]['balance'], D('70'))
