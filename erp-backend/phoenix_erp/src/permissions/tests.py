from django.core.management import call_command
from django.test import TestCase

from pages.models import Module, ModulePage


class FixModuleCatalogDuplicatesTests(TestCase):
    """
    fix_module_catalog_duplicates merges duplicate Module rows (same code,
    created under different owner/branch by the pre-fix tenant-scoping bug)
    into one canonical row, hard-deleting the rest. ModulePage.module
    CASCADEs on delete, so any page living only on a duplicate-to-be-deleted
    module — with no same-code counterpart on the surviving module, e.g. a
    per-account transaction/report page generated just once — must be
    repointed to the canonical module first or it's silently destroyed.
    """

    def setUp(self):
        self.canonical_module = Module.objects.create(
            code='accounts', name='Accounts', icon='book',
        )
        self.duplicate_module = Module.objects.create(
            code='accounts', name='Accounts (dup)', icon='book',
            owner=None, branch=None,
        )
        # unique_together is (owner, branch, code) — give the duplicate a
        # distinct owner so both rows can exist side by side, matching how
        # the real bug produced them (different owner/branch, same code).
        from django.contrib.auth import get_user_model
        User = get_user_model()
        self.other_owner = User.objects.create_user(username='dup_owner', password='test123')
        self.duplicate_module.owner = self.other_owner
        self.duplicate_module.save(update_fields=['owner'])

    def test_singleton_page_on_duplicate_module_is_repointed_not_deleted(self):
        orphan_prone_page = ModulePage.objects.create(
            module=self.duplicate_module, code='1130_transaction',
            title='Bank Account - Payroll Transaction', page_type='form',
            page_config={'form_schema_id': 1, 'submitEndpoint': '/api/form-submissions/', 'successUrl': '/x'},
        )

        call_command('fix_module_catalog_duplicates', code='accounts', fix=True)

        self.assertFalse(Module.objects.filter(pk=self.duplicate_module.pk).exists())
        self.assertTrue(Module.objects.filter(pk=self.canonical_module.pk).exists())

        orphan_prone_page.refresh_from_db()
        self.assertEqual(orphan_prone_page.module_id, self.canonical_module.id)

    def test_same_code_pages_on_both_modules_are_merged_into_canonical(self):
        canonical_page = ModulePage.objects.create(
            module=self.canonical_module, code='chart-of-accounts',
            title='Chart of Accounts', page_type='list', page_config={'entity': 'Account', 'columns': []},
        )
        duplicate_page = ModulePage.objects.create(
            module=self.duplicate_module, code='chart-of-accounts',
            title='Chart of Accounts (dup)', page_type='list', page_config={'entity': 'Account', 'columns': []},
            # Both modules share code='accounts', so the auto-generated
            # url_path (/{module.code}/{page.code}/) would collide with
            # canonical_page's — set one explicitly, matching how
            # seed_permissions._seed_pages() itself works around this same
            # collision in practice (get_or_create + IntegrityError fallback).
            url_path='/accounts-dup/chart-of-accounts/',
        )

        call_command('fix_module_catalog_duplicates', code='accounts', fix=True)

        self.assertFalse(ModulePage.objects.filter(pk=duplicate_page.pk).exists())
        canonical_page.refresh_from_db()
        self.assertEqual(canonical_page.module_id, self.canonical_module.id)

    def test_report_only_mode_makes_no_changes(self):
        ModulePage.objects.create(
            module=self.duplicate_module, code='1130_transaction',
            title='Bank Account - Payroll Transaction', page_type='form',
            page_config={'form_schema_id': 1, 'submitEndpoint': '/api/form-submissions/', 'successUrl': '/x'},
        )

        call_command('fix_module_catalog_duplicates', code='accounts')  # no --fix

        self.assertTrue(Module.objects.filter(pk=self.duplicate_module.pk).exists())
        self.assertTrue(ModulePage.objects.filter(code='1130_transaction').exists())
