"""
Regression tests for LoanProduct.grace_period_days actually being honored
before a late-payment penalty is charged.

Reported bug: a product configured with a 5-day grace period was still
being penalised as of the installment's due date. LoanProduct.
calculate_late_penalty() itself was already correct (it returns 0.00 while
days_late <= grace_period_days), and so is the daily-scheduled
update_loan_status_task / update_loan_status management command, which
routes every penalty computation through it. The actual hole was
loans.tasks.apply_daily_loan_penalties — an older, unscheduled task
(see loans/tasks.py's module docstring) that charged a flat daily penalty
off any positive arrears with zero grace-period awareness. It is not wired
into CELERY_BEAT_SCHEDULE, but django_celery_beat's DatabaseScheduler fires
whatever PeriodicTask rows exist and are enabled in the DB regardless of
that setting (see jobs/migrations/0001_ensure_periodic_tasks.py's docstring
for a prior incident caused by exactly this kind of drift), so a stray
enabled row for it would silently reintroduce this bug in production.

These tests lock in:
  1. calculate_late_penalty()'s grace-period boundary.
  2. update_loan_status (the real scheduled job) withholding the penalty
     for an installment still inside its grace period, and charging it once
     the grace period is exceeded.
  3. apply_daily_loan_penalties (the legacy task, now fixed) also
     withholding the penalty inside the grace period.
"""
from datetime import timedelta
from decimal import Decimal

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from common.managers import set_current_tenant
from accounts.models import Account
from products.models import Product
from clients.models import Client
from loans.models import LoanProduct, LoanAccount, LoanRepaymentSchedule
from loans.tasks import apply_daily_loan_penalties

from .test_deferred_interest import _make_env, _make_account


class CalculateLatePenaltyGracePeriodTestCase(TestCase):
    """Unit-level check on LoanProduct.calculate_late_penalty()."""

    def setUp(self):
        self.owner, self.tenant, self.branch = _make_env("gracepen")
        product_gl = Product.objects.create(
            name="Grace Period Loan", code="LOAN-GP", product_type="LOAN",
            owner=self.owner, branch=self.branch,
        )
        self.product = LoanProduct.objects.create(
            product=product_gl,
            parent_account=_make_account(self.owner, self.branch, "Loans Receivable", "1300", Account.LOAN),
            default_interest_rate=Decimal("25.20"),
            interest_calculation_method="flat",
            min_loan_amount=Decimal("1000.00"),
            max_loan_amount=Decimal("500000.00"),
            late_payment_penalty_type="percentage",
            late_payment_penalty=Decimal("5.00"),
            grace_period_days=5,
            owner=self.owner, branch=self.branch,
        )

    def tearDown(self):
        set_current_tenant(None)

    def test_no_penalty_on_due_date(self):
        self.assertEqual(
            self.product.calculate_late_penalty(Decimal("10000.00"), days_late=0, repayment_frequency="monthly"),
            Decimal("0.00"),
        )

    def test_no_penalty_while_within_grace_period(self):
        self.assertEqual(
            self.product.calculate_late_penalty(Decimal("10000.00"), days_late=5, repayment_frequency="monthly"),
            Decimal("0.00"),
        )

    def test_penalty_charged_once_grace_period_exceeded(self):
        penalty = self.product.calculate_late_penalty(
            Decimal("10000.00"), days_late=6, repayment_frequency="monthly",
        )
        self.assertGreater(penalty, Decimal("0.00"))


class UpdateLoanStatusGracePeriodTestCase(TestCase):
    """End-to-end check on the actually-scheduled job."""

    def setUp(self):
        self.owner, self.tenant, self.branch = _make_env("gracesched")
        self.loan_parent = _make_account(self.owner, self.branch, "Loans Receivable", "1300", Account.LOAN)
        self.penalty_income_account = _make_account(
            self.owner, self.branch, "Penalty Income", "4200", Account.INCOME
        )
        product_gl = Product.objects.create(
            name="Grace Period Loan", code="LOAN-GP2", product_type="LOAN",
            owner=self.owner, branch=self.branch,
        )
        self.product = LoanProduct.objects.create(
            product=product_gl,
            parent_account=self.loan_parent,
            penalty_income_account=self.penalty_income_account,
            default_interest_rate=Decimal("25.20"),
            interest_calculation_method="flat",
            min_loan_amount=Decimal("1000.00"),
            max_loan_amount=Decimal("500000.00"),
            late_payment_penalty_type="percentage",
            late_payment_penalty=Decimal("5.00"),
            grace_period_days=5,
            owner=self.owner, branch=self.branch,
        )
        self.client_ = Client.objects.create(
            client_id="CLI-GRACESCHED", first_name="Bisi", last_name="Okafor",
            gender="female", phone_primary="08030000000",
            tenant=self.tenant, owner=self.owner, branch=self.branch,
        )

    def tearDown(self):
        set_current_tenant(None)

    def _make_loan_with_installment(self, loan_number, due_date):
        account = Account.objects.create(
            name=f"{loan_number} Loan Account", code=f"1300{loan_number[-3:]}",
            account_type=Account.LOAN, account_level=Account.LEVEL_CHILD,
            parent=self.loan_parent, owner=self.owner, created_by=self.owner, branch=self.branch,
        )
        loan = LoanAccount.objects.create(
            client=self.client_,
            product=self.product,
            account=account,
            loan_number=loan_number,
            requested_amount=Decimal("100000.00"),
            approved_amount=Decimal("100000.00"),
            disbursed_amount=Decimal("100000.00"),
            outstanding_principal=Decimal("100000.00"),
            interest_rate=Decimal("25.20"),
            term_months=6,
            repayment_frequency="monthly",
            status="active",
            disbursement_date=due_date - timedelta(days=30),
            owner=self.owner, branch=self.branch, created_by=self.owner,
        )
        LoanRepaymentSchedule.objects.create(
            loan=loan, installment_number=1, due_date=due_date,
            principal_due=Decimal("16000.00"), interest_due=Decimal("4000.00"),
            fees_due=Decimal("0.00"), penalty_due=Decimal("0.00"),
            total_due=Decimal("20000.00"), total_paid=Decimal("0.00"),
            status="overdue",
            owner=self.owner, branch=self.branch, created_by=self.owner,
        )
        return loan

    def test_no_penalty_charged_within_grace_period(self):
        # 3 days late, grace period is 5 — must not be charged.
        due_date = timezone.localdate() - timedelta(days=3)
        loan = self._make_loan_with_installment("LN-GRACE-3", due_date)

        call_command("update_loan_status")

        loan.refresh_from_db()
        sched = loan.repayment_schedule.get(installment_number=1)
        self.assertEqual(sched.penalty_due, Decimal("0.00"))
        self.assertEqual(loan.outstanding_penalties, Decimal("0.00"))

    def test_penalty_charged_once_grace_period_exceeded(self):
        # 10 days late, grace period is 5 — must be charged.
        due_date = timezone.localdate() - timedelta(days=10)
        loan = self._make_loan_with_installment("LN-GRACE-10", due_date)

        call_command("update_loan_status")

        loan.refresh_from_db()
        sched = loan.repayment_schedule.get(installment_number=1)
        self.assertGreater(sched.penalty_due, Decimal("0.00"))
        self.assertEqual(loan.outstanding_penalties, sched.penalty_due)


class LegacyApplyDailyLoanPenaltiesGracePeriodTestCase(TestCase):
    """
    apply_daily_loan_penalties is not on CELERY_BEAT_SCHEDULE, but a stray
    enabled PeriodicTask row could still fire it (see
    jobs/migrations/0003_disable_legacy_loan_penalty_tasks.py). It must not
    reintroduce the grace-period bug if that ever happens.
    """

    def setUp(self):
        self.owner, self.tenant, self.branch = _make_env("gracelegacy")
        self.loan_parent = _make_account(self.owner, self.branch, "Loans Receivable", "1300", Account.LOAN)
        product_gl = Product.objects.create(
            name="Grace Period Loan", code="LOAN-GP3", product_type="LOAN",
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
            grace_period_days=5,
            owner=self.owner, branch=self.branch,
        )
        self.client_ = Client.objects.create(
            client_id="CLI-GRACELEGACY", first_name="Tunde", last_name="Bello",
            gender="male", phone_primary="08040000000",
            tenant=self.tenant, owner=self.owner, branch=self.branch,
        )

    def tearDown(self):
        set_current_tenant(None)

    def _make_loan(self, loan_number, days_in_arrears, arrears_amount):
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
            requested_amount=Decimal("100000.00"),
            approved_amount=Decimal("100000.00"),
            disbursed_amount=Decimal("100000.00"),
            outstanding_principal=Decimal("100000.00"),
            interest_rate=Decimal("25.20"),
            term_months=6,
            repayment_frequency="monthly",
            status="active",
            disbursement_date=timezone.localdate() - timedelta(days=60),
            days_in_arrears=days_in_arrears,
            arrears_amount=arrears_amount,
            outstanding_penalties=Decimal("0.00"),
            owner=self.owner, branch=self.branch, created_by=self.owner,
        )

    def test_no_penalty_within_grace_period(self):
        loan = self._make_loan("LN-LEGACY-3", days_in_arrears=3, arrears_amount=Decimal("20000.00"))

        apply_daily_loan_penalties.run()

        loan.refresh_from_db()
        self.assertEqual(loan.outstanding_penalties, Decimal("0.00"))

    def test_penalty_charged_once_grace_period_exceeded(self):
        loan = self._make_loan("LN-LEGACY-10", days_in_arrears=10, arrears_amount=Decimal("20000.00"))

        apply_daily_loan_penalties.run()

        loan.refresh_from_db()
        self.assertGreater(loan.outstanding_penalties, Decimal("0.00"))
