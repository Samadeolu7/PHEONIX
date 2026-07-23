"""
Tests for banks/management/commands/find_reference_mismatched_matches.py
— the audit for existing matched=True rows whose ERP payment's own
embedded bank reference doesn't actually appear in the bank line it's
matched to (the LN-1139/NIMOTA production shape).
"""
from datetime import date
from decimal import Decimal
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase

from accounts.models import Account
from banks.models import Bank, BankAccount, ReconciliationBankTransaction
from transactions.models import Transaction, TransactionSeries

User = get_user_model()


class FindReferenceMismatchedMatchesTests(TestCase):

    def setUp(self):
        self.user = User.objects.create_user(username='refcheck_manager', password='test123')
        gl_account = Account.objects.create(
            code='1999', name='RefCheck Bank GL', account_level=Account.LEVEL_PARENT
        )
        bank = Bank.objects.create(bank_name='RefCheck Bank', bank_code='991')
        self.bank_account = BankAccount.objects.create(
            bank=bank, account_number='0000000091', account_name='RefCheck Account',
            gl_account=gl_account, account_manager=self.user,
        )
        self.series = TransactionSeries.objects.create(code='RC', description='RefCheck series')

    def _make_payment(self, description):
        return Transaction.objects.create(
            series=self.series, date=date(2026, 7, 21), description=description,
            owner=self.user, created_by=self.user, approved=True,
        )

    def _run(self, **options):
        out = StringIO()
        call_command('find_reference_mismatched_matches', stdout=out, **options)
        return out.getvalue()

    def test_flags_mismatched_reference(self):
        payment = self._make_payment(
            'Loan repayment – LN-1139 | Ref: CPWInward:100004260721190629166001324500/ADEYINKA'
        )
        tx = ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='NIMOTA-1', value_date='2026-07-22',
            direction='CREDIT', amount=Decimal('2000.00'),
            narration='CPWInward:100004260722085236166034176614/NIMOTA OL Ref100235852513',
            matched=True, matched_erp_payment_id=payment.id, match_confidence='HIGH',
        )

        output = self._run()

        self.assertIn('MISMATCH', output)
        self.assertIn(str(tx.id), output)
        self.assertIn('Found 1 reference-mismatched', output)

    def test_does_not_flag_matching_reference(self):
        payment = self._make_payment(
            'Loan repayment – LN-1143 | Ref: CPWInward:100004260719203007165824189850/ADEYINKA'
        )
        ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='CORRECT-1', value_date='2026-07-20',
            direction='CREDIT', amount=Decimal('2000.00'),
            narration='CPWInward:100004260719203007165824189850/ADEYINKA Ref100233203211',
            matched=True, matched_erp_payment_id=payment.id, match_confidence='HIGH',
        )

        output = self._run()
        self.assertIn('No reference mismatches found', output)

    def test_payment_with_no_ref_segment_is_not_flagged_but_counted(self):
        payment = self._make_payment('Loan repayment – LN-9999')
        ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='NOREF-1', value_date='2026-07-20',
            direction='CREDIT', amount=Decimal('500.00'), narration='Some unrelated narration',
            matched=True, matched_erp_payment_id=payment.id, match_confidence='HIGH',
        )

        output = self._run()
        self.assertIn('No reference mismatches found', output)
        self.assertIn('1 matched line(s) had no explicit', output)

    def test_whitespace_collapse_difference_is_not_a_mismatch(self):
        # Regression test for the exact false positive found live: bank
        # narrations pad with double spaces ("EPHRAIM DEE  Trf for Custo")
        # while the same text stored into the payment's "| Ref:" segment
        # comes back with runs collapsed to a single space. That is the
        # same reference, not a mismatch — an exact substring test flagged
        # dozens of correct matches on nothing but a swallowed space.
        payment = self._make_payment(
            'Loan repayment – LN-1082 | Ref: ISW:MMB/EPHRAIM DEE ENT/EPHRAIM DEE Trf for Custo'
        )
        ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='WS-1', value_date='2026-07-20',
            direction='CREDIT', amount=Decimal('4000.00'),
            narration='ISW:MMB/EPHRAIM DEE ENT/EPHRAIM DEE  Trf for Custo Ref428994204850',
            matched=True, matched_erp_payment_id=payment.id, match_confidence='HIGH',
        )

        output = self._run()
        self.assertIn('No reference mismatches found', output)

    def test_whitespace_normalization_also_applies_to_confirmation(self):
        # The positive-confirmation helper used by
        # unmatch_duplicate_claimed_payments must agree: a double-space
        # difference still counts as reference-CONFIRMED, so the correct
        # claimant in a duplicate group isn't wrongly demoted to ambiguous.
        from banks.reconciliation_utils import reference_confirms_bank_line

        payment = self._make_payment(
            'Loan repayment – LN-800 | Ref: ISW:MMB/SERAH OLALEYE /SERAH OLALEY Trf for Custo'
        )
        tx = ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='WS-2', value_date='2026-07-13',
            direction='CREDIT', amount=Decimal('19500.00'),
            narration='ISW:MMB/SERAH OLALEYE  /SERAH OLALEY Trf for Custo Ref888072204850',
            matched=True, matched_erp_payment_id=payment.id, match_confidence='HIGH',
        )

        self.assertTrue(reference_confirms_bank_line(tx, payment))
