"""
Tests for banks/management/commands/unmatch_transaction_by_id.py — the
thin CLI wrapper around ReconciliationBankTransaction.unmatch() for a
single transaction, used to free a wrongly-occupied ERP payment so the
correct line can claim it instead (see find_occupied_match_conflicts).
"""
from decimal import Decimal
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import CommandError, call_command
from django.test import TestCase

from accounts.models import Account
from banks.models import Bank, BankAccount, DailyReconciliation, ReconciliationBankTransaction, ReconciliationException

User = get_user_model()


class UnmatchTransactionByIdTests(TestCase):

    def setUp(self):
        self.user = User.objects.create_user(username='unmatch_cli_manager', password='test123')
        self.director = User.objects.create_user(username='unmatch_cli_director', password='test123')
        gl_account = Account.objects.create(
            code='1899', name='Unmatch CLI Bank GL', account_level=Account.LEVEL_PARENT
        )
        bank = Bank.objects.create(bank_name='Unmatch CLI Bank', bank_code='992')
        self.bank_account = BankAccount.objects.create(
            bank=bank, account_number='0000000092', account_name='Unmatch CLI Account',
            gl_account=gl_account, account_manager=self.user,
        )
        self.recon = DailyReconciliation.objects.create(
            bank_account=self.bank_account, reconciliation_date='2026-07-01',
            uploaded_by=self.user, statement_file='bank_statements/unmatch_cli.csv',
            status='completed',
        )

    def _run(self, **options):
        out = StringIO()
        call_command('unmatch_transaction_by_id', stdout=out, **options)
        return out.getvalue()

    def test_unmatches_transaction_and_reopens_bank_only_exception(self):
        tx = ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='UNMATCH-CLI-1', value_date='2026-07-01',
            direction='CREDIT', amount=Decimal('1000.00'), narration='test',
            matched=True, matched_erp_payment_id=42, match_confidence='HIGH',
        )

        output = self._run(tx_id=str(tx.id), user_id=self.director.id, reason='freeing this for the real match')

        tx.refresh_from_db()
        self.assertFalse(tx.matched)
        self.assertEqual(tx.unmatched_by_id, self.director.id)
        self.assertEqual(tx.matched_erp_payment_id, 42)  # preserved as history
        self.assertIn('Unmatched tx=', output)

        bank_exc = ReconciliationException.objects.get(
            reconciliation=self.recon, exception_type='bank_only', bank_transaction_id=tx.id,
        )
        self.assertFalse(bank_exc.resolved)

    def test_invalid_tx_id_raises(self):
        with self.assertRaises(CommandError):
            self._run(tx_id='00000000-0000-0000-0000-000000000000', user_id=self.director.id, reason='does not matter')

    def test_invalid_user_id_raises(self):
        tx = ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='UNMATCH-CLI-2', value_date='2026-07-01',
            direction='CREDIT', amount=Decimal('500.00'), narration='test', matched=True,
        )
        with self.assertRaises(CommandError):
            self._run(tx_id=str(tx.id), user_id=999999, reason='does not matter here')

    def test_reason_too_short_raises(self):
        tx = ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='UNMATCH-CLI-3', value_date='2026-07-01',
            direction='CREDIT', amount=Decimal('500.00'), narration='test', matched=True,
        )
        with self.assertRaises(CommandError):
            self._run(tx_id=str(tx.id), user_id=self.director.id, reason='short')
        tx.refresh_from_db()
        self.assertTrue(tx.matched)  # unchanged
