"""
Tests for schedule_repair_service.repair_schedule — the self-service
generalization of restore_flat_schedule_backward_v4 (backward-fill payments
across the flat schedule) + retire_stale_legacy_schedule_rows (retire stale
rows beyond what's genuinely owed) to any repayment_frequency.

The regression test that matters most here is
test_row_count_mismatch_does_not_block_stale_row_retirement: an earlier
version of this service gated step 2 (retire-stale) behind step 1's
precondition that schedule row count == number_of_installments — but step 2
exists precisely for schedules with far MORE rows than that (the LN-858
shape), so that gating silently skipped the exact loans that needed
cleanup. The two steps must be independently eligible.
"""
from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from common.managers import set_current_tenant
from common.models import FinancialAuditLog
from users.models import User
from accounts.models import Account
from products.models import Product
from clients.models import Client
from loans.models import LoanProduct, LoanAccount, LoanRepaymentSchedule
from loans.schedule_repair_service import repair_schedule

from .test_deferred_interest import _make_env, _make_account


class ScheduleRepairServiceTestCase(TestCase):
    def setUp(self):
        self.owner, self.tenant, self.branch = _make_env("repairsvc")
        self.actor = User.objects.create_user(username="repairsvc_actor", password="pass")
        self.actor.tenant = self.tenant
        self.actor.branch = self.branch
        self.actor.save()

        self.loan_parent = _make_account(self.owner, self.branch, "Loans Receivable", "1300", Account.LOAN)

        flat_gl = Product.objects.create(
            name="Weekly Flat Loan", code="LOAN-WKFLAT", product_type="LOAN",
            owner=self.owner, branch=self.branch,
        )
        self.flat_product = LoanProduct.objects.create(
            product=flat_gl, parent_account=self.loan_parent,
            default_interest_rate=Decimal("20.00"), interest_calculation_method="flat",
            min_loan_amount=Decimal("1000.00"), max_loan_amount=Decimal("500000.00"),
            owner=self.owner, branch=self.branch,
        )

        rb_gl = Product.objects.create(
            name="Reducing Balance Loan", code="LOAN-RB", product_type="LOAN",
            owner=self.owner, branch=self.branch,
        )
        self.reducing_balance_product = LoanProduct.objects.create(
            product=rb_gl, parent_account=self.loan_parent,
            default_interest_rate=Decimal("5.00"), interest_calculation_method="reducing_balance",
            min_loan_amount=Decimal("1000.00"), max_loan_amount=Decimal("500000.00"),
            owner=self.owner, branch=self.branch,
        )

        self.client_ = Client.objects.create(
            client_id="CLI-REPAIRSVC", first_name="Tolu", last_name="Bankole",
            gender="male", phone_primary="08030000000",
            tenant=self.tenant, owner=self.owner, branch=self.branch,
        )

    def tearDown(self):
        set_current_tenant(None)

    def _make_loan(self, loan_number, product, *, number_of_installments, repayment_frequency="weekly",
                    outstanding_principal, outstanding_interest=Decimal("0.00"),
                    outstanding_fees=Decimal("0.00"), outstanding_penalties=Decimal("0.00"),
                    disbursed_amount=Decimal("30000.00"), interest_rate=Decimal("20.00"),
                    origin=LoanAccount.ORIGIN_LEGACY_IMPORT):
        account = Account.objects.create(
            name=f"{loan_number} Loan Account", code=f"1300{loan_number[-3:]}",
            account_type=Account.LOAN, account_level=Account.LEVEL_CHILD,
            parent=self.loan_parent, owner=self.owner, created_by=self.owner, branch=self.branch,
        )
        return LoanAccount.objects.create(
            client=self.client_, product=product, account=account, loan_number=loan_number,
            requested_amount=disbursed_amount, approved_amount=disbursed_amount,
            disbursed_amount=disbursed_amount, outstanding_principal=outstanding_principal,
            outstanding_interest=outstanding_interest, outstanding_fees=outstanding_fees,
            outstanding_penalties=outstanding_penalties, interest_rate=interest_rate,
            number_of_installments=number_of_installments, term_months=number_of_installments,
            repayment_frequency=repayment_frequency, status="active",
            disbursement_date=timezone.localdate() - timedelta(days=60),
            origin=origin, owner=self.owner, branch=self.branch, created_by=self.owner,
        )

    def _make_row(self, loan, installment_number, due_date, *, principal_due, principal_paid=Decimal("0.00"),
                  status="overdue"):
        return LoanRepaymentSchedule.objects.create(
            loan=loan, installment_number=installment_number, due_date=due_date,
            principal_due=principal_due, interest_due=Decimal("0.00"), fees_due=Decimal("0.00"),
            penalty_due=Decimal("0.00"), total_due=principal_due,
            principal_paid=principal_paid, total_paid=principal_paid,
            status=status, owner=self.owner, branch=self.branch, created_by=self.owner,
        )

    # ── Step 1: backward-fill ────────────────────────────────────────────

    def test_backward_fill_redistributes_from_the_newest_row(self):
        """
        3-installment weekly flat loan (proves the repair is NOT monthly-
        specific): flat installment = 30000*1.20/3 = 12000.00. Schedule
        still shows all 3 rows fully open/overdue at 12000 each, but the
        loan's real outstanding_principal (8000.00) says the client has
        actually paid down more than the schedule reflects — the exact
        'payment didn't move the schedule' shape this repairs. Counting
        backward from the newest row: row3 absorbs 8000 of payment, row2 and
        row1 end up fully paid.
        """
        loan = self._make_loan(
            "LN-BF-001", self.flat_product, number_of_installments=3,
            outstanding_principal=Decimal("8000.00"),
        )
        today = timezone.localdate()
        r1 = self._make_row(loan, 1, today - timedelta(days=21), principal_due=Decimal("12000.00"), status="overdue")
        r2 = self._make_row(loan, 2, today - timedelta(days=14), principal_due=Decimal("12000.00"), status="overdue")
        r3 = self._make_row(loan, 3, today - timedelta(days=7), principal_due=Decimal("12000.00"), status="overdue")

        preview = repair_schedule(loan, apply=False, user=self.actor, reason="")
        self.assertTrue(preview["eligible"])
        self.assertIsNone(preview["step1_skipped_reason"])
        self.assertEqual(preview["flat_installment"], "12000.00")
        self.assertFalse(preview["applied"])

        # Dry run must not write anything.
        r1.refresh_from_db(); r2.refresh_from_db(); r3.refresh_from_db()
        self.assertEqual(r1.status, "overdue")
        self.assertEqual(r3.total_paid, Decimal("0.00"))

        applied = repair_schedule(loan, apply=True, user=self.actor, reason="July/Aug payment-allocation bug backfill")
        self.assertTrue(applied["applied"])

        r1.refresh_from_db(); r2.refresh_from_db(); r3.refresh_from_db()
        self.assertEqual(r1.status, "paid")
        self.assertEqual(r1.total_paid, Decimal("12000.00"))
        self.assertEqual(r2.status, "paid")
        self.assertEqual(r2.total_paid, Decimal("12000.00"))
        # 'partial' is what the redistribution itself assigns, but its due date is
        # already in the past — _calculate_arrears()'s post-apply mark_overdue_
        # installments() (loans/models.py) normalizes any past-due pending/partial
        # row to 'overdue', same as it would for any other repayment path.
        self.assertEqual(r3.status, "overdue")
        self.assertEqual(r3.total_paid, Decimal("4000.00"))
        self.assertEqual(r3.total_due, Decimal("12000.00"))

        log = FinancialAuditLog.objects.filter(
            event_type=FinancialAuditLog.LOAN_BALANCE_CORRECTION, record_id=str(loan.pk),
        ).latest("timestamp")
        self.assertEqual(log.acted_by, self.actor)
        self.assertIn("July/Aug payment-allocation bug backfill", log.description)

    def test_reducing_balance_product_skips_backward_fill(self):
        loan = self._make_loan(
            "LN-RB-001", self.reducing_balance_product, number_of_installments=2,
            outstanding_principal=Decimal("5000.00"), interest_rate=Decimal("5.00"),
        )
        today = timezone.localdate()
        self._make_row(loan, 1, today - timedelta(days=7), principal_due=Decimal("2500.00"), status="overdue")
        self._make_row(loan, 2, today, principal_due=Decimal("2500.00"), status="pending")

        result = repair_schedule(loan, apply=False, user=self.actor, reason="")
        # Nothing overstated in the schedule either (2500+2500 == outstanding_principal),
        # so with step 1 skipped and step 2 a no-op, the whole thing is ineligible.
        self.assertFalse(result["eligible"])
        self.assertIn("reducing-balance", result["needs_review_reason"])

    # ── Step 2: retire stale rows, decoupled from step 1's precondition ────

    def test_row_count_mismatch_does_not_block_stale_row_retirement(self):
        """
        Regression test: LN-858-shaped loan — number_of_installments says 2,
        but the schedule was left with 4 phantom rows from a legacy
        rollover (~40000 face value) while outstanding_principal (the
        trustworthy figure) is only 5000. Step 1 cannot trust its
        flat-formula math here (row count != number_of_installments) and
        must skip itself — but that must NOT stop step 2 from retiring the
        stale rows down to what's really owed.
        """
        loan = self._make_loan(
            "LN-STALE-001", self.flat_product, number_of_installments=2,
            outstanding_principal=Decimal("5000.00"), origin=LoanAccount.ORIGIN_LEGACY_IMPORT,
        )
        today = timezone.localdate()
        rows = [
            self._make_row(loan, i + 1, today - timedelta(days=(4 - i) * 7), principal_due=Decimal("10000.00"))
            for i in range(4)
        ]

        preview = repair_schedule(loan, apply=False, user=self.actor, reason="")
        self.assertTrue(preview["eligible"])
        self.assertIsNotNone(preview["step1_skipped_reason"])
        self.assertIn("row count", preview["step1_skipped_reason"])
        self.assertIsNone(preview["flat_installment"])
        self.assertEqual(preview["retired_count"], 3)
        self.assertEqual(preview["capped_count"], 1)

        applied = repair_schedule(loan, apply=True, user=self.actor, reason="LN-858-shaped legacy rollover cleanup")
        self.assertTrue(applied["applied"])

        for r in rows:
            r.refresh_from_db()
        # Oldest row (rows[0]) is processed first and absorbs the real remaining
        # balance — capped rather than retired, original status untouched.
        self.assertEqual(rows[0].status, "overdue")
        self.assertEqual(rows[0].principal_due, Decimal("5000.00"))
        self.assertEqual(rows[1].status, "restructured")
        self.assertEqual(rows[1].principal_due, Decimal("0.00"))
        self.assertEqual(rows[2].status, "restructured")
        self.assertEqual(rows[3].status, "restructured")

        loan.refresh_from_db()
        remaining = sum(
            (r.principal_due - r.principal_paid) for r in LoanRepaymentSchedule.objects.filter(loan=loan)
        )
        self.assertEqual(remaining, loan.outstanding_principal)

    def test_dry_run_writes_nothing_for_stale_row_retirement(self):
        loan = self._make_loan(
            "LN-STALE-DRY", self.flat_product, number_of_installments=1,
            outstanding_principal=Decimal("1000.00"),
        )
        today = timezone.localdate()
        row = self._make_row(loan, 1, today - timedelta(days=7), principal_due=Decimal("9000.00"))

        result = repair_schedule(loan, apply=False, user=self.actor, reason="")
        self.assertTrue(result["eligible"])
        self.assertEqual(result["retired_count"], 0)  # only 1 row, gets capped not retired
        self.assertEqual(result["capped_count"], 1)

        row.refresh_from_db()
        self.assertEqual(row.principal_due, Decimal("9000.00"), "dry-run must not write")

    def test_no_schedule_rows_is_ineligible(self):
        loan = self._make_loan(
            "LN-EMPTY-001", self.flat_product, number_of_installments=1,
            outstanding_principal=Decimal("1000.00"),
        )
        result = repair_schedule(loan, apply=False, user=self.actor, reason="")
        self.assertFalse(result["eligible"])
        self.assertIn("No schedule rows", result["needs_review_reason"])
