"""
Tests for banks/management/commands/unmatch_trace_unattached_matches.py —
bulk-frees matched lines that Payment Trace would list under "Unattached
Statement Lines" for their own amount (claimed payment outside the
25-most-recent same-amount payments window), the visible signature of a
date-shifted chain among recurring same-amount payments.
"""
from datetime import date, timedelta
from decimal import Decimal
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from accounts.models import Account
from banks.models import Bank, BankAccount, ReconciliationBankTransaction
from transactions.models import Transaction, TransactionEntry, TransactionSeries

User = get_user_model()


class UnmatchTraceUnattachedMatchesTests(TestCase):

    def setUp(self):
        self.user = User.objects.create_user(username='trace_unmatch_manager', password='test123')
        self.gl_account = Account.objects.create(
            code='2199', name='Trace Unmatch GL', account_level=Account.LEVEL_PARENT
        )
        bank = Bank.objects.create(bank_name='Trace Unmatch Bank', bank_code='984')
        self.bank_account = BankAccount.objects.create(
            bank=bank, account_number='0000000084', account_name='Trace Unmatch Account',
            gl_account=self.gl_account, account_manager=self.user,
        )
        self.series = TransactionSeries.objects.create(code='TU', description='Trace unmatch series')
        self.today = timezone.now().date()

    def _payment(self, amount, txn_date, description='Loan repayment – LN-X | Ref: something'):
        txn = Transaction.objects.create(
            series=self.series, date=txn_date, description=description,
            owner=self.user, created_by=self.user, approved=True,
        )
        TransactionEntry.objects.create(
            transaction=txn, account=self.gl_account, side=TransactionEntry.DEBIT, amount=amount,
        )
        return txn

    def _line(self, bank_ref, amount, value_date, payment=None, confidence='HIGH'):
        return ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref=bank_ref, value_date=value_date,
            direction='CREDIT', amount=amount, narration=f'narration {bank_ref}',
            matched=payment is not None,
            matched_erp_payment_id=payment.id if payment else None,
            match_confidence=confidence if payment else '',
        )

    def _run(self, **options):
        out = StringIO()
        call_command('unmatch_trace_unattached_matches', stdout=out, **options)
        return out.getvalue()

    def test_frees_line_whose_payment_is_outside_the_25_window(self):
        # An old payment pushed out of the window by 25 newer same-amount
        # payments — its line shows in the trace panel and must be freed.
        old_payment = self._payment(Decimal('2000.00'), self.today - timedelta(days=40))
        line = self._line('OUTSIDE-1', Decimal('2000.00'), self.today - timedelta(days=2), payment=old_payment)
        for i in range(25):
            self._payment(Decimal('2000.00'), self.today - timedelta(days=i % 5))

        output = self._run(user_id=self.user.id, apply=True)

        line.refresh_from_db()
        self.assertFalse(line.matched)
        self.assertIn('Freed 1', output)

    def test_leaves_line_whose_payment_is_inside_the_window(self):
        payment = self._payment(Decimal('2000.00'), self.today - timedelta(days=1))
        line = self._line('INSIDE-1', Decimal('2000.00'), self.today - timedelta(days=1), payment=payment)

        output = self._run(user_id=self.user.id, apply=True)

        line.refresh_from_db()
        self.assertTrue(line.matched)
        self.assertIn('Would free 0' if 'DRY RUN' in output else 'Freed 0', output)

    def test_days_scope_excludes_old_lines(self):
        old_payment = self._payment(Decimal('3000.00'), self.today - timedelta(days=60))
        old_line = self._line('OLD-1', Decimal('3000.00'), self.today - timedelta(days=30), payment=old_payment)
        for i in range(25):
            self._payment(Decimal('3000.00'), self.today - timedelta(days=i % 5))

        output = self._run(user_id=self.user.id, apply=True, days=10)

        old_line.refresh_from_db()
        self.assertTrue(old_line.matched)  # outside --days scope, untouched

    def test_manual_match_is_never_freed(self):
        old_payment = self._payment(Decimal('4000.00'), self.today - timedelta(days=40))
        manual_line = self._line(
            'MANUAL-1', Decimal('4000.00'), self.today - timedelta(days=2),
            payment=old_payment, confidence='MANUAL',
        )
        for i in range(25):
            self._payment(Decimal('4000.00'), self.today - timedelta(days=i % 5))

        self._run(user_id=self.user.id, apply=True)

        manual_line.refresh_from_db()
        self.assertTrue(manual_line.matched)

    def test_dry_run_makes_no_changes(self):
        old_payment = self._payment(Decimal('5000.00'), self.today - timedelta(days=40))
        line = self._line('DRY-1', Decimal('5000.00'), self.today - timedelta(days=2), payment=old_payment)
        for i in range(25):
            self._payment(Decimal('5000.00'), self.today - timedelta(days=i % 5))

        output = self._run(user_id=self.user.id)

        line.refresh_from_db()
        self.assertTrue(line.matched)
        self.assertIn('DRY RUN', output)
        self.assertIn('Would free 1', output)

    def test_amount_filter_restricts_scope(self):
        old_a = self._payment(Decimal('6000.00'), self.today - timedelta(days=40))
        line_a = self._line('AMT-A', Decimal('6000.00'), self.today - timedelta(days=2), payment=old_a)
        old_b = self._payment(Decimal('7000.00'), self.today - timedelta(days=40))
        line_b = self._line('AMT-B', Decimal('7000.00'), self.today - timedelta(days=2), payment=old_b)
        for i in range(25):
            self._payment(Decimal('6000.00'), self.today - timedelta(days=i % 5))
            self._payment(Decimal('7000.00'), self.today - timedelta(days=i % 5))

        self._run(user_id=self.user.id, apply=True, amount='6000')

        line_a.refresh_from_db()
        line_b.refresh_from_db()
        self.assertFalse(line_a.matched)
        self.assertTrue(line_b.matched)  # different amount, out of scope
