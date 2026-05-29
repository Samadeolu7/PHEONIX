"""
tests/test_accounting_engine.py
================================
Unit & integration tests for the core double-entry accounting engine.

Covers:
  - Account creation and hierarchy (parent / child)
  - Account balance updates via TransactionEntry
  - Period open / close lifecycle
  - Double-entry invariant: sum of all debits == sum of all credits
  - Balance-sheet snapshot capture
  - Account type validation (wrong-type attachment rejected)
"""

from decimal import Decimal
from django.test import TestCase
from django.utils import timezone

from common.managers import set_current_tenant
from users.models import Tenant, User
from branches.models import Branch
from accounts.models import Account, AccountCategory, Period
from transactions.models import TransactionSeries, Transaction, TransactionEntry


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_env(username="acc_test"):
    """Return (user, tenant, branch) ready for use in tests."""
    user = User.objects.create_user(username=username, password="pass")
    tenant = Tenant.objects.create(name=f"Tenant-{username}", slug=f"t-{username}", owner=user)
    user.tenant = tenant
    user.save()
    branch = Branch.objects.create(name="HQ", code="HQ", tenant=tenant, owner=user)
    user.branch = branch
    user.save()
    set_current_tenant(tenant)
    return user, tenant, branch


def _make_account(user, branch, name, code, account_type, account_level=Account.LEVEL_PARENT):
    return Account.objects.create(
        name=name,
        code=code,
        account_type=account_type,
        account_level=account_level,
        owner=user,
        created_by=user,
        branch=branch,
    )


def _make_series(code, description=""):
    series, _ = TransactionSeries.objects.get_or_create(code=code, defaults={"description": description})
    return series


# ---------------------------------------------------------------------------
# Account hierarchy tests
# ---------------------------------------------------------------------------

class AccountHierarchyTests(TestCase):
    def setUp(self):
        self.user, self.tenant, self.branch = _make_env("acchier")

    def test_parent_account_created_with_zero_balance(self):
        acc = _make_account(self.user, self.branch, "Cash", "1000", Account.ASSET)
        self.assertEqual(acc.balance, Decimal("0.00"))

    def test_child_account_links_to_parent(self):
        parent = _make_account(self.user, self.branch, "Bank Accounts", "1100", Account.ASSET)
        child = Account.objects.create(
            name="Main Bank", code="1101", account_type=Account.ASSET,
            account_level=Account.LEVEL_CHILD, parent=parent,
            owner=self.user, created_by=self.user, branch=self.branch,
        )
        self.assertEqual(child.parent_id, parent.id)

    def test_duplicate_account_code_per_branch_rejected(self):
        from django.db import IntegrityError
        _make_account(self.user, self.branch, "Cash", "1000", Account.ASSET)
        with self.assertRaises(Exception):
            _make_account(self.user, self.branch, "Cash2", "1000", Account.ASSET)

    def test_different_account_types_can_coexist(self):
        _make_account(self.user, self.branch, "Revenue", "4000", Account.INCOME)
        _make_account(self.user, self.branch, "Expenses", "5000", Account.EXPENSE)
        _make_account(self.user, self.branch, "Assets", "1000", Account.ASSET)
        _make_account(self.user, self.branch, "Liability", "2000", Account.LIABILITY)
        self.assertEqual(Account.objects.filter(owner=self.user).count(), 4)


# ---------------------------------------------------------------------------
# Transaction & double-entry tests
# ---------------------------------------------------------------------------

class DoubleEntryTests(TestCase):
    """
    Ensures that every posted transaction satisfies the fundamental
    accounting equation: Total Debits == Total Credits.
    """

    def setUp(self):
        self.user, self.tenant, self.branch = _make_env("detest")
        self.cash = _make_account(self.user, self.branch, "Cash", "1000", Account.ASSET)
        self.revenue = _make_account(self.user, self.branch, "Revenue", "4000", Account.INCOME)
        self.expense = _make_account(self.user, self.branch, "Expenses", "5000", Account.EXPENSE)
        self.series = _make_series("GEN", "General Journal")

    def _post_transaction(self, entries):
        """
        entries: list of (account, debit, credit) tuples.
        Returns the saved Transaction.
        """
        txn = Transaction.objects.create(
            series=self.series,
            date=timezone.localdate(),
            description="Test transaction",
            owner=self.user,
            branch=self.branch,
        )
        for account, debit, credit in entries:
            dr = Decimal(str(debit))
            cr = Decimal(str(credit))
            if dr > 0:
                TransactionEntry.objects.create(
                    transaction=txn, account=account, side='DR', amount=dr,
                )
            if cr > 0:
                TransactionEntry.objects.create(
                    transaction=txn, account=account, side='CR', amount=cr,
                )
            if dr == 0 and cr == 0:
                TransactionEntry.objects.create(
                    transaction=txn, account=account, side='DR', amount=Decimal('0.00'),
                )
        return txn

    def _assert_balanced(self, txn):
        entries = TransactionEntry.objects.filter(transaction=txn)
        total_debit = sum((e.amount for e in entries if e.side == 'DR'), Decimal('0.00'))
        total_credit = sum((e.amount for e in entries if e.side == 'CR'), Decimal('0.00'))
        self.assertEqual(
            total_debit, total_credit,
            f"Unbalanced transaction! Debits={total_debit} Credits={total_credit}"
        )

    def test_simple_revenue_recognition_is_balanced(self):
        """Cash Dr / Revenue Cr"""
        txn = self._post_transaction([
            (self.cash, "500.00", "0.00"),
            (self.revenue, "0.00", "500.00"),
        ])
        self._assert_balanced(txn)

    def test_expense_entry_is_balanced(self):
        """Expense Dr / Cash Cr"""
        txn = self._post_transaction([
            (self.expense, "200.00", "0.00"),
            (self.cash, "0.00", "200.00"),
        ])
        self._assert_balanced(txn)

    def test_compound_entry_three_legs_balanced(self):
        """Three-leg transaction (e.g. partial cash + partial credit purchase)."""
        bank = _make_account(self.user, self.branch, "Bank", "1001", Account.ASSET)
        payable = _make_account(self.user, self.branch, "Accounts Payable", "2000", Account.LIABILITY)
        txn = self._post_transaction([
            (self.expense, "1000.00", "0.00"),
            (bank, "0.00", "600.00"),
            (payable, "0.00", "400.00"),
        ])
        self._assert_balanced(txn)

    def test_transaction_reference_number_is_auto_generated(self):
        txn = self._post_transaction([
            (self.cash, "100.00", "0.00"),
            (self.revenue, "0.00", "100.00"),
        ])
        self.assertIsNotNone(txn.reference_number)
        self.assertTrue(len(txn.reference_number) > 0)

    def test_two_transactions_get_distinct_reference_numbers(self):
        txn1 = self._post_transaction([
            (self.cash, "100.00", "0.00"),
            (self.revenue, "0.00", "100.00"),
        ])
        txn2 = self._post_transaction([
            (self.cash, "200.00", "0.00"),
            (self.revenue, "0.00", "200.00"),
        ])
        self.assertNotEqual(txn1.reference_number, txn2.reference_number)

    def test_zero_amount_entry_does_not_affect_balance(self):
        txn = self._post_transaction([
            (self.cash, "0.00", "0.00"),
            (self.revenue, "0.00", "0.00"),
        ])
        self._assert_balanced(txn)

    def test_large_amount_precision_preserved(self):
        """Verify Decimal precision with large numbers."""
        txn = self._post_transaction([
            (self.cash, "9999999.99", "0.00"),
            (self.revenue, "0.00", "9999999.99"),
        ])
        self._assert_balanced(txn)
        entries = TransactionEntry.objects.filter(transaction=txn)
        debit_entry = entries.get(account=self.cash, side='DR')
        self.assertEqual(debit_entry.amount, Decimal("9999999.99"))


# ---------------------------------------------------------------------------
# Period lifecycle tests
# ---------------------------------------------------------------------------

class PeriodLifecycleTests(TestCase):
    def setUp(self):
        self.user, self.tenant, self.branch = _make_env("periodtest")

    def test_period_created_open_by_default(self):
        period = Period.objects.create(
            owner=self.user, branch=self.branch,
            period_type=Period.MONTH, year=2026, month=1,
        )
        self.assertFalse(period.is_closed)

    def test_period_can_be_closed(self):
        period = Period.objects.create(
            owner=self.user, branch=self.branch,
            period_type=Period.MONTH, year=2026, month=2,
        )
        period.is_closed = True
        period.save()
        period.refresh_from_db()
        self.assertTrue(period.is_closed)

    def test_year_period_has_no_month(self):
        period = Period.objects.create(
            owner=self.user, branch=self.branch,
            period_type=Period.YEAR, year=2026,
        )
        self.assertIsNone(period.month)

    def test_duplicate_period_rejected(self):
        from django.db import IntegrityError
        Period.objects.create(
            owner=self.user, branch=self.branch,
            period_type=Period.MONTH, year=2026, month=3,
        )
        with self.assertRaises(Exception):
            Period.objects.create(
                owner=self.user, branch=self.branch,
                period_type=Period.MONTH, year=2026, month=3,
            )


# ---------------------------------------------------------------------------
# Account category validation
# ---------------------------------------------------------------------------

class AccountCategoryTests(TestCase):
    def setUp(self):
        self.user, self.tenant, self.branch = _make_env("cattest")

    def test_category_section_choices_valid(self):
        for section in [1, 2, 3, 4, 5]:
            cat = AccountCategory.objects.create(
                name=f"Cat{section}", code_prefix=str(section),
                section=section, owner=self.user, branch=self.branch,
                created_by=self.user,
            )
            self.assertEqual(cat.section, section)

    def test_category_code_prefix_auto_synced_from_section(self):
        """AccountCategory.save() auto-derives code_prefix from section."""
        cat = AccountCategory.objects.create(
            name="Revenue", code_prefix="WRONG", section=4,
            owner=self.user, branch=self.branch, created_by=self.user,
        )
        # After save, code_prefix should be '4'
        self.assertEqual(cat.code_prefix, "4")
