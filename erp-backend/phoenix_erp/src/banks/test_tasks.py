"""
Tests for banks/tasks.py's run_reconciliation_match.

Since it's decorated with @shared_task, it's directly callable as a plain
function (bypassing .delay()/the broker entirely) — no live Celery worker
or broker connection needed to test the task body.
"""
from datetime import timedelta
from decimal import Decimal
from unittest.mock import MagicMock, patch

import requests as real_requests
from celery.exceptions import Retry
from django.contrib.auth import get_user_model
from django.test import TestCase
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
    def test_bank_only_exception_marked_high_priority_erp_only_is_not(self, mock_post, mock_fetch):
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
        self.assertFalse(erp_only.is_high_priority)

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

    @patch('banks.tasks.run_reconciliation_match.delay')
    def test_requeues_only_processing_rows_past_the_threshold(self, mock_delay):
        from banks.tasks import requeue_stuck_reconciliations

        genuinely_stuck = self._make_recon('2026-07-01', 'processing', minutes_ago=30)
        recently_queued = self._make_recon('2026-07-02', 'processing', minutes_ago=2)
        already_done = self._make_recon('2026-07-03', 'completed', minutes_ago=30)

        count = requeue_stuck_reconciliations()

        self.assertEqual(count, 1)
        mock_delay.assert_called_once_with(genuinely_stuck.id, False)
        called_ids = {call.args[0] for call in mock_delay.call_args_list}
        self.assertNotIn(recently_queued.id, called_ids)
        self.assertNotIn(already_done.id, called_ids)

    @patch('banks.tasks.run_reconciliation_match.delay')
    def test_noop_when_nothing_is_stuck(self, mock_delay):
        from banks.tasks import requeue_stuck_reconciliations

        self._make_recon('2026-07-01', 'completed', minutes_ago=60)
        self._make_recon('2026-07-02', 'processing', minutes_ago=1)

        count = requeue_stuck_reconciliations()

        self.assertEqual(count, 0)
        mock_delay.assert_not_called()
