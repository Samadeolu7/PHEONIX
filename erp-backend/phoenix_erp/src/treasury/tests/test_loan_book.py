"""Loan-book check behind the forecast: schedule vs loan record vs ledger, and the explain command."""
import csv
import os
import tempfile
from datetime import timedelta
from decimal import Decimal
from io import StringIO

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from common.managers import set_current_tenant
from treasury.services import loan_book as lb
from treasury.services.forecast import loan_receivables
from treasury.tests.helpers import make_bank_account, make_env, make_pending_loan, set_balance

D = Decimal


class _LoanBookBase(TestCase):
    def setUp(self):
        self.env = make_env("lbk")
        make_bank_account(self.env, self.env['ikeja'], "9401")
        self.loan = make_pending_loan(self.env, self.env['ikeja'])
        self.loan.status = 'active'
        self.today = timezone.localdate()
        self.end = self.today + timedelta(days=45)
        self.n = 0

    def tearDown(self):
        set_current_tenant(None)

    def _owes(self, record, ledger=None, origin='native'):
        self.loan.outstanding_principal = D(record)
        self.loan.origin = origin
        self.loan.save()
        set_balance(self.loan.account, record if ledger is None else ledger)

    def _row(self, days_ago, due, paid='0', status='pending'):
        from loans.models import LoanRepaymentSchedule
        self.n += 1
        return LoanRepaymentSchedule.objects.create(
            loan=self.loan, installment_number=self.n, due_date=self.today - timedelta(days=days_ago),
            principal_due=D(due), interest_due=D('0'), total_due=D(due), total_paid=D(paid), status=status,
            tenant=self.env['tenant'], owner=self.env['owner'], branch=self.env['ikeja'])

    def _book_row(self):
        return next(r for r in lb.loan_book(self.env['ikeja'], self.today, self.end) if r['loan_id'] == self.loan.pk)


class LoanBookTests(_LoanBookBase):
    def test_totals_tie_back_to_the_forecast(self):
        self._owes('500')
        self._row(-5, '600')
        self._row(10, '400', status='overdue')
        totals, by_cause = lb.summarize(lb.loan_book(self.env['ikeja'], self.today, self.end))
        arrears, future, excess, _ = loan_receivables(self.env['ikeja'], self.today, self.end)
        self.assertEqual(totals['forecast_overdue'], arrears)
        self.assertEqual(totals['forecast_due_in_window'], sum(future.values(), D('0')).quantize(D('0.01')))
        self.assertEqual(totals['excess'], excess)
        self.assertEqual(totals['excess_in_overdue'], D('200.00'))   # 400 overdue, half of it is excess
        self.assertEqual(by_cause[lb.CAUSE_PAYMENTS_OFF_SCHEDULE]['loans'], 1)

    def test_imported_loan_with_ledger_agreeing_is_a_stale_old_system_tail(self):
        self._owes('500', origin='legacy_import')
        self._row(30, '1000', status='overdue')
        self.assertEqual(self._book_row()['cause'], lb.CAUSE_STALE_LEGACY)

    def test_cancelled_rows_still_read_by_the_forecast_are_identified(self):
        self._owes('500')
        self._row(60, '1000', status=lb.RETIRED)    # cancelled by a restructure, never paid
        self._row(-10, '500')                       # the new instalment carrying the balance
        r = self._book_row()
        self.assertEqual(r['cause'], lb.CAUSE_RETIRED_ROWS)
        self.assertEqual(r['retired_unpaid'], D('1000'))
        self.assertEqual(r['schedule_unpaid'], D('500'))
        self.assertEqual(r['excess_without_retired'], D('0'))
        # What the forecast does today: the real 500 due is scaled down by the cancelled 1,000.
        self.assertEqual(r['forecast_due_in_window'].quantize(D('0.01')), D('166.67'))

    def test_open_loan_owing_nothing(self):
        self._owes('0')
        self._row(-3, '200')
        self.assertEqual(self._book_row()['cause'], lb.CAUSE_NO_BALANCE)

    def test_record_below_and_above_the_ledger(self):
        self._owes('500', ledger='1000')
        self._row(-3, '1000')
        r = self._book_row()
        self.assertEqual((r['cause'], r['ledger_gap']), (lb.CAUSE_RECORD_BELOW_LEDGER, D('500')))
        self._owes('500', ledger='100')
        self.assertEqual(self._book_row()['cause'], lb.CAUSE_RECORD_ABOVE_LEDGER)

    def test_schedule_showing_less_than_owed_has_no_cause_but_is_measured(self):
        self._owes('1000')
        self._row(-3, '300')
        r = self._book_row()
        self.assertEqual((r['cause'], r['short']), ('', D('700')))

    def test_balances_the_forecast_ignores_are_listed(self):
        from accounts.models import Account
        self._owes('250')
        self.loan.status = 'paid_off'
        self.loan.save()
        orphan = Account.objects.create(
            name="Loan with no record", code="130099", account_type=Account.LOAN, account_level=Account.LEVEL_CHILD,
            parent=self.loan.account.parent, owner=self.env['owner'], created_by=self.env['owner'],
            branch=self.env['ikeja'])
        set_balance(orphan, '75')
        self.assertEqual(lb.loan_book(self.env['ikeja'], self.today, self.end), [])
        reasons = {r['loan_number']: r['reason'] for r in lb.uncounted_balances(self.env['ikeja'])}
        self.assertIn("paid_off", reasons[self.loan.loan_number])
        self.assertEqual(reasons['130099'], 'Loan GL account with no loan attached')

    def test_collection_history_shows_due_that_can_never_be_paid(self):
        self._owes('1000')
        self._row(30, '100', '100', status='paid')
        self._row(20, '100', status=lb.RETIRED)
        months, _, _ = lb.collection_history(self.env['ikeja'], self.today, 90)
        self.assertEqual(sum((m['due'] for m in months), D('0')), D('200'))
        self.assertEqual(sum((m['paid'] for m in months), D('0')), D('100'))
        self.assertEqual(sum((m['retired_due'] for m in months), D('0')), D('100'))


class ExplainCommandTests(_LoanBookBase):
    def test_branch_report_prints_every_section_and_writes_the_loan_book(self):
        self._owes('500', origin='legacy_import')
        self._row(-5, '600')
        self._row(10, '400', status='overdue')
        path = os.path.join(tempfile.mkdtemp(), 'book.csv')
        out = StringIO()
        call_command('explain_branch_forecast', branch=str(self.env['ikeja'].pk), csv_path=path, stdout=out)
        text = out.getvalue()
        for heading in ('1. Cash and bank now', '2. Committed payments', '3. Expected money in',
                        'Collection rate by month', '4. Loan book', '5. Schedule shows MORE',
                        '6. Schedule shows LESS', '7. Loan balances the forecast does not count',
                        '8. Biggest arrears', '9. Biggest repayments'):
            self.assertIn(heading, text)
        self.assertIn(self.loan.loan_number, text)
        self.assertIn(lb.CAUSE_STALE_LEGACY, text)
        with open(path, encoding='utf-8-sig') as fh:
            rows = list(csv.DictReader(fh))
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['loan_number'], self.loan.loan_number)
        self.assertEqual(rows[0]['excess'], '500.00')
        self.assertIn('Repair Schedule', rows[0]['suggested_fix'])

    def test_single_loan_report_lists_every_instalment(self):
        self._owes('500')
        self._row(60, '1000', status=lb.RETIRED)
        self._row(-10, '500')
        out = StringIO()
        call_command('explain_branch_forecast', loan_number=self.loan.loan_number, stdout=out)
        text = out.getvalue()
        self.assertIn('Instalments', text)
        self.assertIn('<- cancelled', text)
        self.assertIn('Cancelled instalments still counted', text)
