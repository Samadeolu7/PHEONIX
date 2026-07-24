"""
Regression test: CollectionSheetItemViewSet.get_queryset() used to build its
base queryset from `CollectionSheetItem.objects.select_related(...)` with no
branch/tenant scoping at all, relying on `_apply_officer_scope` to narrow it —
but that helper treats `own_branch`/`global` scope as "no additional
narrowing needed, branch scoping already happened upstream via for_user()".
Since for_user() was never called here, an own_branch-scope user (the common
case — most staff) saw every branch's collection sheet items in the tenant,
not just their own.
"""
from datetime import date
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from common.managers import set_current_tenant
from users.models import Tenant, User, Role
from branches.models import Branch
from accounts.models import Account
from products.models import Product
from clients.models import Client
from hr.models import Staff
from loans.models import LoanProduct, LoanAccount
from cash_management.models import DailyCollectionSheet, CollectionSheetItem


def _make_account(user, branch, name, code, account_type, account_level=Account.LEVEL_PARENT, parent=None):
    return Account.objects.create(
        name=name, code=code, account_type=account_type, account_level=account_level,
        parent=parent, owner=user, created_by=user, branch=branch,
    )


class CollectionSheetItemBranchScopeTests(TestCase):
    def setUp(self):
        set_current_tenant(None)
        self.owner = User.objects.create_user(username="csi_owner", password="pass")
        self.tenant = Tenant.objects.create(name="CSI Tenant", slug="csi-tenant", owner=self.owner)
        self.owner.tenant = self.tenant
        self.owner.save()

        self.branch_a = Branch.objects.create(name="Branch A", code="CSIA", tenant=self.tenant, owner=self.owner)
        self.branch_b = Branch.objects.create(name="Branch B", code="CSIB", tenant=self.tenant, owner=self.owner)
        self.owner.branch = self.branch_a
        self.owner.save()
        set_current_tenant(self.tenant)

        self.approver = User.objects.create_user(username="csi_approver", password="pass")
        self.approver.tenant = self.tenant
        self.approver.branch = self.branch_a
        self.approver.save()

        self.today = date.today()

        self.officer_user = User.objects.create_user(username="csi_officer", password="pass")
        self.officer_user.tenant = self.tenant
        self.officer_user.branch = self.branch_a
        self.officer_user.save()
        self.officer = Staff.objects.get(user=self.officer_user)
        self.officer.owner = self.owner
        self.officer.branch = self.branch_a
        self.officer.save()

        self.officer_user_b = User.objects.create_user(username="csi_officer_b", password="pass")
        self.officer_user_b.tenant = self.tenant
        self.officer_user_b.branch = self.branch_b
        self.officer_user_b.save()
        self.officer_b = Staff.objects.get(user=self.officer_user_b)
        self.officer_b.owner = self.owner
        self.officer_b.branch = self.branch_b
        self.officer_b.save()

        # ── Branch A: client + loan + collection sheet item ─────────────────
        loan_parent_a = _make_account(self.owner, self.branch_a, "Loans Receivable A", "1300", Account.LOAN)
        cash_parent_a = _make_account(self.owner, self.branch_a, "Cash A", "1000", Account.ASSET)
        cashier_gl_a = _make_account(
            self.owner, self.branch_a, "Till A", "1001", Account.ASSET,
            account_level=Account.LEVEL_CHILD, parent=cash_parent_a,
        )
        interest_income_a = _make_account(self.owner, self.branch_a, "Interest Income A", "4100", Account.INCOME)
        product_a = Product.objects.create(
            name="Loan A", code="LOAN-A", product_type="LOAN", owner=self.owner, branch=self.branch_a,
        )
        loan_product_a = LoanProduct.objects.create(
            product=product_a, parent_account=loan_parent_a, disbursement_account=cashier_gl_a,
            interest_income_account=interest_income_a, default_interest_rate=Decimal("10.00"),
            interest_calculation_method="flat", min_loan_amount=Decimal("1000.00"),
            max_loan_amount=Decimal("500000.00"), owner=self.owner, branch=self.branch_a,
        )
        self.client_a = Client.objects.create(
            client_id="CSI-A", first_name="Ama", last_name="Branch-A",
            gender="female", phone_primary="08020000001",
            tenant=self.tenant, owner=self.owner, branch=self.branch_a,
        )
        loan_account_gl_a = Account.objects.create(
            name="Ama Loan Account", code="13001", account_type=Account.LOAN,
            account_level=Account.LEVEL_CHILD, parent=loan_parent_a,
            owner=self.owner, created_by=self.owner, branch=self.branch_a,
        )
        loan_a = LoanAccount.objects.create(
            client=self.client_a, product=loan_product_a, account=loan_account_gl_a,
            loan_number="LN-CSI-A", requested_amount=Decimal("10000.00"),
            interest_rate=Decimal("10.00"), term_months=2,
            repayment_frequency="monthly", status="pending",
            owner=self.owner, branch=self.branch_a,
        )
        loan_a.approve(user=self.approver)
        loan_a.disburse(disbursement_account=cashier_gl_a, disbursed_by=self.approver)
        schedule_a = loan_a.repayment_schedule.order_by("due_date").first()

        sheet_a = DailyCollectionSheet.objects.create(
            credit_officer=self.officer, collection_date=self.today,
            owner=self.owner, branch=self.branch_a,
        )
        self.item_a = CollectionSheetItem.objects.create(
            sheet=sheet_a, client=self.client_a, collection_type="loan_repayment",
            loan_account=loan_a, loan_installment=schedule_a,
            amount_expected=schedule_a.interest_due, amount_collected=Decimal("0.00"),
            payment_mode="cash", owner=self.owner, branch=self.branch_a,
        )

        # ── Branch B: separate client + loan + collection sheet item ────────
        loan_parent_b = _make_account(self.owner, self.branch_b, "Loans Receivable B", "1300", Account.LOAN)
        cash_parent_b = _make_account(self.owner, self.branch_b, "Cash B", "1000", Account.ASSET)
        cashier_gl_b = _make_account(
            self.owner, self.branch_b, "Till B", "1001", Account.ASSET,
            account_level=Account.LEVEL_CHILD, parent=cash_parent_b,
        )
        interest_income_b = _make_account(self.owner, self.branch_b, "Interest Income B", "4100", Account.INCOME)
        product_b = Product.objects.create(
            name="Loan B", code="LOAN-B", product_type="LOAN", owner=self.owner, branch=self.branch_b,
        )
        loan_product_b = LoanProduct.objects.create(
            product=product_b, parent_account=loan_parent_b, disbursement_account=cashier_gl_b,
            interest_income_account=interest_income_b, default_interest_rate=Decimal("10.00"),
            interest_calculation_method="flat", min_loan_amount=Decimal("1000.00"),
            max_loan_amount=Decimal("500000.00"), owner=self.owner, branch=self.branch_b,
        )
        self.client_b = Client.objects.create(
            client_id="CSI-B", first_name="Bayo", last_name="Branch-B",
            gender="male", phone_primary="08020000002",
            tenant=self.tenant, owner=self.owner, branch=self.branch_b,
        )
        loan_account_gl_b = Account.objects.create(
            name="Bayo Loan Account", code="13001", account_type=Account.LOAN,
            account_level=Account.LEVEL_CHILD, parent=loan_parent_b,
            owner=self.owner, created_by=self.owner, branch=self.branch_b,
        )
        loan_b = LoanAccount.objects.create(
            client=self.client_b, product=loan_product_b, account=loan_account_gl_b,
            loan_number="LN-CSI-B", requested_amount=Decimal("10000.00"),
            interest_rate=Decimal("10.00"), term_months=2,
            repayment_frequency="monthly", status="pending",
            owner=self.owner, branch=self.branch_b,
        )
        loan_b.approve(user=self.approver)
        loan_b.disburse(disbursement_account=cashier_gl_b, disbursed_by=self.approver)
        schedule_b = loan_b.repayment_schedule.order_by("due_date").first()

        sheet_b = DailyCollectionSheet.objects.create(
            credit_officer=self.officer_b, collection_date=self.today,
            owner=self.owner, branch=self.branch_b,
        )
        self.item_b = CollectionSheetItem.objects.create(
            sheet=sheet_b, client=self.client_b, collection_type="loan_repayment",
            loan_account=loan_b, loan_installment=schedule_b,
            amount_expected=schedule_b.interest_due, amount_collected=Decimal("0.00"),
            payment_mode="cash", owner=self.owner, branch=self.branch_b,
        )

    def tearDown(self):
        set_current_tenant(None)

    def test_own_branch_scope_user_only_sees_own_branchs_collection_sheet_items(self):
        branch_manager = User.objects.create_user(username="csi_bm", password="pass")
        branch_manager.tenant = self.tenant
        branch_manager.branch = self.branch_a
        branch_manager.save()
        role = Role.objects.create(
            tenant=self.tenant, name="CSI Branch Manager", default_scope=Role.SCOPE_OWN_BRANCH,
        )
        branch_manager.roles.add(role)

        client = APIClient()
        client.force_authenticate(user=branch_manager)
        response = client.get("/api/cash-management/collection-sheet-items/")

        self.assertEqual(response.status_code, 200, response.content)
        data = response.json()
        results = data["results"] if isinstance(data, dict) and "results" in data else data
        item_ids = {row["id"] for row in results}

        self.assertIn(self.item_a.id, item_ids)
        self.assertNotIn(self.item_b.id, item_ids)
