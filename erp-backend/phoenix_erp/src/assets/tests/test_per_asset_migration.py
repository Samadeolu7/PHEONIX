"""
Tests for per-asset GL sub-ledger tracking: assets.signals'
_provision_per_asset_accounts and the
migrate_category_to_per_asset_accounts management command.

Covers the central constraint that shapes this whole feature:
TransactionEntry.clean() permanently blocks direct postings to any account
once it becomes account_level=PARENT *and* has at least one child — so a
category must be migrated atomically (every asset together), and the
category's rollup balance must be byte-for-byte unchanged by the migration
(a pure reallocation, not a re-valuation).
"""
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase

from accounts.models import Account
from assets.models import AssetCategory, FixedAsset
from assets.services.depreciation import DepreciationService
from branches.models import Branch
from users.models import Tenant

User = get_user_model()


class PerAssetMigrationTestBase(TestCase):
    def setUp(self):
        from common.managers import set_current_tenant
        set_current_tenant(None)

        self.owner = User.objects.create_user(username='asset_mig_owner', password='pass')
        self.tenant = Tenant.objects.create(name='Asset Mig Tenant', slug='asset-mig-tenant', owner=self.owner)
        self.owner.tenant = self.tenant
        self.owner.save()

        self.branch = Branch.objects.create(name='Branch', code='ASMIG', tenant=self.tenant, owner=self.owner)
        self.owner.branch = self.branch
        self.owner.save()
        set_current_tenant(self.tenant)

        fixed_assets_parent = self._make_account('Fixed Assets', '1000', Account.ASSET, Account.LEVEL_PARENT)
        self.asset_account = self._make_account(
            'Vehicles', '1150', Account.ASSET, Account.LEVEL_CHILD, parent=fixed_assets_parent
        )
        accum_depr_parent = self._make_account('Accumulated Depreciation', '1500', Account.ASSET, Account.LEVEL_PARENT)
        self.accumulated_depreciation_account = self._make_account(
            'Accum. Depreciation — Vehicles', '1550', Account.ASSET, Account.LEVEL_CHILD, parent=accum_depr_parent
        )
        depr_expense_parent = self._make_account('Depreciation Expense', '5000', Account.EXPENSE, Account.LEVEL_PARENT)
        self.depreciation_account = self._make_account(
            'Depreciation — Vehicles', '5100', Account.EXPENSE, Account.LEVEL_CHILD, parent=depr_expense_parent
        )

        self.category = AssetCategory.objects.create(
            code='VEH', name='Vehicles',
            asset_account=self.asset_account,
            depreciation_account=self.depreciation_account,
            accumulated_depreciation_account=self.accumulated_depreciation_account,
            default_depreciation_method='straight_line', default_useful_life_years=5,
            owner=self.owner, branch=self.branch, tenant=self.tenant,
        )

        # Seed the shared category accounts with a real historical balance —
        # exactly as if assets had been purchased/depreciated the old way.
        self._post(self.asset_account, self._opening_equity(), Decimal('80000.00'))
        self._post(self.accumulated_depreciation_account, self._opening_equity(), Decimal('20000.00'), swap=True)

        self.asset1 = FixedAsset.objects.create(
            asset_number='AST-MIG-1', category=self.category, name='Van 1',
            purchase_price=Decimal('50000.00'), accumulated_depreciation=Decimal('12000.00'),
            purchase_date=date(2025, 1, 1), depreciation_start_date=date(2025, 1, 1),
            depreciation_method='straight_line', useful_life_years=5, status='active',
            owner=self.owner, branch=self.branch, tenant=self.tenant,
        )
        self.asset2 = FixedAsset.objects.create(
            asset_number='AST-MIG-2', category=self.category, name='Van 2',
            purchase_price=Decimal('30000.00'), accumulated_depreciation=Decimal('8000.00'),
            purchase_date=date(2025, 1, 1), depreciation_start_date=date(2025, 1, 1),
            depreciation_method='straight_line', useful_life_years=5, status='active',
            owner=self.owner, branch=self.branch, tenant=self.tenant,
        )

    def _opening_equity(self):
        if not hasattr(self, '_equity_account'):
            equity_parent = self._make_account('Equity', '3000', Account.EQUITY, Account.LEVEL_PARENT)
            self._equity_account = self._make_account(
                'Opening Balance Equity', '3001', Account.EQUITY, Account.LEVEL_CHILD, parent=equity_parent
            )
        return self._equity_account

    def _make_account(self, name, code, account_type, account_level, parent=None):
        return Account.objects.create(
            name=name, code=code, account_type=account_type, account_level=account_level,
            parent=parent, owner=self.owner, created_by=self.owner, branch=self.branch, tenant=self.tenant,
        )

    def _post(self, debit_account, credit_account, amount, swap=False):
        from transactions.models import Transaction, TransactionEntry, TransactionSeries

        series, _ = TransactionSeries.objects.get_or_create(code='OB', defaults={'description': 'Opening Balance'})
        txn = Transaction.objects.create(
            series=series, description='Opening balance', branch=self.branch,
            owner=self.owner, created_by=self.owner, tenant=self.tenant,
        )
        if swap:
            debit_account, credit_account = credit_account, debit_account
        TransactionEntry.objects.create(transaction=txn, account=debit_account, side=TransactionEntry.DEBIT, amount=amount)
        TransactionEntry.objects.create(transaction=txn, account=credit_account, side=TransactionEntry.CREDIT, amount=amount)
        txn.post()
        return txn


class SignalDoesNotFireBeforeMigrationTests(PerAssetMigrationTestBase):
    def test_new_asset_in_unmigrated_category_has_no_per_asset_account(self):
        self.asset1.refresh_from_db()
        self.assertIsNone(self.asset1.account_id)
        self.assertIsNone(self.asset1.accumulated_depreciation_account_id)


class CategoryMigrationDryRunTests(PerAssetMigrationTestBase):
    def test_dry_run_writes_nothing(self):
        call_command('migrate_category_to_per_asset_accounts', category_id=self.category.id, dry_run=True)

        self.asset_account.refresh_from_db()
        self.asset1.refresh_from_db()
        self.assertEqual(self.asset_account.account_level, Account.LEVEL_CHILD)
        self.assertFalse(self.asset_account.children.exists())
        self.assertIsNone(self.asset1.account_id)


class CategoryMigrationTests(PerAssetMigrationTestBase):
    def setUp(self):
        super().setUp()
        self.starting_cost_balance = Account.objects.get(pk=self.asset_account.pk).balance
        self.starting_depr_balance = Account.objects.get(pk=self.accumulated_depreciation_account.pk).balance
        call_command('migrate_category_to_per_asset_accounts', category_id=self.category.id)
        self.asset1.refresh_from_db()
        self.asset2.refresh_from_db()
        self.asset_account.refresh_from_db()
        self.accumulated_depreciation_account.refresh_from_db()

    def test_category_accounts_become_parent_level(self):
        self.assertEqual(self.asset_account.account_level, Account.LEVEL_PARENT)
        self.assertEqual(self.accumulated_depreciation_account.account_level, Account.LEVEL_PARENT)

    def test_each_asset_gets_its_own_accounts(self):
        self.assertIsNotNone(self.asset1.account_id)
        self.assertIsNotNone(self.asset1.accumulated_depreciation_account_id)
        self.assertIsNotNone(self.asset2.account_id)
        self.assertNotEqual(self.asset1.account_id, self.asset2.account_id)

    def test_per_asset_account_codes_match_their_real_parent(self):
        # Accounts are allocated under a temporary staging parent (e.g.
        # "1900-00001") before being re-parented to the real category
        # account ("1150") — the code must be reassigned at that point too,
        # exactly like loan/savings sub-ledger codes always reflect their
        # real parent, not a leftover staging prefix.
        self.assertTrue(self.asset1.account.code.startswith(f'{self.asset_account.code}-'))
        self.assertTrue(
            self.asset1.accumulated_depreciation_account.code.startswith(
                f'{self.accumulated_depreciation_account.code}-'
            )
        )
        self.assertNotEqual(self.asset1.account.code, self.asset2.account.code)

    def test_per_asset_balances_match_historical_figures(self):
        self.assertEqual(self.asset1.account.balance, Decimal('50000.00'))
        # accumulated_depreciation_account is ASSET-type (a contra-asset) —
        # in this system's sign convention that's debit-normal, so a credit
        # (its normal accounting direction) shows as negative, matching how
        # the shared category account was seeded in setUp.
        self.assertEqual(self.asset1.accumulated_depreciation_account.balance, Decimal('-12000.00'))
        self.assertEqual(self.asset2.account.balance, Decimal('30000.00'))
        self.assertEqual(self.asset2.accumulated_depreciation_account.balance, Decimal('-8000.00'))

    def test_category_rollup_balance_unchanged(self):
        self.assertEqual(self.asset_account.balance, self.starting_cost_balance)
        self.assertEqual(self.accumulated_depreciation_account.balance, self.starting_depr_balance)

    def test_no_staging_accounts_left_behind(self):
        self.assertFalse(Account.objects.filter(name__startswith='[migration staging]').exists())

    def test_subsequent_depreciation_posts_to_per_asset_account_not_category(self):
        # Pre-create the DEPR series to route around an unrelated pre-existing
        # bug: DepreciationService.generate_and_post_current_period's own
        # TransactionSeries.objects.get_or_create(..., defaults={'name': ...})
        # passes a 'name' key TransactionSeries has no such field for, which
        # only surfaces when the series doesn't already exist yet.
        from transactions.models import TransactionSeries
        TransactionSeries.objects.get_or_create(code='DEPR', defaults={'description': 'Depreciation'})

        entry = DepreciationService.generate_and_post_current_period(self.asset1, posted_by=self.owner)
        self.assertIsNotNone(entry)
        self.asset1.accumulated_depreciation_account.refresh_from_db()
        self.accumulated_depreciation_account.refresh_from_db()

        # Depreciation CREDITs accumulated depreciation — a debit-normal
        # ASSET-type (contra-asset) account, so a credit makes .balance more
        # negative, i.e. grows the (negative) accumulated depreciation.
        self.assertLess(self.asset1.accumulated_depreciation_account.balance, Decimal('-12000.00'))
        # The category parent's stored balance is kept live via
        # TransactionEntry.post()'s rollup, so it reflects the per-asset
        # child's new balance too — proving the new entry actually posted
        # through the per-asset account (not a stale, unrelated parent).
        self.assertEqual(
            self.accumulated_depreciation_account.balance,
            self.starting_depr_balance - entry.depreciation_amount,
        )

    def test_second_migration_run_is_a_noop(self):
        # Running again should find nothing left to migrate and not error.
        call_command('migrate_category_to_per_asset_accounts', category_id=self.category.id)
        self.asset_account.refresh_from_db()
        self.assertEqual(self.asset_account.children.count(), 2)


class MonthlyDepreciationTaskTests(PerAssetMigrationTestBase):
    """
    Regression test for a gap found during review: assets.tasks.
    post_monthly_depreciation is a separate, hand-rolled posting path (the
    Celery cron for monthly depreciation) that never called through
    DepreciationService — it had its own direct
    `account=asset.category.accumulated_depreciation_account` with no
    per-asset fallback, so it would have started failing every month for
    every asset in any migrated category.

    Deliberately does NOT subclass CategoryMigrationTests — that would
    re-run all of its test methods again under this class too.
    """
    def setUp(self):
        super().setUp()
        self.starting_depr_balance = Account.objects.get(pk=self.accumulated_depreciation_account.pk).balance
        call_command('migrate_category_to_per_asset_accounts', category_id=self.category.id)
        self.asset1.refresh_from_db()

    def test_monthly_depreciation_task_posts_to_per_asset_account(self):
        from assets.tasks import post_monthly_depreciation

        result = post_monthly_depreciation.apply().get()
        self.assertEqual(result['errors'], 0)
        self.assertGreaterEqual(result['processed'], 1)

        self.asset1.accumulated_depreciation_account.refresh_from_db()
        self.accumulated_depreciation_account.refresh_from_db()

        # Posted to the per-asset account (more negative — see the sign-
        # convention note on the other depreciation test above)...
        self.assertLess(self.asset1.accumulated_depreciation_account.balance, Decimal('-12000.00'))
        # ...and rolled up correctly into the (now-parent) category account,
        # proving the entry actually landed on the per-asset child, not a
        # rejected/silently-skipped posting against the sealed parent.
        self.assertLess(self.accumulated_depreciation_account.balance, self.starting_depr_balance)


class SignalFiresAfterMigrationTests(PerAssetMigrationTestBase):
    def test_new_asset_after_migration_gets_provisioned_automatically(self):
        call_command('migrate_category_to_per_asset_accounts', category_id=self.category.id)

        asset3 = FixedAsset.objects.create(
            asset_number='AST-MIG-3', category=self.category, name='Van 3',
            owner=self.owner, branch=self.branch, tenant=self.tenant,
        )
        asset3.refresh_from_db()
        self.assertIsNotNone(asset3.account_id)
        self.assertIsNotNone(asset3.accumulated_depreciation_account_id)
        self.assertEqual(asset3.account.parent_id, self.asset_account.id)


class SubledgerExclusionTests(PerAssetMigrationTestBase):
    def test_per_asset_accounts_excluded_from_generic_picker_by_default(self):
        call_command('migrate_category_to_per_asset_accounts', category_id=self.category.id)
        self.asset1.refresh_from_db()

        visible = Account.exclude_entity_subledgers(Account.objects.filter(branch=self.branch))
        visible_ids = set(visible.values_list('id', flat=True))
        self.assertNotIn(self.asset1.account_id, visible_ids)
        self.assertNotIn(self.asset1.accumulated_depreciation_account_id, visible_ids)
        # The category's own (now-parent) accounts are still a normal pick.
        self.assertIn(self.asset_account.id, visible_ids)
