"""
Regression test for the payment-allocation bug found on LN-20260702-B91A43
(2026-07-15): record_payment() used to allocate each payment against the
loan's whole-term aggregate outstanding_interest before touching principal
at all, instead of the per-installment schedule. That's invisible when
interest is recognized in full at disbursement (see test_deferred_interest.py),
but for loans on the "legacy cash-basis fallback" path — disbursed before
their product had interest_income_account configured, then the product
fixed afterward — it meant a payment covering exactly one installment got
booked entirely as Interest Income, with zero principal reduction, because
outstanding_interest started as the sum of every future installment's
interest rather than just the one being paid.
"""
from decimal import Decimal

from django.test import TestCase

from common.managers import set_current_tenant
from users.models import Tenant, User
from branches.models import Branch
from accounts.models import Account
from products.models import Product
from clients.models import Client
from loans.models import LoanProduct, LoanAccount

from .test_deferred_interest import _make_env, _make_account


class PaymentAllocationFollowsScheduleTestCase(TestCase):
    def setUp(self):
        self.owner, self.tenant, self.branch = _make_env("payalloc")
        self.approver = User.objects.create_user(username="payalloc_apr", password="pass")
        self.approver.tenant = self.tenant
        self.approver.branch = self.branch
        self.approver.save()

        self.loan_parent = _make_account(self.owner, self.branch, "Loans Receivable", "1300", Account.LOAN)
        self.cash_account = _make_account(self.owner, self.branch, "Bank", "1001", Account.ASSET)
        self.interest_income_account = _make_account(self.owner, self.branch, "Interest Income", "4100", Account.INCOME)

        # No interest_income_account at creation time — mirrors production:
        # these three loans were disbursed before their product had one
        # configured, so disburse() never recognized interest and the
        # "legacy cash-basis fallback" branch in record_payment() applies.
        product_gl = Product.objects.create(
            name="Weekly Loan", code="LOAN-WK", product_type="LOAN",
            owner=self.owner, branch=self.branch,
        )
        self.product = LoanProduct.objects.create(
            product=product_gl,
            parent_account=self.loan_parent,
            disbursement_account=self.cash_account,
            default_interest_rate=Decimal("15.00"),
            interest_calculation_method="flat",
            min_loan_amount=Decimal("1000.00"),
            max_loan_amount=Decimal("500000.00"),
            owner=self.owner, branch=self.branch,
        )

        self.client = Client.objects.create(
            client_id="CLI-PAYALLOC", first_name="Ada", last_name="Lovelace",
            gender="female", phone_primary="08010000000",
            tenant=self.tenant, owner=self.owner, branch=self.branch,
        )

    def tearDown(self):
        set_current_tenant(None)

    def test_payment_covering_one_installment_does_not_drain_whole_term_interest(self):
        account = Account.objects.create(
            name="LN-TEST-1 Loan Account", code="139001",
            account_type=Account.LOAN, account_level=Account.LEVEL_CHILD,
            parent=self.loan_parent, owner=self.owner, created_by=self.owner, branch=self.branch,
        )
        loan = LoanAccount.objects.create(
            client=self.client,
            product=self.product,
            account=account,
            loan_number="LN-TEST-1",
            requested_amount=Decimal("100000.00"),
            interest_rate=Decimal("15.00"),
            term_months=6,
            repayment_frequency="monthly",
            status="pending",
            owner=self.owner,
            branch=self.branch,
        )
        loan.approve(user=self.approver)
        loan.disburse(disbursement_account=self.cash_account, disbursed_by=self.approver)

        # Confirms this loan is genuinely on the fallback path (product had no
        # income account at disbursement time).
        self.assertFalse(loan.interest_recognized_at_disbursement)
        self.assertFalse(loan.interest_deferral_active)

        # Production fix event: the product's income account gets configured
        # AFTER the loan was already disbursed.
        self.product.interest_income_account = self.interest_income_account
        self.product.save(update_fields=["interest_income_account"])

        schedule = list(loan.repayment_schedule.order_by("due_date"))
        self.assertGreaterEqual(len(schedule), 2, "test needs at least 2 installments to be meaningful")
        first, second = schedule[0], schedule[1]

        # Pay exactly the first installment's total due.
        loan.record_payment(
            amount=first.total_due,
            payment_account=self.cash_account,
            received_by=self.approver,
        )

        loan.refresh_from_db()
        first.refresh_from_db()
        second.refresh_from_db()
        self.interest_income_account.refresh_from_db()

        # The bug: interest_paid would equal min(payment, SUM of every
        # installment's interest_due) — far more than first.interest_due —
        # while principal_paid stayed at 0. Correct: capped at what's
        # actually due on the installment(s) the payment covers.
        self.assertEqual(loan.interest_paid, first.interest_due)
        self.assertEqual(loan.principal_paid, first.principal_due)
        self.assertEqual(self.interest_income_account.balance, first.interest_due)

        self.assertEqual(first.status, "paid")
        self.assertEqual(second.status, "pending")
        self.assertEqual(second.principal_paid, Decimal("0.00"))
        self.assertEqual(second.interest_paid, Decimal("0.00"))
