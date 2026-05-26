# Standard Chart of Accounts
## Phoenix ERP - Default Account Codes and Names

This document defines the standard account codes and exact names used across all accounting services.
All `get_or_create` operations MUST use these exact codes and names for consistency.

---

## Account Numbering System

- **1000-1999**: Assets
- **2000-2999**: Liabilities
- **3000-3999**: Equity
- **4000-4999**: Income/Revenue
- **5000-5999**: Cost of Goods Sold (COGS)
- **6000-6999**: Operating Expenses
- **7000-7999**: Other Expenses/Gains

---

## 1000-1999: ASSETS

### Current Assets (1000-1299)

| Code | Name | Account Type | Description | Used In |
|------|------|--------------|-------------|---------|
| **101** | Cash on Hand | ASSET | Physical cash | expenses |
| **102** | Bank Account | ASSET | Primary bank account | expenses |
| **1010** | Cash | ASSET | Legacy cash account | inventory |
| **1020** | Bank | ASSET | Legacy bank account | inventory |
| **1100** | Cash | ASSET | Cash account | hr/payroll |
| **110** | Petty Cash | ASSET | Small cash transactions | general |
| **120** | Inventory Asset | ASSET | Raw materials/goods for sale | inventory |
| **121** | Finished Goods Inventory | ASSET | Completed products | inventory |
| **122** | Raw Materials Inventory | ASSET | Production materials | inventory |
| **130** | Prepaid Expenses | ASSET | Prepaid assets | expenses |
| **1200** | Accounts Receivable | ASSET | Customer receivables | inventory, incomes |
| **1210** | Accounts Receivable - Students | ASSET | Student fee receivables | incomes |

### Fixed Assets (1300-1599)

| Code | Name | Account Type | Description | Used In |
|------|------|--------------|-------------|---------|
| **150** | Fixed Assets | ASSET | Property, plant, equipment | assets |
| **151** | Accumulated Depreciation | ASSET | Contra-asset for depreciation | assets |

---

## 2000-2999: LIABILITIES

### Current Liabilities (2000-2299)

| Code | Name | Account Type | Description | Used In |
|------|------|--------------|-------------|---------|
| **210** | Accounts Payable | LIABILITY | Supplier payables | expenses, inventory |
| **2010** | Accounts Payable - Trade | LIABILITY | Trade payables | inventory |
| **2100** | Accounts Payable | LIABILITY | General payables | inventory |
| **220** | Accrued Expenses | LIABILITY | Expenses incurred but not yet paid | general |
| **2200** | Tax Payable | LIABILITY | Income tax, PAYE, VAT payable | hr/payroll |
| **2300** | Other Payables | LIABILITY | Pension, insurance, other deductions | hr/payroll |
| **230** | Salaries Payable | LIABILITY | Unpaid salaries | hr/payroll |
| **240** | Unearned Revenue | LIABILITY | Advance payments from customers | incomes |

### Long-term Liabilities (2300-2999)

| Code | Name | Account Type | Description | Used In |
|------|------|--------------|-------------|---------|
| **250** | Long-term Debt | LIABILITY | Loans payable | liabilities |

---

## 3000-3999: EQUITY

| Code | Name | Account Type | Description | Used In |
|------|------|--------------|-------------|---------|
| **300** | Owner's Equity | EQUITY | Owner's capital | general |
| **310** | Retained Earnings | EQUITY | Accumulated profits | general |

---

## 4000-4999: INCOME/REVENUE

| Code | Name | Account Type | Description | Used In |
|------|------|--------------|-------------|---------|
| **400** | Sales Revenue | INCOME | Product sales | inventory |
| **4000** | Sales Revenue | INCOME | General sales | inventory |
| **4010** | Sales Revenue - Products | INCOME | Product sales | inventory |
| **410** | Service Revenue | INCOME | Service income | incomes |
| **420** | Tuition Fees | INCOME | School fees | incomes |
| **430** | Other Income | INCOME | Miscellaneous income | incomes |
| **4900** | Sales Returns and Allowances | INCOME | Contra-revenue account | inventory/credit_notes |

---

## 5000-5999: COST OF GOODS SOLD (COGS)

| Code | Name | Account Type | Description | Used In |
|------|------|--------------|-------------|---------|
| **500** | Cost of Goods Sold | EXPENSE | Cost of inventory sold | inventory |
| **501** | General Expenses | EXPENSE | Fallback expense account | expenses |
| **5000** | COGS - Products | EXPENSE | Product cost | inventory |
| **5010** | COGS - Materials | EXPENSE | Material cost | inventory |

---

## 6000-6999: OPERATING EXPENSES

| Code | Name | Account Type | Description | Used In |
|------|------|--------------|-------------|---------|
| **600** | Operating Expenses | EXPENSE | General operating expenses | general |
| **610** | Rent Expense | EXPENSE | Facility rent | expenses |
| **620** | Utilities Expense | EXPENSE | Electricity, water, internet | expenses |
| **630** | Office Supplies | EXPENSE | Office consumables | expenses |
| **640** | Marketing Expense | EXPENSE | Advertising and promotion | expenses |
| **650** | Travel Expense | EXPENSE | Business travel | expenses |
| **660** | Vehicle Expense | EXPENSE | Fuel, maintenance | expenses/resources |
| **6100** | Salary Expense | EXPENSE | Employee salaries | hr/payroll |
| **6200** | Benefits Expense | EXPENSE | Employee benefits | hr/payroll |
| **6300** | Training Expense | EXPENSE | Staff development | hr |

---

## 7000-7999: OTHER EXPENSES/GAINS

| Code | Name | Account Type | Description | Used In |
|------|------|--------------|-------------|---------|
| **700** | Depreciation Expense | EXPENSE | Asset depreciation | assets |
| **710** | Interest Expense | EXPENSE | Loan interest | liabilities |
| **720** | Loss on Asset Disposal | EXPENSE | Asset write-offs | assets |
| **730** | Inventory Adjustment | EXPENSE | Stock losses/gains | inventory |
| **7900** | Inventory Adjustment | EXPENSE | Stock adjustment account | inventory |

---

## Usage Guidelines

### For Developers

When implementing `get_or_create` for accounts:

```python
account, created = Account.objects.get_or_create(
    code='101',  # Use exact code from this chart
    owner=owner_instance,
    branch=branch_instance,
    defaults={
        'name': 'Cash on Hand',  # Use exact name from this chart
        'account_type': 'ASSET',  # Use correct type
        'account_level': 'PARENT',  # or 'CHILD' as appropriate
        'allow_manual_entries': True,
        'is_system_account': True
    }
)
```

### Multi-Tenant Considerations

- Each account is unique per `(code, owner, branch)` combination
- Always specify `owner` and `branch` in `get_or_create`
- Use `is_system_account=True` for auto-created accounts
- Different tenants can use the same account codes independently

### Account Hierarchy and Code Format

**Code Structure:**
- Parent accounts use **3-digit codes**: 101-599 (e.g., 101, 210, 400, 501)
- Child accounts use **XXX-YYY format**: parent_code-001 to parent_code-999 (e.g., 101-001, 210-002)

**Hierarchy Rules:**
- **PARENT** accounts (General Ledger level):
  - Code format: `101`, `210`, `400`, `501` (3 digits)
  - `account_level='PARENT'`
  - `parent=None` (no parent relationship)
  - Example: "Cash on Hand" (101), "Accounts Payable" (210)

- **CHILD** accounts (Sub-accounts):
  - Code format: `101-001`, `101-002`, `210-001` (parent code + dash + 3 digits)
  - `account_level='CHILD'`
  - `parent=<parent_account_instance>` (must reference parent)
  - Must have same `account_type` as parent
  - Example: "Petty Cash - Main Branch" (101-001), "Petty Cash - Sub Branch" (101-002)

**Validation Pattern:** `^[1-5]\d{2}(-\d{3})?$`
- Accepts: 101, 210, 400, 501, 101-001, 210-002, 501-123
- Rejects: 99, 600, 10, 100, 101-1, 101-AB, 101-1234

### Legacy Codes

Some modules use legacy codes (1010, 1020, 2010, 2100, 4010, 5000). These are maintained for backward compatibility but new implementations should use the standardized codes (101, 102, 210, 400, 500).

---

## Service-Specific Account Mapping

### Expenses Service
- Cash: **101**
- Bank: **102**
- Accounts Payable: **210**
- Prepaid Expenses: **130**
- General Expenses: **501**

### Inventory Service
- Cash: **101** (new) / 1010 (legacy)
- Bank: **102** (new) / 1020 (legacy)
- Accounts Payable: **210** (new) / 2010, 2100 (legacy)
- Accounts Receivable: **1200**
- Inventory Asset: **120**
- COGS: **500**
- Sales Revenue: **400**
- Inventory Adjustment: **730**

### HR/Payroll Service
- Cash: **101** (new) / 1100 (legacy)
- Salary Expense: **6100**
- Tax Payable: **2200**
- Other Payables: **2300**

### Incomes Service
- Accounts Receivable: **1200**
- Cash: **101**
- Tuition Fees: **420**
- Service Revenue: **410**

### Credit Notes Service
- Sales Returns: **4900**
- Accounts Receivable: **1200**

---

## Migration Strategy

When refactoring existing services:

1. **DO NOT** change existing account codes that are already in production
2. **ADD** new standardized codes for new implementations
3. **DOCUMENT** which services use which codes in this chart
4. **TEST** thoroughly before deploying account code changes
5. **COMMUNICATE** with finance team about any changes to chart of accounts

---

## Account Type Mapping

Django Model → Financial Statement:

- `ASSET` → Balance Sheet (Assets)
- `LIABILITY` → Balance Sheet (Liabilities)
- `EQUITY` → Balance Sheet (Equity)
- `INCOME/REVENUE` → Income Statement (Revenue)
- `EXPENSE` → Income Statement (Expenses)
- `COGS` → Income Statement (Cost of Sales)

---

**Last Updated**: January 19, 2026  
**Maintained By**: Development Team  
**Review Frequency**: Quarterly or when adding new modules
