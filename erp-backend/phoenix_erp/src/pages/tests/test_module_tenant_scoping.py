"""
Module/ModulePage previously forced tenant=None on every save, intending
to be a global, non-tenant-scoped catalog — but Module.objects/
ModulePage.objects (OwnerBranchManager) filters by tenant on every query,
so that override actually made rows invisible rather than "global." Worse,
TimeStampedModel.save()'s own tenant-stamping fallback silently re-filled
tenant whenever a real request context existed, so the override only
"worked" (producing a genuinely NULL tenant) for rows created outside a
request — e.g. via a management command — which then vanished from the
admin-all catalog endpoint. See pages/migrations/0005_backfill_module_page_tenant.py
for the one-time data fix; these tests cover the save() behavior itself.
"""
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

from common.managers import set_current_tenant
from pages.models import Module, ModulePage
from users.models import Tenant


class ModuleTenantScopingTests(TestCase):

    def setUp(self):
        self.tenant = Tenant.objects.create(name='Scoping Test Org', slug='scoping-test-org')
        self.addCleanup(set_current_tenant, None)

    def test_module_is_stamped_with_current_tenant_on_create(self):
        set_current_tenant(self.tenant)
        module = Module.objects.create(code='widgets', name='Widgets', icon='box')
        self.assertEqual(module.tenant_id, self.tenant.id)

    def test_module_visible_via_default_manager_once_tenant_matches(self):
        set_current_tenant(self.tenant)
        Module.objects.create(code='widgets', name='Widgets', icon='box')

        # Module.objects (OwnerBranchManager) filters by the current
        # thread-local tenant — this is the exact query admin_all() runs.
        self.assertTrue(Module.objects.filter(code='widgets').exists())

    def test_module_page_is_stamped_with_current_tenant_on_create(self):
        set_current_tenant(self.tenant)
        module = Module.objects.create(code='widgets', name='Widgets', icon='box')
        page = ModulePage.objects.create(
            module=module, code='list', title='Widget List', page_type='list',
            page_config={'entity': 'Widget', 'columns': []},
        )
        self.assertEqual(page.tenant_id, self.tenant.id)

    def test_module_created_with_no_current_tenant_stays_null(self):
        # Mirrors a management command run with no request context (no
        # thread-local tenant set) — matches TimeStampedModel.save()'s
        # documented fallback behavior for every other model in the app,
        # not a special case for Module/ModulePage.
        set_current_tenant(None)
        module = Module.objects.create(code='orphan', name='Orphan', icon='box')
        self.assertIsNone(module.tenant_id)


class BackfillModuleTenantCommandTests(TestCase):
    """
    backfill_module_tenant is the re-runnable counterpart to migration 0005
    — needed because later steps in the catalog-seeding sequence
    (seed_permissions, fix_module_catalog_duplicates --fix) reintroduce
    tenant=NULL rows after the one-time migration already ran.
    """

    def setUp(self):
        # users/migrations/0002_setup_default_tenant.py seeds one default
        # Tenant into every fresh database (including the test DB), so the
        # "exactly one tenant" precondition is already satisfied — reuse it
        # rather than deleting it (a cascading delete across every
        # tenant-scoped table is both slow and, on a --keepdb database with
        # any migration drift, liable to hit unrelated broken tables).
        self.tenant = Tenant.objects.get()
        self.addCleanup(set_current_tenant, None)

    def test_sets_tenant_on_null_rows_unconditionally(self):
        # Postgres FK integrity means a module can only ever point at a
        # tenant that currently exists — with exactly one Tenant row (the
        # precondition this command enforces), the only way an existing
        # row's tenant can disagree with it is NULL. The update itself is
        # unconditional (not filtered to tenant__isnull=True), matching
        # "force it even if it currently has a different value."
        set_current_tenant(None)
        orphan_module = Module.objects.create(code='orphan', name='Orphan', icon='box')

        call_command('backfill_module_tenant')

        orphan_module.refresh_from_db()
        self.assertEqual(orphan_module.tenant_id, self.tenant.id)

    def test_refuses_when_more_than_one_tenant_exists(self):
        Tenant.objects.create(name='Second Org', slug='second-org')

        with self.assertRaises(CommandError):
            call_command('backfill_module_tenant')
