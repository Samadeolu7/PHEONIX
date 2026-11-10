"""
Resolution cases (banks/resolution_service.py): maker -> branch manager ->
director, disputes, dissolve, clean bulk approval, and the officer-only
visibility of "Recorded, not in bank" lines.

Who counts as a branch manager / director is decided by page grants in
production (set_bank_recon_resolve_policy). Here those two checks are
patched by user id so the workflow rules are tested on their own.
"""
import shutil
import tempfile
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
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
    ReconciliationResolution as Case,
)
from users.models import Tenant

User = get_user_model()

CASES = '/api/banks/resolutions/'
PENDING = '/api/banks/pending-repayments/'


def action_url(case_id, action):
    return f'{CASES}{case_id}/{action}/'


_TEST_MEDIA = tempfile.mkdtemp(prefix='recon-evidence-tests-')


@override_settings(MEDIA_ROOT=_TEST_MEDIA)
class ResolutionWorkflowTests(TestCase):

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(_TEST_MEDIA, ignore_errors=True)

    def setUp(self):
        self.client = APIClient()
        self.tenant = Tenant.objects.create(name='Res Org', slug='res-org')
        self.branch = Branch.objects.create(name='Branch R', code='RSA', tenant=self.tenant)

        def user(name):
            return User.objects.create_user(username=name, password='x', tenant=self.tenant, branch=self.branch)

        self.officer = user('officer')      # posted the ERP payment
        self.officer2 = user('officer2')    # another officer
        self.bm = user('bm')
        self.bm2 = user('bm2')
        self.dir1 = user('dir1')
        self.dir2 = user('dir2')

        managers = {self.bm.pk, self.bm2.pk, self.dir1.pk, self.dir2.pk}
        directors = {self.dir1.pk, self.dir2.pk}
        for target, ids in (
            ('banks.resolution_service.is_recon_manager', managers),
            ('banks.resolution_service.is_recon_director', directors),
        ):
            p = patch(target, side_effect=lambda u, ids=ids: getattr(u, 'pk', None) in ids)
            p.start()
            self.addCleanup(p.stop)

        gl = Account.objects.create(code='1296', name='Res GL', account_level=Account.LEVEL_PARENT)
        bank = Bank.objects.create(bank_name='Res Bank', bank_code='996')
        self.account = BankAccount.objects.create(
            bank=bank, account_number='0000005', account_name='Branch R Collections',
            gl_account=gl, account_manager=self.bm,
        )
        self.recon = DailyReconciliation.objects.create(
            bank_account=self.account, reconciliation_date='2026-11-02',
            uploaded_by=self.bm, statement_file='bank_statements/r.csv',
            status='completed', owner=self.bm, branch=self.branch, tenant=self.tenant,
        )

        # The officer's recorded payment that never matched
        self.erp_exc = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='erp_only', direction='CREDIT',
            loan_payment_id=501, erp_amount=Decimal('5000.00'), erp_date='2026-11-02',
            erp_narration='Loan repayment - LN-1 ADEBAYO JOHN', officer=self.officer,
        )
        # An unmatched bank credit of the same amount
        self.tx = ReconciliationBankTransaction.objects.create(
            bank_account=self.account, bank_ref='REF-1', value_date='2026-11-02',
            direction='CREDIT', amount=Decimal('5000.00'), narration='TRF FROM ADEBAYO JOHN',
        )
        self.bank_exc = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='bank_only', direction='CREDIT',
            bank_transaction_id=self.tx.pk, bank_amount=Decimal('5000.00'),
            bank_narration=self.tx.narration, bank_date='2026-11-02',
        )

    # ── helpers ──────────────────────────────────────────────────────────────

    def as_user(self, user):
        self.client.force_authenticate(user)

    def propose_link(self, user=None):
        self.as_user(user or self.officer)
        return self.client.post(CASES, {
            'erp_exception_id': self.erp_exc.pk, 'kind': 'link',
            'bank_exception_id': self.bank_exc.pk,
            'reason': 'Client paid by transfer, same day.',
        }, format='multipart')

    def recommend(self, case_id, user=None):
        self.as_user(user or self.bm)
        return self.client.post(action_url(case_id, 'review'),
                                {'recommend': True, 'notes': 'Checked the statement, matches.'}, format='json')

    def approve(self, case_id, user=None):
        self.as_user(user or self.dir1)
        return self.client.post(action_url(case_id, 'approve'),
                                {'notes': 'Facts checked, approving.'}, format='json')

    # ── visibility ───────────────────────────────────────────────────────────

    def test_officer_sees_only_own_not_in_bank_lines(self):
        ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='erp_only', direction='CREDIT',
            loan_payment_id=777, erp_amount=Decimal('100.00'), erp_date='2026-11-02', officer=self.officer2,
        )
        self.as_user(self.officer)
        ids = {r['id'] for r in self.client.get(PENDING, {'kind': 'erp_only'}).data['results']}
        self.assertEqual(ids, {self.erp_exc.pk})
        # bank-only lines are still branch-wide
        self.as_user(self.officer2)
        bank_ids = {r['id'] for r in self.client.get(PENDING, {'kind': 'bank_only'}).data['results']}
        self.assertIn(self.bank_exc.pk, bank_ids)

    def test_branch_manager_sees_all_not_in_bank_lines(self):
        ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='erp_only', direction='CREDIT',
            loan_payment_id=777, erp_amount=Decimal('100.00'), erp_date='2026-11-02', officer=self.officer2,
        )
        self.as_user(self.bm)
        self.assertEqual(self.client.get(PENDING, {'kind': 'erp_only'}).data['totals']['erp_only']['count'], 2)

    def test_officer_cannot_propose_for_someone_elses_payment(self):
        resp = self.propose_link(user=self.officer2)
        self.assertEqual(resp.status_code, 404)

    # ── link: full maker -> checker -> director path ─────────────────────────

    def test_link_full_flow_closes_both_sides_and_matches_line(self):
        resp = self.propose_link()
        self.assertEqual(resp.status_code, 201, resp.data)
        case_id = resp.data['id']

        # Nothing changes until the director approves
        self.erp_exc.refresh_from_db()
        self.assertFalse(self.erp_exc.resolved)

        self.assertEqual(self.recommend(case_id).status_code, 200)
        resp = self.approve(case_id)
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['status'], 'approved')

        self.erp_exc.refresh_from_db()
        self.bank_exc.refresh_from_db()
        self.tx.refresh_from_db()
        self.assertTrue(self.erp_exc.resolved and self.bank_exc.resolved)
        self.assertEqual(self.erp_exc.netted_with_id, self.bank_exc.pk)
        self.assertTrue(self.tx.matched)
        self.assertEqual(self.tx.matched_erp_payment_id, 501)

    def test_director_cannot_approve_before_branch_manager(self):
        case_id = self.propose_link().data['id']
        self.assertEqual(self.approve(case_id).status_code, 400)

    def test_separation_of_duties(self):
        # Proposer (a BM) can't review their own case
        case_id = self.propose_link(user=self.bm).data['id']
        self.assertEqual(self.recommend(case_id, user=self.bm).status_code, 400)
        # Reviewer can't also approve
        self.assertEqual(self.recommend(case_id, user=self.dir1).status_code, 200)
        self.assertEqual(self.approve(case_id, user=self.dir1).status_code, 400)
        self.assertEqual(self.approve(case_id, user=self.dir2).status_code, 200)

    def test_officer_who_posted_cannot_review_or_approve(self):
        case_id = self.propose_link(user=self.bm).data['id']
        self.as_user(self.officer)
        resp = self.client.post(action_url(case_id, 'review'),
                                {'recommend': True, 'notes': 'Looks right to me.'}, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_link_to_already_matched_line_is_refused(self):
        self.tx.matched = True
        self.tx.matched_erp_payment_id = 999
        self.tx.save()
        resp = self.propose_link()
        self.assertEqual(resp.status_code, 400)
        self.assertIn('dispute', resp.data['detail'].lower())

    def test_amount_must_match_exactly(self):
        self.tx.amount = Decimal('4999.00')
        self.tx.save()
        self.assertEqual(self.propose_link().status_code, 400)

    def test_one_open_case_per_bank_line(self):
        other = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='erp_only', direction='CREDIT',
            loan_payment_id=502, erp_amount=Decimal('5000.00'), erp_date='2026-11-02', officer=self.officer2,
        )
        self.assertEqual(self.propose_link().status_code, 201)
        self.as_user(self.officer2)
        resp = self.client.post(CASES, {
            'erp_exception_id': other.pk, 'kind': 'link', 'bank_exception_id': self.bank_exc.pk,
            'reason': 'This one is mine actually.',
        }, format='multipart')
        self.assertEqual(resp.status_code, 400)

    # ── reject / dissolve ────────────────────────────────────────────────────

    def test_director_can_reject_recommended_case(self):
        case_id = self.propose_link().data['id']
        self.recommend(case_id)
        self.as_user(self.dir1)
        resp = self.client.post(action_url(case_id, 'reject'), {'reason': 'Narration is a different client.'}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['status'], 'rejected')
        self.erp_exc.refresh_from_db()
        self.assertFalse(self.erp_exc.resolved)

    def test_dissolve_reopens_everything(self):
        case_id = self.propose_link().data['id']
        self.recommend(case_id)
        self.approve(case_id)
        self.as_user(self.dir2)
        resp = self.client.post(action_url(case_id, 'dissolve'), {'reason': 'Looks dubious on review.'}, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.erp_exc.refresh_from_db()
        self.bank_exc.refresh_from_db()
        self.tx.refresh_from_db()
        self.assertFalse(self.erp_exc.resolved or self.bank_exc.resolved)
        self.assertIsNone(self.erp_exc.netted_with_id)
        self.assertFalse(self.tx.matched)

    def test_branch_manager_cannot_dissolve(self):
        case_id = self.propose_link().data['id']
        self.recommend(case_id)
        self.approve(case_id)
        self.as_user(self.bm2)
        resp = self.client.post(action_url(case_id, 'dissolve'), {'reason': 'Trying to undo this one.'}, format='json')
        self.assertEqual(resp.status_code, 400)

    # ── disputes ─────────────────────────────────────────────────────────────

    def _matched_line_held_by_officer2(self):
        tx = ReconciliationBankTransaction.objects.create(
            bank_account=self.account, bank_ref='REF-2', value_date='2026-11-02',
            direction='CREDIT', amount=Decimal('5000.00'), narration='TRF FROM ADEBAYO JOHN NIP 000123456789',
            matched=True, matched_erp_payment_id=888, matched_erp_officer=self.officer2,
            match_confidence='HIGH', matched_at=timezone.now(),
        )
        return tx

    def _propose_dispute(self, tx, payer_reference='0001-2345-6789', with_evidence=False):
        self.as_user(self.officer)
        data = {
            'erp_exception_id': self.erp_exc.pk, 'kind': 'dispute',
            'bank_transaction_id': str(tx.pk), 'reason': 'My client sent this, see the receipt reference.',
            'payer_reference': payer_reference,
        }
        if with_evidence:
            data['evidence'] = SimpleUploadedFile('receipt.png', b'\x89PNG fake', content_type='image/png')
        return self.client.post(CASES, data, format='multipart')

    def test_dispute_requires_receipt_reference_not_upload(self):
        tx = self._matched_line_held_by_officer2()
        resp = self._propose_dispute(tx, payer_reference='')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('reference', resp.data['detail'].lower())
        # No upload needed once the reference is given; dashes/spaces on the
        # receipt still match the bank line's formatting.
        resp = self._propose_dispute(tx)
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertTrue(resp.data['facts']['checks']['payer_reference_in_bank_line'])

    def test_dispute_reference_not_on_bank_line_is_flagged(self):
        tx = self._matched_line_held_by_officer2()
        resp = self._propose_dispute(tx, payer_reference='999999999')
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertFalse(resp.data['facts']['checks']['payer_reference_in_bank_line'])
        self.assertTrue(any('receipt' in f for f in resp.data['facts']['flags']))

    def test_dispute_waits_for_respondent_then_rematches(self):
        tx = self._matched_line_held_by_officer2()
        resp = self._propose_dispute(tx)
        self.assertEqual(resp.status_code, 201, resp.data)
        case_id = resp.data['id']
        self.assertEqual(resp.data['respondent_name'], 'officer2')

        self.recommend(case_id)
        # Blocked: respondent hasn't answered and 24h haven't passed
        self.assertEqual(self.approve(case_id).status_code, 400)

        self.as_user(self.officer2)
        resp = self.client.post(action_url(case_id, 'respond'),
                                {'response': 'Not mine, I matched it by mistake.'}, format='json')
        self.assertEqual(resp.status_code, 200)

        resp = self.approve(case_id)
        self.assertEqual(resp.status_code, 200, resp.data)
        tx.refresh_from_db()
        self.assertTrue(tx.matched)
        self.assertEqual(tx.matched_erp_payment_id, 501)
        # The displaced payment is back on the list as "Recorded, not in bank"
        self.assertTrue(ReconciliationException.objects.filter(
            exception_type='erp_only', loan_payment_id=888, resolved=False,
        ).exists())

    def test_dispute_approvable_after_24h_without_response(self):
        tx = self._matched_line_held_by_officer2()
        case_id = self._propose_dispute(tx).data['id']
        self.recommend(case_id)
        Case.objects.filter(pk=case_id).update(proposed_at=timezone.now() - timedelta(hours=25))
        self.assertEqual(self.approve(case_id).status_code, 200)

    # ── bulk approve ─────────────────────────────────────────────────────────

    def test_bulk_approve_skips_disputes(self):
        link_id = self.propose_link(user=self.bm).data['id']
        self.recommend(link_id, user=self.bm2)

        other_erp = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='erp_only', direction='CREDIT',
            loan_payment_id=503, erp_amount=Decimal('5000.00'), erp_date='2026-11-02',
            erp_narration='Loan repayment ADEBAYO JOHN', officer=self.officer,
        )
        tx = self._matched_line_held_by_officer2()
        self.as_user(self.officer)
        dispute = self.client.post(CASES, {
            'erp_exception_id': other_erp.pk, 'kind': 'dispute', 'bank_transaction_id': str(tx.pk),
            'reason': 'Receipt reference given for this transfer.',
            'payer_reference': '000123456789',
            'evidence': SimpleUploadedFile('r.png', b'\x89PNG', content_type='image/png'),
        }, format='multipart')
        self.assertEqual(dispute.status_code, 201, dispute.data)
        self.recommend(dispute.data['id'], user=self.bm2)

        self.as_user(self.dir1)
        resp = self.client.post(f'{CASES}bulk-approve/', {
            'ids': [link_id, dispute.data['id']], 'notes': 'Bulk approving clean cases.',
        }, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)
        skipped = {s['id'] for s in resp.data['skipped']}
        self.assertIn(dispute.data['id'], skipped)
        self.assertEqual(Case.objects.get(pk=dispute.data['id']).status, Case.RECOMMENDED)

    # ── old fast lane ────────────────────────────────────────────────────────

    def test_old_link_resolve_now_needs_second_director(self):
        self.as_user(self.dir1)
        with patch('banks.views.can_user_approve', return_value=True):
            resp = self.client.post('/api/banks/exceptions/link-resolve/', {
                'exception_a_id': self.erp_exc.pk, 'exception_b_id': self.bank_exc.pk,
                'resolution_notes': 'Same transfer, linking these.',
            }, format='json')
        self.assertEqual(resp.status_code, 202, resp.data)
        self.erp_exc.refresh_from_db()
        self.assertFalse(self.erp_exc.resolved)
        case_id = resp.data['resolution_case']['id']
        self.assertEqual(self.approve(case_id, user=self.dir1).status_code, 400)
        self.assertEqual(self.approve(case_id, user=self.dir2).status_code, 200)

    # ── candidates ───────────────────────────────────────────────────────────

    def test_candidates_split_unmatched_and_matched(self):
        tx2 = self._matched_line_held_by_officer2()
        self.as_user(self.officer)
        resp = self.client.get(f'{PENDING}{self.erp_exc.pk}/candidates/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual([r['bank_transaction_id'] for r in resp.data['unmatched']], [str(self.tx.pk)])
        self.assertEqual([r['bank_transaction_id'] for r in resp.data['matched']], [str(tx2.pk)])
        # who holds the matched line is not revealed
        self.assertNotIn('officer_name', resp.data['matched'][0])

    # ── cross-branch: payment posted into another branch's bank account ─────

    def test_branch_sees_its_payment_posted_into_another_branchs_account(self):
        from transactions.models import Transaction, TransactionSeries

        other_branch = Branch.objects.create(name='Branch Other', code='RSO', tenant=self.tenant)
        other_bm = User.objects.create_user(username='bm_other', password='x', tenant=self.tenant, branch=other_branch)
        series = TransactionSeries.objects.create(code='LNPMT', description='Loan payments')
        # Repayment for an OTHER-branch loan, posted into Branch R's bank account
        payment = Transaction.objects.create(
            series=series, description='Loan repayment - LN-9 | Ref: X', owner=self.bm,
            branch=other_branch, created_by=other_bm, approved=True,
        )
        exc = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='erp_only', direction='CREDIT',
            loan_payment_id=payment.pk, erp_amount=Decimal('700.00'), erp_date='2026-11-02', officer=other_bm,
        )
        with patch('banks.resolution_service.is_recon_manager', return_value=True):
            self.as_user(other_bm)
            rows = self.client.get(PENDING, {'kind': 'erp_only'}).data['results']
        row = next(r for r in rows if r['id'] == exc.pk)
        self.assertEqual(row['branch_name'], 'Branch Other')
        self.assertEqual(row['bank_account_branch_name'], 'Branch R')

    def test_posting_into_another_branchs_bank_account_is_refused(self):
        from django.core.exceptions import ValidationError as DjangoValidationError
        from cash_management.services.payment_routing import PaymentRoutingService

        other_branch = Branch.objects.create(name='Branch Other', code='RSX', tenant=self.tenant)
        self.account.branch = self.branch
        self.account.save(update_fields=['branch'])
        with self.assertRaises(DjangoValidationError) as ctx:
            PaymentRoutingService.resolve_bank_gl_account(self.account.pk, branch=other_branch)
        self.assertIn('belongs to Branch R', ' '.join(ctx.exception.messages))
        # Own branch is fine
        self.assertEqual(
            PaymentRoutingService.resolve_bank_gl_account(self.account.pk, branch=self.branch),
            self.account.gl_account,
        )
