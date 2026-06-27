from django.core.management.base import BaseCommand
from django.db import transaction
from users.models import Tenant, Role

# Approval codes that Supervisor is NOT allowed to perform.
# Supervisor sees and can initiate everything but cannot give final approval
# on financial and sensitive HR decisions — those require Branch Manager or Director.
SUPERVISOR_EXCLUDED_PERMISSIONS = [
    "loan-approve",
    "loan-reject",
    "loan-disbursement-approve",
    "pr-approve",
    "pr-reject",
    "write-off-approve",
    "bank-approve",
    "leave-request-approve",
    "consumption-approve",
]

# Permissions granted to Credit Officer — client, loan, and savings operations only.
CREDIT_OFFICER_PERMISSIONS = [
    # Clients
    "client-list",
    "client-create",
    "client-edit",
    "client-view-detail",
    # Loans
    "loan-list",
    "loan-create",
    "loan-edit",
    "loan-view-detail",
    "loan-disbursement-list",
    # Savings
    "savings-list",
    "savings-create",
    # Cash management
    "cash-management-list",
    "cash-management-create",
    # Visibility
    "report-list",
    "dashboard-view",
]

# Permissions granted to Registrar — client registration and basic savings/cash only.
REGISTRAR_PERMISSIONS = [
    # Clients
    "client-list",
    "client-create",
    "client-view-detail",
    # Savings
    "savings-list",
    "savings-create",
    # Cash management
    "cash-management-list",
    "cash-management-create",
    # Visibility
    "dashboard-view",
]

ROLES = [
    {
        "value": "Director",
        "label": "Director",
        "color": "#1e40af",
        "permission_codes": ["*"],
        "excluded_permission_codes": [],
    },
    {
        "value": "Branch Manager",
        "label": "Branch Manager",
        "color": "#059669",
        "permission_codes": ["*"],
        # Branch Manager has full authority within their branch — no approval exclusions.
        "excluded_permission_codes": [],
    },
    {
        "value": "Supervisor",
        "label": "Supervisor",
        "color": "#7c3aed",
        "permission_codes": ["*"],
        # Supervisor can initiate and manage everything but cannot give final approvals.
        "excluded_permission_codes": SUPERVISOR_EXCLUDED_PERMISSIONS,
    },
    {
        "value": "Credit Officer",
        "label": "Credit Officer",
        "color": "#0891b2",
        "permission_codes": CREDIT_OFFICER_PERMISSIONS,
        "excluded_permission_codes": [],
    },
    {
        "value": "Registrar",
        "label": "Registrar",
        "color": "#ea580c",
        "permission_codes": REGISTRAR_PERMISSIONS,
        "excluded_permission_codes": [],
    },
]


class Command(BaseCommand):
    help = "Create default role entries for a tenant or all tenants."

    def add_arguments(self, parser):
        parser.add_argument(
            "--tenant",
            "-t",
            dest="tenant_slug",
            help="Tenant slug to create roles for (use --all to target every tenant)",
            required=False,
        )
        parser.add_argument(
            "--all",
            action="store_true",
            dest="all_tenants",
            help="Create roles for all tenants",
        )

    def handle(self, *args, **options):
        tenant_slug = options.get("tenant_slug")
        all_tenants = options.get("all_tenants")

        if not all_tenants and not tenant_slug:
            self.stdout.write(self.style.ERROR("Provide --tenant <slug> or --all"))
            return

        if all_tenants:
            tenants = Tenant.objects.all()
        else:
            try:
                tenants = [Tenant.objects.get(slug=tenant_slug)]
            except Tenant.DoesNotExist:
                self.stdout.write(self.style.ERROR(f"Tenant with slug '{tenant_slug}' not found."))
                return

        created_total = 0
        updated_total = 0

        for tenant in tenants:
            with transaction.atomic():
                self.stdout.write(self.style.NOTICE(f"Processing tenant: {tenant.name} ({tenant.slug})"))
                for role_def in ROLES:
                    name = role_def["value"]
                    color = role_def.get("color")
                    perm_codes = role_def.get("permission_codes", [])
                    excluded_codes = role_def.get("excluded_permission_codes", [])

                    defaults = {
                        "description": f"Auto-created role. UI color: {color}",
                        "is_active": True,
                        "permission_codes": perm_codes,
                        "excluded_permission_codes": excluded_codes,
                    }

                    role, created = Role.objects.get_or_create(
                        tenant=tenant,
                        name=name,
                        defaults=defaults,
                    )

                    if created:
                        created_total += 1
                        self.stdout.write(self.style.SUCCESS(f"  Created role '{name}' for tenant '{tenant.slug}'"))
                    else:
                        updated_fields = []
                        if role.description is None or color not in (role.description or ""):
                            role.description = defaults["description"]
                            updated_fields.append("description")
                        if role.permission_codes != perm_codes:
                            role.permission_codes = perm_codes
                            updated_fields.append("permission_codes")
                        if role.excluded_permission_codes != excluded_codes:
                            role.excluded_permission_codes = excluded_codes
                            updated_fields.append("excluded_permission_codes")
                        if updated_fields:
                            role.save(update_fields=updated_fields)
                            updated_total += 1
                            self.stdout.write(self.style.SUCCESS(f"  Updated role '{name}' for tenant '{tenant.slug}'"))
                        else:
                            self.stdout.write(self.style.WARNING(f"  Role '{name}' already up-to-date for tenant '{tenant.slug}'"))

        self.stdout.write(self.style.SUCCESS(f"\nDone. Created: {created_total}, Updated: {updated_total}"))
