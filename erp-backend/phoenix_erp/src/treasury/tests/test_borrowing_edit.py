"""Editing a borrowing: drafts change freely; once funds are received only the repayment terms, until anything is recorded."""
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.test import TestCase

from common.managers import set_current_tenant
from treasury.models import BankBorrowing, BorrowingContribution
from treasury.services import borrowings as svc
from treasury.tests.helpers import balance, make_bank_account, make_borrowing, make_env

D = Decimal


class BorrowingEditTests(TestCase):
    def setUp(self):
        self.env = make_env("edit")
        self.owner = self.env['owner']
        self.hq_bank = make_bank_account(self.env, self.env['hq'], "0001")
        self.ik_bank = make_bank_account(self.env, self.env['ikeja'], "0002")

    def tearDown(self):
        set_current_tenant(None)

    def _borrowing(self, receive):
        return make_borrowing(self.env, self.hq_bank, self.ik_bank, principal='5000000.00', rate='2', tenor=12,
                              hq_amount='4000000.00', receive=receive)

    def _kwargs(self, b, **over):
        kw = dict(
            user=self.owner, lender_name=b.lender_name, reference=b.reference, principal=b.principal,
            monthly_rate=b.monthly_rate, tenor_months=b.tenor_months, first_due_date=b.first_due_date,
            debit_branch=b.debit_branch, debit_bank_account=b.debit_bank_account,
            allocations=[{'branch': a.branch, 'amount': a.amount, 'bank_account': a.bank_account}
                         for a in b.allocations.all()],
            contribution_lead_days=b.contribution_lead_days, notes=b.notes,
            interest_method=b.interest_method, repayment_interval_months=b.repayment_interval_months,
        )
        kw.update(over)
        return kw

    def _total_interest(self, b):
        return sum(i.interest_due for i in b.instalments.all())

    def test_draft_switch_to_flat_rebuilds_schedule(self):
        b = self._borrowing(receive=False)
        self.assertAlmostEqual(self._total_interest(b), D('673575.80'), delta=D('0.05'))
        b = svc.update_borrowing(b, **self._kwargs(b, interest_method=BankBorrowing.METHOD_FLAT))
        self.assertEqual(b.instalments.count(), 12)
        self.assertEqual(self._total_interest(b), D('1200000.00'))
        shares = BorrowingContribution.objects.filter(instalment__borrowing=b)
        self.assertEqual(shares.count(), 12)  # old shares soft-deleted, not duplicated
        self.assertEqual(sum(c.interest_part for c in shares), D('240000.00'))

    def test_draft_can_change_amount_and_allocation(self):
        b = self._borrowing(receive=False)
        b = svc.update_borrowing(b, **self._kwargs(
            b, principal=D('6000000'),
            allocations=[{'branch': self.env['hq'], 'amount': D('3000000'), 'bank_account': self.hq_bank},
                         {'branch': self.env['ikeja'], 'amount': D('3000000'), 'bank_account': self.ik_bank}]))
        self.assertEqual(b.principal, D('6000000.00'))
        self.assertEqual({a.branch_id: a.amount for a in b.allocations.all()},
                         {self.env['hq'].pk: D('3000000.00'), self.env['ikeja'].pk: D('3000000.00')})

    def test_draft_quarterly_frequency(self):
        b = self._borrowing(receive=False)
        b = svc.update_borrowing(b, **self._kwargs(b, repayment_interval_months=3))
        self.assertEqual(b.instalments.count(), 4)
        self.assertEqual(b.instalment_count, 4)

    def test_active_can_change_repayment_terms_before_anything_recorded(self):
        b = self._borrowing(receive=True)
        b = svc.update_borrowing(b, **self._kwargs(b, interest_method=BankBorrowing.METHOD_FLAT))
        self.assertEqual(self._total_interest(b), D('1200000.00'))
        self.assertEqual(balance(b.liability_account), D('5000000.00'))  # receipt untouched

    def test_active_cannot_change_amount_or_allocation(self):
        b = self._borrowing(receive=True)
        with self.assertRaises(ValidationError):
            svc.update_borrowing(b, **self._kwargs(
                b, allocations=[{'branch': self.env['hq'], 'amount': D('3000000'), 'bank_account': self.hq_bank},
                                {'branch': self.env['ikeja'], 'amount': D('2000000'), 'bank_account': self.ik_bank}]))

    def test_active_cannot_cross_short_long_term_boundary(self):
        b = self._borrowing(receive=True)
        with self.assertRaises(ValidationError):
            svc.update_borrowing(b, **self._kwargs(b, tenor_months=24))

    def test_locked_once_a_share_is_sent(self):
        b = self._borrowing(receive=True)
        svc.send_contribution(BorrowingContribution.objects.filter(instalment__borrowing=b).first(), self.owner)
        with self.assertRaises(ValidationError):
            svc.update_borrowing(b, **self._kwargs(b, interest_method=BankBorrowing.METHOD_FLAT))
