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
  - A given module/page code can legitimately have MORE THAN ONE row in the
    database — one per tenant. Module/ModulePage/PageAction catalog rows are
    always created with owner=NULL and branch=NULL, which defeats their
    unique_together constraints at the database level (Postgres treats
    every NULL as distinct from every other NULL, so a UNIQUE constraint
    over columns that are NULL never actually rejects a "duplicate"). This
    is normal, not corruption — each tenant's Permission Setup UI needs its
    own row to grant against. Because of this, this helper NEVER assumes a
    code maps to a single row: it extends every existing Module row for a
    code, and only creates a brand new Module when literally none exist —
    it should not be inventing a tenant's HR module from scratch just
    because this migration is adding a sub-page to it.
  - ModulePage.url_path is a *global* unique field (not scoped per module or
    tenant), so when the same page code is being attached under several
    tenants' copies of a module, each gets a distinct url_path (the bare
    path for the first one, then path+pk for the rest) rather than
    colliding on insert.
  - Every write only creates rows that are missing; an existing row (and
    any RolePermissionPolicy already pointing at it) is never touched or
    overwritten. It's always safe to re-list a module/page that a previous
    migration already created — the repeat is just a no-op for it.
  - New rows are created with tenant left unset (NULL) themselves — only
    the Module/ModulePage FK chain ties a row to "a given tenant's copy" of
    the catalog. PermissionResolver's single-page resolve() path (used by
    the API permission check) matches purely on the `code` strings via FK
    traversal, not on tenant or row identity, so this doesn't affect
    enforcement — it only affects which literal row a given tenant's
    Permission Setup UI lists.
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
    created it — this is a no-op for it, and this migration then works
    standalone without depending on the other one having run.
    """
    # code -> list of every existing Module row for that code (usually one
    # per tenant; see module docstring for why more than one is normal).
    module_map: dict[str, list] = {}
    for code, name, icon, order in modules:
        existing = list(Module.objects.filter(owner=None, branch=None, code=code))
        if not existing:
            existing = [
                Module.objects.create(
                    owner=None, branch=None, code=code,
                    name=name, icon=icon, order=order, is_active=True,
                )
            ]
        module_map[code] = existing

    # (module_code, page_code) -> list of ModulePage rows, one per Module
    # instance in module_map[module_code].
    page_map: dict[tuple, list] = {}
    for mod_code, page_code, title, page_type, order in pages:
        rows = []
        for module in module_map.get(mod_code, []):
            obj = ModulePage.objects.filter(module=module, code=page_code).first()
            if obj is None:
                base_path = f'/{mod_code}/{page_code}/'
                url_path = base_path if not ModulePage.objects.filter(url_path=base_path).exists() \
                    else f'{base_path}{module.pk}/'
                obj = ModulePage.objects.create(
                    module=module, code=page_code,
                    title=title, page_type=page_type, order=order, is_active=True,
                    url_path=url_path, page_config={},
                )
            rows.append(obj)
        page_map[(mod_code, page_code)] = rows

    for mod_code, page_code, action_code, action_name, action_type in actions:
        pages_by_module_id = {p.module_id: p for p in page_map.get((mod_code, page_code), [])}
        for module in module_map.get(mod_code, []):
            page = pages_by_module_id.get(module.id)
            PageAction.objects.get_or_create(
                module=module, page=page, code=action_code,
                defaults=dict(name=action_name, action_type=action_type, is_active=True),
            )
