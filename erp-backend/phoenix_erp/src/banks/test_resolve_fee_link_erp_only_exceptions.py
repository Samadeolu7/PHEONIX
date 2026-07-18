"""
Tests for the fee-link false-erp_only fix, in both halves:

1. fetch_erp_payments (banks/reconciliation_utils.py) must exclude the GL
   posting of a bank-charge-link fee payment from the candidate pool — the
   fee was embedded inside the bigger, already-consumed bank line, so no
   separate statement line for it exists or ever will; offering it to Java
   just resurfaces it as a false erp_only exception on every rerun.
   Resolve-to-expense payments must NOT be excluded — their bank line is
   still unmatched and needs the payment offered so the match can close it.

2. The resolve_fee_link_erp_only_exceptions management command resolves the
   false exceptions already created before that fix — EXCEPT when two or
   more fee payments trace to the same underlying bank line (the bank only
   charged once, so the extra booking is a genuine ERP overstatement whose
   erp_only exception is the only surviving signal — left open on purpose).
"""
import uuid
from datetime import date
from decimal import Decimal
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase

from accounts.models import Account
from banks.models import Bank, BankAccount, BankPayment, DailyReconciliation, ReconciliationException
from banks.reconciliation_utils import fetch_erp_payments
from branches.models import Branch
from transactions.models import Transaction, TransactionEntry, TransactionSeries
from users.models import Tenant

User = get_user_model()


class FeeLinkErpOnlyTestsBase(TestCase):

    def setUp(self):
        self.tenant = Tenant.objects.create(name='Fee Link Org', slug='fee-link-org')
        self.branch = Branch.objects.create(name='Branch A', code='FLA')
        self.director = User.objects.create_user(
            username='fee_link_director', password='test123', tenant=self.tenant, branch=self.branch,
        )
        self.gl_account = Account.objects.create(
            code='1924', name='Fee Link GL', account_level=Account.LEVEL_PARENT, branch=self.branch,
        )
        bank = Bank.objects.create(bank_name='Fee Link Bank', bank_code='986')
        self.bank_account = BankAccount.objects.create(
            bank=bank, account_number='0000095', account_name='Fee Link Account',
            gl_account=self.gl_account, account_manager=self.director,
        )
        self.recon = DailyReconciliation.objects.create(
            bank_account=self.bank_account, reconciliation_date=date(2026, 7, 9),
            uploaded_by=self.director, statement_file='bank_statements/fee.csv',
            status='completed', owner=self.director, branch=self.branch, tenant=self.tenant,
        )
        self.series = TransactionSeries.objects.create(code='BKP', description='Bank payment series')

    def _posted_payment(self, amount, description='Bank charge on transfer'):
        """An approved BankPayment whose journal entry CRs the bank GL —
        the shape a posted fee payment has in production."""
        txn = Transaction.objects.create(
            series=self.series, date=date(2026, 7, 9), description=description,
            owner=self.director, branch=self.branch, created_by=self.director,
            approved=True,
        )
        TransactionEntry.objects.create(
            transaction=txn, account=self.gl_account, side=TransactionEntry.CREDIT, amount=amount,
        )
        return BankPayment.objects.create(
            bank_account=self.bank_account, amount=amount, description=description,
            payment_date=date(2026, 7, 9), status='posted', journal_entry=txn,
            owner=self.director, branch=self.branch, tenant=self.tenant, created_by=self.director,
        )

    def _fee_link_exceptions(self, payment, bank_transaction_id, fee=Decimal('20.00'), recon=None):
        """The resolved bank_only/erp_only pair a bank-charge link leaves
        behind — pending_bank_payment AND netted_with both set."""
        recon = recon or self.recon
        erp_exc = ReconciliationException.objects.create(
            reconciliation=recon, exception_type='erp_only', direction='DEBIT',
            erp_amount=payment.amount - fee, erp_narration='transfer out', erp_date=date(2026, 7, 9),
            resolved=True,
        )
        bank_exc = ReconciliationException.objects.create(
            reconciliation=recon, exception_type='bank_only', direction='DEBIT',
            bank_transaction_id=bank_transaction_id,
            bank_amount=payment.amount, bank_narration='transfer incl fee', bank_date=date(2026, 7, 9),
            resolved=True, pending_bank_payment=payment, netted_with=erp_exc,
        )
        erp_exc.netted_with = bank_exc
        erp_exc.save(update_fields=['netted_with'])
        return bank_exc


class FetchErpPaymentsFeeLinkExclusionTests(FeeLinkErpOnlyTestsBase):

    def test_fee_link_payment_is_excluded_from_candidate_pool(self):
        payment = self._posted_payment(Decimal('20.00'))
        self._fee_link_exceptions(payment, bank_transaction_id=str(uuid.uuid4()))

        payments = fetch_erp_payments(
            self.bank_account, date(2026, 7, 1), date(2026, 7, 17), direction='DEBIT',
        )
        self.assertEqual(payments, [])

    def test_resolve_to_expense_payment_is_not_excluded(self):
        # pending_bank_payment set but netted_with None — the bank line is
        # still unmatched and the payment must be offered to Java.
        payment = self._posted_payment(Decimal('500.00'), description='Resolve to expense')
        ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='bank_only', direction='DEBIT',
            bank_transaction_id=str(uuid.uuid4()), bank_amount=Decimal('500.00'),
            bank_narration='unexplained debit', bank_date=date(2026, 7, 9),
            pending_bank_payment=payment,
        )

        payments = fetch_erp_payments(
            self.bank_account, date(2026, 7, 1), date(2026, 7, 17), direction='DEBIT',
        )
        self.assertEqual([p['paymentId'] for p in payments], [payment.journal_entry_id])

    def test_ordinary_payments_are_unaffected(self):
        payment = self._posted_payment(Decimal('1000.00'), description='Ordinary expense payment')

        payments = fetch_erp_payments(
            self.bank_account, date(2026, 7, 1), date(2026, 7, 17), direction='DEBIT',
        )
        self.assertEqual([p['paymentId'] for p in payments], [payment.journal_entry_id])

    def test_reversed_transactions_and_their_reversals_are_excluded(self):
        # A reversed transaction and its reversal cancel each other on the
        # GL — neither should ever be offered to Java, or both would come
        # back as phantom erp_only exceptions on every rerun.
        payment = self._posted_payment(Decimal('3000.00'), description='Transfer: Ajao Adijat')
        payment.journal_entry.reverse(self.director, reason='phantom transfer — never hit the bank')

        for direction in ('DEBIT', 'CREDIT'):
            payments = fetch_erp_payments(
                self.bank_account, date(2026, 7, 1), date(2026, 7, 30), direction=direction,
            )
            self.assertEqual(payments, [], f'direction={direction} should offer nothing')


class ResolveFeeLinkErpOnlyExceptionsCommandTests(FeeLinkErpOnlyTestsBase):

    def _false_erp_only_for(self, payment):
        return ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='erp_only', direction='DEBIT',
            loan_payment_id=payment.journal_entry_id, erp_amount=payment.amount,
            erp_narration=f'Bank Payment: {payment.description}', erp_date=date(2026, 7, 9),
        )

    def test_resolves_false_exception_for_unique_line_fee_payment(self):
        payment = self._posted_payment(Decimal('20.00'))
        self._fee_link_exceptions(payment, bank_transaction_id=str(uuid.uuid4()))
        false_exc = self._false_erp_only_for(payment)

        call_command('resolve_fee_link_erp_only_exceptions', stdout=StringIO())

        false_exc.refresh_from_db()
        self.assertTrue(false_exc.resolved)
        self.assertIn('fee', false_exc.resolution_notes.lower())

    def test_leaves_duplicate_fee_exceptions_open_and_reports_them(self):
        # Two fee payments tracing to the SAME bank line — the bank charged
        # once, so one booking is a genuine overstatement; neither may be
        # swept away automatically. The per-recon unique constraint means
        # this can only happen across two different reconciliations (e.g.
        # the same real line reported into two dates' runs) — model that.
        other_recon = DailyReconciliation.objects.create(
            bank_account=self.bank_account, reconciliation_date=date(2026, 7, 10),
            uploaded_by=self.director, statement_file='bank_statements/fee2.csv',
            status='completed', owner=self.director, branch=self.branch, tenant=self.tenant,
        )
        payment_a = self._posted_payment(Decimal('20.00'), description='fee booking A')
        payment_b = self._posted_payment(Decimal('20.00'), description='fee booking B')
        shared_line = str(uuid.uuid4())
        self._fee_link_exceptions(payment_a, bank_transaction_id=shared_line)
        self._fee_link_exceptions(payment_b, bank_transaction_id=shared_line, recon=other_recon)
        exc_a = self._false_erp_only_for(payment_a)
        exc_b = self._false_erp_only_for(payment_b)

        out = StringIO()
        call_command('resolve_fee_link_erp_only_exceptions', stdout=out)

        exc_a.refresh_from_db()
        exc_b.refresh_from_db()
        self.assertFalse(exc_a.resolved)
        self.assertFalse(exc_b.resolved)
        self.assertIn('SUSPECTED DUPLICATE FEES', out.getvalue())

    def test_dry_run_makes_no_changes(self):
        payment = self._posted_payment(Decimal('20.00'))
        self._fee_link_exceptions(payment, bank_transaction_id=str(uuid.uuid4()))
        false_exc = self._false_erp_only_for(payment)

        out = StringIO()
        call_command('resolve_fee_link_erp_only_exceptions', '--dry-run', stdout=out)

        false_exc.refresh_from_db()
        self.assertFalse(false_exc.resolved)
        self.assertIn('DRY RUN', out.getvalue())

    def test_recomputes_reconciliation_counts(self):
        payment = self._posted_payment(Decimal('20.00'))
        self._fee_link_exceptions(payment, bank_transaction_id=str(uuid.uuid4()))
        self._false_erp_only_for(payment)
        self.recon.unmatched_erp_count = 1
        self.recon.save(update_fields=['unmatched_erp_count'])

        call_command('resolve_fee_link_erp_only_exceptions', stdout=StringIO())

        self.recon.refresh_from_db()
        self.assertEqual(self.recon.unmatched_erp_count, 0)

    def test_is_safely_re_runnable(self):
        payment = self._posted_payment(Decimal('20.00'))
        self._fee_link_exceptions(payment, bank_transaction_id=str(uuid.uuid4()))
        self._false_erp_only_for(payment)

        call_command('resolve_fee_link_erp_only_exceptions', stdout=StringIO())
        out = StringIO()
        call_command('resolve_fee_link_erp_only_exceptions', stdout=out)

        self.assertIn('Resolved 0 exception(s)', out.getvalue())
