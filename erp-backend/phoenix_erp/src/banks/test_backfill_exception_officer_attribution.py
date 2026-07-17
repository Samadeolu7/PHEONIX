"""
Tests for the backfill_exception_officer_attribution management command —
re-derives ReconciliationException.officer/erp_branch on existing erp_only
exceptions from Transaction.created_by, for exceptions whose snapshot was
taken (by migration 0019) before the created_by fix on BankTransfer.complete()/
BankPayment.post_payment() and backfill_journal_entry_attribution existed.
"""
from datetime import date
from decimal import Decimal
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase

from accounts.models import Account
from banks.models import Bank, BankAccount, DailyReconciliation, ReconciliationException
from branches.models import Branch
from transactions.models import Transaction, TransactionSeries
from users.models import Tenant

User = get_user_model()


class BackfillExceptionOfficerAttributionTests(TestCase):

    def setUp(self):
        self.tenant = Tenant.objects.create(name='Officer Backfill Org', slug='officer-backfill-org')
        self.branch = Branch.objects.create(name='Branch A', code='OBA')
        self.officer = User.objects.create_user(
            username='officer_bf', password='test123', tenant=self.tenant, branch=self.branch,
        )

        gl_account = Account.objects.create(
            code='1801', name='Officer Backfill GL', account_level=Account.LEVEL_PARENT, branch=self.branch,
        )
        bank = Bank.objects.create(bank_name='Officer Backfill Bank', bank_code='993')
        self.bank_account = BankAccount.objects.create(
            bank=bank, account_number='0000040', account_name='Officer Backfill Account',
            gl_account=gl_account, account_manager=self.officer,
        )
        self.recon = DailyReconciliation.objects.create(
            bank_account=self.bank_account, reconciliation_date='2026-07-01',
            uploaded_by=self.officer, statement_file='bank_statements/obf.csv',
            status='completed', owner=self.officer, branch=self.branch, tenant=self.tenant,
        )
        self.series, _ = TransactionSeries.objects.get_or_create(
            code='BKPAY', defaults={'description': 'Bank Payments'},
        )

    def _snapshot_unattributed_exception(self, created_by=None):
        # Simulates migration 0019 having already run against a Transaction
        # whose created_by was NULL at the time — the exception's officer
        # field is permanently NULL until this command re-derives it.
        txn = Transaction.objects.create(
            series=self.series, date=date(2026, 7, 1), description='Bank Payment: test',
            owner=self.officer, branch=self.branch, tenant=self.tenant, created_by=created_by,
        )
        exc = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='erp_only', direction='DEBIT',
            loan_payment_id=txn.id, erp_amount=Decimal('500.00'),
            erp_narration='test', erp_date='2026-07-01', officer=None,
        )
        return exc, txn

    def test_backfills_officer_and_erp_branch_from_corrected_transaction(self):
        # Simulates the real sequence: exception snapshot NULL, then
        # backfill_journal_entry_attribution (or the created_by fix itself)
        # later corrects the transaction's created_by out-of-band.
        exc, txn = self._snapshot_unattributed_exception(created_by=None)
        txn.created_by = self.officer
        txn.save(update_fields=['created_by'])

        call_command('backfill_exception_officer_attribution', stdout=StringIO())

        exc.refresh_from_db()
        self.assertEqual(exc.officer_id, self.officer.id)
        self.assertEqual(exc.erp_branch_id, self.branch.id)

    def test_dry_run_makes_no_changes(self):
        exc, txn = self._snapshot_unattributed_exception(created_by=None)
        txn.created_by = self.officer
        txn.save(update_fields=['created_by'])

        out = StringIO()
        call_command('backfill_exception_officer_attribution', '--dry-run', stdout=out)

        exc.refresh_from_db()
        self.assertIsNone(exc.officer_id)
        self.assertIn('DRY RUN', out.getvalue())
        self.assertIn(f'exception id={exc.id}', out.getvalue())

    def test_already_attributed_exceptions_are_left_untouched(self):
        exc, txn = self._snapshot_unattributed_exception(created_by=self.officer)
        exc.officer = self.officer
        exc.save(update_fields=['officer'])

        out = StringIO()
        call_command('backfill_exception_officer_attribution', stdout=out)

        self.assertNotIn(f'exception id={exc.id}', out.getvalue())

    def test_transaction_still_unattributed_is_reported_and_left_alone(self):
        exc, txn = self._snapshot_unattributed_exception(created_by=None)

        out = StringIO()
        call_command('backfill_exception_officer_attribution', stdout=out)

        exc.refresh_from_db()
        self.assertIsNone(exc.officer_id)
        self.assertIn('still have no created_by', out.getvalue())

    def test_bank_only_exceptions_are_not_touched(self):
        bank_exc = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='bank_only', direction='DEBIT',
            bank_amount=Decimal('500.00'), bank_narration='test', bank_date='2026-07-01',
        )
        call_command('backfill_exception_officer_attribution', stdout=StringIO())

        bank_exc.refresh_from_db()
        self.assertIsNone(bank_exc.officer_id)

    def test_is_safely_re_runnable(self):
        exc, txn = self._snapshot_unattributed_exception(created_by=None)
        txn.created_by = self.officer
        txn.save(update_fields=['created_by'])

        call_command('backfill_exception_officer_attribution', stdout=StringIO())
        out = StringIO()
        call_command('backfill_exception_officer_attribution', stdout=out)

        self.assertIn('No unattributed erp_only exceptions found.', out.getvalue())
