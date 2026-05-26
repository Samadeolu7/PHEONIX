# inventory/urls.py
"""
INVENTORY API ROUTES - ORGANIZED HIERARCHY

Core Structure:
  /inventory/
    ├── items/                     # Master inventory records
    │   ├── {id}/stock/           # Stock levels per location (nested)
    │   ├── {id}/movements/       # Movement history (nested)
    │   ├── {id}/valuation/       # Cost layers & valuation (nested)
    │   └── {id}/allocations/     # Item allocations (nested)
    ├── categories/                # Item categories
    ├── locations/                 # Warehouse/store locations
    ├── invoices/                  # Sales invoices
    │   └── {id}/credit-notes/    # Credit notes for returns (nested)
    └── redemptions/               # Allocation redemptions

Key Concepts:
- InventoryItem = Master data (WHAT the item is)
- InventoryStock = Quantities per location (HOW MUCH, WHERE)
- StockMovement = Audit trail (WHEN, WHY quantities changed)

Always use InventoryService for stock operations to ensure
proper accounting entries and audit trail.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_nested import routers
from .views import (
    InventoryCategoryViewSet, InventoryItemViewSet, LocationViewSet,
    InventoryStockViewSet, StockMovementViewSet,
    StockAdjustmentViewSet, StockTransferViewSet,
    InventoryAllocationViewSet, AllocationRedemptionViewSet,
    AssetUsageLogViewSet, InventoryCostLayerViewSet,
    CostLayerConsumptionViewSet, ItemValuationViewSet,
    WriteOffRequestViewSet, SalesOrderViewSet, PendingApprovalsViewSet,
    PhysicalCountViewSet, PhysicalCountLineViewSet
)
from .views_initial_stock_import import InitialStockImportViewSet
from .views_invoice import InvoiceViewSet
from .views_credit_note import CreditNoteViewSet, CreditNoteItemViewSet
from .views_material_request import MaterialRequestViewSet
from .views_office_use_request import OfficeUseRequestViewSet
from .views_ledger import InventoryLedgerViewSet

# ================================================================
# MAIN ROUTES
# ================================================================
router = DefaultRouter()

# Core Resources (Master Data)
router.register(r'categories', InventoryCategoryViewSet, basename='category')
router.register(r'items', InventoryItemViewSet, basename='item')
router.register(r'locations', LocationViewSet, basename='location')

# Sales & Returns
router.register(r'invoices', InvoiceViewSet, basename='invoice')
router.register(r'credit-notes', CreditNoteViewSet, basename='creditnote')

# Material Requests
router.register(r'material-requests', MaterialRequestViewSet, basename='material-request')

# Office Use Requests
router.register(r'office-use-requests', OfficeUseRequestViewSet, basename='office-use-request')

# Ledger Reports
router.register(r'ledger', InventoryLedgerViewSet, basename='inventory-ledger')

# Allocations & Redemptions
router.register(r'allocations', InventoryAllocationViewSet, basename='allocation')
router.register(r'redemptions', AllocationRedemptionViewSet, basename='redemption')

# Stock Operations
router.register(r'adjustments', StockAdjustmentViewSet, basename='adjustment')
router.register(r'transfers', StockTransferViewSet, basename='transfer')
router.register(r'writeoffs', WriteOffRequestViewSet, basename='writeoff')
router.register(r'sales-orders', SalesOrderViewSet, basename='salesorder')

# Physical Counts & Variance Reports
router.register(r'physical-counts', PhysicalCountViewSet, basename='physical-count')
router.register(r'physical-count-lines', PhysicalCountLineViewSet, basename='physical-count-line')

# Initial Inventory Stock Import (Opening Balances)
router.register(r'initial-stock-import', InitialStockImportViewSet, basename='initial-stock-import')

# Unified Approval Dashboard
router.register(r'pending-approvals', PendingApprovalsViewSet, basename='pending-approvals')

# Asset Tracking
router.register(r'asset-usage-logs', AssetUsageLogViewSet, basename='asset-usage')

# ================================================================
# NESTED ROUTES - Item-specific operations
# ================================================================
# /items/{item_id}/stock/ - Stock levels at different locations
items_router = routers.NestedDefaultRouter(router, r'items', lookup='item')
items_router.register(r'stock', InventoryStockViewSet, basename='item-stock')
items_router.register(r'movements', StockMovementViewSet, basename='item-movements')
items_router.register(r'cost-layers', InventoryCostLayerViewSet, basename='item-cost-layers')
items_router.register(r'allocations', InventoryAllocationViewSet, basename='item-allocations')

# /invoices/{invoice_id}/credit-notes/ - Credit notes for specific invoice
invoices_router = routers.NestedDefaultRouter(router, r'invoices', lookup='invoice')
invoices_router.register(r'credit-notes', CreditNoteViewSet, basename='invoice-credit-notes')

# ================================================================
# URL PATTERNS
# ================================================================
urlpatterns = [
    # Specific named paths MUST come before router.urls to prevent the
    # router's items/{pk}/ pattern from swallowing them as a pk lookup.
    path('items/valuation-report/', ItemValuationViewSet.as_view({'get': 'valuation_report'}), name='valuation-report'),

    # Main routes
    path('', include(router.urls)),
    
    # Nested routes
    path('', include(items_router.urls)),
    path('', include(invoices_router.urls)),

    # Standalone endpoints (for backward compatibility)
    path('stock/', InventoryStockViewSet.as_view({'get': 'list'}), name='stock-list'),
    path('stock/<int:pk>/', InventoryStockViewSet.as_view({'get': 'retrieve', 'patch': 'partial_update'}), name='stock-detail'),
    path('movements/', StockMovementViewSet.as_view({'get': 'list'}), name='movements-list'),
    path('credit-note-items/', CreditNoteItemViewSet.as_view({'get': 'list'}), name='creditnoteitem-list'),
]
