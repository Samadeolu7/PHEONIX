"""
Regression test for the total_due corruption found on LN-362 and ~40 other
legacy-imported loans (2026-07-28): `apply_penalty_due_correction` used to
subtract a penalty correction directly from LoanRepaymentSchedule.total_due
(floored at total_paid), which zeroed out principal/interest on any row
where the penalty correction exceeded total_due itself. The daily
update_loan_status task then compounded this by recalculating penalty_due
off the now-zeroed total_due, driving penalty_due to ~0 too.

This test reproduces that exact corrupted state directly (rather than
re-running the old buggy commands, which have since been fixed) and asserts
`repair_schedule_total_due` restores it correctly:
  - total_due back to principal_due + interest_due + fees_due
  - penalty_due recomputed fresh off the corrected base
  - outstanding_penalties rebuilt (sum of penalty_due across unpaid rows,
    minus penalties_paid, floored at zero)
  - arrears_amount / days_in_arrears refreshed
  - a 'paid' row with the same total_due mismatch is left untouched
  - no *_paid field is ever modified
"""
from datetime import timedelta
from decimal import ROUND_HALF_UP, Decimal

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from common.managers import set_current_tenant
from users.models import User
from accounts.models import Account
from products.models import Product
from clients.models import Client
from loans.models import LoanProduct, LoanAccount, LoanRepaymentSchedule

from .test_deferred_interest import _make_env, _make_account


class RepairScheduleTotalDueTestCase(TestCase):
    def setUp(self):
        self.owner, self.tenant, self.branch = _make_env("repairtd")

        self.loan_parent = _make_account(self.owner, self.branch, "Loans Receivable", "1300", Account.LOAN)

        product_gl = Product.objects.create(
            name="Monthly Loan", code="LOAN-MO", product_type="LOAN",
            owner=self.owner, branch=self.branch,
        )
        self.product = LoanProduct.objects.create(
            product=product_gl,
            parent_account=self.loan_parent,
            default_interest_rate=Decimal("25.20"),
            interest_calculation_method="flat",
            min_loan_amount=Decimal("1000.00"),
            max_loan_amount=Decimal("500000.00"),
            late_payment_penalty_type="percentage",
            late_payment_penalty=Decimal("5.00"),
            grace_period_days=0,
            owner=self.owner, branch=self.branch,
        )

        self.client_ = Client.objects.create(
            client_id="CLI-REPAIRTD", first_name="Kikelomo", last_name="Adewale",
            gender="female", phone_primary="08020000000",
            tenant=self.tenant, owner=self.owner, branch=self.branch,
        )

    def tearDown(self):
        set_current_tenant(None)

    def _make_loan(self, loan_number, outstanding_penalties, penalties_paid=Decimal("0.00")):
        account = Account.objects.create(
            name=f"{loan_number} Loan Account", code=f"1300{loan_number[-3:]}",
            account_type=Account.LOAN, account_level=Account.LEVEL_CHILD,
            parent=self.loan_parent, owner=self.owner, created_by=self.owner, branch=self.branch,
        )
        return LoanAccount.objects.create(
            client=self.client_,
            product=self.product,
            account=account,
            loan_number=loan_number,
            requested_amount=Decimal("350000.00"),
            approved_amount=Decimal("350000.00"),
            disbursed_amount=Decimal("350000.00"),
            outstanding_principal=Decimal("258051.06"),
            interest_rate=Decimal("25.20"),
            term_months=8,
            repayment_frequency="monthly",
            status="defaulted",
            disbursement_date=timezone.localdate() - timedelta(days=460),
            risk_classification="loss",
            provision_pct=Decimal("100.00"),
            outstanding_penalties=outstanding_penalties,
            penalties_paid=penalties_paid,
            origin=LoanAccount.ORIGIN_LEGACY_IMPORT,
            owner=self.owner, branch=self.branch, created_by=self.owner,
        )

    def test_understated_overdue_row_is_repaired_and_penalty_rebuilt(self):
        loan = self._make_loan("LN-TEST-362", outstanding_penalties=Decimal("0.00"))

        due_date = timezone.localdate() - timedelta(days=278)
        sched = LoanRepaymentSchedule.objects.create(
            loan=loan, installment_number=6, due_date=due_date,
            principal_due=Decimal("48688.89"), interest_due=Decimal("19475.53"),
            fees_due=Decimal("0.00"), penalty_due=Decimal("0.00"),
            total_due=Decimal("0.00"),   # corrupted — should be 68164.42
            total_paid=Decimal("0.00"),
            status="overdue",
            owner=self.owner, branch=self.branch, created_by=self.owner,
        )

        call_command("repair_schedule_total_due", loan="LN-TEST-362", apply=True)

        sched.refresh_from_db()
        loan.refresh_from_db()

        self.assertEqual(sched.total_due, Decimal("68164.42"))
        # Never touched:
        self.assertEqual(sched.total_paid, Decimal("0.00"))

        expected_penalty = self.product.calculate_late_penalty(
            sched.total_due - sched.total_paid, 278, "monthly",
        ).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        self.assertEqual(sched.penalty_due, expected_penalty)
        self.assertGreater(sched.penalty_due, Decimal("0.00"))

        self.assertEqual(loan.outstanding_penalties, expected_penalty)
        self.assertEqual(loan.arrears_amount, Decimal("68164.42"))
        self.assertEqual(loan.days_in_arrears, 278)

    def test_paid_row_with_mismatch_is_left_untouched(self):
        loan = self._make_loan("LN-TEST-666", outstanding_penalties=Decimal("0.00"))

        sched = LoanRepaymentSchedule.objects.create(
            loan=loan, installment_number=7, due_date=timezone.localdate() - timedelta(days=60),
            principal_due=Decimal("41733.33"), interest_due=Decimal("2086.67"),
            fees_due=Decimal("0.00"), penalty_due=Decimal("2191.00"),
            total_due=Decimal("0.00"),   # mismatched, but this row is CLOSED
            total_paid=Decimal("22953.33"),
            status="paid",
            owner=self.owner, branch=self.branch, created_by=self.owner,
        )

        call_command("repair_schedule_total_due", loan="LN-TEST-666", apply=True)

        sched.refresh_from_db()
        self.assertEqual(sched.total_due, Decimal("0.00"), "paid rows must never be auto-repaired")
        self.assertEqual(sched.total_paid, Decimal("22953.33"))

    def test_outstanding_penalties_floors_at_zero_when_already_overpaid(self):
        # penalties_paid exceeds what the freshly-recomputed penalty says is owed —
        # the excess already collected must NOT go negative and must NOT be credited
        # forward; it's simply left alone (per explicit instruction: ignore excess
        # already paid, don't claw it back or carry it as a future credit).
        loan = self._make_loan(
            "LN-TEST-428", outstanding_penalties=Decimal("0.00"),
            penalties_paid=Decimal("999999.00"),
        )
        due_date = timezone.localdate() - timedelta(days=44)
        LoanRepaymentSchedule.objects.create(
            loan=loan, installment_number=7, due_date=due_date,
            principal_due=Decimal("20866.67"), interest_due=Decimal("6259.98"),
            fees_due=Decimal("0.00"), penalty_due=Decimal("0.00"),
            total_due=Decimal("0.00"),
            total_paid=Decimal("0.00"),
            status="overdue",
            owner=self.owner, branch=self.branch, created_by=self.owner,
        )

        call_command("repair_schedule_total_due", loan="LN-TEST-428", apply=True)

        loan.refresh_from_db()
        self.assertEqual(loan.outstanding_penalties, Decimal("0.00"))
        # The historical overcollection itself is untouched:
        self.assertEqual(loan.penalties_paid, Decimal("999999.00"))

    def test_dry_run_writes_nothing(self):
        loan = self._make_loan("LN-TEST-DRY", outstanding_penalties=Decimal("0.00"))
        sched = LoanRepaymentSchedule.objects.create(
            loan=loan, installment_number=1, due_date=timezone.localdate() - timedelta(days=10),
            principal_due=Decimal("10000.00"), interest_due=Decimal("1000.00"),
            fees_due=Decimal("0.00"), penalty_due=Decimal("0.00"),
            total_due=Decimal("0.00"),
            total_paid=Decimal("0.00"),
            status="overdue",
            owner=self.owner, branch=self.branch, created_by=self.owner,
        )

        call_command("repair_schedule_total_due", loan="LN-TEST-DRY")  # no apply=True

        sched.refresh_from_db()
        self.assertEqual(sched.total_due, Decimal("0.00"))
