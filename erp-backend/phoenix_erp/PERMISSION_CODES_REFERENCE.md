# Permission Codes Reference

Complete catalog of all available permission codes in Phoenix ERP system.

## Module: Purchase Orders (PO)

| Code | Description |
|------|-------------|
| `po-list` | View purchase order list |
| `po-bulk-approve` | Approve multiple purchase orders at once |
| `po-export` | Export purchase order data |
| `po-create` | Create new purchase order |
| `po-view-detail` | View purchase order details |
| `po-edit` | Edit existing purchase order |
| `po-save-draft` | Save purchase order as draft |
| `po-submit-approval` | Submit purchase order for approval |
| `po-approve` | Approve purchase order |
| `po-send` | Send purchase order to supplier |
| `po-acknowledge` | Acknowledge purchase order receipt |
| `po-generate-pdf` | Generate PDF of purchase order |
| `po-cancel` | Cancel purchase order |
| `po-delete` | Delete purchase order |

## Module: Procurement Requisitions (PR)

| Code | Description |
|------|-------------|
| `pr-list` | View procurement requisition list |
| `pr-create` | Create new procurement requisition |
| `pr-view-detail` | View requisition details |
| `pr-edit` | Edit existing requisition |
| `pr-delete` | Delete requisition |
| `pr-approve` | Approve requisition |
| `pr-reject` | Reject requisition |
| `pr-convert-to-po` | Convert requisition to purchase order |
| `pr-submit-approval` | Submit requisition for approval |
| `pr-request-quotes` | Request quotes from suppliers |
| `pr-view-quotes` | View supplier quotes |
| `pr-compare-quotes` | Compare quotes from multiple suppliers |
| `pr-select-quote` | Select winning quote |
| `pr-convert-quote-to-po` | Convert selected quote to purchase order |

## Module: Goods Received Notes (GRN)

| Code | Description |
|------|-------------|
| `grn-list` | View goods received notes list |
| `grn-create` | Create new GRN |
| `grn-view-detail` | View GRN details |
| `grn-quality-check` | Perform quality check on received goods |
| `grn-post` | Post GRN to inventory |
| `grn-create-return` | Create return note from GRN |
| `grn-print` | Print GRN document |
| `grn-edit` | Edit GRN |

## Module: Returns

| Code | Description |
|------|-------------|
| `return-list` | View returns list |
| `return-create` | Create new return |
| `return-view-detail` | View return details |
| `return-approve` | Approve return |
| `return-process-refund` | Process refund for return |
| `return-complete` | Mark return as complete |
| `return-cancel` | Cancel return |

## Module: Suppliers

| Code | Description |
|------|-------------|
| `supplier-list` | View supplier list |
| `supplier-create` | Create new supplier |
| `supplier-view-detail` | View supplier details |
| `supplier-edit` | Edit supplier information |
| `supplier-deactivate` | Deactivate supplier |

## Module: Inventory Management

### Dashboard & Items
| Code | Description |
|------|-------------|
| `inv-dashboard-view` | View inventory dashboard |
| `item-list` | View inventory items list |
| `item-create` | Create new inventory item |
| `item-edit` | Edit inventory item |

### Movements & Adjustments
| Code | Description |
|------|-------------|
| `movement-list` | View inventory movement history |
| `adjustment-create` | Create inventory adjustment |
| `transfer-create` | Create inventory transfer |

### Categories & Locations
| Code | Description |
|------|-------------|
| `category-list` | View inventory categories |
| `category-create` | Create new category |
| `category-edit` | Edit category |
| `category-delete` | Delete category |
| `location-list` | View storage locations |
| `location-create` | Create new location |
| `location-edit` | Edit location |

## Module: Invoicing

| Code | Description |
|------|-------------|
| `invoice-list` | View invoice list |
| `invoice-create` | Create new invoice |
| `invoice-preview` | Preview invoice before sending |
| `invoice-record-payment` | Record payment against invoice |
| `invoice-view-detail` | View invoice details |
| `invoice-edit` | Edit invoice |
| `invoice-mark-sent` | Mark invoice as sent |
| `invoice-export-pdf` | Export invoice as PDF |
| `invoice-send` | Send invoice to customer |
| `invoice-void` | Void invoice |

## Module: Fee Management

### Entitlements
| Code | Description |
|------|-------------|
| `entitlement-list` | View entitlements list |
| `entitlement-create` | Create new entitlement |
| `entitlement-view-detail` | View entitlement details |
| `entitlement-edit` | Edit entitlement |
| `entitlement-delete` | Delete entitlement |

### Fee Structures
| Code | Description |
|------|-------------|
| `fee-structure-list` | View fee structures list |
| `fee-structure-create` | Create new fee structure |
| `fee-structure-view-detail` | View fee structure details |
| `fee-structure-edit` | Edit fee structure |
| `fee-structure-delete` | Delete fee structure |

### Receivables
| Code | Description |
|------|-------------|
| `receivables-list` | View receivables list |

## Module: Human Resources

### Dashboard & Summary
| Code | Description |
|------|-------------|
| `hr-dashboard-view` | View HR dashboard |
| `hr-staff-summary` | View staff summary reports |
| `hr-attendance-summary` | View attendance summary |
| `hr-leave-summary` | View leave summary |
| `hr-payroll-summary` | View payroll summary |

### Staff Management
| Code | Description |
|------|-------------|
| `staff-list` | View staff list |
| `staff-create` | Create new staff record |
| `staff-view-detail` | View staff details |
| `staff-edit` | Edit staff information |
| `staff-delete` | Delete staff record |

### Attendance
| Code | Description |
|------|-------------|
| `attendance-list` | View attendance records |
| `attendance-clock` | Clock in/out |
| `attendance-manual` | Manual attendance entry |
| `attendance-approve` | Approve attendance records |
| `attendance-export` | Export attendance data |

### Leave Management
| Code | Description |
|------|-------------|
| `leave-list` | View leave requests list |
| `leave-create` | Create new leave request |
| `leave-view-detail` | View leave request details |
| `leave-approve` | Approve leave request |
| `leave-reject` | Reject leave request |
| `leave-balances` | View leave balances |
| `leave-types` | View leave types |
| `leave-type-create` | Create new leave type |

### Payroll
| Code | Description |
|------|-------------|
| `payroll-list` | View payroll list |
| `payroll-create` | Create new payroll run |
| `payroll-calculate` | Calculate payroll |
| `payroll-approve` | Approve payroll |
| `payroll-process` | Process payroll payments |
| `payroll-generate-payslips` | Generate payslips |

### Salary Components
| Code | Description |
|------|-------------|
| `salary-component-list` | View salary components |
| `salary-component-create` | Create salary component |
| `salary-component-edit` | Edit salary component |
| `salary-component-delete` | Delete salary component |

### Bonus & Deductions
| Code | Description |
|------|-------------|
| `bonus-deduction-list` | View bonus/deduction requests |
| `bonus-deduction-create` | Create bonus/deduction request |
| `bonus-deduction-view-detail` | View bonus/deduction details |
| `bonus-deduction-approve` | Approve bonus/deduction |
| `bonus-deduction-reject` | Reject bonus/deduction |

## Module: Prepaid Management

| Code | Description |
|------|-------------|
| `prepaid-list` | View prepaid items list |
| `prepaid-amortize` | Amortize prepaid items |
| `prepaid-create` | Create prepaid item |

## Module: Consumption

| Code | Description |
|------|-------------|
| `consumption-list` | View consumption list |
| `consumption-post-list` | View posted consumption |
| `consumption-approval-list` | View consumption pending approval |
| `consumption-record` | Record consumption |
| `consumption-post` | Post consumption to accounts |
| `consumption-submit-approval` | Submit consumption for approval |

## Module: Irregularities

| Code | Description |
|------|-------------|
| `irregularities-view` | View irregularities report |

## Module: Vouchers

| Code | Description |
|------|-------------|
| `voucher-list` | View voucher list |
| `voucher-create` | Create new voucher |
| `voucher-view-detail` | View voucher details |
| `voucher-cancel` | Cancel voucher |

## Module: Financial Reports

| Code | Description |
|------|-------------|
| `trial-balance-view` | View trial balance report |
| `pl-view` | View profit & loss statement |
| `balance-sheet-view` | View balance sheet |

## Module: Client Management

### Clients
| Code | Description |
|------|-------------|
| `client-list` | View client list |
| `client-create` | Create new client |
| `client-view-detail` | View client details |
| `client-edit` | Edit client information |
| `client-bulk-import` | Bulk import clients |
| `client-export` | Export client data |

### Classifications
| Code | Description |
|------|-------------|
| `classification-list` | View client classifications |
| `classification-create` | Create classification |
| `classification-edit` | Edit classification |
| `classification-delete` | Delete classification |

## Module: Branch Management

| Code | Description |
|------|-------------|
| `branch-list` | View branch list |
| `branch-create` | Create new branch |
| `branch-view-detail` | View branch details |
| `branch-edit` | Edit branch information |

---

## Total Permission Codes: 186

## Quick Reference by Category

### Read-Only Access (View & List)
All permissions ending in `-list`, `-view-detail`, `-view`, `-summary`, `-balances`

### Create Operations
All permissions ending in `-create`

### Update Operations
All permissions ending in `-edit`

### Delete Operations
All permissions ending in `-delete`

### Approval Workflow
All permissions containing `-approve`, `-reject`, `-submit-approval`

### Export/Print Operations
All permissions ending in `-export`, `-print`, `-generate-pdf`

### Special Operations
- Bulk operations: `-bulk-*`
- Conversions: `-convert-*`
- Status changes: `-cancel`, `-void`, `-complete`, `-post`
- Communications: `-send`, `-acknowledge`

---

## Usage in Role Configuration

### Example: Full Access Administrator
```python
admin_permissions = [
    # All 186 permission codes
    '*'  # Or list all codes
]
```

### Example: Procurement Department
```python
procurement_permissions = [
    # Purchase Orders
    'po-list', 'po-create', 'po-view-detail', 'po-edit', 
    'po-save-draft', 'po-submit-approval', 'po-generate-pdf',
    
    # Procurement Requisitions
    'pr-list', 'pr-create', 'pr-view-detail', 'pr-edit',
    'pr-submit-approval', 'pr-request-quotes', 'pr-view-quotes',
    'pr-compare-quotes', 'pr-select-quote', 'pr-convert-quote-to-po',
    
    # Suppliers
    'supplier-list', 'supplier-view-detail',
    
    # GRN
    'grn-list', 'grn-create', 'grn-view-detail', 'grn-edit',
]
```

### Example: Finance Department
```python
finance_permissions = [
    # Invoicing
    'invoice-list', 'invoice-create', 'invoice-view-detail',
    'invoice-record-payment', 'invoice-export-pdf', 'invoice-send',
    
    # Vouchers
    'voucher-list', 'voucher-create', 'voucher-view-detail',
    
    # Financial Reports
    'trial-balance-view', 'pl-view', 'balance-sheet-view',
    
    # Receivables
    'receivables-list',
    
    # Fee Management
    'fee-structure-list', 'fee-structure-view-detail',
    'entitlement-list', 'entitlement-view-detail',
]
```

### Example: HR Department
```python
hr_permissions = [
    # HR Dashboard
    'hr-dashboard-view', 'hr-staff-summary', 'hr-attendance-summary',
    'hr-leave-summary', 'hr-payroll-summary',
    
    # Staff
    'staff-list', 'staff-create', 'staff-view-detail', 'staff-edit',
    
    # Attendance
    'attendance-list', 'attendance-manual', 'attendance-approve',
    'attendance-export',
    
    # Leave
    'leave-list', 'leave-view-detail', 'leave-approve', 'leave-reject',
    'leave-balances', 'leave-types',
    
    # Payroll
    'payroll-list', 'payroll-create', 'payroll-calculate',
    'payroll-approve', 'payroll-process', 'payroll-generate-payslips',
    
    # Bonus/Deductions
    'bonus-deduction-list', 'bonus-deduction-view-detail',
    'bonus-deduction-approve', 'bonus-deduction-reject',
]
```

### Example: Warehouse Manager
```python
warehouse_permissions = [
    # Inventory Dashboard
    'inv-dashboard-view',
    
    # Items
    'item-list', 'item-create', 'item-edit',
    
    # Movements
    'movement-list', 'adjustment-create', 'transfer-create',
    
    # Categories & Locations
    'category-list', 'location-list', 'location-create', 'location-edit',
    
    # GRN
    'grn-list', 'grn-create', 'grn-view-detail', 'grn-quality-check',
    'grn-post', 'grn-print',
    
    # Returns
    'return-list', 'return-create', 'return-view-detail', 'return-complete',
]
```

### Example: Read-Only Auditor
```python
auditor_permissions = [
    # View-only access to key reports and lists
    'po-list', 'po-view-detail', 'po-export',
    'pr-list', 'pr-view-detail',
    'grn-list', 'grn-view-detail',
    'invoice-list', 'invoice-view-detail', 'invoice-export-pdf',
    'voucher-list', 'voucher-view-detail',
    'trial-balance-view', 'pl-view', 'balance-sheet-view',
    'receivables-list',
    'staff-list', 'staff-view-detail',
    'payroll-list',
    'client-list', 'client-view-detail',
    'irregularities-view',
]
```

---

## Notes

1. **Wildcard Permission**: Use `'*'` to grant all permissions (typically for system administrators)

2. **Permission Inheritance**: User gets permissions from:
   - All assigned roles
   - User-specific permission_codes field
   - Owner/System Admin status (automatically gets `'*'`)

3. **Frontend Usage**: Check permissions before rendering UI elements
   ```javascript
   if (hasPermission('po-approve')) {
     // Show approve button
   }
   ```

4. **Backend Usage**: Always validate permissions on API endpoints
   ```python
   if not request.user.has_action_permission('po-approve'):
       return Response({'error': 'Permission denied'}, status=403)
   ```

5. **Naming Convention**: `{module}-{action}`
   - module: lowercase abbreviation (po, pr, grn, etc.)
   - action: descriptive verb or noun (list, create, approve, etc.)
