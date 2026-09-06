"""
Regression tests for per-line GL posting on PettyCashVoucher.

Before PettyCashVoucherLine, a voucher covering several expense categories
(e.g. Transportation + Water + Fuel for Generator in one trip) posted its
*entire* amount to whichever category happened to be first — Water and Fuel
never hit their own expense accounts. These tests pin down the fix: one
debit TransactionEntry per distinct expense account, in the right amount,
plus the legacy no-lines path still working unchanged.
"""
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.test import TestCase
from django.contrib.auth import get_user_model

from accounts.models import Account
from banks.models import Bank, BankAccount
from branches.models import Branch
from expenses.models import ExpenseCategory
from cash_management.models import PettyCashFund, PettyCashVoucher, PettyCashVoucherLine
from transactions.models import TransactionEntry

User = get_user_model()


class PettyCashVoucherLineDisbursementTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='custodian', email='custodian@example.com', password='testpass123'
        )
        self.branch = Branch.objects.create(name='Main Branch', code='MB01', owner=self.user)
        self.user.branch = self.branch
        self.user.save()

        self.cash_parent = Account.objects.create(
            code='1100', name='Cash and Cash Equivalents', account_type='ASSET',
            account_level='PARENT', allow_manual_entries=False,
            owner=self.user, branch=self.branch,
        )
        self.expense_parent = Account.objects.create(
            code='6000', name='Operating Expenses', account_type='EXPENSE',
            account_level='PARENT', allow_manual_entries=False,
            owner=self.user, branch=self.branch,
        )

        self.petty_cash_account = Account.objects.create(
            code='1102', name='Petty Cash', account_type='ASSET',
            account_level='CHILD', parent=self.cash_parent, allow_manual_entries=True,
            owner=self.user, branch=self.branch,
        )
        self.transport_account = Account.objects.create(
            code='6001', name='Transportation Expense', account_type='EXPENSE',
            account_level='CHILD', parent=self.expense_parent, allow_manual_entries=True,
            owner=self.user, branch=self.branch,
        )
        self.water_account = Account.objects.create(
            code='6002', name='Water Expense', account_type='EXPENSE',
            account_level='CHILD', parent=self.expense_parent, allow_manual_entries=True,
            owner=self.user, branch=self.branch,
        )

        self.transport_category = ExpenseCategory.objects.create(
            name='Transportation', code='EXP-TRANS',
            expense_account=self.transport_account,
            owner=self.user, branch=self.branch,
        )
        self.water_category = ExpenseCategory.objects.create(
            name='Water', code='EXP-WATER',
            expense_account=self.water_account,
            owner=self.user, branch=self.branch,
        )

        self.fund = PettyCashFund.objects.create(
            fund_name='Main Office Petty Cash', fund_code='PC-TEST-01',
            custodian=self.user, petty_cash_account=self.petty_cash_account,
            float_amount=Decimal('100000.00'), current_balance=Decimal('100000.00'),
            replenishment_threshold=Decimal('10000.00'),
            single_transaction_limit=Decimal('100000.00'),
            status='active', established_by=self.user,
            owner=self.user, branch=self.branch,
        )

    def _make_voucher(self, amount):
        voucher = PettyCashVoucher.objects.create(
            fund=self.fund,
            voucher_number='PCV-TEST-0001',
            requested_by=self.user,
            purpose='Weekly errand run',
            amount=amount,
            payee_name='Office Errands',
            status='approved',
            owner=self.user, branch=self.branch,
        )
        return voucher

    def test_multi_category_lines_post_to_distinct_accounts(self):
        """
        3 lines across 2 categories (Transport gets 2 lines, Water gets 1)
        should produce exactly 2 debit entries, each summing that category's
        lines, plus 1 credit entry for the full total — not one lump debit.
        """
        voucher = self._make_voucher(Decimal('35300.00'))
        PettyCashVoucherLine.objects.create(
            voucher=voucher, expense_category=self.transport_category,
            description='Weekly transport', amount=Decimal('20000.00'), line_order=0,
        )
        PettyCashVoucherLine.objects.create(
            voucher=voucher, expense_category=self.water_category,
            description='Water for drinking', amount=Decimal('5300.00'), line_order=1,
        )
        PettyCashVoucherLine.objects.create(
            voucher=voucher, expense_category=self.transport_category,
            description='Extra dispatch rider', amount=Decimal('10000.00'), line_order=2,
        )

        voucher.disburse(user=self.user)

        entries = TransactionEntry.objects.filter(transaction=voucher.journal_entry)
        debit_entries = entries.filter(side=TransactionEntry.DEBIT)
        credit_entries = entries.filter(side=TransactionEntry.CREDIT)

        self.assertEqual(debit_entries.count(), 2)
        self.assertEqual(credit_entries.count(), 1)

        transport_debit = debit_entries.get(account=self.transport_account)
        water_debit = debit_entries.get(account=self.water_account)
        self.assertEqual(transport_debit.amount, Decimal('30000.00'))
        self.assertEqual(water_debit.amount, Decimal('5300.00'))

        credit_entry = credit_entries.first()
        self.assertEqual(credit_entry.account, self.petty_cash_account)
        self.assertEqual(credit_entry.amount, Decimal('35300.00'))

        # Books must balance.
        self.assertEqual(
            sum(e.amount for e in debit_entries), sum(e.amount for e in credit_entries)
        )

    def test_legacy_voucher_without_lines_still_posts_single_debit(self):
        """A voucher with no PettyCashVoucherLine rows keeps working exactly
        as before: one debit to its single expense_category's account."""
        voucher = self._make_voucher(Decimal('5000.00'))
        voucher.expense_category = self.transport_category
        voucher.save(update_fields=['expense_category'])

        voucher.disburse(user=self.user)

        entries = TransactionEntry.objects.filter(transaction=voucher.journal_entry)
        debit_entries = entries.filter(side=TransactionEntry.DEBIT)

        self.assertEqual(debit_entries.count(), 1)
        self.assertEqual(debit_entries.first().account, self.transport_account)
        self.assertEqual(debit_entries.first().amount, Decimal('5000.00'))


class PettyCashBankTransferDisbursementTests(TestCase):
    """
    Regression tests for the bank_transfer disbursement_mode: disburse()
    must credit the chosen BankAccount's GL account (not the fund's
    petty_cash_account), leave fund.current_balance untouched (no till
    involved), and enforce the full 3-way maker-checker split (requester !=
    approver != disburser) — mirroring loans.LoanDisbursement.
    """

    def setUp(self):
        self.requester = User.objects.create_user(
            username='requester', email='requester@example.com', password='testpass123'
        )
        self.approver = User.objects.create_user(
            username='approver', email='approver@example.com', password='testpass123'
        )
        self.disburser = User.objects.create_user(
            username='disburser', email='disburser@example.com', password='testpass123'
        )
        self.branch = Branch.objects.create(name='Main Branch', code='MB02', owner=self.requester)
        for u in (self.requester, self.approver, self.disburser):
            u.branch = self.branch
            # is_authorized_to_disburse() would otherwise reject requester/
            # approver outright (they're not the fund's custodian) before
            # ever reaching the maker-checker check these tests target —
            # granting all three system-admin status isolates the
            # maker-checker guard as the actual thing under test.
            u.is_system_admin = True
            u.save()

        self.cash_parent = Account.objects.create(
            code='1100', name='Cash and Cash Equivalents', account_type='ASSET',
            account_level='PARENT', allow_manual_entries=False,
            owner=self.requester, branch=self.branch,
        )
        self.expense_parent = Account.objects.create(
            code='6000', name='Operating Expenses', account_type='EXPENSE',
            account_level='PARENT', allow_manual_entries=False,
            owner=self.requester, branch=self.branch,
        )
        self.petty_cash_account = Account.objects.create(
            code='1102', name='Petty Cash', account_type='ASSET',
            account_level='CHILD', parent=self.cash_parent, allow_manual_entries=True,
            owner=self.requester, branch=self.branch,
        )
        self.transport_account = Account.objects.create(
            code='6001', name='Transportation Expense', account_type='EXPENSE',
            account_level='CHILD', parent=self.expense_parent, allow_manual_entries=True,
            owner=self.requester, branch=self.branch,
        )
        self.transport_category = ExpenseCategory.objects.create(
            name='Transportation', code='EXP-TRANS-BT',
            expense_account=self.transport_account,
            owner=self.requester, branch=self.branch,
        )

        self.bank_gl_account = Account.objects.create(
            code='1104', name='GT Bank Operating Account', account_type='ASSET',
            account_level='CHILD', parent=self.cash_parent, allow_manual_entries=True,
            owner=self.requester, branch=self.branch,
        )
        self.bank = Bank.objects.create(bank_name='GT Bank', owner=self.requester, branch=self.branch)
        self.bank_account = BankAccount.objects.create(
            bank=self.bank, account_number='0123456789', account_name='Company Operating Account',
            gl_account=self.bank_gl_account, account_manager=self.requester,
            owner=self.requester, branch=self.branch,
        )

        self.fund = PettyCashFund.objects.create(
            fund_name='Bank Transfer Fund', fund_code='PC-TEST-BT',
            custodian=self.disburser, petty_cash_account=self.petty_cash_account,
            float_amount=Decimal('0.00'), current_balance=Decimal('0.00'),
            replenishment_threshold=Decimal('0.00'),
            single_transaction_limit=Decimal('100000.00'),
            disbursement_mode='bank_transfer',
            status='active', established_by=self.requester,
            owner=self.requester, branch=self.branch,
        )

    def _make_approved_voucher(self, amount=Decimal('5000.00')):
        voucher = PettyCashVoucher.objects.create(
            fund=self.fund,
            voucher_number='PCV-TEST-BT-0001',
            requested_by=self.requester,
            purpose='Vendor payment',
            amount=amount,
            expense_category=self.transport_category,
            payee_name='Some Vendor',
            status='pending',
            owner=self.requester, branch=self.branch,
        )
        voucher.approve(self.approver)
        return voucher

    def test_bank_transfer_mode_credits_bank_gl_account_not_petty_cash(self):
        voucher = self._make_approved_voucher(Decimal('5000.00'))

        voucher.disburse(user=self.disburser, bank_account_id=self.bank_account.pk)

        entries = TransactionEntry.objects.filter(transaction=voucher.journal_entry)
        credit_entries = entries.filter(side=TransactionEntry.CREDIT)
        self.assertEqual(credit_entries.count(), 1)
        self.assertEqual(credit_entries.first().account, self.bank_gl_account)

        self.fund.refresh_from_db()
        self.assertEqual(self.fund.current_balance, Decimal('0.00'))

        voucher.refresh_from_db()
        self.assertEqual(voucher.status, 'disbursed')
        self.assertEqual(voucher.disbursement_account_id, self.bank_gl_account.pk)

    def test_bank_transfer_mode_rejects_requester_as_disburser(self):
        voucher = self._make_approved_voucher()
        with self.assertRaises(ValidationError):
            voucher.disburse(user=self.requester, bank_account_id=self.bank_account.pk)

    def test_bank_transfer_mode_rejects_approver_as_disburser(self):
        voucher = self._make_approved_voucher()
        with self.assertRaises(ValidationError):
            voucher.disburse(user=self.approver, bank_account_id=self.bank_account.pk)

    def test_bank_transfer_mode_rejects_requester_as_approver(self):
        voucher = PettyCashVoucher.objects.create(
            fund=self.fund,
            voucher_number='PCV-TEST-BT-0002',
            requested_by=self.requester,
            purpose='Vendor payment',
            amount=Decimal('5000.00'),
            expense_category=self.transport_category,
            payee_name='Some Vendor',
            status='pending',
            owner=self.requester, branch=self.branch,
        )
        with self.assertRaises(ValidationError):
            voucher.approve(self.requester)

    def test_bank_transfer_mode_requires_bank_account(self):
        voucher = self._make_approved_voucher()
        with self.assertRaises(ValidationError):
            voucher.disburse(user=self.disburser)
