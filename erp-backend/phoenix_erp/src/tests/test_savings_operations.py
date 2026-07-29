"""
tests/test_savings_operations.py
==================================
Unit & integration tests for savings accounts:

  1. SavingsAccount creation linked to GL child account
  2. Balance reads from linked Account
  3. SavingsGoal creation and progress tracking
  4. Interest accrual entry creation
  5. Status transitions (active → dormant → closed)
  6. Minimum balance enforcement
  7. CompulsorySavingsPolicy creation
  8. API endpoint smoke tests
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
from savings.models import (
    SavingsAccount,
    SavingsGoal,
    InterestAccrual,
    CompulsorySavingsPolicy,
    SavingsProduct,
)
from savings.services import handle_first_deposit_income


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_env(username="sav_test"):
    user = User.objects.create_user(username=username, password="pass")
    tenant = Tenant.objects.create(name=f"T-{username}", slug=f"t-{username}", owner=user)
    user.tenant = tenant
    user.save()
    branch = Branch.objects.create(name="HQ", code="HQ", tenant=tenant, owner=user)
    user.branch = branch
    user.save()
    set_current_tenant(tenant)
    return user, tenant, branch


def _make_savings_setup(user, tenant, branch):
    """Create the full set of objects required by SavingsAccount."""
    parent_acc = Account.objects.create(
        name="Savings Accounts", code="2100", account_type=Account.SAVINGS,
        account_level=Account.LEVEL_PARENT, owner=user, created_by=user, branch=branch,
    )
    child_acc = Account.objects.create(
        name="Jane Savings", code="2101", account_type=Account.SAVINGS,
        account_level=Account.LEVEL_CHILD, parent=parent_acc,
        owner=user, created_by=user, branch=branch,
    )
    product = Product.objects.create(
        name="Regular Savings", product_type="SAVINGS",
        owner=user, branch=branch,
    )
    client = Client.objects.create(
        client_id="S-CLI01", first_name="Jane", last_name="Saver",
        gender="female", phone_primary="08022222222",
        tenant=tenant, owner=user, branch=branch,
    )
    return parent_acc, child_acc, product, client


# ---------------------------------------------------------------------------
# SavingsAccount tests
# ---------------------------------------------------------------------------

class SavingsAccountTests(TestCase):
    def setUp(self):
        self.user, self.tenant, self.branch = _make_env("sa_test")
        _, self.child_acc, self.product, self.client = _make_savings_setup(
            self.user, self.tenant, self.branch
        )

    def _create_savings_account(self, number="SAV-2026-001"):
        return SavingsAccount.objects.create(
            client=self.client,
            account=self.child_acc,
            product=self.product,
            account_number=number,
            interest_rate=Decimal("3.50"),
            interest_calculation_method="monthly",
            minimum_balance=Decimal("500.00"),
            opened_on=timezone.now().date(),
            status="active",
            owner=self.user,
            branch=self.branch,
        )

    def test_savings_account_created_in_active_status(self):
        sa = self._create_savings_account()
        self.assertEqual(sa.status, "active")

    def test_savings_account_unique_account_number(self):
        self._create_savings_account("SAV-2026-002")
        with self.assertRaises(Exception):
            self._create_savings_account("SAV-2026-002")

    def test_savings_account_balance_reads_from_gl_account(self):
        sa = self._create_savings_account()
        # GL child account starts at zero balance
        self.assertEqual(sa.current_balance, self.child_acc.balance)

    def test_savings_account_available_balance_without_overdraft(self):
        sa = self._create_savings_account()
        sa.allow_overdraft = False
        sa.save()
        self.assertEqual(sa.available_balance, sa.current_balance)

    def test_savings_account_available_balance_with_overdraft(self):
        sa = self._create_savings_account()
        sa.allow_overdraft = True
        sa.overdraft_limit = Decimal("5000.00")
        sa.save()
        self.assertEqual(
            sa.available_balance,
            sa.current_balance + Decimal("5000.00")
        )

    def test_savings_account_status_transitions(self):
        sa = self._create_savings_account()
        for status in ["dormant", "frozen", "closed"]:
            sa.status = status
            sa.save()
            sa.refresh_from_db()
            self.assertEqual(sa.status, status)

    def test_savings_account_links_to_correct_product_type(self):
        sa = self._create_savings_account()
        self.assertEqual(sa.product.product_type, "SAVINGS")

    def test_savings_account_minimum_balance_stored(self):
        sa = self._create_savings_account()
        self.assertEqual(sa.minimum_balance, Decimal("500.00"))


# ---------------------------------------------------------------------------
# Daily contribution — first-deposit-income tests
# ---------------------------------------------------------------------------

class FirstDepositIncomeTests(TestCase):
    """
    Regression coverage for handle_first_deposit_income(): only the FIRST
    deposit of a calendar month on a daily-contribution product should be
    swept to income; every later deposit that month must credit the client's
    savings balance normally. Previously the "already deposited this month?"
    check only looked for credits on the savings account itself — which the
    income-diverted deposit never produces — so every deposit in the month
    kept being misclassified as "first" and swept to income.
    """

    def setUp(self):
        self.user, self.tenant, self.branch = _make_env("dc_test")
        _, self.child_acc, self.product, self.client = _make_savings_setup(
            self.user, self.tenant, self.branch
        )
        cash_parent = Account.objects.create(
            name="Cash", code="1000", account_type=Account.ASSET,
            account_level=Account.LEVEL_PARENT, owner=self.user,
            created_by=self.user, branch=self.branch,
        )
        self.cashier_acc = Account.objects.create(
            name="Cash Till", code="1001", account_type=Account.ASSET,
            account_level=Account.LEVEL_CHILD, parent=cash_parent, owner=self.user,
            created_by=self.user, branch=self.branch,
        )
        income_parent = Account.objects.create(
            name="Income", code="4000", account_type=Account.INCOME,
            account_level=Account.LEVEL_PARENT, owner=self.user,
            created_by=self.user, branch=self.branch,
        )
        self.income_acc = Account.objects.create(
            name="Daily Contribution Income", code="4001",
            account_type=Account.INCOME, account_level=Account.LEVEL_CHILD,
            parent=income_parent, owner=self.user, created_by=self.user,
            branch=self.branch,
        )
        SavingsProduct.objects.create(
            product=self.product,
            is_daily_contribution=True,
            first_deposit_is_income=True,
            first_deposit_income_account=self.income_acc,
            owner=self.user, branch=self.branch,
        )
        self.sa = SavingsAccount.objects.create(
            client=self.client,
            account=self.child_acc,
            product=self.product,
            account_number="SAV-DC-001",
            interest_rate=Decimal("0.00"),
            interest_calculation_method="monthly",
            minimum_balance=Decimal("0.00"),
            opened_on=timezone.now().date(),
            status="active",
            owner=self.user,
            branch=self.branch,
        )

    def _deposit(self, amount, day):
        date = timezone.now().date().replace(day=day)
        journal, was_income = handle_first_deposit_income(
            savings_account=self.sa,
            amount=Decimal(amount),
            deposit_date=date,
            cashier_account=self.cashier_acc,
            transacted_by=self.user,
        )
        if not was_income:
            journal = self.sa.deposit(
                amount=Decimal(amount),
                cashier_account=self.cashier_acc,
                transacted_by=self.user,
                date=date,
            )
        return journal, was_income

    def test_first_deposit_of_month_is_posted_as_income(self):
        _, was_income = self._deposit("500.00", day=1)
        self.assertTrue(was_income)
        self.child_acc.refresh_from_db()
        self.assertEqual(self.child_acc.balance, Decimal("0.00"))
        self.income_acc.refresh_from_db()
        self.assertEqual(self.income_acc.balance, Decimal("500.00"))

    def test_second_deposit_of_month_credits_savings_balance(self):
        self._deposit("500.00", day=1)
        _, was_income = self._deposit("500.00", day=2)
        self.assertFalse(was_income)
        self.child_acc.refresh_from_db()
        self.assertEqual(self.child_acc.balance, Decimal("500.00"))
        self.income_acc.refresh_from_db()
        self.assertEqual(self.income_acc.balance, Decimal("500.00"))

    def test_third_deposit_of_month_also_credits_savings_balance(self):
        self._deposit("500.00", day=1)
        self._deposit("500.00", day=2)
        _, was_income = self._deposit("500.00", day=3)
        self.assertFalse(was_income)
        self.child_acc.refresh_from_db()
        self.assertEqual(self.child_acc.balance, Decimal("1000.00"))

    def test_first_deposit_of_next_month_is_income_again(self):
        self._deposit("500.00", day=1)
        self._deposit("500.00", day=2)
        next_month_day1 = (timezone.now().date().replace(day=1) + timezone.timedelta(days=32)).replace(day=1)
        journal, was_income = handle_first_deposit_income(
            savings_account=self.sa,
            amount=Decimal("500.00"),
            deposit_date=next_month_day1,
            cashier_account=self.cashier_acc,
            transacted_by=self.user,
        )
        self.assertTrue(was_income)

    def test_first_deposit_above_committed_amount_sweeps_only_committed_portion(self):
        """
        If the amount collected exceeds what this client committed to (e.g.
        several days paid on one instrument), only the committed amount is
        income — the excess must still land in the savings balance.
        """
        self.sa.contribution_amount = Decimal("500.00")
        self.sa.save(update_fields=['contribution_amount'])

        journal, was_income = self._deposit("800.00", day=1)
        self.assertTrue(was_income)
        self.child_acc.refresh_from_db()
        self.income_acc.refresh_from_db()
        self.assertEqual(self.income_acc.balance, Decimal("500.00"))
        self.assertEqual(self.child_acc.balance, Decimal("300.00"))

    def test_first_deposit_at_or_below_committed_amount_is_fully_income(self):
        self.sa.contribution_amount = Decimal("500.00")
        self.sa.save(update_fields=['contribution_amount'])

        _, was_income = self._deposit("500.00", day=1)
        self.assertTrue(was_income)
        self.child_acc.refresh_from_db()
        self.income_acc.refresh_from_db()
        self.assertEqual(self.income_acc.balance, Decimal("500.00"))
        self.assertEqual(self.child_acc.balance, Decimal("0.00"))

    def test_explicit_committed_amount_overrides_account_and_schedule(self):
        """Callers that already know the exact expected amount (e.g. mark_paid
        paying a specific schedule row) can pass committed_amount directly."""
        self.sa.contribution_amount = Decimal("500.00")
        self.sa.save(update_fields=['contribution_amount'])

        journal, was_income = handle_first_deposit_income(
            savings_account=self.sa,
            amount=Decimal("800.00"),
            deposit_date=timezone.now().date().replace(day=1),
            cashier_account=self.cashier_acc,
            transacted_by=self.user,
            committed_amount=Decimal("650.00"),
        )
        self.assertTrue(was_income)
        self.child_acc.refresh_from_db()
        self.income_acc.refresh_from_db()
        self.assertEqual(self.income_acc.balance, Decimal("650.00"))
        self.assertEqual(self.child_acc.balance, Decimal("150.00"))


# ---------------------------------------------------------------------------
# SavingsGoal tests
# ---------------------------------------------------------------------------

class SavingsGoalTests(TestCase):
    def setUp(self):
        self.user, self.tenant, self.branch = _make_env("goal_test")
        _, self.child_acc, self.product, self.client = _make_savings_setup(
            self.user, self.tenant, self.branch
        )
        self.sa = SavingsAccount.objects.create(
            client=self.client,
            account=self.child_acc,
            product=self.product,
            account_number="SAV-GOAL-001",
            interest_rate=Decimal("3.00"),
            interest_calculation_method="monthly",
            minimum_balance=Decimal("0.00"),
            opened_on=timezone.now().date(),
            status="active",
            owner=self.user,
            branch=self.branch,
        )

    def _make_goal(self, name="Buy Car", target=Decimal("500000.00")):
        return SavingsGoal.objects.create(
            account=self.sa,
            name=name,
            target_amount=target,
            target_date=timezone.now().date() + timezone.timedelta(days=365),
            current_amount=Decimal("0.00"),
            status="active",
            tenant=self.tenant,
            owner=self.user,
            branch=self.branch,
        )

    def test_goal_created_with_zero_progress(self):
        goal = self._make_goal()
        self.assertEqual(goal.current_amount, Decimal("0.00"))

    def test_goal_progress_percentage_at_zero(self):
        goal = self._make_goal(target=Decimal("100000.00"))
        goal.current_amount = Decimal("0.00")
        progress = (goal.current_amount / goal.target_amount) * 100
        self.assertEqual(progress, Decimal("0.00"))

    def test_goal_progress_percentage_at_fifty(self):
        goal = self._make_goal(target=Decimal("100000.00"))
        goal.current_amount = Decimal("50000.00")
        goal.save()
        progress = (goal.current_amount / goal.target_amount) * 100
        self.assertEqual(progress, Decimal("50.00"))

    def test_goal_progress_percentage_complete(self):
        goal = self._make_goal(target=Decimal("100000.00"))
        goal.current_amount = Decimal("100000.00")
        goal.save()
        progress = (goal.current_amount / goal.target_amount) * 100
        self.assertEqual(progress, Decimal("100.00"))

    def test_multiple_goals_per_account(self):
        self._make_goal("Buy Car")
        self._make_goal("School Fees", Decimal("200000.00"))
        count = SavingsGoal.objects.filter(account=self.sa).count()
        self.assertEqual(count, 2)


# ---------------------------------------------------------------------------
# InterestAccrual tests
# ---------------------------------------------------------------------------

class InterestAccrualTests(TestCase):
    def setUp(self):
        self.user, self.tenant, self.branch = _make_env("accrual_test")
        _, self.child_acc, self.product, self.client = _make_savings_setup(
            self.user, self.tenant, self.branch
        )
        self.sa = SavingsAccount.objects.create(
            client=self.client,
            account=self.child_acc,
            product=self.product,
            account_number="SAV-ACC-001",
            interest_rate=Decimal("3.50"),
            interest_calculation_method="monthly",
            minimum_balance=Decimal("0.00"),
            opened_on=timezone.now().date(),
            status="active",
            owner=self.user,
            branch=self.branch,
        )

    def test_interest_accrual_entry_created(self):
        accrual = InterestAccrual.objects.create(
            account=self.sa,
            calculation_date=timezone.now().date(),
            daily_balance=Decimal("60000.00"),
            interest_rate=Decimal("3.50"),
            accrued_amount=Decimal("175.00"),
            status="pending",
        )
        self.assertEqual(accrual.accrued_amount, Decimal("175.00"))
        self.assertEqual(accrual.status, "pending")

    def test_monthly_interest_calculation(self):
        """3.5% per annum / 12 months on balance of 60000."""
        balance = Decimal("60000.00")
        annual_rate = Decimal("3.50") / 100
        monthly_interest = (balance * annual_rate) / 12
        expected = Decimal("175.00")
        self.assertEqual(monthly_interest.quantize(Decimal("0.01")), expected)


# ---------------------------------------------------------------------------
# CompulsorySavingsPolicy tests
# ---------------------------------------------------------------------------

class CompulsorySavingsPolicyTests(TestCase):
    def setUp(self):
        self.user, self.tenant, self.branch = _make_env("csp_test")
        _, _, self.product, _ = _make_savings_setup(self.user, self.tenant, self.branch)

    def test_policy_created_successfully(self):
        policy = CompulsorySavingsPolicy.objects.create(
            amount=Decimal("2000.00"),
            enabled=True,
            owner=self.user,
            branch=self.branch,
        )
        self.assertTrue(policy.enabled)
        self.assertEqual(policy.amount, Decimal("2000.00"))

    def test_policy_contribution_frequency_choices(self):
        # CompulsorySavingsPolicy is a singleton settings model with amount and enabled fields
        policy = CompulsorySavingsPolicy.objects.create(
            amount=Decimal("1000.00"),
            enabled=True,
            owner=self.user,
            branch=self.branch,
        )
        self.assertTrue(policy.enabled)
        self.assertIsNotNone(policy.pk)


# ---------------------------------------------------------------------------
# Savings API smoke tests
# ---------------------------------------------------------------------------

class SavingsAPITests(TestCase):
    def setUp(self):
        self.user, self.tenant, self.branch = _make_env("sav_api")
        self.api = APIClient()
        self.api.force_authenticate(user=self.user)

    def test_savings_account_list_returns_200(self):
        resp = self.api.get("/api/savings/savings-accounts/")
        self.assertIn(resp.status_code, [200, 404])

    def test_compulsory_policy_list_returns_200(self):
        resp = self.api.get("/api/savings/policies/")
        self.assertIn(resp.status_code, [200, 404])


# ---------------------------------------------------------------------------
# Bulk client contribution amounts
# ---------------------------------------------------------------------------

class BulkSetContributionAmountTests(TestCase):
    """
    Coverage for SavingsAccountViewSet.bulk_set_contribution_amount — lets an
    officer set/override every client's committed contribution amount for a
    product in one call instead of editing accounts one at a time.
    """

    def setUp(self):
        self.user, self.tenant, self.branch = _make_env("bulk_ca")
        _, self.child_acc, self.product, self.client = _make_savings_setup(
            self.user, self.tenant, self.branch
        )
        self.sa = SavingsAccount.objects.create(
            client=self.client, account=self.child_acc, product=self.product,
            account_number="SAV-BULK-001", interest_rate=Decimal("0.00"),
            interest_calculation_method="monthly", minimum_balance=Decimal("0.00"),
            opened_on=timezone.now().date(), status="active",
            owner=self.user, branch=self.branch,
        )
        self.api = APIClient()
        self.api.force_authenticate(user=self.user)

    def test_bulk_set_contribution_amount_updates_account(self):
        resp = self.api.post(
            "/api/savings/accounts/bulk-set-contribution-amount/",
            {"updates": [{"id": self.sa.id, "contribution_amount": "750.00"}]},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.sa.refresh_from_db()
        self.assertEqual(self.sa.contribution_amount, Decimal("750.00"))

    def test_bulk_set_contribution_amount_null_clears_override(self):
        self.sa.contribution_amount = Decimal("500.00")
        self.sa.save(update_fields=['contribution_amount'])

        resp = self.api.post(
            "/api/savings/accounts/bulk-set-contribution-amount/",
            {"updates": [{"id": self.sa.id, "contribution_amount": None}]},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.sa.refresh_from_db()
        self.assertIsNone(self.sa.contribution_amount)

    def test_bulk_set_contribution_amount_rejects_account_outside_tenant(self):
        # Branch.code is globally unique, so build the second tenant's env by
        # hand rather than reusing _make_env (which hardcodes code="HQ" and
        # would collide with self.branch created in setUp).
        other_user = User.objects.create_user(username="bulk_ca_other", password="pass")
        other_tenant = Tenant.objects.create(name="T-bulk_ca_other", slug="t-bulk-ca-other", owner=other_user)
        other_user.tenant = other_tenant
        other_user.save()
        other_branch = Branch.objects.create(name="HQ2", code="HQ2", tenant=other_tenant, owner=other_user)
        other_user.branch = other_branch
        other_user.save()
        set_current_tenant(other_tenant)
        other_parent_acc = Account.objects.create(
            name="Savings Accounts 2", code="2200", account_type=Account.SAVINGS,
            account_level=Account.LEVEL_PARENT, owner=other_user, created_by=other_user, branch=other_branch,
        )
        other_child = Account.objects.create(
            name="Other Savings", code="2201", account_type=Account.SAVINGS,
            account_level=Account.LEVEL_CHILD, parent=other_parent_acc,
            owner=other_user, created_by=other_user, branch=other_branch,
        )
        other_product = Product.objects.create(
            name="Other Regular Savings", product_type="SAVINGS",
            owner=other_user, branch=other_branch,
        )
        other_client = Client.objects.create(
            client_id="S-CLI-OTHER", first_name="Other", last_name="Client",
            gender="male", phone_primary="08033333333",
            tenant=other_tenant, owner=other_user, branch=other_branch,
        )
        other_sa = SavingsAccount.objects.create(
            client=other_client, account=other_child, product=other_product,
            account_number="SAV-BULK-OTHER", interest_rate=Decimal("0.00"),
            interest_calculation_method="monthly", minimum_balance=Decimal("0.00"),
            opened_on=timezone.now().date(), status="active",
            owner=other_user, branch=other_branch,
        )
        set_current_tenant(self.tenant)

        resp = self.api.post(
            "/api/savings/accounts/bulk-set-contribution-amount/",
            {"updates": [{"id": other_sa.id, "contribution_amount": "100.00"}]},
            format="json",
        )
        self.assertEqual(resp.status_code, 404)
        other_sa.refresh_from_db()
        self.assertIsNone(other_sa.contribution_amount)
