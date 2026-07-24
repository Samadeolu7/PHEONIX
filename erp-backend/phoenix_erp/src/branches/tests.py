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
