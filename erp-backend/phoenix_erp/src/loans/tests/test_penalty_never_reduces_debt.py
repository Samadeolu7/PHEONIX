"""
Regression test: the daily update_loan_status job must only ever INCREASE a
loan's debt with penalties. It used to recompute penalty_due from scratch as
rate x current unpaid balance x ALL periods late, so every repayment
retroactively shrank past periods' penalties and posted a
"Loan penalty accrual" entry that CREDITED Loan Receivable (LN-659,
2026-11-13). Now each run only charges the periods newly elapsed since
LoanRepaymentSchedule.penalty_periods_charged.
"""
from datetime import date, datetime, time
from decimal import Decimal
from unittest import mock

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from common.managers import set_current_tenant
from accounts.models import Account
from products.models import Product
from clients.models import Client
from loans.models import LoanProduct, LoanAccount, LoanRepaymentSchedule
from transactions.models import TransactionEntry

from .test_deferred_interest import _make_env, _make_account


def _at(d):
    return mock.patch(
        'django.utils.timezone.now',
        return_value=timezone.make_aware(datetime.combine(d, time(12, 0))),
    )


class _LoanWithScheduleBase(TestCase):
    def setUp(self):
        self.owner, self.tenant, self.branch = _make_env("penup")
        self.loan_parent = _make_account(self.owner, self.branch, "Loans Receivable", "1300", Account.LOAN)
        self.penalty_income = _make_account(self.owner, self.branch, "Penalty Income", "4300", Account.INCOME)

        product_gl = Product.objects.create(
            name="Monthly Loan", code="LOAN-PU", product_type="LOAN",
            owner=self.owner, branch=self.branch,
        )
        self.product = LoanProduct.objects.create(
            product=product_gl,
            parent_account=self.loan_parent,
            penalty_income_account=self.penalty_income,
            default_interest_rate=Decimal("10.00"),
            interest_calculation_method="flat",
            min_loan_amount=Decimal("1000.00"),
            max_loan_amount=Decimal("500000.00"),
            late_payment_penalty_type="percentage",
            late_payment_penalty=Decimal("5.00"),
            grace_period_days=0,
            owner=self.owner, branch=self.branch,
        )
        client = Client.objects.create(
            client_id="CLI-PENUP", first_name="Test", last_name="Client",
            gender="female", phone_primary="08020000001",
            tenant=self.tenant, owner=self.owner, branch=self.branch,
        )
        account = Account.objects.create(
            name="LN-PU-1 Loan Account", code="1300001",
            account_type=Account.LOAN, account_level=Account.LEVEL_CHILD,
            parent=self.loan_parent, owner=self.owner, created_by=self.owner, branch=self.branch,
        )
        self.loan = LoanAccount.objects.create(
            client=client, product=self.product, account=account,
            loan_number="LN-PU-1",
            requested_amount=Decimal("40000.00"),
            approved_amount=Decimal("40000.00"),
            disbursed_amount=Decimal("40000.00"),
            outstanding_principal=Decimal("40000.00"),
            interest_rate=Decimal("10.00"),
            term_months=4,
            repayment_frequency="monthly",
            status="active",
            disbursement_date=date(2026, 7, 1),
            owner=self.owner, branch=self.branch, created_by=self.owner,
        )
        self.rows = [
            LoanRepaymentSchedule.objects.create(
                loan=self.loan, installment_number=i + 1, due_date=d,
                principal_due=Decimal("10000.00"), interest_due=Decimal("1000.00"),
                fees_due=Decimal("0.00"), penalty_due=Decimal("0.00"),
                total_due=Decimal("11000.00"), total_paid=Decimal("0.00"),
                status="pending",
                owner=self.owner, branch=self.branch, created_by=self.owner,
            )
            for i, d in enumerate([
                date(2026, 8, 1), date(2026, 9, 1), date(2026, 10, 1), date(2026, 11, 1),
            ])
        ]

    def tearDown(self):
        set_current_tenant(None)

    def _run(self, on):
        with _at(on):
            call_command("update_loan_status")

    def _penalty_credits_to_loan(self):
        return TransactionEntry.objects.filter(
            transaction__series__code='LNPEN',
            account=self.loan.account,
            side=TransactionEntry.CREDIT,
        )

class PenaltyNeverReducesDebtTestCase(_LoanWithScheduleBase):
    def test_repayment_does_not_reduce_penalty_already_charged(self):
        first = self.rows[0]

        # One period late: 5% of 11,000.
        self._run(date(2026, 8, 20))
        first.refresh_from_db()
        self.assertEqual(first.penalty_due, Decimal("550.00"))
        self.assertEqual(first.penalty_periods_charged, 1)

        # Client pays 8,000 of the installment's principal.
        first.principal_paid = Decimal("8000.00")
        first.total_paid = Decimal("8000.00")
        first.save()

        # Old behavior recomputed 5% x 3,000 = 150 and credited 400 back.
        self._run(date(2026, 8, 21))
        first.refresh_from_db()
        self.assertEqual(first.penalty_due, Decimal("550.00"))
        self.assertFalse(self._penalty_credits_to_loan().exists())

        # Next period: only the new period is charged, on the reduced
        # balance (5% of 3,000 = 150), on top of what was already charged.
        self._run(date(2026, 10, 2))
        first.refresh_from_db()
        self.assertEqual(first.penalty_due, Decimal("700.00"))
        self.assertEqual(first.penalty_periods_charged, 2)
        self.assertFalse(self._penalty_credits_to_loan().exists())

        self.loan.refresh_from_db()
        total_penalty = sum(
            r.penalty_due for r in LoanRepaymentSchedule.objects.filter(loan=self.loan)
        )
        self.assertEqual(self.loan.outstanding_penalties, total_penalty)

    def test_row_assessed_before_tracking_is_locked_in_not_recomputed(self):
        first = self.rows[0]
        first.status = "overdue"
        first.penalty_due = Decimal("550.00")
        first.principal_paid = Decimal("8000.00")
        first.total_paid = Decimal("8000.00")
        first.save()
        self.assertIsNone(first.penalty_periods_charged)

        self._run(date(2026, 8, 20))
        first.refresh_from_db()
        self.assertEqual(first.penalty_due, Decimal("550.00"))
        self.assertEqual(first.penalty_periods_charged, 1)
        self.assertFalse(self._penalty_credits_to_loan().exists())


class _BugEntriesBase(_LoanWithScheduleBase):
    """Seeds the ledger with what the old daily job left behind."""

    def _post(self, code, on, description, debit, credit, amount):
        from transactions.models import Transaction, TransactionSeries
        series, _ = TransactionSeries.objects.get_or_create(
            code=code, defaults={'description': code},
        )
        txn = Transaction.objects.create(
            series=series, date=on, description=description,
            owner=self.owner, branch=self.branch,
        )
        TransactionEntry.objects.create(
            transaction=txn, account=debit, side=TransactionEntry.DEBIT, amount=amount,
        )
        TransactionEntry.objects.create(
            transaction=txn, account=credit, side=TransactionEntry.CREDIT, amount=amount,
        )
        txn.post()
        return txn

    def _seed(self, bug_amount=Decimal("1000.00")):
        """
        Installment 1 (due 2026-08-01, 5% penalty, 2 periods late on
        2026-10-22/23) had 5,000 penalty charged; a 10,000 principal repayment
        on it then made the old job claw back 5% x 2 x 10,000 = 1,000.
        """
        from loans.models import LoanRepaymentAllocation
        cash = _make_account(self.owner, self.branch, "Cash", "1000", Account.ASSET)
        loan_acct = self.loan.account
        desc = 'Loan penalty accrual — LN-PU-1 (installment due 2026-08-01)'
        self._post('LNPEN', date(2026, 10, 1), desc,
                   loan_acct, self.penalty_income, Decimal("5000.00"))
        self.pmt_txn = self._post('LNPMT', date(2026, 10, 22), 'Loan repayment – LN-PU-1',
                                  cash, loan_acct, Decimal("10000.00"))
        LoanRepaymentAllocation.objects.create(
            loan=self.loan, schedule=self.rows[0], journal_entry=self.pmt_txn,
            principal_applied=Decimal("10000.00"),
        )
        self.bug_txn = self._post('LNPEN', date(2026, 10, 23), desc,
                                  self.penalty_income, loan_acct, bug_amount)
        # A reduction with no repayment on the installment before it.
        self._post('LNPEN', date(2026, 10, 24), desc,
                   self.penalty_income, loan_acct, Decimal("100.00"))
        # A deliberate correction command's entry: excluded.
        self._post('LNPEN', date(2026, 10, 24), 'Loan penalty accrual (compounding bug corrected) — LN-PU-1',
                   self.penalty_income, loan_acct, Decimal("999.00"))
        row = self.rows[0]
        row.principal_paid = Decimal("10000.00")
        row.total_paid = Decimal("10000.00")
        row.penalty_due = Decimal("5000.00") - bug_amount - Decimal("100.00")
        row.status = "overdue"
        row.save()
        self.loan.outstanding_penalties = row.penalty_due
        self.loan.save()


class AuditPenaltyReducedByRepaymentTestCase(_BugEntriesBase):
    """The audit finds the old bug's entries and ignores correction commands."""

    def test_audit_totals_repayment_driven_reductions(self):
        import io
        self._seed()
        out = io.StringIO()
        call_command("audit_penalty_reduced_by_repayment", stdout=out)
        text = out.getvalue()
        self.assertIn("(the bug): ₦1,000.00 across 1 loan(s)", text)
        self.assertIn("no repayment on this installment before it: ₦100.00 (1)", text)
        self.assertNotIn("999.00", text)

    def test_reduction_not_matching_the_repayment_is_not_confirmed(self):
        import io
        self._seed(bug_amount=Decimal("1500.00"))
        out = io.StringIO()
        call_command("audit_penalty_reduced_by_repayment", "--detail", stdout=out)
        text = out.getvalue()
        self.assertIn("(the bug): ₦0.00 across 0 loan(s)", text)
        self.assertIn("amount does not match the repayment: ₦1,500.00 (1)", text)
        self.assertIn("expected ₦   1,000.00", text)

    def test_reduction_from_a_later_reversed_repayment_is_not_confirmed(self):
        import io
        self._seed()
        self.pmt_txn.reverse(user=None, reason="Entered against the wrong loan")
        out = io.StringIO()
        call_command("audit_penalty_reduced_by_repayment", stdout=out)
        text = out.getvalue()
        self.assertIn("(the bug): ₦0.00 across 0 loan(s)", text)
        self.assertIn("the repayment was later reversed: ₦1,000.00 (1)", text)


class RestorePenaltyReducedByRepaymentTestCase(_BugEntriesBase):
    """The restore re-charges only the repayment-driven reduction, once."""

    def _restore(self, *args):
        import io
        out = io.StringIO()
        call_command("restore_penalty_reduced_by_repayment", *args, stdout=out)
        return out.getvalue()

    def test_dry_run_changes_nothing(self):
        self._seed()
        before = Account.objects.get(pk=self.loan.account_id).balance
        text = self._restore()
        self.assertIn("Would restore ₦1,000.00 across 1 loan(s)", text)
        self.assertEqual(Account.objects.get(pk=self.loan.account_id).balance, before)
        self.rows[0].refresh_from_db()
        self.assertEqual(self.rows[0].penalty_due, Decimal("3900.00"))

    def test_apply_recharges_repayment_driven_reduction_once(self):
        self._seed()
        loan_before = Account.objects.get(pk=self.loan.account_id).balance
        income_before = Account.objects.get(pk=self.penalty_income.pk).balance

        text = self._restore("--apply")
        self.assertIn("Restored ₦1,000.00 across 1 loan(s) (1 reductions reversed).", text)
        self.assertIn("not confirmed (no repayment on this installment before it): ₦100.00", text)

        loan_after = Account.objects.get(pk=self.loan.account_id).balance
        income_after = Account.objects.get(pk=self.penalty_income.pk).balance
        self.assertEqual(abs(loan_after - loan_before), Decimal("1000.00"))
        self.assertEqual(abs(income_after - income_before), Decimal("1000.00"))

        # Undone via the standard reversal path, so client ledgers hide the pair.
        self.bug_txn.refresh_from_db()
        self.assertTrue(self.bug_txn.is_reversed)
        rev = self.bug_txn.reversal_transaction
        self.assertTrue(rev.is_reversal)
        self.assertEqual(
            rev.entries.get(account=self.loan.account).side, TransactionEntry.DEBIT,
        )

        self.rows[0].refresh_from_db()
        self.loan.refresh_from_db()
        self.assertEqual(self.rows[0].penalty_due, Decimal("4900.00"))
        self.assertEqual(self.loan.outstanding_penalties, Decimal("4900.00"))

        # Re-running posts nothing more.
        text = self._restore("--apply")
        self.assertIn("Restored ₦0.00 across 0 loan(s)", text)
        self.rows[0].refresh_from_db()
        self.assertEqual(self.rows[0].penalty_due, Decimal("4900.00"))

    def test_closed_loan_is_reported_not_recharged(self):
        self._seed()
        self.loan.status = "paid_off"
        self.loan.save()
        text = self._restore("--apply")
        self.assertIn("loan no longer open — not recoverable by re-charging: ₦1,000.00", text)
        self.assertIn("Restored ₦0.00 across 0 loan(s)", text)
