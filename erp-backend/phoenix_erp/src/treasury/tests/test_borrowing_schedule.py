"""The bank's ₦10M / 3% a month / 12 month table must be reproduced, and branch shares must add up exactly."""
from datetime import date
from decimal import Decimal

from django.test import SimpleTestCase

from treasury.services.borrowings import preview_schedule


class BorrowingScheduleTests(SimpleTestCase):
    def setUp(self):
        self.rows = preview_schedule(Decimal('10000000'), Decimal('3'), 12, date(2026, 11, 5))

    def test_matches_banks_repayment_table(self):
        self.assertEqual(len(self.rows), 12)
        # Bank's table (rounded to the naira): payment 1,004,621; first row interest 300,000 / principal 704,621.
        for row in self.rows[:-1]:
            self.assertAlmostEqual(row['total_due'], Decimal('1004620.85'), delta=Decimal('0.02'))
        first = self.rows[0]
        self.assertEqual(first['interest_due'], Decimal('300000.00'))
        self.assertAlmostEqual(first['principal_due'], Decimal('704621'), delta=Decimal('1'))
        self.assertAlmostEqual(self.rows[1]['interest_due'], Decimal('278861'), delta=Decimal('1'))
        self.assertAlmostEqual(self.rows[-1]['interest_due'], Decimal('29261'), delta=Decimal('1'))

    def test_principal_fully_repaid_and_total_interest(self):
        self.assertEqual(sum(r['principal_due'] for r in self.rows), Decimal('10000000.00'))
        self.assertAlmostEqual(sum(r['interest_due'] for r in self.rows), Decimal('2055450'), delta=Decimal('2'))

    def test_due_dates_repeat_on_same_day_of_month(self):
        self.assertEqual(self.rows[0]['due_date'], date(2026, 11, 5))
        self.assertEqual(self.rows[1]['due_date'], date(2026, 12, 5))
        self.assertEqual(self.rows[2]['due_date'], date(2027, 1, 5))
        self.assertEqual(self.rows[-1]['due_date'], date(2027, 10, 5))

    def test_month_end_due_day_is_clamped(self):
        rows = preview_schedule(Decimal('1200'), Decimal('0'), 3, date(2027, 1, 31))
        self.assertEqual([r['due_date'] for r in rows], [date(2027, 1, 31), date(2027, 2, 28), date(2027, 3, 31)])

    def test_branch_shares_sum_exactly_and_are_due_before_instalment(self):
        rows = preview_schedule(
            Decimal('10000000'), Decimal('3'), 12, date(2026, 11, 5),
            allocations=[{'branch_id': 1, 'amount': Decimal('4000000')},
                         {'branch_id': 2, 'amount': Decimal('3500000')},
                         {'branch_id': 3, 'amount': Decimal('2500000')}],
            debit_branch_id=3, lead_days=3,
        )
        for branch_id, amount in ((1, Decimal('4000000')), (2, Decimal('3500000'))):
            parts = [c for r in rows for c in r['contributions'] if c['branch_id'] == branch_id]
            self.assertEqual(len(parts), 12)
            self.assertEqual(sum(c['principal_part'] for c in parts), amount)  # no rounding drift
        first = rows[0]
        self.assertEqual({c['branch_id'] for c in first['contributions']}, {1, 2})  # debit branch has no row
        for c in first['contributions']:
            self.assertEqual(c['due_date'], date(2026, 11, 2))
            self.assertEqual(c['amount'], c['principal_part'] + c['interest_part'])
        share_1 = next(c for c in first['contributions'] if c['branch_id'] == 1)
        self.assertAlmostEqual(share_1['amount'], first['total_due'] * Decimal('0.4'), delta=Decimal('0.02'))
