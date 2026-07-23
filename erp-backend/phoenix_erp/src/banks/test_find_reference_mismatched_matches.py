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

    def test_name_reference_in_different_word_order_is_not_a_mismatch(self):
        # Officers often type the customer's name as the reference in a
        # different order than the bank prints it — same customer, not a
        # mismatch. Found live: 'Adewola Adeife Roseline' flagged against
        # narration 'Transfer from ROSELINE ADEIFE ADEWOLA'.
        payment = self._make_payment(
            'Loan repayment – LN-1042 | Ref: Adewola Adeife Roseline'
        )
        ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='ORDER-1', value_date='2026-07-20',
            direction='CREDIT', amount=Decimal('1000.00'),
            narration='Transfer from ROSELINE ADEIFE ADEWOLA',
            matched=True, matched_erp_payment_id=payment.id, match_confidence='HIGH',
        )

        output = self._run()
        self.assertIn('No reference mismatches found', output)

    def test_trf_frm_prefix_difference_is_not_a_mismatch(self):
        # 'TRF FRM MAMUDU TAIBAT' vs bank narration '... FROM MAMUDU
        # TAIBAT' — connective prefixes differ, the customer tokens all
        # match. TRF/FRM are under the 4-char word floor, FROM is
        # structural; only MAMUDU + TAIBAT count and both are present.
        payment = self._make_payment(
            'Loan repayment – LN-726 | Ref: TRF FRM MAMUDU TAIBAT'
        )
        ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='PREFIX-1', value_date='2026-07-20',
            direction='CREDIT', amount=Decimal('20000.00'),
            narration='USSD-NIP/To KRYSTAR L./23470XXXX6885 - FROM MAMUDU TAIBAT',
            matched=True, matched_erp_payment_id=payment.id, match_confidence='HIGH',
        )

        output = self._run()
        self.assertIn('No reference mismatches found', output)

    def test_reference_of_only_structural_words_never_matches_by_tokens(self):
        # A reference like 'Transfer from Krystar customer' is pure
        # boilerplate — every word is structural, so the token fallback
        # has nothing meaningful to match on and must NOT let it
        # "correspond" to an arbitrary narration sharing those words.
        # Correspondence then depends solely on the verbatim check, which
        # also fails here — so this IS flagged as a mismatch.
        from banks.models import ReconciliationBankTransaction as RBT
        from banks.reconciliation_utils import reference_mismatches_bank_line

        payment = self._make_payment(
            'Loan repayment – LN-1 | Ref: Transfer from Krystar customer'
        )
        line = RBT(
            bank_account=self.bank_account, bank_ref='BOILER-1', value_date='2026-07-20',
            direction='CREDIT', amount=Decimal('500.00'),
            narration='KRYSTAR TRUST transfer from customer JOHN',
        )
        self.assertTrue(reference_mismatches_bank_line(line, payment))

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
