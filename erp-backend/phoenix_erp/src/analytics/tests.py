"""
Tests for the director-level portfolio analytics endpoints added alongside
DirectorPortfolioPage: per-officer performance scorecard, expected-vs-actual
cash inflow trend, and loan portfolio by product. Also covers the
pending_prospects addition to MicrofinanceDashboardStatsView.

A single is_system_admin=True user is used throughout so _is_global_user()
returns True without needing to set up Role objects — this exercises the
"director sees everything" scope, which is what these endpoints are for.
"""
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from common.managers import set_current_tenant
from users.models import Tenant, User
from branches.models import Branch
from accounts.models import Account
from products.models import Product
from clients.models import Client
from hr.models import Staff
from loans.models import LoanProduct, LoanAccount, LoanRepaymentSchedule


def _make_env(username):
    set_current_tenant(None)
    user = User.objects.create_user(username=username, password="pass", is_system_admin=True)
    tenant = Tenant.objects.create(name=f"T-{username}", slug=f"t-{username}", owner=user)
    user.tenant = tenant
    user.save()
    branch = Branch.objects.create(name="HQ", code=username[:10], tenant=tenant, owner=user)
    user.branch = branch
    user.save()
    set_current_tenant(tenant)
    return user, tenant, branch


def _make_account(user, branch, name, code, account_type, account_level=Account.LEVEL_PARENT):
    return Account.objects.create(
        name=name, code=code, account_type=account_type,
        account_level=account_level, owner=user, created_by=user, branch=branch,
    )


class AnalyticsPortfolioViewsTestCase(TestCase):
    def setUp(self):
        self.owner, self.tenant, self.branch = _make_env("anlytadmin")
        self.api = APIClient()
        self.api.force_authenticate(user=self.owner)

        self.loan_parent = _make_account(self.owner, self.branch, "Loans Receivable", "1300", Account.LOAN)
        self.cash_account = _make_account(self.owner, self.branch, "Bank", "1001", Account.ASSET)

        gl_product = Product.objects.create(name="Monthly Loan", code="LOAN-MO", product_type="LOAN", owner=self.owner, branch=self.branch)
        self.product = LoanProduct.objects.create(
            product=gl_product,
            parent_account=self.loan_parent,
            disbursement_account=self.cash_account,
            default_interest_rate=Decimal("10.00"),
            interest_calculation_method="flat",
            min_loan_amount=Decimal("1000.00"),
            max_loan_amount=Decimal("500000.00"),
            owner=self.owner, branch=self.branch,
        )

        self.officer1 = Staff.objects.create(
            first_name="Ada", last_name="Lovelace", position="Credit Officer",
            owner=self.owner, branch=self.branch, tenant=self.tenant, created_by=self.owner,
        )
        self.officer2 = Staff.objects.create(
            first_name="Grace", last_name="Hopper", position="Credit Officer",
            owner=self.owner, branch=self.branch, tenant=self.tenant, created_by=self.owner,
        )

        self.client1 = Client.objects.create(
            client_id="CLI-A1", first_name="Client", last_name="One",
            gender="male", phone_primary="08010000001",
            assigned_officer=self.officer1,
            tenant=self.tenant, owner=self.owner, branch=self.branch,
        )
        self.client2 = Client.objects.create(
            client_id="CLI-A2", first_name="Client", last_name="Two",
            gender="male", phone_primary="08010000002",
            assigned_officer=self.officer2,
            tenant=self.tenant, owner=self.owner, branch=self.branch,
        )

    def _make_loan(self, client, loan_number, outstanding_principal, total_paid, disbursement_date=None):
        seq = LoanAccount.objects.count() + 1
        account = Account.objects.create(
            name=f"{loan_number} Loan Account", code=f"16{seq:04d}",
            account_type=Account.LOAN, account_level=Account.LEVEL_CHILD,
            parent=self.loan_parent, owner=self.owner, created_by=self.owner, branch=self.branch,
        )
        return LoanAccount.objects.create(
            client=client,
            product=self.product,
            account=account,
            loan_number=loan_number,
            requested_amount=outstanding_principal,
            outstanding_principal=outstanding_principal,
            total_paid=total_paid,
            interest_rate=Decimal("10.00"),
            term_months=2,
            repayment_frequency="monthly",
            status="active",
            disbursement_date=disbursement_date or timezone.now().date(),
            disbursed_amount=outstanding_principal,
            owner=self.owner,
            branch=self.branch,
        )

    def test_staff_performance_groups_by_assigned_officer(self):
        self._make_loan(self.client1, "LN-A1", Decimal("8000.00"), Decimal("2000.00"))
        self._make_loan(self.client2, "LN-A2", Decimal("3000.00"), Decimal("7000.00"))

        response = self.api.get("/api/analytics/staff-performance/")
        self.assertEqual(response.status_code, 200)
        rows = {r["staff_id"]: r for r in response.data["data"]}

        officer1_row = rows[self.officer1.id]
        self.assertEqual(Decimal(officer1_row["portfolio_size"]), Decimal("8000.00"))
        # collection_rate = paid / (paid + outstanding) = 2000 / 10000 = 20.0
        self.assertEqual(Decimal(officer1_row["collection_rate"]), Decimal("20.0"))

        officer2_row = rows[self.officer2.id]
        self.assertEqual(Decimal(officer2_row["portfolio_size"]), Decimal("3000.00"))
        # 7000 / 10000 = 70.0
        self.assertEqual(Decimal(officer2_row["collection_rate"]), Decimal("70.0"))

    def test_loan_portfolio_by_product_groups_correctly(self):
        self._make_loan(self.client1, "LN-B1", Decimal("5000.00"), Decimal("0.00"))
        self._make_loan(self.client2, "LN-B2", Decimal("4000.00"), Decimal("0.00"))

        response = self.api.get("/api/analytics/loan-portfolio-by-product/")
        self.assertEqual(response.status_code, 200)
        rows = response.data["data"]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["product_name"], "Monthly Loan")
        self.assertEqual(Decimal(rows[0]["outstanding"]), Decimal("9000.00"))
        self.assertEqual(rows[0]["loan_count"], 2)

    def test_cash_inflow_trend_expected_vs_actual(self):
        loan = self._make_loan(self.client1, "LN-C1", Decimal("5000.00"), Decimal("0.00"))
        today = timezone.now().date()

        LoanRepaymentSchedule.objects.create(
            loan=loan, installment_number=1, due_date=today,
            principal_due=Decimal("450.00"), interest_due=Decimal("50.00"), total_due=Decimal("500.00"),
            total_paid=Decimal("500.00"), payment_date=today, status="paid",
            owner=self.owner, branch=self.branch, tenant=self.tenant,
        )
        LoanRepaymentSchedule.objects.create(
            loan=loan, installment_number=2, due_date=today,
            principal_due=Decimal("450.00"), interest_due=Decimal("50.00"), total_due=Decimal("500.00"),
            total_paid=Decimal("0.00"), status="pending",
            owner=self.owner, branch=self.branch, tenant=self.tenant,
        )

        response = self.api.get(
            "/api/analytics/cash-inflow-trend/",
            {"start": str(today), "end": str(today)},
        )
        self.assertEqual(response.status_code, 200)
        point = response.data["data"][0]
        self.assertEqual(Decimal(point["expected"]), Decimal("1000.00"))
        self.assertEqual(Decimal(point["actual"]), Decimal("500.00"))

    def test_pending_prospects_counted_in_dashboard_stats(self):
        Client.objects.create(
            client_id="CLI-PR1", first_name="Prospect", last_name="One",
            gender="female", phone_primary="08010000099", client_type="pr",
            tenant=self.tenant, owner=self.owner, branch=self.branch,
        )

        response = self.api.get("/api/analytics/dashboard-stats/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["data"]["pending_prospects"], 1)
