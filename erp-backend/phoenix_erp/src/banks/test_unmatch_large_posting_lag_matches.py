"""
Tests for banks/management/commands/unmatch_large_posting_lag_matches.py
— frees matches whose ERP payment sits an implausibly large number of
days from the bank line's own date, regardless of how recent the line
is, excluding MANUAL (director/script-confirmed) matches.
"""
from decimal import Decimal
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import CommandError, call_command
from django.test import TestCase

from accounts.models import Account
from banks.models import Bank, BankAccount, ReconciliationBankTransaction

User = get_user_model()


class UnmatchLargePostingLagMatchesTests(TestCase):

    def setUp(self):
        self.user = User.objects.create_user(username='lag_test_manager', password='test123')
        self.director = User.objects.create_user(username='lag_test_director', password='test123')
        gl_account = Account.objects.create(
            code='2199', name='Lag Test Bank GL', account_level=Account.LEVEL_PARENT
        )
        bank = Bank.objects.create(bank_name='Lag Test Bank', bank_code='989')
        self.bank_account = BankAccount.objects.create(
            bank=bank, account_number='0000000089', account_name='Lag Test Account',
            gl_account=gl_account, account_manager=self.user,
        )

    def _make_tx(self, bank_ref, value_date, posting_lag_days, confidence='HIGH', payment_id=42):
        return ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref=bank_ref, value_date=value_date,
            direction='CREDIT', amount=Decimal('2000.00'), narration='test',
            matched=True, matched_erp_payment_id=payment_id, match_confidence=confidence,
            posting_lag_days=posting_lag_days,
        )

    def _run(self, **options):
        out = StringIO()
        call_command('unmatch_large_posting_lag_matches', stdout=out, **options)
        return out.getvalue()

    def test_unmatches_large_positive_lag(self):
        tx = self._make_tx('LAG-1', '2026-07-22', posting_lag_days=8)

        output = self._run(user_id=self.director.id, apply=True)

        tx.refresh_from_db()
        self.assertFalse(tx.matched)
        self.assertEqual(tx.unmatched_by_id, self.director.id)
        self.assertIn('Unmatched 1 large-posting-lag', output)

    def test_unmatches_large_negative_lag(self):
        tx = self._make_tx('LAG-2', '2026-07-14', posting_lag_days=-8)

        self._run(user_id=self.director.id, apply=True)

        tx.refresh_from_db()
        self.assertFalse(tx.matched)

    def test_leaves_small_lag_untouched(self):
        tx = self._make_tx('LAG-3', '2026-07-20', posting_lag_days=1)

        output = self._run(user_id=self.director.id, apply=True)

        tx.refresh_from_db()
        self.assertTrue(tx.matched)
        self.assertIn('No matches with', output)

    def test_leaves_manually_confirmed_matches_untouched_regardless_of_lag(self):
        tx = self._make_tx('LAG-4', '2026-07-22', posting_lag_days=10, confidence='MANUAL')

        self._run(user_id=self.director.id, apply=True)

        tx.refresh_from_db()
        self.assertTrue(tx.matched)

    def test_leaves_null_posting_lag_untouched(self):
        tx = ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='LAG-5', value_date='2026-07-22',
            direction='CREDIT', amount=Decimal('2000.00'), narration='test',
            matched=True, matched_erp_payment_id=42, match_confidence='HIGH',
            posting_lag_days=None,
        )

        self._run(user_id=self.director.id, apply=True)

        tx.refresh_from_db()
        self.assertTrue(tx.matched)

    def test_custom_threshold(self):
        tx = self._make_tx('LAG-6', '2026-07-22', posting_lag_days=4)

        # Default threshold (3) would flag this; a wider threshold shouldn't.
        output = self._run(user_id=self.director.id, apply=True, max_lag_days=5)

        tx.refresh_from_db()
        self.assertTrue(tx.matched)
        self.assertIn('No matches with', output)

    def test_dry_run_does_not_mutate(self):
        tx = self._make_tx('LAG-7', '2026-07-22', posting_lag_days=9)

        output = self._run(user_id=self.director.id, dry_run=True)

        tx.refresh_from_db()
        self.assertTrue(tx.matched)
        self.assertIn('Would unmatch 1 large-posting-lag', output)

    def test_invalid_user_id_raises(self):
        with self.assertRaises(CommandError):
            self._run(user_id=999999)
