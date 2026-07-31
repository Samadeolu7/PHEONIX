# inventory/services/item_linking.py
"""
Resolves the destination branch's own InventoryItem for a stock transfer,
auto-linking by SKU or auto-creating a new item there when it doesn't
already exist.

InventoryItem is branch-scoped in this codebase (unique_together =
('branch', 'sku')) — there is no shared, tenant-wide catalog. SKU is the
cross-branch identity key, the same convention
BranchCloneService._clone_inventory_items already uses when duplicating a
branch's catalog.
"""


def resolve_or_create_destination_item(source_item, destination_branch, owner, user):
    """
    Find the destination branch's InventoryItem matching source_item's SKU,
    or create one there (copying master-data fields from source_item as a
    starting point). Returns the destination InventoryItem.
    """
    from ..models import InventoryItem

    existing = InventoryItem.objects.filter(
        branch=destination_branch, sku=source_item.sku, is_deleted=False
    ).first()
    if existing:
        return existing

    category = _resolve_or_create_destination_category(
        source_item.category, destination_branch, owner
    )

    return InventoryItem.objects.create(
        name=source_item.name,
        sku=source_item.sku,
        barcode=source_item.barcode,
        description=source_item.description,
        category=category,
        unit_of_measure=source_item.unit_of_measure,
        cost_price=source_item.cost_price,
        selling_price=source_item.selling_price,
        minimum_selling_price=source_item.minimum_selling_price,
        valuation_method=source_item.valuation_method,
        reorder_level=source_item.reorder_level,
        reorder_quantity=source_item.reorder_quantity,
        is_active=source_item.is_active,
        is_sellable=source_item.is_sellable,
        is_purchasable=source_item.is_purchasable,
        track_serial_numbers=source_item.track_serial_numbers,
        track_batch_numbers=source_item.track_batch_numbers,
        track_expiry=source_item.track_expiry,
        owner=owner,
        branch=destination_branch,
        tenant=destination_branch.tenant,
    )


def _resolve_or_create_destination_category(source_category, destination_branch, owner):
    """
    Find the destination branch's InventoryCategory matching source_category's
    code, or create one there. A brand-new category needs its own GL
    accounts — never the source branch's — provisioned via the canonical
    SYSTEM_ACCOUNTS registry (accounts/utils/account_creation.py), the same
    one used to fall back a missing inventory_account during GRN posting
    (see inventory/stock_service.py's ProcurementService.post_grn).
    """
    from ..models import InventoryCategory
    from accounts.utils.account_creation import get_system_account

    existing = InventoryCategory.objects.filter(
        branch=destination_branch, code=source_category.code, is_deleted=False
    ).first()
    if existing:
        return existing

    inventory_account = get_system_account(
        'inventory', owner=owner, branch=destination_branch
    )
    cogs_account = get_system_account(
        'cogs', owner=owner, branch=destination_branch
    )

    return InventoryCategory.objects.create(
        name=source_category.name,
        code=source_category.code,
        description=source_category.description,
        item_type=getattr(source_category, 'item_type', ''),
        inventory_account=inventory_account,
        cogs_account=cogs_account,
        owner=owner,
        branch=destination_branch,
        tenant=destination_branch.tenant,
    )
