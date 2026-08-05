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

from django.test import TestCase
from django.contrib.auth import get_user_model

from accounts.models import Account
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

        self.petty_cash_account = Account.objects.create(
            code='1102', name='Petty Cash', account_type='ASSET',
            account_level='CHILD', allow_manual_entries=True,
            owner=self.user, branch=self.branch,
        )
        self.transport_account = Account.objects.create(
            code='6001', name='Transportation Expense', account_type='EXPENSE',
            account_level='CHILD', allow_manual_entries=True,
            owner=self.user, branch=self.branch,
        )
        self.water_account = Account.objects.create(
            code='6002', name='Water Expense', account_type='EXPENSE',
            account_level='CHILD', allow_manual_entries=True,
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
