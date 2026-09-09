"""
Shared helper for data migrations that register new permission-catalog rows
(Module / ModulePage / PageAction).

Why this exists: `permissions.management.commands.seed_permissions` seeds
this same catalog, but it's a manual command someone has to remember to run
after deploying — easy to forget, and it updates every module at once so a
single small feature's catalog entry can't be reviewed on its own. A data
migration ships automatically with `manage.py migrate` (which every deploy
already runs) and is scoped to just the feature it's added for, so its diff
is reviewable in the same PR as the model change it supports.

Usage from a migration:

    from pages.migration_helpers import seed_catalog

    def add_my_page(apps, schema_editor):
        Module = apps.get_model('pages', 'Module')
        ModulePage = apps.get_model('pages', 'ModulePage')
        PageAction = apps.get_model('pages', 'PageAction')
        seed_catalog(
            Module, ModulePage, PageAction,
            modules=[('hr', 'HR', 'UserCheck', 8)],
            pages=[('hr', 'my-page', 'My Page', 'list', 99)],
            actions=[('hr', 'my-page', 'my-page-list', 'List My Page', 'view')],
        )

    class Migration(migrations.Migration):
        operations = [migrations.RunPython(add_my_page, migrations.RunPython.noop)]

Notes:
  - Model classes MUST come from `apps.get_model()` inside the migration's
    RunPython function, never imported directly — a migration has to work
    against the historical model shape, not whatever the model looks like
    today.
  - Every write is get_or_create: an existing row (and any
    RolePermissionPolicy already pointing at it) is never touched. It's
    always safe to re-list a module/page that a previous migration already
    created — the second migration's get_or_create is just a no-op for it.
  - Rows are created with tenant left unset (NULL). That's intentional and
    matches how `seed_permissions` behaves when run as a bare command with
    no request context: PermissionResolver's bulk matrix explicitly treats
    NULL-tenant catalog rows as visible to every tenant (see
    pages/migrations/0005_backfill_module_page_tenant.py and
    permissions/services.py's `resolve_bulk_matrix`), and the single-page
    resolve() path used by the API permission check doesn't filter by
    tenant on ModulePage/Module at all. There is nothing further to stamp.
  - This only creates catalog rows (what a role *could* be granted). It
    never creates RolePermissionPolicy rows, so it can't change what any
    existing role can already do — a newly-added page starts out denied for
    roles that have other policies configured (see PermissionResolver
    fail-closed behaviour) until an admin explicitly grants it from the
    Permission Setup UI, or allowed for roles still in legacy mode (no
    policies configured at all yet). Either way, nothing already granted
    changes.
"""


def seed_catalog(Module, ModulePage, PageAction, *, modules=(), pages=(), actions=()):
    """
    modules: iterable of (code, name, icon, order)
    pages:   iterable of (module_code, page_code, title, page_type, order)
    actions: iterable of (module_code, page_code, action_code, action_name, action_type)

    Always list the owning module/page even if an earlier migration already
    created it — get_or_create makes the repeat a no-op, and this migration
    then works standalone without depending on the other one having run.
    """
    module_map = {}
    for code, name, icon, order in modules:
        obj, _ = Module.objects.get_or_create(
            owner=None, branch=None, code=code,
            defaults=dict(name=name, icon=icon, order=order, is_active=True),
        )
        module_map[code] = obj

    page_map = {}
    for mod_code, page_code, title, page_type, order in pages:
        module = module_map.get(mod_code)
        if module is None:
            continue
        obj, _ = ModulePage.objects.get_or_create(
            module=module, code=page_code,
            defaults=dict(
                title=title, page_type=page_type, order=order, is_active=True,
                url_path=f'/{mod_code}/{page_code}/', page_config={},
            ),
        )
        page_map[(mod_code, page_code)] = obj

    for mod_code, page_code, action_code, action_name, action_type in actions:
        module = module_map.get(mod_code)
        page = page_map.get((mod_code, page_code))
        if module is None:
            continue
        PageAction.objects.get_or_create(
            module=module, page=page, code=action_code,
            defaults=dict(name=action_name, action_type=action_type, is_active=True),
        )
