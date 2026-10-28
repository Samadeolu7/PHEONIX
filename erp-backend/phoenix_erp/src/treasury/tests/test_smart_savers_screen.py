"""Backend for the Smart Savings enrol/manage screen."""
from datetime import timedelta
from decimal import Decimal

from rest_framework.test import APIClient

from savings.models import SavingsWithdrawalRequest, SmartSavingsAccount
from savings.services import initiate_withdrawal
from treasury.tests.test_withdrawal_notice import WithdrawalNoticeTests

D = Decimal


class SmartSaversScreenTests(WithdrawalNoticeTests):
    def setUp(self):
        super().setUp()
        self.api = APIClient()
        self.api.force_authenticate(user=self.owner)

    # inherited test_* methods would re-run here; the screen only needs the shared setUp
    for _name in [n for n in dir(WithdrawalNoticeTests) if n.startswith('test_')]:
        locals()[_name] = None
    del _name

    def _list(self, **params):
        r = self.api.get('/api/savings/accounts/smart-savers/', params)
        self.assertEqual(r.status_code, 200, r.content)
        return r.data

    def test_lists_only_enrolled_accounts_with_cycle_facts(self):
        enrolled = self._account(smart=True)       # cycle started 80 days ago
        self._account(smart=False)                  # regular saver: must not appear
        data = self._list()
        self.assertEqual(data['cycle_months'], 3)
        self.assertEqual(Decimal(str(data['interest_rate_pct'])), D('6'))
        self.assertEqual([r['account_number'] for r in data['results']], [enrolled.account_number])
        row = data['results'][0]
        self.assertTrue(row['is_active'])
        self.assertFalse(row['matured'])
        self.assertEqual(Decimal(row['expected_interest']), D('30000.00'))   # 6% of 500,000
        self.assertIsNone(row['penalty_rate'])      # product has no cycle config in this fixture

    def test_matured_filter_and_open_withdrawal_summary(self):
        acct = self._account(smart=True)
        SmartSavingsAccount.objects.filter(savings=acct).update(start_date=self.today - timedelta(days=120))
        wr = initiate_withdrawal(acct, D('100000'), self.owner)
        data = self._list(cycle_state='matured')
        self.assertEqual(len(data['results']), 1)
        row = data['results'][0]
        self.assertTrue(row['matured'])
        self.assertEqual(row['open_withdrawals'], 1)
        self.assertEqual(Decimal(row['open_withdrawal_amount']), D('100000'))
        self.assertEqual(str(row['earliest_payout_due']), str(wr.payout_due_date))
        self.assertEqual(self._list(cycle_state='inactive')['results'], [])

    def test_enrol_then_cannot_enrol_again_then_deactivate_and_reactivate(self):
        acct = self._account(smart=False)
        url = f'/api/savings/accounts/{acct.pk}/toggle-smart-savings/'
        r = self.api.post(url, {'action': 'activate'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        smart = SmartSavingsAccount.objects.get(savings=acct)
        self.assertEqual(smart.start_date, self.today)
        self.assertEqual(smart.opening_balance, D('500000.00'))

        # A second "activate" must not silently restart the cycle.
        SmartSavingsAccount.objects.filter(pk=smart.pk).update(start_date=self.today - timedelta(days=30))
        r = self.api.post(url, {'action': 'activate'}, format='json')
        self.assertEqual(r.status_code, 400)
        smart.refresh_from_db()
        self.assertEqual(smart.start_date, self.today - timedelta(days=30))

        self.assertEqual(self.api.post(url, {'action': 'deactivate'}, format='json').status_code, 200)
        self.assertEqual(self._list(cycle_state='active')['results'], [])
        self.assertEqual(len(self._list(cycle_state='inactive')['results']), 1)
        # Re-enrolling after deactivation starts a fresh cycle.
        self.assertEqual(self.api.post(url, {'action': 'activate'}, format='json').status_code, 200)
        smart.refresh_from_db()
        self.assertTrue(smart.is_active)
        self.assertEqual(smart.start_date, self.today)

    def test_closed_account_cannot_be_enrolled(self):
        acct = self._account(smart=False)
        type(acct).objects.filter(pk=acct.pk).update(status='closed')
        r = self.api.post(f'/api/savings/accounts/{acct.pk}/toggle-smart-savings/', {'action': 'activate'},
                          format='json')
        self.assertEqual(r.status_code, 400)
