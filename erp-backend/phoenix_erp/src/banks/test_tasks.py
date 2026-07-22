"""
Tests for banks/tasks.py's run_reconciliation_match.

Since it's decorated with @shared_task, it's directly callable as a plain
function (bypassing .delay()/the broker entirely) — no live Celery worker
or broker connection needed to test the task body.
"""
from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import MagicMock, patch

import requests as real_requests
from celery.exceptions import Retry
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone

from accounts.models import Account
from branches.models import Branch
from banks.models import (
    Bank,
    BankAccount,
    DailyReconciliation,
    ReconciliationBankTransaction,
    ReconciliationException,
)
from banks.tasks import run_reconciliation_match
from transactions.models import Transaction, TransactionSeries

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
    def test_medium_confidence_match_is_not_auto_committed(self, mock_post, mock_fetch):
        # A MEDIUM (or LOW/blank) confidence guess from Java must never be
        # silently trusted as a confirmed match — see AUTO_MATCH_MIN_CONFIDENCE
        # (banks/tasks.py). It should instead surface as an ordinary
        # bank_only/erp_only exception pair for a director to confirm.
        mock_post.return_value = self._mock_java_response({
            'matchedCount': 0,
            'unmatchedBankCount': 1,
            'unmatchedErpCount': 1,
            'matches': [
                {'bankTransactionId': str(self.tx.id), 'erpPaymentId': 101,
                 'confidence': 'MEDIUM', 'direction': 'CREDIT'},
            ],
            'exceptions': [],
        })

        run_reconciliation_match(self.recon.id, include_debits=False)

        self.recon.refresh_from_db()
        self.tx.refresh_from_db()
        self.assertEqual(self.recon.status, 'completed')
        self.assertEqual(self.recon.matched_count, 0)
        self.assertFalse(self.tx.matched)
        self.assertIsNone(self.tx.matched_erp_payment_id)
        self.assertIsNone(self.tx.matched_at)

        bank_exc = ReconciliationException.objects.get(
            reconciliation=self.recon, exception_type='bank_only', bank_transaction_id=self.tx.id,
        )
        self.assertFalse(bank_exc.resolved)
        self.assertTrue(bank_exc.is_high_priority)

        erp_exc = ReconciliationException.objects.get(
            reconciliation=self.recon, exception_type='erp_only', loan_payment_id=101,
        )
        self.assertFalse(erp_exc.resolved)

    @patch('banks.reconciliation_utils.fetch_erp_payments', return_value=[])
    @patch('banks.tasks.http_requests.post')
    def test_high_confidence_match_with_no_erp_payment_id_is_not_committed(self, mock_post, mock_fetch):
        # Found in production: a "matched=True, matched_erp_payment_id=NULL"
        # row — matched to literally nothing — came from Java reporting a
        # HIGH-confidence match entry with no erpPaymentId at all, which
        # _persist_outcome used to commit blindly. Must never set
        # matched=True without a real payment id attached.
        mock_post.return_value = self._mock_java_response({
            'matchedCount': 0, 'unmatchedBankCount': 1, 'unmatchedErpCount': 0,
            'matches': [
                {'bankTransactionId': str(self.tx.id), 'erpPaymentId': None,
                 'confidence': 'HIGH', 'direction': 'CREDIT'},
            ],
            'exceptions': [],
        })

        with self.assertLogs('banks.tasks', level='WARNING'):
            run_reconciliation_match(self.recon.id, include_debits=False)

        self.tx.refresh_from_db()
        self.assertFalse(self.tx.matched)
        self.assertIsNone(self.tx.matched_erp_payment_id)
        self.assertIsNone(self.tx.matched_at)

        bank_exc = ReconciliationException.objects.get(
            reconciliation=self.recon, exception_type='bank_only', bank_transaction_id=self.tx.id,
        )
        self.assertFalse(bank_exc.resolved)
        # No erp_only exception should exist — there's no payment id to tie one to.
        self.assertFalse(
            ReconciliationException.objects.filter(exception_type='erp_only').exists()
        )

    @patch('banks.reconciliation_utils.fetch_erp_payments', return_value=[])
    @patch('banks.tasks.http_requests.post')
    def test_mixed_confidence_only_high_ones_committed(self, mock_post, mock_fetch):
        low_tx = ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='REF2', value_date='2026-07-01',
            direction='CREDIT', amount=Decimal('7000.00'), narration='Test credit 2',
        )
        mock_post.return_value = self._mock_java_response({
            'matchedCount': 1, 'unmatchedBankCount': 1, 'unmatchedErpCount': 0,
            'matches': [
                {'bankTransactionId': str(self.tx.id), 'erpPaymentId': 101,
                 'confidence': 'HIGH', 'direction': 'CREDIT'},
                {'bankTransactionId': str(low_tx.id), 'erpPaymentId': 202,
                 'confidence': 'LOW', 'direction': 'CREDIT'},
            ],
            'exceptions': [],
        })

        run_reconciliation_match(self.recon.id, include_debits=False)

        self.tx.refresh_from_db()
        low_tx.refresh_from_db()
        self.assertTrue(self.tx.matched)
        self.assertEqual(self.tx.matched_erp_payment_id, 101)
        self.assertFalse(low_tx.matched)
        self.assertIsNone(low_tx.matched_erp_payment_id)

        self.recon.refresh_from_db()
        self.assertEqual(self.recon.matched_count, 1)
        self.assertEqual(self.recon.unmatched_bank_count, 1)

    @patch('banks.reconciliation_utils.fetch_erp_payments')
    @patch('banks.tasks.http_requests.post')
    def test_match_captures_officer_reference_compliance_and_posting_lag(self, mock_post, mock_fetch):
        # self.tx.value_date is 2026-07-01 (see setUp); the ERP payment
        # below claims 2026-06-28 — the bank posted 3 days after the
        # officer recorded it, i.e. a 3-day late posting.
        branch = Branch.objects.create(name='Ikeja Branch', code='IKJ', owner=self.user)
        officer = User.objects.create_user(username='lag_officer', password='test123', branch=branch)
        series = TransactionSeries.objects.create(code='LN', description='Loan series')
        txn = Transaction.objects.create(
            series=series, date=date(2026, 6, 28),
            description='Loan repayment – LN-2026-777 | Ref: FBN123456',
            owner=self.user, branch=branch, created_by=officer,
        )

        mock_fetch.return_value = [{
            'paymentId': txn.id, 'amount': '5000.00',
            'narration': txn.description, 'paymentDate': '2026-06-28',
            'officerName': 'Lag Officer', 'loanNumber': 'LN-2026-777',
            'bankReference': 'FBN123456',
        }]
        mock_post.return_value = self._mock_java_response({
            'matchedCount': 1, 'unmatchedBankCount': 0, 'unmatchedErpCount': 0,
            'matches': [
                {'bankTransactionId': str(self.tx.id), 'erpPaymentId': txn.id,
                 'confidence': 'HIGH', 'direction': 'CREDIT'},
            ],
            'exceptions': [],
        })

        run_reconciliation_match(self.recon.id, include_debits=False)

        self.tx.refresh_from_db()
        self.assertEqual(self.tx.matched_erp_officer_id, officer.id)
        self.assertTrue(self.tx.matched_erp_had_reference)
        self.assertEqual(self.tx.posting_lag_days, 3)

    @patch('banks.reconciliation_utils.fetch_erp_payments')
    @patch('banks.tasks.http_requests.post')
    def test_match_with_no_bank_reference_recorded_as_noncompliant(self, mock_post, mock_fetch):
        series = TransactionSeries.objects.create(code='LN', description='Loan series')
        txn = Transaction.objects.create(
            series=series, date=date(2026, 7, 1),
            description='Loan repayment – LN-2026-778',  # no "| Ref: ..." segment
            owner=self.user, created_by=self.user,
        )

        mock_fetch.return_value = [{
            'paymentId': txn.id, 'amount': '5000.00',
            'narration': txn.description, 'paymentDate': '2026-07-01',
            'officerName': '', 'loanNumber': 'LN-2026-778', 'bankReference': None,
        }]
        mock_post.return_value = self._mock_java_response({
            'matchedCount': 1, 'unmatchedBankCount': 0, 'unmatchedErpCount': 0,
            'matches': [
                {'bankTransactionId': str(self.tx.id), 'erpPaymentId': txn.id,
                 'confidence': 'HIGH', 'direction': 'CREDIT'},
            ],
            'exceptions': [],
        })

        run_reconciliation_match(self.recon.id, include_debits=False)

        self.tx.refresh_from_db()
        self.assertFalse(self.tx.matched_erp_had_reference)
        self.assertEqual(self.tx.posting_lag_days, 0)

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
                    'erpDate': '2026-07-01',
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
    def test_timeout_retries_once_before_marking_failed(self, mock_post, mock_fetch):
        # A cold Java pod restart can cause one genuine timeout before the
        # JVM warms up, so the first timeout must retry rather than fail
        # outright — same called-directly reasoning as the connection-error
        # test above: no live worker/broker here, so retry() raises Retry
        # locally instead of actually scheduling anything.
        mock_post.side_effect = real_requests.exceptions.Timeout()

        with self.assertRaises(Retry):
            run_reconciliation_match(self.recon.id, include_debits=False)

        self.recon.refresh_from_db()
        self.assertEqual(self.recon.status, 'processing')

    @patch('banks.reconciliation_utils.fetch_erp_payments', return_value=[])
    @patch('banks.tasks.http_requests.post')
    def test_timeout_marks_failed_after_retry_exhausted(self, mock_post, mock_fetch):
        mock_post.side_effect = real_requests.exceptions.Timeout()

        run_reconciliation_match.push_request(retries=1)
        try:
            run_reconciliation_match(self.recon.id, include_debits=False)
        finally:
            run_reconciliation_match.pop_request()

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

    @patch('banks.tasks._persist_outcome')
    @patch('banks.reconciliation_utils.fetch_erp_payments', return_value=[])
    @patch('banks.tasks.http_requests.post')
    def test_unexpected_error_after_java_response_retries_then_marks_failed(
        self, mock_post, mock_fetch, mock_persist,
    ):
        # Regression test: a genuinely unexpected error while persisting
        # the outcome (e.g. database contention from several same-account
        # tasks with heavily overlapping ±7-day windows touching the same
        # rows concurrently) must never leave the row silently stuck at
        # 'processing' forever — that happened in production with no error
        # anywhere to explain it. Calling the task directly (bypassing
        # .delay()) means self.retry() re-raises the original exception
        # rather than a clean Retry — see
        # test_connection_error_triggers_retry_not_immediate_failure for
        # the same documented behavior on the existing RequestException path.
        mock_post.return_value = self._mock_java_response({
            'matchedCount': 0, 'unmatchedBankCount': 0, 'unmatchedErpCount': 0,
            'matches': [], 'exceptions': [],
        })
        mock_persist.side_effect = RuntimeError('simulated database contention')

        with self.assertRaises((Retry, RuntimeError)):
            run_reconciliation_match(self.recon.id, include_debits=False)

        self.recon.refresh_from_db()
        self.assertEqual(self.recon.status, 'processing')

    @patch('banks.reconciliation_utils.fetch_erp_payments', return_value=[])
    @patch('banks.tasks.http_requests.post')
    def test_candidate_pool_widened_to_configured_window(self, mock_post, mock_fetch):
        # A bank transaction 5 days after reconciliation_date must still be
        # offered to the matcher — postings lag, a reconciled day is never
        # really "closed."
        late_tx = ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account,
            bank_ref='REF-LATE',
            value_date='2026-07-06',
            direction='CREDIT',
            amount=Decimal('1200.00'),
            narration='Late-posted credit',
        )
        # Outside the (default 7-day) window entirely — must NOT be offered.
        far_tx = ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account,
            bank_ref='REF-FAR',
            value_date='2026-08-01',
            direction='CREDIT',
            amount=Decimal('999.00'),
            narration='Unrelated later credit',
        )
        mock_post.return_value = self._mock_java_response({
            'matchedCount': 0, 'unmatchedBankCount': 0, 'unmatchedErpCount': 0,
            'matches': [], 'exceptions': [],
        })

        run_reconciliation_match(self.recon.id, include_debits=False)

        sent_payload = mock_post.call_args.kwargs['json']
        sent_ids = {tx['id'] for tx in sent_payload['bankTransactions']}
        self.assertIn(str(late_tx.id), sent_ids)
        self.assertNotIn(str(far_tx.id), sent_ids)

        # fetch_erp_payments must be called with a range, not a single date.
        fetch_call = mock_fetch.call_args
        self.assertEqual(fetch_call.kwargs.get('direction') or fetch_call.args[3], 'CREDIT')

    @patch('banks.reconciliation_utils.fetch_erp_payments', return_value=[])
    @patch('banks.tasks.http_requests.post')
    def test_rerun_does_not_duplicate_unresolved_exception(self, mock_post, mock_fetch):
        response = self._mock_java_response({
            'matchedCount': 0, 'unmatchedBankCount': 1, 'unmatchedErpCount': 0,
            'matches': [], 'exceptions': [
                {
                    'exceptionType': 'bank_only', 'direction': 'CREDIT',
                    'bankTransactionId': str(self.tx.id), 'bankAmount': '5000.00',
                    'bankNarration': 'Test credit', 'bankDate': '2026-07-01',
                },
            ],
        })
        mock_post.return_value = response

        run_reconciliation_match(self.recon.id, include_debits=False)
        self.assertEqual(
            ReconciliationException.objects.filter(reconciliation=self.recon).count(), 1
        )

        # Re-run — same Java response again (e.g. a manual re-run before
        # anything changed). Must not create a second row for the same
        # bank_transaction_id.
        self.recon.status = 'processing'
        self.recon.save(update_fields=['status'])
        run_reconciliation_match(self.recon.id, include_debits=False)

        self.assertEqual(
            ReconciliationException.objects.filter(reconciliation=self.recon).count(), 1
        )

    @patch('banks.reconciliation_utils.fetch_erp_payments', return_value=[])
    @patch('banks.tasks.http_requests.post')
    def test_rerun_does_not_duplicate_resolved_exception(self, mock_post, mock_fetch):
        # Regression test for the dedup bug: a director resolves a bank_only
        # exception whose bank line genuinely has no ERP counterpart (e.g. a
        # bank fee) — ReconciliationBankTransaction.matched never flips True
        # for that, so the line stays in every future rerun's candidate pool
        # and Java keeps reporting it as bank_only. Before the fix,
        # _persist_outcome's get_or_create dedup_filter included
        # resolved=False, so it could never find this already-resolved row
        # and created a fresh duplicate every single rerun.
        response = self._mock_java_response({
            'matchedCount': 0, 'unmatchedBankCount': 1, 'unmatchedErpCount': 0,
            'matches': [], 'exceptions': [
                {
                    'exceptionType': 'bank_only', 'direction': 'CREDIT',
                    'bankTransactionId': str(self.tx.id), 'bankAmount': '5000.00',
                    'bankNarration': 'Test credit', 'bankDate': '2026-07-01',
                },
            ],
        })
        mock_post.return_value = response

        run_reconciliation_match(self.recon.id, include_debits=False)
        exc = ReconciliationException.objects.get(reconciliation=self.recon)

        exc.resolved = True
        exc.resolved_at = timezone.now()
        exc.resolution_notes = 'Reviewed — this is a bank fee, no ERP entry needed.'
        exc.save(update_fields=['resolved', 'resolved_at', 'resolution_notes'])

        # Re-run — Java still can't match this line (it's genuinely a fee,
        # not a missed ERP entry) and reports it as bank_only again. Must
        # reuse the resolved row, not reopen it with a duplicate.
        self.recon.status = 'processing'
        self.recon.save(update_fields=['status'])
        run_reconciliation_match(self.recon.id, include_debits=False)

        self.assertEqual(
            ReconciliationException.objects.filter(reconciliation=self.recon).count(), 1
        )
        exc.refresh_from_db()
        self.assertTrue(exc.resolved)
        self.assertEqual(exc.resolution_notes, 'Reviewed — this is a bank fee, no ERP entry needed.')

    @patch('banks.reconciliation_utils.fetch_erp_payments', return_value=[])
    @patch('banks.tasks.http_requests.post')
    def test_stale_exception_auto_resolved_when_later_run_finds_match(self, mock_post, mock_fetch):
        # First run: no match yet, bank_only exception recorded.
        mock_post.return_value = self._mock_java_response({
            'matchedCount': 0, 'unmatchedBankCount': 1, 'unmatchedErpCount': 0,
            'matches': [], 'exceptions': [
                {
                    'exceptionType': 'bank_only', 'direction': 'CREDIT',
                    'bankTransactionId': str(self.tx.id), 'bankAmount': '5000.00',
                    'bankNarration': 'Test credit', 'bankDate': '2026-07-01',
                },
            ],
        })
        run_reconciliation_match(self.recon.id, include_debits=False)
        exc = ReconciliationException.objects.get(reconciliation=self.recon)
        self.assertFalse(exc.resolved)

        # Second run (e.g. a re-upload found the matching ERP payment):
        # the same bank transaction now matches.
        self.recon.status = 'processing'
        self.recon.save(update_fields=['status'])
        mock_post.return_value = self._mock_java_response({
            'matchedCount': 1, 'unmatchedBankCount': 0, 'unmatchedErpCount': 0,
            'matches': [
                {'bankTransactionId': str(self.tx.id), 'erpPaymentId': 999,
                 'confidence': 'HIGH', 'direction': 'CREDIT'},
            ],
            'exceptions': [],
        })
        run_reconciliation_match(self.recon.id, include_debits=False)

        exc.refresh_from_db()
        self.assertTrue(exc.resolved)
        self.assertIsNone(exc.resolved_by)
        self.assertIn('Auto-resolved', exc.resolution_notes)

    @patch('banks.reconciliation_utils.fetch_erp_payments', return_value=[])
    @patch('banks.tasks.http_requests.post')
    def test_erp_only_exception_never_left_open_for_an_already_matched_payment(self, mock_post, mock_fetch):
        # Reproduces the production race: a DIFFERENT reconciliation's run
        # (overlapping window) already matched this exact ERP payment to a
        # bank line before THIS run's Java response comes back — simulated
        # by matching self.tx to loan_payment_id=555 directly, then having
        # THIS run's outcome still report 555 as erp_only (Java worked off
        # this run's own, now-stale, exclude_payment_ids snapshot). The old
        # auto-resolve step only fired for exceptions that existed BEFORE a
        # match was found in the SAME run — it could never catch this.
        self.tx.matched = True
        self.tx.matched_erp_payment_id = 555
        self.tx.save(update_fields=['matched', 'matched_erp_payment_id'])

        mock_post.return_value = self._mock_java_response({
            'matchedCount': 0, 'unmatchedBankCount': 0, 'unmatchedErpCount': 1,
            'matches': [], 'exceptions': [
                {
                    'exceptionType': 'erp_only', 'direction': 'CREDIT',
                    'loanPaymentId': 555, 'erpAmount': '5000.00',
                    'erpNarration': 'Loan repayment LN-555', 'erpDate': '2026-07-01',
                },
            ],
        })
        run_reconciliation_match(self.recon.id, include_debits=False)

        exc = ReconciliationException.objects.get(reconciliation=self.recon, loan_payment_id=555)
        self.assertTrue(exc.resolved)
        self.assertIn('Auto-resolved', exc.resolution_notes)

    @patch('banks.reconciliation_utils.fetch_erp_payments', return_value=[])
    @patch('banks.tasks.http_requests.post')
    def test_bank_only_exception_never_left_open_for_an_already_matched_transaction(self, mock_post, mock_fetch):
        # Symmetric case: the bank line itself is already matched (by
        # another run) by the time this run's response still reports it as
        # bank_only.
        self.tx.matched = True
        self.tx.matched_erp_payment_id = 777
        self.tx.save(update_fields=['matched', 'matched_erp_payment_id'])

        mock_post.return_value = self._mock_java_response({
            'matchedCount': 0, 'unmatchedBankCount': 1, 'unmatchedErpCount': 0,
            'matches': [], 'exceptions': [
                {
                    'exceptionType': 'bank_only', 'direction': 'CREDIT',
                    'bankTransactionId': str(self.tx.id), 'bankAmount': '5000.00',
                    'bankNarration': 'Test credit', 'bankDate': '2026-07-01',
                },
            ],
        })
        run_reconciliation_match(self.recon.id, include_debits=False)

        exc = ReconciliationException.objects.get(
            reconciliation=self.recon, exception_type='bank_only', bank_transaction_id=self.tx.id,
        )
        self.assertTrue(exc.resolved)
        self.assertIn('Auto-resolved', exc.resolution_notes)

    @patch('banks.reconciliation_utils.fetch_erp_payments', return_value=[])
    @patch('banks.tasks.http_requests.post')
    def test_unmatched_bank_count_reflects_resolved_exceptions_not_raw_transaction_flag(self, mock_post, mock_fetch):
        # Regression test: resolving a bank_only exception (by a director,
        # or via auto-resolve) never flips ReconciliationBankTransaction
        # .matched — the underlying transaction genuinely has no ERP
        # counterpart, "resolved" just means a director reviewed and
        # accepted that. Counting unmatched_bank_count from the raw
        # matched=False flag (the old behavior) left the summary count
        # permanently out of sync with what the exceptions list actually
        # shows once anything was resolved — exactly what happened in
        # production: the exceptions list showed 0 outstanding, but the
        # summary still reported 3.
        ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='bank_only', direction='CREDIT',
            bank_transaction_id=self.tx.id, bank_amount=self.tx.amount,
            bank_narration=self.tx.narration, bank_date=self.tx.value_date,
            resolved=True, resolved_at=timezone.now(),
            resolution_notes='Reviewed and confirmed legitimate.',
        )

        mock_post.return_value = self._mock_java_response({
            'matchedCount': 0, 'unmatchedBankCount': 0, 'unmatchedErpCount': 0,
            'matches': [], 'exceptions': [],
        })
        run_reconciliation_match(self.recon.id, include_debits=False)

        self.recon.refresh_from_db()
        self.tx.refresh_from_db()
        self.assertFalse(self.tx.matched)
        self.assertEqual(self.recon.unmatched_bank_count, 0)

    @patch('banks.reconciliation_utils.fetch_erp_payments', return_value=[])
    @patch('banks.tasks.http_requests.post')
    def test_exception_for_neighboring_date_without_reconciliation_is_skipped(self, mock_post, mock_fetch):
        # Java's windowed response can include an exception whose own date
        # differs from reconciliation_date — it must only be persisted if a
        # DailyReconciliation already exists for THAT date.
        mock_post.return_value = self._mock_java_response({
            'matchedCount': 0, 'unmatchedBankCount': 0, 'unmatchedErpCount': 1,
            'matches': [], 'exceptions': [
                {
                    'exceptionType': 'erp_only', 'direction': 'CREDIT',
                    'loanPaymentId': 77, 'erpAmount': '4300.00',
                    'erpNarration': 'Loan repayment LN-777', 'erpDate': '2026-07-06',
                },
            ],
        })
        run_reconciliation_match(self.recon.id, include_debits=False)

        self.assertEqual(ReconciliationException.objects.count(), 0)

    @patch('banks.reconciliation_utils.fetch_erp_payments', return_value=[])
    @patch('banks.tasks.http_requests.post')
    def test_exception_for_neighboring_date_with_reconciliation_is_attached_there(self, mock_post, mock_fetch):
        neighbor = DailyReconciliation.objects.create(
            bank_account=self.bank_account,
            reconciliation_date='2026-07-06',
            uploaded_by=self.user,
            statement_file='bank_statements/test2.csv',
            status='completed',
        )
        mock_post.return_value = self._mock_java_response({
            'matchedCount': 0, 'unmatchedBankCount': 0, 'unmatchedErpCount': 1,
            'matches': [], 'exceptions': [
                {
                    'exceptionType': 'erp_only', 'direction': 'CREDIT',
                    'loanPaymentId': 78, 'erpAmount': '4300.00',
                    'erpNarration': 'Loan repayment LN-778', 'erpDate': '2026-07-06',
                },
            ],
        })
        run_reconciliation_match(self.recon.id, include_debits=False)

        exc = ReconciliationException.objects.get()
        self.assertEqual(exc.reconciliation_id, neighbor.id)
        neighbor.refresh_from_db()
        self.assertEqual(neighbor.unmatched_erp_count, 1)
        # The task's OWN reconciliation still completes normally.
        self.recon.refresh_from_db()
        self.assertEqual(self.recon.status, 'completed')

    @patch('banks.reconciliation_utils.fetch_erp_payments', return_value=[])
    @patch('banks.tasks.http_requests.post')
    def test_bank_only_and_erp_only_exceptions_both_marked_high_priority(self, mock_post, mock_fetch):
        mock_post.return_value = self._mock_java_response({
            'matchedCount': 0, 'unmatchedBankCount': 1, 'unmatchedErpCount': 1,
            'matches': [], 'exceptions': [
                {
                    'exceptionType': 'bank_only', 'direction': 'CREDIT',
                    'bankTransactionId': str(self.tx.id), 'bankAmount': '5000.00',
                    'bankNarration': 'Test credit', 'bankDate': '2026-07-01',
                },
                {
                    'exceptionType': 'erp_only', 'direction': 'CREDIT',
                    'loanPaymentId': 55, 'erpAmount': '999.00',
                    'erpNarration': 'Loan repayment LN-555', 'erpDate': '2026-07-01',
                },
            ],
        })
        run_reconciliation_match(self.recon.id, include_debits=False)

        bank_only = ReconciliationException.objects.get(exception_type='bank_only')
        erp_only = ReconciliationException.objects.get(exception_type='erp_only')
        self.assertTrue(bank_only.is_high_priority)
        self.assertTrue(erp_only.is_high_priority)

    @patch('banks.reconciliation_utils.fetch_erp_payments', return_value=[])
    @patch('banks.tasks.http_requests.post')
    def test_officer_and_branch_derived_from_erp_transaction(self, mock_post, mock_fetch):
        branch = Branch.objects.create(name='Ikeja Branch', code='IKJ', owner=self.user)
        officer = User.objects.create_user(username='officer1', password='test123', branch=branch)
        series = TransactionSeries.objects.create(code='LN', description='Loan series')
        txn = Transaction.objects.create(
            series=series, date=timezone.now().date(),
            description='Loan repayment – LN-2026-001', owner=self.user,
            branch=branch, created_by=officer,
        )

        mock_post.return_value = self._mock_java_response({
            'matchedCount': 0, 'unmatchedBankCount': 0, 'unmatchedErpCount': 1,
            'matches': [], 'exceptions': [
                {
                    'exceptionType': 'erp_only', 'direction': 'CREDIT',
                    'loanPaymentId': txn.id, 'erpAmount': '5000.00',
                    'erpNarration': 'Loan repayment LN-2026-001', 'erpDate': '2026-07-01',
                },
            ],
        })
        run_reconciliation_match(self.recon.id, include_debits=False)

        exc = ReconciliationException.objects.get()
        self.assertEqual(exc.officer_id, officer.id)
        self.assertEqual(exc.erp_branch_id, branch.id)

    @patch('notifications.services.NotificationService')
    @patch('common.approval_permissions.APPROVER_ROLES', ('Director',))
    @patch('banks.reconciliation_utils.fetch_erp_payments', return_value=[])
    @patch('banks.tasks.http_requests.post')
    def test_bank_only_exception_notifies_directors(self, mock_post, mock_fetch, mock_notify_cls):
        from users.models import Role, Tenant

        tenant = Tenant.objects.create(name='Test Tenant', slug='test-tenant')
        self.user.tenant = tenant
        self.user.save(update_fields=['tenant'])

        branch = Branch.objects.create(name='Ikeja Branch', code='IKJ2', owner=self.user)
        role = Role.objects.create(tenant=tenant, name='Director', is_active=True)
        director = User.objects.create_user(
            username='director1', password='test123', tenant=tenant, branch=branch,
        )
        director.roles.add(role)
        self.recon.owner = self.user
        self.recon.branch = branch
        self.recon.save(update_fields=['owner', 'branch'])

        mock_post.return_value = self._mock_java_response({
            'matchedCount': 0, 'unmatchedBankCount': 1, 'unmatchedErpCount': 0,
            'matches': [], 'exceptions': [
                {
                    'exceptionType': 'bank_only', 'direction': 'CREDIT',
                    'bankTransactionId': str(self.tx.id), 'bankAmount': '5000.00',
                    'bankNarration': 'Test credit', 'bankDate': '2026-07-01',
                },
            ],
        })
        run_reconciliation_match(self.recon.id, include_debits=False)

        mock_notify_cls.return_value.send_from_template.assert_called_once()
        call_kwargs = mock_notify_cls.return_value.send_from_template.call_args.kwargs
        self.assertEqual(call_kwargs['template_code'], 'bank_recon_bank_only_exception')
        self.assertEqual(call_kwargs['recipient'], director)

    @patch('common.approval_permissions.APPROVER_ROLES', ('Director',))
    @patch('banks.reconciliation_utils.fetch_erp_payments', return_value=[])
    @patch('banks.tasks.http_requests.post')
    def test_bank_only_exception_notification_actually_renders(self, mock_post, mock_fetch):
        # Regression test for a real production bug: the previous test
        # mocks NotificationService entirely, so it never exercised
        # NotificationTemplate.validate_variables()/_prepare_context() —
        # which resolve every template_variables entry via its 'source'
        # dotted path (e.g. 'exception.bank_amount'), not the flat context
        # key names. A flat, pre-stringified context (the original,
        # incorrect version of this code) silently failed validation on
        # every single bank_only exception with "Missing required
        # variables: ['amount', 'date']" — caught by the try/except so it
        # never crashed the reconciliation, but meant zero notifications
        # ever actually got created. This uses the real seeding command and
        # real NotificationService call to prove a Notification row is
        # actually created, not just that send_from_template was called.
        from django.core.management import call_command
        from notifications.models import NotificationChannel, Notification
        from users.models import Role, Tenant

        # NotificationTemplate.objects also goes through OwnerBranchManager,
        # whose get_queryset() filters by common.managers.get_current_tenant()
        # — a thread-local set by request middleware. In the real Celery-task
        # environment this code actually runs in, no middleware ever ran, so
        # it's reliably None and the filter is correctly skipped. But
        # threading.local() state isn't reset between test methods the way
        # the DB transaction is, so a stale value leaked from an earlier
        # test can otherwise make this template lookup miss. Force the same
        # clean baseline the real environment always has.
        from common.managers import set_current_tenant
        set_current_tenant(None)

        tenant = Tenant.objects.create(name='Notify Test Tenant', slug='notify-test-tenant')
        self.user.tenant = tenant
        self.user.save(update_fields=['tenant'])

        branch = Branch.objects.create(name='Ikeja Branch', code='IKJ3', owner=self.user)
        role = Role.objects.create(tenant=tenant, name='Director', is_active=True)
        director = User.objects.create_user(
            username='director2', password='test123', tenant=tenant, branch=branch,
        )
        director.roles.add(role)
        self.recon.owner = self.user
        self.recon.branch = branch
        self.recon.save(update_fields=['owner', 'branch'])

        # create_notification_templates seeds every template in the fixture,
        # not just this one — all 5 channels the fixture references need to
        # exist first, or it crashes on the first template that needs one
        # we didn't create.
        for code in ('sms', 'email', 'whatsapp', 'push', 'in_app'):
            NotificationChannel.objects.get_or_create(
                code=code, defaults={'name': code, 'provider': 'internal'},
            )
        call_command('create_notification_templates', branch_id=branch.id, owner_id=self.user.id)

        mock_post.return_value = self._mock_java_response({
            'matchedCount': 0, 'unmatchedBankCount': 1, 'unmatchedErpCount': 0,
            'matches': [], 'exceptions': [
                {
                    'exceptionType': 'bank_only', 'direction': 'CREDIT',
                    'bankTransactionId': str(self.tx.id), 'bankAmount': '5000.00',
                    'bankNarration': 'Test credit', 'bankDate': '2026-07-01',
                },
            ],
        })
        run_reconciliation_match(self.recon.id, include_debits=False)

        notifications = Notification.objects.filter(recipient_user=director)
        self.assertEqual(notifications.count(), 2)  # in_app + email
        body = notifications.first().message
        self.assertIn('5,000.00', body)  # currency-formatted amount actually rendered
        self.assertNotIn('{{', body)  # no unresolved placeholders left in the output
        # Regression check for the raw-context/declared-variable name
        # collision this same rewrite fixed: {{branch}} previously
        # rendered as a literal Python dict repr because context['branch']
        # (a raw dict) silently overwrote the resolved 'branch' variable
        # in _prepare_context()'s prepared.update(context).
        self.assertIn('Ikeja Branch', body)
        self.assertNotIn("{'name'", body)

    @patch('common.approval_permissions.APPROVER_ROLES', ('Director',))
    @patch('banks.reconciliation_utils.fetch_erp_payments', return_value=[])
    @patch('banks.tasks.http_requests.post')
    def test_erp_only_exception_is_also_high_priority_and_notifies(self, mock_post, mock_fetch):
        # erp_only ("recorded as paid but never actually banked") is at
        # least as serious as bank_only for cash accountability — both must
        # get the same is_high_priority flag and director notification.
        from django.core.management import call_command
        from notifications.models import NotificationChannel, Notification
        from users.models import Role, Tenant

        from common.managers import set_current_tenant
        set_current_tenant(None)

        tenant = Tenant.objects.create(name='Notify Test Tenant 2', slug='notify-test-tenant-2')
        self.user.tenant = tenant
        self.user.save(update_fields=['tenant'])

        branch = Branch.objects.create(name='Yaba Branch', code='YBA', owner=self.user)
        role = Role.objects.create(tenant=tenant, name='Director', is_active=True)
        director = User.objects.create_user(
            username='director3', password='test123', tenant=tenant, branch=branch,
        )
        director.roles.add(role)
        self.recon.owner = self.user
        self.recon.branch = branch
        self.recon.save(update_fields=['owner', 'branch'])

        for code in ('sms', 'email', 'whatsapp', 'push', 'in_app'):
            NotificationChannel.objects.get_or_create(
                code=code, defaults={'name': code, 'provider': 'internal'},
            )
        call_command('create_notification_templates', branch_id=branch.id, owner_id=self.user.id)

        mock_post.return_value = self._mock_java_response({
            'matchedCount': 0, 'unmatchedBankCount': 0, 'unmatchedErpCount': 1,
            'matches': [], 'exceptions': [
                {
                    'exceptionType': 'erp_only', 'direction': 'CREDIT',
                    'loanPaymentId': 900, 'erpAmount': '7500.00',
                    'erpNarration': 'Loan repayment LN-900', 'erpDate': '2026-07-01',
                },
            ],
        })
        run_reconciliation_match(self.recon.id, include_debits=False)

        exc = ReconciliationException.objects.get(exception_type='erp_only')
        self.assertTrue(exc.is_high_priority)

        notifications = Notification.objects.filter(recipient_user=director)
        self.assertEqual(notifications.count(), 2)
        body = notifications.first().message
        self.assertIn('7,500.00', body)
        self.assertNotIn('{{', body)


class RequeueStuckReconciliationsTests(TestCase):
    """
    requeue_stuck_reconciliations is the backstop for a task getting lost
    when celery_worker's process disappears mid-flight (most commonly a
    deploy recreating the container while a just-uploaded statement's
    tasks are still being dispatched) — nothing inside run_reconciliation_
    match itself can catch that, since the process vanishes out from under
    it. This only re-queues rows stale enough that they can't just be
    legitimately still running.
    """

    def setUp(self):
        self.user = User.objects.create_user(username='manager2', password='test123')
        gl_account = Account.objects.create(
            code='1299', name='Watchdog Test GL', account_level=Account.LEVEL_PARENT
        )
        bank = Bank.objects.create(bank_name='Watchdog Test Bank', bank_code='997')
        self.bank_account = BankAccount.objects.create(
            bank=bank, account_number='0000003', account_name='Watchdog Test Account',
            gl_account=gl_account, account_manager=self.user,
        )

    def _make_recon(self, date_str, status, minutes_ago):
        recon = DailyReconciliation.objects.create(
            bank_account=self.bank_account, reconciliation_date=date_str,
            uploaded_by=self.user, statement_file='bank_statements/watchdog.csv',
            status=status,
        )
        stale_time = timezone.now() - timedelta(minutes=minutes_ago)
        DailyReconciliation.objects.filter(pk=recon.pk).update(updated_at=stale_time)
        recon.refresh_from_db()
        return recon

    @patch('banks.tasks.run_reconciliation_match.apply_async')
    def test_requeues_only_processing_rows_past_the_threshold(self, mock_apply_async):
        from banks.tasks import requeue_stuck_reconciliations

        genuinely_stuck = self._make_recon('2026-07-01', 'processing', minutes_ago=30)
        recently_queued = self._make_recon('2026-07-02', 'processing', minutes_ago=2)
        already_done = self._make_recon('2026-07-03', 'completed', minutes_ago=30)

        count = requeue_stuck_reconciliations()

        self.assertEqual(count, 1)
        mock_apply_async.assert_called_once_with(
            args=[genuinely_stuck.id, genuinely_stuck.include_debits], countdown=0,
        )
        called_ids = {call.kwargs['args'][0] for call in mock_apply_async.call_args_list}
        self.assertNotIn(recently_queued.id, called_ids)
        self.assertNotIn(already_done.id, called_ids)

    @patch('banks.tasks.run_reconciliation_match.apply_async')
    def test_noop_when_nothing_is_stuck(self, mock_apply_async):
        from banks.tasks import requeue_stuck_reconciliations

        self._make_recon('2026-07-01', 'completed', minutes_ago=60)
        self._make_recon('2026-07-02', 'processing', minutes_ago=1)

        count = requeue_stuck_reconciliations()

        self.assertEqual(count, 0)
        mock_apply_async.assert_not_called()


class EscalateAgingReconciliationExceptionsTests(TestCase):
    """
    escalate_aging_reconciliation_exceptions is the backstop that surfaces
    exceptions neglected past RECONCILIATION_EXCEPTION_AGING_DAYS — amount_diff
    exceptions never start high-priority, and anything simply left untouched
    otherwise has no mechanism to escalate on its own.
    """

    def setUp(self):
        self.user = User.objects.create_user(username='aging_manager', password='test123')
        gl_account = Account.objects.create(
            code='1599', name='Aging Test GL', account_level=Account.LEVEL_PARENT
        )
        bank = Bank.objects.create(bank_name='Aging Test Bank', bank_code='994')
        self.bank_account = BankAccount.objects.create(
            bank=bank, account_number='0000006', account_name='Aging Test Account',
            gl_account=gl_account, account_manager=self.user,
        )
        self.recon = DailyReconciliation.objects.create(
            bank_account=self.bank_account, reconciliation_date='2026-07-01',
            uploaded_by=self.user, statement_file='bank_statements/aging.csv',
            status='completed',
        )

    def _make_exception(self, days_old, resolved=False, is_high_priority=False, exception_type='amount_diff'):
        exc = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type=exception_type, direction='CREDIT',
            bank_amount=Decimal('1000.00'), bank_narration='test', bank_date='2026-07-01',
            erp_amount=Decimal('900.00') if exception_type == 'amount_diff' else None,
            resolved=resolved, is_high_priority=is_high_priority,
        )
        stale_time = timezone.now() - timedelta(days=days_old)
        ReconciliationException.objects.filter(pk=exc.pk).update(created_at=stale_time)
        exc.refresh_from_db()
        return exc

    def test_flags_unresolved_exception_older_than_threshold(self):
        from banks.tasks import escalate_aging_reconciliation_exceptions

        old_exc = self._make_exception(days_old=5)
        count = escalate_aging_reconciliation_exceptions()

        self.assertEqual(count, 1)
        old_exc.refresh_from_db()
        self.assertTrue(old_exc.is_high_priority)

    def test_does_not_flag_exception_within_threshold(self):
        from banks.tasks import escalate_aging_reconciliation_exceptions

        recent_exc = self._make_exception(days_old=1)
        count = escalate_aging_reconciliation_exceptions()

        self.assertEqual(count, 0)
        recent_exc.refresh_from_db()
        self.assertFalse(recent_exc.is_high_priority)

    def test_does_not_touch_resolved_exceptions(self):
        from banks.tasks import escalate_aging_reconciliation_exceptions

        resolved_exc = self._make_exception(days_old=10, resolved=True)
        count = escalate_aging_reconciliation_exceptions()

        self.assertEqual(count, 0)
        resolved_exc.refresh_from_db()
        self.assertFalse(resolved_exc.is_high_priority)

    def test_idempotent_does_not_recount_already_flagged(self):
        from banks.tasks import escalate_aging_reconciliation_exceptions

        self._make_exception(days_old=10, is_high_priority=True)
        count = escalate_aging_reconciliation_exceptions()

        self.assertEqual(count, 0)

    @override_settings(RECONCILIATION_EXCEPTION_AGING_DAYS=1)
    def test_respects_configured_threshold(self):
        from banks.tasks import escalate_aging_reconciliation_exceptions

        exc = self._make_exception(days_old=2)
        count = escalate_aging_reconciliation_exceptions()

        self.assertEqual(count, 1)
        exc.refresh_from_db()
        self.assertTrue(exc.is_high_priority)
