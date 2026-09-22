"""
Integration test for the one-off execute_ln_20260904_b6514f_restructure
command — recreates the real loan's exact conditions (2-day/20%/₦100,000,
active, one rejected restructure request already on file) and runs the
command end-to-end, so it's verified against a real DB/transaction before
being run against production.
"""
from decimal import Decimal
from io import StringIO

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

from common.managers import set_current_tenant
from users.models import User
from accounts.models import Account
from products.models import Product
from clients.models import Client
from loans.models import LoanProduct, LoanAccount, LoanRestructureRequest

from .test_deferred_interest import _make_env, _make_account

LOAN_NUMBER = 'LN-20260904-B6514F'


class ExecuteLn20260904B6514fRestructureTestCase(TestCase):
    def setUp(self):
        self.owner, self.tenant, self.branch = _make_env("execln")
        self.director = User.objects.create_user(username="samuel", password="pass")
        self.director.tenant = self.tenant
        self.director.branch = self.branch
        self.director.save()
        self.rejector = User.objects.create_user(username="reviewer2", password="pass")
        self.rejector.tenant = self.tenant
        self.rejector.branch = self.branch
        self.rejector.save()

        self.loan_parent = _make_account(self.owner, self.branch, "Loans Receivable", "1300", Account.LOAN)
        self.cash_account = _make_account(self.owner, self.branch, "Bank", "1001", Account.ASSET)
        self.interest_income_account = _make_account(self.owner, self.branch, "Interest Income", "4100", Account.INCOME)

        self.client = Client.objects.create(
            client_id="CLI-BANJOKO", first_name="Banjoko", last_name="Khadijat",
            gender="female", phone_primary="08058038734",
            tenant=self.tenant, owner=self.owner, branch=self.branch,
        )

        product_gl = Product.objects.create(name="Daily Loan", code="LOAN-DAILY", product_type="LOAN", owner=self.owner, branch=self.branch)
        self.product = LoanProduct.objects.create(
            product=product_gl,
            parent_account=self.loan_parent,
            disbursement_account=self.cash_account,
            interest_income_account=self.interest_income_account,
            default_interest_rate=Decimal("20.00"),
            interest_calculation_method="flat",
            min_loan_amount=Decimal("1000.00"),
            max_loan_amount=Decimal("500000.00"),
            term_unit="days",
            owner=self.owner, branch=self.branch,
        )

        account = Account.objects.create(
            name="LN-20260904-B6514F Loan Account", code="139999",
            account_type=Account.LOAN, account_level=Account.LEVEL_CHILD,
            parent=self.loan_parent, owner=self.owner, created_by=self.owner, branch=self.branch,
        )
        self.loan = LoanAccount.objects.create(
            client=self.client,
            product=self.product,
            account=account,
            loan_number=LOAN_NUMBER,
            requested_amount=Decimal("100000.00"),
            interest_rate=Decimal("20.00"),
            term_months=2,
            term_unit="days",
            repayment_frequency="daily",
            status="pending",
            owner=self.owner,
            branch=self.branch,
        )
        self.approver = User.objects.create_user(username="execln_apr", password="pass")
        self.approver.tenant = self.tenant
        self.approver.branch = self.branch
        self.approver.save()
        self.loan.approve(user=self.approver)
        self.loan.disburse(disbursement_account=self.cash_account, disbursed_by=self.approver)

        # The real prior history: a rejected restructure request already on file.
        self.rejected_request = LoanRestructureRequest.objects.create(
            loan=self.loan,
            new_term=60,
            reason='',
            requested_by=self.director,
            status=LoanRestructureRequest.STATUS_REJECTED,
            reviewed_by=self.rejector,
            rejection_reason='On behalf of Israel',
            owner=self.director,
            branch=self.branch,
            tenant=self.tenant,
        )

    def tearDown(self):
        set_current_tenant(None)

    def test_dry_run_writes_nothing(self):
        out = StringIO()
        call_command('execute_ln_20260904_b6514f_restructure', by_username='samuel', stdout=out)

        self.loan.refresh_from_db()
        self.assertEqual(self.loan.term_months, 2)
        self.assertEqual(self.loan.interest_rate, Decimal('20.00'))
        self.assertEqual(self.loan.restructures.count(), 0)
        self.assertIn('DRY-RUN', out.getvalue())

    def test_apply_restructures_to_60_days_same_total_interest(self):
        old_outstanding_interest = self.loan.outstanding_interest
        self.assertEqual(old_outstanding_interest, Decimal('20000.00'))

        out = StringIO()
        call_command('execute_ln_20260904_b6514f_restructure', by_username='samuel', apply=True, stdout=out)

        self.loan.refresh_from_db()
        self.assertEqual(self.loan.status, 'active')
        self.assertEqual(self.loan.term_months, 60)
        self.assertEqual(self.loan.term_unit, 'days')
        self.assertEqual(self.loan.interest_rate, Decimal('0.00'))
        self.assertEqual(self.loan.outstanding_interest, Decimal('20000.00'))
        self.assertEqual(self.loan.outstanding_principal, Decimal('100000.00'))
        self.assertEqual(self.loan.days_in_arrears, 0)

        # Old 2-day schedule (installment 1-2) kept as history, new 60-day
        # schedule continues numbering from 3 without colliding.
        old_rows = self.loan.repayment_schedule.filter(status='restructured').order_by('installment_number')
        new_rows = self.loan.repayment_schedule.filter(status='pending').order_by('installment_number')
        self.assertEqual([r.installment_number for r in old_rows], [1, 2])
        self.assertEqual(len(new_rows), 60)
        self.assertEqual(new_rows[0].installment_number, 3)
        self.assertEqual(new_rows[len(new_rows) - 1].installment_number, 62)
        # Total of the new schedule's total_due equals the unchanged
        # principal+interest owed (100,000 + 20,000).
        total_due_sum = sum((r.total_due for r in new_rows), Decimal('0.00'))
        self.assertEqual(total_due_sum, Decimal('120000.00'))

        # A NEW request documents this action; the original rejected one is untouched.
        self.rejected_request.refresh_from_db()
        self.assertEqual(self.rejected_request.status, LoanRestructureRequest.STATUS_REJECTED)
        new_request = LoanRestructureRequest.objects.exclude(pk=self.rejected_request.pk).get(loan=self.loan)
        self.assertEqual(new_request.status, LoanRestructureRequest.STATUS_APPROVED)
        self.assertEqual(new_request.requested_by_id, self.director.id)
        self.assertEqual(new_request.reviewed_by_id, self.director.id)
        self.assertIsNotNone(new_request.restructure_id)
        self.assertEqual(new_request.restructure.new_term, 60)

        self.assertIn('Done.', out.getvalue())

    def test_refuses_unknown_username(self):
        with self.assertRaises(CommandError):
            call_command('execute_ln_20260904_b6514f_restructure', by_username='nonexistent-user', apply=True)
        self.loan.refresh_from_db()
        self.assertEqual(self.loan.term_months, 2)

    def test_refuses_if_state_already_changed(self):
        """Guard: if the loan no longer matches the diagnosed pre-restructure
        state, the command must abort rather than guess."""
        self.loan.interest_rate = Decimal('15.00')
        self.loan.save(update_fields=['interest_rate'])

        out = StringIO()
        call_command('execute_ln_20260904_b6514f_restructure', by_username='samuel', apply=True, stdout=out)

        self.loan.refresh_from_db()
        self.assertEqual(self.loan.term_months, 2)  # untouched
        self.assertIn('refusing', out.getvalue())

    def test_refuses_double_apply(self):
        call_command('execute_ln_20260904_b6514f_restructure', by_username='samuel', apply=True)
        out = StringIO()
        call_command('execute_ln_20260904_b6514f_restructure', by_username='samuel', apply=True, stdout=out)
        self.assertIn('already has a LoanRestructure audit record', out.getvalue())
