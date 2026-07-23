"""
Tests for banks/management/commands/unmatch_recent_reference_mismatches.py
— the bulk fix for recent auto-matched lines whose ERP payment's own
embedded reference doesn't correspond, excluding manually-confirmed
matches and anything outside the day window.
"""
from datetime import date, timedelta
from decimal import Decimal
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import CommandError, call_command
from django.test import TestCase
from django.utils import timezone

from accounts.models import Account
from banks.models import Bank, BankAccount, ReconciliationBankTransaction
from transactions.models import Transaction, TransactionSeries

User = get_user_model()


class UnmatchRecentReferenceMismatchesTests(TestCase):

    def setUp(self):
        self.user = User.objects.create_user(username='bulk_unmatch_manager', password='test123')
        self.director = User.objects.create_user(username='bulk_unmatch_director', password='test123')
        gl_account = Account.objects.create(
            code='2099', name='Bulk Unmatch Bank GL', account_level=Account.LEVEL_PARENT
        )
        bank = Bank.objects.create(bank_name='Bulk Unmatch Bank', bank_code='990')
        self.bank_account = BankAccount.objects.create(
            bank=bank, account_number='0000000090', account_name='Bulk Unmatch Account',
            gl_account=gl_account, account_manager=self.user,
        )
        self.series = TransactionSeries.objects.create(code='BU', description='Bulk unmatch series')
        self.today = timezone.now().date()

    def _make_payment(self, description, txn_date):
        return Transaction.objects.create(
            series=self.series, date=txn_date, description=description,
            owner=self.user, created_by=self.user, approved=True,
        )

    def _make_tx(self, bank_ref, amount, value_date, narration, payment_id, confidence='HIGH'):
        return ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref=bank_ref, value_date=value_date,
            direction='CREDIT', amount=Decimal(amount), narration=narration,
            matched=True, matched_erp_payment_id=payment_id, match_confidence=confidence,
        )

    def _run(self, **options):
        out = StringIO()
        call_command('unmatch_recent_reference_mismatches', stdout=out, **options)
        return out.getvalue()

    def test_unmatches_recent_auto_matched_reference_mismatch(self):
        payment = self._make_payment(
            'Loan repayment – LN-1139 | Ref: CPWInward:.../166001324500/ADEYINKA', self.today,
        )
        tx = self._make_tx(
            'NIMOTA-1', '2000.00', self.today,
            'CPWInward:.../166034176614/NIMOTA OL', payment.id, confidence='HIGH',
        )

        output = self._run(user_id=self.director.id, apply=True)

        tx.refresh_from_db()
        self.assertFalse(tx.matched)
        self.assertEqual(tx.unmatched_by_id, self.director.id)
        self.assertIn('Unmatched 1 reference-mismatched', output)

    def test_leaves_manually_confirmed_matches_untouched(self):
        payment = self._make_payment(
            'Loan repayment – LN-1139 | Ref: CPWInward:.../166001324500/ADEYINKA', self.today,
        )
        tx = self._make_tx(
            'NIMOTA-2', '2000.00', self.today,
            'CPWInward:.../166034176614/NIMOTA OL', payment.id, confidence='MANUAL',
        )

        self._run(user_id=self.director.id, apply=True)

        tx.refresh_from_db()
        self.assertTrue(tx.matched)  # untouched despite the mismatched reference

    def test_leaves_genuine_reference_match_untouched(self):
        payment = self._make_payment(
            'Loan repayment – LN-1143 | Ref: CPWInward:.../165824189850/ADEYINKA', self.today,
        )
        tx = self._make_tx(
            'CORRECT-1', '2000.00', self.today,
            'CPWInward:.../165824189850/ADEYINKA Ref100233203211', payment.id, confidence='HIGH',
        )

        output = self._run(user_id=self.director.id, apply=True)

        tx.refresh_from_db()
        self.assertTrue(tx.matched)  # genuine match, correctly left alone
        self.assertIn('Unmatched 0 reference-mismatched', output)

    def test_leaves_lines_with_no_embedded_reference_untouched(self):
        payment = self._make_payment('Loan repayment – LN-9999', self.today)
        tx = self._make_tx(
            'NOREF-1', '500.00', self.today, 'Unrelated narration', payment.id, confidence='HIGH',
        )

        output = self._run(user_id=self.director.id, apply=True)

        tx.refresh_from_db()
        self.assertTrue(tx.matched)
        self.assertIn('1 line(s) had no explicit reference', output)

    def test_ignores_lines_outside_the_day_window(self):
        old_date = self.today - timedelta(days=10)
        payment = self._make_payment(
            'Loan repayment – LN-1139 | Ref: CPWInward:.../166001324500/ADEYINKA', old_date,
        )
        tx = self._make_tx(
            'OLD-1', '2000.00', old_date,
            'CPWInward:.../166034176614/NIMOTA OL', payment.id, confidence='HIGH',
        )

        output = self._run(user_id=self.director.id, apply=True, days=5)

        tx.refresh_from_db()
        self.assertTrue(tx.matched)
        self.assertIn('No auto-matched lines', output)

    def test_dry_run_does_not_mutate(self):
        payment = self._make_payment(
            'Loan repayment – LN-1139 | Ref: CPWInward:.../166001324500/ADEYINKA', self.today,
        )
        tx = self._make_tx(
            'NIMOTA-3', '2000.00', self.today,
            'CPWInward:.../166034176614/NIMOTA OL', payment.id, confidence='HIGH',
        )

        output = self._run(user_id=self.director.id, dry_run=True)

        tx.refresh_from_db()
        self.assertTrue(tx.matched)
        self.assertIn('Would unmatch 1 reference-mismatched', output)

    def test_invalid_user_id_raises(self):
        with self.assertRaises(CommandError):
            self._run(user_id=999999)
