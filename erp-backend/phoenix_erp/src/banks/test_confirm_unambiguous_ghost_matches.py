"""
Tests for banks/management/commands/confirm_unambiguous_ghost_matches.py.

Covers: unambiguous ghost match gets confirmed, ambiguous one is skipped,
no-candidate one is skipped, a never-matched line (no matched_erp_payment_id
history) is never even considered, dry-run doesn't mutate, and a ghost
match's stale old matched_erp_payment_id is replaced by the freshly-found
candidate rather than trusted as-is.
"""
from datetime import date
from decimal import Decimal
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase

from accounts.models import Account
from banks.models import (
    Bank,
    BankAccount,
    DailyReconciliation,
    ReconciliationBankTransaction,
    ReconciliationException,
)
from transactions.models import Transaction, TransactionEntry, TransactionSeries

User = get_user_model()


class ConfirmUnambiguousGhostMatchesTests(TestCase):

    def setUp(self):
        self.user = User.objects.create_user(username='confirm_test_manager', password='test123')
        self.gl_account = Account.objects.create(
            code='1599', name='Confirm Test Bank GL', account_level=Account.LEVEL_PARENT
        )
        bank = Bank.objects.create(bank_name='Confirm Test Bank', bank_code='996')
        self.bank_account = BankAccount.objects.create(
            bank=bank, account_number='0000000096', account_name='Confirm Test Account',
            gl_account=self.gl_account, account_manager=self.user,
        )
        self.recon = DailyReconciliation.objects.create(
            bank_account=self.bank_account, reconciliation_date='2026-07-01',
            uploaded_by=self.user, statement_file='bank_statements/confirm.csv',
            status='completed',
        )
        self.series = TransactionSeries.objects.create(code='CT', description='Confirm test series')

    def _make_erp_payment(self, amount, txn_date, description='Transfer: test payment'):
        txn = Transaction.objects.create(
            series=self.series, date=txn_date, description=description,
            owner=self.user, created_by=self.user, approved=True,
        )
        TransactionEntry.objects.create(
            transaction=txn, account=self.gl_account, side=TransactionEntry.DEBIT, amount=amount,
        )
        return txn

    def _make_ghost_tx(self, bank_ref, amount, value_date, old_payment_id):
        return ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref=bank_ref, value_date=value_date,
            direction='CREDIT', amount=Decimal(amount), narration='test',
            matched=False, matched_erp_payment_id=old_payment_id, match_confidence='HIGH',
        )

    def _run(self, dry_run=False):
        out = StringIO()
        call_command('confirm_unambiguous_ghost_matches', dry_run=dry_run, stdout=out)
        return out.getvalue()

    def test_unambiguous_ghost_match_is_confirmed(self):
        payment = self._make_erp_payment(Decimal('1000.00'), date(2026, 7, 2))
        tx = self._make_ghost_tx('GHOST-1', '1000.00', '2026-07-01', old_payment_id=999999)
        bank_exc = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='bank_only', bank_transaction_id=tx.id,
            direction='CREDIT', bank_amount=tx.amount, resolved=False,
        )
        erp_exc = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='erp_only', loan_payment_id=payment.id,
            direction='CREDIT', erp_amount=Decimal('1000.00'), resolved=False,
        )

        output = self._run()

        tx.refresh_from_db()
        self.assertTrue(tx.matched)
        self.assertEqual(tx.matched_erp_payment_id, payment.id)
        self.assertEqual(tx.match_confidence, 'MANUAL')
        self.assertIsNotNone(tx.matched_at)
        self.assertEqual(tx.matched_erp_officer_id, self.user.id)

        bank_exc.refresh_from_db()
        erp_exc.refresh_from_db()
        self.assertTrue(bank_exc.resolved)
        self.assertTrue(erp_exc.resolved)
        self.assertIn('Confirmed 1 unambiguous', output)

        self.recon.refresh_from_db()
        self.assertEqual(self.recon.matched_count, 1)

    def test_reassigns_to_fresh_candidate_not_stale_old_payment_id(self):
        # tx's OLD matched_erp_payment_id (999999) doesn't correspond to any
        # real candidate — the command must use the freshly-found one, not
        # blindly trust the historical value.
        payment = self._make_erp_payment(Decimal('2500.00'), date(2026, 7, 3))
        tx = self._make_ghost_tx('GHOST-REASSIGN', '2500.00', '2026-07-01', old_payment_id=999999)

        self._run()

        tx.refresh_from_db()
        self.assertEqual(tx.matched_erp_payment_id, payment.id)
        self.assertNotEqual(tx.matched_erp_payment_id, 999999)

    def test_ambiguous_ghost_match_is_skipped(self):
        self._make_erp_payment(Decimal('4000.00'), date(2026, 7, 2), 'Transfer: candidate A')
        self._make_erp_payment(Decimal('4000.00'), date(2026, 7, 4), 'Transfer: candidate B')
        tx = self._make_ghost_tx('GHOST-AMBIG', '4000.00', '2026-07-01', old_payment_id=1)

        output = self._run()

        tx.refresh_from_db()
        self.assertFalse(tx.matched)
        self.assertIn('SKIP (ambiguous', output)
        self.assertIn('Skipped 1 ambiguous', output)

    def test_no_candidate_ghost_match_is_skipped(self):
        tx = self._make_ghost_tx('GHOST-NONE', '9999.00', '2026-07-01', old_payment_id=1)

        output = self._run()

        tx.refresh_from_db()
        self.assertFalse(tx.matched)
        self.assertIn('0 unambiguous', output)
        self.assertIn('1 with no candidate', output)

    def test_never_matched_line_is_never_touched(self):
        payment = self._make_erp_payment(Decimal('750.00'), date(2026, 7, 2))
        tx = ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='NEVER-1', value_date='2026-07-01',
            direction='CREDIT', amount=Decimal('750.00'), narration='never matched',
            matched=False, matched_erp_payment_id=None,
        )

        self._run()

        tx.refresh_from_db()
        self.assertFalse(tx.matched)
        self.assertIsNone(tx.matched_erp_payment_id)

    def test_dry_run_does_not_mutate(self):
        self._make_erp_payment(Decimal('333.00'), date(2026, 7, 2))
        tx = self._make_ghost_tx('GHOST-DRY', '333.00', '2026-07-01', old_payment_id=1)

        output = self._run(dry_run=True)

        tx.refresh_from_db()
        self.assertFalse(tx.matched)
        self.assertIn('Would confirm 1 unambiguous', output)
