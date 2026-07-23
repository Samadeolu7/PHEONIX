"""
Tests for banks/management/commands/unmatch_usurped_reference_matches.py —
the systematic generalization of the payment-1685 case: a matched line
holds a payment whose embedded reference contradicts it while exactly one
unmatched line contains that reference (the provable true owner).
"""
from datetime import date
from decimal import Decimal
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase

from accounts.models import Account
from banks.models import Bank, BankAccount, ReconciliationBankTransaction
from transactions.models import Transaction, TransactionEntry, TransactionSeries

User = get_user_model()

REF = 'CPWInward:100004260715095540165402293497/MUTIYAT A'


class UnmatchUsurpedReferenceMatchesTests(TestCase):

    def setUp(self):
        self.user = User.objects.create_user(username='usurp_test_manager', password='test123')
        self.gl_account = Account.objects.create(
            code='2099', name='Usurp Test Bank GL', account_level=Account.LEVEL_PARENT
        )
        bank = Bank.objects.create(bank_name='Usurp Test Bank', bank_code='985')
        self.bank_account = BankAccount.objects.create(
            bank=bank, account_number='0000000085', account_name='Usurp Test Account',
            gl_account=self.gl_account, account_manager=self.user,
        )
        self.series = TransactionSeries.objects.create(code='UT', description='Usurp test series')

    def _make_payment(self, amount, description):
        txn = Transaction.objects.create(
            series=self.series, date=date(2026, 7, 15), description=description,
            owner=self.user, created_by=self.user, approved=True,
        )
        TransactionEntry.objects.create(
            transaction=txn, account=self.gl_account, side=TransactionEntry.DEBIT, amount=amount,
        )
        return txn

    def _line(self, bank_ref, narration, amount, matched=False, payment=None, confidence='HIGH', value_date='2026-07-15'):
        return ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref=bank_ref, value_date=value_date,
            direction='CREDIT', amount=amount, narration=narration,
            matched=matched,
            matched_erp_payment_id=payment.id if payment else None,
            match_confidence=confidence if matched else '',
        )

    def _run(self, **options):
        out = StringIO()
        call_command('unmatch_usurped_reference_matches', stdout=out, **options)
        return out.getvalue()

    def test_frees_wrong_holder_when_exactly_one_true_owner_waits(self):
        payment = self._make_payment(
            Decimal('2000.00'), f'Loan repayment – LN-1126 | Ref: {REF}',
        )
        wrong_holder = self._line(
            'HOLDER', 'CPWInward:100004260715225018165475741743/JOHN BABA Ref100228939575',
            Decimal('2000.00'), matched=True, payment=payment,
        )
        true_owner = self._line(
            'OWNER', f'{REF} Ref100228062802', Decimal('2000.00'),
        )

        output = self._run(user_id=self.user.id, apply=True)

        wrong_holder.refresh_from_db()
        true_owner.refresh_from_db()
        self.assertFalse(wrong_holder.matched)
        self.assertFalse(true_owner.matched)  # pairing happens on rerun, not here
        self.assertIn('Freed 1', output)
        self.assertIn(str(true_owner.id), output)

    def test_dry_run_makes_no_changes(self):
        payment = self._make_payment(
            Decimal('2000.00'), f'Loan repayment – LN-1126 | Ref: {REF}',
        )
        wrong_holder = self._line(
            'HOLDER', 'unrelated JOHN BABA narration', Decimal('2000.00'),
            matched=True, payment=payment,
        )
        self._line('OWNER', f'{REF} Ref100228062802', Decimal('2000.00'))

        output = self._run(user_id=self.user.id)

        wrong_holder.refresh_from_db()
        self.assertTrue(wrong_holder.matched)
        self.assertIn('DRY RUN', output)
        self.assertIn('Would free 1', output)

    def test_no_confirmer_leaves_hold_alone(self):
        # Reference contradicts the holder, but no unmatched line contains
        # it — the true owner isn't visible, freeing would only churn.
        payment = self._make_payment(
            Decimal('2000.00'), f'Loan repayment – LN-1126 | Ref: {REF}',
        )
        holder = self._line(
            'HOLDER', 'unrelated JOHN BABA narration', Decimal('2000.00'),
            matched=True, payment=payment,
        )

        output = self._run(user_id=self.user.id, apply=True)

        holder.refresh_from_db()
        self.assertTrue(holder.matched)
        self.assertIn('Freed 0', output)
        self.assertIn('1 mismatched hold(s) with no visible true owner', output)

    def test_two_confirmers_is_ambiguous_and_untouched(self):
        payment = self._make_payment(
            Decimal('2000.00'), f'Loan repayment – LN-1126 | Ref: {REF}',
        )
        holder = self._line(
            'HOLDER', 'unrelated JOHN BABA narration', Decimal('2000.00'),
            matched=True, payment=payment,
        )
        self._line('CONF-A', f'{REF} Ref100228062802', Decimal('2000.00'))
        self._line('CONF-B', f'{REF} Ref100228999999', Decimal('2000.00'))

        output = self._run(user_id=self.user.id, apply=True)

        holder.refresh_from_db()
        self.assertTrue(holder.matched)
        self.assertIn('AMBIGUOUS', output)
        self.assertIn('Freed 0', output)

    def test_correctly_matched_line_is_left_alone(self):
        payment = self._make_payment(
            Decimal('2000.00'), f'Loan repayment – LN-1126 | Ref: {REF}',
        )
        holder = self._line(
            'HOLDER', f'{REF} Ref100228062802', Decimal('2000.00'),
            matched=True, payment=payment,
        )
        # An unmatched same-amount line also containing the ref must NOT
        # dislodge a holder whose own reference already corresponds.
        self._line('OTHER', f'{REF} Ref100228999999', Decimal('2000.00'))

        output = self._run(user_id=self.user.id, apply=True)

        holder.refresh_from_db()
        self.assertTrue(holder.matched)
        self.assertIn('Freed 0', output)

    def test_manual_match_is_never_freed(self):
        payment = self._make_payment(
            Decimal('2000.00'), f'Loan repayment – LN-1126 | Ref: {REF}',
        )
        holder = self._line(
            'HOLDER', 'unrelated JOHN BABA narration', Decimal('2000.00'),
            matched=True, payment=payment, confidence='MANUAL',
        )
        self._line('OWNER', f'{REF} Ref100228062802', Decimal('2000.00'))

        output = self._run(user_id=self.user.id, apply=True)

        holder.refresh_from_db()
        self.assertTrue(holder.matched)
        # MANUAL rows are excluded by the queryset itself, so with nothing
        # else matched the command reports an empty scan rather than Freed 0.
        self.assertIn('No auto-matched lines to check', output)

    def test_confirmer_with_different_amount_does_not_count(self):
        payment = self._make_payment(
            Decimal('2000.00'), f'Loan repayment – LN-1126 | Ref: {REF}',
        )
        holder = self._line(
            'HOLDER', 'unrelated JOHN BABA narration', Decimal('2000.00'),
            matched=True, payment=payment,
        )
        self._line('WRONG-AMT', f'{REF} Ref100228062802', Decimal('5000.00'))

        output = self._run(user_id=self.user.id, apply=True)

        holder.refresh_from_db()
        self.assertTrue(holder.matched)
        self.assertIn('Freed 0', output)

    def test_no_auto_matched_lines_reports_success(self):
        output = self._run(user_id=self.user.id)
        self.assertIn('No auto-matched lines to check', output)
