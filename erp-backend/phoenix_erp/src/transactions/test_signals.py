"""
Tests for transactions/signals.py's auto_unmatch_reconciliation_claims_on_
invalidation — when a Transaction that's currently claimed by a matched
ReconciliationBankTransaction is soft-deleted or reversed, the bank line's
stale claim must be freed automatically (matched_erp_payment_id is a plain
IntegerField, not a real FK, so nothing else clears it).
"""
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase

from accounts.models import Account
from banks.models import Bank, BankAccount, ReconciliationBankTransaction
from transactions.models import Transaction, TransactionSeries

User = get_user_model()


class AutoUnmatchOnInvalidationTests(TestCase):

    def setUp(self):
        self.user = User.objects.create_user(username='signal_test_manager', password='test123')
        gl_account = Account.objects.create(
            code='2499', name='Signal Test Bank GL', account_level=Account.LEVEL_PARENT
        )
        bank = Bank.objects.create(bank_name='Signal Test Bank', bank_code='986')
        self.bank_account = BankAccount.objects.create(
            bank=bank, account_number='0000000086', account_name='Signal Test Account',
            gl_account=gl_account, account_manager=self.user,
        )
        self.series = TransactionSeries.objects.create(code='SIG', description='Signal test series')
        self.payment = Transaction.objects.create(
            series=self.series, description='Loan repayment – LN-SIG',
            owner=self.user, created_by=self.user, approved=True,
        )
        self.tx = ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='SIG-1', value_date='2026-07-22',
            direction='CREDIT', amount=Decimal('2000.00'), narration='test',
            matched=True, matched_erp_payment_id=self.payment.id, match_confidence='HIGH',
        )

    def test_soft_delete_frees_the_claiming_bank_line(self):
        self.payment.is_deleted = True
        self.payment.save()

        self.tx.refresh_from_db()
        self.assertFalse(self.tx.matched)
        self.assertIsNone(self.tx.unmatched_by)
        self.assertIn('deleted', self.tx.unmatched_reason)
        self.assertEqual(self.tx.matched_erp_payment_id, self.payment.id)  # preserved as history

    def test_reversal_frees_the_claiming_bank_line(self):
        self.payment.is_reversed = True
        self.payment.save()

        self.tx.refresh_from_db()
        self.assertFalse(self.tx.matched)
        self.assertIn('reversed', self.tx.unmatched_reason)

    def test_manual_confidence_is_still_freed_on_invalidation(self):
        # Deliberately different from the bulk cleanup commands: a hard
        # fact (the payment is gone) overrides even a director-confirmed
        # match.
        self.tx.match_confidence = 'MANUAL'
        self.tx.save(update_fields=['match_confidence'])

        self.payment.is_deleted = True
        self.payment.save()

        self.tx.refresh_from_db()
        self.assertFalse(self.tx.matched)

    def test_ordinary_save_does_not_touch_the_match(self):
        self.payment.description = 'Loan repayment – LN-SIG (edited)'
        self.payment.save()

        self.tx.refresh_from_db()
        self.assertTrue(self.tx.matched)

    def test_no_error_when_no_bank_line_claims_the_payment(self):
        other_payment = Transaction.objects.create(
            series=self.series, description='Unrelated', owner=self.user,
            created_by=self.user, approved=True,
        )
        # Should not raise even though nothing claims it.
        other_payment.is_deleted = True
        other_payment.save()

    def test_already_unmatched_line_is_left_alone(self):
        self.tx.matched = False
        self.tx.save(update_fields=['matched'])

        self.payment.is_deleted = True
        self.payment.save()  # must not raise

        self.tx.refresh_from_db()
        self.assertEqual(self.tx.unmatched_reason, '')  # untouched by the signal
