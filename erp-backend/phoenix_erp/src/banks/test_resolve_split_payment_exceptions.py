"""
Tests for banks/management/commands/resolve_split_payment_exceptions.py —
the "one bank transfer, recorded as multiple ERP entries" pattern that no
1:1 matching tool can represent.
"""
from datetime import date
from decimal import Decimal
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase

from accounts.models import Account
from banks.models import Bank, BankAccount, DailyReconciliation, ReconciliationBankTransaction, ReconciliationException
from transactions.models import Transaction, TransactionEntry, TransactionSeries

User = get_user_model()


class ResolveSplitPaymentExceptionsTests(TestCase):

    def setUp(self):
        self.user = User.objects.create_user(username='split_test_director', password='test123', is_superuser=True)
        self.gl_account = Account.objects.create(
            code='2499', name='Split Test GL', account_level=Account.LEVEL_PARENT
        )
        bank = Bank.objects.create(bank_name='Split Test Bank', bank_code='980')
        self.bank_account = BankAccount.objects.create(
            bank=bank, account_number='0000000080', account_name='Split Test Account',
            gl_account=self.gl_account, account_manager=self.user,
        )
        self.series = TransactionSeries.objects.create(code='SP', description='Split test series')
        self.recon = DailyReconciliation.objects.create(
            bank_account=self.bank_account, reconciliation_date=date(2026, 7, 16),
            uploaded_by=self.user, statement_file='bank_statements/x.csv', status='completed',
        )

    def _payment(self, amount, description):
        txn = Transaction.objects.create(
            series=self.series, date=date(2026, 7, 16), description=description,
            owner=self.user, created_by=self.user, approved=True,
        )
        TransactionEntry.objects.create(transaction=txn, account=self.gl_account, side=TransactionEntry.CREDIT, amount=amount)
        TransactionEntry.objects.create(transaction=txn, account=self.gl_account, side=TransactionEntry.DEBIT, amount=amount)
        return txn

    def _tx(self, amount=Decimal('4000.00')):
        return ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='SPLIT-1', value_date=date(2026, 7, 16),
            direction='CREDIT', amount=amount, narration='KAFILAT split transfer', matched=False,
        )

    def _run(self, **options):
        out = StringIO()
        call_command('resolve_split_payment_exceptions', stdout=out, **options)
        return out.getvalue()

    def test_resolves_bank_only_and_all_erp_only_rows_on_apply(self):
        # Kept under RECONCILIATION_EXCEPTION_DUAL_APPROVAL_THRESHOLD
        # (₦3,000) deliberately — the dual-approval hold itself is a
        # separate, correct behavior covered by its own test below, not a
        # bug this happy-path test should trip over.
        payment_a = self._payment(Decimal('600.00'), 'Loan repayment – LN-1061 | Ref: KAFILAT split')
        payment_b = self._payment(Decimal('900.00'), 'Loan repayment – LN-1061 | Ref: KAFILAT split')
        tx = self._tx(amount=Decimal('1500.00'))

        bank_exc = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='bank_only', direction='CREDIT',
            bank_transaction_id=tx.id, bank_amount=tx.amount, bank_narration=tx.narration, bank_date=tx.value_date,
        )
        erp_exc_a = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='erp_only', direction='CREDIT',
            loan_payment_id=payment_a.id, erp_amount=Decimal('600.00'),
            erp_narration=payment_a.description, erp_date=payment_a.date,
        )
        erp_exc_b = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='erp_only', direction='CREDIT',
            loan_payment_id=payment_b.id, erp_amount=Decimal('900.00'),
            erp_narration=payment_b.description, erp_date=payment_b.date,
        )

        self._run(
            tx_id=str(tx.id), payment_ids=f'{payment_a.id},{payment_b.id}',
            user_id=self.user.id, notes='Single KAFILAT transfer split across two ERP entries', apply=True,
        )

        bank_exc.refresh_from_db()
        erp_exc_a.refresh_from_db()
        erp_exc_b.refresh_from_db()
        self.assertTrue(bank_exc.resolved)
        self.assertTrue(erp_exc_a.resolved)
        self.assertTrue(erp_exc_b.resolved)

        tx.refresh_from_db()
        self.assertFalse(tx.matched)  # never claimed as a false 1:1 match

    def test_amount_at_dual_approval_threshold_is_held_not_resolved(self):
        # The real KAFILAT case (₦4,000 total) is at/above the ₦3,000
        # threshold — resolve_exception_first correctly leaves `resolved`
        # False pending a second, different director, exactly like the UI.
        payment = self._payment(Decimal('3000.00'), 'Loan repayment – LN-1061 | Ref: KAFILAT split')
        tx = self._tx(amount=Decimal('3000.00'))
        erp_exc = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='erp_only', direction='CREDIT',
            loan_payment_id=payment.id, erp_amount=Decimal('3000.00'),
            erp_narration=payment.description, erp_date=payment.date,
        )

        output = self._run(
            tx_id=str(tx.id), payment_ids=str(payment.id),
            user_id=self.user.id, notes='Large split transfer needing a second director', apply=True,
        )

        erp_exc.refresh_from_db()
        self.assertFalse(erp_exc.resolved)
        self.assertIsNotNone(erp_exc.resolved_by_id)  # first director's action IS recorded
        self.assertIn('held pending a second director', output)

    def test_resolves_multiple_erp_only_rows_across_different_reconciliation_dates(self):
        # The recurring shape: the SAME loan_payment_id has separate
        # exception rows on different DailyReconciliation dates (natural
        # key includes `reconciliation`) — all must be resolved, not just one.
        payment = self._payment(Decimal('1000.00'), 'Loan repayment – LN-1061 | Ref: KAFILAT split')
        tx = self._tx(amount=Decimal('1000.00'))

        other_recon = DailyReconciliation.objects.create(
            bank_account=self.bank_account, reconciliation_date=date(2026, 7, 2),
            uploaded_by=self.user, statement_file='bank_statements/y.csv', status='completed',
        )
        exc_recon_a = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='erp_only', direction='CREDIT',
            loan_payment_id=payment.id, erp_amount=Decimal('1000.00'),
            erp_narration=payment.description, erp_date=payment.date,
        )
        exc_recon_b = ReconciliationException.objects.create(
            reconciliation=other_recon, exception_type='erp_only', direction='CREDIT',
            loan_payment_id=payment.id, erp_amount=Decimal('1000.00'),
            erp_narration=payment.description, erp_date=payment.date,
        )

        self._run(
            tx_id=str(tx.id), payment_ids=str(payment.id),
            user_id=self.user.id, notes='Explained by the split KAFILAT transfer', apply=True,
        )

        exc_recon_a.refresh_from_db()
        exc_recon_b.refresh_from_db()
        self.assertTrue(exc_recon_a.resolved)
        self.assertTrue(exc_recon_b.resolved)

    def test_dry_run_makes_no_changes(self):
        payment = self._payment(Decimal('1000.00'), 'Loan repayment – LN-1061 | Ref: KAFILAT split')
        tx = self._tx(amount=Decimal('1000.00'))
        exc = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='erp_only', direction='CREDIT',
            loan_payment_id=payment.id, erp_amount=Decimal('1000.00'),
            erp_narration=payment.description, erp_date=payment.date,
        )

        output = self._run(
            tx_id=str(tx.id), payment_ids=str(payment.id),
            user_id=self.user.id, notes='Explained by the split KAFILAT transfer',
        )

        exc.refresh_from_db()
        self.assertFalse(exc.resolved)
        self.assertIn('DRY RUN', output)
        self.assertIn('Would resolve 1', output)

    def test_amount_mismatch_warns_but_still_proceeds(self):
        payment = self._payment(Decimal('500.00'), 'Loan repayment – LN-1061 | Ref: partial')
        tx = self._tx(amount=Decimal('4000.00'))

        output = self._run(
            tx_id=str(tx.id), payment_ids=str(payment.id),
            user_id=self.user.id, notes='Deliberately mismatched for this test',
        )

        self.assertIn('NOTE: payments sum to', output)

    def test_short_notes_are_rejected(self):
        payment = self._payment(Decimal('1000.00'), 'Loan repayment – LN-1061 | Ref: x')
        tx = self._tx(amount=Decimal('1000.00'))

        with self.assertRaises(Exception):
            self._run(tx_id=str(tx.id), payment_ids=str(payment.id), user_id=self.user.id, notes='short')

    def test_missing_payment_id_raises(self):
        tx = self._tx()
        with self.assertRaises(Exception):
            self._run(
                tx_id=str(tx.id), payment_ids='999999',
                user_id=self.user.id, notes='Explanation long enough to pass',
            )

    def test_nothing_unresolved_reports_success(self):
        payment = self._payment(Decimal('1000.00'), 'Loan repayment – LN-1061 | Ref: x')
        tx = self._tx(amount=Decimal('1000.00'))

        output = self._run(
            tx_id=str(tx.id), payment_ids=str(payment.id),
            user_id=self.user.id, notes='Nothing to resolve here at all',
        )

        self.assertIn('Nothing unresolved found', output)
