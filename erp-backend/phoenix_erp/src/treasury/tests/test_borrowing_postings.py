"""GL postings for a bank borrowing shared between HQ (debit branch) and Ikeja."""
from datetime import timedelta
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.test import TestCase
from django.utils import timezone

from accounts.utils.account_creation import get_system_account
from common.managers import set_current_tenant
from interbranch.models import InterBranchClearingAccount
from treasury.models import BankBorrowing, BorrowingContribution, BorrowingInstalment
from treasury.services import borrowings as svc
from treasury.tests.helpers import balance, make_bank_account, make_borrowing, make_env

D = Decimal


class BorrowingPostingTests(TestCase):
    def setUp(self):
        self.env = make_env("post")
        self.owner = self.env['owner']
        self.hq_bank = make_bank_account(self.env, self.env['hq'], "0001")
        self.ik_bank = make_bank_account(self.env, self.env['ikeja'], "0002")

    def tearDown(self):
        set_current_tenant(None)

    def _borrowing(self, **kw):
        kw.setdefault('principal', '10000000.00')
        kw.setdefault('rate', '3')
        kw.setdefault('tenor', 12)
        kw.setdefault('hq_amount', '4000000.00')
        return make_borrowing(self.env, self.hq_bank, self.ik_bank, **kw)

    def test_receive_distributes_proceeds(self):
        b = self._borrowing()
        self.assertEqual(b.status, BankBorrowing.STATUS_ACTIVE)
        self.assertEqual(balance(self.hq_bank.gl_account), D('4000000.00'))   # 10M in, 6M sent to Ikeja
        self.assertEqual(balance(self.ik_bank.gl_account), D('6000000.00'))
        self.assertEqual(balance(b.liability_account), D('10000000.00'))
        ikeja_alloc = b.allocations.get(branch=self.env['ikeja'])
        self.assertIsNotNone(ikeja_alloc.proceeds_transfer)
        self.assertIsNone(b.allocations.get(branch=self.env['hq']).proceeds_transfer)

    def test_cannot_receive_twice(self):
        b = self._borrowing()
        with self.assertRaises(ValidationError):
            svc.receive_borrowing(b, self.owner)

    def test_allocations_must_equal_principal(self):
        with self.assertRaises(ValidationError):
            svc.create_borrowing(
                user=self.owner, lender_name="X", reference="", principal=D('100'), monthly_rate=D('0'),
                tenor_months=2, first_due_date=timezone.localdate(), debit_branch=self.env['hq'],
                debit_bank_account=self.hq_bank,
                allocations=[{'branch': self.env['ikeja'], 'amount': D('99.99'), 'bank_account': self.ik_bank}])

    def test_bank_account_must_belong_to_its_branch(self):
        with self.assertRaises(ValidationError):
            svc.create_borrowing(
                user=self.owner, lender_name="X", reference="", principal=D('100'), monthly_rate=D('0'),
                tenor_months=2, first_due_date=timezone.localdate(), debit_branch=self.env['hq'],
                debit_bank_account=self.hq_bank,
                allocations=[{'branch': self.env['ikeja'], 'amount': D('100'), 'bank_account': self.hq_bank}])

    def test_cannot_send_share_before_funds_received(self):
        b = self._borrowing(receive=False)
        c = BorrowingContribution.objects.filter(instalment__borrowing=b).first()
        with self.assertRaises(ValidationError):
            svc.send_contribution(c, self.owner)

    def test_share_and_instalment_postings_split_interest_by_branch(self):
        b = self._borrowing()
        inst = b.instalments.get(number=1)
        share = inst.contributions.get(branch=self.env['ikeja'])
        hq_before = balance(self.hq_bank.gl_account)
        ik_before = balance(self.ik_bank.gl_account)

        svc.send_contribution(share, self.owner)
        self.assertEqual(balance(self.ik_bank.gl_account), ik_before - share.amount)
        self.assertEqual(balance(self.hq_bank.gl_account), hq_before + share.amount)
        with self.assertRaises(ValidationError):
            svc.send_contribution(share, self.owner)  # already sent

        svc.record_instalment(inst, self.owner)
        self.assertEqual(balance(self.hq_bank.gl_account), hq_before + share.amount - inst.total_due)
        self.assertEqual(balance(b.liability_account), D('10000000.00') - inst.principal_due)

        ik_interest = get_system_account('interest_on_borrowings', self.owner, self.env['ikeja'])
        hq_interest = get_system_account('interest_on_borrowings', self.owner, self.env['hq'])
        self.assertEqual(balance(ik_interest), share.interest_part)
        self.assertEqual(balance(hq_interest), inst.interest_due - share.interest_part)  # HQ keeps only its own share

    def test_instalments_must_be_recorded_in_order(self):
        b = self._borrowing()
        with self.assertRaises(ValidationError):
            svc.record_instalment(b.instalments.get(number=2), self.owner)

    def test_full_repayment_clears_liability_and_interbranch_balances(self):
        b = self._borrowing(rate='3', tenor=12)
        for inst in b.instalments.order_by('number'):
            for c in inst.contributions.all():
                svc.send_contribution(c, self.owner)
            svc.record_instalment(inst, self.owner)

        b.refresh_from_db()
        self.assertEqual(b.status, BankBorrowing.STATUS_PAID_OFF)
        self.assertEqual(balance(b.liability_account), D('0.00'))

        total_interest = sum(i.interest_due for i in b.instalments.all())
        ik_interest = get_system_account('interest_on_borrowings', self.owner, self.env['ikeja'])
        hq_interest = get_system_account('interest_on_borrowings', self.owner, self.env['hq'])
        self.assertEqual(balance(ik_interest) + balance(hq_interest), total_interest)
        # Ikeja carries ~60% of the interest, HQ ~40%.
        self.assertAlmostEqual(balance(ik_interest) / total_interest, D('0.6'), places=3)

        # After everything is repaid, each branch's inter-branch position against the other nets to zero.
        def net_due(branch, counterparty):
            due_from = InterBranchClearingAccount.objects.filter(
                branch=branch, counterparty_branch=counterparty, direction='due_from').first()
            due_to = InterBranchClearingAccount.objects.filter(
                branch=branch, counterparty_branch=counterparty, direction='due_to').first()
            return (balance(due_from.account) if due_from else D('0')) - (balance(due_to.account) if due_to else D('0'))

        self.assertEqual(net_due(self.env['hq'], self.env['ikeja']), D('0.00'))
        self.assertEqual(net_due(self.env['ikeja'], self.env['hq']), D('0.00'))


class BorrowingReviewFixTests(TestCase):
    """Regression tests from the post-build review."""

    def setUp(self):
        self.env = make_env("rvw")
        self.owner = self.env['owner']
        self.hq_bank = make_bank_account(self.env, self.env['hq'], "7001")
        self.ik_bank = make_bank_account(self.env, self.env['ikeja'], "7002")

    def tearDown(self):
        set_current_tenant(None)

    def test_last_instalment_before_last_share_keeps_borrowing_open_for_the_share(self):
        b = make_borrowing(self.env, self.hq_bank, self.ik_bank, principal='1000.00', rate='2', tenor=2,
                           first_due=timezone.localdate() - timedelta(days=1), hq_amount='400.00')
        for inst in b.instalments.order_by('number'):
            svc.record_instalment(inst, self.owner)  # HQ pays the bank before Ikeja sends anything
        b.refresh_from_db()
        self.assertEqual(b.status, BankBorrowing.STATUS_ACTIVE)  # shares still owed
        for c in BorrowingContribution.objects.filter(instalment__borrowing=b):
            svc.send_contribution(c, self.owner)  # must still be possible
        b.refresh_from_db()
        self.assertEqual(b.status, BankBorrowing.STATUS_PAID_OFF)

    def test_future_posting_dates_are_refused(self):
        b = make_borrowing(self.env, self.hq_bank, self.ik_bank, receive=False)
        with self.assertRaises(ValidationError):
            svc.receive_borrowing(b, self.owner, received_on=timezone.localdate() + timedelta(days=1))
        b = svc.receive_borrowing(b, self.owner)
        with self.assertRaises(ValidationError):
            svc.record_instalment(b.instalments.get(number=1), self.owner,
                                  paid_on=timezone.localdate() + timedelta(days=2))
        with self.assertRaises(ValidationError):
            svc.record_instalment(b.instalments.get(number=1), self.owner,
                                  paid_on=timezone.localdate() - timedelta(days=30))  # before receipt

    def test_draft_can_be_deleted_but_received_cannot(self):
        draft = make_borrowing(self.env, self.hq_bank, self.ik_bank, receive=False)
        svc.delete_draft_borrowing(draft, self.owner)
        self.assertFalse(BankBorrowing.objects.filter(pk=draft.pk).exists())
        self.assertFalse(BorrowingContribution.objects.filter(instalment__borrowing_id=draft.pk).exists())
        live = make_borrowing(self.env, self.hq_bank, self.ik_bank)
        with self.assertRaises(ValidationError):
            svc.delete_draft_borrowing(live, self.owner)
