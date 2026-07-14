"""
Tests for banks/tasks.py's run_reconciliation_match.

Since it's decorated with @shared_task, it's directly callable as a plain
function (bypassing .delay()/the broker entirely) — no live Celery worker
or broker connection needed to test the task body.
"""
from decimal import Decimal
from unittest.mock import MagicMock, patch

import requests as real_requests
from celery.exceptions import Retry
from django.contrib.auth import get_user_model
from django.test import TestCase

from accounts.models import Account
from banks.models import (
    Bank,
    BankAccount,
    DailyReconciliation,
    ReconciliationBankTransaction,
    ReconciliationException,
)
from banks.tasks import run_reconciliation_match

User = get_user_model()


class RunReconciliationMatchTests(TestCase):

    def setUp(self):
        self.user = User.objects.create_user(username='manager1', password='test123')
        gl_account = Account.objects.create(
            code='1199', name='Test Bank GL', account_level=Account.LEVEL_PARENT
        )
        bank = Bank.objects.create(bank_name='Test Bank', bank_code='999')
        self.bank_account = BankAccount.objects.create(
            bank=bank,
            account_number='0000000001',
            account_name='Test Operating Account',
            gl_account=gl_account,
            account_manager=self.user,
        )
        self.recon = DailyReconciliation.objects.create(
            bank_account=self.bank_account,
            reconciliation_date='2026-07-01',
            uploaded_by=self.user,
            statement_file='bank_statements/test.csv',
            status='processing',
        )
        self.tx = ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account,
            bank_ref='REF1',
            value_date='2026-07-01',
            direction='CREDIT',
            amount=Decimal('5000.00'),
            narration='Test credit',
        )

    @staticmethod
    def _mock_java_response(payload):
        mock_response = MagicMock()
        mock_response.json.return_value = payload
        mock_response.raise_for_status = MagicMock()
        return mock_response

    @patch('banks.reconciliation_utils.fetch_erp_payments', return_value=[])
    @patch('banks.tasks.http_requests.post')
    def test_success_persists_matches(self, mock_post, mock_fetch):
        mock_post.return_value = self._mock_java_response({
            'matchedCount': 1,
            'unmatchedBankCount': 0,
            'unmatchedErpCount': 0,
            'matches': [
                {'bankTransactionId': str(self.tx.id), 'erpPaymentId': 101,
                 'confidence': 'HIGH', 'direction': 'CREDIT'},
            ],
            'exceptions': [],
        })

        run_reconciliation_match(self.recon.id, include_debits=False)

        self.recon.refresh_from_db()
        self.tx.refresh_from_db()
        self.assertEqual(self.recon.status, 'completed')
        self.assertEqual(self.recon.matched_count, 1)
        self.assertTrue(self.tx.matched)
        self.assertEqual(self.tx.match_confidence, 'HIGH')
        self.assertEqual(self.tx.matched_erp_payment_id, 101)
        self.assertIsNotNone(self.tx.matched_at)

    @patch('banks.reconciliation_utils.fetch_erp_payments', return_value=[])
    @patch('banks.tasks.http_requests.post')
    def test_exceptions_are_persisted(self, mock_post, mock_fetch):
        mock_post.return_value = self._mock_java_response({
            'matchedCount': 0,
            'unmatchedBankCount': 1,
            'unmatchedErpCount': 0,
            'matches': [],
            'exceptions': [
                {
                    'exceptionType': 'bank_only',
                    'direction': 'CREDIT',
                    'bankTransactionId': str(self.tx.id),
                    'bankAmount': '5000.00',
                    'bankNarration': 'Test credit',
                    'bankDate': '2026-07-01',
                },
            ],
        })

        run_reconciliation_match(self.recon.id, include_debits=False)

        self.recon.refresh_from_db()
        self.assertEqual(self.recon.status, 'completed')
        self.assertEqual(self.recon.unmatched_bank_count, 1)
        self.assertEqual(
            ReconciliationException.objects.filter(reconciliation=self.recon).count(), 1
        )

    @patch('banks.reconciliation_utils.fetch_erp_payments', return_value=[])
    @patch('banks.tasks.http_requests.post')
    def test_exceptions_with_explicit_null_opposite_side_are_persisted(self, mock_post, mock_fetch):
        # Java (Jackson) serializes unset fields as an explicit JSON null,
        # not an omitted key — e.g. an erp_only exception still includes
        # "bankNarration": null. dict.get(key, default) only falls back to
        # the default when the key is ABSENT, so this shape previously blew
        # up with a NOT NULL constraint violation on bank_narration/
        # erp_narration in production despite the "missing key" version of
        # this test (above) passing.
        mock_post.return_value = self._mock_java_response({
            'matchedCount': 0,
            'unmatchedBankCount': 0,
            'unmatchedErpCount': 1,
            'matches': [],
            'exceptions': [
                {
                    'exceptionType': 'erp_only',
                    'direction': 'CREDIT',
                    'bankTransactionId': None,
                    'bankAmount': None,
                    'bankNarration': None,
                    'bankDate': None,
                    'loanPaymentId': 42,
                    'erpAmount': '7850.00',
                    'erpNarration': 'Transfer: Suliat',
                    'erpDate': '2026-07-02',
                },
            ],
        })

        run_reconciliation_match(self.recon.id, include_debits=False)

        self.recon.refresh_from_db()
        self.assertEqual(self.recon.status, 'completed')
        exc = ReconciliationException.objects.get(reconciliation=self.recon)
        self.assertEqual(exc.exception_type, 'erp_only')
        self.assertEqual(exc.bank_narration, '')
        self.assertEqual(exc.erp_narration, 'Transfer: Suliat')

    @patch('banks.reconciliation_utils.fetch_erp_payments', return_value=[])
    @patch('banks.tasks.http_requests.post')
    def test_timeout_marks_failed_without_retry(self, mock_post, mock_fetch):
        mock_post.side_effect = real_requests.exceptions.Timeout()

        run_reconciliation_match(self.recon.id, include_debits=False)

        self.recon.refresh_from_db()
        self.assertEqual(self.recon.status, 'failed')
        self.assertIn('timed out', self.recon.error_detail)

    @patch('banks.reconciliation_utils.fetch_erp_payments', return_value=[])
    @patch('banks.tasks.http_requests.post')
    def test_connection_error_triggers_retry_not_immediate_failure(self, mock_post, mock_fetch):
        # Connection errors are more likely transient than a timeout, so the
        # task should ask Celery to retry rather than mark the reconciliation
        # failed on the first attempt — i.e. it must NOT fall through to the
        # "mark failed" branch below. Calling the task directly (bypassing
        # .delay()) means self.request.called_directly is True, under which
        # Celery's Task.retry() re-raises the original exception rather than
        # a clean Retry (there's no broker to actually push a retry onto) —
        # under a real worker this same call raises Retry instead. Either
        # way, the point under test is: the reconciliation is left
        # 'processing' rather than being marked 'failed' on this first error.
        mock_post.side_effect = real_requests.exceptions.ConnectionError()

        with self.assertRaises((Retry, real_requests.exceptions.ConnectionError)):
            run_reconciliation_match(self.recon.id, include_debits=False)

        self.recon.refresh_from_db()
        self.assertEqual(self.recon.status, 'processing')

    @patch('banks.reconciliation_utils.fetch_erp_payments', return_value=[])
    def test_skips_if_reconciliation_no_longer_processing(self, mock_fetch):
        self.recon.status = 'completed'
        self.recon.save(update_fields=['status'])

        with patch('banks.tasks.http_requests.post') as mock_post:
            run_reconciliation_match(self.recon.id, include_debits=False)
            mock_post.assert_not_called()
