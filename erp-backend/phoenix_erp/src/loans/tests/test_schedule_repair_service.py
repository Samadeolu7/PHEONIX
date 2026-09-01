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

    def test_healthy_flat_loan_with_separate_interest_is_left_untouched(self):
        """
        A flat loan that legitimately tracks principal_due and interest_due
        separately (as RepaymentScheduleService.generate() actually produces)
        and whose schedule already reconciles to outstanding_principal/
        interest/fees must come back byte-for-byte unchanged — not have its
        interest folded into principal just because it's eligible in
        principle. This is what protects a loan that's already correct,
        independent of who has access to trigger the repair.
        """
        loan = self._make_loan(
            "LN-HEALTHY-001", self.flat_product, number_of_installments=1,
            outstanding_principal=Decimal("5000.00"), outstanding_interest=Decimal("1000.00"),
        )
        row = LoanRepaymentSchedule.objects.create(
            loan=loan, installment_number=1, due_date=timezone.localdate() - timedelta(days=7),
            principal_due=Decimal("5000.00"), interest_due=Decimal("1000.00"), fees_due=Decimal("0.00"),
            penalty_due=Decimal("0.00"), total_due=Decimal("6000.00"),
            principal_paid=Decimal("0.00"), interest_paid=Decimal("0.00"), total_paid=Decimal("0.00"),
            status="overdue", owner=self.owner, branch=self.branch, created_by=self.owner,
        )

        preview = repair_schedule(loan, apply=False, user=self.actor, reason="")
        self.assertTrue(preview["eligible"])
        self.assertIsNone(preview["step1_skipped_reason"])
        self.assertIsNone(preview["flat_installment"])
        self.assertEqual(preview["retired_count"], 0)
        self.assertEqual(preview["capped_count"], 0)
        self.assertEqual(preview["rows"][0]["before"], preview["rows"][0]["after"])

        applied = repair_schedule(loan, apply=True, user=self.actor, reason="should be a genuine no-op")
        self.assertFalse(applied["applied"], "nothing changed, so there is nothing to apply or log")

        row.refresh_from_db()
        self.assertEqual(row.principal_due, Decimal("5000.00"))
        self.assertEqual(row.interest_due, Decimal("1000.00"), "interest must not be folded into principal")

    def test_shape_inconsistency_overrides_aggregate_reconciliation_shortcut(self):
        """
        Regression test for a real production case (LN-919, caught 2026-09-01):
        an earlier retirement left 12 trailing rows zeroed/'restructured'
        while two OLDER rows (due before all of them) were still genuinely
        open, one of them (row11) 8 kobo under the formula amount. The
        aggregate remaining across the whole schedule happens to exactly
        equal outstanding_principal (2347.84 + 5086.88 == 7434.72), so a
        pure aggregate-sum check would call this "already reconciles" and
        report nothing to repair — which is exactly what happened live.

        By the loan's own calendar (23 weekly installments from
        disbursement, 20 already due today), the borrower has actually
        repaid MORE than what's due-to-date (109,565.28 repaid vs
        101,739.20 expected) — so the 8-kobo below-formula row is
        corroborated as harmless rounding, not a genuine mismatch, and the
        repair applies automatically rather than requiring a human
        --force override. Confirms both fixes: the shape check (don't take
        the no-op shortcut) and the chronological cross-check (don't
        require manual override when the borrower isn't actually behind).
        """
        loan = self._make_loan(
            "LN-919-LIKE", self.flat_product, number_of_installments=23,
            repayment_frequency="weekly", outstanding_principal=Decimal("7434.72"),
            disbursed_amount=Decimal("100000.00"), interest_rate=Decimal("17.00"),
        )
        today = timezone.localdate()
        start = today - timedelta(weeks=19)  # row20 (12th "restructured" loop row) due == today
        for i in range(9):
            self._make_row(
                loan, i + 1, start + timedelta(weeks=i), principal_due=Decimal("5086.96"),
                principal_paid=Decimal("5086.96"), status="paid",
            )
        row10 = self._make_row(
            loan, 10, start + timedelta(weeks=9), principal_due=Decimal("5086.96"),
            principal_paid=Decimal("2739.12"), status="overdue",
        )
        row11 = self._make_row(
            loan, 11, start + timedelta(weeks=10), principal_due=Decimal("5086.88"),
            principal_paid=Decimal("0.00"), status="overdue",
        )
        trailing_rows = [
            self._make_row(
                loan, 12 + i, start + timedelta(weeks=11 + i), principal_due=Decimal("0.00"),
                principal_paid=Decimal("0.00"), status="restructured",
            )
            for i in range(12)
        ]

        preview = repair_schedule(loan, apply=False, user=self.actor, reason="")
        self.assertTrue(preview["eligible"])
        self.assertIsNone(
            preview["step1_skipped_reason"],
            "not behind its own repayment calendar — the below-formula row must be trusted "
            "automatically rather than blocked pending manual review",
        )
        self.assertEqual(preview["flat_installment"], "5086.96")

        applied = repair_schedule(loan, apply=True, user=self.actor, reason="LN-919 chronological repair")
        self.assertTrue(applied["applied"])

        loan.refresh_from_db()
        self.assertEqual(loan.days_in_arrears, 0, "chronologically current, not 71 days overdue")
        self.assertEqual(loan.arrears_amount, Decimal("0.00"))

        # trailing_rows[i] is installment (12+i); rows 10-21 (row10, row11, and
        # installments 12-21 = trailing_rows[:10]) are fully absorbed and paid —
        # only the last two installments (22, 23) carry the remaining balance.
        for r in [row10, row11] + trailing_rows[:10]:
            r.refresh_from_db()
            self.assertEqual(r.status, "paid")
            self.assertEqual(r.principal_paid, Decimal("5086.96"))

        row22, row23 = trailing_rows[10], trailing_rows[11]
        row22.refresh_from_db(); row23.refresh_from_db()
        # Newest row (23) is filled first from the pool and absorbs a full
        # installment (2347.76 pool remaining after it), leaving row22 to
        # absorb the rest — so 23 ends up with the pool's leftover (0 paid),
        # and 22 carries the partial payment (2739.20 of its 5086.96 due).
        self.assertEqual(row22.principal_paid, Decimal("2739.20"))
        self.assertEqual(row23.principal_paid, Decimal("0.00"))
        remaining = (row22.principal_due - row22.principal_paid) + (row23.principal_due - row23.principal_paid)
        self.assertEqual(remaining, Decimal("7434.72"))

    def test_below_flat_mismatch_still_blocks_when_genuinely_behind_schedule(self):
        """
        The chronological bypass only trusts a below-formula row when the
        borrower isn't actually behind their own repayment calendar — this
        loan IS behind (only ~1/3 of what's due by today has been repaid),
        so the below-flat guard must still hold and require manual review,
        same as before the LN-919 fix.
        """
        # outstanding_principal (24000.00) is deliberately NOT equal to the
        # schedule's own current remaining (23999.50, from the below-formula
        # row2) — otherwise the aggregate-reconciles no-op shortcut would fire
        # before this test ever reaches the below-flat check it's testing.
        loan = self._make_loan(
            "LN-BEHIND-001", self.flat_product, number_of_installments=3,
            outstanding_principal=Decimal("24000.00"), disbursed_amount=Decimal("30000.00"),
            interest_rate=Decimal("20.00"),
        )
        today = timezone.localdate()
        self._make_row(
            loan, 1, today - timedelta(weeks=3), principal_due=Decimal("12000.00"),
            principal_paid=Decimal("12000.00"), status="paid",
        )
        self._make_row(
            loan, 2, today - timedelta(weeks=2), principal_due=Decimal("11999.50"), status="overdue",
        )
        self._make_row(
            loan, 3, today - timedelta(weeks=1), principal_due=Decimal("12000.00"), status="overdue",
        )

        result = repair_schedule(loan, apply=False, user=self.actor, reason="")
        self.assertTrue(result["eligible"])
        self.assertIsNotNone(result["step1_skipped_reason"])
        self.assertIn("below the formula", result["step1_skipped_reason"])
        self.assertIn("behind its own repayment calendar", result["step1_skipped_reason"])

    def test_reducing_balance_loan_still_gets_stale_row_cleanup(self):
        """
        A genuinely broken reducing-balance loan can't get the flat-formula
        backward-fill (step 1 correctly skips itself), but step 2's
        calculation-method-agnostic stale-row retirement still applies —
        the two steps stay independent even on a product step 1 refuses.
        """
        loan = self._make_loan(
            "LN-RB-001", self.reducing_balance_product, number_of_installments=2,
            outstanding_principal=Decimal("2000.00"), interest_rate=Decimal("5.00"),
        )
        today = timezone.localdate()
        row1 = self._make_row(loan, 1, today - timedelta(days=14), principal_due=Decimal("4000.00"))
        row2 = self._make_row(loan, 2, today - timedelta(days=7), principal_due=Decimal("1000.00"))

        preview = repair_schedule(loan, apply=False, user=self.actor, reason="")
        self.assertTrue(preview["eligible"])
        self.assertIsNotNone(preview["step1_skipped_reason"])
        self.assertIn("reducing-balance", preview["step1_skipped_reason"])
        self.assertIsNone(preview["flat_installment"])
        self.assertEqual(preview["retired_count"], 1)
        self.assertEqual(preview["capped_count"], 1)

        applied = repair_schedule(loan, apply=True, user=self.actor, reason="reducing-balance stale row cleanup")
        self.assertTrue(applied["applied"])

        row1.refresh_from_db(); row2.refresh_from_db()
        self.assertEqual(row1.status, "overdue")
        self.assertEqual(row1.principal_due, Decimal("2000.00"))
        self.assertEqual(row2.status, "restructured")
        self.assertEqual(row2.principal_due, Decimal("0.00"))

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
