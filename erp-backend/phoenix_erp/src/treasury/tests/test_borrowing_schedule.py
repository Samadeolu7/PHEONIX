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

    def test_flat_interest_is_rate_on_full_principal_every_month(self):
        # ₦5M at 2% a month flat over 12 months -> 5M x 2% x 12 = ₦1.2M interest.
        rows = preview_schedule(Decimal('5000000'), Decimal('2'), 12, date(2026, 12, 5), interest_method='flat')
        self.assertEqual(sum(r['interest_due'] for r in rows), Decimal('1200000.00'))
        self.assertEqual(sum(r['principal_due'] for r in rows), Decimal('5000000.00'))
        for r in rows:
            self.assertEqual(r['interest_due'], Decimal('100000.00'))
            self.assertEqual(r['total_due'], r['principal_due'] + r['interest_due'])

    def test_same_terms_on_reducing_balance(self):
        rows = preview_schedule(Decimal('5000000'), Decimal('2'), 12, date(2026, 12, 5), interest_method='reducing')
        self.assertAlmostEqual(sum(r['interest_due'] for r in rows), Decimal('673575.80'), delta=Decimal('0.05'))

    def test_flat_branch_shares_sum_exactly(self):
        rows = preview_schedule(
            Decimal('5000000'), Decimal('2'), 12, date(2026, 12, 5),
            allocations=[{'branch_id': 1, 'amount': Decimal('4000000')}, {'branch_id': 2, 'amount': Decimal('1000000')}],
            debit_branch_id=1, interest_method='flat',
        )
        parts = [c for r in rows for c in r['contributions']]
        self.assertEqual(sum(c['principal_part'] for c in parts), Decimal('1000000'))
        self.assertEqual(sum(c['interest_part'] for c in parts), Decimal('240000.00'))

    def test_quarterly_reducing_balance_uses_three_months_of_rate_per_payment(self):
        rows = preview_schedule(Decimal('1200000'), Decimal('2'), 12, date(2027, 1, 10),
                                interest_method='reducing', repayment_interval_months=3)
        self.assertEqual(len(rows), 4)
        self.assertEqual([r['due_date'] for r in rows],
                         [date(2027, 1, 10), date(2027, 4, 10), date(2027, 7, 10), date(2027, 10, 10)])
        self.assertEqual(rows[0]['interest_due'], Decimal('72000.00'))  # 1.2M x 6%
        self.assertEqual(sum(r['principal_due'] for r in rows), Decimal('1200000'))

    def test_flat_total_interest_does_not_depend_on_frequency(self):
        for step in (1, 3, 6, 12):
            rows = preview_schedule(Decimal('5000000'), Decimal('2'), 12, date(2027, 1, 10),
                                    interest_method='flat', repayment_interval_months=step)
            self.assertEqual(len(rows), 12 // step)
            self.assertEqual(sum(r['interest_due'] for r in rows), Decimal('1200000.00'))

    def test_interest_only_repays_principal_with_last_payment(self):
        rows = preview_schedule(Decimal('5000000'), Decimal('2'), 12, date(2027, 1, 10),
                                interest_method='interest_only')
        self.assertEqual(len(rows), 12)
        for r in rows[:-1]:
            self.assertEqual((r['principal_due'], r['interest_due']), (Decimal('0.00'), Decimal('100000.00')))
        self.assertEqual(rows[-1]['total_due'], Decimal('5100000.00'))

    def test_interest_only_branch_share_gets_principal_on_last_payment(self):
        rows = preview_schedule(
            Decimal('5000000'), Decimal('2'), 12, date(2027, 1, 10), interest_method='interest_only',
            allocations=[{'branch_id': 1, 'amount': Decimal('4000000')}, {'branch_id': 2, 'amount': Decimal('1000000')}],
            debit_branch_id=1)
        self.assertEqual(rows[0]['contributions'][0]['amount'], Decimal('20000.00'))
        self.assertEqual(rows[-1]['contributions'][0]['principal_part'], Decimal('1000000'))

    def test_single_payment_at_end(self):
        rows = preview_schedule(Decimal('5000000'), Decimal('2'), 12, date(2027, 12, 10),
                                interest_method='flat', repayment_interval_months=12)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['total_due'], Decimal('6200000.00'))

    def test_term_must_divide_into_whole_periods(self):
        from django.core.exceptions import ValidationError
        with self.assertRaises(ValidationError):
            preview_schedule(Decimal('1000'), Decimal('2'), 10, date(2027, 1, 5), repayment_interval_months=3)

    def test_quote_lists_every_method(self):
        from treasury.services.borrowings import quote
        options = {o['method']: o for o in quote(Decimal('5000000'), Decimal('2'), 12)}
        self.assertEqual(set(options), {'reducing', 'flat', 'interest_only'})
        self.assertEqual(options['flat']['total_interest'], Decimal('1200000.00'))
        self.assertEqual(options['flat']['first_payment'], Decimal('516666.67'))
        self.assertAlmostEqual(options['reducing']['total_interest'], Decimal('673575.80'), delta=Decimal('0.05'))
        self.assertEqual(options['interest_only']['last_payment'], Decimal('5100000.00'))
        self.assertEqual(options['reducing']['number_of_payments'], 12)

    def test_unknown_interest_method_is_rejected(self):
        from django.core.exceptions import ValidationError
        with self.assertRaises(ValidationError):
            preview_schedule(Decimal('1000'), Decimal('2'), 3, date(2027, 1, 5), interest_method='compound')

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
