from django.apps import AppConfig


class PortalConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'portal'
    verbose_name = 'Customer portal'
    # Permission pages ("Loans → Online Applications", "Clients → Online Portal
    # Access") come from the frontend permission registry
    # (erp-frontend/src/config/permissionRegistry.ts). The Permission Setup
    # screen creates them automatically when an admin opens it, so nothing
    # needs running on the server. (The legacy seed_permissions command
    # fails on databases with per-tenant catalog duplicates, so it isn't used.)
