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
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone
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


class ResolveToExpenseUnmatchAndLinkResolveTests(TestCase):
    """
    Tests for the three new resolve-flexibility endpoints (banks/views.py):
    - UnmatchTransactionView — director-only, mandatory reason, never touches
      the underlying GL entry, reopens an outstanding bank_only exception.
    - ResolveExceptionToExpenseView — branch manager or director may
      initiate; does NOT resolve the exception itself (that happens once the
      payment is approved+posted and a later rerun matches it).
    - LinkResolveExceptionsView — director-only, exact amount match only.
    """

    def setUp(self):
        self.client = APIClient()
        self.tenant = Tenant.objects.create(name='Flex Resolve Org', slug='flex-resolve-org')
        self.branch = Branch.objects.create(name='Branch A', code='FRA')

        self.director = User.objects.create_user(
            username='flex_director', password='test123',
            tenant=self.tenant, branch=self.branch, is_superuser=True,
        )
        self.tenant.owner = self.director
        self.tenant.save(update_fields=['owner'])

        self.second_director = User.objects.create_user(
            username='flex_director2', password='test123',
            tenant=self.tenant, branch=self.branch, is_superuser=True,
        )
        self.branch_manager = User.objects.create_user(
            username='flex_bm', password='test123', tenant=self.tenant, branch=self.branch,
        )
        self.credit_officer = User.objects.create_user(
            username='flex_co', password='test123', tenant=self.tenant, branch=self.branch,
        )

        gl_account = Account.objects.create(
            code='1499', name='Flex Resolve GL', account_level=Account.LEVEL_PARENT,
            branch=self.branch,
        )
        bank = Bank.objects.create(bank_name='Flex Resolve Bank', bank_code='995')
        self.bank_account = BankAccount.objects.create(
            bank=bank, account_number='0000005', account_name='Flex Resolve Account',
            gl_account=gl_account, account_manager=self.director,
        )
        self.recon = DailyReconciliation.objects.create(
            bank_account=self.bank_account, reconciliation_date='2026-07-01',
            uploaded_by=self.director, statement_file='bank_statements/flex.csv',
            status='completed', owner=self.director, branch=self.branch, tenant=self.tenant,
        )

        expense_parent_gl = Account.objects.create(
            code='6000', name='Expenses', account_level=Account.LEVEL_PARENT,
            account_type=Account.EXPENSE, branch=self.branch,
        )
        expense_gl = Account.objects.create(
            code='6001', name='Bank Charges Expense', account_level=Account.LEVEL_CHILD,
            account_type=Account.EXPENSE, parent=expense_parent_gl, branch=self.branch,
        )
        from expenses.models import ExpenseCategory
        self.category = ExpenseCategory.objects.create(
            name='Bank Charges', code='BANKCHG', expense_account=expense_gl,
            branch=self.branch, tenant=self.tenant, owner=self.director,
        )

    # ── Unmatch ──────────────────────────────────────────────────────────

    def test_director_can_unmatch_transaction(self):
        tx = ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='FRA-1', value_date='2026-07-01',
            direction='CREDIT', amount=Decimal('1000.00'), narration='test',
            matched=True, matched_erp_payment_id=42, match_confidence='HIGH',
        )
        self.client.force_authenticate(user=self.director)
        url = f'/api/banks/reconciliations/{self.recon.id}/transactions/{tx.id}/unmatch/'
        resp = self.client.post(url, {'reason': 'matched to the wrong loan repayment'}, format='json')

        self.assertEqual(resp.status_code, 200, resp.data)
        tx.refresh_from_db()
        self.assertFalse(tx.matched)
        self.assertEqual(tx.unmatched_by_id, self.director.id)
        self.assertEqual(tx.unmatched_reason, 'matched to the wrong loan repayment')
        # Historical match info is preserved, not cleared.
        self.assertEqual(tx.matched_erp_payment_id, 42)
        self.assertEqual(tx.match_confidence, 'HIGH')

        exc = ReconciliationException.objects.get(reconciliation=self.recon, bank_transaction_id=tx.id)
        self.assertEqual(exc.exception_type, 'bank_only')
        self.assertFalse(exc.resolved)

        self.recon.refresh_from_db()
        self.assertEqual(self.recon.matched_count, 0)
        self.assertEqual(self.recon.unmatched_bank_count, 1)

    def test_branch_manager_cannot_unmatch_transaction(self):
        tx = ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='FRA-2', value_date='2026-07-01',
            direction='CREDIT', amount=Decimal('1000.00'), narration='test', matched=True,
        )
        self.client.force_authenticate(user=self.branch_manager)
        url = f'/api/banks/reconciliations/{self.recon.id}/transactions/{tx.id}/unmatch/'
        resp = self.client.post(url, {'reason': 'looks wrong'}, format='json')

        self.assertEqual(resp.status_code, 403)
        tx.refresh_from_db()
        self.assertTrue(tx.matched)

    def test_cannot_unmatch_already_unmatched_transaction(self):
        tx = ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='FRA-3', value_date='2026-07-01',
            direction='CREDIT', amount=Decimal('1000.00'), narration='test', matched=False,
        )
        self.client.force_authenticate(user=self.director)
        url = f'/api/banks/reconciliations/{self.recon.id}/transactions/{tx.id}/unmatch/'
        resp = self.client.post(url, {'reason': 'test'}, format='json')

        self.assertEqual(resp.status_code, 400)

    def test_unmatch_requires_a_reason(self):
        tx = ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='FRA-4', value_date='2026-07-01',
            direction='CREDIT', amount=Decimal('1000.00'), narration='test', matched=True,
        )
        self.client.force_authenticate(user=self.director)
        url = f'/api/banks/reconciliations/{self.recon.id}/transactions/{tx.id}/unmatch/'
        resp = self.client.post(url, {'reason': '   '}, format='json')

        self.assertEqual(resp.status_code, 400)
        tx.refresh_from_db()
        self.assertTrue(tx.matched)

    # ── Resolve to expense ──────────────────────────────────────────────

    def test_branch_manager_can_initiate_resolve_to_expense(self):
        exc = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='bank_only', direction='DEBIT',
            bank_amount=Decimal('75.00'), bank_narration='Stamp duty', bank_date='2026-07-01',
        )
        self.client.force_authenticate(user=self.branch_manager)
        url = f'/api/banks/reconciliations/{self.recon.id}/exceptions/{exc.id}/resolve-to-expense/'
        with patch('permissions.services.PermissionResolver.resolve') as mock_resolve:
            mock_resolve.return_value = SimpleNamespace(can_edit=True, can_approve=False)
            resp = self.client.post(
                url, {'category': self.category.id, 'payee_name': 'First Bank'}, format='json'
            )

        self.assertEqual(resp.status_code, 201, resp.data)
        exc.refresh_from_db()
        self.assertFalse(exc.resolved)
        self.assertIsNotNone(exc.pending_bank_payment_id)
        payment = exc.pending_bank_payment
        self.assertEqual(payment.status, 'pending')
        self.assertEqual(payment.amount, Decimal('75.00'))
        self.assertEqual(payment.expense.category_id, self.category.id)
        self.assertEqual(payment.expense.payee_name, 'First Bank')

    def test_resolve_to_expense_rejects_credit_exception(self):
        exc = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='bank_only', direction='CREDIT',
            bank_amount=Decimal('75.00'), bank_narration='Unexplained credit', bank_date='2026-07-01',
        )
        self.client.force_authenticate(user=self.director)
        url = f'/api/banks/reconciliations/{self.recon.id}/exceptions/{exc.id}/resolve-to-expense/'
        resp = self.client.post(url, {'category': self.category.id}, format='json')

        self.assertEqual(resp.status_code, 400)

    def test_resolve_to_expense_rejects_when_already_pending(self):
        exc = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='bank_only', direction='DEBIT',
            bank_amount=Decimal('75.00'), bank_narration='Stamp duty', bank_date='2026-07-01',
        )
        self.client.force_authenticate(user=self.director)
        url = f'/api/banks/reconciliations/{self.recon.id}/exceptions/{exc.id}/resolve-to-expense/'
        first = self.client.post(url, {'category': self.category.id}, format='json')
        self.assertEqual(first.status_code, 201, first.data)

        second = self.client.post(url, {'category': self.category.id}, format='json')
        self.assertEqual(second.status_code, 400)

    def test_credit_officer_cannot_initiate_resolve_to_expense(self):
        exc = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='bank_only', direction='DEBIT',
            bank_amount=Decimal('75.00'), bank_narration='Stamp duty', bank_date='2026-07-01',
        )
        self.client.force_authenticate(user=self.credit_officer)
        url = f'/api/banks/reconciliations/{self.recon.id}/exceptions/{exc.id}/resolve-to-expense/'
        resp = self.client.post(url, {'category': self.category.id}, format='json')

        self.assertEqual(resp.status_code, 403)

    # ── Maker-checker on resolve-to-expense approval ────────────────────

    def test_creator_cannot_approve_own_resolve_to_expense_payment(self):
        exc = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='bank_only', direction='DEBIT',
            bank_amount=Decimal('75.00'), bank_narration='Stamp duty', bank_date='2026-07-01',
        )
        self.client.force_authenticate(user=self.director)
        create_url = f'/api/banks/reconciliations/{self.recon.id}/exceptions/{exc.id}/resolve-to-expense/'
        create_resp = self.client.post(create_url, {'category': self.category.id}, format='json')
        self.assertEqual(create_resp.status_code, 201, create_resp.data)

        exc.refresh_from_db()
        payment_id = exc.pending_bank_payment_id

        approve_url = f'/api/banks/bank-payments/{payment_id}/approve/'
        resp = self.client.post(approve_url, {}, format='json')

        self.assertEqual(resp.status_code, 403)
        exc.pending_bank_payment.refresh_from_db()
        self.assertEqual(exc.pending_bank_payment.status, 'pending')

    def test_different_director_can_approve_resolve_to_expense_payment(self):
        exc = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='bank_only', direction='DEBIT',
            bank_amount=Decimal('75.00'), bank_narration='Stamp duty', bank_date='2026-07-01',
        )
        self.client.force_authenticate(user=self.director)
        create_url = f'/api/banks/reconciliations/{self.recon.id}/exceptions/{exc.id}/resolve-to-expense/'
        create_resp = self.client.post(create_url, {'category': self.category.id}, format='json')
        self.assertEqual(create_resp.status_code, 201, create_resp.data)

        exc.refresh_from_db()
        payment_id = exc.pending_bank_payment_id

        self.client.force_authenticate(user=self.second_director)
        approve_url = f'/api/banks/bank-payments/{payment_id}/approve/'
        resp = self.client.post(approve_url, {}, format='json')

        self.assertEqual(resp.status_code, 200, resp.data)
        exc.pending_bank_payment.refresh_from_db()
        self.assertEqual(exc.pending_bank_payment.status, 'posted')

    # ── Minimum reason length ───────────────────────────────────────────

    def test_unmatch_rejects_a_too_short_reason(self):
        tx = ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='FRA-SHORT', value_date='2026-07-01',
            direction='CREDIT', amount=Decimal('1000.00'), narration='test', matched=True,
        )
        self.client.force_authenticate(user=self.director)
        url = f'/api/banks/reconciliations/{self.recon.id}/transactions/{tx.id}/unmatch/'
        resp = self.client.post(url, {'reason': 'too short'}, format='json')  # 9 chars

        self.assertEqual(resp.status_code, 400)
        tx.refresh_from_db()
        self.assertTrue(tx.matched)

    def test_link_resolve_rejects_a_too_short_reason(self):
        credit_exc = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='bank_only', direction='CREDIT',
            bank_amount=Decimal('50000.00'), bank_narration='Clawback', bank_date='2026-07-01',
        )
        debit_exc = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='bank_only', direction='DEBIT',
            bank_amount=Decimal('50000.00'), bank_narration='Sent to wrong bank', bank_date='2026-06-28',
        )
        self.client.force_authenticate(user=self.director)
        resp = self.client.post('/api/banks/exceptions/link-resolve/', {
            'exception_a_id': credit_exc.id, 'exception_b_id': debit_exc.id,
            'resolution_notes': 'short',  # 5 chars
        }, format='json')

        self.assertEqual(resp.status_code, 400)
        credit_exc.refresh_from_db()
        self.assertFalse(credit_exc.resolved)

    # ── Full loop: resolve-to-expense → approve → rerun auto-resolves ─────

    @patch('banks.reconciliation_utils.fetch_erp_payments', return_value=[])
    @patch('banks.tasks.http_requests.post')
    def test_resolve_to_expense_full_loop_auto_resolves_on_match(self, mock_post, mock_fetch):
        from banks.tasks import run_reconciliation_match

        tx = ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='FRA-LOOP', value_date='2026-07-01',
            direction='DEBIT', amount=Decimal('75.00'), narration='Stamp duty',
        )
        exc = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='bank_only', direction='DEBIT',
            bank_transaction_id=tx.id,
            bank_amount=Decimal('75.00'), bank_narration='Stamp duty', bank_date='2026-07-01',
        )

        self.client.force_authenticate(user=self.director)
        create_url = f'/api/banks/reconciliations/{self.recon.id}/exceptions/{exc.id}/resolve-to-expense/'
        create_resp = self.client.post(create_url, {'category': self.category.id}, format='json')
        self.assertEqual(create_resp.status_code, 201, create_resp.data)

        exc.refresh_from_db()
        payment = exc.pending_bank_payment
        payment.approve_payment(approved_by=self.director, notes='ok')
        payment.refresh_from_db()
        self.assertEqual(payment.status, 'posted')
        journal_entry_id = payment.journal_entry_id
        self.assertIsNotNone(journal_entry_id)

        self.recon.status = 'processing'
        self.recon.save(update_fields=['status'])

        mock_response = MagicMock()
        mock_response.json.return_value = {
            'matchedCount': 1, 'unmatchedBankCount': 0, 'unmatchedErpCount': 0,
            'matches': [
                {'bankTransactionId': str(tx.id), 'erpPaymentId': journal_entry_id,
                 'confidence': 'HIGH', 'direction': 'DEBIT'},
            ],
            'exceptions': [],
        }
        mock_response.raise_for_status = MagicMock()
        mock_post.return_value = mock_response

        run_reconciliation_match(self.recon.id, include_debits=True)

        exc.refresh_from_db()
        self.assertTrue(exc.resolved)
        self.assertIn('Auto-resolved', exc.resolution_notes)

    # ── Link-resolve (netting) ─────────────────────────────────────────

    def test_director_can_net_matching_credit_and_debit_exceptions(self):
        credit_exc = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='bank_only', direction='CREDIT',
            bank_amount=Decimal('50000.00'), bank_narration='Wrong-bank clawback', bank_date='2026-07-01',
        )
        debit_exc = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='bank_only', direction='DEBIT',
            bank_amount=Decimal('50000.00'), bank_narration='Sent to wrong bank', bank_date='2026-06-28',
        )
        self.client.force_authenticate(user=self.director)
        resp = self.client.post('/api/banks/exceptions/link-resolve/', {
            'exception_a_id': credit_exc.id, 'exception_b_id': debit_exc.id,
            'resolution_notes': 'Compensating transfer for the wrong-bank payment on 2026-06-28',
        }, format='json')

        self.assertEqual(resp.status_code, 200, resp.data)
        credit_exc.refresh_from_db()
        debit_exc.refresh_from_db()
        self.assertTrue(credit_exc.resolved)
        self.assertTrue(debit_exc.resolved)
        self.assertEqual(credit_exc.netted_with_id, debit_exc.id)
        self.assertEqual(debit_exc.netted_with_id, credit_exc.id)

    def test_link_resolve_rejects_amount_mismatch(self):
        credit_exc = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='bank_only', direction='CREDIT',
            bank_amount=Decimal('50000.00'), bank_narration='Clawback', bank_date='2026-07-01',
        )
        debit_exc = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='bank_only', direction='DEBIT',
            bank_amount=Decimal('49000.00'), bank_narration='Sent to wrong bank', bank_date='2026-06-28',
        )
        self.client.force_authenticate(user=self.director)
        resp = self.client.post('/api/banks/exceptions/link-resolve/', {
            'exception_a_id': credit_exc.id, 'exception_b_id': debit_exc.id,
            'resolution_notes': 'attempt',
        }, format='json')

        self.assertEqual(resp.status_code, 400)
        credit_exc.refresh_from_db()
        self.assertFalse(credit_exc.resolved)

    def test_link_resolve_rejects_same_direction(self):
        exc1 = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='bank_only', direction='CREDIT',
            bank_amount=Decimal('50000.00'), bank_narration='A', bank_date='2026-07-01',
        )
        exc2 = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='bank_only', direction='CREDIT',
            bank_amount=Decimal('50000.00'), bank_narration='B', bank_date='2026-07-01',
        )
        self.client.force_authenticate(user=self.director)
        resp = self.client.post('/api/banks/exceptions/link-resolve/', {
            'exception_a_id': exc1.id, 'exception_b_id': exc2.id,
            'resolution_notes': 'attempt',
        }, format='json')

        self.assertEqual(resp.status_code, 400)

    def test_link_resolve_rejects_bank_only_erp_only_opposite_direction(self):
        # bank_only+erp_only is only valid SAME direction (missed-match
        # case) — opposite direction has no sensible interpretation and
        # must still be rejected.
        bank_only_exc = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='bank_only', direction='CREDIT',
            bank_amount=Decimal('50000.00'), bank_narration='A', bank_date='2026-07-01',
        )
        erp_only_exc = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='erp_only', direction='DEBIT',
            erp_amount=Decimal('50000.00'), erp_narration='B', erp_date='2026-07-01',
        )
        self.client.force_authenticate(user=self.director)
        resp = self.client.post('/api/banks/exceptions/link-resolve/', {
            'exception_a_id': bank_only_exc.id, 'exception_b_id': erp_only_exc.id,
            'resolution_notes': 'attempting an invalid opposite-direction pairing',
        }, format='json')

        self.assertEqual(resp.status_code, 400)
        bank_only_exc.refresh_from_db()
        self.assertFalse(bank_only_exc.resolved)

    def test_link_resolve_accepts_bank_only_erp_only_same_direction(self):
        # The missed-auto-match case: a bank_only and an erp_only of the
        # same amount and same direction are plausibly the same real
        # transaction that just failed to fuzzy-match.
        bank_only_exc = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='bank_only', direction='CREDIT',
            bank_amount=Decimal('4000.00'), bank_narration='Unmatched credit', bank_date='2026-07-01',
        )
        erp_only_exc = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='erp_only', direction='CREDIT',
            erp_amount=Decimal('4000.00'), erp_narration='Loan repayment', erp_date='2026-06-30',
        )
        self.client.force_authenticate(user=self.director)
        resp = self.client.post('/api/banks/exceptions/link-resolve/', {
            'exception_a_id': bank_only_exc.id, 'exception_b_id': erp_only_exc.id,
            'resolution_notes': 'Same amount and date range — reference just did not fuzzy-match',
        }, format='json')

        self.assertEqual(resp.status_code, 200, resp.data)
        bank_only_exc.refresh_from_db()
        erp_only_exc.refresh_from_db()
        self.assertTrue(bank_only_exc.resolved)
        self.assertTrue(erp_only_exc.resolved)
        self.assertEqual(bank_only_exc.netted_with_id, erp_only_exc.id)

    def test_link_resolve_rejects_erp_only_erp_only(self):
        erp_only_a = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='erp_only', direction='CREDIT',
            erp_amount=Decimal('4000.00'), erp_narration='A', erp_date='2026-07-01',
        )
        erp_only_b = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='erp_only', direction='CREDIT',
            erp_amount=Decimal('4000.00'), erp_narration='B', erp_date='2026-07-01',
        )
        self.client.force_authenticate(user=self.director)
        resp = self.client.post('/api/banks/exceptions/link-resolve/', {
            'exception_a_id': erp_only_a.id, 'exception_b_id': erp_only_b.id,
            'resolution_notes': 'attempting an invalid erp_only pairing',
        }, format='json')

        self.assertEqual(resp.status_code, 400)

    def test_link_candidates_for_bank_only_includes_opposite_bank_only_and_same_direction_erp_only(self):
        source = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='bank_only', direction='CREDIT',
            bank_amount=Decimal('4000.00'), bank_narration='source', bank_date='2026-07-01',
        )
        opposite_bank_only = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='bank_only', direction='DEBIT',
            bank_amount=Decimal('4000.00'), bank_narration='netting candidate', bank_date='2026-06-28',
        )
        same_direction_erp_only = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='erp_only', direction='CREDIT',
            erp_amount=Decimal('4000.00'), erp_narration='missed match candidate', erp_date='2026-06-30',
        )
        # Should NOT appear: wrong amount, same-direction bank_only, opposite-direction erp_only.
        ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='bank_only', direction='DEBIT',
            bank_amount=Decimal('9999.00'), bank_narration='wrong amount', bank_date='2026-06-28',
        )
        ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='bank_only', direction='CREDIT',
            bank_amount=Decimal('4000.00'), bank_narration='same direction bank_only', bank_date='2026-06-28',
        )
        ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='erp_only', direction='DEBIT',
            erp_amount=Decimal('4000.00'), erp_narration='opposite direction erp_only', erp_date='2026-06-28',
        )

        self.client.force_authenticate(user=self.director)
        resp = self.client.get(f'/api/banks/exceptions/{source.id}/link-candidates/')

        self.assertEqual(resp.status_code, 200, resp.data)
        candidate_ids = {row['id'] for row in resp.data['results']}
        self.assertEqual(candidate_ids, {opposite_bank_only.id, same_direction_erp_only.id})

    def test_branch_manager_cannot_link_resolve(self):
        credit_exc = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='bank_only', direction='CREDIT',
            bank_amount=Decimal('50000.00'), bank_narration='A', bank_date='2026-07-01',
        )
        debit_exc = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='bank_only', direction='DEBIT',
            bank_amount=Decimal('50000.00'), bank_narration='B', bank_date='2026-06-28',
        )
        self.client.force_authenticate(user=self.branch_manager)
        resp = self.client.post('/api/banks/exceptions/link-resolve/', {
            'exception_a_id': credit_exc.id, 'exception_b_id': debit_exc.id,
            'resolution_notes': 'attempt',
        }, format='json')

        self.assertEqual(resp.status_code, 403)


class DualApprovalResolveTests(TestCase):
    """
    Tests for the dual-approval hold on ResolveExceptionView/
    SecondResolveExceptionView: a single director resolving an exception at/
    above RECONCILIATION_EXCEPTION_DUAL_APPROVAL_THRESHOLD (default ₦3000,
    see phoenix/settings.py) only records the first action — resolved stays
    False until a second, different director confirms. Perfect matches are
    excluded (see ReconciliationException.requires_dual_approval_to_resolve).
    """

    def setUp(self):
        self.client = APIClient()
        self.tenant = Tenant.objects.create(name='Dual Approval Org', slug='dual-approval-org')
        self.branch = Branch.objects.create(name='Branch A', code='DAA')

        self.director = User.objects.create_user(
            username='dual_director', password='test123',
            tenant=self.tenant, branch=self.branch, is_superuser=True,
        )
        self.tenant.owner = self.director
        self.tenant.save(update_fields=['owner'])

        self.second_director = User.objects.create_user(
            username='dual_director2', password='test123',
            tenant=self.tenant, branch=self.branch, is_superuser=True,
        )
        self.branch_manager = User.objects.create_user(
            username='dual_bm', password='test123', tenant=self.tenant, branch=self.branch,
        )

        gl_account = Account.objects.create(
            code='1799', name='Dual Approval GL', account_level=Account.LEVEL_PARENT
        )
        bank = Bank.objects.create(bank_name='Dual Approval Bank', bank_code='992')
        self.bank_account = BankAccount.objects.create(
            bank=bank, account_number='0000008', account_name='Dual Approval Account',
            gl_account=gl_account, account_manager=self.director,
        )
        self.recon = DailyReconciliation.objects.create(
            bank_account=self.bank_account, reconciliation_date='2026-07-01',
            uploaded_by=self.director, statement_file='bank_statements/dual.csv',
            status='completed', owner=self.director, branch=self.branch, tenant=self.tenant,
        )

    def _resolve_url(self, exc_id):
        return f'/api/banks/reconciliations/{self.recon.id}/exceptions/{exc_id}/resolve/'

    def _second_resolve_url(self, exc_id):
        return f'/api/banks/reconciliations/{self.recon.id}/exceptions/{exc_id}/resolve/second/'

    def test_large_erp_only_exception_is_held_pending_second_approval(self):
        exc = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='erp_only', direction='CREDIT',
            erp_amount=Decimal('11000.00'), erp_narration='Loan repayment', erp_date='2026-07-01',
        )
        self.client.force_authenticate(user=self.director)
        resp = self.client.patch(
            self._resolve_url(exc.id),
            {'resolution_notes': 'Investigated with the branch, payment genuinely never arrived'},
            format='json',
        )

        self.assertEqual(resp.status_code, 202, resp.data)
        exc.refresh_from_db()
        self.assertFalse(exc.resolved)
        self.assertEqual(exc.resolved_by_id, self.director.id)
        self.assertTrue(exc.awaiting_second_resolution)
        self.assertIsNone(exc.resolved_at)

    def test_small_exception_still_resolves_immediately(self):
        exc = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='erp_only', direction='CREDIT',
            erp_amount=Decimal('500.00'), erp_narration='Loan repayment', erp_date='2026-07-01',
        )
        self.client.force_authenticate(user=self.director)
        resp = self.client.patch(
            self._resolve_url(exc.id),
            {'resolution_notes': 'Small amount, confirmed with the officer'},
            format='json',
        )

        self.assertEqual(resp.status_code, 200, resp.data)
        exc.refresh_from_db()
        self.assertTrue(exc.resolved)
        self.assertIsNotNone(exc.resolved_at)

    def test_perfect_match_exception_bypasses_dual_approval_regardless_of_amount(self):
        perfect_match = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='amount_diff', direction='CREDIT',
            bank_amount=Decimal('50000.00'), bank_narration='Loan repayment', bank_date='2026-07-01',
            erp_amount=Decimal('50000.00'), erp_narration='Loan repayment', erp_date='2026-07-01',
        )
        self.client.force_authenticate(user=self.branch_manager)
        with patch('permissions.services.PermissionResolver.resolve') as mock_resolve:
            mock_resolve.return_value = SimpleNamespace(can_edit=True, can_approve=False)
            resp = self.client.patch(self._resolve_url(perfect_match.id), {}, format='json')

        self.assertEqual(resp.status_code, 200, resp.data)
        perfect_match.refresh_from_db()
        self.assertTrue(perfect_match.resolved)

    def test_same_director_cannot_provide_second_approval(self):
        exc = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='erp_only', direction='CREDIT',
            erp_amount=Decimal('11000.00'), erp_narration='Loan repayment', erp_date='2026-07-01',
        )
        self.client.force_authenticate(user=self.director)
        self.client.patch(
            self._resolve_url(exc.id),
            {'resolution_notes': 'Investigated with the branch, payment never arrived'},
            format='json',
        )

        resp = self.client.patch(
            self._second_resolve_url(exc.id),
            {'resolution_notes': 'Confirming my own review'},
            format='json',
        )

        self.assertEqual(resp.status_code, 403)
        exc.refresh_from_db()
        self.assertFalse(exc.resolved)

    def test_different_director_can_confirm_second_approval(self):
        exc = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='erp_only', direction='CREDIT',
            erp_amount=Decimal('11000.00'), erp_narration='Loan repayment', erp_date='2026-07-01',
        )
        self.client.force_authenticate(user=self.director)
        self.client.patch(
            self._resolve_url(exc.id),
            {'resolution_notes': 'Investigated with the branch, payment never arrived'},
            format='json',
        )

        self.client.force_authenticate(user=self.second_director)
        resp = self.client.patch(
            self._second_resolve_url(exc.id),
            {'resolution_notes': 'Independently verified with the bank statement'},
            format='json',
        )

        self.assertEqual(resp.status_code, 200, resp.data)
        exc.refresh_from_db()
        self.assertTrue(exc.resolved)
        self.assertEqual(exc.second_resolved_by_id, self.second_director.id)
        self.assertIsNotNone(exc.resolved_at)

        self.recon.refresh_from_db()
        self.assertEqual(self.recon.unmatched_erp_count, 0)

    def test_branch_manager_cannot_provide_second_approval(self):
        exc = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='erp_only', direction='CREDIT',
            erp_amount=Decimal('11000.00'), erp_narration='Loan repayment', erp_date='2026-07-01',
        )
        self.client.force_authenticate(user=self.director)
        self.client.patch(
            self._resolve_url(exc.id),
            {'resolution_notes': 'Investigated with the branch, payment never arrived'},
            format='json',
        )

        self.client.force_authenticate(user=self.branch_manager)
        resp = self.client.patch(
            self._second_resolve_url(exc.id),
            {'resolution_notes': 'Branch manager attempting to confirm'},
            format='json',
        )

        self.assertEqual(resp.status_code, 403)

    def test_second_approval_requires_a_first_resolution(self):
        exc = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='erp_only', direction='CREDIT',
            erp_amount=Decimal('11000.00'), erp_narration='Loan repayment', erp_date='2026-07-01',
        )
        self.client.force_authenticate(user=self.second_director)
        resp = self.client.patch(
            self._second_resolve_url(exc.id),
            {'resolution_notes': 'Trying to confirm with no first resolution'},
            format='json',
        )

        self.assertEqual(resp.status_code, 400)

    def test_second_approval_rejects_too_short_notes(self):
        exc = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='erp_only', direction='CREDIT',
            erp_amount=Decimal('11000.00'), erp_narration='Loan repayment', erp_date='2026-07-01',
        )
        self.client.force_authenticate(user=self.director)
        self.client.patch(
            self._resolve_url(exc.id),
            {'resolution_notes': 'Investigated with the branch, payment never arrived'},
            format='json',
        )

        self.client.force_authenticate(user=self.second_director)
        resp = self.client.patch(
            self._second_resolve_url(exc.id), {'resolution_notes': 'ok'}, format='json',
        )

        self.assertEqual(resp.status_code, 400)
        exc.refresh_from_db()
        self.assertFalse(exc.resolved)


class ManualOverridesReportTests(TestCase):
    """
    GET /api/banks/reports/manual-overrides/ — audit trail combining
    unmatches, netted resolutions, and resolve-to-expense postings, branch-
    scoped via DailyReconciliation.objects.for_user() like every other
    reconciliation endpoint.
    """

    def setUp(self):
        self.client = APIClient()
        self.tenant = Tenant.objects.create(name='Overrides Report Org', slug='overrides-report-org')
        self.branch_a = Branch.objects.create(name='Branch A', code='ORA')
        self.branch_b = Branch.objects.create(name='Branch B', code='ORB')

        self.director = User.objects.create_user(
            username='overrides_director', password='test123',
            tenant=self.tenant, branch=self.branch_a, is_superuser=True,
        )
        self.tenant.owner = self.director
        self.tenant.save(update_fields=['owner'])

        self.branch_manager_a = User.objects.create_user(
            username='overrides_bm_a', password='test123', tenant=self.tenant, branch=self.branch_a,
        )

        gl_account = Account.objects.create(
            code='1699', name='Overrides Report GL', account_level=Account.LEVEL_PARENT
        )
        bank = Bank.objects.create(bank_name='Overrides Report Bank', bank_code='993')
        self.bank_account_a = BankAccount.objects.create(
            bank=bank, account_number='0000007', account_name='Overrides Report Account A',
            gl_account=gl_account, account_manager=self.director,
        )
        self.recon_a = DailyReconciliation.objects.create(
            bank_account=self.bank_account_a, reconciliation_date='2026-07-01',
            uploaded_by=self.director, statement_file='bank_statements/overrides_a.csv',
            status='completed', owner=self.director, branch=self.branch_a, tenant=self.tenant,
        )
        self.recon_b = DailyReconciliation.objects.create(
            bank_account=self.bank_account_a, reconciliation_date='2026-07-02',
            uploaded_by=self.director, statement_file='bank_statements/overrides_b.csv',
            status='completed', owner=self.director, branch=self.branch_b, tenant=self.tenant,
        )

        # An unmatch event on recon_a's bank account.
        self.unmatched_tx = ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account_a, bank_ref='ORA-1', value_date='2026-07-01',
            direction='CREDIT', amount=Decimal('2000.00'), narration='unmatch me',
            matched=False, unmatched_by=self.director, unmatched_at=timezone.now(),
            unmatched_reason='matched to the wrong loan repayment',
        )

        # A netted pair on recon_a.
        self.netted_credit = ReconciliationException.objects.create(
            reconciliation=self.recon_a, exception_type='bank_only', direction='CREDIT',
            bank_amount=Decimal('50000.00'), bank_narration='Clawback', bank_date='2026-07-01',
            resolved=True, resolved_by=self.director, resolved_at=timezone.now(),
            resolution_notes='Compensating transfer for the wrong-bank payment',
        )
        self.netted_debit = ReconciliationException.objects.create(
            reconciliation=self.recon_a, exception_type='bank_only', direction='DEBIT',
            bank_amount=Decimal('50000.00'), bank_narration='Sent to wrong bank', bank_date='2026-06-28',
            resolved=True, resolved_by=self.director, resolved_at=timezone.now(),
            resolution_notes='Compensating transfer for the wrong-bank payment',
        )
        self.netted_credit.netted_with = self.netted_debit
        self.netted_credit.save(update_fields=['netted_with'])
        self.netted_debit.netted_with = self.netted_credit
        self.netted_debit.save(update_fields=['netted_with'])

    def test_director_sees_unmatch_and_netted_events(self):
        self.client.force_authenticate(user=self.director)
        resp = self.client.get('/api/banks/reports/manual-overrides/')

        self.assertEqual(resp.status_code, 200, resp.data)
        types = {row['type'] for row in resp.data['results']}
        self.assertIn('unmatch', types)
        self.assertIn('netted', types)
        # netted is a pair, so both rows show up
        netted_ids = {row['reference_id'] for row in resp.data['results'] if row['type'] == 'netted'}
        self.assertEqual(netted_ids, {self.netted_credit.id, self.netted_debit.id})

    def test_unmatch_event_includes_actor_and_reason(self):
        self.client.force_authenticate(user=self.director)
        resp = self.client.get('/api/banks/reports/manual-overrides/')

        unmatch_events = [r for r in resp.data['results'] if r['type'] == 'unmatch']
        self.assertEqual(len(unmatch_events), 1)
        event = unmatch_events[0]
        self.assertEqual(event['actor_name'], self.director.get_full_name())
        self.assertEqual(event['reason'], 'matched to the wrong loan repayment')
        self.assertEqual(event['amount'], '2000.00')

    def test_branch_manager_only_sees_own_branch(self):
        # recon_a is branch_a, recon_b is branch_b — branch_manager_a should
        # only see recon_a's bank account activity (both recons share the
        # same bank account here, so scoping is exercised via for_user()'s
        # DailyReconciliation-level branch filter feeding bank_account_ids).
        self.client.force_authenticate(user=self.branch_manager_a)
        resp = self.client.get('/api/banks/reports/manual-overrides/')

        self.assertEqual(resp.status_code, 200, resp.data)
        # Should still see the unmatch/netted events since they're on
        # recon_a (branch_a), which branch_manager_a has access to.
        types = {row['type'] for row in resp.data['results']}
        self.assertIn('unmatch', types)

    def test_date_filter_excludes_events_outside_range(self):
        self.client.force_authenticate(user=self.director)
        resp = self.client.get('/api/banks/reports/manual-overrides/', {
            'date_from': '2020-01-01', 'date_to': '2020-01-02',
        })

        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['results'], [])


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
