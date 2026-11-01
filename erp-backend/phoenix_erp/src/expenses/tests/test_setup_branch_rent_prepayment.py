"""
setup_branch_rent_prepayment: put an existing Rent Prepayment balance on the
monthly schedule without re-posting months already moved by manual JV.
"""
from datetime import date
from decimal import Decimal
from io import StringIO

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

from accounts.models import Account
from expenses.models import ExpenseCategory, PrepaidExpense
from expenses.tests import test_expenses as _base  # module import: avoids re-running its tests here
from transactions.models import Transaction, TransactionEntry, TransactionSeries


class SetupBranchRentPrepaymentTests(TestCase):
    def setUp(self):
        _base.ExpenseAccountingTest.setUp(self)
        self.series, _ = TransactionSeries.objects.get_or_create(code='JV', defaults={'description': 'JV'})
        mk = dict(owner=self.user, branch=self.branch, created_by=self.user, account_level='CHILD')
        self.rent_prepaid = Account.objects.create(
            name='Rent Prepayment', code='1360', account_type='ASSET', category=self.asset_category, **mk)
        self.rent_expense = Account.objects.create(
            name='Office Rent (2026)', code='5360', account_type='EXPENSE', category=self.expense_category, **mk)

        # Rent for Jul 2026 - Jun 2027 paid in June.
        self._jv(date(2026, 6, 20), self.rent_prepaid, self.cash_account, '1200000', 'Rent paid Jul26-Jun27')
        # July-September moved by hand; October not yet.
        for d in (date(2026, 7, 31), date(2026, 8, 31), date(2026, 9, 30)):
            self._jv(d, self.rent_expense, self.rent_prepaid, '100000', f'Rent {d:%b}')

    def _jv(self, d, dr, cr, amount, desc):
        t = Transaction.objects.create(series=self.series, date=d, description=desc,
                                       branch=self.branch, owner=self.user, tenant=self.tenant)
        TransactionEntry.objects.create(transaction=t, account=dr, side=TransactionEntry.DEBIT, amount=Decimal(amount))
        TransactionEntry.objects.create(transaction=t, account=cr, side=TransactionEntry.CREDIT, amount=Decimal(amount))
        t.post()
        return t

    def _run(self, *extra):
        out = StringIO()
        call_command('setup_branch_rent_prepayment', '--branch', str(self.branch.pk),
                     '--start', '2026-07', '--as-of', '2026-11-01', *extra, stdout=out)
        return out.getvalue()

    def _amort_journals(self):
        return Transaction.objects.filter(workflow_reference__contains='-AMORT-')

    def test_preview_writes_nothing(self):
        out = self._run()
        self.assertIn('Months covered (inferred): 12', out)
        self.assertIn('2026-10-31  100,000.00', out)
        self.assertEqual(PrepaidExpense.objects.count(), 0)
        self.assertEqual(self._amort_journals().count(), 0)

    def test_commit_posts_only_october(self):
        self._run('--commit')

        journals = list(self._amort_journals())
        self.assertEqual(len(journals), 1)
        self.assertEqual(journals[0].date, date(2026, 10, 31))
        self.assertEqual(journals[0].entries.get(side=TransactionEntry.DEBIT).account, self.rent_expense)
        self.assertEqual(journals[0].entries.get(side=TransactionEntry.CREDIT).account, self.rent_prepaid)

        p = PrepaidExpense.objects.get()
        self.assertEqual(p.total_amount, Decimal('1200000.00'))
        self.assertEqual(p.consumed_amount, Decimal('400000.00'))
        self.assertEqual(p.remaining_amount, Decimal('800000.00'))
        self.assertEqual(p.amortization_months, 12)
        cat = ExpenseCategory.objects.get(pk=p.category_id)
        self.assertEqual(cat.prepaid_account, self.rent_prepaid)
        self.assertEqual(cat.expense_account, self.rent_expense)
        _base.ExpenseAccountingTest.verify_trial_balance(self, 'unbalanced after rent setup')

    def test_ignores_current_assets_parent_and_empty_duplicate(self):
        # Seen live on Orimerunmu: "Prepayments and Other Current Assets" (cuRRENT)
        # plus a second, empty "Rent Prepaid" account.
        mk = dict(owner=self.user, branch=self.branch, created_by=self.user,
                  account_type='ASSET', category=self.asset_category)
        Account.objects.create(name='Prepayments and Other Current Assets', code='1130',
                               account_level='PARENT', **mk)
        Account.objects.create(name='Rent Prepaid', code='1131', account_level='CHILD', **mk)
        out = self._run()
        self.assertIn(f'id={self.rent_prepaid.id}', out)
        self.assertIn('2026-10-31  100,000.00', out)

    def test_cannot_set_up_twice(self):
        self._run('--commit')
        with self.assertRaises(CommandError):
            self._run('--commit')
