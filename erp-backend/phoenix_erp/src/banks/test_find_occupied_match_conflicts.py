"""
Tests for banks/management/commands/find_occupied_match_conflicts.py and
the underlying find_occupied_erp_candidates helper (reconciliation_utils.py)
— the "the correct payment wasn't showing up as a candidate because it was
already matched to something else" case.
"""
from datetime import date
from decimal import Decimal
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase

from accounts.models import Account
from banks.models import Bank, BankAccount, ReconciliationBankTransaction
from banks.reconciliation_utils import find_occupied_erp_candidates
from transactions.models import Transaction, TransactionEntry, TransactionSeries

User = get_user_model()


class FindOccupiedMatchConflictsTests(TestCase):

    def setUp(self):
        self.user = User.objects.create_user(username='occupied_test_manager', password='test123')
        self.gl_account = Account.objects.create(
            code='1799', name='Occupied Test Bank GL', account_level=Account.LEVEL_PARENT
        )
        bank = Bank.objects.create(bank_name='Occupied Test Bank', bank_code='993')
        self.bank_account = BankAccount.objects.create(
            bank=bank, account_number='0000000093', account_name='Occupied Test Account',
            gl_account=self.gl_account, account_manager=self.user,
        )
        self.series = TransactionSeries.objects.create(code='OT', description='Occupied test series')

    def _make_erp_payment(self, amount, txn_date, description='Transfer: occupied test'):
        txn = Transaction.objects.create(
            series=self.series, date=txn_date, description=description,
            owner=self.user, created_by=self.user, approved=True,
        )
        TransactionEntry.objects.create(
            transaction=txn, account=self.gl_account, side=TransactionEntry.DEBIT, amount=amount,
        )
        return txn

    def _run(self, **options):
        out = StringIO()
        call_command('find_occupied_match_conflicts', stdout=out, **options)
        return out.getvalue()

    def test_reports_conflict_when_candidate_is_occupied_and_shares_a_token(self):
        # Both sides mention the same long reference token
        # ("CPWI100004260721ADEYINKA") — a genuine shared identifier, not
        # just a coincidental amount.
        payment = self._make_erp_payment(
            Decimal('5000.00'), date(2026, 7, 2),
            description='Loan repayment – LN-1 | Ref: CPWI100004260721ADEYINKA',
        )
        occupying_tx = ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='OCCUPYING-1', value_date='2026-07-02',
            direction='CREDIT', amount=Decimal('5000.00'), narration='wrong holder',
            matched=True, matched_erp_payment_id=payment.id, match_confidence='HIGH',
        )
        unattached_tx = ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='NEEDS-IT-1', value_date='2026-07-01',
            direction='CREDIT', amount=Decimal('5000.00'),
            narration='CPWI100004260721ADEYINKA the real owner',
            matched=False,
        )

        output = self._run()

        self.assertIn('CONFLICT', output)
        self.assertIn(str(unattached_tx.id), output)
        self.assertIn(f'paymentId={payment.id}', output)
        self.assertIn(str(occupying_tx.id), output)
        self.assertIn('unmatch_transaction_by_id', output)

    def test_no_conflict_reported_when_candidate_is_free(self):
        self._make_erp_payment(Decimal('750.00'), date(2026, 7, 2))
        ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='FREE-1', value_date='2026-07-01',
            direction='CREDIT', amount=Decimal('750.00'), narration='test', matched=False,
        )

        output = self._run()
        self.assertIn('No occupied-candidate conflicts found', output)

    def test_no_conflict_when_only_the_amount_coincides(self):
        # Regression test for the exact noise found live: dozens of
        # recurring same-amount transactions (bank charges, generic
        # transfers) with nothing but the amount in common must NOT be
        # reported — only a genuinely shared long token counts.
        payment = self._make_erp_payment(
            Decimal('53.75'), date(2026, 7, 6),
            description='Bank Payment: EXP-2026-000054 - FIP CHARGES Ref002309495798',
        )
        ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='CHARGE-A', value_date='2026-07-06',
            direction='DEBIT', amount=Decimal('53.75'), narration='FIP CHARGES Ref002303803279',
            matched=True, matched_erp_payment_id=payment.id, match_confidence='HIGH',
        )
        ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='CHARGE-B', value_date='2026-07-07',
            direction='DEBIT', amount=Decimal('53.75'), narration='FIP CHARGES Ref002314769838',
            matched=False,
        )

        output = self._run()
        self.assertIn('No occupied-candidate conflicts found', output)

    def test_no_conflict_from_shared_structural_boilerplate(self):
        # Regression test for the exact false-positive found live: "CPWInward"
        # (9 chars) is the generic bank-channel prefix on EVERY inward
        # transfer narration, and "repayment" (9 chars) recurs in every loan
        # repayment description — neither is a genuine shared identifier
        # just because both happen to be 8+ characters. Only a token with
        # enough digits in it (a real transaction id/reference number)
        # should count.
        payment = self._make_erp_payment(
            Decimal('2000.00'), date(2026, 7, 14),
            description='Loan repayment – LN-1045 | Ref: CPWInward:100004260714063402165294118580/KEHINDE Y',
        )
        ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='BOILERPLATE-A', value_date='2026-07-14',
            direction='CREDIT', amount=Decimal('2000.00'),
            narration='CPWInward:100004260714063402165294118580/KEHINDE Y Ref100226645639',
            matched=True, matched_erp_payment_id=payment.id, match_confidence='HIGH',
        )
        ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='BOILERPLATE-B', value_date='2026-07-15',
            direction='CREDIT', amount=Decimal('2000.00'),
            # Completely unrelated transaction — shares only "CPWInward" and
            # nothing else with the payment's own embedded reference.
            narration='CPWInward:100004260715095540165402293497/MUTIYAT A Ref100228062802',
            matched=False,
        )

        output = self._run()
        self.assertIn('No occupied-candidate conflicts found', output)

    def test_helper_returns_empty_for_matched_line(self):
        # find_occupied_erp_candidates is only meaningful for a currently-
        # unattached line; sanity-check it doesn't blow up if called on one
        # that's already matched (never actually invoked that way by the
        # command, since it only queries matched=False rows).
        payment = self._make_erp_payment(Decimal('999.00'), date(2026, 7, 2))
        tx = ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='ALREADY-1', value_date=date(2026, 7, 1),
            direction='CREDIT', amount=Decimal('999.00'), narration='test',
            matched=True, matched_erp_payment_id=payment.id,
        )
        # tx itself is excluded from "occupying" results via .exclude(pk=tx.pk),
        # so it should never conflict with itself.
        self.assertEqual(find_occupied_erp_candidates(tx), [])
