"""
Tests for the reconciliation views' permission and branch-scoping behavior:
- Only a director may resolve a reconciliation exception (branch managers/
  credit officers are exactly who this control exists to check).
- DailyReconciliation.objects.for_user() correctly gives a director
  cross-branch visibility while keeping a branch manager scoped to their
  own branch.
- The manual rerun endpoint triggers matching and respects the
  already-processing guard.

can_user_approve()'s primary path is PermissionResolver-driven (policy
rows, seeded separately per tenant — see set_bank_recon_resolve_policy.py),
but it short-circuits to True for is_superuser before ever consulting
policy rows, and User.is_owner() (tenant owner) unlocks
DailyReconciliation.objects.for_user()'s cross-branch bypass the same way
a real director's global-scope Role would. Both are used here to exercise
the "director" path without needing to seed the full permissions catalog
in every test.
"""
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import Account
from branches.models import Branch
from banks.models import (
    Bank,
    BankAccount,
    DailyReconciliation,
    ReconciliationBankTransaction,
    ReconciliationException,
)
from users.models import Tenant

User = get_user_model()


class ReconciliationViewTests(TestCase):

    def setUp(self):
        self.client = APIClient()
        self.tenant = Tenant.objects.create(name='Recon Test Org', slug='recon-test-org')
        self.branch_a = Branch.objects.create(name='Branch A', code='BRA')
        self.branch_b = Branch.objects.create(name='Branch B', code='BRB')

        self.director = User.objects.create_user(
            username='director', password='test123',
            tenant=self.tenant, branch=self.branch_a, is_superuser=True,
        )
        self.tenant.owner = self.director
        self.tenant.save(update_fields=['owner'])

        self.branch_manager = User.objects.create_user(
            username='bm', password='test123', tenant=self.tenant, branch=self.branch_a,
        )

        gl_account = Account.objects.create(
            code='1299', name='Recon Test GL', account_level=Account.LEVEL_PARENT
        )
        bank = Bank.objects.create(bank_name='Recon Test Bank', bank_code='998')
        self.bank_account = BankAccount.objects.create(
            bank=bank, account_number='0000002', account_name='Recon Test Account',
            gl_account=gl_account, account_manager=self.branch_manager,
        )

        self.recon_a = DailyReconciliation.objects.create(
            bank_account=self.bank_account, reconciliation_date='2026-07-01',
            uploaded_by=self.branch_manager, statement_file='bank_statements/a.csv',
            status='completed', owner=self.branch_manager, branch=self.branch_a,
            tenant=self.tenant,
        )
        self.recon_b = DailyReconciliation.objects.create(
            bank_account=self.bank_account, reconciliation_date='2026-07-02',
            uploaded_by=self.director, statement_file='bank_statements/b.csv',
            status='completed', owner=self.director, branch=self.branch_b,
            tenant=self.tenant,
        )
        self.exception = ReconciliationException.objects.create(
            reconciliation=self.recon_a, exception_type='bank_only', direction='CREDIT',
            bank_amount=Decimal('100.00'), bank_narration='Unexplained credit', bank_date='2026-07-01',
        )

    # ── Resolve permission gate ─────────────────────────────────────────────

    def test_branch_manager_cannot_resolve_exception(self):
        self.client.force_authenticate(user=self.branch_manager)
        url = f'/api/banks/reconciliations/{self.recon_a.id}/exceptions/{self.exception.id}/resolve/'
        resp = self.client.patch(url, {'resolution_notes': 'test'}, format='json')

        self.assertEqual(resp.status_code, 403)
        self.exception.refresh_from_db()
        self.assertFalse(self.exception.resolved)

    def test_director_can_resolve_exception(self):
        self.client.force_authenticate(user=self.director)
        url = f'/api/banks/reconciliations/{self.recon_a.id}/exceptions/{self.exception.id}/resolve/'
        resp = self.client.patch(url, {'resolution_notes': 'reviewed and confirmed legitimate'}, format='json')

        self.assertEqual(resp.status_code, 200)
        self.exception.refresh_from_db()
        self.assertTrue(self.exception.resolved)
        self.assertEqual(self.exception.resolved_by_id, self.director.id)

    # ── Tiered resolve: perfect match vs amount mismatch ────────────────────
    # bank_amount==erp_amount may be resolved by a branch manager (can_edit);
    # any mismatch — including bank_only/erp_only, which have no counterpart
    # amount at all — still requires a director (can_approve), and
    # resolution_notes becomes mandatory. See ReconciliationException.
    # is_perfect_match and ResolveExceptionView.patch (banks/views.py).

    def test_branch_manager_can_resolve_perfect_match_exception_with_edit_grant(self):
        perfect_match = ReconciliationException.objects.create(
            reconciliation=self.recon_a, exception_type='amount_diff', direction='CREDIT',
            bank_amount=Decimal('500.00'), bank_narration='Loan repayment', bank_date='2026-07-01',
            erp_amount=Decimal('500.00'), erp_narration='Loan repayment', erp_date='2026-07-01',
        )
        self.client.force_authenticate(user=self.branch_manager)
        url = f'/api/banks/reconciliations/{self.recon_a.id}/exceptions/{perfect_match.id}/resolve/'
        with patch('permissions.services.PermissionResolver.resolve') as mock_resolve:
            mock_resolve.return_value = SimpleNamespace(can_edit=True, can_approve=False)
            resp = self.client.patch(url, {}, format='json')

        self.assertEqual(resp.status_code, 200, resp.data)
        perfect_match.refresh_from_db()
        self.assertTrue(perfect_match.resolved)
        self.assertEqual(perfect_match.resolved_by_id, self.branch_manager.id)

    def test_branch_manager_with_edit_grant_still_cannot_resolve_amount_mismatch(self):
        mismatch = ReconciliationException.objects.create(
            reconciliation=self.recon_a, exception_type='amount_diff', direction='CREDIT',
            bank_amount=Decimal('500.00'), bank_narration='Loan repayment', bank_date='2026-07-01',
            erp_amount=Decimal('480.00'), erp_narration='Loan repayment', erp_date='2026-07-01',
        )
        self.client.force_authenticate(user=self.branch_manager)
        url = f'/api/banks/reconciliations/{self.recon_a.id}/exceptions/{mismatch.id}/resolve/'
        with patch('permissions.services.PermissionResolver.resolve') as mock_resolve:
            mock_resolve.return_value = SimpleNamespace(can_edit=True, can_approve=False)
            resp = self.client.patch(url, {'resolution_notes': 'looks fine'}, format='json')

        self.assertEqual(resp.status_code, 403)
        mismatch.refresh_from_db()
        self.assertFalse(mismatch.resolved)

    def test_branch_manager_with_edit_grant_still_cannot_resolve_bank_only_exception(self):
        # bank_only has no erp_amount at all, so it can never be a "perfect
        # match" — a can_edit grant must not accidentally cover this case.
        self.client.force_authenticate(user=self.branch_manager)
        url = f'/api/banks/reconciliations/{self.recon_a.id}/exceptions/{self.exception.id}/resolve/'
        with patch('permissions.services.PermissionResolver.resolve') as mock_resolve:
            mock_resolve.return_value = SimpleNamespace(can_edit=True, can_approve=False)
            resp = self.client.patch(url, {'resolution_notes': 'looks fine'}, format='json')

        self.assertEqual(resp.status_code, 403)
        self.exception.refresh_from_db()
        self.assertFalse(self.exception.resolved)

    def test_director_resolving_amount_mismatch_requires_notes(self):
        mismatch = ReconciliationException.objects.create(
            reconciliation=self.recon_a, exception_type='amount_diff', direction='CREDIT',
            bank_amount=Decimal('500.00'), bank_narration='Loan repayment', bank_date='2026-07-01',
            erp_amount=Decimal('480.00'), erp_narration='Loan repayment', erp_date='2026-07-01',
        )
        self.client.force_authenticate(user=self.director)
        url = f'/api/banks/reconciliations/{self.recon_a.id}/exceptions/{mismatch.id}/resolve/'
        resp = self.client.patch(url, {}, format='json')

        self.assertEqual(resp.status_code, 400)
        mismatch.refresh_from_db()
        self.assertFalse(mismatch.resolved)

    def test_director_can_resolve_amount_mismatch_with_notes(self):
        mismatch = ReconciliationException.objects.create(
            reconciliation=self.recon_a, exception_type='amount_diff', direction='CREDIT',
            bank_amount=Decimal('500.00'), bank_narration='Loan repayment', bank_date='2026-07-01',
            erp_amount=Decimal('480.00'), erp_narration='Loan repayment', erp_date='2026-07-01',
        )
        self.client.force_authenticate(user=self.director)
        url = f'/api/banks/reconciliations/{self.recon_a.id}/exceptions/{mismatch.id}/resolve/'
        resp = self.client.patch(
            url, {'resolution_notes': 'bank fee accounts for the ₦20 difference'}, format='json'
        )

        self.assertEqual(resp.status_code, 200, resp.data)
        mismatch.refresh_from_db()
        self.assertTrue(mismatch.resolved)

    def test_director_can_resolve_perfect_match_without_notes(self):
        perfect_match = ReconciliationException.objects.create(
            reconciliation=self.recon_a, exception_type='amount_diff', direction='CREDIT',
            bank_amount=Decimal('500.00'), bank_narration='Loan repayment', bank_date='2026-07-01',
            erp_amount=Decimal('500.00'), erp_narration='Loan repayment', erp_date='2026-07-01',
        )
        self.client.force_authenticate(user=self.director)
        url = f'/api/banks/reconciliations/{self.recon_a.id}/exceptions/{perfect_match.id}/resolve/'
        resp = self.client.patch(url, {}, format='json')

        self.assertEqual(resp.status_code, 200, resp.data)
        perfect_match.refresh_from_db()
        self.assertTrue(perfect_match.resolved)

    # ── Branch-scoped visibility ─────────────────────────────────────────────

    def test_branch_manager_cannot_see_other_branch_reconciliation(self):
        self.client.force_authenticate(user=self.branch_manager)
        resp = self.client.get(f'/api/banks/reconciliations/{self.recon_b.id}/')
        self.assertEqual(resp.status_code, 404)

    def test_director_sees_other_branch_reconciliation(self):
        self.client.force_authenticate(user=self.director)
        resp = self.client.get(f'/api/banks/reconciliations/{self.recon_b.id}/')
        self.assertEqual(resp.status_code, 200)

    def test_branch_manager_list_excludes_other_branch(self):
        self.client.force_authenticate(user=self.branch_manager)
        resp = self.client.get('/api/banks/reconciliations/')
        self.assertEqual(resp.status_code, 200)
        ids = {row['id'] for row in resp.data}
        self.assertIn(self.recon_a.id, ids)
        self.assertNotIn(self.recon_b.id, ids)

    def test_director_list_includes_all_branches(self):
        self.client.force_authenticate(user=self.director)
        resp = self.client.get('/api/banks/reconciliations/')
        self.assertEqual(resp.status_code, 200)
        ids = {row['id'] for row in resp.data}
        self.assertIn(self.recon_a.id, ids)
        self.assertIn(self.recon_b.id, ids)

    # ── Manual rerun endpoint ────────────────────────────────────────────────

    @patch('banks.views.run_reconciliation_match')
    def test_rerun_endpoint_triggers_task_and_increments_count(self, mock_task):
        self.client.force_authenticate(user=self.branch_manager)
        resp = self.client.post(f'/api/banks/reconciliations/{self.recon_a.id}/rerun/', {}, format='json')

        self.assertEqual(resp.status_code, 202)
        mock_task.delay.assert_called_once_with(self.recon_a.id, False)
        self.recon_a.refresh_from_db()
        self.assertEqual(self.recon_a.rerun_count, 1)
        self.assertEqual(self.recon_a.status, 'processing')

    @patch('banks.views.run_reconciliation_match')
    def test_rerun_endpoint_conflicts_when_already_processing(self, mock_task):
        self.recon_a.status = 'processing'
        self.recon_a.save(update_fields=['status'])

        self.client.force_authenticate(user=self.branch_manager)
        resp = self.client.post(f'/api/banks/reconciliations/{self.recon_a.id}/rerun/', {}, format='json')

        self.assertEqual(resp.status_code, 409)
        mock_task.delay.assert_not_called()

    # ── Tenant on create (regression) ───────────────────────────────────────
    # DailyReconciliation.tenant only auto-fills from a thread-local set by
    # middleware, which isn't reliably populated in time for a DRF-
    # authenticated request. A row created without tenant= explicitly set
    # stays tenant=NULL forever and becomes invisible to the list/detail
    # views (both go through the tenant-scoped manager) even though it was
    # reconciled successfully — this is exactly what StatementUploadView.post()
    # must never do again.
    @patch('banks.views.run_reconciliation_match')
    def test_uploaded_reconciliation_has_tenant_set_and_is_listable(self, mock_task):
        # A date distinct from self.recon_a/self.recon_b's dates (2026-07-01,
        # 2026-07-02) so this exercises the "brand new reconciliation"
        # branch, not the re-run branch (already covered separately).
        csv_content = (
            b"Transaction Date,Narration,Reference,Debit,Credit,Balance\r\n"
            b"05/07/2026,Loan repayment LN-900,REF900,,5000.00,15000.00\r\n"
        )
        upload = SimpleUploadedFile('statement.csv', csv_content, content_type='text/csv')

        self.client.force_authenticate(user=self.branch_manager)
        resp = self.client.post(
            '/api/banks/reconciliations/upload/',
            {'bank_account_id': self.bank_account.id, 'statement_file': upload},
            format='multipart',
        )

        self.assertEqual(resp.status_code, 202, resp.data)
        new_id = resp.data['reconciliations'][0]['id']

        recon = DailyReconciliation.objects.get(pk=new_id)
        self.assertEqual(recon.tenant_id, self.tenant.id)

        # And it must actually show up in the list endpoint for the user
        # who just created it — the entire point of this regression test.
        list_resp = self.client.get('/api/banks/reconciliations/')
        self.assertEqual(list_resp.status_code, 200)
        self.assertIn(new_id, {row['id'] for row in list_resp.data})


class OfficerReconciliationRiskReportTests(TestCase):
    """
    GET /api/banks/reports/officer-reconciliation-risk/ — aggregates
    accountability signals per officer across BOTH matched transactions
    (posting lag / reference compliance captured at match time — see
    banks/tasks.py) and erp_only exceptions (regardless of whether they've
    since been resolved), so a pattern stays visible even for cases that
    already matched or were cleared by a director.
    """

    def setUp(self):
        self.client = APIClient()
        self.tenant = Tenant.objects.create(name='Risk Report Org', slug='risk-report-org')
        self.branch_a = Branch.objects.create(name='Branch A', code='RRA', tenant=self.tenant)
        self.branch_b = Branch.objects.create(name='Branch B', code='RRB', tenant=self.tenant)

        self.director = User.objects.create_user(
            username='risk_director', password='test123',
            tenant=self.tenant, branch=self.branch_a, is_superuser=True,
        )
        self.tenant.owner = self.director
        self.tenant.save(update_fields=['owner'])

        self.branch_manager_a = User.objects.create_user(
            username='risk_bm_a', password='test123', tenant=self.tenant, branch=self.branch_a,
        )
        self.officer_x = User.objects.create_user(
            username='officer_x', password='test123', tenant=self.tenant, branch=self.branch_a,
        )
        self.officer_y = User.objects.create_user(
            username='officer_y', password='test123', tenant=self.tenant, branch=self.branch_b,
        )

        gl_account = Account.objects.create(
            code='1399', name='Risk Report GL', account_level=Account.LEVEL_PARENT
        )
        bank = Bank.objects.create(bank_name='Risk Report Bank', bank_code='996')
        self.bank_account = BankAccount.objects.create(
            bank=bank, account_number='0000004', account_name='Risk Report Account',
            gl_account=gl_account, account_manager=self.director,
        )
        self.recon_a = DailyReconciliation.objects.create(
            bank_account=self.bank_account, reconciliation_date='2026-07-01',
            uploaded_by=self.director, statement_file='bank_statements/risk_a.csv',
            status='completed', owner=self.director, branch=self.branch_a, tenant=self.tenant,
        )
        self.recon_b = DailyReconciliation.objects.create(
            bank_account=self.bank_account, reconciliation_date='2026-07-02',
            uploaded_by=self.director, statement_file='bank_statements/risk_b.csv',
            status='completed', owner=self.director, branch=self.branch_b, tenant=self.tenant,
        )

        # officer_x (Branch A): 2 matched (1 referenced/on-time-ish,
        # 1 unreferenced/5-days-late) + 1 unresolved high-priority erp_only.
        ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='RRA-REF1', value_date='2026-07-01',
            direction='CREDIT', amount=Decimal('1000.00'), narration='x1',
            matched=True, matched_erp_officer=self.officer_x,
            matched_erp_had_reference=True, posting_lag_days=2,
        )
        ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='RRA-REF2', value_date='2026-07-01',
            direction='CREDIT', amount=Decimal('2000.00'), narration='x2',
            matched=True, matched_erp_officer=self.officer_x,
            matched_erp_had_reference=False, posting_lag_days=5,
        )
        ReconciliationException.objects.create(
            reconciliation=self.recon_a, exception_type='erp_only', direction='CREDIT',
            loan_payment_id=901, erp_amount=Decimal('500.00'),
            erp_narration='Loan repayment – LN-901 | Ref: RRA901', erp_date='2026-07-01',
            officer=self.officer_x, erp_branch=self.branch_a,
            is_high_priority=True, resolved=False,
        )

        # officer_y (Branch B): 1 matched (referenced, posted 1 day early)
        # + 1 erp_only that's ALREADY resolved — must still count toward
        # erp_only_count/reference compliance ("regardless of resolution"),
        # but not toward unresolved_erp_only_count/high_priority_count.
        ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='RRB-REF1', value_date='2026-07-02',
            direction='CREDIT', amount=Decimal('3000.00'), narration='y1',
            matched=True, matched_erp_officer=self.officer_y,
            matched_erp_had_reference=True, posting_lag_days=-1,
        )
        ReconciliationException.objects.create(
            reconciliation=self.recon_b, exception_type='erp_only', direction='CREDIT',
            loan_payment_id=902, erp_amount=Decimal('700.00'),
            erp_narration='Loan repayment – LN-902', erp_date='2026-07-02',
            officer=self.officer_y, erp_branch=self.branch_b,
            is_high_priority=True, resolved=True, resolved_by=self.director,
        )

        self.url = '/api/banks/reports/officer-reconciliation-risk/'

    def _row_for(self, resp, officer_id):
        return next(r for r in resp.data['results'] if r['officer_id'] == officer_id)

    def test_branch_manager_sees_only_own_branch_officer(self):
        self.client.force_authenticate(user=self.branch_manager_a)
        resp = self.client.get(self.url)

        self.assertEqual(resp.status_code, 200)
        officer_ids = {r['officer_id'] for r in resp.data['results']}
        self.assertIn(self.officer_x.id, officer_ids)
        self.assertNotIn(self.officer_y.id, officer_ids)

    def test_director_sees_all_branches_by_default(self):
        self.client.force_authenticate(user=self.director)
        resp = self.client.get(self.url)

        self.assertEqual(resp.status_code, 200)
        officer_ids = {r['officer_id'] for r in resp.data['results']}
        self.assertIn(self.officer_x.id, officer_ids)
        self.assertIn(self.officer_y.id, officer_ids)

    def test_director_can_narrow_to_one_branch_via_header(self):
        self.client.force_authenticate(user=self.director)
        resp = self.client.get(self.url, HTTP_X_BRANCH_ID=str(self.branch_b.id))

        self.assertEqual(resp.status_code, 200)
        officer_ids = {r['officer_id'] for r in resp.data['results']}
        self.assertNotIn(self.officer_x.id, officer_ids)
        self.assertIn(self.officer_y.id, officer_ids)

    def test_aggregation_values_for_officer_x(self):
        self.client.force_authenticate(user=self.director)
        resp = self.client.get(self.url)
        row = self._row_for(resp, self.officer_x.id)

        self.assertEqual(row['matched_count'], 2)
        self.assertEqual(row['erp_only_count'], 1)
        self.assertEqual(row['unresolved_erp_only_count'], 1)
        self.assertEqual(row['high_priority_count'], 1)
        self.assertEqual(row['total_considered'], 3)
        self.assertAlmostEqual(row['match_rate'], 2 / 3, places=3)
        # referenced: 1 of 2 matched + the erp_only (has "| Ref:") = 2 of 3
        self.assertAlmostEqual(row['reference_compliance_rate'], 2 / 3, places=3)
        self.assertAlmostEqual(row['avg_posting_lag_days'], 3.5, places=1)
        self.assertEqual(row['late_posting_count'], 2)

    def test_erp_only_counted_regardless_of_resolution_but_not_as_still_outstanding(self):
        self.client.force_authenticate(user=self.director)
        resp = self.client.get(self.url)
        row = self._row_for(resp, self.officer_y.id)

        # The resolved erp_only exception still counts toward the totals...
        self.assertEqual(row['erp_only_count'], 1)
        self.assertEqual(row['total_considered'], 2)
        # ...but not as something still needing director attention.
        self.assertEqual(row['unresolved_erp_only_count'], 0)
        self.assertEqual(row['high_priority_count'], 0)
        self.assertEqual(row['avg_posting_lag_days'], -1)
