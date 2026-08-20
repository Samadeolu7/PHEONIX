"""
Regression tests for excluding per-entity sub-ledger accounts (one per loan/
savings account/cashier till) from the generic account list/picker.

AccountViewSet used to try `.exclude(account_type__in=(SAVINGS, LOAN))`,
which hid the legitimate parent GL headers ("Customer Loan Portfolio" etc,
also account_type=LOAN/SAVINGS but account_level=PARENT) while doing nothing
for cashier sub-ledgers (plain ASSET accounts, indistinguishable by type).
The fix identifies a sub-ledger by its dedicated reverse FK from
LoanAccount/SavingsAccount/CashierAccount instead (see
Account.entity_subledger_q in accounts/models.py).
"""
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import Account
from branches.models import Branch
from cash_management.models import CashierAccount
from clients.models import Client
from loans.models import LoanAccount, LoanProduct
from products.models import Product
from savings.models import SavingsAccount, SavingsProduct
from users.models import Tenant

User = get_user_model()


class EntitySubledgerFilterTestBase(TestCase):
    def setUp(self):
        from common.managers import set_current_tenant
        set_current_tenant(None)

        self.owner = User.objects.create_user(username='subledger_owner', password='pass')
        self.tenant = Tenant.objects.create(name='Subledger Tenant', slug='subledger-tenant', owner=self.owner)
        self.owner.tenant = self.tenant
        self.owner.save()

        self.branch = Branch.objects.create(name='Branch', code='SLFB', tenant=self.tenant, owner=self.owner)
        self.owner.branch = self.branch
        self.owner.save()
        set_current_tenant(self.tenant)

        # A plain GL account a human should be able to pick — must survive every filter.
        self.cash_parent = self._make_account('Cash', '1000', Account.ASSET, Account.LEVEL_PARENT)
        self.cash = self._make_account('Cash on Hand', '1001', Account.ASSET, Account.LEVEL_CHILD, parent=self.cash_parent)

        # Loan sub-ledger
        self.loan_parent = self._make_account('Loans Receivable', '1300', Account.LOAN, Account.LEVEL_PARENT)
        loan_child = self._make_account('LN-1 Loan Account', '1300-00001', Account.LOAN, Account.LEVEL_CHILD, parent=self.loan_parent)
        loan_product_base = Product.objects.create(
            name='Weekly Loan', code='LOAN-WK', product_type='LOAN', owner=self.owner, branch=self.branch,
        )
        loan_product = LoanProduct.objects.create(
            product=loan_product_base, parent_account=self.loan_parent, disbursement_account=self.cash,
            default_interest_rate=Decimal('15.00'), interest_calculation_method='flat',
            min_loan_amount=Decimal('1000.00'), max_loan_amount=Decimal('500000.00'),
            owner=self.owner, branch=self.branch,
        )
        client = Client.objects.create(
            client_id='CLI-SLF-1', first_name='Ada', last_name='Lovelace', gender='female',
            phone_primary='08010000000', tenant=self.tenant, owner=self.owner, branch=self.branch,
        )
        LoanAccount.objects.create(
            client=client, product=loan_product, account=loan_child, loan_number='LN-SLF-1',
            requested_amount=Decimal('100000.00'), interest_rate=Decimal('15.00'), term_months=6,
            repayment_frequency='monthly', status='pending', owner=self.owner, branch=self.branch,
        )
        self.loan_account_gl = loan_child

        # Savings sub-ledger
        self.savings_parent = self._make_account('Customer Savings', '2100', Account.SAVINGS, Account.LEVEL_PARENT)
        savings_child = self._make_account('SAV-1 Savings Account', '2100-00001', Account.SAVINGS, Account.LEVEL_CHILD, parent=self.savings_parent)
        savings_product_base = Product.objects.create(
            name='Ordinary Savings', code='SAV-1', product_type='SAVINGS', owner=self.owner, branch=self.branch,
        )
        SavingsProduct.objects.create(
            product=savings_product_base, owner=self.owner, branch=self.branch,
        )
        SavingsAccount.objects.create(
            client=client, account=savings_child, product=savings_product_base, account_number='SAV-SLF-1',
            interest_rate=Decimal('0.00'), interest_calculation_method='monthly', minimum_balance=Decimal('0.00'),
            opened_on=date(2026, 1, 1), status='active', owner=self.owner, branch=self.branch,
        )
        self.savings_account_gl = savings_child

        # Cashier sub-ledger
        cashier_child = self._make_account('Officer Till', '1002', Account.ASSET, Account.LEVEL_CHILD, parent=self.cash_parent)
        CashierAccount.objects.create(
            cashier=self.owner, account=cashier_child, account_number='CA-SLF-1', name='Officer Till',
            is_active=True, owner=self.owner, branch=self.branch,
        )
        self.cashier_account_gl = cashier_child

    def _make_account(self, name, code, account_type, account_level, parent=None):
        return Account.objects.create(
            name=name, code=code, account_type=account_type, account_level=account_level,
            parent=parent, owner=self.owner, created_by=self.owner, branch=self.branch,
        )


class AccountModelSubledgerFilterTests(EntitySubledgerFilterTestBase):
    def test_exclude_entity_subledgers_hides_all_three_types(self):
        visible = Account.exclude_entity_subledgers(Account.objects.filter(branch=self.branch))
        visible_ids = set(visible.values_list('id', flat=True))

        self.assertNotIn(self.loan_account_gl.id, visible_ids)
        self.assertNotIn(self.savings_account_gl.id, visible_ids)
        self.assertNotIn(self.cashier_account_gl.id, visible_ids)

    def test_exclude_entity_subledgers_keeps_plain_and_parent_accounts(self):
        visible = Account.exclude_entity_subledgers(Account.objects.filter(branch=self.branch))
        visible_ids = set(visible.values_list('id', flat=True))

        self.assertIn(self.cash.id, visible_ids)
        self.assertIn(self.cash_parent.id, visible_ids)
        # Parent headers are account_type LOAN/SAVINGS too — must survive
        # (the old account_type-based exclusion wrongly hid these).
        self.assertIn(self.loan_parent.id, visible_ids)
        self.assertIn(self.savings_parent.id, visible_ids)


class AccountAPISubledgerFilterTests(EntitySubledgerFilterTestBase):
    def setUp(self):
        super().setUp()
        self.client_api = APIClient()
        self.client_api.force_authenticate(user=self.owner)

    def test_list_excludes_subledgers_by_default(self):
        response = self.client_api.get('/api/accounts/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # AccountViewSet disables pagination (pagination_class = None) —
        # response.data is the flat list of accounts, not {results: [...]}.
        codes = {row['code'] for row in response.data}

        self.assertNotIn(self.loan_account_gl.code, codes)
        self.assertNotIn(self.savings_account_gl.code, codes)
        self.assertNotIn(self.cashier_account_gl.code, codes)
        self.assertIn(self.cash.code, codes)

    def test_list_includes_subledgers_when_opted_in(self):
        response = self.client_api.get('/api/accounts/', {'include_subledgers': 'true'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # AccountViewSet disables pagination (pagination_class = None) —
        # response.data is the flat list of accounts, not {results: [...]}.
        codes = {row['code'] for row in response.data}

        self.assertIn(self.loan_account_gl.code, codes)
        self.assertIn(self.savings_account_gl.code, codes)
        self.assertIn(self.cashier_account_gl.code, codes)

    def test_retrieve_still_works_for_a_subledger_by_id(self):
        response = self.client_api.get(f'/api/accounts/{self.loan_account_gl.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['code'], self.loan_account_gl.code)

    def test_list_can_keep_just_cashier_subledgers(self):
        """Ledger Search asks for `include_subledgers=cashier` so a staff
        member's till is findable without flooding results with every
        loan/savings sub-ledger row."""
        response = self.client_api.get('/api/accounts/', {'include_subledgers': 'cashier'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        codes = {row['code'] for row in response.data}

        self.assertIn(self.cashier_account_gl.code, codes)
        self.assertNotIn(self.loan_account_gl.code, codes)
        self.assertNotIn(self.savings_account_gl.code, codes)
        self.assertIn(self.cash.code, codes)
