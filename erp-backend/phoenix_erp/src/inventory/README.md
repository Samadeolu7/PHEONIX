# Inventory Module - Architecture & Usage

## 📋 Module Purpose

This module manages inventory items, stock levels, movements, sales, and returns with full double-entry accounting integration.

## 🎯 Design Principles

### Clear Separation of Concerns

1. **InventoryItem** = Master Product Data (WHAT)
   - Product catalog information
   - Pricing, categorization
   - Reorder settings
   - Valuation method

2. **InventoryStock** = Quantity Tracking (HOW MUCH, WHERE)
   - One record per item per location
   - Physical quantities, reservations
   - Average cost, total value

3. **StockMovement** = Audit Trail (WHEN, WHY)
   - Immutable history of all changes
   - Created automatically by InventoryService
   - Never created manually

### Why This Structure?

**Multi-Location Support:**
- One product (InventoryItem) can exist in many locations (InventoryStock records)
- Easy to track: "Where do I have stock of this item?"
- Simple queries: "What items are at this location?"

**Clean Audit Trail:**
- Every stock change recorded in StockMovement
- Complete history for compliance
- Links to source documents (PO, Invoice, etc.)

**Accounting Integration:**
- Category links to GL accounts
- Automatic journal entries for all movements
- Proper COGS calculation

## 📂 Module Structure

```
inventory/
├── models.py                      # Core models
├── models_credit_note.py          # Credit note models
├── serializers.py                 # Main serializers
├── serializers_invoice.py         # Invoice serializers
├── serializers_credit_note.py     # Credit note serializers
├── views.py                       # Main API endpoints
├── views_invoice.py               # Invoice endpoints
├── views_credit_note.py           # Credit note endpoints
├── urls.py                        # API route configuration
├── stock_service.py               # ✨ Stock operation service
├── services/
│   ├── accounting_service.py     # Accounting integration
│   ├── valuation_service.py      # Cost layer management
│   ├── pdf_service.py            # Invoice PDF generation
│   └── credit_note_pdf.py        # Credit note PDF generation
├── tests/                         # Test suite
├── INVENTORY_API_GUIDE.md        # 📚 Complete API documentation
└── README.md                      # This file
```

## 🔧 Core Service: InventoryService

**Location:** `inventory/stock_service.py`

**Purpose:** Centralized service for ALL stock operations

### Methods:

```python
# 1. Receive Stock (purchases, returns to supplier)
receive_stock(item, location, quantity, unit_cost, reference_number, **kwargs)

# 2. Reduce Stock (sales, damage, consumption)
reduce_stock(item, location, quantity, movement_type, reference_number, **kwargs)

# 3. Transfer Stock (between locations)
transfer_stock(item, from_location, to_location, quantity, reference_number, **kwargs)

# 4. Adjust Stock (corrections, cycle counts)
adjust_stock(item, location, adjustment_quantity, reason, reference_number, **kwargs)

# 5. Reserve Stock (for orders)
reserve_stock(item, location, quantity, reference_number, **kwargs)

# 6. Release Reservation (cancel orders)
release_reservation(item, location, quantity, reference_number, **kwargs)
```

### What Each Method Does:
✅ Updates InventoryStock quantities
✅ Creates StockMovement audit record
✅ Creates accounting journal entries
✅ Manages cost layers (FIFO/LIFO/Average)
✅ Validates sufficient stock
✅ Maintains data integrity

### Example Usage:

```python
from inventory.stock_service import InventoryService
from decimal import Decimal

# Receive stock from purchase
stock, movement = InventoryService.receive_stock(
    item=laptop_item,
    location=main_warehouse,
    quantity=Decimal('50'),
    unit_cost=Decimal('900.00'),
    reference_number='PO-2024-001',
    po_item=purchase_order_item,  # Optional link
    user=request.user
)

# Result:
# - stock.quantity_on_hand increased by 50
# - StockMovement created with type='RECEIVE'
# - Journal entry: Dr. Inventory ₦45,000, Cr. AP ₦45,000
# - Cost layer created for FIFO/LIFO tracking
```

## 🗄️ Models Reference

### InventoryCategory
**Purpose:** Group items and link to GL accounts

**Key Fields:**
- `inventory_account` → Asset account (e.g., 140 - Inventory Asset)
- `cogs_account` → Expense account (e.g., 510 - COGS)
- `sales_account` → Income account (e.g., 410 - Sales Revenue)

**Usage:** Required for automatic accounting integration

### InventoryItem
**Purpose:** Master product record

**Key Properties (computed):**
- `total_stock` - Sum of quantity_on_hand across locations
- `total_available` - Sum of quantity_available across locations
- `total_reserved` - Sum of quantity_reserved across locations
- `total_value` - Sum of total_value across locations
- `needs_reorder` - Boolean: total_stock <= reorder_level

**Methods:**
- `get_stock_at_location(location)` - Get/create stock record
- `get_available_locations()` - Locations with stock > 0

### InventoryStock
**Purpose:** Track quantities per location

**Key Fields:**
- `quantity_on_hand` - Physical units
- `quantity_reserved` - Reserved for orders
- `quantity_available` - On hand - reserved (auto-calculated)
- `average_cost` - For valuation
- `total_value` - quantity_on_hand * average_cost (auto-calculated)

**Unique Constraint:** (item, location) - One record per item per location

### StockMovement
**Purpose:** Audit trail of all changes

**Movement Types:**
- `RECEIVE` - From suppliers
- `SALE` - To customers
- `TRANSFER_IN` - From another location
- `TRANSFER_OUT` - To another location
- `ADJUSTMENT` - Manual corrections
- `ALLOCATION` - Reserved for allocations
- `REDEMPTION` - Consumed from allocations

**Important:** Read-only from application perspective - created by InventoryService only

### Invoice
**Purpose:** Sales invoices with automatic inventory impact

**Process:**
1. Create invoice with items
2. Stock automatically reduced (via InventoryService)
3. Two journal entries created:
   - Revenue: Dr. AR, Cr. Sales
   - COGS: Dr. COGS, Cr. Inventory

### CreditNote
**Purpose:** Sales returns and adjustments

**Process:**
1. Create credit note linked to original invoice
2. Apply to customer account
3. Reverses original accounting entries
4. Can restore inventory if physical return

### InventoryAllocation
**Purpose:** Reserve inventory for vouchers/benefits

**Use Cases:**
- Member product benefits
- Gift packages
- Pre-allocated items

**Process:**
1. Create allocation with items
2. Reserve stock (updates quantity_reserved)
3. Beneficiaries redeem
4. Redemption creates REDEMPTION movement and COGS entry

### InventoryCostLayer
**Purpose:** Track purchase cost layers for valuation

**Valuation Methods:**
- **FIFO:** First In, First Out - Oldest cost used first
- **LIFO:** Last In, First Out - Newest cost used first
- **Average:** Weighted average cost

**Managed by:** ValuationService (called automatically by InventoryService)

## 🌐 API Organization

### Nested Routes (Recommended)
```
/inventory/items/{id}/stock/       → Stock at all locations for this item
/inventory/items/{id}/movements/   → Movement history for this item
/inventory/items/{id}/cost-layers/ → Cost layers for this item
```

### Flat Routes (Backward Compatible)
```
/inventory/stock/                  → All stock records
/inventory/movements/              → All movements
```

**Frontend Recommendation:** Use nested routes - they're more intuitive and show relationships clearly.

## 🔗 Integration with Other Modules

### Procurement Module
**Uses:**
- `InventoryItem` for purchase orders
- `InventoryService.receive_stock()` when receiving goods

**Files:**
- `procurement/models.py` - PurchaseOrder links to InventoryItem
- `procurement/views.py` - Uses InventoryService for goods receipt

### Receivables Module
**Uses:**
- `Invoice` for customer invoices
- Automatic stock reduction and COGS

### Accounts Module
**Uses:**
- `InventoryCategory` links to GL accounts
- All stock operations create journal entries via AccountingService

### Locations:**
- All modules use same Location model
- Consistent location tracking

## ✅ Best Practices

### DO:
✅ Always use `InventoryService` for stock operations
✅ Use nested API endpoints for clarity
✅ Link items to categories with proper GL accounts
✅ Use descriptive reference numbers
✅ Pass `user` parameter for audit trail

### DON'T:
❌ Never modify `InventoryStock` quantities directly
❌ Never create `StockMovement` records manually
❌ Don't skip category assignment (breaks accounting)
❌ Don't forget to handle reservations for orders

## 🧪 Testing

Run inventory tests:
```bash
python manage.py test inventory --keepdb
```

## 📚 Documentation

- **API Guide:** `INVENTORY_API_GUIDE.md` - Complete API reference with examples
- **Models:** Check docstrings in `models.py`
- **Services:** Check docstrings in `stock_service.py`

## 🔄 Changelog

### Version 2.0 (Current)
- ✨ Added comprehensive API documentation
- ✨ Reorganized endpoints with nested routes
- ✨ Enhanced model docstrings
- ✨ Added helper properties to InventoryItem
- ✨ Improved OpenAPI/Swagger documentation
- 🐛 Fixed duplicate filtering in StockMovementViewSet

### Version 1.0
- Initial implementation
- Basic CRUD operations
- InventoryService integration

## 🤝 Contributing

When adding features:
1. Update models with clear docstrings
2. Add tests for new functionality
3. Update API documentation
4. Ensure InventoryService handles new operations
5. Add accounting integration if needed

## 📞 Support

For questions or issues:
1. Check `INVENTORY_API_GUIDE.md` first
2. Review model docstrings
3. Check service method signatures
4. Refer to test files for usage examples
