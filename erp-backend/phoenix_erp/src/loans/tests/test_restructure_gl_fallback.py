"""
Regression test for the restructure-approval error seen live on
LN-20260904-B6514F: LoanAccount.restructure() used to hard-block with
"This product has no restructure_interest_income_account configured" any
time a product had interest_income_account set but not the separate
restructure_interest_income_account — even though the ordinary interest
account could carry the amount just fine. Fixed to fall back to
interest_income_account instead of blocking the restructure outright.
"""
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.test import TestCase

from common.managers import set_current_tenant
from users.models import User
from accounts.models import Account
from products.models import Product
from clients.models import Client
from loans.models import LoanProduct, LoanAccount
from transactions.models import TransactionEntry

from .test_deferred_interest import _make_env, _make_account


class RestructureGLFallbackTestCase(TestCase):
    def setUp(self):
        self.owner, self.tenant, self.branch = _make_env("restrfb")
        self.approver = User.objects.create_user(username="restrfb_apr", password="pass")
        self.approver.tenant = self.tenant
        self.approver.branch = self.branch
        self.approver.save()

        self.loan_parent = _make_account(self.owner, self.branch, "Loans Receivable", "1300", Account.LOAN)
        self.cash_account = _make_account(self.owner, self.branch, "Bank", "1001", Account.ASSET)
        self.interest_income_account = _make_account(self.owner, self.branch, "Interest Income", "4100", Account.INCOME)
        self.restructure_income_account = _make_account(self.owner, self.branch, "Restructure Interest Income", "4110", Account.INCOME)

        self.client = Client.objects.create(
            client_id="CLI-RESTRFB", first_name="Banjoko", last_name="Khadijat",
            gender="female", phone_primary="08010000001",
            tenant=self.tenant, owner=self.owner, branch=self.branch,
        )

    def tearDown(self):
        set_current_tenant(None)

    def _make_loan(self, product, loan_number, term_months=6):
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
            requested_amount=Decimal("100000.00"),
            interest_rate=Decimal("12.00"),
            term_months=term_months,
            repayment_frequency="monthly",
            status="pending",
            owner=self.owner,
            branch=self.branch,
        )
        loan.approve(user=self.approver)
        loan.disburse(disbursement_account=self.cash_account, disbursed_by=self.approver)
        return loan

    def test_restructure_falls_back_to_interest_income_account_when_unconfigured(self):
        """Product has interest_income_account but NOT restructure_interest_income_account
        — this used to raise ValidationError; should now succeed, routing the
        restructure premium to interest_income_account instead."""
        product_gl = Product.objects.create(name="Fallback Loan", code="LOAN-FALLBACK", product_type="LOAN", owner=self.owner, branch=self.branch)
        product = LoanProduct.objects.create(
            product=product_gl,
            parent_account=self.loan_parent,
            disbursement_account=self.cash_account,
            interest_income_account=self.interest_income_account,
            # restructure_interest_income_account intentionally left unset
            default_interest_rate=Decimal("12.00"),
            interest_calculation_method="flat",
            min_loan_amount=Decimal("1000.00"),
            max_loan_amount=Decimal("500000.00"),
            owner=self.owner, branch=self.branch,
        )
        loan = self._make_loan(product, "LN-FALLBACK-1", term_months=6)
        outstanding_before = loan.outstanding_principal

        restructure = loan.restructure(
            new_term=10,
            restructured_by=self.approver,
            reason="term extension",
        )

        loan.refresh_from_db()
        self.assertEqual(loan.status, "active")
        self.assertEqual(loan.term_months, 10)
        self.assertGreater(restructure.restructure_interest_amount, Decimal("0.00"))

        # The original 6-row schedule (installment_number 1-6) is kept as a
        # 'restructured' historical record, not deleted — the new schedule's
        # rows must continue numbering past it (7-16) rather than colliding
        # with the old ones on the (loan, installment_number) unique constraint.
        old_rows = loan.repayment_schedule.filter(status='restructured').order_by('installment_number')
        new_rows = loan.repayment_schedule.filter(status='pending').order_by('installment_number')
        self.assertEqual([r.installment_number for r in old_rows], list(range(1, 7)))
        self.assertEqual([r.installment_number for r in new_rows], list(range(7, 17)))

        journal_entry = restructure.journal_entry
        self.assertIsNotNone(journal_entry)
        self.assertTrue(journal_entry.approved)

        credit_accounts = set(
            journal_entry.entries.filter(side=TransactionEntry.CREDIT).values_list('account_id', flat=True)
        )
        # Both the normal-rate portion AND the restructure premium landed on
        # the same fallback account — no dedicated restructure account exists.
        self.assertEqual(credit_accounts, {self.interest_income_account.id})

        debits = sum(
            e.amount for e in journal_entry.entries.filter(side=TransactionEntry.DEBIT)
        )
        credits = sum(
            e.amount for e in journal_entry.entries.filter(side=TransactionEntry.CREDIT)
        )
        self.assertEqual(debits, credits)

    def test_restructure_uses_dedicated_account_when_configured(self):
        """Regression guard: when restructure_interest_income_account IS
        configured, it's still preferred over the fallback."""
        product_gl = Product.objects.create(name="Dedicated Loan", code="LOAN-DEDICATED", product_type="LOAN", owner=self.owner, branch=self.branch)
        product = LoanProduct.objects.create(
            product=product_gl,
            parent_account=self.loan_parent,
            disbursement_account=self.cash_account,
            interest_income_account=self.interest_income_account,
            restructure_interest_income_account=self.restructure_income_account,
            default_interest_rate=Decimal("12.00"),
            interest_calculation_method="flat",
            min_loan_amount=Decimal("1000.00"),
            max_loan_amount=Decimal("500000.00"),
            owner=self.owner, branch=self.branch,
        )
        loan = self._make_loan(product, "LN-DEDICATED-1", term_months=6)

        restructure = loan.restructure(
            new_term=10,
            restructured_by=self.approver,
            reason="term extension",
        )

        journal_entry = restructure.journal_entry
        credit_accounts = set(
            journal_entry.entries.filter(side=TransactionEntry.CREDIT).values_list('account_id', flat=True)
        )
        self.assertEqual(
            credit_accounts,
            {self.interest_income_account.id, self.restructure_income_account.id},
        )

    def test_no_interest_income_account_at_all_is_blocked_at_disbursement(self):
        """Regression guard: a product with NEITHER account configured never
        even reaches restructure() — disburse() itself already refuses to
        recognize interest with nowhere to book it, which is what actually
        protects restructure_interest_income_account's fallback from silently
        swallowing a genuinely unconfigured product in practice."""
        product_gl = Product.objects.create(name="No Account Loan", code="LOAN-NOACC-RESTR", product_type="LOAN", owner=self.owner, branch=self.branch)
        product = LoanProduct.objects.create(
            product=product_gl,
            parent_account=self.loan_parent,
            disbursement_account=self.cash_account,
            default_interest_rate=Decimal("12.00"),
            interest_calculation_method="flat",
            min_loan_amount=Decimal("1000.00"),
            max_loan_amount=Decimal("500000.00"),
            owner=self.owner, branch=self.branch,
        )

        with self.assertRaises(ValidationError):
            self._make_loan(product, "LN-NOACC-1", term_months=6)
