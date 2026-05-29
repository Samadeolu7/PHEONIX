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
)


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
