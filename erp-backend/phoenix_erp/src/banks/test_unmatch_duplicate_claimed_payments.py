"""
Tests for banks/management/commands/unmatch_duplicate_claimed_payments.py
and find_duplicate_claimed_payments (reconciliation_utils.py) — the "the
same ERP payment is matched=True on 2-3 different bank lines at once"
data-integrity bug confirmed live in production (21 affected payments).
"""
from datetime import date
from decimal import Decimal
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase

from accounts.models import Account
from banks.models import Bank, BankAccount, ReconciliationBankTransaction
from banks.reconciliation_utils import find_duplicate_claimed_payments
from transactions.models import Transaction, TransactionEntry, TransactionSeries

User = get_user_model()


class DuplicateClaimedPaymentsTests(TestCase):
    """
    These fixtures deliberately recreate the pre-fix corrupted state (the
    same matched_erp_payment_id on two matched=True rows at once) that this
    command exists to clean up — exactly what migration 0030's partial
    unique index (uniq_matched_erp_payment_id_when_matched) now forbids
    going forward. The constraint is dropped for the duration of each test
    (a DDL change inside TestCase's per-test transaction, undone
    automatically when that transaction rolls back) so the legacy scenario
    can still be constructed here without the ORM-level guard fighting it.
    """

    def setUp(self):
        from django.db import connection
        with connection.cursor() as cursor:
            # A UniqueConstraint with a `condition` compiles to a partial
            # unique INDEX on Postgres, not a pg_constraint row — DROP
            # CONSTRAINT would silently no-op here.
            cursor.execute('DROP INDEX IF EXISTS uniq_matched_erp_payment_id_when_matched')
        self.user = User.objects.create_user(username='dupe_test_manager', password='test123')
        self.gl_account = Account.objects.create(
            code='1899', name='Dupe Test Bank GL', account_level=Account.LEVEL_PARENT
        )
        bank = Bank.objects.create(bank_name='Dupe Test Bank', bank_code='994')
        self.bank_account = BankAccount.objects.create(
            bank=bank, account_number='0000000094', account_name='Dupe Test Account',
            gl_account=self.gl_account, account_manager=self.user,
        )
        self.series = TransactionSeries.objects.create(code='DT', description='Dupe test series')

    def _make_erp_payment(self, amount, txn_date, description='Transfer: dupe test'):
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
        call_command('unmatch_duplicate_claimed_payments', stdout=out, **options)
        return out.getvalue()

    def test_helper_returns_empty_when_no_duplicates(self):
        payment = self._make_erp_payment(Decimal('1000.00'), date(2026, 7, 1))
        ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='SOLO-1', value_date='2026-07-01',
            direction='CREDIT', amount=Decimal('1000.00'), narration='fine',
            matched=True, matched_erp_payment_id=payment.id, match_confidence='HIGH',
        )
        self.assertEqual(find_duplicate_claimed_payments(), {})

    def test_helper_groups_all_claimants_of_the_same_payment(self):
        payment = self._make_erp_payment(
            Decimal('2000.00'), date(2026, 7, 22),
            description='Loan repayment – LN-1095 | Ref: CPWInward:100004260722085236166034176614/NIMOTA OL',
        )
        correct_tx = ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='KAOSARAT', value_date='2026-07-22',
            direction='CREDIT', amount=Decimal('2000.00'),
            narration='CPWInward:100004260722085236166034176614/NIMOTA OL',
            matched=True, matched_erp_payment_id=payment.id, match_confidence='HIGH',
        )
        wrong_tx = ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='SODIQOLA', value_date='2026-07-22',
            direction='CREDIT', amount=Decimal('2000.00'),
            narration='CPWInward:100004260722140335166061472505/SODIQ OLA',
            matched=True, matched_erp_payment_id=payment.id, match_confidence='HIGH',
        )
        groups = find_duplicate_claimed_payments()
        self.assertEqual(set(groups.keys()), {payment.id})
        self.assertEqual({tx.id for tx in groups[payment.id]}, {correct_tx.id, wrong_tx.id})

    def test_apply_frees_the_reference_mismatched_claimant_keeps_the_confirmed_one(self):
        payment = self._make_erp_payment(
            Decimal('2000.00'), date(2026, 7, 22),
            description='Loan repayment – LN-1095 | Ref: CPWInward:100004260722085236166034176614/NIMOTA OL',
        )
        correct_tx = ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='KAOSARAT', value_date='2026-07-22',
            direction='CREDIT', amount=Decimal('2000.00'),
            narration='CPWInward:100004260722085236166034176614/NIMOTA OL',
            matched=True, matched_erp_payment_id=payment.id, match_confidence='HIGH',
        )
        wrong_tx = ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='SODIQOLA', value_date='2026-07-22',
            direction='CREDIT', amount=Decimal('2000.00'),
            narration='CPWInward:100004260722140335166061472505/SODIQ OLA',
            matched=True, matched_erp_payment_id=payment.id, match_confidence='HIGH',
        )

        output = self._run(user_id=self.user.id, apply=True)

        correct_tx.refresh_from_db()
        wrong_tx.refresh_from_db()
        self.assertTrue(correct_tx.matched)
        self.assertFalse(wrong_tx.matched)
        self.assertIn('reference-confirmed', output)
        self.assertIn('Freed 1', output)

    def test_dry_run_makes_no_changes(self):
        payment = self._make_erp_payment(
            Decimal('2000.00'), date(2026, 7, 22),
            description='Loan repayment – LN-1095 | Ref: CPWInward:100004260722085236166034176614/NIMOTA OL',
        )
        ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='KAOSARAT', value_date='2026-07-22',
            direction='CREDIT', amount=Decimal('2000.00'),
            narration='CPWInward:100004260722085236166034176614/NIMOTA OL',
            matched=True, matched_erp_payment_id=payment.id, match_confidence='HIGH',
        )
        wrong_tx = ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='SODIQOLA', value_date='2026-07-22',
            direction='CREDIT', amount=Decimal('2000.00'),
            narration='CPWInward:100004260722140335166061472505/SODIQ OLA',
            matched=True, matched_erp_payment_id=payment.id, match_confidence='HIGH',
        )

        output = self._run(user_id=self.user.id)

        wrong_tx.refresh_from_db()
        self.assertTrue(wrong_tx.matched)  # untouched
        self.assertIn('DRY RUN', output)
        self.assertIn('Would free 1', output)

    def test_manual_claimant_wins_over_reference_check(self):
        # A director's own manual confirmation must win even if the
        # reference happens to look ambiguous — a human decision beats the
        # heuristic.
        payment = self._make_erp_payment(
            Decimal('3000.00'), date(2026, 7, 10), description='Transfer: no embedded ref here',
        )
        manual_tx = ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='MANUAL-1', value_date='2026-07-10',
            direction='CREDIT', amount=Decimal('3000.00'), narration='confirmed by director',
            matched=True, matched_erp_payment_id=payment.id, match_confidence='MANUAL',
        )
        auto_tx = ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='AUTO-1', value_date='2026-07-10',
            direction='CREDIT', amount=Decimal('3000.00'), narration='some other line',
            matched=True, matched_erp_payment_id=payment.id, match_confidence='HIGH',
        )

        output = self._run(user_id=self.user.id, apply=True)

        manual_tx.refresh_from_db()
        auto_tx.refresh_from_db()
        self.assertTrue(manual_tx.matched)
        self.assertFalse(auto_tx.matched)
        self.assertIn('MANUAL-confirmed', output)

    def test_ambiguous_group_is_reported_but_left_untouched(self):
        # Neither claimant has an embedded reference to check against, and
        # neither is MANUAL — genuinely ambiguous, must not guess.
        payment = self._make_erp_payment(
            Decimal('4000.00'), date(2026, 7, 5), description='Transfer: generic',
        )
        tx1 = ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='AMBIG-1', value_date='2026-07-05',
            direction='CREDIT', amount=Decimal('4000.00'), narration='line one',
            matched=True, matched_erp_payment_id=payment.id, match_confidence='HIGH',
        )
        tx2 = ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='AMBIG-2', value_date='2026-07-06',
            direction='CREDIT', amount=Decimal('4000.00'), narration='line two',
            matched=True, matched_erp_payment_id=payment.id, match_confidence='HIGH',
        )

        output = self._run(user_id=self.user.id, apply=True)

        tx1.refresh_from_db()
        tx2.refresh_from_db()
        self.assertTrue(tx1.matched)
        self.assertTrue(tx2.matched)
        self.assertIn('AMBIGUOUS', output)
        self.assertIn('Freed 0', output)

    def test_missing_payment_is_skipped_in_favor_of_double_blocked_tool(self):
        payment = self._make_erp_payment(Decimal('5000.00'), date(2026, 7, 8))
        tx1 = ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='GONE-1', value_date='2026-07-08',
            direction='CREDIT', amount=Decimal('5000.00'), narration='line one',
            matched=True, matched_erp_payment_id=payment.id, match_confidence='HIGH',
        )
        tx2 = ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='GONE-2', value_date='2026-07-09',
            direction='CREDIT', amount=Decimal('5000.00'), narration='line two',
            matched=True, matched_erp_payment_id=payment.id, match_confidence='HIGH',
        )
        payment_id = payment.id
        payment.delete()

        output = self._run(user_id=self.user.id, apply=True)

        tx1.refresh_from_db()
        tx2.refresh_from_db()
        self.assertTrue(tx1.matched)
        self.assertTrue(tx2.matched)
        self.assertIn('unmatch_double_blocked_matches', output)

    def test_no_duplicates_reports_success(self):
        output = self._run(user_id=self.user.id)
        self.assertIn('No duplicate-claimed payments found', output)
