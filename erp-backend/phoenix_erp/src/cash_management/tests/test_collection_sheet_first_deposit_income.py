"""
Regression test: CollectionSheetItem._do_post() for collection_type=
'savings_deposit' called SavingsAccount.deposit() directly, bypassing
savings.services.handle_first_deposit_income(). On a daily-contribution
product configured with first_deposit_is_income=True, this meant the first
deposit of the calendar month collected via a field officer's daily
collection sheet was credited straight to the client's savings balance
instead of being swept to the income GL account — the same rule already
enforced on the generic SavingsAccountViewSet.deposit and
ContributionScheduleViewSet.mark_paid endpoints.
"""
from datetime import date
from decimal import Decimal

from django.test import TestCase

from common.managers import set_current_tenant
from users.models import Tenant, User, Role
from branches.models import Branch
from accounts.models import Account
from products.models import Product
from clients.models import Client
from hr.models import Staff
from savings.models import SavingsAccount, SavingsProduct
from cash_management.models import DailyCollectionSheet, CollectionSheetItem, CashierAccount


class CollectionSheetSavingsDepositFirstIncomeTests(TestCase):
    def setUp(self):
        set_current_tenant(None)
        self.owner = User.objects.create_user(username="csi_fdi_owner", password="pass")
        self.tenant = Tenant.objects.create(name="CSI FDI Tenant", slug="csi-fdi-tenant", owner=self.owner)
        self.owner.tenant = self.tenant
        self.owner.save()

        self.branch = Branch.objects.create(name="Branch", code="CSIFDI", tenant=self.tenant, owner=self.owner)
        self.owner.branch = self.branch
        self.owner.save()
        set_current_tenant(self.tenant)

        self.officer_user = User.objects.create_user(username="csi_fdi_officer", password="pass")
        self.officer_user.tenant = self.tenant
        self.officer_user.branch = self.branch
        self.officer_user.save()
        self.officer = Staff.objects.get(user=self.officer_user)
        self.officer.owner = self.owner
        self.officer.branch = self.branch
        self.officer.save()

        cash_parent = Account.objects.create(
            name="Cash", code="1000", account_type=Account.ASSET,
            account_level=Account.LEVEL_PARENT, owner=self.owner, created_by=self.owner, branch=self.branch,
        )
        self.till = Account.objects.create(
            name="Officer Till", code="1001", account_type=Account.ASSET,
            account_level=Account.LEVEL_CHILD, parent=cash_parent,
            owner=self.owner, created_by=self.owner, branch=self.branch,
        )
        self.cashier_account = CashierAccount.objects.create(
            cashier=self.officer_user, account=self.till, account_number="CA-001",
            name="Officer Till", is_active=True, owner=self.owner, branch=self.branch,
        )

        savings_parent = Account.objects.create(
            name="Savings", code="2100", account_type=Account.SAVINGS,
            account_level=Account.LEVEL_PARENT, owner=self.owner, created_by=self.owner, branch=self.branch,
        )
        self.savings_gl = Account.objects.create(
            name="Client Savings", code="2101", account_type=Account.SAVINGS,
            account_level=Account.LEVEL_CHILD, parent=savings_parent,
            owner=self.owner, created_by=self.owner, branch=self.branch,
        )
        income_parent = Account.objects.create(
            name="Income", code="4000", account_type=Account.INCOME,
            account_level=Account.LEVEL_PARENT, owner=self.owner, created_by=self.owner, branch=self.branch,
        )
        self.income_account = Account.objects.create(
            name="Daily Contribution Income", code="4001", account_type=Account.INCOME,
            account_level=Account.LEVEL_CHILD, parent=income_parent,
            owner=self.owner, created_by=self.owner, branch=self.branch,
        )

        self.product = Product.objects.create(
            name="Daily Contribution", code="DC-1", product_type="SAVINGS",
            owner=self.owner, branch=self.branch,
        )
        SavingsProduct.objects.create(
            product=self.product,
            is_daily_contribution=True,
            first_deposit_is_income=True,
            first_deposit_income_account=self.income_account,
            owner=self.owner, branch=self.branch,
        )
        self.client = Client.objects.create(
            client_id="CSI-FDI-1", first_name="Tola", last_name="Saver",
            gender="female", phone_primary="08030000001",
            tenant=self.tenant, owner=self.owner, branch=self.branch,
        )
        self.savings_account = SavingsAccount.objects.create(
            client=self.client, account=self.savings_gl, product=self.product,
            account_number="SAV-FDI-001", interest_rate=Decimal("0.00"),
            interest_calculation_method="monthly", minimum_balance=Decimal("0.00"),
            opened_on=date(2026, 6, 1), status="active",
            contribution_amount=Decimal("500.00"),
            owner=self.owner, branch=self.branch,
        )

    def _make_item(self, collection_date, amount):
        sheet = DailyCollectionSheet.objects.create(
            credit_officer=self.officer, collection_date=collection_date,
            owner=self.owner, branch=self.branch,
        )
        return CollectionSheetItem.objects.create(
            sheet=sheet, client=self.client, collection_type="savings_deposit",
            savings_account=self.savings_account,
            amount_expected=amount, amount_collected=amount,
            payment_mode="cash", owner=self.owner, branch=self.branch,
        )

    def test_first_collection_sheet_deposit_of_month_swept_to_income(self):
        item = self._make_item(date(2026, 7, 1), Decimal("500.00"))
        item.post_cash_collection(self.officer_user)

        self.savings_gl.refresh_from_db()
        self.income_account.refresh_from_db()
        self.assertEqual(self.savings_gl.balance, Decimal("0.00"))
        self.assertEqual(self.income_account.balance, Decimal("500.00"))

    def test_second_collection_sheet_deposit_of_month_credits_savings_balance(self):
        first = self._make_item(date(2026, 7, 1), Decimal("500.00"))
        first.post_cash_collection(self.officer_user)

        second = self._make_item(date(2026, 7, 2), Decimal("500.00"))
        second.post_cash_collection(self.officer_user)

        self.savings_gl.refresh_from_db()
        self.income_account.refresh_from_db()
        self.assertEqual(self.savings_gl.balance, Decimal("500.00"))
        self.assertEqual(self.income_account.balance, Decimal("500.00"))

    def test_first_deposit_above_committed_amount_only_sweeps_committed_portion(self):
        """
        An officer posting several days' worth on one instrument (e.g. 800 when
        the client committed to 500/day) must only have the committed 500 swept
        to income — the 300 excess is a genuine deposit and must still land in
        the client's savings balance, not be swept to income along with it.
        """
        item = self._make_item(date(2026, 7, 1), Decimal("800.00"))
        item.post_cash_collection(self.officer_user)

        self.savings_gl.refresh_from_db()
        self.income_account.refresh_from_db()
        self.assertEqual(self.income_account.balance, Decimal("500.00"))
        self.assertEqual(self.savings_gl.balance, Decimal("300.00"))
