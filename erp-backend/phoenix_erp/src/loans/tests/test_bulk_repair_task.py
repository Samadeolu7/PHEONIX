"""
Tests for loans.tasks.bulk_repair_loan_schedules — the book-wide version of
schedule_repair_service.repair_schedule(), triggered from
LoanAccountViewSet.bulk_repair_schedule (loans/views.py).

Calls the task synchronously via .apply(...).get() — this always runs the
task body in-process regardless of CELERY_TASK_ALWAYS_EAGER, so it exercises
the exact same code path .delay() would queue for a worker, without needing
a live broker/worker in the test run.
"""
from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from common.managers import set_current_tenant
from users.models import User
from accounts.models import Account
from products.models import Product
from clients.models import Client
from loans.models import LoanProduct, LoanAccount, LoanRepaymentSchedule
from loans.tasks import bulk_repair_loan_schedules

from .test_deferred_interest import _make_env, _make_account


class BulkRepairTaskTestCase(TestCase):
    def setUp(self):
        self.owner, self.tenant, self.branch = _make_env("bulkrepair")
        self.actor = User.objects.create_user(username="bulkrepair_actor", password="pass")
        self.actor.tenant = self.tenant
        self.actor.branch = self.branch
        self.actor.save()

        self.loan_parent = _make_account(self.owner, self.branch, "Loans Receivable", "1300", Account.LOAN)
        gl_product = Product.objects.create(
            name="Bulk Repair Flat Loan", code="LOAN-BULKFLAT", product_type="LOAN",
            owner=self.owner, branch=self.branch,
        )
        self.product = LoanProduct.objects.create(
            product=gl_product, parent_account=self.loan_parent,
            default_interest_rate=Decimal("20.00"), interest_calculation_method="flat",
            min_loan_amount=Decimal("1000.00"), max_loan_amount=Decimal("500000.00"),
            owner=self.owner, branch=self.branch,
        )
        self.client_ = Client.objects.create(
            client_id="CLI-BULKREPAIR", first_name="Ade", last_name="Balogun",
            gender="male", phone_primary="08040000000",
            tenant=self.tenant, owner=self.owner, branch=self.branch,
        )

    def tearDown(self):
        set_current_tenant(None)

    def _make_loan(self, loan_number, *, status, outstanding_principal):
        account = Account.objects.create(
            name=f"{loan_number} Loan Account", code=f"1300{loan_number[-3:]}",
            account_type=Account.LOAN, account_level=Account.LEVEL_CHILD,
            parent=self.loan_parent, owner=self.owner, created_by=self.owner, branch=self.branch,
        )
        return LoanAccount.objects.create(
            client=self.client_, product=self.product, account=account, loan_number=loan_number,
            requested_amount=Decimal("30000.00"), approved_amount=Decimal("30000.00"),
            disbursed_amount=Decimal("30000.00"), outstanding_principal=outstanding_principal,
            interest_rate=Decimal("20.00"), number_of_installments=3, term_months=3,
            repayment_frequency="weekly", status=status,
            disbursement_date=timezone.localdate() - timedelta(days=60),
            owner=self.owner, branch=self.branch, created_by=self.owner,
        )

    def _make_row(self, loan, installment_number, due_date, principal_due, principal_paid, status):
        return LoanRepaymentSchedule.objects.create(
            loan=loan, installment_number=installment_number, due_date=due_date,
            principal_due=principal_due, interest_due=Decimal("0.00"), fees_due=Decimal("0.00"),
            penalty_due=Decimal("0.00"), total_due=principal_due,
            principal_paid=principal_paid, total_paid=principal_paid, status=status,
            owner=self.owner, branch=self.branch, created_by=self.owner,
        )

    def test_dry_run_scans_broken_and_healthy_loans_without_writing(self):
        today = timezone.localdate()

        broken = self._make_loan("LN-BULK-BROKEN", status="active", outstanding_principal=Decimal("8000.00"))
        r1 = self._make_row(broken, 1, today - timedelta(weeks=2), Decimal("12000.00"), Decimal("0.00"), "overdue")
        r2 = self._make_row(broken, 2, today - timedelta(weeks=1), Decimal("12000.00"), Decimal("0.00"), "overdue")
        r3 = self._make_row(broken, 3, today + timedelta(weeks=1), Decimal("12000.00"), Decimal("0.00"), "pending")

        healthy = self._make_loan("LN-BULK-HEALTHY", status="active", outstanding_principal=Decimal("12000.00"))
        h1 = self._make_row(healthy, 1, today - timedelta(weeks=2), Decimal("12000.00"), Decimal("12000.00"), "paid")
        h2 = self._make_row(healthy, 2, today - timedelta(weeks=1), Decimal("12000.00"), Decimal("12000.00"), "paid")
        h3 = self._make_row(healthy, 3, today, Decimal("12000.00"), Decimal("0.00"), "overdue")

        # A different-branch/tenant loan, but same table — status excluded from the cohort entirely.
        closed = self._make_loan("LN-BULK-CLOSED", status="paid_off", outstanding_principal=Decimal("0.00"))

        result = bulk_repair_loan_schedules.apply(
            kwargs={"user_id": self.actor.pk, "dry_run": True, "reason": ""},
        ).get()

        self.assertTrue(result["dry_run"])
        self.assertEqual(result["total_considered"], 2, "paid_off loan must be excluded from the cohort")
        self.assertEqual(result["changed_count"], 1)
        self.assertEqual(result["changed"][0]["loan_number"], "LN-BULK-BROKEN")
        self.assertEqual(result["no_op_count"], 1)
        self.assertEqual(result["needs_review_count"], 0)
        self.assertEqual(result["errors_count"], 0)

        # Dry run must not write anything, for either loan.
        for r in (r1, r2, r3, h1, h2, h3):
            r.refresh_from_db()
        self.assertEqual(r1.status, "overdue")
        self.assertEqual(r1.total_paid, Decimal("0.00"))
        self.assertEqual(h3.status, "overdue")

    def test_apply_writes_only_the_broken_loan(self):
        today = timezone.localdate()
        broken = self._make_loan("LN-BULK-BROKEN2", status="active", outstanding_principal=Decimal("8000.00"))
        r1 = self._make_row(broken, 1, today - timedelta(weeks=2), Decimal("12000.00"), Decimal("0.00"), "overdue")
        r2 = self._make_row(broken, 2, today - timedelta(weeks=1), Decimal("12000.00"), Decimal("0.00"), "overdue")
        r3 = self._make_row(broken, 3, today + timedelta(weeks=1), Decimal("12000.00"), Decimal("0.00"), "pending")

        healthy = self._make_loan("LN-BULK-HEALTHY2", status="active", outstanding_principal=Decimal("12000.00"))
        h1 = self._make_row(healthy, 1, today - timedelta(weeks=2), Decimal("12000.00"), Decimal("12000.00"), "paid")
        self._make_row(healthy, 2, today - timedelta(weeks=1), Decimal("12000.00"), Decimal("12000.00"), "paid")
        h3 = self._make_row(healthy, 3, today, Decimal("12000.00"), Decimal("0.00"), "overdue")

        result = bulk_repair_loan_schedules.apply(
            kwargs={"user_id": self.actor.pk, "dry_run": False, "reason": "bulk repair test run"},
        ).get()

        self.assertFalse(result["dry_run"])
        self.assertEqual(result["changed_count"], 1)
        self.assertTrue(result["changed"][0]["applied"])

        r1.refresh_from_db(); r2.refresh_from_db(); r3.refresh_from_db()
        self.assertEqual(r1.status, "paid")
        self.assertEqual(r2.status, "paid")
        self.assertEqual(r3.status, "pending")
        self.assertEqual(r3.principal_paid, Decimal("4000.00"))

        # The healthy loan is genuinely untouched — not merely "reported as no-op".
        h1.refresh_from_db(); h3.refresh_from_db()
        self.assertEqual(h1.principal_paid, Decimal("12000.00"))
        self.assertEqual(h3.status, "overdue")
        self.assertEqual(h3.principal_paid, Decimal("0.00"))
