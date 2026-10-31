"""
Tests for RecoveryTargetsView — the monthly per-officer recovery target
tracker that replaces officers hand-typing "Target / Recovered Today /
Cumulative / Outstanding Balance" into a discussion thread.
"""
import datetime
from decimal import Decimal
from unittest import mock

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import Account
from analytics.models import OfficerRecoveryTarget
from clients.models import Client
from hr.models import Staff
from loans.models import LoanAccount, LoanProduct, LoanRepaymentAllocation
from permissions.services import EffectivePermission
from products.models import Product
from transactions.models import Transaction, TransactionSeries
from users.models import User

from analytics.tests import _make_env, _make_account

D = Decimal
URL = '/api/analytics/recovery-targets/'


class RecoveryTargetsViewTestCase(TestCase):
    def setUp(self):
        self.owner, self.tenant, self.branch = _make_env('rectgtadmin')
        self.api = APIClient()
        self.api.force_authenticate(user=self.owner)
        self.today = timezone.localdate()
        self.month = self.today.replace(day=1)

        loan_parent = _make_account(self.owner, self.branch, 'Loans Receivable', '1300', Account.LOAN)
        cash = _make_account(self.owner, self.branch, 'Bank', '1001', Account.ASSET)
        gl_product = Product.objects.create(
            name='Daily Loan', code='LOAN-DY', product_type='LOAN', owner=self.owner, branch=self.branch)
        self.product = LoanProduct.objects.create(
            product=gl_product, parent_account=loan_parent, disbursement_account=cash,
            default_interest_rate=D('10.00'), interest_calculation_method='flat',
            min_loan_amount=D('1000.00'), max_loan_amount=D('5000000.00'),
            owner=self.owner, branch=self.branch,
        )
        self.loan_parent = loan_parent

        self.dominion = self._staff('Dominion', 'Akinfenwa')
        self.funmi = self._staff('Funmilola', 'Ogunwole')
        self.loan_d = self._loan(self._client('C1', self.dominion), 'LN-R1')
        self.loan_f = self._loan(self._client('C2', self.funmi), 'LN-R2')
        self.loan_u = self._loan(self._client('C3', None), 'LN-R3')
        self.series, _ = TransactionSeries.objects.get_or_create(
            code='LNPMT', defaults={'description': 'Loan payment'})

    # ── helpers ──────────────────────────────────────────────────────────────
    def _staff(self, first, last):
        return Staff.objects.create(
            first_name=first, last_name=last, position='Credit Officer',
            owner=self.owner, branch=self.branch, tenant=self.tenant, created_by=self.owner)

    def _client(self, cid, officer):
        return Client.objects.create(
            client_id=cid, first_name='Client', last_name=cid, gender='male',
            phone_primary=f'0801000{cid[-1]}000', assigned_officer=officer,
            tenant=self.tenant, owner=self.owner, branch=self.branch)

    def _loan(self, client, number):
        seq = LoanAccount.objects.count() + 1
        account = Account.objects.create(
            name=f'{number} Loan Account', code=f'16{seq:04d}', account_type=Account.LOAN,
            account_level=Account.LEVEL_CHILD, parent=self.loan_parent,
            owner=self.owner, created_by=self.owner, branch=self.branch)
        return LoanAccount.objects.create(
            client=client, product=self.product, account=account, loan_number=number,
            requested_amount=D('100000'), outstanding_principal=D('100000'), interest_rate=D('10'),
            term_months=3, repayment_frequency='daily', status='active',
            disbursement_date=self.month, disbursed_amount=D('100000'),
            owner=self.owner, branch=self.branch)

    def _pay(self, loan, date, principal, interest='0', penalty='0', reversed_=False):
        txn = Transaction.objects.create(
            series=self.series, date=date, description=f'payment {loan.loan_number}',
            branch=self.branch, owner=self.owner, tenant=self.tenant)
        if reversed_:
            Transaction.objects.filter(pk=txn.pk).update(is_reversed=True)
        LoanRepaymentAllocation.objects.create(
            loan=loan, journal_entry=txn, principal_applied=D(principal),
            interest_applied=D(interest), penalty_applied=D(penalty),
            tenant=self.tenant, owner=self.owner)

    def _target(self, staff, amount, month=None):
        return OfficerRecoveryTarget.objects.create(
            staff=staff, month=month or self.month, target_amount=D(amount),
            tenant=self.tenant, branch=self.branch, owner=self.owner)

    def _row(self, data, staff):
        return next(r for r in data['officers'] if r['staff_id'] == staff.pk)

    # ── GET ──────────────────────────────────────────────────────────────────
    def test_computes_today_cumulative_and_balance_from_repayments(self):
        self._target(self.dominion, '1200000')
        self._pay(self.loan_d, self.month, '40000', interest='10000')
        self._pay(self.loan_d, self.today, '20000', penalty='6707.69')

        res = self.api.get(URL)
        self.assertEqual(res.status_code, 200)
        row = self._row(res.data, self.dominion)
        self.assertEqual(D(row['target']), D('1200000'))
        self.assertEqual(D(row['recovered_mtd']), D('76707.69'))
        self.assertEqual(D(row['balance']), D('1123292.31'))
        expected_today = D('26707.69') if self.today != self.month else D('76707.69')
        self.assertEqual(D(row['recovered_today']), expected_today)

    def test_reversed_payments_and_other_months_are_excluded(self):
        self._target(self.dominion, '100000')
        self._pay(self.loan_d, self.today, '5000')
        self._pay(self.loan_d, self.today, '9000', reversed_=True)
        self._pay(self.loan_d, self.month - datetime.timedelta(days=1), '7000')  # last month

        row = self._row(self.api.get(URL).data, self.dominion)
        self.assertEqual(D(row['recovered_mtd']), D('5000'))

    def test_officer_without_target_still_listed_and_unassigned_reported(self):
        self._pay(self.loan_f, self.today, '3000')
        self._pay(self.loan_u, self.today, '1500')

        data = self.api.get(URL).data
        row = self._row(data, self.funmi)
        self.assertEqual(row['status'], 'no_target')
        self.assertIsNone(row['balance'])
        self.assertEqual(D(row['recovered_mtd']), D('3000'))
        self.assertEqual(D(data['totals']['unassigned_recovered_mtd']), D('1500'))
        self.assertTrue(data['can_set_targets'])

    def test_pace_status_against_elapsed_share_of_month(self):
        # A past month is fully elapsed, so anything below target is "behind".
        last_month = (self.month - datetime.timedelta(days=1)).replace(day=1)
        self._target(self.dominion, '1000', month=last_month)
        self._target(self.funmi, '1000', month=last_month)
        self._pay(self.loan_d, last_month, '1000')
        self._pay(self.loan_f, last_month, '500')

        data = self.api.get(URL, {'month': f'{last_month:%Y-%m}'}).data
        self.assertEqual(data['pct_month_elapsed'], '100.0')
        self.assertEqual(self._row(data, self.dominion)['status'], 'achieved')
        self.assertEqual(self._row(data, self.funmi)['status'], 'behind')
        self.assertEqual(self._row(data, self.funmi)['pct_achieved'], '50.0')

    def test_previous_month_target_is_offered_for_copying(self):
        last_month = (self.month - datetime.timedelta(days=1)).replace(day=1)
        self._target(self.dominion, '1200000', month=last_month)
        row = self._row(self.api.get(URL).data, self.dominion)
        self.assertIsNone(row['target'])
        self.assertEqual(D(row['previous_target']), D('1200000'))

    def test_csv_export(self):
        self._target(self.dominion, '1200000')
        res = self.api.get(URL, {'format': 'csv'})
        self.assertEqual(res.status_code, 200)
        self.assertIn('Dominion Akinfenwa', res.content.decode())

    # ── Officer scope ────────────────────────────────────────────────────────
    def _officer_api(self, staff, can_edit=False):
        user = User.objects.create_user(username=f'off{staff.pk}', password='pass')
        user.tenant, user.branch = self.tenant, self.branch
        user.save()
        Staff.objects.filter(user=user).exclude(pk=staff.pk).delete()
        staff.user = user
        staff.save()
        api = APIClient()
        api.force_authenticate(user=user)
        perm = EffectivePermission(can_view=True, can_edit=can_edit, scope='assigned_clients')
        return api, mock.patch('permissions.services.PermissionResolver.resolve', return_value=perm)

    def test_officer_sees_only_own_row_and_cannot_set_targets(self):
        self._target(self.dominion, '1200000')
        self._target(self.funmi, '800000')
        self._pay(self.loan_f, self.today, '3000')
        api, patcher = self._officer_api(self.dominion, can_edit=True)
        with patcher:
            data = api.get(URL).data
            post = api.post(URL, {'month': f'{self.month:%Y-%m}',
                                  'targets': [{'staff_id': self.dominion.pk, 'target_amount': '1'}]},
                            format='json')
        self.assertEqual([r['staff_id'] for r in data['officers']], [self.dominion.pk])
        self.assertFalse(data['can_set_targets'])
        self.assertIsNone(data['totals']['unassigned_recovered_mtd'])
        self.assertEqual(post.status_code, 403)

    # ── POST ─────────────────────────────────────────────────────────────────
    def test_manager_sets_updates_and_removes_targets(self):
        month = f'{self.month:%Y-%m}'
        res = self.api.post(URL, {'month': month, 'targets': [
            {'staff_id': self.dominion.pk, 'target_amount': '1,200,000'},
            {'staff_id': self.funmi.pk, 'target_amount': '800000'},
        ]}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['saved'], 2)

        self.api.post(URL, {'month': month, 'targets': [
            {'staff_id': self.dominion.pk, 'target_amount': '1300000'},
            {'staff_id': self.funmi.pk, 'target_amount': ''},
        ]}, format='json')
        targets = {t.staff_id: t.target_amount for t in OfficerRecoveryTarget.all_objects.all()}
        self.assertEqual(targets, {self.dominion.pk: D('1300000.00')})

    def test_rejects_negative_or_unknown_officer(self):
        month = f'{self.month:%Y-%m}'
        res = self.api.post(URL, {'month': month, 'targets': [
            {'staff_id': self.dominion.pk, 'target_amount': '-5'},
            {'staff_id': 999999, 'target_amount': '5'},
        ]}, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertEqual(len(res.data['errors']), 2)
        self.assertFalse(OfficerRecoveryTarget.all_objects.exists())
