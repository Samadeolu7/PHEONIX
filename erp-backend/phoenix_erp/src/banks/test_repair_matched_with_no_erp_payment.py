"""
Tests for banks/management/commands/repair_matched_with_no_erp_payment.py
— the repair for rows matched=True with matched_erp_payment_id IS NULL
(matched to literally nothing).
"""
from decimal import Decimal
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import CommandError, call_command
from django.test import TestCase

from accounts.models import Account
from banks.models import (
    Bank,
    BankAccount,
    DailyReconciliation,
    ReconciliationBankTransaction,
    ReconciliationException,
)

User = get_user_model()


class RepairMatchedWithNoErpPaymentTests(TestCase):

    def setUp(self):
        self.user = User.objects.create_user(username='repair_nothing_manager', password='test123')
        self.director = User.objects.create_user(username='repair_nothing_director', password='test123')
        gl_account = Account.objects.create(
            code='1699', name='Repair Nothing Bank GL', account_level=Account.LEVEL_PARENT
        )
        bank = Bank.objects.create(bank_name='Repair Nothing Bank', bank_code='994')
        self.bank_account = BankAccount.objects.create(
            bank=bank, account_number='0000000094', account_name='Repair Nothing Account',
            gl_account=gl_account, account_manager=self.user,
        )
        self.recon = DailyReconciliation.objects.create(
            bank_account=self.bank_account, reconciliation_date='2026-07-01',
            uploaded_by=self.user, statement_file='bank_statements/repair_nothing.csv',
            status='completed',
        )

    def _run(self, **options):
        out = StringIO()
        call_command('repair_matched_with_no_erp_payment', stdout=out, **options)
        return out.getvalue()

    def test_dry_run_does_not_mutate(self):
        tx = ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='NOTHING-DRY', value_date='2026-07-01',
            direction='CREDIT', amount=Decimal('1000.00'), narration='test',
            matched=True, matched_erp_payment_id=None, match_confidence='HIGH',
        )

        output = self._run(user_id=self.director.id)

        tx.refresh_from_db()
        self.assertTrue(tx.matched)
        self.assertIn('Would unmatch 1', output)

    def test_apply_unmatches_and_reopens_bank_only_exception(self):
        tx = ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='NOTHING-APPLY', value_date='2026-07-01',
            direction='CREDIT', amount=Decimal('2000.00'), narration='test',
            matched=True, matched_erp_payment_id=None, match_confidence='HIGH',
        )

        output = self._run(user_id=self.director.id, apply=True)

        tx.refresh_from_db()
        self.assertFalse(tx.matched)
        self.assertEqual(tx.unmatched_by_id, self.director.id)
        self.assertIn('Unmatched 1 of 1', output)

        bank_exc = ReconciliationException.objects.get(
            reconciliation=self.recon, exception_type='bank_only', bank_transaction_id=tx.id,
        )
        self.assertFalse(bank_exc.resolved)
        # No erp_only exception — there was never a payment id to tie one to.
        self.assertFalse(ReconciliationException.objects.filter(exception_type='erp_only').exists())

    def test_normal_matched_row_is_untouched(self):
        tx = ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='NORMAL-1', value_date='2026-07-01',
            direction='CREDIT', amount=Decimal('3000.00'), narration='normal match',
            matched=True, matched_erp_payment_id=555, match_confidence='HIGH',
        )

        output = self._run(user_id=self.director.id, apply=True)

        tx.refresh_from_db()
        self.assertTrue(tx.matched)
        self.assertEqual(tx.matched_erp_payment_id, 555)
        self.assertIn('No matched-with-nothing rows found', output)

    def test_invalid_user_id_raises(self):
        with self.assertRaises(CommandError):
            self._run(user_id=999999)
