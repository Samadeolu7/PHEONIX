"""
Tests for banks/management/commands/fix_unmatched_stale_resolved_exceptions.py
— covers both corrupted shapes it repairs: an exception missing entirely,
and one stuck resolved=True while its bank line is genuinely unmatched.
"""
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

User = get_user_model()


class FixUnmatchedStaleResolvedExceptionsTests(TestCase):

    def setUp(self):
        self.user = User.objects.create_user(username='repair_test_manager', password='test123')
        gl_account = Account.objects.create(
            code='1399', name='Repair Test Bank GL', account_level=Account.LEVEL_PARENT
        )
        bank = Bank.objects.create(bank_name='Repair Test Bank', bank_code='997')
        self.bank_account = BankAccount.objects.create(
            bank=bank, account_number='0000000097', account_name='Repair Test Account',
            gl_account=gl_account, account_manager=self.user,
        )
        self.recon = DailyReconciliation.objects.create(
            bank_account=self.bank_account, reconciliation_date='2026-07-01',
            uploaded_by=self.user, statement_file='bank_statements/repair.csv',
            status='completed',
        )

    def _run(self, dry_run=False):
        out = StringIO()
        call_command('fix_unmatched_stale_resolved_exceptions', dry_run=dry_run, stdout=out)
        return out.getvalue()

    def test_missing_exceptions_are_created(self):
        tx = ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='MISSING-1', value_date='2026-07-01',
            direction='CREDIT', amount=Decimal('1000.00'), narration='test',
            matched=False, matched_erp_payment_id=42, match_confidence='HIGH',
        )
        self.assertFalse(
            ReconciliationException.objects.filter(exception_type='bank_only', bank_transaction_id=tx.id).exists()
        )
        self.assertFalse(
            ReconciliationException.objects.filter(exception_type='erp_only', loan_payment_id=42).exists()
        )

        output = self._run()

        bank_exc = ReconciliationException.objects.get(
            reconciliation=self.recon, exception_type='bank_only', bank_transaction_id=tx.id,
        )
        self.assertFalse(bank_exc.resolved)
        erp_exc = ReconciliationException.objects.get(exception_type='erp_only', loan_payment_id=42)
        self.assertFalse(erp_exc.resolved)
        self.assertIn('missing entirely', output)

        self.recon.refresh_from_db()
        self.assertEqual(self.recon.unmatched_bank_count, 1)

    def test_stale_resolved_exceptions_are_reopened(self):
        tx = ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='STALE-1', value_date='2026-07-01',
            direction='CREDIT', amount=Decimal('2000.00'), narration='test',
            matched=False, matched_erp_payment_id=99, match_confidence='HIGH',
        )
        bank_exc = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='bank_only', bank_transaction_id=tx.id,
            direction='CREDIT', bank_amount=tx.amount, resolved=True,
        )
        erp_exc = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='erp_only', loan_payment_id=99,
            direction='CREDIT', erp_amount=tx.amount, resolved=True,
        )

        output = self._run()

        bank_exc.refresh_from_db()
        erp_exc.refresh_from_db()
        self.assertFalse(bank_exc.resolved)
        self.assertFalse(erp_exc.resolved)
        self.assertIn('stuck resolved', output)

    def test_already_consistent_is_a_noop(self):
        tx = ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='FINE-1', value_date='2026-07-01',
            direction='CREDIT', amount=Decimal('500.00'), narration='test',
            matched=False, matched_erp_payment_id=7, match_confidence='HIGH',
        )
        ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='bank_only', bank_transaction_id=tx.id,
            direction='CREDIT', bank_amount=tx.amount, resolved=False,
        )
        ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='erp_only', loan_payment_id=7,
            direction='CREDIT', erp_amount=tx.amount, resolved=False,
        )

        output = self._run()
        self.assertIn('No corrupted exception bookkeeping found', output)

    def test_dry_run_does_not_mutate(self):
        tx = ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='DRYRUN-1', value_date='2026-07-01',
            direction='CREDIT', amount=Decimal('300.00'), narration='test',
            matched=False, matched_erp_payment_id=55, match_confidence='HIGH',
        )

        self._run(dry_run=True)

        self.assertFalse(
            ReconciliationException.objects.filter(exception_type='bank_only', bank_transaction_id=tx.id).exists()
        )
        self.assertFalse(
            ReconciliationException.objects.filter(exception_type='erp_only', loan_payment_id=55).exists()
        )

    def test_ghost_match_with_no_reconciliation_for_its_date_is_skipped(self):
        ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='NORECON-1', value_date='2026-08-15',
            direction='CREDIT', amount=Decimal('400.00'), narration='test',
            matched=False, matched_erp_payment_id=88, match_confidence='HIGH',
        )
        output = self._run()
        self.assertIn('no DailyReconciliation exists', output)
        self.assertFalse(ReconciliationException.objects.filter(loan_payment_id=88).exists())

    # ── Phase 2: auto-resolutions with no live match behind them ──────────

    AUTO_NOTE = 'Auto-resolved: matched in a later re-run.'

    def test_auto_resolved_erp_only_with_no_live_claimant_is_reopened(self):
        # The exact production stray: payment auto-resolved when a (wrong)
        # match was committed; the claimant was later freed and re-matched
        # to a DIFFERENT payment, so no ghost line points here anymore —
        # phase 1's ghost walk can't see it, phase 2 must.
        exc = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='erp_only', direction='CREDIT',
            loan_payment_id=1880, erp_amount=Decimal('1000.00'),
            erp_narration='Loan repayment – LN-1061', erp_date='2026-07-01',
            resolved=True, resolution_notes=self.AUTO_NOTE,
        )
        # A line whose pointer was overwritten to another payment entirely.
        ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='OVERWRITTEN-1', value_date='2026-07-01',
            direction='CREDIT', amount=Decimal('1000.00'), narration='now claims another payment',
            matched=True, matched_erp_payment_id=999, match_confidence='HIGH',
        )

        output = self._run()

        exc.refresh_from_db()
        self.assertFalse(exc.resolved)
        self.assertIn('no live match', output)

    def test_auto_resolved_bank_only_with_unmatched_line_is_reopened(self):
        tx = ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='STALE-BANK-1', value_date='2026-07-01',
            direction='CREDIT', amount=Decimal('500.00'), narration='test',
            matched=False,
        )
        exc = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='bank_only', direction='CREDIT',
            bank_transaction_id=tx.id, bank_amount=Decimal('500.00'),
            bank_narration='test', bank_date='2026-07-01',
            resolved=True, resolution_notes=self.AUTO_NOTE,
        )

        self._run()

        exc.refresh_from_db()
        self.assertFalse(exc.resolved)

    def test_auto_resolved_with_live_match_stays_resolved(self):
        live_tx = ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='LIVE-1', value_date='2026-07-01',
            direction='CREDIT', amount=Decimal('700.00'), narration='test',
            matched=True, matched_erp_payment_id=777, match_confidence='HIGH',
        )
        erp_exc = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='erp_only', direction='CREDIT',
            loan_payment_id=777, erp_amount=Decimal('700.00'),
            erp_narration='live', erp_date='2026-07-01',
            resolved=True, resolution_notes=self.AUTO_NOTE,
        )
        bank_exc = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='bank_only', direction='CREDIT',
            bank_transaction_id=live_tx.id, bank_amount=Decimal('700.00'),
            bank_narration='live', bank_date='2026-07-01',
            resolved=True, resolution_notes=self.AUTO_NOTE,
        )

        self._run()

        erp_exc.refresh_from_db()
        bank_exc.refresh_from_db()
        self.assertTrue(erp_exc.resolved)
        self.assertTrue(bank_exc.resolved)

    def test_human_resolution_is_never_reopened(self):
        # resolved_by set, or any note other than the auto-resolve marker —
        # a director's decision is permanent even with no live match.
        human_exc = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='erp_only', direction='CREDIT',
            loan_payment_id=555, erp_amount=Decimal('900.00'),
            erp_narration='human resolved', erp_date='2026-07-01',
            resolved=True, resolved_by=self.user, resolution_notes='Payment resolved',
        )
        other_note_exc = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='erp_only', direction='CREDIT',
            loan_payment_id=556, erp_amount=Decimal('901.00'),
            erp_narration='bank fee, no ERP entry needed', erp_date='2026-07-01',
            resolved=True, resolution_notes='this is a bank fee',
        )

        self._run()

        human_exc.refresh_from_db()
        other_note_exc.refresh_from_db()
        self.assertTrue(human_exc.resolved)
        self.assertTrue(other_note_exc.resolved)

    def test_phase2_dry_run_does_not_mutate(self):
        exc = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='erp_only', direction='CREDIT',
            loan_payment_id=444, erp_amount=Decimal('300.00'),
            erp_narration='stale', erp_date='2026-07-01',
            resolved=True, resolution_notes=self.AUTO_NOTE,
        )

        output = self._run(dry_run=True)

        exc.refresh_from_db()
        self.assertTrue(exc.resolved)
        self.assertIn('Would reopen', output)
