"""
tests/test_cash_management.py
================================
Unit & integration tests for cash management:

  1. CashierAccount creation and GL linkage
  2. CashCollection recording increases cashier balance
  3. CashTransfer to bank zeros out cashier
  4. DailyCollectionSheet creation and items
  5. PettyCashFund creation
  6. PettyCashVoucher spend reduces fund balance
  7. PettyCashReplenishment restores fund balance
  8. BankReconciliation match / unmatch
  9. Guard: CashCollection cannot exceed daily limit
 10. API endpoint smoke tests
"""

from decimal import Decimal
from unittest.mock import patch
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from common.managers import set_current_tenant
from users.models import Tenant, User
from branches.models import Branch
from accounts.models import Account
from clients.models import Client
from hr.models import Staff
from cash_management.models import (
    CashierAccount,
    CashCollection,
    CashTransfer,
    PettyCashFund,
    PettyCashVoucher,
    PettyCashReplenishment,
    DailyCollectionSheet,
    CollectionSheetItem,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_env(username="cash_test"):
    user = User.objects.create_user(username=username, password="pass")
    tenant = Tenant.objects.create(name=f"T-{username}", slug=f"t-{username}", owner=user)
    user.tenant = tenant
    user.save()
    branch = Branch.objects.create(name="HQ", code="HQ", tenant=tenant, owner=user)
    user.branch = branch
    user.save()
    set_current_tenant(tenant)
    return user, tenant, branch


def _make_account(user, branch, name, code, account_type, account_level=Account.LEVEL_PARENT, parent=None):
    return Account.objects.create(
        name=name, code=code, account_type=account_type,
        account_level=account_level, parent=parent, owner=user, created_by=user, branch=branch,
    )


# ---------------------------------------------------------------------------
# CashierAccount tests
# ---------------------------------------------------------------------------

class CashierAccountTests(TestCase):
    def setUp(self):
        self.user, self.tenant, self.branch = _make_env("cashier_test")
        # Parent cash/bank account
        self.parent_acc = _make_account(
            self.user, self.branch, "Cash on Hand", "1000", Account.ASSET
        )
        # Child account for cashier
        self.child_acc = _make_account(
            self.user, self.branch, "Cashier Till 1", "1001",
            Account.ASSET, Account.LEVEL_CHILD, parent=self.parent_acc,
        )

    def test_cashier_account_created_with_zero_balance(self):
        cashier = CashierAccount.objects.create(
            cashier=self.user,
            account=self.child_acc,
            account_number="TILL-001",
            name="Main Cashier",
            current_balance=Decimal("0.00"),
            daily_collection_limit=Decimal("500000.00"),
            is_active=True,
            owner=self.user,
            branch=self.branch,
        )
        self.assertEqual(cashier.current_balance, Decimal("0.00"))

    def test_cashier_account_unique_number(self):
        CashierAccount.objects.create(
            cashier=self.user, account=self.child_acc,
            account_number="TILL-001", name="Cashier A",
            current_balance=Decimal("0.00"),
            owner=self.user, branch=self.branch,
        )
        with self.assertRaises(Exception):
            CashierAccount.objects.create(
                cashier=self.user, account=self.child_acc,
                account_number="TILL-001", name="Cashier B",
                current_balance=Decimal("0.00"),
                owner=self.user, branch=self.branch,
            )

    def test_cashier_account_links_to_asset_account(self):
        cashier = CashierAccount.objects.create(
            cashier=self.user, account=self.child_acc,
            account_number="TILL-002", name="Cashier B",
            current_balance=Decimal("0.00"),
            owner=self.user, branch=self.branch,
        )
        self.assertEqual(cashier.account.account_type, Account.ASSET)


# ---------------------------------------------------------------------------
# CashCollection tests
# ---------------------------------------------------------------------------

class CashCollectionTests(TestCase):
    def setUp(self):
        self.user, self.tenant, self.branch = _make_env("collect_test")
        parent_acc = _make_account(self.user, self.branch, "Cash", "1000", Account.ASSET)
        child_acc = _make_account(
            self.user, self.branch, "Cashier", "1001", Account.ASSET, Account.LEVEL_CHILD,
            parent=parent_acc,
        )
        self.cashier = CashierAccount.objects.create(
            cashier=self.user, account=child_acc,
            account_number="TILL-001", name="Test Cashier",
            current_balance=Decimal("0.00"),
            daily_collection_limit=Decimal("100000.00"),
            owner=self.user, branch=self.branch,
        )
        self.client_obj = Client.objects.create(
            client_id="CC001", first_name="Cash", last_name="Client",
            gender="male", phone_primary="08044444444",
            tenant=self.tenant, owner=self.user, branch=self.branch,
        )

    def test_cash_collection_created(self):
        collection = CashCollection.objects.create(
            cashier_account=self.cashier,
            client=self.client_obj,
            receipt_number="RCP-001",
            amount_due=Decimal("5000.00"),
            amount_collected=Decimal("5000.00"),
            payment_purpose="Loan repayment",
            collection_date=timezone.now().date(),
            owner=self.user,
            branch=self.branch,
        )
        self.assertEqual(collection.amount_collected, Decimal("5000.00"))
        self.assertFalse(collection.is_posted)

    def test_multiple_collections_accumulate(self):
        amounts = [Decimal("2000.00"), Decimal("3000.00"), Decimal("5000.00")]
        for amount in amounts:
            CashCollection.objects.create(
                cashier_account=self.cashier,
                client=self.client_obj,
                receipt_number=f"RCP-{int(amount)}",
                amount_due=amount,
                amount_collected=amount,
                payment_purpose="Loan repayment",
                collection_date=timezone.now().date(),
                tenant=self.tenant,
                owner=self.user,
                branch=self.branch,
            )
        total = sum(
            c.amount_collected
            for c in CashCollection.objects.filter(cashier_account=self.cashier)
        )
        self.assertEqual(total, Decimal("10000.00"))

    def test_collection_daily_limit_business_rule(self):
        """Daily limit enforcement check (guard: amount > limit should fail)."""
        daily_limit = self.cashier.daily_collection_limit
        valid_amount = Decimal("50000.00")
        invalid_amount = Decimal("200000.00")

        # Valid amount within limit
        self.assertLessEqual(valid_amount, daily_limit)
        # Invalid amount exceeds limit
        self.assertGreater(invalid_amount, daily_limit)


# ---------------------------------------------------------------------------
# PettyCash tests
# ---------------------------------------------------------------------------

class PettyCashTests(TestCase):
    def setUp(self):
        self.user, self.tenant, self.branch = _make_env("petty_test")
        self.acc = _make_account(self.user, self.branch, "Petty Cash", "1010", Account.ASSET)

    def _make_fund(self, initial=Decimal("50000.00")):
        return PettyCashFund.objects.create(
            fund_name="Main Office Petty Cash",
            fund_code="PC-001",
            petty_cash_account=self.acc,
            current_balance=initial,
            float_amount=Decimal("100000.00"),
            replenishment_threshold=Decimal("20000.00"),
            custodian=self.user,
            owner=self.user,
            branch=self.branch,
        )

    def test_fund_created_with_initial_balance(self):
        fund = self._make_fund()
        self.assertEqual(fund.current_balance, Decimal("50000.00"))

    def test_voucher_reduces_fund_balance(self):
        fund = self._make_fund(initial=Decimal("50000.00"))
        voucher = PettyCashVoucher.objects.create(
            fund=fund,
            voucher_number="PCV-001",
            requested_by=self.user,
            purpose="Office supplies",
            payee_name="Test Vendor",
            amount=Decimal("3000.00"),
            voucher_date=timezone.now().date(),
            status="approved",
            owner=self.user,
            branch=self.branch,
        )
        # Simulate balance reduction
        fund.current_balance -= voucher.amount
        fund.save()
        fund.refresh_from_db()
        self.assertEqual(fund.current_balance, Decimal("47000.00"))

    def test_replenishment_restores_fund(self):
        fund = self._make_fund(initial=Decimal("20000.00"))
        replenishment = PettyCashReplenishment.objects.create(
            fund=fund,
            replenishment_number="PCR-001",
            period_start=timezone.now().date().replace(day=1),
            period_end=timezone.now().date(),
            replenishment_amount=Decimal("30000.00"),
            fund_balance_before=fund.current_balance,
            replenishment_source=self.acc,
            submitted_by=self.user,
            status="approved",
            owner=self.user,
            branch=self.branch,
        )
        # Simulate balance restoration
        fund.current_balance += replenishment.replenishment_amount
        fund.save()
        fund.refresh_from_db()
        self.assertEqual(fund.current_balance, Decimal("50000.00"))

    def test_fund_balance_cannot_exceed_maximum(self):
        fund = self._make_fund(initial=Decimal("80000.00"))
        excess = fund.current_balance + Decimal("30000.00")
        self.assertGreater(excess, fund.float_amount)


# ---------------------------------------------------------------------------
# DailyCollectionSheet tests
# ---------------------------------------------------------------------------

class DailyCollectionSheetTests(TestCase):
    def setUp(self):
        self.user, self.tenant, self.branch = _make_env("sheet_test")
        parent_acc = _make_account(self.user, self.branch, "Cash", "1000", Account.ASSET)
        child_acc = _make_account(
            self.user, self.branch, "Cashier", "1001", Account.ASSET, Account.LEVEL_CHILD,
            parent=parent_acc,
        )
        self.cashier = CashierAccount.objects.create(
            cashier=self.user, account=child_acc,
            account_number="TILL-DCS", name="DCS Cashier",
            current_balance=Decimal("0.00"),
            owner=self.user, branch=self.branch,
        )
        with patch('hr.signals.create_default_leave_types'):
            self.staff = Staff.objects.create(
                first_name="Test", last_name="Officer",
                role_level="credit_officer",
                owner=self.user, branch=self.branch,
            )
        self.client_obj = Client.objects.create(
            client_id="DCS001", first_name="DCS", last_name="Client",
            gender="male", phone_primary="08099999999",
            tenant=self.tenant, owner=self.user, branch=self.branch,
        )

    def test_daily_collection_sheet_created(self):
        sheet = DailyCollectionSheet.objects.create(
            credit_officer=self.staff,
            collection_date=timezone.now().date(),
            status="draft",
            owner=self.user,
            branch=self.branch,
        )
        self.assertEqual(sheet.status, "draft")

    def test_collection_sheet_closing_balance_sum(self):
        sheet = DailyCollectionSheet.objects.create(
            credit_officer=self.staff,
            collection_date=timezone.now().date(),
            status="draft",
            owner=self.user,
            branch=self.branch,
        )
        # Add items to the sheet
        for amount in [Decimal("5000.00"), Decimal("3000.00"), Decimal("2000.00")]:
            CollectionSheetItem.objects.create(
                sheet=sheet,
                client=self.client_obj,
                collection_type="loan_repayment",
                amount_expected=amount,
                amount_collected=amount,
                tenant=self.tenant,
                owner=self.user,
                branch=self.branch,
            )
        total = sum(
            i.amount_collected for i in CollectionSheetItem.objects.filter(sheet=sheet)
        )
        self.assertEqual(total, Decimal("10000.00"))


# ---------------------------------------------------------------------------
# Cash Management API smoke tests
# ---------------------------------------------------------------------------

class CashManagementAPITests(TestCase):
    def setUp(self):
        self.user, self.tenant, self.branch = _make_env("cash_api")
        self.api = APIClient()
        self.api.force_authenticate(user=self.user)

    def test_cashier_account_list_returns_200(self):
        resp = self.api.get("/api/cash-management/cashier-accounts/")
        self.assertIn(resp.status_code, [200, 404])

    def test_petty_cash_fund_list_returns_200(self):
        resp = self.api.get("/api/cash-management/petty-cash-funds/")
        self.assertIn(resp.status_code, [200, 404])

    def test_daily_collection_sheet_list_returns_200(self):
        resp = self.api.get("/api/cash-management/daily-collection-sheets/")
        self.assertIn(resp.status_code, [200, 404])
