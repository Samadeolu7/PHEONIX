"""
Tests for audit_till_transfer_duplicates — the sweep for the "fabricated
cashier→bank transfer" production pattern: officers logged client deposits
via the Transfer screen (DR bank / CR till), double-counting the deposit on
the bank GL and falsely draining the till, while the real posting (a loan
payment whose bank leg was misposted, or a direct match candidate) carried
the same money. See the command's module docstring for the full story.
"""
import uuid
from datetime import date
from decimal import Decimal
from io import StringIO
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase

from accounts.models import Account
from banks.models import (
    Bank, BankAccount, BankTransfer, DailyReconciliation,
    ReconciliationBankTransaction, ReconciliationException,
)
from branches.models import Branch
from transactions.models import Transaction, TransactionEntry, TransactionSeries
from users.models import Tenant

User = get_user_model()


class AuditTillTransferDuplicatesTests(TestCase):

    def setUp(self):
        from cash_management.models import CashierAccount

        self.tenant = Tenant.objects.create(name='Till Audit Org', slug='till-audit-org')
        self.branch = Branch.objects.create(name='Branch A', code='TAA')
        self.director = User.objects.create_user(
            username='till_audit_director', password='test123', tenant=self.tenant, branch=self.branch,
        )
        self.bank_gl = Account.objects.create(
            code='1925', name='Till Audit Bank GL', account_type=Account.ASSET,
            account_level=Account.LEVEL_PARENT, branch=self.branch,
        )
        bank = Bank.objects.create(bank_name='Till Audit Bank', bank_code='985')
        self.bank_account = BankAccount.objects.create(
            bank=bank, account_number='0000096', account_name='Till Audit Account',
            gl_account=self.bank_gl, account_manager=self.director,
        )
        self.till_gl = Account.objects.create(
            code='1121', name='Officer Till GL', account_type=Account.ASSET,
            account_level=Account.LEVEL_PARENT, branch=self.branch,
        )
        self.till = CashierAccount.objects.create(
            cashier=self.director, account=self.till_gl, account_number='CASH-T1',
            name='Officer Till', owner=self.director, branch=self.branch,
        )
        self.misposting_gl = Account.objects.create(
            code='4201', name='Wrong Parent GL', account_type=Account.ASSET,
            account_level=Account.LEVEL_PARENT, branch=self.branch,
        )
        self.btrf_series = TransactionSeries.objects.create(code='BTRF', description='Bank Transfers')
        self.lnpmt_series = TransactionSeries.objects.create(code='LNPMT', description='Loan payments')
        self.recon = DailyReconciliation.objects.create(
            bank_account=self.bank_account, reconciliation_date=date(2026, 7, 1),
            uploaded_by=self.director, statement_file='bank_statements/till.csv',
            status='completed', owner=self.director, branch=self.branch, tenant=self.tenant,
        )

    def _fabricated_transfer(self, amount, description='Wakilat'):
        """A completed cashier→bank BankTransfer with the standard two-leg
        journal (DR bank GL / CR till GL) — the fabricated-logging shape."""
        je = Transaction.objects.create(
            series=self.btrf_series, date=date(2026, 7, 1),
            description=f'Transfer: {description}',
            owner=self.director, branch=self.branch, created_by=self.director, approved=True,
        )
        TransactionEntry.objects.create(
            transaction=je, account=self.bank_gl, side=TransactionEntry.DEBIT, amount=amount,
        )
        TransactionEntry.objects.create(
            transaction=je, account=self.till_gl, side=TransactionEntry.CREDIT, amount=amount,
        )
        return BankTransfer.objects.create(
            transfer_number=f'TRF-{uuid.uuid4().hex[:8]}', source_type='cashier',
            destination_type='bank', source_cashier_account=self.till,
            destination_bank_account=self.bank_account, amount=amount,
            description=description, transfer_date=date(2026, 7, 1), status='completed',
            journal_entry=je, initiated_by=self.director,
            owner=self.director, branch=self.branch, tenant=self.tenant,
        )

    def _claimed_line(self, je, amount, narration):
        return ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref=f'REF-{uuid.uuid4().hex[:8]}',
            value_date=date(2026, 7, 1), direction='CREDIT', amount=amount,
            narration=narration, matched=True, matched_erp_payment_id=je.id,
            match_confidence='HIGH',
        )

    def _covering_payment(self, amount, description, on_bank_gl=False):
        """The client's real payment — bank leg either misposted elsewhere
        (the RECL/MOVEB chain shape) or directly on this bank's GL."""
        txn = Transaction.objects.create(
            series=self.lnpmt_series, date=date(2026, 7, 1), description=description,
            owner=self.director, branch=self.branch, created_by=self.director, approved=True,
        )
        TransactionEntry.objects.create(
            transaction=txn, account=self.bank_gl if on_bank_gl else self.misposting_gl,
            side=TransactionEntry.DEBIT, amount=amount,
        )
        return txn

    def test_confirmed_duplicate_is_reversed_line_unmatched_and_exception_resolved(self):
        transfer = self._fabricated_transfer(Decimal('39000.00'), description='Wakilat')
        line = self._claimed_line(transfer.journal_entry, Decimal('39000.00'), 'from wakilat')
        covering = self._covering_payment(Decimal('39000.00'), 'Loan repayment – LN-773 | wakilat omotayo')

        out = StringIO()
        call_command('audit_till_transfer_duplicates', f'--user-id={self.director.id}', '--apply', stdout=out)

        transfer.journal_entry.refresh_from_db()
        line.refresh_from_db()
        self.assertTrue(transfer.journal_entry.is_reversed)
        self.assertFalse(line.matched)
        self.assertIn(transfer.transfer_number, line.unmatched_reason)

        exc = ReconciliationException.objects.get(
            reconciliation=self.recon, exception_type='bank_only', bank_transaction_id=line.id,
        )
        self.assertTrue(exc.resolved)
        self.assertIn(covering.reference_number, exc.resolution_notes)

    def test_covering_record_on_this_bank_gl_leaves_exception_open_and_queues_rerun(self):
        transfer = self._fabricated_transfer(Decimal('5000.00'), description='Zainab')
        line = self._claimed_line(transfer.journal_entry, Decimal('5000.00'), 'Transfer from ZAINAB KAREEM')
        self._covering_payment(Decimal('5000.00'), 'Loan repayment – LN-1 | zainab kareem', on_bank_gl=True)

        with patch('banks.tasks.run_reconciliation_match') as mock_task:
            call_command('audit_till_transfer_duplicates', f'--user-id={self.director.id}', '--apply', stdout=StringIO())
            mock_task.delay.assert_called_once_with(self.recon.id, self.recon.include_debits)

        line.refresh_from_db()
        self.assertFalse(line.matched)
        exc = ReconciliationException.objects.get(
            reconciliation=self.recon, exception_type='bank_only', bank_transaction_id=line.id,
        )
        self.assertFalse(exc.resolved)
        self.recon.refresh_from_db()
        self.assertEqual(self.recon.status, 'processing')

    def test_no_covering_record_is_reported_but_never_touched(self):
        transfer = self._fabricated_transfer(Decimal('7000.00'), description='genuine till banking')
        line = self._claimed_line(transfer.journal_entry, Decimal('7000.00'), 'CASH DEPOSIT BY OFFICER')

        out = StringIO()
        call_command('audit_till_transfer_duplicates', f'--user-id={self.director.id}', '--apply', stdout=out)

        transfer.journal_entry.refresh_from_db()
        line.refresh_from_db()
        self.assertFalse(transfer.journal_entry.is_reversed)
        self.assertTrue(line.matched)
        self.assertIn('REVIEW', out.getvalue())

    def test_dry_run_makes_no_changes(self):
        transfer = self._fabricated_transfer(Decimal('39000.00'), description='Wakilat')
        line = self._claimed_line(transfer.journal_entry, Decimal('39000.00'), 'from wakilat')
        self._covering_payment(Decimal('39000.00'), 'Loan repayment – LN-773 | wakilat omotayo')

        out = StringIO()
        call_command('audit_till_transfer_duplicates', f'--user-id={self.director.id}', stdout=out)

        transfer.journal_entry.refresh_from_db()
        line.refresh_from_db()
        self.assertFalse(transfer.journal_entry.is_reversed)
        self.assertTrue(line.matched)
        self.assertIn('DRY RUN', out.getvalue())
        self.assertIn('CONFIRMED', out.getvalue())

    def test_non_pure_journal_shape_is_skipped(self):
        # An extra leg on a non-cash ledger — must never be blind-reversed.
        transfer = self._fabricated_transfer(Decimal('39000.00'), description='Wakilat')
        TransactionEntry.objects.create(
            transaction=transfer.journal_entry, account=self.misposting_gl,
            side=TransactionEntry.CREDIT, amount=Decimal('1.00'),
        )
        TransactionEntry.objects.create(
            transaction=transfer.journal_entry, account=self.misposting_gl,
            side=TransactionEntry.DEBIT, amount=Decimal('1.00'),
        )
        line = self._claimed_line(transfer.journal_entry, Decimal('39000.00'), 'from wakilat')
        self._covering_payment(Decimal('39000.00'), 'Loan repayment – LN-773 | wakilat omotayo')

        out = StringIO()
        call_command('audit_till_transfer_duplicates', f'--user-id={self.director.id}', '--apply', stdout=out)

        transfer.journal_entry.refresh_from_db()
        line.refresh_from_db()
        self.assertFalse(transfer.journal_entry.is_reversed)
        self.assertTrue(line.matched)
        self.assertIn('skipped', out.getvalue())

    def test_transfer_whose_journal_claims_no_line_is_only_reported(self):
        transfer = self._fabricated_transfer(Decimal('2500.00'), description='unclaimed')

        out = StringIO()
        call_command('audit_till_transfer_duplicates', f'--user-id={self.director.id}', '--apply', stdout=out)

        transfer.journal_entry.refresh_from_db()
        self.assertFalse(transfer.journal_entry.is_reversed)
        self.assertIn('UNMATCHED_JOURNAL   : 1', out.getvalue())
