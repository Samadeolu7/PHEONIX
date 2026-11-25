"""
Regression tests for check_savings_requirement.

Production bug: clients who clearly had enough Regular Savings were blocked
from new loans with "Insufficient Regular Savings balance: required
₦10,000.00, available ₦0.00". The check only looked at an account that was
(a) status='active' and (b) on the exact savings Product row the requirement
referenced. It missed:
  - accounts the legacy importer had marked 'dormant' (zero balance at import
    time, never flipped back after later deposits), and
  - accounts on another branch's copy of "Regular Savings" (products are
    cloned per branch, so every branch has its own SAV-REG row).
"""
from datetime import date
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.test import TestCase

from common.managers import set_current_tenant
from users.models import Tenant, User
from branches.models import Branch
from accounts.models import Account
from products.models import Product
from clients.models import Client
from loans.models import LoanProduct, LoanProductSavingsRequirement
from loans.services import check_savings_requirement
from savings.models import SavingsAccount


def _acct(user, branch, name, code, account_type, level=Account.LEVEL_PARENT, parent=None):
    return Account.objects.create(
        name=name, code=code, account_type=account_type, account_level=level,
        parent=parent, owner=user, created_by=user, branch=branch,
    )


class _LoanEnvTestCase(TestCase):
    def setUp(self):
        set_current_tenant(None)
        self.user = User.objects.create_user(username="savreq", password="pass")
        self.tenant = Tenant.objects.create(name="T-savreq", slug="t-savreq", owner=self.user)
        self.user.tenant = self.tenant
        self.user.save()
        self.branch_a = Branch.objects.create(name="A", code="SRA", tenant=self.tenant, owner=self.user)
        self.branch_b = Branch.objects.create(name="B", code="SRB", tenant=self.tenant, owner=self.user)
        self.user.branch = self.branch_a
        self.user.save()
        set_current_tenant(self.tenant)

        self.loan_parent = _acct(self.user, self.branch_a, "Loans", "1300", Account.LOAN)
        self.cash = _acct(self.user, self.branch_a, "Cash", "1000", Account.ASSET)
        self.income = _acct(self.user, self.branch_a, "Interest Income", "4100", Account.INCOME)
        self.savings_parent = _acct(self.user, self.branch_a, "Member Savings", "2140", Account.SAVINGS)

        # Each branch has its own clone of Regular Savings.
        self.sav_a = Product.objects.create(
            name="Regular Savings", code="SAV-REG", product_type="SAVINGS",
            owner=self.user, branch=self.branch_a,
        )
        self.sav_b = Product.objects.create(
            name="Regular Savings", code="SAV-REG", product_type="SAVINGS",
            owner=self.user, branch=self.branch_b,
        )

        loan_gl_product = Product.objects.create(
            name="Weekly Loan", code="LOAN-WK", product_type="LOAN",
            owner=self.user, branch=self.branch_a,
        )
        self.loan_product = LoanProduct.objects.create(
            product=loan_gl_product,
            parent_account=self.loan_parent,
            disbursement_account=self.cash,
            interest_income_account=self.income,
            default_interest_rate=Decimal("18.00"),
            interest_calculation_method="flat",
            min_loan_amount=Decimal("1000.00"),
            max_loan_amount=Decimal("300000.00"),
            owner=self.user, branch=self.branch_a,
        )
        # Requirement points at branch A's Regular Savings.
        LoanProductSavingsRequirement.objects.create(
            loan_product=self.loan_product, savings_product=self.sav_a,
            requirement_type="fixed", value=Decimal("10000.00"),
            owner=self.user, branch=self.branch_a,
        )

        self.client_obj = Client.objects.create(
            client_id="CLI-SR1", first_name="Test", last_name="Client",
            gender="female", phone_primary="08000000001", tenant=self.tenant,
            owner=self.user, branch=self.branch_a,
        )
        # Drop any default savings account auto-opened by the client signal so
        # each test controls exactly which account exists.
        SavingsAccount.all_objects.filter(client=self.client_obj).delete()
        self._n = 0

    def _savings(self, product, balance, status="active"):
        self._n += 1
        gl = _acct(
            self.user, self.branch_a, f"Sav {self._n}", f"2140-9{self._n:04d}",
            Account.SAVINGS, level=Account.LEVEL_CHILD, parent=self.savings_parent,
        )
        Account.objects.filter(pk=gl.pk).update(balance=balance)
        return SavingsAccount.objects.create(
            client=self.client_obj, product=product, account=gl,
            account_number=gl.code, opened_on=date.today(), status=status,
            interest_rate=Decimal("0"), interest_calculation_method="monthly",
            owner=self.user, branch=self.branch_a,
        )

class SavingsRequirementTests(_LoanEnvTestCase):
    def test_active_account_with_enough_balance_passes(self):
        self._savings(self.sav_a, Decimal("10000.00"))
        check_savings_requirement(self.client_obj, self.loan_product, Decimal("50000"))

    def test_dormant_account_with_enough_balance_passes(self):
        self._savings(self.sav_a, Decimal("10000.00"), status="dormant")
        check_savings_requirement(self.client_obj, self.loan_product, Decimal("50000"))

    def test_other_branch_copy_of_product_counts(self):
        self._savings(self.sav_b, Decimal("12000.00"))
        check_savings_requirement(self.client_obj, self.loan_product, Decimal("50000"))

    def test_frozen_account_does_not_count(self):
        self._savings(self.sav_a, Decimal("10000.00"), status="frozen")
        with self.assertRaises(ValidationError) as ctx:
            check_savings_requirement(self.client_obj, self.loan_product, Decimal("50000"))
        self.assertIn("available ₦0.00", str(ctx.exception))

    def test_genuinely_short_balance_still_blocks(self):
        self._savings(self.sav_a, Decimal("9999.99"))
        with self.assertRaises(ValidationError) as ctx:
            check_savings_requirement(self.client_obj, self.loan_product, Decimal("50000"))
        self.assertIn("available ₦9,999.99", str(ctx.exception))

    def test_deposit_reactivates_dormant_account(self):
        acct = self._savings(self.sav_a, Decimal("0.00"), status="dormant")
        till_gl = _acct(
            self.user, self.branch_a, "Till", "1001", Account.ASSET,
            level=Account.LEVEL_CHILD, parent=self.cash,
        )
        acct.deposit(Decimal("500.00"), cashier_account=till_gl, transacted_by=self.user)
        acct.refresh_from_db()
        self.assertEqual(acct.status, "active")


class CustomerBranchTests(_LoanEnvTestCase):
    """Customer-owned records follow the CUSTOMER's branch, not the staff's."""

    def _loan_product_in(self, branch, code="LOAN-WK"):
        gl_product = Product.objects.create(
            name="Weekly Loan", code=code, product_type="LOAN",
            owner=self.user, branch=branch,
        )
        return LoanProduct.objects.create(
            product=gl_product,
            parent_account=self.loan_parent,
            disbursement_account=self.cash,
            interest_income_account=self.income,
            default_interest_rate=Decimal("18.00"),
            interest_calculation_method="flat",
            min_loan_amount=Decimal("1000.00"),
            max_loan_amount=Decimal("300000.00"),
            owner=self.user, branch=branch,
        )

    def test_loan_product_swapped_for_customer_branch_copy(self):
        from loans.services import loan_product_for_branch
        branch_b_copy = self._loan_product_in(self.branch_b)
        # Staff in branch A picked branch A's product; client is in branch B.
        self.assertEqual(
            loan_product_for_branch(self.loan_product, self.branch_b).pk,
            branch_b_copy.pk,
        )
        # Same branch → unchanged.
        self.assertEqual(
            loan_product_for_branch(self.loan_product, self.branch_a).pk,
            self.loan_product.pk,
        )

    def test_missing_copy_in_customer_branch_is_a_clear_error(self):
        from loans.services import loan_product_for_branch
        with self.assertRaises(ValidationError) as ctx:
            loan_product_for_branch(self.loan_product, self.branch_b)
        self.assertIn("not set up in the client's branch (B)", str(ctx.exception))

    def test_fee_routing_rekeyed_to_customer_branch_fee_lines(self):
        from loans.models import LoanProductFee
        from loans.services import remap_fee_routing
        branch_b_copy = self._loan_product_in(self.branch_b)
        common = dict(
            fee_type="fixed", fixed_amount=Decimal("500"), gl_income_account=self.income,
            owner=self.user,
        )
        fee_a = LoanProductFee.objects.create(
            loan_product=self.loan_product, name="Form Fee", branch=self.branch_a, **common)
        fee_b = LoanProductFee.objects.create(
            loan_product=branch_b_copy, name="Form Fee", branch=self.branch_b, **common)
        route = {"destination": "savings", "savings_account_id": None}
        self.assertEqual(
            remap_fee_routing({fee_a.pk: route}, self.loan_product, branch_b_copy),
            {fee_b.pk: route},
        )

    def test_customer_branch_from_prefers_customer_record(self):
        from common.views import customer_branch_from
        self.client_obj.branch = self.branch_b
        self.assertEqual(
            customer_branch_from({'client': self.client_obj}, ('loan', 'client')),
            self.branch_b,
        )
        self.assertIsNone(customer_branch_from({}, ('loan', 'client')))

    def test_loan_request_scope_uses_loan_branch_over_staff_branch(self):
        from types import SimpleNamespace
        from loans.views import _resolve_scope
        loan = SimpleNamespace(branch=self.branch_b, tenant=self.tenant)
        # self.user is posted to branch A.
        _, branch = _resolve_scope(self.user, loan)
        self.assertEqual(branch, self.branch_b)

    def test_opening_savings_account_books_it_in_customer_branch(self):
        """Open Savings Account: GL account + record land in the CLIENT's branch."""
        from rest_framework.test import APIClient
        # Client belongs to branch B; branch B has its own 2140 parent.
        Client.objects.filter(pk=self.client_obj.pk).update(branch=self.branch_b)
        self.client_obj.refresh_from_db()
        _acct(self.user, self.branch_b, "Member Savings", "2140", Account.SAVINGS)

        api = APIClient()
        api.force_authenticate(user=self.user)
        resp = api.post(
            "/api/savings/accounts/",
            {
                "client": self.client_obj.pk, "product": self.sav_a.pk,  # staff's branch copy
                "opened_on": str(date.today()), "interest_rate": "0.00",
                "interest_calculation_method": "monthly",
            },
            format="json",
            HTTP_X_BRANCH_ID=str(self.branch_a.pk),  # staff is working in branch A
        )
        self.assertEqual(resp.status_code, 201, resp.content)
        acct = SavingsAccount.objects.get(pk=resp.json()["id"])
        self.assertEqual(acct.branch_id, self.branch_b.pk)
        self.assertEqual(acct.account.branch_id, self.branch_b.pk)
        self.assertEqual(acct.account_number, acct.account.code)
        self.assertEqual(acct.product_id, self.sav_b.pk)  # client's branch copy

    def _income_category(self, branch):
        from incomes.models import IncomeCategory
        income_gl = _acct(self.user, branch, "Fee Income", "4200", Account.INCOME)
        return IncomeCategory.objects.create(
            name="Form Fee", code="FORM", income_account=income_gl,
            owner=self.user, branch=branch,
        )

    def _post_income(self, category, **extra):
        from rest_framework.test import APIClient
        api = APIClient()
        api.force_authenticate(user=self.user)
        return api.post(
            "/api/incomes/incomes/",
            {
                "category": category.pk, "reference_number": f"INC-{category.pk}-{len(extra)}",
                "income_date": str(date.today()), "description": "Form fee",
                "amount": "500.00", **extra,
            },
            format="json",
            HTTP_X_BRANCH_ID=str(self.branch_a.pk),  # staff is working in branch A
        )

    def test_income_for_a_client_is_booked_in_the_clients_branch(self):
        from incomes.models import Income
        cat_a = self._income_category(self.branch_a)
        cat_b = self._income_category(self.branch_b)
        Client.objects.filter(pk=self.client_obj.pk).update(branch=self.branch_b)

        resp = self._post_income(cat_a, client=self.client_obj.pk)
        self.assertEqual(resp.status_code, 201, resp.content)
        income = Income.objects.get(pk=resp.json()["id"])
        self.assertEqual(income.branch_id, self.branch_b.pk)
        # Switched to branch B's copy of the category (its GL income account).
        self.assertEqual(income.category_id, cat_b.pk)

    def test_income_without_a_client_uses_the_branch_staff_is_working_in(self):
        from incomes.models import Income
        cat_a = self._income_category(self.branch_a)
        resp = self._post_income(cat_a)
        self.assertEqual(resp.status_code, 201, resp.content)
        income = Income.objects.get(pk=resp.json()["id"])
        self.assertEqual(income.branch_id, self.branch_a.pk)
        self.assertEqual(income.category_id, cat_a.pk)

    def test_income_category_missing_in_clients_branch_is_a_clear_error(self):
        cat_a = self._income_category(self.branch_a)
        Client.objects.filter(pk=self.client_obj.pk).update(branch=self.branch_b)
        resp = self._post_income(cat_a, client=self.client_obj.pk)
        self.assertEqual(resp.status_code, 400, resp.content)
        self.assertIn("not set up in B", str(resp.content))

    def test_cash_collection_uses_cashiers_till_in_clients_branch(self):
        from rest_framework.test import APIClient
        from cash_management.models import CashCollection
        from cash_management.services.payment_routing import PaymentRoutingService
        from django.contrib.contenttypes.models import ContentType
        from receivables.models import CustomerReceivable
        till_a = PaymentRoutingService.get_or_create_cashier_account(self.user, branch=self.branch_a)
        Client.objects.filter(pk=self.client_obj.pk).update(branch=self.branch_b)
        receivable = CustomerReceivable.objects.create(
            client=self.client_obj, receivable_type=CustomerReceivable._meta.get_field(
                'receivable_type').choices[0][0],
            content_type=ContentType.objects.get_for_model(Client), object_id=self.client_obj.pk,
            reference_number="RCV-1", original_amount=Decimal("1000.00"),
            balance=Decimal("1000.00"), due_date=date.today(),
            owner=self.user, branch=self.branch_b,
        )

        api = APIClient()
        api.force_authenticate(user=self.user)
        resp = api.post(
            "/api/cash-management/cash-collections/",
            {
                "cashier_account": till_a.pk, "client": self.client_obj.pk,
                "receivable": receivable.pk,
                "amount_due": "1000.00", "amount_collected": "1000.00",
                "payment_purpose": "Loan Payment", "collection_date": str(date.today()),
            },
            format="json",
            HTTP_X_BRANCH_ID=str(self.branch_a.pk),
        )
        self.assertIn(resp.status_code, (200, 201), resp.content)
        collection = CashCollection.objects.get(client=self.client_obj)
        self.assertEqual(collection.branch_id, self.branch_b.pk)
        self.assertEqual(collection.cashier_account.branch_id, self.branch_b.pk)
        self.assertEqual(collection.cashier_account.cashier_id, self.user.pk)
        self.assertEqual(collection.cashier_account.account.branch_id, self.branch_b.pk)
        self.assertEqual(collection.receivable_id, receivable.pk)

    def test_client_import_uses_branch_staff_is_acting_in(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        from rest_framework.test import APIClient
        api = APIClient()
        api.force_authenticate(user=self.user)
        csv_bytes = b"first_name,last_name,phone_primary,gender\nAmina,Bello,08099990000,female\n"
        resp = api.post(
            "/api/clients/clients/bulk_import/",
            {"file": SimpleUploadedFile("clients.csv", csv_bytes, content_type="text/csv")},
            format="multipart",
            HTTP_X_BRANCH_ID=str(self.branch_b.pk),  # acting in branch B
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        imported = Client.objects.get(phone_primary="08099990000")
        self.assertEqual(imported.branch_id, self.branch_b.pk)

    def test_invoice_follows_client_branch_with_branch_copies(self):
        """Fee/service invoice: booked in the client's branch, on that branch's
        copy of the service item (so revenue credits that branch's account)."""
        from rest_framework.test import APIClient
        from incomes.models import Invoice, ServiceItem
        cat_a = self._income_category(self.branch_a)
        cat_b = self._income_category(self.branch_b)
        svc_a = ServiceItem.objects.create(
            name="Passbook", code="PASS", category=cat_a, default_price=Decimal("300"),
            owner=self.user, branch=self.branch_a)
        svc_b = ServiceItem.objects.create(
            name="Passbook", code="PASS", category=cat_b, default_price=Decimal("300"),
            owner=self.user, branch=self.branch_b)
        Client.objects.filter(pk=self.client_obj.pk).update(branch=self.branch_b)

        api = APIClient()
        api.force_authenticate(user=self.user)
        resp = api.post(
            "/api/incomes/invoices/",
            {
                "client": self.client_obj.pk, "invoice_date": str(date.today()),
                "due_date": str(date.today()), "description": "Passbook",
                "items": [{
                    "item_type": "service", "service_item": svc_a.pk,
                    "description": "Passbook", "quantity": "1", "unit_price": "300.00",
                }],
            },
            format="json",
            HTTP_X_BRANCH_ID=str(self.branch_a.pk),  # staff working in branch A
        )
        self.assertEqual(resp.status_code, 201, resp.content)
        invoice = Invoice.objects.get(client=self.client_obj)
        self.assertEqual(invoice.branch_id, self.branch_b.pk)
        self.assertEqual(invoice.items.get().service_item_id, svc_b.pk)
