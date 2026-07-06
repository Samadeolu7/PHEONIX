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


class PortfolioPerformanceViewsTestCase(TestCase):
    """Tests for Track 2's 4 new endpoints: breakdown, interest-income-by-mode,
    provisioning snapshot, officer-trend."""

    def setUp(self):
        self.owner, self.tenant, self.branch = _make_env("portperfadmin")
        self.branch2 = Branch.objects.create(name="Branch 2", code="pp2", tenant=self.tenant, owner=self.owner)
        self.api = APIClient()
        self.api.force_authenticate(user=self.owner)

        self.loan_parent = _make_account(self.owner, self.branch, "Loans Receivable", "1310", Account.LOAN)
        self.cash_account = _make_account(self.owner, self.branch, "Bank", "1011", Account.ASSET)
        self.interest_income_account = _make_account(self.owner, self.branch, "Interest Income", "4210", Account.INCOME)
        self.provision_expense_account = _make_account(self.owner, self.branch, "Provision Expense", "5310", Account.EXPENSE)
        self.allowance_account = _make_account(self.owner, self.branch, "Allowance for Loan Losses", "1320", Account.LIABILITY)
        self.allowance_account.balance = Decimal("500.00")
        self.allowance_account.save()

        gl_product = Product.objects.create(name="Weekly Loan", code="LOAN-WK", product_type="LOAN", owner=self.owner, branch=self.branch)
        self.product = LoanProduct.objects.create(
            product=gl_product,
            parent_account=self.loan_parent,
            disbursement_account=self.cash_account,
            interest_income_account=self.interest_income_account,
            provision_expense_account=self.provision_expense_account,
            allowance_account=self.allowance_account,
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
            client_id="CLI-PP1", first_name="Client", last_name="One",
            gender="male", phone_primary="08020000001",
            assigned_officer=self.officer1,
            tenant=self.tenant, owner=self.owner, branch=self.branch,
        )
        self.client2 = Client.objects.create(
            client_id="CLI-PP2", first_name="Client", last_name="Two",
            gender="male", phone_primary="08020000002",
            assigned_officer=self.officer2,
            tenant=self.tenant, owner=self.owner, branch=self.branch,
        )

    def _make_loan(self, client, loan_number, *, branch=None, outstanding_principal=Decimal("0.00"),
                   total_paid=Decimal("0.00"), disbursement_date=None,
                   interest_recognized_at_disbursement=False, interest_deferral_active=False,
                   risk_classification="performing", provision_amount=Decimal("0.00"), status="active"):
        branch = branch or self.branch
        seq = LoanAccount.objects.count() + 1
        account = Account.objects.create(
            name=f"{loan_number} Loan Account", code=f"17{seq:04d}",
            account_type=Account.LOAN, account_level=Account.LEVEL_CHILD,
            parent=self.loan_parent, owner=self.owner, created_by=self.owner, branch=branch,
        )
        return LoanAccount.objects.create(
            client=client,
            product=self.product,
            account=account,
            loan_number=loan_number,
            requested_amount=outstanding_principal or Decimal("1000.00"),
            outstanding_principal=outstanding_principal,
            total_paid=total_paid,
            interest_rate=Decimal("10.00"),
            term_months=2,
            repayment_frequency="monthly",
            status=status,
            disbursement_date=disbursement_date or timezone.now().date(),
            disbursed_amount=outstanding_principal,
            interest_recognized_at_disbursement=interest_recognized_at_disbursement,
            interest_deferral_active=interest_deferral_active,
            risk_classification=risk_classification,
            provision_amount=provision_amount,
            owner=self.owner,
            branch=branch,
        )

    def test_breakdown_groups_by_all_four_dimensions(self):
        self._make_loan(
            self.client1, "LN-PP1", branch=self.branch,
            outstanding_principal=Decimal("8000.00"), total_paid=Decimal("2000.00"),
            risk_classification="performing", provision_amount=Decimal("80.00"),
        )
        self._make_loan(
            self.client2, "LN-PP2", branch=self.branch2,
            outstanding_principal=Decimal("3000.00"), total_paid=Decimal("7000.00"),
            risk_classification="watch", provision_amount=Decimal("150.00"),
        )

        response = self.api.get("/api/analytics/portfolio-performance/breakdown/")
        self.assertEqual(response.status_code, 200)
        rows = response.data["data"]
        self.assertEqual(len(rows), 2)
        self.assertEqual(set(response.data["group_by"]), {"branch", "product", "officer", "risk_band"})

        officer1_row = next(r for r in rows if r["officer_id"] == self.officer1.id)
        self.assertEqual(Decimal(officer1_row["outstanding_principal"]), Decimal("8000.00"))
        self.assertEqual(officer1_row["risk_classification"], "performing")
        self.assertEqual(officer1_row["branch_name"], self.branch.name)

    def test_breakdown_group_by_narrows_and_filters_apply(self):
        self._make_loan(self.client1, "LN-PP3", outstanding_principal=Decimal("1000.00"))
        self._make_loan(self.client2, "LN-PP4", outstanding_principal=Decimal("2000.00"))

        response = self.api.get("/api/analytics/portfolio-performance/breakdown/", {"group_by": "branch"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["group_by"], ["branch"])
        self.assertEqual(len(response.data["data"]), 1)  # both loans share self.branch
        self.assertEqual(Decimal(response.data["data"][0]["outstanding_principal"]), Decimal("3000.00"))

        response = self.api.get("/api/analytics/portfolio-performance/breakdown/", {"officer": self.officer1.id})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["data"]), 1)
        self.assertEqual(Decimal(response.data["data"][0]["outstanding_principal"]), Decimal("1000.00"))

    def test_breakdown_respects_date_range(self):
        today = timezone.now().date()
        old_date = today - timezone.timedelta(days=400)
        self._make_loan(self.client1, "LN-PP5", outstanding_principal=Decimal("500.00"), disbursement_date=today)
        self._make_loan(self.client2, "LN-PP6", outstanding_principal=Decimal("999.00"), disbursement_date=old_date)

        response = self.api.get(
            "/api/analytics/portfolio-performance/breakdown/",
            {"start": str(today - timezone.timedelta(days=10)), "end": str(today)},
        )
        self.assertEqual(response.status_code, 200)
        total_outstanding = sum(Decimal(r["outstanding_principal"]) for r in response.data["data"])
        self.assertEqual(total_outstanding, Decimal("500.00"))

    def test_interest_income_at_disbursement_uses_schedule_interest_due(self):
        loan = self._make_loan(
            self.client1, "LN-PP7", outstanding_principal=Decimal("5000.00"),
            interest_recognized_at_disbursement=True,
        )
        LoanRepaymentSchedule.objects.create(
            loan=loan, installment_number=1, due_date=timezone.now().date(),
            principal_due=Decimal("450.00"), interest_due=Decimal("300.00"), total_due=Decimal("750.00"),
            total_paid=Decimal("0.00"), status="pending",
            owner=self.owner, branch=self.branch, tenant=self.tenant,
        )

        response = self.api.get("/api/analytics/portfolio-performance/interest-income/")
        self.assertEqual(response.status_code, 200)
        data = response.data["data"]
        self.assertEqual(Decimal(data["at_disbursement"]["recognized_income"]), Decimal("300.00"))
        self.assertEqual(data["at_disbursement"]["loan_count"], 1)
        self.assertEqual(Decimal(data["legacy_cash_basis"]["recognized_income"]), Decimal("0.00"))

    def test_interest_income_legacy_cash_basis_uses_payment_date_and_interest_paid(self):
        today = timezone.now().date()
        old_date = today - timezone.timedelta(days=400)
        loan = self._make_loan(self.client1, "LN-PP8", outstanding_principal=Decimal("2000.00"))
        LoanRepaymentSchedule.objects.create(
            loan=loan, installment_number=1, due_date=today,
            principal_due=Decimal("180.00"), interest_due=Decimal("20.00"), total_due=Decimal("200.00"),
            total_paid=Decimal("200.00"), interest_paid=Decimal("20.00"),
            payment_date=today, status="paid",
            owner=self.owner, branch=self.branch, tenant=self.tenant,
        )
        LoanRepaymentSchedule.objects.create(
            loan=loan, installment_number=2, due_date=old_date,
            principal_due=Decimal("180.00"), interest_due=Decimal("20.00"), total_due=Decimal("200.00"),
            total_paid=Decimal("200.00"), interest_paid=Decimal("999.00"),
            payment_date=old_date, status="paid",
            owner=self.owner, branch=self.branch, tenant=self.tenant,
        )

        response = self.api.get(
            "/api/analytics/portfolio-performance/interest-income/",
            {"start": str(today - timezone.timedelta(days=10)), "end": str(today)},
        )
        self.assertEqual(response.status_code, 200)
        data = response.data["data"]
        # Only the in-range (today) row's interest_paid should count, not the 999 out-of-range row.
        self.assertEqual(Decimal(data["legacy_cash_basis"]["recognized_income"]), Decimal("20.00"))

    def test_provisioning_snapshot_required_vs_booked_dedupes_shared_allowance_account(self):
        self._make_loan(
            self.client1, "LN-PP9", outstanding_principal=Decimal("8000.00"),
            risk_classification="performing", provision_amount=Decimal("80.00"),
        )
        self._make_loan(
            self.client2, "LN-PP10", outstanding_principal=Decimal("3000.00"),
            risk_classification="substandard", provision_amount=Decimal("750.00"),
        )

        response = self.api.get("/api/analytics/portfolio-performance/provisioning/")
        self.assertEqual(response.status_code, 200)
        data = response.data["data"]
        self.assertEqual(Decimal(data["total_required_provision"]), Decimal("830.00"))
        # Both loans use the same self.product -> same allowance_account (balance=500) —
        # must not be double-counted even though 2 loans reference it.
        self.assertEqual(Decimal(data["total_booked_provision"]), Decimal("500.00"))
        self.assertEqual(Decimal(data["shortfall_or_surplus"]), Decimal("330.00"))

        band_map = {b["risk_classification"]: b for b in data["by_risk_band"]}
        self.assertEqual(Decimal(band_map["performing"]["required_provision"]), Decimal("80.00"))
        self.assertEqual(Decimal(band_map["substandard"]["required_provision"]), Decimal("750.00"))
        self.assertEqual(band_map["watch"]["loan_count"], 0)

    def test_officer_trend_separates_months_and_computes_period_collection_rate(self):
        today = timezone.now().date()
        this_month_start = today.replace(day=1)
        loan = self._make_loan(self.client1, "LN-PP11", outstanding_principal=Decimal("1000.00"), disbursement_date=this_month_start)
        LoanRepaymentSchedule.objects.create(
            loan=loan, installment_number=1, due_date=this_month_start,
            principal_due=Decimal("900.00"), interest_due=Decimal("100.00"), total_due=Decimal("1000.00"),
            total_paid=Decimal("500.00"), payment_date=this_month_start, status="partial",
            owner=self.owner, branch=self.branch, tenant=self.tenant,
        )

        response = self.api.get("/api/analytics/portfolio-performance/officer-trend/", {"months": 1})
        self.assertEqual(response.status_code, 200)
        rows = [r for r in response.data["data"] if r["staff_id"] == self.officer1.id]
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(Decimal(row["amount_due"]), Decimal("1000.00"))
        self.assertEqual(Decimal(row["collections_received"]), Decimal("500.00"))
        self.assertEqual(Decimal(row["collection_rate"]), Decimal("50.0"))
        self.assertEqual(Decimal(row["disbursed_amount"]), Decimal("1000.00"))

    def test_csv_export_matches_json_and_invalid_format_rejected(self):
        self._make_loan(self.client1, "LN-PP12", outstanding_principal=Decimal("1000.00"))

        json_response = self.api.get("/api/analytics/portfolio-performance/breakdown/")
        csv_response = self.api.get("/api/analytics/portfolio-performance/breakdown/", {"format": "csv"})
        self.assertEqual(csv_response.status_code, 200)
        self.assertEqual(csv_response["Content-Type"], "text/csv")
        body = csv_response.content.decode()
        self.assertIn("1000.00", body)
        self.assertEqual(
            Decimal(json_response.data["data"][0]["outstanding_principal"]), Decimal("1000.00")
        )

        bad_format_response = self.api.get("/api/analytics/portfolio-performance/breakdown/", {"format": "xml"})
        self.assertEqual(bad_format_response.status_code, 400)
