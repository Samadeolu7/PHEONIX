"""
Regression test: per-entity sub-ledger accounts (one per loan/savings
account/cashier till) used to clutter the Trial Balance report in
'detailed'/'all' mode. The fix (Account.entity_subledger_q,
FinancialStatementService._hidden_subledger_ids) must hide them from
*display* only — a parent like "Loans Receivable" must keep summing every
child's balance, including its sub-ledgers, in its rollup total.
"""
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase

from accounts.models import Account
from branches.models import Branch
from clients.models import Client
from loans.models import LoanAccount, LoanProduct
from products.models import Product
from reports.services.financial_statements import FinancialStatementService
from transactions.models import Transaction, TransactionEntry, TransactionSeries
from users.models import Tenant

User = get_user_model()


class TrialBalanceSubledgerExclusionTests(TestCase):
    def setUp(self):
        from common.managers import set_current_tenant
        set_current_tenant(None)

        self.owner = User.objects.create_user(username='tb_subledger_owner', password='pass')
        self.tenant = Tenant.objects.create(name='TB Subledger Tenant', slug='tb-subledger-tenant', owner=self.owner)
        self.owner.tenant = self.tenant
        self.owner.save()

        self.branch = Branch.objects.create(name='Branch', code='TBSLF', tenant=self.tenant, owner=self.owner)
        self.owner.branch = self.branch
        self.owner.save()
        set_current_tenant(self.tenant)

        self.cash_parent = self._make_account('Cash', '1000', Account.ASSET, Account.LEVEL_PARENT)
        self.cash = self._make_account('Cash on Hand', '1001', Account.ASSET, Account.LEVEL_CHILD, parent=self.cash_parent)
        self.equity_parent = self._make_account('Equity', '3000', Account.EQUITY, Account.LEVEL_PARENT)
        self.equity = self._make_account('Opening Balance Equity', '3001', Account.EQUITY, Account.LEVEL_CHILD, parent=self.equity_parent)

        self.loan_parent = self._make_account('Loans Receivable', '1300', Account.LOAN, Account.LEVEL_PARENT)
        self.loan_child = self._make_account('LN-1 Loan Account', '1300-00001', Account.LOAN, Account.LEVEL_CHILD, parent=self.loan_parent)

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
            client_id='CLI-TBSLF-1', first_name='Ada', last_name='Lovelace', gender='female',
            phone_primary='08010000000', tenant=self.tenant, owner=self.owner, branch=self.branch,
        )
        LoanAccount.objects.create(
            client=client, product=loan_product, account=self.loan_child, loan_number='LN-TBSLF-1',
            requested_amount=Decimal('50000.00'), interest_rate=Decimal('15.00'), term_months=6,
            repayment_frequency='monthly', status='pending', owner=self.owner, branch=self.branch,
        )

        # Post a real balance onto the loan sub-ledger so we can prove the
        # parent's rollup total still includes it even though it won't be
        # displayed: Dr Loan (increase) / Cr Opening Balance Equity.
        series, _ = TransactionSeries.objects.get_or_create(code='OB', defaults={'description': 'Opening Balance'})
        txn = Transaction.objects.create(
            series=series, description='Loan opening balance', branch=self.branch,
            owner=self.owner, created_by=self.owner, tenant=self.tenant,
        )
        TransactionEntry.objects.create(transaction=txn, account=self.loan_child, side=TransactionEntry.DEBIT, amount=Decimal('50000.00'))
        TransactionEntry.objects.create(transaction=txn, account=self.equity, side=TransactionEntry.CREDIT, amount=Decimal('50000.00'))
        txn.post()

    def _make_account(self, name, code, account_type, account_level, parent=None):
        return Account.objects.create(
            name=name, code=code, account_type=account_type, account_level=account_level,
            parent=parent, owner=self.owner, created_by=self.owner, branch=self.branch,
        )

    def test_parent_total_includes_subledger_balance_in_detailed_mode(self):
        service = FinancialStatementService(self.owner, branch=self.branch)
        report = service.generate_trial_balance(detail_level='detailed', include_zero_balances=True)

        loans_row = next(a for a in report['accounts'] if a['code'] == '1300')
        self.assertEqual(Decimal(loans_row['balance']), Decimal('50000.00'))

    def test_children_display_excludes_subledger_in_detailed_mode(self):
        service = FinancialStatementService(self.owner, branch=self.branch)
        report = service.generate_trial_balance(detail_level='detailed', include_zero_balances=True)

        loans_row = next(a for a in report['accounts'] if a['code'] == '1300')
        child_codes = {c['code'] for c in loans_row.get('children', [])}
        self.assertNotIn('1300-00001', child_codes)

    def test_all_mode_excludes_subledger_as_flat_row(self):
        service = FinancialStatementService(self.owner, branch=self.branch)
        report = service.generate_trial_balance(detail_level='all', include_zero_balances=True)

        codes = {a['code'] for a in report['accounts']}
        self.assertNotIn('1300-00001', codes)
        # Plain accounts and parent headers must still show up.
        self.assertIn('1001', codes)
        self.assertIn('1300', codes)

    def test_trial_balance_stays_balanced(self):
        service = FinancialStatementService(self.owner, branch=self.branch)
        report = service.generate_trial_balance(detail_level='detailed', include_zero_balances=True)
        self.assertTrue(report['is_balanced'])
