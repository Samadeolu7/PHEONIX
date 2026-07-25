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

from django.core.management import call_command
from django.test import TestCase

from common.managers import set_current_tenant
from users.models import Tenant, User
from branches.models import Branch
from accounts.models import Account
from products.models import Product
from clients.models import Client
from loans.models import LoanProduct, LoanAccount
from transactions.models import Transaction, TransactionEntry, TransactionSeries

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


class CorrectFrontloadedInterestAllocationTestCase(TestCase):
    """
    Reproduces the pre-fix historical state directly (rather than via
    record_payment(), which is now fixed and can't produce this state
    anymore) to verify correct_frontloaded_interest_allocation repairs it:
    schedule row principal_paid, loan aggregates, and a balanced correcting
    journal entry that pulls the over-recognized amount back out of Income
    and into the loan's own receivable account.
    """

    def setUp(self):
        self.owner, self.tenant, self.branch = _make_env("correctfront")
        self.approver = User.objects.create_user(username="correctfront_apr", password="pass")
        self.approver.tenant = self.tenant
        self.approver.branch = self.branch
        self.approver.save()

        self.loan_parent = _make_account(self.owner, self.branch, "Loans Receivable", "1300", Account.LOAN)
        self.cash_account = _make_account(self.owner, self.branch, "Bank", "1001", Account.ASSET)
        self.interest_income_account = _make_account(self.owner, self.branch, "Interest Income", "4100", Account.INCOME)

        product_gl = Product.objects.create(
            name="Weekly Loan", code="LOAN-WK", product_type="LOAN",
            owner=self.owner, branch=self.branch,
        )
        # No interest_income_account yet — disburse() will take neither GL
        # branch, so interest_recognized_at_disbursement/interest_deferral_active
        # stay False naturally, matching production (loan disbursed before its
        # product had an income account configured).
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
            client_id="CLI-CORRECTFRONT", first_name="Ada", last_name="Lovelace",
            gender="female", phone_primary="08010000000",
            tenant=self.tenant, owner=self.owner, branch=self.branch,
        )

    def tearDown(self):
        set_current_tenant(None)

    def test_correction_fixes_schedule_loan_and_posts_reversing_entry(self):
        account = Account.objects.create(
            name="LN-TEST-2 Loan Account", code="139002",
            account_type=Account.LOAN, account_level=Account.LEVEL_CHILD,
            parent=self.loan_parent, owner=self.owner, created_by=self.owner, branch=self.branch,
        )
        loan = LoanAccount.objects.create(
            client=self.client,
            product=self.product,
            account=account,
            loan_number="LN-TEST-2",
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
        self.assertFalse(loan.interest_recognized_at_disbursement)
        self.assertFalse(loan.interest_deferral_active)

        # Production fix event: the product's income account gets configured
        # AFTER the loan was already disbursed.
        self.product.interest_income_account = self.interest_income_account
        self.product.save(update_fields=["interest_income_account"])

        first = loan.repayment_schedule.order_by("due_date").first()

        # Manually reproduce exactly what the buggy record_payment() used to
        # produce: the whole installment payment landed in interest_paid,
        # principal_paid stayed at 0, even though total_paid/status are
        # otherwise correct (matches production: interest_paid was always
        # capped correctly per-installment by _update_schedule_with_payment,
        # only principal_paid was never touched).
        first.total_paid = first.total_due
        first.interest_paid = first.interest_due
        first.principal_paid = Decimal("0.00")
        first.status = "paid"
        first.save()

        loan.total_paid = first.total_due
        loan.interest_paid = first.total_due
        loan.principal_paid = Decimal("0.00")
        loan.outstanding_interest -= first.total_due
        loan.save(update_fields=["total_paid", "interest_paid", "principal_paid", "outstanding_interest"])

        series, _ = TransactionSeries.objects.get_or_create(code="LNPMT", defaults={"description": "Loan Repayments"})
        txn = Transaction.objects.create(
            series=series, date=first.due_date,
            description=f"Loan repayment – {loan.loan_number}",
            owner=self.owner, branch=self.branch, tenant=self.tenant,
        )
        TransactionEntry.objects.create(transaction=txn, account=self.cash_account, side=TransactionEntry.DEBIT, amount=first.total_due)
        TransactionEntry.objects.create(transaction=txn, account=self.interest_income_account, side=TransactionEntry.CREDIT, amount=first.total_due)
        txn.post()

        self.interest_income_account.refresh_from_db()
        account.refresh_from_db()
        income_balance_before = self.interest_income_account.balance
        receivable_balance_before = account.balance

        call_command("correct_frontloaded_interest_allocation", confirm=True)

        first.refresh_from_db()
        loan.refresh_from_db()
        self.interest_income_account.refresh_from_db()
        account.refresh_from_db()

        shortfall = first.principal_due

        self.assertEqual(first.principal_paid, first.principal_due)
        self.assertEqual(loan.principal_paid, first.principal_due)
        self.assertEqual(loan.interest_paid, first.interest_due)
        self.assertEqual(loan.total_paid, first.total_due)  # untouched — was already correct

        self.assertEqual(self.interest_income_account.balance, income_balance_before - shortfall)
        self.assertEqual(account.balance, receivable_balance_before - shortfall)

        # Idempotent: running again finds nothing left to correct.
        call_command("correct_frontloaded_interest_allocation", confirm=True)
        first.refresh_from_db()
        self.assertEqual(first.principal_paid, first.principal_due)


class CorrectFrontloadedInterestAllocationPartiallyFixedRowsTestCase(TestCase):
    """
    Reproduces the exact state found on LN-20260703-448038 in production
    (2026-07-24): an unrelated, pre-existing tool (fix_schedule_payment_drift)
    had already patched some schedule rows' principal_paid directly to close
    a drift against loan.total_paid, without ever touching the loan-level
    aggregate fields. A correction command that only sums "rows that still
    look wrong" would badly undercount the true loan-level correction needed,
    since two of three affected rows no longer look wrong in isolation even
    though loan.principal_paid is still 0 for all three. This verifies the
    command instead always resyncs the loan aggregate to the full recomputed
    total across every row, regardless of what already touched some of them.
    """

    def setUp(self):
        self.owner, self.tenant, self.branch = _make_env("partialfix")
        self.approver = User.objects.create_user(username="partialfix_apr", password="pass")
        self.approver.tenant = self.tenant
        self.approver.branch = self.branch
        self.approver.save()

        self.loan_parent = _make_account(self.owner, self.branch, "Loans Receivable", "1300", Account.LOAN)
        self.cash_account = _make_account(self.owner, self.branch, "Bank", "1001", Account.ASSET)
        self.interest_income_account = _make_account(self.owner, self.branch, "Interest Income", "4100", Account.INCOME)

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
            client_id="CLI-PARTIALFIX", first_name="Ada", last_name="Lovelace",
            gender="female", phone_primary="08010000000",
            tenant=self.tenant, owner=self.owner, branch=self.branch,
        )

    def tearDown(self):
        set_current_tenant(None)

    def test_loan_aggregate_resyncs_to_full_total_not_just_newly_wrong_rows(self):
        account = Account.objects.create(
            name="LN-TEST-3 Loan Account", code="139003",
            account_type=Account.LOAN, account_level=Account.LEVEL_CHILD,
            parent=self.loan_parent, owner=self.owner, created_by=self.owner, branch=self.branch,
        )
        loan = LoanAccount.objects.create(
            client=self.client,
            product=self.product,
            account=account,
            loan_number="LN-TEST-3",
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
        self.assertFalse(loan.interest_recognized_at_disbursement)

        self.product.interest_income_account = self.interest_income_account
        self.product.save(update_fields=["interest_income_account"])

        rows = list(loan.repayment_schedule.order_by("due_date"))
        first, second, third = rows[0], rows[1], rows[2]

        series, _ = TransactionSeries.objects.get_or_create(code="LNPMT", defaults={"description": "Loan Repayments"})

        # Three payments, each covering exactly one installment, all under the
        # pre-fix buggy allocation: every row ends up with principal_paid=0
        # despite being fully paid, and the loan aggregate reflects the same
        # bug (all cash counted as interest).
        for row in (first, second, third):
            row.total_paid = row.total_due
            row.interest_paid = row.interest_due
            row.principal_paid = Decimal("0.00")
            row.status = "paid"
            row.save()

            txn = Transaction.objects.create(
                series=series, date=row.due_date,
                description=f"Loan repayment – {loan.loan_number}",
                owner=self.owner, branch=self.branch, tenant=self.tenant,
            )
            TransactionEntry.objects.create(transaction=txn, account=self.cash_account, side=TransactionEntry.DEBIT, amount=row.total_due)
            TransactionEntry.objects.create(transaction=txn, account=self.interest_income_account, side=TransactionEntry.CREDIT, amount=row.total_due)
            txn.post()

        loan.total_paid = first.total_due + second.total_due + third.total_due
        loan.interest_paid = loan.total_paid
        loan.principal_paid = Decimal("0.00")
        loan.outstanding_interest -= loan.total_paid
        loan.save(update_fields=["total_paid", "interest_paid", "principal_paid", "outstanding_interest"])

        # Simulate fix_schedule_payment_drift already having patched the
        # first two rows' principal_paid directly (its own, unrelated
        # ratio-based logic), WITHOUT touching any loan-level field —
        # exactly what was found in production.
        first.principal_paid = first.principal_due
        first.save(update_fields=["principal_paid"])
        second.principal_paid = second.principal_due
        second.save(update_fields=["principal_paid"])

        self.interest_income_account.refresh_from_db()
        account.refresh_from_db()
        income_balance_before = self.interest_income_account.balance
        receivable_balance_before = account.balance

        call_command("correct_frontloaded_interest_allocation", confirm=True)

        loan.refresh_from_db()
        first.refresh_from_db()
        second.refresh_from_db()
        third.refresh_from_db()
        self.interest_income_account.refresh_from_db()
        account.refresh_from_db()

        expected_total_principal = first.principal_due + second.principal_due + third.principal_due
        expected_total_interest = first.interest_due + second.interest_due + third.interest_due
        full_correction = expected_total_principal  # loan.principal_paid was 0 before

        # The command must have only WRITTEN the third row (the other two
        # were already correct) ...
        self.assertEqual(third.principal_paid, third.principal_due)
        # ... but the loan aggregate must reflect the FULL total across all
        # three rows, not just the one row it had to write.
        self.assertEqual(loan.principal_paid, expected_total_principal)
        self.assertEqual(loan.interest_paid, expected_total_interest)

        self.assertEqual(self.interest_income_account.balance, income_balance_before - full_correction)
        self.assertEqual(account.balance, receivable_balance_before - full_correction)

        # Idempotent.
        call_command("correct_frontloaded_interest_allocation", confirm=True)
        loan.refresh_from_db()
        self.assertEqual(loan.principal_paid, expected_total_principal)
