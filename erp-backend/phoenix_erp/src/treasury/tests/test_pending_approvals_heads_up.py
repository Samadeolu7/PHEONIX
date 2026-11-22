from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import Account
from common.managers import set_current_tenant
from loans.models import LoanAccount
from treasury.services import gate
from treasury.tests.helpers import make_bank_account, make_env, make_pending_loan, set_balance

D = Decimal


class PendingApprovalsHeadsUpTests(TestCase):
    def setUp(self):
        self.env = make_env("headsup")
        self.ikeja = self.env['ikeja']
        self.bank = make_bank_account(self.env, self.ikeja, "3001")
        set_balance(self.bank.gl_account, '1000000')
        today = timezone.localdate()
        # Four applications, oldest first: 400k, 300k, 200k, 600k = 1.5m against 1m available.
        self.first = make_pending_loan(self.env, self.ikeja, amount='400000.00', loan_number='LN-H-1')
        self._set_applied(self.first, today - timedelta(days=4))
        self.others = [
            self._another(D('300000.00'), 'LN-H-2', today - timedelta(days=3)),
            self._another(D('200000.00'), 'LN-H-3', today - timedelta(days=2)),
            self._another(D('600000.00'), 'LN-H-4', today - timedelta(days=1)),
        ]

    def tearDown(self):
        set_current_tenant(None)

    @staticmethod
    def _set_applied(loan, day):
        LoanAccount.all_objects.filter(pk=loan.pk).update(application_date=day)

    def _another(self, amount, number, applied):
        base = self.first
        acct = Account.objects.create(
            name=f"{number} Loan Account", code=f"1300{number[-1]}9", account_type=Account.LOAN,
            account_level=Account.LEVEL_CHILD, parent=base.account.parent, owner=self.env['owner'],
            created_by=self.env['owner'], branch=self.ikeja)
        loan = LoanAccount.objects.create(
            client=base.client, product=base.product, account=acct, loan_number=number,
            requested_amount=amount, interest_rate=D('10.00'), term_months=2, repayment_frequency='monthly',
            status='pending', owner=self.env['maker'], created_by=self.env['maker'], branch=self.ikeja)
        self._set_applied(loan, applied)
        return loan

    def test_flags_when_pending_total_exceeds_available(self):
        h = gate.pending_approvals_heads_up(self.ikeja)
        self.assertTrue(h['over_capacity'])
        self.assertEqual(h['pending_count'], 4)
        self.assertEqual(h['pending_total'], D('1500000.00'))
        self.assertEqual(h['available_today'], D('1000000'))
        self.assertEqual(h['shortfall'], D('500000.00'))
        self.assertIn('decide which to approve first', h['message'])
        self.assertEqual([r['loan_number'] for r in h['loans']], ['LN-H-1', 'LN-H-2', 'LN-H-3', 'LN-H-4'])
        # Each fits on its own, but the fourth no longer fits once the older three are approved.
        self.assertTrue(all(r['fits_alone'] for r in h['loans']))
        self.assertEqual([r['fits_in_order'] for r in h['loans']], [True, True, True, False])
        self.assertEqual(h['loans'][0]['days_waiting'], 4)

    def test_no_heads_up_when_everything_fits(self):
        set_balance(self.bank.gl_account, '2000000')
        h = gate.pending_approvals_heads_up(self.ikeja)
        self.assertFalse(h['over_capacity'])
        self.assertEqual(h['message'], '')
        self.assertEqual(h['shortfall'], D('0.00'))

    def test_approved_loans_already_reduce_what_is_left(self):
        # Approving the oldest moves it out of "pending" and into committed outflows.
        LoanAccount.all_objects.filter(pk=self.first.pk).update(status='approved', approved_amount=D('500000.00'))
        h = gate.pending_approvals_heads_up(self.ikeja)
        self.assertEqual(h['pending_count'], 3)
        self.assertEqual(h['pending_total'], D('1100000.00'))
        self.assertEqual(h['available_today'], D('500000'))
        self.assertTrue(h['over_capacity'])
        self.assertEqual([r['fits_alone'] for r in h['loans']], [True, True, False])
        self.assertIn('1 of them cannot be funded today even on its own', h['message'])

    def test_endpoint_scopes_non_director_to_own_branch(self):
        client = APIClient()
        client.force_authenticate(self.env['maker'])
        r = client.get('/api/treasury/liquidity-check/pending-approvals/')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertFalse(r.data['is_director'])
        self.assertEqual(len(r.data['branches']), 1)
        self.assertTrue(r.data['branches'][0]['over_capacity'])
        r = client.get(f"/api/treasury/liquidity-check/pending-approvals/?branch={self.env['hq'].pk}")
        self.assertEqual(r.status_code, 403)

    def test_endpoint_lists_branches_with_pending_loans_for_director(self):
        client = APIClient()
        client.force_authenticate(self.env['owner'])
        r = client.get('/api/treasury/liquidity-check/pending-approvals/')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertTrue(r.data['is_director'])
        self.assertEqual([b['branch_name'] for b in r.data['branches']], ['Ikeja'])
