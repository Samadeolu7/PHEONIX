import logging

from django.apps import AppConfig
from django.db.models.signals import post_migrate

logger = logging.getLogger('portal')

# Permission pages this app needs in the Permission Setup screen.
REQUIRED_PAGES = [('loans', 'online-loan-applications'), ('clients', 'portal-invitations')]


def ensure_permission_pages(sender, **kwargs):
    """
    After every `migrate` (which the deploy already runs), make sure the
    portal's permission pages exist, so nobody has to run seed_permissions
    on the server. Cheap no-op when they're already there; never fails a
    deploy.
    """
    if sender.name != 'portal':
        return
    try:
        from pages.models import ModulePage
        missing = [
            (m, p) for (m, p) in REQUIRED_PAGES
            if not ModulePage.all_objects.filter(module__code=m, code=p).exists()
        ]
        if not missing:
            return
        import io
        from django.core.management import call_command
        call_command('seed_permissions', stdout=io.StringIO())
        logger.info('Seeded permission catalog (was missing %s)', missing)
    except Exception:
        logger.exception('Could not seed portal permission pages; run seed_permissions manually')


class PortalConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'portal'
    verbose_name = 'Customer portal'

    def ready(self):
        post_migrate.connect(ensure_permission_pages, sender=self)
