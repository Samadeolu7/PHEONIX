"""
Pending Bank Repayments page (banks/views.py::PendingRepaymentsView and
friends): unresolved bank_only CREDIT exceptions are visible to every
member of the branch, claimable once, and scoped to the user's branch.
"""
import uuid
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import Account
from branches.models import Branch
from banks.models import (
    Bank,
    BankAccount,
    DailyReconciliation,
    ReconciliationException,
)
from users.models import Tenant

User = get_user_model()

LIST_URL = '/api/banks/pending-repayments/'
SUMMARY_URL = '/api/banks/pending-repayments/summary/'


def claim_url(pk):
    return f'/api/banks/pending-repayments/{pk}/claim/'


class PendingRepaymentsTests(TestCase):

    def setUp(self):
        self.client = APIClient()
        self.tenant = Tenant.objects.create(name='Pending Org', slug='pending-org')
        self.branch_a = Branch.objects.create(name='Branch A', code='PRA')
        self.branch_b = Branch.objects.create(name='Branch B', code='PRB')

        self.officer_1 = User.objects.create_user(
            username='officer1', password='x', tenant=self.tenant, branch=self.branch_a,
        )
        self.officer_2 = User.objects.create_user(
            username='officer2', password='x', tenant=self.tenant, branch=self.branch_a,
        )
        self.other_branch_officer = User.objects.create_user(
            username='officer_b', password='x', tenant=self.tenant, branch=self.branch_b,
        )

        gl = Account.objects.create(code='1298', name='Pending GL', account_level=Account.LEVEL_PARENT)
        bank = Bank.objects.create(bank_name='Pending Bank', bank_code='997')
        self.bank_account = BankAccount.objects.create(
            bank=bank, account_number='0000003', account_name='Branch A Collections',
            gl_account=gl, account_manager=self.officer_1,
        )
        self.recon = DailyReconciliation.objects.create(
            bank_account=self.bank_account, reconciliation_date='2026-11-02',
            uploaded_by=self.officer_1, statement_file='bank_statements/p.csv',
            status='completed', owner=self.officer_1, branch=self.branch_a, tenant=self.tenant,
        )

        def exc(**kw):
            defaults = dict(
                reconciliation=self.recon, exception_type='bank_only', direction='CREDIT',
                bank_transaction_id=uuid.uuid4(), bank_amount=Decimal('5000.00'),
                bank_narration='TRF FROM ADEBAYO', bank_date='2026-11-02',
            )
            defaults.update(kw)
            return ReconciliationException.objects.create(**defaults)

        self.pending = exc()
        self.erp_pending = exc(
            exception_type='erp_only', bank_transaction_id=None, loan_payment_id=1,
            bank_amount=None, bank_narration='', bank_date=None,
            erp_amount=Decimal('2000.00'), erp_narration='Repayment LN-1', erp_date='2026-11-01',
            officer=self.officer_1,
        )
        # None of these belong on the page:
        exc(direction='DEBIT', bank_narration='SMS CHARGE')
        exc(resolved=True)

    def test_branch_member_sees_only_pending_credits(self):
        self.client.force_authenticate(self.officer_2)
        resp = self.client.get(LIST_URL)
        self.assertEqual(resp.status_code, 200)
        ids = {r['id'] for r in resp.data['results']}
        self.assertEqual(ids, {self.pending.id, self.erp_pending.id})
        totals = resp.data['totals']
        self.assertEqual(totals['count'], 2)
        self.assertEqual(totals['amount'], '7000.00')
        self.assertEqual(totals['bank_only']['amount'], '5000.00')
        self.assertEqual(totals['erp_only']['amount'], '2000.00')

    def test_other_branch_cannot_see_it(self):
        self.client.force_authenticate(self.other_branch_officer)
        resp = self.client.get(LIST_URL)
        self.assertEqual(resp.data['results'], [])
        self.assertEqual(self.client.post(claim_url(self.pending.id)).status_code, 404)

    def test_summary_counts(self):
        self.client.force_authenticate(self.officer_1)
        resp = self.client.get(SUMMARY_URL)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['count'], 2)
        self.assertEqual(resp.data['bank_only']['count'], 1)
        self.assertEqual(resp.data['erp_only']['count'], 1)
        self.assertEqual(resp.data['erp_only']['recorded_by_me_count'], 1)

    def test_claim_blocks_second_officer(self):
        self.client.force_authenticate(self.officer_1)
        resp = self.client.post(claim_url(self.pending.id), {'note': 'My client'}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data['claimed_by_me'])

        self.client.force_authenticate(self.officer_2)
        self.assertEqual(self.client.post(claim_url(self.pending.id)).status_code, 409)
        # ...and can't release someone else's claim
        self.assertEqual(self.client.delete(claim_url(self.pending.id)).status_code, 403)

        summary = self.client.get(SUMMARY_URL).data
        self.assertEqual(summary['bank_only']['unclaimed_count'], 0)

    def test_claimer_can_release(self):
        self.client.force_authenticate(self.officer_1)
        self.client.post(claim_url(self.pending.id))
        resp = self.client.delete(claim_url(self.pending.id))
        self.assertEqual(resp.status_code, 200)
        self.pending.refresh_from_db()
        self.assertIsNone(self.pending.claimed_by_id)

    def test_duplicate_bank_line_listed_once(self):
        recon_2 = DailyReconciliation.objects.create(
            bank_account=self.bank_account, reconciliation_date='2026-11-03',
            uploaded_by=self.officer_1, statement_file='bank_statements/q.csv',
            status='completed', owner=self.officer_1, branch=self.branch_a, tenant=self.tenant,
        )
        ReconciliationException.objects.create(
            reconciliation=recon_2, exception_type='bank_only', direction='CREDIT',
            bank_transaction_id=self.pending.bank_transaction_id, bank_amount=Decimal('5000.00'),
            bank_date='2026-11-02',
        )
        self.client.force_authenticate(self.officer_1)
        self.assertEqual(self.client.get(LIST_URL).data['totals']['bank_only']['count'], 1)

    def test_erp_only_kind_filter_and_recorder(self):
        self.client.force_authenticate(self.officer_1)
        resp = self.client.get(LIST_URL, {'kind': 'erp_only'})
        rows = resp.data['results']
        self.assertEqual([r['id'] for r in rows], [self.erp_pending.id])
        self.assertTrue(rows[0]['recorded_by_me'])
        self.assertEqual(rows[0]['amount'], '2000.00')
        # The recorder sees it under "mine" even before claiming it
        mine = self.client.get(LIST_URL, {'status': 'mine'}).data['results']
        self.assertEqual([r['id'] for r in mine], [self.erp_pending.id])

    # ── Director branch-to-branch view ──────────────────────────────────────

    def _make_branch_b_line(self):
        account_b = BankAccount.objects.create(
            bank=self.bank_account.bank, account_number='0000004', account_name='Branch B Collections',
            gl_account=Account.objects.create(code='1297', name='Pending GL B', account_level=Account.LEVEL_PARENT),
            account_manager=self.other_branch_officer,
        )
        recon_b = DailyReconciliation.objects.create(
            bank_account=account_b, reconciliation_date='2026-11-02',
            uploaded_by=self.other_branch_officer, statement_file='bank_statements/b.csv',
            status='completed', owner=self.other_branch_officer, branch=self.branch_b, tenant=self.tenant,
        )
        return ReconciliationException.objects.create(
            reconciliation=recon_b, exception_type='bank_only', direction='CREDIT',
            bank_transaction_id=uuid.uuid4(), bank_amount=Decimal('900.00'), bank_date='2026-11-02',
        )

    def test_director_sees_all_branches_and_can_pick_one(self):
        line_b = self._make_branch_b_line()
        director = User.objects.create_user(
            username='director_p', password='x', tenant=self.tenant, branch=self.branch_a, is_superuser=True,
        )
        self.tenant.owner = director
        self.tenant.save(update_fields=['owner'])
        self.client.force_authenticate(director)

        everything = self.client.get(LIST_URL).data
        self.assertEqual(everything['totals']['count'], 3)
        self.assertEqual({b['branch_id'] for b in everything['totals']['by_branch']},
                         {self.branch_a.id, self.branch_b.id})

        only_b = self.client.get(LIST_URL, {'branch': self.branch_b.id}).data
        self.assertEqual([r['id'] for r in only_b['results']], [line_b.id])
        self.assertEqual(only_b['totals']['count'], 1)

    def test_branch_filter_cannot_widen_a_members_scope(self):
        self._make_branch_b_line()
        self.client.force_authenticate(self.officer_1)
        resp = self.client.get(LIST_URL, {'branch': self.branch_b.id}).data
        self.assertEqual(resp['results'], [])
        self.assertEqual([b['branch_id'] for b in resp['totals']['by_branch']], [self.branch_a.id])
