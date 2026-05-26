# Inventory API Guide

## 🎯 Overview

The inventory system manages products, stock levels, and movements with full accounting integration. This guide explains the relationships and proper usage.

---

## 📊 Core Concepts

### 1. InventoryItem (Master Data)
**What it is:** The master product record - defines WHAT the item is

**Key Fields:**
- `name`, `sku`, `barcode` - Identification
- `category` - Links to InventoryCategory (which links to GL accounts)
- `cost_price`, `selling_price` - Pricing
- `unit_of_measure` - unit, kg, liter, box, etc.
- `valuation_method` - fifo, lifo, average
- `reorder_level`, `reorder_quantity` - Automatic reorder triggers
- `is_active`, `is_sellable`, `is_purchasable` - Status flags

**Computed Properties (read-only):**
```python
item.total_stock        # Sum of quantity_on_hand across all locations
item.total_available    # Sum of quantity_available across all locations
item.total_reserved     # Sum of quantity_reserved across all locations
item.total_value        # Sum of total_value across all locations
item.needs_reorder      # Boolean: total_stock <= reorder_level
```

**API Endpoints:**
```
GET    /inventory/items/              # List all items
POST   /inventory/items/              # Create new item
GET    /inventory/items/{id}/         # Get specific item
PATCH  /inventory/items/{id}/         # Update item
DELETE /inventory/items/{id}/         # Soft delete item
GET    /inventory/items/summary/      # Simplified list for dropdowns
```

**Query Parameters:**
- `?is_active=true/false` - Filter by active status
- `?category={id}` - Filter by category
- `?search={text}` - Search by name, SKU, or barcode

---

### 2. InventoryStock (Quantity Tracking)
**What it is:** Tracks HOW MUCH of an item exists WHERE (per location)

**Key Fields:**
- `item` - FK to InventoryItem
- `location` - FK to Location
- `quantity_on_hand` - Physical units at location
- `quantity_reserved` - Reserved for orders (cannot be sold)
- `quantity_available` - Can be sold (on_hand - reserved) **[Auto-calculated]**
- `average_cost` - Weighted average cost per unit
- `total_value` - quantity_on_hand * average_cost **[Auto-calculated]**

**Relationship:**
```
InventoryItem "iPhone 15 Pro"
  ├── InventoryStock @ Main Warehouse: 50 units, 10 reserved = 40 available
  ├── InventoryStock @ Store A: 20 units, 5 reserved = 15 available
  └── InventoryStock @ Store B: 30 units, 0 reserved = 30 available
Total: 100 units on hand, 15 reserved, 85 available
```

**API Endpoints (Nested - Preferred):**
```
GET /inventory/items/{item_id}/stock/  # Get stock for specific item at all locations
```

**API Endpoints (Flat - Alternative):**
```
GET  /inventory/stock/                 # List all stock records
GET  /inventory/stock/{id}/            # Get specific stock record
GET  /inventory/stock/by_location/?location={id}  # All items at one location
```

**Query Parameters:**
- `?item={id}` - Filter by item
- `?location={id}` - Filter by location
- `?show_empty=true` - Include records with 0 quantity (default: false)

**⚠️ CRITICAL: Never modify stock quantities directly!**
Always use `InventoryService` methods:

---

### 3. StockMovement (Audit Trail)
**What it is:** History of every stock change - created automatically

**Movement Types:**
- `RECEIVE` - Stock received from supplier (purchase)
- `SALE` - Stock sold to customer
- `TRANSFER_OUT` - Moved out to another location
- `TRANSFER_IN` - Received from another location
- `ADJUSTMENT` - Manual correction (cycle count, damage, etc.)
- `ALLOCATION` - Reserved for voucher/allocation
- `REDEMPTION` - Consumed from allocation

**Key Fields:**
- `item`, `location` - What and where
- `movement_type` - Type of movement
- `quantity` - Amount changed
- `unit_cost` - Cost per unit at time of movement
- `reference_number` - Links to source document (PO, Invoice, etc.)
- `notes` - Description
- `created_by` - User who performed action
- `created_at` - Timestamp

**API Endpoints (Nested - Preferred):**
```
GET /inventory/items/{item_id}/movements/  # Movement history for specific item
```

**API Endpoints (Flat - Alternative):**
```
GET /inventory/movements/                  # All movements
```

**Query Parameters:**
- `?item={id}` - Filter by item
- `?location={id}` - Filter by location
- `?movement_type={type}` - Filter by type
- `?date_from={YYYY-MM-DD}` - Start date
- `?date_to={YYYY-MM-DD}` - End date

**⚠️ NEVER create StockMovement manually!**
They're created automatically by `InventoryService` operations.

---

## 🔧 Proper Stock Operations

### Use InventoryService for ALL stock changes:

```python
from inventory.stock_service import InventoryService

# 1. Receive stock from purchase
stock, movement = InventoryService.receive_stock(
    item=item,
    location=warehouse,
    quantity=Decimal('100'),
    unit_cost=Decimal('50.00'),
    reference_number='PO-2024-001',
    user=request.user
)

# 2. Reduce stock for sale
stock, movement = InventoryService.reduce_stock(
    item=item,
    location=warehouse,
    quantity=Decimal('10'),
    movement_type='SALE',
    reference_number='INV-2024-001',
    user=request.user
)

# 3. Transfer between locations
movement_out, stock_from, stock_to = InventoryService.transfer_stock(
    item=item,
    from_location=warehouse,
    to_location=store,
    quantity=Decimal('20'),
    reference_number='TRF-2024-001',
    user=request.user
)

# 4. Adjust stock (corrections)
stock, movement = InventoryService.adjust_stock(
    item=item,
    location=warehouse,
    adjustment_quantity=Decimal('-5'),  # Negative = reduce
    reason='Damaged units',
    reference_number='ADJ-2024-001',
    user=request.user
)

# 5. Reserve stock for order
stock = InventoryService.reserve_stock(
    item=item,
    location=warehouse,
    quantity=Decimal('10'),
    reference_number='SO-2024-001',
    user=request.user
)

# 6. Release reservation
stock = InventoryService.release_reservation(
    item=item,
    location=warehouse,
    quantity=Decimal('10'),
    reference_number='SO-2024-001',
    user=request.user
)
```

**Why use InventoryService?**
✅ Creates proper StockMovement audit trail
✅ Updates InventoryStock quantities correctly
✅ Creates accounting journal entries automatically
✅ Handles cost layer management (FIFO/LIFO/Average)
✅ Validates sufficient stock before operations
✅ Maintains referential integrity

---

## 📁 Supporting Models

### InventoryCategory
Groups items and links them to GL accounts for automatic accounting.

**Fields:**
- `name`, `code` - Category identification
- `inventory_account` - Asset account (e.g., "140 - Inventory Asset")
- `cogs_account` - Expense account (e.g., "510 - Cost of Goods Sold")
- `sales_account` - Income account (e.g., "410 - Sales Revenue")

**API:**
```
GET  /inventory/categories/
POST /inventory/categories/
```

### Location
Warehouses, stores, or any storage location.

**Fields:**
- `name`, `code` - Location identification
- `location_type` - warehouse, store, transit
- `is_active` - Status

**API:**
```
GET  /inventory/locations/
POST /inventory/locations/
```

---

## 🛒 Sales & Invoicing

### Invoice
Sales invoices with automatic inventory reduction and accounting.

**API:**
```
POST /inventory/invoices/
{
  "client": 1,
  "invoice_date": "2024-01-15",
  "due_date": "2024-02-15",
  "items": [
    {
      "item_id": 5,
      "quantity": 10,
      "unit_price": "1200.00"
    }
  ]
}

# Creates:
# - Invoice record
# - InvoiceItems
# - StockMovements (SALE type)
# - Journal entries:
#   Dr. Cash/AR           ₦12,000  (Asset)
#     Cr. Sales Revenue            ₦12,000  (Income)
#   Dr. COGS              ₦9,000   (Expense)
#     Cr. Inventory Asset          ₦9,000   (Asset)
```

**Endpoints:**
```
GET  /inventory/invoices/
POST /inventory/invoices/
GET  /inventory/invoices/{id}/
POST /inventory/invoices/{id}/record_payment/
POST /inventory/invoices/{id}/cancel/
GET  /inventory/invoices/{id}/pdf/
```

### CreditNote
Sales returns - reverse invoice impact.

**API:**
```
POST /inventory/credit-notes/
{
  "original_invoice": 1,
  "client": 1,
  "issue_date": "2024-01-20",
  "reason": "Defective product",
  "items": [
    {
      "original_invoice_item": 1,
      "item": 5,
      "quantity": "2.00",
      "unit_price": "1200.00"
    }
  ]
}

# Creates:
# - CreditNote record
# - CreditNoteItems
# - Reverses accounting entries when applied
```

**Endpoints:**
```
GET  /inventory/credit-notes/
POST /inventory/credit-notes/
GET  /inventory/credit-notes/{id}/
POST /inventory/credit-notes/{id}/apply/
POST /inventory/credit-notes/{id}/cancel/
GET  /inventory/credit-notes/{id}/pdf/
```

---

## 🎫 Allocations & Redemptions

### InventoryAllocation
Reserve inventory for vouchers, packages, or member benefits.

**Use Cases:**
- Member product vouchers
- Gift packages
- Pre-allocated benefits

**API:**
```
POST /inventory/allocations/
{
  "allocation_number": "ALLOC-2024-001",
  "allocation_type": "member_benefit",
  "valid_from": "2024-01-01",
  "valid_to": "2024-12-31",
  "items": [
    {
      "item": 5,
      "location": 2,
      "allocated_quantity": "10.00",
      "maximum_per_redemption": "1.00"
    }
  ]
}
```

**Endpoints:**
```
GET  /inventory/allocations/
POST /inventory/allocations/
GET  /inventory/allocations/{id}/
POST /inventory/allocations/{id}/reserve_stock/
POST /inventory/allocations/{id}/activate/
```

### AllocationRedemption
Redeem allocated inventory.

**API:**
```
POST /inventory/redemptions/
{
  "allocation": 1,
  "beneficiary_identifier": "MEMBER-123",
  "redemption_date": "2024-01-15",
  "items": [
    {
      "allocation_item": 1,
      "item": 5,
      "location": 2,
      "quantity": "1.00"
    }
  ]
}

# Creates:
# - AllocationRedemption record
# - RedemptionItems
# - StockMovements (REDEMPTION type)
# - COGS journal entry
```

**Endpoints:**
```
GET  /inventory/redemptions/
POST /inventory/redemptions/
GET  /inventory/redemptions/{id}/
POST /inventory/redemptions/{id}/complete/
```

---

## 💰 Cost Tracking & Valuation

### InventoryCostLayer
Tracks cost of inventory purchases for FIFO/LIFO/Average costing.

**Valuation Methods:**
- **FIFO** (First In, First Out) - Oldest cost used first
- **LIFO** (Last In, First Out) - Newest cost used first
- **Average** - Weighted average cost

**API:**
```
GET /inventory/items/{item_id}/cost-layers/  # Cost layers for item
```

### CostLayerConsumption
Records which cost layers were consumed for COGS calculation.

**API:**
```
GET /inventory/cost-consumptions/
```

---

## 🗺️ API Route Organization

### Nested Routes (Recommended for Frontend)
```
/inventory/
  ├── items/                           # Master product catalog
  │   ├── {id}/stock/                 # ✨ Stock at all locations for this item
  │   ├── {id}/movements/             # ✨ Movement history for this item
  │   ├── {id}/cost-layers/           # ✨ Cost layers for this item
  │   └── {id}/allocations/           # ✨ Allocations for this item
  ├── categories/                      # Product categories
  ├── locations/                       # Warehouses/stores
  ├── invoices/                        # Sales invoices
  │   └── {id}/credit-notes/          # ✨ Credit notes for this invoice
  ├── allocations/                     # Inventory allocations
  └── redemptions/                     # Allocation redemptions
```

### Flat Routes (Backward Compatibility)
```
/inventory/stock/                      # All stock records
/inventory/movements/                  # All movements
/inventory/credit-notes/               # All credit notes (not nested)
```

---

## 🎨 Frontend Integration Guide

### 1. Display Item with Stock Info

```typescript
// Get item with computed properties
const response = await api.get(`/inventory/items/${itemId}/`);
const item = response.data;

// Display
console.log(`${item.sku} - ${item.name}`);
console.log(`Total Stock: ${item.total_stock}`);
console.log(`Available: ${item.total_available}`);
console.log(`Reserved: ${item.total_reserved}`);
console.log(`Value: ${item.total_value}`);
console.log(`Needs Reorder: ${item.needs_reorder ? 'Yes' : 'No'}`);
```

### 2. Show Stock by Location

```typescript
// Get stock for specific item at all locations
const response = await api.get(`/inventory/items/${itemId}/stock/`);
const stockRecords = response.data;

stockRecords.forEach(stock => {
  console.log(`${stock.location_name}:`);
  console.log(`  On Hand: ${stock.quantity_on_hand}`);
  console.log(`  Reserved: ${stock.quantity_reserved}`);
  console.log(`  Available: ${stock.quantity_available}`);
  console.log(`  Value: ${stock.total_value}`);
});
```

### 3. Show Movement History

```typescript
// Get movements for specific item
const response = await api.get(`/inventory/items/${itemId}/movements/`, {
  params: {
    date_from: '2024-01-01',
    date_to: '2024-01-31',
    movement_type: 'SALE'  // Optional filter
  }
});
const movements = response.data;

movements.forEach(movement => {
  console.log(`${movement.created_at}: ${movement.movement_type}`);
  console.log(`  Quantity: ${movement.quantity}`);
  console.log(`  Location: ${movement.location_name}`);
  console.log(`  Reference: ${movement.reference_number}`);
  console.log(`  User: ${movement.created_by_name}`);
});
```

### 4. Search Items

```typescript
// Search by name, SKU, or barcode
const response = await api.get('/inventory/items/', {
  params: {
    search: 'iPhone',
    is_active: true,
    category: 5  // Optional
  }
});
const items = response.data.results;
```

### 5. Get Items for Dropdown

```typescript
// Simplified endpoint for forms
const response = await api.get('/inventory/items/summary/');
const items = response.data.data;  // [{id, name, sku, unit_of_measure, selling_price}]

// Use in dropdown
<Select>
  {items.map(item => (
    <option key={item.id} value={item.id}>
      {item.sku} - {item.name} (₦{item.selling_price})
    </option>
  ))}
</Select>
```

---

## ⚠️ Common Mistakes to Avoid

### ❌ DON'T: Modify stock quantities directly
```python
# WRONG - breaks audit trail and accounting
stock.quantity_on_hand += 10
stock.save()
```

### ✅ DO: Use InventoryService
```python
# CORRECT - creates audit trail and accounting entries
InventoryService.receive_stock(
    item=item,
    location=location,
    quantity=Decimal('10'),
    unit_cost=Decimal('50'),
    reference_number='PO-001',
    user=request.user
)
```

### ❌ DON'T: Create StockMovement manually
```python
# WRONG
StockMovement.objects.create(
    item=item,
    location=location,
    movement_type='RECEIVE',
    quantity=10
)
```

### ✅ DO: Let InventoryService create it
All InventoryService methods create StockMovement automatically.

### ❌ DON'T: Use flat endpoints for item-specific data
```typescript
// LESS CLEAR
api.get('/inventory/stock/?item=5')
api.get('/inventory/movements/?item=5')
```

### ✅ DO: Use nested endpoints
```typescript
// MORE CLEAR - shows relationship
api.get('/inventory/items/5/stock/')
api.get('/inventory/items/5/movements/')
```

---

## 📚 Summary

**Data Hierarchy:**
```
InventoryCategory (GL accounts)
  └── InventoryItem (Master data)
      └── InventoryStock (Quantities per location)
          └── StockMovement (Audit trail)
```

**Key Rules:**
1. **InventoryItem** = WHAT the product is
2. **InventoryStock** = HOW MUCH exists WHERE
3. **StockMovement** = WHEN and WHY quantities changed
4. **Always use InventoryService** for stock operations
5. **Never create StockMovement manually**
6. **Use nested endpoints** for clarity in frontend

**Benefits:**
- ✅ Clear separation of master data vs. quantities
- ✅ Multi-location inventory tracking
- ✅ Complete audit trail
- ✅ Automatic accounting integration
- ✅ Proper cost tracking (FIFO/LIFO/Average)
- ✅ RESTful, intuitive API structure

---

For questions or issues, refer to the codebase documentation in:
- `/inventory/models.py` - Model definitions
- `/inventory/stock_service.py` - InventoryService methods
- `/inventory/views.py` - API endpoint implementations
