"""
Tests for claimed_payment_visible_in_trace (reconciliation_utils.py) and
banks/management/commands/unmatch_double_blocked_matches.py — the "double
blocking" pattern: a bank line shows as Matched, yet its claimed payment
would never come back from Payment Trace's own payments search for that
amount (deleted, unapproved, wrong GL account, or wrong entry amount).
"""
from datetime import date
from decimal import Decimal
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import CommandError, call_command
from django.test import TestCase

from accounts.models import Account
from banks.models import Bank, BankAccount, ReconciliationBankTransaction
from banks.reconciliation_utils import claimed_payment_visible_in_trace
from transactions.models import Transaction, TransactionEntry, TransactionSeries

User = get_user_model()


class ClaimedPaymentVisibleInTraceTests(TestCase):

    def setUp(self):
        self.user = User.objects.create_user(username='dblock_manager', password='test123')
        self.gl_account = Account.objects.create(
            code='2299', name='DBlock Bank GL', account_level=Account.LEVEL_PARENT
        )
        self.other_gl_account = Account.objects.create(
            code='2300', name='Other GL', account_level=Account.LEVEL_PARENT
        )
        bank = Bank.objects.create(bank_name='DBlock Bank', bank_code='988')
        self.bank_account = BankAccount.objects.create(
            bank=bank, account_number='0000000088', account_name='DBlock Account',
            gl_account=self.gl_account, account_manager=self.user,
        )
        self.series = TransactionSeries.objects.create(code='DB', description='DBlock series')

    def _make_payment(self, amount, approved=True, is_deleted=False, entry_account=None, entry_amount=None):
        txn = Transaction.objects.create(
            series=self.series, date=date(2026, 7, 14), description='Loan repayment – LN-DB',
            owner=self.user, created_by=self.user, approved=approved, is_deleted=is_deleted,
        )
        TransactionEntry.objects.create(
            transaction=txn, account=entry_account or self.gl_account,
            side=TransactionEntry.DEBIT, amount=entry_amount if entry_amount is not None else amount,
        )
        return txn

    def _make_tx(self, payment_id, amount='2000.00', confidence='HIGH'):
        return ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='DBLOCK-1', value_date='2026-07-22',
            direction='CREDIT', amount=Decimal(amount), narration='test',
            matched=True, matched_erp_payment_id=payment_id, match_confidence=confidence,
        )

    def test_visible_for_genuine_matching_payment(self):
        payment = self._make_payment(Decimal('2000.00'))
        tx = self._make_tx(payment.id)
        self.assertTrue(claimed_payment_visible_in_trace(tx))

    def test_not_visible_when_payment_does_not_exist(self):
        tx = self._make_tx(999999)
        self.assertFalse(claimed_payment_visible_in_trace(tx))

    def test_not_visible_when_payment_not_approved(self):
        payment = self._make_payment(Decimal('2000.00'), approved=False)
        tx = self._make_tx(payment.id)
        self.assertFalse(claimed_payment_visible_in_trace(tx))

    def test_not_visible_when_payment_deleted(self):
        payment = self._make_payment(Decimal('2000.00'), is_deleted=True)
        tx = self._make_tx(payment.id)
        self.assertFalse(claimed_payment_visible_in_trace(tx))

    def test_not_visible_when_entry_on_different_gl_account(self):
        payment = self._make_payment(Decimal('2000.00'), entry_account=self.other_gl_account)
        tx = self._make_tx(payment.id)
        self.assertFalse(claimed_payment_visible_in_trace(tx))

    def test_not_visible_when_entry_amount_differs(self):
        payment = self._make_payment(Decimal('2000.00'), entry_amount=Decimal('1800.00'))
        tx = self._make_tx(payment.id)
        self.assertFalse(claimed_payment_visible_in_trace(tx))

    def test_visible_when_no_matched_payment_id_at_all(self):
        tx = ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='NEVER', value_date='2026-07-22',
            direction='CREDIT', amount=Decimal('500.00'), narration='test', matched=False,
        )
        self.assertTrue(claimed_payment_visible_in_trace(tx))


class UnmatchDoubleBlockedMatchesCommandTests(TestCase):

    def setUp(self):
        self.user = User.objects.create_user(username='dblock_cmd_manager', password='test123')
        self.director = User.objects.create_user(username='dblock_cmd_director', password='test123')
        self.gl_account = Account.objects.create(
            code='2399', name='DBlock Cmd Bank GL', account_level=Account.LEVEL_PARENT
        )
        bank = Bank.objects.create(bank_name='DBlock Cmd Bank', bank_code='987')
        self.bank_account = BankAccount.objects.create(
            bank=bank, account_number='0000000087', account_name='DBlock Cmd Account',
            gl_account=self.gl_account, account_manager=self.user,
        )
        self.series = TransactionSeries.objects.create(code='DC', description='DBlock cmd series')

    def _make_payment(self, amount, approved=True):
        txn = Transaction.objects.create(
            series=self.series, date=date(2026, 7, 14), description='Loan repayment – LN-DC',
            owner=self.user, created_by=self.user, approved=approved,
        )
        TransactionEntry.objects.create(
            transaction=txn, account=self.gl_account, side=TransactionEntry.DEBIT, amount=amount,
        )
        return txn

    def _run(self, **options):
        out = StringIO()
        call_command('unmatch_double_blocked_matches', stdout=out, **options)
        return out.getvalue()

    def test_unmatches_line_claiming_unapproved_payment(self):
        payment = self._make_payment(Decimal('2000.00'), approved=False)
        tx = ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='DC-1', value_date='2026-07-22',
            direction='CREDIT', amount=Decimal('2000.00'), narration='test',
            matched=True, matched_erp_payment_id=payment.id, match_confidence='HIGH',
        )

        output = self._run(user_id=self.director.id, apply=True)

        tx.refresh_from_db()
        self.assertFalse(tx.matched)
        self.assertEqual(tx.unmatched_by_id, self.director.id)
        self.assertIn('Unmatched 1 double-blocked', output)

    def test_leaves_genuine_match_untouched(self):
        payment = self._make_payment(Decimal('2000.00'))
        tx = ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='DC-2', value_date='2026-07-22',
            direction='CREDIT', amount=Decimal('2000.00'), narration='test',
            matched=True, matched_erp_payment_id=payment.id, match_confidence='HIGH',
        )

        output = self._run(user_id=self.director.id, apply=True)

        tx.refresh_from_db()
        self.assertTrue(tx.matched)
        self.assertIn('Unmatched 0 double-blocked', output)

    def test_leaves_manual_matches_untouched(self):
        # Even a payment that no longer qualifies is left alone if a
        # director/script already confirmed this specific pairing.
        payment = self._make_payment(Decimal('2000.00'), approved=False)
        tx = ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='DC-3', value_date='2026-07-22',
            direction='CREDIT', amount=Decimal('2000.00'), narration='test',
            matched=True, matched_erp_payment_id=payment.id, match_confidence='MANUAL',
        )

        self._run(user_id=self.director.id, apply=True)

        tx.refresh_from_db()
        self.assertTrue(tx.matched)

    def test_dry_run_does_not_mutate(self):
        payment = self._make_payment(Decimal('2000.00'), approved=False)
        tx = ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='DC-4', value_date='2026-07-22',
            direction='CREDIT', amount=Decimal('2000.00'), narration='test',
            matched=True, matched_erp_payment_id=payment.id, match_confidence='HIGH',
        )

        output = self._run(user_id=self.director.id, dry_run=True)

        tx.refresh_from_db()
        self.assertTrue(tx.matched)
        self.assertIn('Would unmatch 1 double-blocked', output)

    def test_invalid_user_id_raises(self):
        with self.assertRaises(CommandError):
            self._run(user_id=999999)
