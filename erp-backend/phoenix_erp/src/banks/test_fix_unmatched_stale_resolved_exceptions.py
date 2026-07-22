"""
Tests for banks/management/commands/fix_unmatched_stale_resolved_exceptions.py
— covers both corrupted shapes it repairs: an exception missing entirely,
and one stuck resolved=True while its bank line is genuinely unmatched.
"""
from decimal import Decimal
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import call_command
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


class FixUnmatchedStaleResolvedExceptionsTests(TestCase):

    def setUp(self):
        self.user = User.objects.create_user(username='repair_test_manager', password='test123')
        gl_account = Account.objects.create(
            code='1399', name='Repair Test Bank GL', account_level=Account.LEVEL_PARENT
        )
        bank = Bank.objects.create(bank_name='Repair Test Bank', bank_code='997')
        self.bank_account = BankAccount.objects.create(
            bank=bank, account_number='0000000097', account_name='Repair Test Account',
            gl_account=gl_account, account_manager=self.user,
        )
        self.recon = DailyReconciliation.objects.create(
            bank_account=self.bank_account, reconciliation_date='2026-07-01',
            uploaded_by=self.user, statement_file='bank_statements/repair.csv',
            status='completed',
        )

    def _run(self, dry_run=False):
        out = StringIO()
        call_command('fix_unmatched_stale_resolved_exceptions', dry_run=dry_run, stdout=out)
        return out.getvalue()

    def test_missing_exceptions_are_created(self):
        tx = ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='MISSING-1', value_date='2026-07-01',
            direction='CREDIT', amount=Decimal('1000.00'), narration='test',
            matched=False, matched_erp_payment_id=42, match_confidence='HIGH',
        )
        self.assertFalse(
            ReconciliationException.objects.filter(exception_type='bank_only', bank_transaction_id=tx.id).exists()
        )
        self.assertFalse(
            ReconciliationException.objects.filter(exception_type='erp_only', loan_payment_id=42).exists()
        )

        output = self._run()

        bank_exc = ReconciliationException.objects.get(
            reconciliation=self.recon, exception_type='bank_only', bank_transaction_id=tx.id,
        )
        self.assertFalse(bank_exc.resolved)
        erp_exc = ReconciliationException.objects.get(exception_type='erp_only', loan_payment_id=42)
        self.assertFalse(erp_exc.resolved)
        self.assertIn('missing entirely', output)

        self.recon.refresh_from_db()
        self.assertEqual(self.recon.unmatched_bank_count, 1)

    def test_stale_resolved_exceptions_are_reopened(self):
        tx = ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='STALE-1', value_date='2026-07-01',
            direction='CREDIT', amount=Decimal('2000.00'), narration='test',
            matched=False, matched_erp_payment_id=99, match_confidence='HIGH',
        )
        bank_exc = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='bank_only', bank_transaction_id=tx.id,
            direction='CREDIT', bank_amount=tx.amount, resolved=True,
        )
        erp_exc = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='erp_only', loan_payment_id=99,
            direction='CREDIT', erp_amount=tx.amount, resolved=True,
        )

        output = self._run()

        bank_exc.refresh_from_db()
        erp_exc.refresh_from_db()
        self.assertFalse(bank_exc.resolved)
        self.assertFalse(erp_exc.resolved)
        self.assertIn('stuck resolved', output)

    def test_already_consistent_is_a_noop(self):
        tx = ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='FINE-1', value_date='2026-07-01',
            direction='CREDIT', amount=Decimal('500.00'), narration='test',
            matched=False, matched_erp_payment_id=7, match_confidence='HIGH',
        )
        ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='bank_only', bank_transaction_id=tx.id,
            direction='CREDIT', bank_amount=tx.amount, resolved=False,
        )
        ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='erp_only', loan_payment_id=7,
            direction='CREDIT', erp_amount=tx.amount, resolved=False,
        )

        output = self._run()
        self.assertIn('No corrupted exception bookkeeping found', output)

    def test_dry_run_does_not_mutate(self):
        tx = ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='DRYRUN-1', value_date='2026-07-01',
            direction='CREDIT', amount=Decimal('300.00'), narration='test',
            matched=False, matched_erp_payment_id=55, match_confidence='HIGH',
        )

        self._run(dry_run=True)

        self.assertFalse(
            ReconciliationException.objects.filter(exception_type='bank_only', bank_transaction_id=tx.id).exists()
        )
        self.assertFalse(
            ReconciliationException.objects.filter(exception_type='erp_only', loan_payment_id=55).exists()
        )

    def test_ghost_match_with_no_reconciliation_for_its_date_is_skipped(self):
        ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='NORECON-1', value_date='2026-08-15',
            direction='CREDIT', amount=Decimal('400.00'), narration='test',
            matched=False, matched_erp_payment_id=88, match_confidence='HIGH',
        )
        output = self._run()
        self.assertIn('no DailyReconciliation exists', output)
        self.assertFalse(ReconciliationException.objects.filter(loan_payment_id=88).exists())
