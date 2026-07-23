"""
Tests for the repair_adjacent_day_match_cascade management command — repairs
ReconciliationBankTransaction rows the old (now-fixed) Java
ExactAmountDateMatcher scoring tie wrongly matched to an adjacent day's ERP
payment instead of their own day's, for a daily-recurring identical-amount
fee. See the command's own module docstring for the full bug/fix narrative.
"""
from datetime import date
from decimal import Decimal
from io import StringIO
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase

from accounts.models import Account
from banks.models import Bank, BankAccount, DailyReconciliation, ReconciliationBankTransaction
from branches.models import Branch
from transactions.models import Transaction, TransactionEntry, TransactionSeries
from users.models import Tenant

User = get_user_model()


class RepairAdjacentDayMatchCascadeTests(TestCase):

    def setUp(self):
        self.tenant = Tenant.objects.create(name='Cascade Repair Org', slug='cascade-repair-org')
        self.branch = Branch.objects.create(name='Branch A', code='CRA')
        self.director = User.objects.create_user(
            username='cascade_director', password='test123', tenant=self.tenant, branch=self.branch,
        )
        self.gl_account = Account.objects.create(
            code='1922', name='Cascade Repair GL', account_level=Account.LEVEL_PARENT, branch=self.branch,
        )
        bank = Bank.objects.create(bank_name='Cascade Repair Bank', bank_code='987')
        self.bank_account = BankAccount.objects.create(
            bank=bank, account_number='0000090', account_name='Cascade Repair Account',
            gl_account=self.gl_account, account_manager=self.director,
        )
        self.series = TransactionSeries.objects.create(code='EXP', description='Expense series')

    def _erp_payment(self, txn_date, amount, side=TransactionEntry.CREDIT):
        txn = Transaction.objects.create(
            series=self.series, date=txn_date, description='Stamp duty',
            owner=self.director, branch=self.branch, created_by=self.director,
        )
        TransactionEntry.objects.create(
            transaction=txn, account=self.gl_account, side=side, amount=amount,
        )
        return txn

    def _bank_tx(self, value_date, amount, direction='DEBIT', matched=False,
                 matched_erp_payment_id=None, posting_lag_days=None, bank_ref=None):
        return ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref=bank_ref or f'REF-{value_date}-{amount}',
            value_date=value_date, direction=direction, amount=amount, narration='Stamp duty',
            matched=matched, matched_erp_payment_id=matched_erp_payment_id,
            match_confidence='HIGH' if matched else '', posting_lag_days=posting_lag_days,
        )

    def test_detects_and_repairs_a_confirmed_cascade_victim(self):
        # ERP payment for 07-15's stamp duty wrongly matched to the 07-14
        # bank line; the true 07-14 bank line sits unmatched.
        erp = self._erp_payment(date(2026, 7, 15), Decimal('50.00'))
        wrong_tx = self._bank_tx(
            date(2026, 7, 14), Decimal('50.00'), matched=True,
            matched_erp_payment_id=erp.id, posting_lag_days=-1,
        )
        true_tx = self._bank_tx(date(2026, 7, 15), Decimal('50.00'))
        DailyReconciliation.objects.create(
            bank_account=self.bank_account, reconciliation_date=date(2026, 7, 14),
            uploaded_by=self.director, statement_file='bank_statements/x.csv',
            status='completed', owner=self.director, branch=self.branch, tenant=self.tenant,
        )

        out = StringIO()
        call_command('repair_adjacent_day_match_cascade', f'--user-id={self.director.id}', '--dry-run', stdout=out)
        self.assertIn(f'bank_tx id={wrong_tx.id}', out.getvalue())
        self.assertIn('Confirmed cascade victims', out.getvalue())

        wrong_tx.refresh_from_db()
        self.assertTrue(wrong_tx.matched)  # dry-run made no changes

        # The rerun is queued via .delay(), not called synchronously — Java
        # is only reachable from the celery_worker container, so the
        # command must never call the task directly regardless of which
        # container it happens to run in (a real production failure this
        # test guards against — see the command's own comment).
        recon = DailyReconciliation.objects.get(
            bank_account=self.bank_account, reconciliation_date=date(2026, 7, 14),
        )
        with patch('banks.tasks.run_pool_reconciliation_match') as mock_task:
            call_command('repair_adjacent_day_match_cascade', f'--user-id={self.director.id}', '--apply', stdout=StringIO())
            mock_task.delay.assert_called_once_with(recon.bank_account_id)

        wrong_tx.refresh_from_db()
        true_tx.refresh_from_db()
        recon.refresh_from_db()
        self.assertFalse(wrong_tx.matched)
        self.assertEqual(wrong_tx.unmatched_by_id, self.director.id)
        self.assertTrue(wrong_tx.unmatched_reason)
        self.assertEqual(recon.status, 'processing')

    def test_recovers_and_queues_reruns_for_rows_unmatched_by_a_prior_interrupted_apply(self):
        # Simulates the real production failure this was built to handle: a
        # previous --apply already unmatched a row (e.g. from a container
        # with no route to Bank-Recon) but never got to queue its rerun.
        # Re-running the command must find it via the unmatched_reason
        # marker and queue it — even though it no longer matches the
        # detection query (it's not matched=True any more).
        from banks.management.commands.repair_adjacent_day_match_cascade import REPAIR_REASON

        recon = DailyReconciliation.objects.create(
            bank_account=self.bank_account, reconciliation_date=date(2026, 7, 14),
            uploaded_by=self.director, statement_file='bank_statements/x.csv',
            status='completed', owner=self.director, branch=self.branch, tenant=self.tenant,
        )
        already_unmatched = self._bank_tx(
            date(2026, 7, 14), Decimal('50.00'), matched=False,
        )
        already_unmatched.unmatched_reason = REPAIR_REASON
        already_unmatched.save(update_fields=['unmatched_reason'])

        with patch('banks.tasks.run_pool_reconciliation_match') as mock_task:
            out = StringIO()
            call_command('repair_adjacent_day_match_cascade', f'--user-id={self.director.id}', '--apply', stdout=out)
            mock_task.delay.assert_called_once_with(recon.bank_account_id)

        recon.refresh_from_db()
        self.assertEqual(recon.status, 'processing')
        self.assertIn('0 unmatched this run, 1 reconciliation date(s) queued', out.getvalue())

    def test_two_victims_on_different_dates_same_account_dispatch_only_once(self):
        # Two independent cascade victims on two different dates, both on
        # the SAME bank_account, must collapse to a single pool dispatch —
        # not one per date. run_pool_reconciliation_match re-queries which
        # dates are actually 'processing' once it holds the account's lock.
        erp_1 = self._erp_payment(date(2026, 7, 15), Decimal('50.00'))
        wrong_tx_1 = self._bank_tx(
            date(2026, 7, 14), Decimal('50.00'), matched=True,
            matched_erp_payment_id=erp_1.id, posting_lag_days=-1,
        )
        self._bank_tx(date(2026, 7, 15), Decimal('50.00'))
        DailyReconciliation.objects.create(
            bank_account=self.bank_account, reconciliation_date=date(2026, 7, 14),
            uploaded_by=self.director, statement_file='bank_statements/x.csv',
            status='completed', owner=self.director, branch=self.branch, tenant=self.tenant,
        )

        erp_2 = self._erp_payment(date(2026, 7, 21), Decimal('80.00'))
        wrong_tx_2 = self._bank_tx(
            date(2026, 7, 20), Decimal('80.00'), matched=True,
            matched_erp_payment_id=erp_2.id, posting_lag_days=-1,
        )
        self._bank_tx(date(2026, 7, 21), Decimal('80.00'))
        DailyReconciliation.objects.create(
            bank_account=self.bank_account, reconciliation_date=date(2026, 7, 20),
            uploaded_by=self.director, statement_file='bank_statements/y.csv',
            status='completed', owner=self.director, branch=self.branch, tenant=self.tenant,
        )

        with patch('banks.tasks.run_pool_reconciliation_match') as mock_task:
            call_command('repair_adjacent_day_match_cascade', f'--user-id={self.director.id}', '--apply', stdout=StringIO())
            mock_task.delay.assert_called_once_with(self.bank_account.id)

        wrong_tx_1.refresh_from_db()
        wrong_tx_2.refresh_from_db()
        self.assertFalse(wrong_tx_1.matched)
        self.assertFalse(wrong_tx_2.matched)

    def test_leaves_lag_one_match_alone_when_no_exact_day_candidate_exists(self):
        # No competing bank line on the ERP payment's real date — plausibly
        # a genuine one-day posting lag, not the bug.
        erp = self._erp_payment(date(2026, 7, 15), Decimal('50.00'))
        tx = self._bank_tx(
            date(2026, 7, 14), Decimal('50.00'), matched=True,
            matched_erp_payment_id=erp.id, posting_lag_days=-1,
        )

        out = StringIO()
        call_command('repair_adjacent_day_match_cascade', f'--user-id={self.director.id}', '--apply', stdout=out)

        tx.refresh_from_db()
        self.assertTrue(tx.matched)
        self.assertIn('No exact-day candidate', out.getvalue())

    def test_leaves_ambiguous_multi_candidate_case_alone(self):
        erp = self._erp_payment(date(2026, 7, 15), Decimal('50.00'))
        tx = self._bank_tx(
            date(2026, 7, 14), Decimal('50.00'), matched=True,
            matched_erp_payment_id=erp.id, posting_lag_days=-1,
        )
        self._bank_tx(date(2026, 7, 15), Decimal('50.00'), bank_ref='dup-a')
        self._bank_tx(date(2026, 7, 15), Decimal('50.00'), bank_ref='dup-b')

        out = StringIO()
        call_command('repair_adjacent_day_match_cascade', f'--user-id={self.director.id}', '--apply', stdout=out)

        tx.refresh_from_db()
        self.assertTrue(tx.matched)
        self.assertIn('Ambiguous', out.getvalue())

    def test_include_ambiguous_unmatches_no_candidate_and_ambiguous_buckets(self):
        # No-candidate case
        erp_a = self._erp_payment(date(2026, 7, 15), Decimal('50.00'))
        no_candidate_tx = self._bank_tx(
            date(2026, 7, 14), Decimal('50.00'), matched=True,
            matched_erp_payment_id=erp_a.id, posting_lag_days=-1,
        )
        # Ambiguous case (different amount so it doesn't collide with the above)
        erp_b = self._erp_payment(date(2026, 7, 15), Decimal('75.00'))
        ambiguous_tx = self._bank_tx(
            date(2026, 7, 14), Decimal('75.00'), matched=True,
            matched_erp_payment_id=erp_b.id, posting_lag_days=-1,
        )
        self._bank_tx(date(2026, 7, 15), Decimal('75.00'), bank_ref='dup-a')
        self._bank_tx(date(2026, 7, 15), Decimal('75.00'), bank_ref='dup-b')

        with patch('banks.tasks.run_pool_reconciliation_match'):
            out = StringIO()
            call_command(
                'repair_adjacent_day_match_cascade', f'--user-id={self.director.id}',
                '--apply', '--include-ambiguous', stdout=out,
            )

        no_candidate_tx.refresh_from_db()
        ambiguous_tx.refresh_from_db()
        self.assertFalse(no_candidate_tx.matched)
        self.assertFalse(ambiguous_tx.matched)
        self.assertIn('2 unmatched this run', out.getvalue())

    def test_default_leaves_no_candidate_and_ambiguous_buckets_matched(self):
        erp = self._erp_payment(date(2026, 7, 15), Decimal('50.00'))
        no_candidate_tx = self._bank_tx(
            date(2026, 7, 14), Decimal('50.00'), matched=True,
            matched_erp_payment_id=erp.id, posting_lag_days=-1,
        )

        call_command('repair_adjacent_day_match_cascade', f'--user-id={self.director.id}', '--apply', stdout=StringIO())

        no_candidate_tx.refresh_from_db()
        self.assertTrue(no_candidate_tx.matched)

    def test_leaves_alone_when_erp_amount_does_not_exactly_match(self):
        # A legitimate reference/tolerance-based match with a near amount —
        # not the exact-tier tie bug, must not be touched.
        erp = self._erp_payment(date(2026, 7, 15), Decimal('50.00'))
        tx = self._bank_tx(
            date(2026, 7, 14), Decimal('49.80'), matched=True,
            matched_erp_payment_id=erp.id, posting_lag_days=-1,
        )
        self._bank_tx(date(2026, 7, 15), Decimal('49.80'))

        out = StringIO()
        call_command('repair_adjacent_day_match_cascade', f'--user-id={self.director.id}', '--apply', stdout=out)

        tx.refresh_from_db()
        self.assertTrue(tx.matched)
        self.assertIn('Amount not exact match', out.getvalue())

    def test_ignores_rows_matched_exactly_on_their_own_day(self):
        erp = self._erp_payment(date(2026, 7, 15), Decimal('50.00'))
        tx = self._bank_tx(
            date(2026, 7, 15), Decimal('50.00'), matched=True,
            matched_erp_payment_id=erp.id, posting_lag_days=0,
        )

        out = StringIO()
        call_command('repair_adjacent_day_match_cascade', f'--user-id={self.director.id}', '--apply', stdout=out)

        tx.refresh_from_db()
        self.assertTrue(tx.matched)
        self.assertIn('Scanned 0 lag-1 match(es)', out.getvalue())

    def test_bank_account_scope_filter(self):
        erp = self._erp_payment(date(2026, 7, 15), Decimal('50.00'))
        tx = self._bank_tx(
            date(2026, 7, 14), Decimal('50.00'), matched=True,
            matched_erp_payment_id=erp.id, posting_lag_days=-1,
        )
        self._bank_tx(date(2026, 7, 15), Decimal('50.00'))

        other_bank = Bank.objects.create(bank_name='Other Bank', bank_code='555')
        other_gl_account = Account.objects.create(
            code='1923', name='Other Bank GL', account_level=Account.LEVEL_PARENT, branch=self.branch,
        )
        other_account = BankAccount.objects.create(
            bank=other_bank, account_number='0000091', account_name='Other Account',
            gl_account=other_gl_account, account_manager=self.director,
        )

        out = StringIO()
        call_command(
            'repair_adjacent_day_match_cascade', f'--user-id={self.director.id}',
            f'--bank-account-id={other_account.id}', '--dry-run', stdout=out,
        )
        self.assertIn('Scanned 0 lag-1 match(es)', out.getvalue())

        tx.refresh_from_db()
        self.assertTrue(tx.matched)
