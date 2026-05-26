from django.contrib import admin, messages
from django.db import transaction
from .models import Client, ClientNote


def fix_orphaned_clients(modeladmin, request, queryset):
    """Admin action: assign any NULL-tenant / NULL-branch clients to the
    single existing tenant and branch.  Safe only for single-tenant setups."""
    from users.models import Tenant
    from branches.models import Branch

    tenant_qs = Tenant.objects.all()
    branch_qs = Branch.objects.all_tenants().order_by('id')

    if tenant_qs.count() != 1:
        modeladmin.message_user(
            request,
            f"Expected exactly 1 tenant, found {tenant_qs.count()}. Aborted.",
            level=messages.ERROR,
        )
        return

    if not branch_qs.exists():
        modeladmin.message_user(request, "No branches found. Aborted.", level=messages.ERROR)
        return

    tenant = tenant_qs.first()
    branch = branch_qs.first()

    # Bypass tenant/branch scoping to see ALL non-deleted clients
    all_qs = Client.objects.all_tenants()

    with transaction.atomic():
        fixed_tenant = all_qs.filter(tenant__isnull=True).update(tenant=tenant)
        fixed_branch = all_qs.filter(branch__isnull=True).update(branch=branch)

    modeladmin.message_user(
        request,
        f"Fixed {fixed_tenant} client(s) missing tenant, "
        f"{fixed_branch} client(s) missing branch. "
        f"All clients are now assigned to '{tenant}' / '{branch}'.",
        level=messages.SUCCESS,
    )


fix_orphaned_clients.short_description = "Fix orphaned clients (assign missing tenant/branch)"


@admin.register(Client)
class ClientAdmin(admin.ModelAdmin):
    list_display = ('client_id', 'first_name', 'last_name', 'tenant', 'branch', 'status', 'usage_context', 'is_deleted')
    list_filter = ('tenant', 'branch', 'status', 'usage_context', 'is_deleted')
    search_fields = ('client_id', 'first_name', 'last_name', 'email', 'phone_primary')
    actions = [fix_orphaned_clients]

    def get_queryset(self, request):
        # Show ALL clients (including those with null tenant/branch) in the admin
        return Client.objects.all_tenants()


admin.site.register(ClientNote)

