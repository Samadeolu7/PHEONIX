"""
Tests for banks/management/commands/unmatch_unverified_matches.py and the
match_is_reference_and_amount_verified helper — the historical half of the
reference-AND-amount-only matching policy.
"""
from datetime import date
from decimal import Decimal
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase

from accounts.models import Account
from banks.models import Bank, BankAccount, ReconciliationBankTransaction
from banks.reconciliation_utils import match_is_reference_and_amount_verified
from transactions.models import Transaction, TransactionEntry, TransactionSeries

User = get_user_model()

REF = 'CPWInward:100004260710190322165008642306/KAFILAT A'


class UnmatchUnverifiedMatchesTests(TestCase):

    def setUp(self):
        self.user = User.objects.create_user(username='verify_test_manager', password='test123')
        self.gl_account = Account.objects.create(
            code='2299', name='Verify Test GL', account_level=Account.LEVEL_PARENT
        )
        bank = Bank.objects.create(bank_name='Verify Test Bank', bank_code='983')
        self.bank_account = BankAccount.objects.create(
            bank=bank, account_number='0000000083', account_name='Verify Test Account',
            gl_account=self.gl_account, account_manager=self.user,
        )
        self.series = TransactionSeries.objects.create(code='VF', description='Verify test series')

    def _payment(self, amount, description):
        txn = Transaction.objects.create(
            series=self.series, date=date(2026, 7, 10), description=description,
            owner=self.user, created_by=self.user, approved=True,
        )
        TransactionEntry.objects.create(
            transaction=txn, account=self.gl_account, side=TransactionEntry.DEBIT, amount=amount,
        )
        return txn

    def _line(self, bank_ref, amount, narration, payment, confidence='HIGH'):
        return ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref=bank_ref, value_date='2026-07-10',
            direction='CREDIT', amount=amount, narration=narration,
            matched=True, matched_erp_payment_id=payment.id, match_confidence=confidence,
        )

    def _run(self, **options):
        out = StringIO()
        call_command('unmatch_unverified_matches', stdout=out, **options)
        return out.getvalue()

    def test_reference_and_amount_verified_match_is_kept(self):
        payment = self._payment(Decimal('2000.00'), f'Loan repayment – LN-1061 | Ref: {REF}')
        line = self._line('KEEP-1', Decimal('2000.00'), f'{REF} Ref100223137546', payment)

        output = self._run(user_id=self.user.id, apply=True)

        line.refresh_from_db()
        self.assertTrue(line.matched)
        self.assertIn('1 verified match(es) kept', output)

    def test_amount_date_coincidence_is_freed(self):
        payment = self._payment(
            Decimal('2000.00'), 'Loan repayment – LN-999 | Ref: totally different customer XYZ12345',
        )
        line = self._line('COINC-1', Decimal('2000.00'), 'CPWInward:111111222222/SOMEONE ELSE', payment)

        output = self._run(user_id=self.user.id, apply=True)

        line.refresh_from_db()
        self.assertFalse(line.matched)
        self.assertIn('Freed 1', output)

    def test_reference_hit_with_wrong_amount_is_freed(self):
        # KAFILAT split shape: payment ₦3,000 carrying the ₦4,000 line's
        # exact reference — reference corresponds, amount does not.
        payment = self._payment(Decimal('3000.00'), f'Loan repayment – LN-1061 | Ref: {REF}')
        line = self._line('SPLIT-1', Decimal('4000.00'), f'{REF} Ref100229919329', payment)

        self._run(user_id=self.user.id, apply=True)

        line.refresh_from_db()
        self.assertFalse(line.matched)

    def test_no_ref_payment_with_corresponding_description_is_kept(self):
        # Savings-deposit shape: description IS the raw narration.
        payment = self._payment(
            Decimal('2000.00'), 'CPWInward:100004260722140335166061472505/SODIQ OLA',
        )
        line = self._line(
            'SVDEP-1', Decimal('2000.00'),
            'CPWInward:100004260722140335166061472505/SODIQ OLA Ref100236222141', payment,
        )

        self._run(user_id=self.user.id, apply=True)

        line.refresh_from_db()
        self.assertTrue(line.matched)

    def test_no_ref_payment_with_unrelated_description_is_freed(self):
        payment = self._payment(Decimal('4000.00'), 'Transfer: Oladele Tayo')
        line = self._line(
            'NOREF-1', Decimal('4000.00'),
            'CPWInward:100004260701162053164133575513/ZAINAB TI Ref100212362625', payment,
        )

        self._run(user_id=self.user.id, apply=True)

        line.refresh_from_db()
        self.assertFalse(line.matched)

    def test_manual_match_is_never_freed(self):
        payment = self._payment(Decimal('5000.00'), 'Transfer: whatever')
        line = self._line('MAN-1', Decimal('5000.00'), 'unrelated', payment, confidence='MANUAL')

        output = self._run(user_id=self.user.id, apply=True)

        line.refresh_from_db()
        self.assertTrue(line.matched)
        self.assertIn('No auto-matched lines in scope', output)

    def test_dry_run_makes_no_changes(self):
        payment = self._payment(Decimal('6000.00'), 'Loan repayment – LN-1 | Ref: NOPE99999')
        line = self._line('DRY-1', Decimal('6000.00'), 'something else entirely', payment)

        output = self._run(user_id=self.user.id)

        line.refresh_from_db()
        self.assertTrue(line.matched)
        self.assertIn('DRY RUN', output)
        self.assertIn('Would free 1', output)

    def test_reverse_direction_bank_line_token_in_erp_description_is_kept(self):
        # No "| Ref:" segment on the payment at all, and its full
        # description does NOT wholly correspond to the (much shorter)
        # bank narration word-for-word — but the bank line's own unique
        # reference token appears verbatim inside the payment's text.
        # Found live: expense entries described "Bank Payment: EXP-2026-
        # 000018 - FIP CHARGES Ref002278932824" against bank line
        # "FIP CHARGES Ref002278932824".
        payment = self._payment(
            Decimal('53.75'),
            'Bank Payment: EXP-2026-000018 - FIP CHARGES Ref002278932824',
        )
        line = self._line('FEE-1', Decimal('53.75'), 'FIP CHARGES Ref002278932824', payment)

        self._run(user_id=self.user.id, apply=True)

        line.refresh_from_db()
        self.assertTrue(line.matched)

    def test_reverse_direction_short_alpha_token_does_not_count(self):
        # A short/non-digit-dominant shared word ("CHARGES") must not
        # count in reverse either — only real id fragments do.
        payment = self._payment(Decimal('60.00'), 'Bank Payment: unrelated entry entirely')
        line = self._line('FEE-2', Decimal('60.00'), 'FIP CHARGES Ref009999999999', payment)

        self._run(user_id=self.user.id, apply=True)

        line.refresh_from_db()
        self.assertFalse(line.matched)

    def test_erp_description_wrapping_the_bank_narration_verbatim_is_kept(self):
        # Full production shape: BankPayment.post_payment() builds the ERP
        # description as "Bank Payment: {ref} - " + bank narration
        # verbatim — the line's whole narration is embedded in the (much
        # longer) payment description, the opposite direction from what
        # the word-subset fallback checks. Must be verified, not freed.
        bank_narration = 'Stamp Duty Charge on 2 TXNS FRM 30-06-2026 to 30-0 Ref2 TRANSACTION(S)'
        payment = self._payment(
            Decimal('100.00'), f'Bank Payment: EXP-2026-000014 - {bank_narration}',
        )
        line = self._line('FEE-3', Decimal('100.00'), bank_narration, payment)

        self._run(user_id=self.user.id, apply=True)

        line.refresh_from_db()
        self.assertTrue(line.matched)

    def test_helper_rejects_missing_payment(self):
        payment = self._payment(Decimal('7000.00'), 'Loan repayment – LN-2 | Ref: GONE88888')
        line = self._line('GONE-1', Decimal('7000.00'), 'GONE88888 present here', payment)
        self.assertTrue(match_is_reference_and_amount_verified(line, payment))
        self.assertFalse(match_is_reference_and_amount_verified(line, None))
