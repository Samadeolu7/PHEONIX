# Centralized Account Creation Utility

## Overview

To prevent errors like "Child accounts must have a parent" and ensure proper account hierarchy, always use the centralized account creation utility located at `accounts/utils/account_creation.py`.

## Why This Matters

The Account model enforces strict validation:
- **PARENT accounts**: Cannot have transactions if `allow_manual_entries=False`
- **CHILD accounts**: MUST have a parent account
- **Code structure**: Parent codes are 3-4 digits (e.g., `501`, `1200`), child codes use format `{parent_code}-{suffix}` (e.g., `501-001`)

## Usage

### Quick Start - Use Predefined System Accounts

```python
from accounts.utils.account_creation import get_system_account

# Get or create expense account (creates parent 501 + child 501-001)
expense_account = get_system_account('general_expense', user, branch)

# Get or create cash account (creates parent 101 + child 101-001)
cash_account = get_system_account('cash', user, branch)

# Get or create bank account (creates parent 102 + child 102-001)
bank_account = get_system_account('bank', user, branch)

# Get or create accounts payable (creates parent 210 + child 210-001)
payable_account = get_system_account('accounts_payable', user, branch)
```

### Available System Account Keys

| Key | Parent Code | Child Code | Name | Type |
|-----|-------------|------------|------|------|
| `general_expense` | 501 | 501-001 | General Operating Expenses | EXPENSE |
| `prepaid_expense` | 130 | 130-001 | General Prepaid Expenses | ASSET |
| `accounts_payable` | 210 | 210-001 | General Payables | LIABILITY |
| `cash` | 101 | 101-001 | General Cash | ASSET |
| `bank` | 102 | 102-001 | General Bank Account | ASSET |
| `petty_cash` | 110 | 110-001 | General Petty Cash | ASSET |
| `inventory` | 120 | 120-001 | General Inventory | ASSET |
| `cogs` | 500 | 500-001 | General COGS | EXPENSE |
| `sales_revenue` | 400 | 400-001 | General Sales Revenue | INCOME |

### Custom Child Account Creation

For custom accounts not in the predefined list:

```python
from accounts.utils.account_creation import get_or_create_child_account

# Create custom vehicle expense account
vehicle_account = get_or_create_child_account(
    parent_code='660',  # Vehicle Expense parent
    child_suffix='001',
    name='Fuel Expenses',
    account_type='EXPENSE',
    owner=user,
    branch=branch,
    parent_name='Vehicle Expenses'
)
```

## What This Utility Does

1. **Creates Parent First**: Ensures parent account exists (e.g., code `501`)
2. **Then Creates Child**: Creates child with proper reference (e.g., code `501-001`, parent=`501`)
3. **Validates Structure**: Enforces code format rules
4. **Sets Proper Flags**: 
   - Parent: `allow_manual_entries=False` (can't post transactions)
   - Child: `allow_manual_entries=True` (ready for transactions)

## Migration Pattern

When setting up standard accounts in migrations, use the same pattern from `0004_setup_standard_chart_of_accounts.py`:

```python
# First pass: Create all parent accounts
parent_accounts = {}
for code, name, account_type in PARENT_ACCOUNTS:
    account = Account.objects.create(
        code=code,
        name=name,
        account_type=account_type,
        account_level='PARENT',
        allow_manual_entries=False,  # Parents don't allow direct transactions
        # ...
    )
    parent_accounts[code] = account

# Second pass: Create child accounts with parent references
for parent_code, child_suffix, name, account_type in CHILD_ACCOUNTS:
    parent = parent_accounts[parent_code]
    
    Account.objects.create(
        code=f"{parent.code}-{child_suffix}",
        name=name,
        account_type=account_type,
        account_level='CHILD',
        parent=parent,  # CRITICAL: Set parent reference
        allow_manual_entries=True,  # Children allow transactions
        # ...
    )
```

## Examples from Codebase

### ✅ CORRECT - Using Centralized Utility

```python
# expenses/services/expense_accounting.py
from accounts.utils.account_creation import get_system_account

def _get_expense_account(self):
    if self.expense.category and self.expense.category.expense_account:
        return self.expense.category.expense_account
    
    # Fallback: get system account (creates parent 501 + child 501-001)
    return get_system_account('general_expense', self.expense.owner, self.expense.branch)
```

### ❌ INCORRECT - Manual Creation

```python
# DON'T DO THIS - creates child without parent
account, created = Account.objects.get_or_create(
    code='501-001',
    defaults={
        'account_level': 'CHILD',  # ERROR: No parent reference!
        # ...
    }
)

# DON'T DO THIS - creates parent but uses child code
account, created = Account.objects.get_or_create(
    code='501-001',  # This is a child code format
    defaults={
        'account_level': 'PARENT',  # ERROR: Inconsistent!
        # ...
    }
)
```

## Testing with Proper Account Structure

When writing tests, create proper parent+child hierarchy:

```python
# Create parent account
cash_parent = Account.objects.create(
    name='Cash on Hand',
    code='101',
    account_type='ASSET',
    account_level='PARENT',
    allow_manual_entries=False,  # Parent doesn't allow transactions
    # ...
)

# Create child account with parent reference
cash_account = Account.objects.create(
    name='General Cash',
    code='101-001',
    account_type='ASSET',
    account_level='CHILD',
    parent=cash_parent,  # CRITICAL: Link to parent
    allow_manual_entries=True,  # Child allows transactions
    # ...
)

# Use child account in transactions
journal_entry_line = JournalEntryLine.objects.create(
    account=cash_account,  # Use child, not parent
    # ...
)
```

## Summary

**Golden Rules:**
1. Always use `get_system_account()` for common accounts
2. Use `get_or_create_child_account()` for custom accounts
3. Never create CHILD accounts without a parent reference
4. Parent accounts (3-digit codes) → No direct transactions
5. Child accounts (`parent-suffix` codes) → Ready for transactions
6. Test with proper parent+child hierarchy

This ensures your code follows the standard chart of accounts structure and prevents validation errors.
