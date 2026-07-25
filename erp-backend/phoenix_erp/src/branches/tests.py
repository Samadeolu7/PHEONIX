from decimal import Decimal

from django.test import TestCase
from django.contrib.auth import get_user_model

from users.models import Tenant
from .models import Branch
from .services import BranchCloneService

User = get_user_model()


class BranchCloneServiceTests(TestCase):
    """
    Covers the dry_run savepoint behaviour and the Phase 6 workflow-FK
    remapping added to close the HRConfig/IncomeAccountingConfig gap.
    """

    def setUp(self):
        self.tenant = Tenant.objects.create(name='Test Tenant')
        self.source = Branch.objects.create(name='Source Branch', code='SRC', tenant=self.tenant)
        self.target = Branch.objects.create(name='Target Branch', code='TGT', tenant=self.tenant)
        self.user = User.objects.create_user(
            username='cloneuser', password='testpass123', tenant=self.tenant,
        )

        from automations.models import WorkflowTemplate
        self.workflow = WorkflowTemplate.objects.create(
            branch=self.source, tenant=self.tenant, owner=self.user, created_by=self.user,
            name='Leave Approval', trigger_type='manual',
        )

        from accounts.models import AccountCategory, Account
        self.category = AccountCategory.objects.create(
            branch=self.source, tenant=self.tenant, owner=self.user, created_by=self.user,
            section=4, name='Income',
        )
        self.cash_account = Account.objects.create(
            branch=self.source, tenant=self.tenant, owner=self.user, created_by=self.user,
            category=self.category, code='1001', name='Cash',
            account_level=Account.LEVEL_PARENT, account_type=Account.ASSET,
        )
        self.ar_account = Account.objects.create(
            branch=self.source, tenant=self.tenant, owner=self.user, created_by=self.user,
            category=self.category, code='1002', name='Accounts Receivable',
            account_level=Account.LEVEL_PARENT, account_type=Account.ASSET,
        )

        from hr.config_models import HRConfig
        self.hr_config = HRConfig.objects.create(
            branch=self.source, tenant=self.tenant, owner=self.user, created_by=self.user,
            default_leave_workflow=self.workflow,
        )

        from incomes.models_config import IncomeAccountingConfig
        self.income_config = IncomeAccountingConfig.objects.create(
            branch=self.source, tenant=self.tenant, owner=self.user, created_by=self.user,
            default_cash_account=self.cash_account, default_ar_account=self.ar_account,
        )

    def _target_row_counts(self):
        from hr.config_models import HRConfig
        from incomes.models_config import IncomeAccountingConfig
        from automations.models import WorkflowTemplate
        from accounts.models import Account, AccountCategory
        return (
            HRConfig.objects.filter(branch=self.target).count(),
            IncomeAccountingConfig.objects.filter(branch=self.target).count(),
            WorkflowTemplate.objects.filter(branch=self.target).count(),
            Account.objects.filter(branch=self.target).count(),
            AccountCategory.objects.filter(branch=self.target).count(),
        )

    def test_dry_run_persists_nothing(self):
        before = self._target_row_counts()
        self.assertEqual(before, (0, 0, 0, 0, 0))

        result = BranchCloneService(self.source, self.target, self.user).clone(dry_run=True)

        after = self._target_row_counts()
        self.assertEqual(before, after)
        self.assertTrue(result['dry_run'])
        self.assertGreater(result['created'].get('hr_config', 0), 0)
        self.assertGreater(result['created'].get('income_accounting_config', 0), 0)
        self.assertGreater(result['created'].get('workflow_templates', 0), 0)
        self.assertGreater(result['created'].get('gl_accounts', 0), 0)

    def test_dry_run_preview_matches_real_clone(self):
        preview = BranchCloneService(self.source, self.target, self.user).clone(dry_run=True)
        real = BranchCloneService(self.source, self.target, self.user).clone(dry_run=False)

        self.assertEqual(preview['created'], real['created'])
        self.assertEqual(preview['skipped'], real['skipped'])

    def test_clone_remaps_workflow_fk_to_targets_own_copy(self):
        from hr.config_models import HRConfig

        BranchCloneService(self.source, self.target, self.user).clone(dry_run=False)

        target_hr_config = HRConfig.objects.get(branch=self.target)
        self.assertIsNotNone(target_hr_config.default_leave_workflow)
        self.assertEqual(target_hr_config.default_leave_workflow.branch_id, self.target.id)
        self.assertNotEqual(target_hr_config.default_leave_workflow_id, self.workflow.id)

    def test_clone_remaps_income_config_gl_accounts_to_targets_own_copy(self):
        from incomes.models_config import IncomeAccountingConfig

        BranchCloneService(self.source, self.target, self.user).clone(dry_run=False)

        target_config = IncomeAccountingConfig.objects.get(branch=self.target)
        self.assertEqual(target_config.default_cash_account.branch_id, self.target.id)
        self.assertEqual(target_config.default_ar_account.branch_id, self.target.id)
        self.assertNotEqual(target_config.default_cash_account_id, self.cash_account.id)

    def test_second_clone_is_idempotent(self):
        BranchCloneService(self.source, self.target, self.user).clone(dry_run=False)
        second = BranchCloneService(self.source, self.target, self.user).clone(dry_run=False)

        self.assertEqual(second['created'], {})
        self.assertGreater(second['skipped'].get('hr_config', 0), 0)

    def test_individual_loan_and_cashier_accounts_are_never_cloned(self):
        """
        Regression test for a real production bug: individual per-client
        loan accounts and per-cashier till accounts in this system use
        plain 4-digit codes (e.g. "1193 - Jane Doe - Monthly Loan"), the
        exact same format as real shared GL structure — so a code-format-
        only filter clones them as if they were part of the chart of
        accounts, polluting the target branch with accounts named after
        the source branch's individual clients/cashiers. Only actual usage
        (LoanAccount.account / CashierAccount.account) can tell them apart
        from real GL structure, which is what _in_use_account_ids checks.
        """
        from accounts.models import Account
        from products.models import Product
        from clients.models import Client
        from loans.models import LoanProduct, LoanAccount
        from cash_management.models import CashierAccount

        loan_parent = Account.objects.create(
            branch=self.source, tenant=self.tenant, owner=self.user, created_by=self.user,
            category=self.category, code='1300', name='Customer Loan Portfolio',
            account_level=Account.LEVEL_PARENT, account_type=Account.LOAN,
        )
        gl_product = Product.objects.create(
            name='Monthly Loan', code='LOAN-MON', product_type='LOAN',
            owner=self.user, branch=self.source,
        )
        loan_product = LoanProduct.objects.create(
            product=gl_product, parent_account=loan_parent,
            default_interest_rate=Decimal('10.00'), interest_calculation_method='flat',
            min_loan_amount=Decimal('1000.00'), max_loan_amount=Decimal('500000.00'),
            owner=self.user, branch=self.source,
        )
        client = Client.objects.create(
            client_id='CLI-JANE', first_name='Jane', last_name='Doe',
            gender='female', phone_primary='08010000005',
            tenant=self.tenant, owner=self.user, branch=self.source,
        )
        # The exact bug scenario: a per-client loan account with a plain
        # 4-digit code, indistinguishable by format from real GL structure.
        jane_loan_gl_account = Account.objects.create(
            branch=self.source, tenant=self.tenant, owner=self.user, created_by=self.user,
            category=self.category, code='1193', name='Jane Doe - Monthly Loan',
            account_level=Account.LEVEL_CHILD, account_type=Account.LOAN, parent=loan_parent,
        )
        LoanAccount.objects.create(
            client=client, product=loan_product, account=jane_loan_gl_account,
            loan_number='LN-JANE-1', requested_amount=Decimal('10000.00'),
            interest_rate=Decimal('10.00'), term_months=2,
            repayment_frequency='monthly', status='pending',
            owner=self.user, branch=self.source,
        )

        cash_parent = Account.objects.create(
            branch=self.source, tenant=self.tenant, owner=self.user, created_by=self.user,
            category=self.category, code='1100', name='Cash and Cash Equivalents',
            account_level=Account.LEVEL_PARENT, account_type=Account.ASSET,
        )
        cashier_gl_account = Account.objects.create(
            branch=self.source, tenant=self.tenant, owner=self.user, created_by=self.user,
            category=self.category, code='1115', name='Dominion Akinfenwa - Cash Account',
            account_level=Account.LEVEL_CHILD, account_type=Account.ASSET, parent=cash_parent,
        )
        cashier_user = User.objects.create_user(
            username='cashier1', password='testpass123', tenant=self.tenant,
        )
        CashierAccount.objects.create(
            cashier=cashier_user, account=cashier_gl_account,
            account_number='TILL-JANE', name='Dominion Till',
            owner=self.user, branch=self.source,
        )

        BranchCloneService(self.source, self.target, self.user).clone(dry_run=False)

        self.assertFalse(Account.objects.filter(branch=self.target, code='1193').exists())
        self.assertFalse(Account.objects.filter(branch=self.target, code='1115').exists())
        # The real shared GL structure (the parent portfolios) IS still cloned.
        self.assertTrue(Account.objects.filter(branch=self.target, code='1300').exists())
        self.assertTrue(Account.objects.filter(branch=self.target, code='1100').exists())


class CleanUpBranchCloneOrphanedAccountsCommandTests(TestCase):
    """
    Covers the clean_up_branch_clone_orphaned_accounts command that fixes the
    fallout from a previous (already-run, real-world) clone that copied
    individual loan accounts into a target branch under the old code-format
    -only exclusion logic — see test_individual_loan_and_cashier_accounts_
    are_never_cloned above for the bug this data represents.
    """

    def setUp(self):
        self.tenant = Tenant.objects.create(name='Cleanup Tenant')
        self.source = Branch.objects.create(name='Source Branch', code='CSRC', tenant=self.tenant)
        self.target = Branch.objects.create(name='Target Branch', code='CTGT', tenant=self.tenant)
        self.user = User.objects.create_user(
            username='cleanupuser', password='testpass123', tenant=self.tenant,
        )

        from accounts.models import Account
        from products.models import Product
        from clients.models import Client
        from loans.models import LoanProduct, LoanAccount

        self.category = None  # AccountCategory not required for this scenario

        # ── Real, in-use account in the SOURCE branch (the corroborating original) ──
        loan_parent = Account.objects.create(
            branch=self.source, tenant=self.tenant, owner=self.user, created_by=self.user,
            code='1300', name='Customer Loan Portfolio',
            account_level=Account.LEVEL_PARENT, account_type=Account.LOAN,
        )
        gl_product = Product.objects.create(
            name='Monthly Loan', code='LOAN-MON', product_type='LOAN',
            owner=self.user, branch=self.source,
        )
        loan_product = LoanProduct.objects.create(
            product=gl_product, parent_account=loan_parent,
            default_interest_rate=Decimal('10.00'), interest_calculation_method='flat',
            min_loan_amount=Decimal('1000.00'), max_loan_amount=Decimal('500000.00'),
            owner=self.user, branch=self.source,
        )
        client = Client.objects.create(
            client_id='CLI-JANE', first_name='Jane', last_name='Doe',
            gender='female', phone_primary='08010000005',
            tenant=self.tenant, owner=self.user, branch=self.source,
        )
        self.real_account = Account.objects.create(
            branch=self.source, tenant=self.tenant, owner=self.user, created_by=self.user,
            code='1193', name='Jane Doe - Monthly Loan',
            account_level=Account.LEVEL_CHILD, account_type=Account.LOAN, parent=loan_parent,
        )
        self.real_loan = LoanAccount.objects.create(
            client=client, product=loan_product, account=self.real_account,
            loan_number='LN-JANE-1', requested_amount=Decimal('10000.00'),
            interest_rate=Decimal('10.00'), term_months=2,
            repayment_frequency='monthly', status='pending',
            owner=self.user, branch=self.source,
        )

        # ── The leftover: same code, in the TARGET branch, not linked to
        #    anything — exactly what the old buggy clone would have created. ──
        target_loan_parent = Account.objects.create(
            branch=self.target, tenant=self.tenant, owner=self.user, created_by=self.user,
            code='1300', name='Customer Loan Portfolio',
            account_level=Account.LEVEL_PARENT, account_type=Account.LOAN,
        )
        self.leftover_account = Account.objects.create(
            branch=self.target, tenant=self.tenant, owner=self.user, created_by=self.user,
            code='1193', name='Jane Doe - Monthly Loan',
            account_level=Account.LEVEL_CHILD, account_type=Account.LOAN, parent=target_loan_parent,
        )

        # ── An unrelated, genuinely orphaned account with no corroborating
        #    in-use match anywhere — must be reported, never auto-deleted. ──
        asset_parent = Account.objects.create(
            branch=self.target, tenant=self.tenant, owner=self.user, created_by=self.user,
            code='1000', name='Cash and Cash Equivalents',
            account_level=Account.LEVEL_PARENT, account_type=Account.ASSET,
        )
        self.unconfirmed_account = Account.objects.create(
            branch=self.target, tenant=self.tenant, owner=self.user, created_by=self.user,
            code='9999', name='Mystery Account',
            account_level=Account.LEVEL_CHILD, account_type=Account.ASSET, parent=asset_parent,
        )

        # ── A real, correctly-cloned category-level GL account: looks just
        #    like a leftover by code/name (matches _in_use_ids for a fake
        #    same-code LoanAccount elsewhere), but is still an IncomeCategory's
        #    income_account in the target branch — must never be touched. ──
        from incomes.models import IncomeCategory

        # Force the old (pre-config-check) corroboration signal to also fire
        # for code '4211', proving the config-reference check is what
        # actually protects this account, not just an absence of corroboration.
        corroborating_client = Client.objects.create(
            client_id='CLI-COR', first_name='Cor', last_name='Roboration',
            gender='male', phone_primary='08010000006',
            tenant=self.tenant, owner=self.user, branch=self.source,
        )
        corroborating_account = Account.objects.create(
            branch=self.source, tenant=self.tenant, owner=self.user, created_by=self.user,
            code='4211', name='Loan Penalty (2026) - source copy',
            account_level=Account.LEVEL_CHILD, account_type=Account.LOAN, parent=loan_parent,
        )
        LoanAccount.objects.create(
            client=corroborating_client, product=loan_product, account=corroborating_account,
            loan_number='LN-COR-1', requested_amount=Decimal('5000.00'),
            interest_rate=Decimal('10.00'), term_months=2,
            repayment_frequency='monthly', status='pending',
            owner=self.user, branch=self.source,
        )

        income_parent = Account.objects.create(
            branch=self.target, tenant=self.tenant, owner=self.user, created_by=self.user,
            code='4200', name='Penalty Income',
            account_level=Account.LEVEL_PARENT, account_type=Account.INCOME,
        )
        self.config_referenced_account = Account.objects.create(
            branch=self.target, tenant=self.tenant, owner=self.user, created_by=self.user,
            code='4211', name='Loan Penalty (2026)',
            account_level=Account.LEVEL_CHILD, account_type=Account.INCOME, parent=income_parent,
        )
        IncomeCategory.objects.create(
            branch=self.target, tenant=self.tenant, owner=self.user, created_by=self.user,
            name='Loan Penalty', code='PEN', income_account=self.config_referenced_account,
        )

    def _run_command(self, *args):
        from io import StringIO
        from django.core.management import call_command
        out = StringIO()
        call_command('clean_up_branch_clone_orphaned_accounts', *args, stdout=out)
        return out.getvalue()

    def test_dry_run_reports_but_does_not_delete(self):
        from accounts.models import Account

        output = self._run_command('--target-branch', str(self.target.pk))

        self.assertIn('1193', output)
        self.assertIn('4211', output)
        self.assertIn('Dry run only', output)

        self.leftover_account.refresh_from_db()
        self.unconfirmed_account.refresh_from_db()
        self.config_referenced_account.refresh_from_db()
        self.assertFalse(self.leftover_account.is_deleted)
        self.assertFalse(self.unconfirmed_account.is_deleted)
        self.assertFalse(self.config_referenced_account.is_deleted)

    def test_apply_removes_only_the_confirmed_leftover(self):
        self._run_command('--target-branch', str(self.target.pk), '--apply')

        self.leftover_account.refresh_from_db()
        self.unconfirmed_account.refresh_from_db()
        self.real_account.refresh_from_db()
        self.config_referenced_account.refresh_from_db()

        self.assertTrue(self.leftover_account.is_deleted)
        self.assertFalse(self.unconfirmed_account.is_deleted)
        self.assertFalse(self.real_account.is_deleted)  # source branch's real account untouched
        # Real branch config (IncomeCategory.income_account) protects this
        # even though its code isn't corroborated by any per-entity model.
        self.assertFalse(self.config_referenced_account.is_deleted)

    def test_lookup_by_branch_code_also_works(self):
        output = self._run_command('--target-branch', self.target.code, '--apply')
        self.assertIn('Soft-deleted 1', output)
        self.leftover_account.refresh_from_db()
        self.assertTrue(self.leftover_account.is_deleted)
