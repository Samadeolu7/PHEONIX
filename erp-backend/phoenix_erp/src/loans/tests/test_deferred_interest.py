"""
Tests for loan interest income recognition — three tiers, each opt-in via
LoanProduct GL configuration:

1. No income account configured at all: interest is never recognized as income
   (pure legacy-misconfiguration fallback — everything folds into Loan Receivable).
2. Default (interest_income_account configured, no deferral fields): the full
   interest is recognized in Income immediately and permanently at disbursement —
   matching how the legacy system recognized interest — and subsequent payments
   are a plain Bank <-> Loan Receivable reduction that never touches Income again.
3. Deferred/unearned compromise (all three deferral fields configured): Interest
   Income is booked in full and permanently at disbursement too, but offset by an
   Unearned Interest Income liability (carrying a debit/negative balance by
   design) that a management command unwinds as each installment's due date
   passes. Kept available but not the default.
"""
from decimal import Decimal

from django.core.management import call_command
from django.db.models import Sum
from django.test import TestCase
from django.utils import timezone

from common.managers import set_current_tenant
from users.models import Tenant, User
from branches.models import Branch
from accounts.models import Account
from products.models import Product
from clients.models import Client
from loans.models import LoanProduct, LoanAccount


def _make_env(username):
    # Clear any stale thread-local tenant left over from a previous test method
    # (TimeStampedModel.save() auto-fills tenant from this thread-local whenever
    # unset — a leftover reference to an already-rolled-back tenant would make
    # the auto-created Staff profile below point at a nonexistent tenant row).
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


def _make_account(user, branch, name, code, account_type, account_level=Account.LEVEL_PARENT):
    return Account.objects.create(
        name=name, code=code, account_type=account_type,
        account_level=account_level, owner=user, created_by=user, branch=branch,
    )


class DeferredInterestTestCase(TestCase):
    """
    Three loan products in every test: `self.no_account_product` has no income
    account at all, `self.default_product` has only interest_income_account
    (the new default — recognize at disbursement), and `self.deferred_product`
    has all three deferral fields configured (the compromise mechanism).
    """

    def setUp(self):
        self.owner, self.tenant, self.branch = _make_env("defint")
        # A second user in the SAME tenant/branch to satisfy maker-checker on
        # approve() — deliberately not a second _make_env() call, since that
        # would flip the set_current_tenant() thread-local to a different
        # tenant mid-test.
        self.approver = User.objects.create_user(username="defint_apr", password="pass")
        self.approver.tenant = self.tenant
        self.approver.branch = self.branch
        self.approver.save()

        self.loan_parent = _make_account(self.owner, self.branch, "Loans Receivable", "1300", Account.LOAN)
        self.cash_account = _make_account(self.owner, self.branch, "Bank", "1001", Account.ASSET)
        self.interest_income_account = _make_account(self.owner, self.branch, "Interest Income", "4100", Account.INCOME)
        self.unearned_account = _make_account(self.owner, self.branch, "Unearned Interest Income", "2132", Account.LIABILITY)
        self.receivable_account = _make_account(self.owner, self.branch, "Interest Receivable", "1105", Account.ASSET)
        self.writeoff_expense_account = _make_account(self.owner, self.branch, "Interest Write-off Expense", "5400", Account.EXPENSE)
        self.principal_provision_account = _make_account(self.owner, self.branch, "Loan Loss Provision", "5401", Account.EXPENSE)

        no_account_gl_product = Product.objects.create(name="No-Account Loan", code="LOAN-NOACC", product_type="LOAN", owner=self.owner, branch=self.branch)
        self.no_account_product = LoanProduct.objects.create(
            product=no_account_gl_product,
            parent_account=self.loan_parent,
            disbursement_account=self.cash_account,
            default_interest_rate=Decimal("10.00"),
            interest_calculation_method="flat",
            min_loan_amount=Decimal("1000.00"),
            max_loan_amount=Decimal("500000.00"),
            owner=self.owner, branch=self.branch,
        )

        default_gl_product = Product.objects.create(name="Default Loan", code="LOAN-DEFAULT", product_type="LOAN", owner=self.owner, branch=self.branch)
        self.default_product = LoanProduct.objects.create(
            product=default_gl_product,
            parent_account=self.loan_parent,
            disbursement_account=self.cash_account,
            interest_income_account=self.interest_income_account,
            default_interest_rate=Decimal("10.00"),
            interest_calculation_method="flat",
            min_loan_amount=Decimal("1000.00"),
            max_loan_amount=Decimal("500000.00"),
            owner=self.owner, branch=self.branch,
        )

        deferred_gl_product = Product.objects.create(name="Deferred Loan", code="LOAN-DEF", product_type="LOAN", owner=self.owner, branch=self.branch)
        self.deferred_product = LoanProduct.objects.create(
            product=deferred_gl_product,
            parent_account=self.loan_parent,
            disbursement_account=self.cash_account,
            interest_income_account=self.interest_income_account,
            accrued_interest_account=self.receivable_account,
            unearned_interest_income_account=self.unearned_account,
            interest_writeoff_expense_account=self.writeoff_expense_account,
            default_interest_rate=Decimal("10.00"),
            interest_calculation_method="flat",
            min_loan_amount=Decimal("1000.00"),
            max_loan_amount=Decimal("500000.00"),
            owner=self.owner, branch=self.branch,
        )

        self.client = Client.objects.create(
            client_id="CLI-DEFINT", first_name="Ada", last_name="Lovelace",
            gender="female", phone_primary="08010000000",
            tenant=self.tenant, owner=self.owner, branch=self.branch,
        )

    def tearDown(self):
        # Don't leave this test's tenant in the thread-local for whatever test
        # runs next in the same process — it would be a dangling reference
        # once this test's transaction rolls back.
        set_current_tenant(None)

    def _make_loan(self, product, loan_number, amount=Decimal("10000.00"), term_months=2):
        seq = LoanAccount.objects.count() + 1
        account = Account.objects.create(
            name=f"{loan_number} Loan Account", code=f"13{seq:04d}",
            account_type=Account.LOAN, account_level=Account.LEVEL_CHILD,
            parent=self.loan_parent, owner=self.owner, created_by=self.owner, branch=self.branch,
        )
        loan = LoanAccount.objects.create(
            client=self.client,
            product=product,
            account=account,
            loan_number=loan_number,
            requested_amount=amount,
            interest_rate=Decimal("10.00"),
            term_months=term_months,
            repayment_frequency="monthly",
            status="pending",
            owner=self.owner,
            branch=self.branch,
        )
        loan.approve(user=self.approver)
        loan.disburse(disbursement_account=self.cash_account, disbursed_by=self.approver)
        return loan

    # ── No income account configured at all ────────────────────────────────

    def test_no_account_product_never_recognizes_interest(self):
        loan = self._make_loan(self.no_account_product, "LN-NOACC-1")
        self.assertFalse(loan.interest_recognized_at_disbursement)
        self.assertFalse(loan.interest_deferral_active)

        schedule_row = loan.repayment_schedule.order_by("due_date").first()
        loan.record_payment(
            amount=schedule_row.interest_due,
            payment_account=self.cash_account,
            received_by=self.approver,
        )
        self.interest_income_account.refresh_from_db()
        # Nothing recognized — the payment folds entirely into Loan Receivable.
        self.assertEqual(self.interest_income_account.balance, Decimal("0.00"))

    # ── Default: recognize in full at disbursement (matches legacy system) ─

    def test_default_product_recognizes_interest_at_disbursement(self):
        loan = self._make_loan(self.default_product, "LN-DEFAULT-1", amount=Decimal("10000.00"), term_months=2)
        self.assertTrue(loan.interest_recognized_at_disbursement)
        self.assertFalse(loan.interest_deferral_active)

        total_interest = loan.repayment_schedule.aggregate(t=Sum("interest_due"))["t"]

        self.interest_income_account.refresh_from_db()
        loan.account.refresh_from_db()
        self.assertEqual(self.interest_income_account.balance, total_interest)
        # Loan Receivable totals principal + interest, matching the legacy system.
        self.assertEqual(loan.account.balance, loan.disbursed_amount + total_interest)

    def test_default_product_payment_does_not_recredit_income(self):
        loan = self._make_loan(self.default_product, "LN-DEFAULT-2", amount=Decimal("10000.00"), term_months=2)
        total_interest = loan.repayment_schedule.aggregate(t=Sum("interest_due"))["t"]

        self.interest_income_account.refresh_from_db()
        income_before = self.interest_income_account.balance

        schedule_row = loan.repayment_schedule.order_by("due_date").first()
        loan.record_payment(
            amount=schedule_row.total_due,
            payment_account=self.cash_account,
            received_by=self.approver,
        )

        self.interest_income_account.refresh_from_db()
        loan.account.refresh_from_db()
        # Income must NOT move again — it was already booked in full at disbursement.
        self.assertEqual(self.interest_income_account.balance, income_before)
        # Loan Receivable reduces by the full payment (principal + interest combined).
        expected_balance = (loan.disbursed_amount + total_interest) - schedule_row.total_due
        self.assertEqual(loan.account.balance, expected_balance)

    # ── Deferred/unearned compromise (kept available, not the default) ─────

    def test_disbursement_books_income_permanently_and_defers_liability(self):
        loan = self._make_loan(self.deferred_product, "LN-DEF-1", amount=Decimal("10000.00"), term_months=2)
        self.assertTrue(loan.interest_deferral_active)

        total_interest = loan.repayment_schedule.aggregate(t=Sum("interest_due"))["t"]

        self.interest_income_account.refresh_from_db()
        self.unearned_account.refresh_from_db()
        self.assertEqual(self.interest_income_account.balance, total_interest)
        self.assertEqual(self.unearned_account.balance, -total_interest)

    def test_recognize_earned_interest_moves_liability_to_receivable(self):
        loan = self._make_loan(self.deferred_product, "LN-DEF-2", amount=Decimal("10000.00"), term_months=2)
        first_row = loan.repayment_schedule.order_by("due_date").first()

        call_command("recognize_earned_interest", as_of=first_row.due_date.isoformat())

        first_row.refresh_from_db()
        self.assertTrue(first_row.interest_recognized)

        self.unearned_account.refresh_from_db()
        self.receivable_account.refresh_from_db()
        total_interest = loan.repayment_schedule.aggregate(t=Sum("interest_due"))["t"]
        self.assertEqual(self.unearned_account.balance, -(total_interest - first_row.interest_due))
        self.assertEqual(self.receivable_account.balance, first_row.interest_due)

    def test_payment_after_recognition_credits_receivable_not_income(self):
        loan = self._make_loan(self.deferred_product, "LN-DEF-3", amount=Decimal("10000.00"), term_months=2)
        first_row = loan.repayment_schedule.order_by("due_date").first()
        call_command("recognize_earned_interest", as_of=first_row.due_date.isoformat())

        self.interest_income_account.refresh_from_db()
        income_before = self.interest_income_account.balance

        # Pay exactly the recognized interest (payment priority is interest-first
        # across the whole loan, so paying the installment's full total_due would
        # also consume the second installment's not-yet-recognized interest).
        loan.record_payment(
            amount=first_row.interest_due,
            payment_date=first_row.due_date,
            payment_account=self.cash_account,
            received_by=self.approver,
        )

        self.interest_income_account.refresh_from_db()
        self.receivable_account.refresh_from_db()
        # Income must NOT move again — it was already booked in full at disbursement.
        self.assertEqual(self.interest_income_account.balance, income_before)
        # Receivable was credited (collected) by the interest portion of the payment.
        self.assertEqual(self.receivable_account.balance, Decimal("0.00"))

    def test_early_payoff_recognizes_remaining_interest(self):
        loan = self._make_loan(self.deferred_product, "LN-DEF-4", amount=Decimal("10000.00"), term_months=2)
        total_interest = loan.repayment_schedule.aggregate(t=Sum("interest_due"))["t"]

        # Pay off everything in one shot, before any installment's due date passes.
        loan.record_payment(
            amount=loan.total_outstanding,
            payment_account=self.cash_account,
            received_by=self.approver,
        )
        loan.refresh_from_db()
        self.assertEqual(loan.status, "paid_off")

        unrecognized = loan.repayment_schedule.filter(interest_recognized=False).count()
        self.assertEqual(unrecognized, 0)

        self.unearned_account.refresh_from_db()
        self.assertEqual(self.unearned_account.balance, Decimal("0.00"))

        self.interest_income_account.refresh_from_db()
        self.assertEqual(self.interest_income_account.balance, total_interest)

    def test_write_off_flushes_remaining_unearned_interest_to_expense(self):
        loan = self._make_loan(self.deferred_product, "LN-DEF-5", amount=Decimal("10000.00"), term_months=2)
        total_interest = loan.repayment_schedule.aggregate(t=Sum("interest_due"))["t"]

        loan.write_off(written_off_by=self.approver, provision_account=self.principal_provision_account)

        loan.refresh_from_db()
        self.assertEqual(loan.status, "written_off")

        self.unearned_account.refresh_from_db()
        self.writeoff_expense_account.refresh_from_db()
        self.assertEqual(self.unearned_account.balance, Decimal("0.00"))
        self.assertEqual(self.writeoff_expense_account.balance, total_interest)

        written_off_rows = loan.repayment_schedule.filter(interest_written_off=True).count()
        self.assertEqual(written_off_rows, loan.repayment_schedule.count())
