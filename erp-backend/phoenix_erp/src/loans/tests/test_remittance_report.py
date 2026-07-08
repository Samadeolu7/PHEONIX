"""
Regression test for the Remittance Report bug: the old report only read from
cash_management.DailyCollectionSheet, an optional per-officer daily worksheet.
Most repayments in production are posted through other endpoints (direct
repay, bulk-repay, repayment-request approval, offline-payment approval) that
never touch DailyCollectionSheet, so the report could show zero collections
on a date where real repayments happened.

This test proves LoanAccountViewSet.remittance_report surfaces collections
regardless of which mechanism recorded them, by exercising two independent
code paths that both end up calling LoanAccount.record_payment():
  1. A bare record_payment() call — what repay / bulk_repay / the
     repayment-request and offline-payment approval actions all do under the
     hood.
  2. The full cash_management.CollectionSheetItem.post_cash_collection()
     workflow — the one path the old (buggy) report actually saw.

It also proves the savings-deposit side (SavingsAccount.deposit()) is
included, and that a loan installment due today but not yet paid shows up in
the "due" section, so staff can use it to tell a client their due date.
"""
from datetime import date
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from common.managers import set_current_tenant
from users.models import Tenant, User
from branches.models import Branch
from accounts.models import Account
from products.models import Product
from clients.models import Client
from hr.models import Staff
from loans.models import LoanProduct, LoanAccount
from cash_management.models import CashierAccount, DailyCollectionSheet, CollectionSheetItem
from savings.models import SavingsAccount


def _make_env(username):
    set_current_tenant(None)
    user = User.objects.create_user(username=username, password="pass")
    tenant = Tenant.objects.create(name=f"T-{username}", slug=f"t-{username}", owner=user)
    user.tenant = tenant
    user.save()
    branch = Branch.objects.create(name="HQ", code=username[:10], tenant=tenant, owner=user)
    user.branch = branch
    user.save()
    set_current_tenant(tenant)
    return user, tenant, branch


def _make_account(user, branch, name, code, account_type, account_level=Account.LEVEL_PARENT, parent=None):
    return Account.objects.create(
        name=name, code=code, account_type=account_type, account_level=account_level,
        parent=parent, owner=user, created_by=user, branch=branch,
    )


class RemittanceReportTestCase(TestCase):
    def setUp(self):
        self.owner, self.tenant, self.branch = _make_env("remit")
        self.approver = User.objects.create_user(username="remit_apr", password="pass")
        self.approver.tenant = self.tenant
        self.approver.branch = self.branch
        self.approver.save()

        self.today = date.today()

        # ── GL accounts ──────────────────────────────────────────────────
        self.loan_parent = _make_account(self.owner, self.branch, "Loans Receivable", "1300", Account.LOAN)
        self.cash_parent = _make_account(self.owner, self.branch, "Cash", "1000", Account.ASSET)
        self.interest_income_account = _make_account(self.owner, self.branch, "Interest Income", "4100", Account.INCOME)
        self.savings_parent = _make_account(self.owner, self.branch, "Member Savings", "2100", Account.SAVINGS)

        self.cashier_gl_account = _make_account(
            self.owner, self.branch, "Cashier Till", "1001", Account.ASSET,
            account_level=Account.LEVEL_CHILD, parent=self.cash_parent,
        )
        self.cashier_account = CashierAccount.objects.create(
            cashier=self.owner, account=self.cashier_gl_account,
            account_number="TILL-001", name="Main Till",
            owner=self.owner, branch=self.branch,
        )

        # A separate officer + till for the collection-sheet path, proving
        # both mechanisms are correctly unioned rather than one masking the other.
        self.officer_user = User.objects.create_user(username="remit_officer", password="pass")
        self.officer_user.tenant = self.tenant
        self.officer_user.branch = self.branch
        self.officer_user.save()
        # A post_save signal on User auto-creates a Staff profile — fetch and
        # complete it rather than creating a second one (unique on user_id).
        self.officer = Staff.objects.get(user=self.officer_user)
        self.officer.first_name = "Femi"
        self.officer.last_name = "Officer"
        self.officer.owner = self.owner
        self.officer.branch = self.branch
        self.officer.save()
        officer_gl_account = _make_account(
            self.owner, self.branch, "Officer Till", "1002", Account.ASSET,
            account_level=Account.LEVEL_CHILD, parent=self.cash_parent,
        )
        self.officer_cashier_account = CashierAccount.objects.create(
            cashier=self.officer_user, account=officer_gl_account,
            account_number="TILL-002", name="Officer Till",
            owner=self.owner, branch=self.branch,
        )

        gl_product = Product.objects.create(
            name="Monthly Loan", code="LOAN-MON", product_type="LOAN",
            owner=self.owner, branch=self.branch,
        )
        self.loan_product = LoanProduct.objects.create(
            product=gl_product,
            parent_account=self.loan_parent,
            disbursement_account=self.cashier_gl_account,
            interest_income_account=self.interest_income_account,
            default_interest_rate=Decimal("10.00"),
            interest_calculation_method="flat",
            min_loan_amount=Decimal("1000.00"),
            max_loan_amount=Decimal("500000.00"),
            owner=self.owner, branch=self.branch,
        )

        self.ada = Client.objects.create(
            client_id="CLI-ADA", first_name="Ada", last_name="Lovelace",
            gender="female", phone_primary="08010000001",
            tenant=self.tenant, owner=self.owner, branch=self.branch,
            assigned_officer=self.officer,
        )
        self.bob = Client.objects.create(
            client_id="CLI-BOB", first_name="Bob", last_name="Marley",
            gender="male", phone_primary="08010000002",
            tenant=self.tenant, owner=self.owner, branch=self.branch,
        )
        self.cathy = Client.objects.create(
            client_id="CLI-CATHY", first_name="Cathy", last_name="Stone",
            gender="female", phone_primary="08010000003",
            tenant=self.tenant, owner=self.owner, branch=self.branch,
            assigned_officer=self.officer,
        )
        self.deb = Client.objects.create(
            client_id="CLI-DEB", first_name="Deb", last_name="Rivers",
            gender="female", phone_primary="08010000004",
            tenant=self.tenant, owner=self.owner, branch=self.branch,
        )

    def tearDown(self):
        set_current_tenant(None)

    def _make_loan(self, client, loan_number, amount=Decimal("10000.00")):
        seq = LoanAccount.objects.count() + 1
        account = Account.objects.create(
            name=f"{loan_number} Loan Account", code=f"13{seq:04d}",
            account_type=Account.LOAN, account_level=Account.LEVEL_CHILD,
            parent=self.loan_parent, owner=self.owner, created_by=self.owner, branch=self.branch,
        )
        loan = LoanAccount.objects.create(
            client=client, product=self.loan_product, account=account,
            loan_number=loan_number, requested_amount=amount,
            interest_rate=Decimal("10.00"), term_months=2,
            repayment_frequency="monthly", status="pending",
            owner=self.owner, branch=self.branch,
        )
        loan.approve(user=self.approver)
        loan.disburse(disbursement_account=self.cashier_gl_account, disbursed_by=self.approver)
        return loan

    def test_due_today_and_collections_from_every_recording_path(self):
        # ── Ada: an installment due today, not yet paid ────────────────────
        ada_loan = self._make_loan(self.ada, "LN-ADA-1")
        ada_schedule = ada_loan.repayment_schedule.order_by("due_date").first()
        ada_schedule.due_date = self.today
        ada_schedule.save(update_fields=["due_date"])

        # ── Bob: repaid today via a bare record_payment() call — the exact
        # mechanism `repay` / `bulk_repay` / repayment-request and
        # offline-payment approvals use under the hood. ────────────────────
        bob_loan = self._make_loan(self.bob, "LN-BOB-1")
        bob_schedule = bob_loan.repayment_schedule.order_by("due_date").first()
        bob_loan.record_payment(
            amount=bob_schedule.interest_due,
            payment_date=self.today,
            payment_account=self.cashier_gl_account,
            received_by=self.owner,
        )

        # ── Cathy: repaid today via the full DailyCollectionSheet /
        # CollectionSheetItem workflow — the one path the OLD report saw. ──
        cathy_loan = self._make_loan(self.cathy, "LN-CATHY-1")
        cathy_schedule = cathy_loan.repayment_schedule.order_by("due_date").first()
        sheet = DailyCollectionSheet.objects.create(
            credit_officer=self.officer, collection_date=self.today,
            owner=self.owner, branch=self.branch,
        )
        item = CollectionSheetItem.objects.create(
            sheet=sheet, client=self.cathy, collection_type="loan_repayment",
            loan_account=cathy_loan, loan_installment=cathy_schedule,
            amount_expected=cathy_schedule.interest_due,
            amount_collected=cathy_schedule.interest_due,
            payment_mode="cash",
            owner=self.owner, branch=self.branch,
        )
        item.post_cash_collection(self.officer_user)

        # ── Deb: a savings deposit today ────────────────────────────────────
        savings_gl_account = Account.objects.create(
            name="Deb Savings", code="2101", account_type=Account.SAVINGS,
            account_level=Account.LEVEL_CHILD, parent=self.savings_parent,
            owner=self.owner, created_by=self.owner, branch=self.branch,
        )
        savings_product = Product.objects.create(
            name="Regular Savings", code="SAV-REG", product_type="SAVINGS",
            owner=self.owner, branch=self.branch,
        )
        deb_savings = SavingsAccount.objects.create(
            client=self.deb, account=savings_gl_account, product=savings_product,
            account_number="SAV-DEB-1", opened_on=self.today,
            interest_rate=Decimal("2.00"), interest_calculation_method="monthly",
            owner=self.owner, branch=self.branch,
        )
        deb_savings.deposit(
            amount=Decimal("200.00"), cashier_account=self.cashier_gl_account,
            transacted_by=self.owner, date=self.today,
        )

        # ── Hit the actual endpoint ──────────────────────────────────────
        client = APIClient()
        client.force_authenticate(user=self.owner)
        response = client.get(
            "/api/loans/accounts/remittance-report/", {"date": str(self.today)}
        )

        self.assertEqual(response.status_code, 200, response.content)
        data = response.json()

        # Due today: Ada's installment.
        due_clients = {row["client_name"] for row in data["due"]}
        self.assertIn(self.ada.full_name, due_clients)
        ada_row = next(r for r in data["due"] if r["client_name"] == self.ada.full_name)
        self.assertEqual(Decimal(ada_row["total_due"]), ada_schedule.total_due)
        self.assertEqual(ada_row["status"], "pending")

        # Collected today: BOTH Bob (bare record_payment) and Cathy
        # (collection-sheet) must appear — proving the report is no longer
        # blind to repayments recorded outside the collection-sheet workflow.
        collected_clients = {row["client_name"] for row in data["loan_collections"]}
        self.assertIn(self.bob.full_name, collected_clients)
        self.assertIn(self.cathy.full_name, collected_clients)

        bob_row = next(r for r in data["loan_collections"] if r["client_name"] == self.bob.full_name)
        cathy_row = next(r for r in data["loan_collections"] if r["client_name"] == self.cathy.full_name)
        self.assertEqual(Decimal(bob_row["amount"]), bob_schedule.interest_due)
        self.assertEqual(Decimal(cathy_row["amount"]), cathy_schedule.interest_due)
        # Both were debited against a CashierAccount-linked GL account.
        self.assertEqual(bob_row["payment_mode"], "cash")
        self.assertEqual(cathy_row["payment_mode"], "cash")

        # Savings deposit shows up too.
        savings_clients = {row["client_name"] for row in data["savings_collections"]}
        self.assertIn(self.deb.full_name, savings_clients)

        # Summary totals reconcile.
        expected_total = bob_schedule.interest_due + cathy_schedule.interest_due + Decimal("200.00")
        self.assertEqual(Decimal(data["summary"]["total_collected"]), expected_total)
        self.assertEqual(Decimal(data["summary"]["total_cash"]), expected_total)
