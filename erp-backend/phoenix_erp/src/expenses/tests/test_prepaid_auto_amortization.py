"""
Automatic monthly release of prepaid expenses (client request 2026-10-30:
"auto JV for rent, from prepayment to expense account").
"""
from datetime import date
from decimal import Decimal

from django.test import SimpleTestCase, TestCase

from expenses.models import PrepaidExpense
from expenses.services.prepaid_amortization import (
    due_period_ends, plan_due_amortizations, post_due_amortizations,
    scheduled_cumulative,
)
from expenses.tests.test_expenses import ExpenseAccountingTest
from transactions.models import Transaction, TransactionEntry


class ScheduleMathTests(SimpleTestCase):
    def test_even_split(self):
        self.assertEqual(scheduled_cumulative(Decimal('1200000'), 12, 1), Decimal('100000.00'))
        self.assertEqual(scheduled_cumulative(Decimal('1200000'), 12, 12), Decimal('1200000'))

    def test_pennies_land_in_last_month(self):
        total = Decimal('1000.00')
        steps = [scheduled_cumulative(total, 3, k) for k in range(0, 4)]
        monthly = [steps[k] - steps[k - 1] for k in range(1, 4)]
        self.assertEqual(sum(monthly), total)
        self.assertEqual(monthly, [Decimal('333.33'), Decimal('333.34'), Decimal('333.33')])

    def test_due_period_ends_mid_month_start(self):
        # Start 15 Mar: month 1 is March, posted 31 Mar.
        due = list(due_period_ends(date(2026, 3, 15), 12, date(2026, 5, 31)))
        self.assertEqual(due, [(1, date(2026, 3, 31)), (2, date(2026, 4, 30)), (3, date(2026, 5, 31))])

    def test_nothing_due_before_first_month_end(self):
        self.assertEqual(list(due_period_ends(date(2026, 3, 1), 12, date(2026, 3, 30))), [])

    def test_stops_at_term(self):
        due = list(due_period_ends(date(2026, 1, 1), 2, date(2026, 12, 31)))
        self.assertEqual([k for k, _ in due], [1, 2])


class AutoAmortizationTests(TestCase):
    def setUp(self):
        ExpenseAccountingTest.setUp(self)
        self.prepaid = PrepaidExpense.objects.create(
            reference_number='PREP-RENT-1',
            category=self.category,
            purchase_date=date(2026, 1, 5),
            description='Office rent Jan-Dec 2026',
            total_amount=Decimal('1200000.00'),
            branch=self.branch,
            owner=self.user,
            auto_amortize=True,
            amortization_start_date=date(2026, 1, 1),
            amortization_months=12,
        )

    def _journals(self):
        return Transaction.objects.filter(
            workflow_reference__startswith='PREP-RENT-1-AMORT-'
        ).order_by('date')

    def test_posts_one_journal_per_passed_month_end(self):
        posted = post_due_amortizations(self.prepaid.pk, date(2026, 3, 15))

        self.assertEqual([p[0] for p in posted], [date(2026, 1, 31), date(2026, 2, 28)])
        journals = list(self._journals())
        self.assertEqual([j.date for j in journals], [date(2026, 1, 31), date(2026, 2, 28)])
        for j in journals:
            dr = j.entries.get(side=TransactionEntry.DEBIT)
            cr = j.entries.get(side=TransactionEntry.CREDIT)
            self.assertEqual(dr.account, self.expense_account)
            self.assertEqual(cr.account, self.prepaid_account)
            self.assertEqual(dr.amount, Decimal('100000.00'))
            self.assertEqual(cr.amount, Decimal('100000.00'))

        self.prepaid.refresh_from_db()
        self.assertEqual(self.prepaid.consumed_amount, Decimal('200000.00'))
        self.assertEqual(self.prepaid.remaining_amount, Decimal('1000000.00'))
        ExpenseAccountingTest.verify_trial_balance(self, 'unbalanced after auto-amortization')

    def test_rerun_same_day_posts_nothing(self):
        post_due_amortizations(self.prepaid.pk, date(2026, 3, 15))
        self.assertEqual(post_due_amortizations(self.prepaid.pk, date(2026, 3, 15)), [])
        self.assertEqual(self._journals().count(), 2)

    def test_full_term_clears_balance(self):
        post_due_amortizations(self.prepaid.pk, date(2027, 6, 30))
        self.prepaid.refresh_from_db()
        self.assertEqual(self._journals().count(), 12)
        self.assertEqual(self.prepaid.remaining_amount, Decimal('0.00'))
        self.assertEqual(self.prepaid.status, 'fully_consumed')

    def test_manual_amortization_is_not_released_twice(self):
        from expenses.services.expense_accounting import PrepaidExpenseAccountingService
        # Someone records January by hand first.
        PrepaidExpenseAccountingService(self.prepaid).amortize_period(
            amount=Decimal('100000.00'), period_end_date=date(2026, 1, 31),
        )
        self.prepaid.refresh_from_db()

        posted = post_due_amortizations(self.prepaid.pk, date(2026, 2, 28))

        self.assertEqual([(p[0], p[1]) for p in posted], [(date(2026, 2, 28), Decimal('100000.00'))])
        self.prepaid.refresh_from_db()
        self.assertEqual(self.prepaid.consumed_amount, Decimal('200000.00'))

    def test_switched_off_does_nothing(self):
        self.prepaid.auto_amortize = False
        self.prepaid.save()
        self.assertEqual(plan_due_amortizations(self.prepaid, date(2026, 6, 30)), [])

    def test_celery_task_runs(self):
        from expenses.tasks import post_due_prepaid_amortizations
        result = post_due_prepaid_amortizations.apply().get()
        self.assertEqual(result['errors'], 0)
        self.assertGreaterEqual(result['journals_posted'], 1)
