# CRITICAL: Account Model Unique Constraint Fix

## Issue Discovered

**Date**: January 19, 2026  
**Severity**: CRITICAL - Blocks multi-tenant functionality  
**Status**: FIXED

### Problem

The `Account` model had a unique constraint on **`code` only**:

```python
# INCORRECT - Global uniqueness prevents multi-tenant usage
models.UniqueConstraint(
    fields=['code'],
    condition=models.Q(is_deleted=False),
    name='unique_code_when_not_deleted'
)
```

This meant:
- ❌ Only ONE tenant in the entire system could use account code "101"
- ❌ Second tenant trying to create "101 - Cash on Hand" would get IntegrityError
- ❌ All `get_or_create(code='101', owner=X, branch=Y)` calls would fail for tenant #2+
- ❌ Multi-tenant architecture completely broken for accounts

### Solution

Changed unique constraint to **`(code, owner, branch)`**:

```python
# CORRECT - Each tenant has independent chart of accounts
models.UniqueConstraint(
    fields=['code', 'owner', 'branch'],
    condition=models.Q(is_deleted=False),
    name='unique_code_per_owner_branch_when_not_deleted'
)
```

Now:
- ✅ Each tenant can have their own "101 - Cash on Hand"
- ✅ Account codes are unique per tenant/branch combination
- ✅ `get_or_create(code='101', owner=X, branch=Y)` works correctly
- ✅ True multi-tenant isolation for chart of accounts

---

## Migration Required

### Step 1: Generate Migration

```bash
cd erp-backend/phoenix_erp
python manage.py makemigrations accounts
```

This will create a migration that:
1. Drops the old `unique_code_when_not_deleted` constraint
2. Creates new `unique_code_per_owner_branch_when_not_deleted` constraint

### Step 2: Check for Conflicts

Before applying, check if any code conflicts exist:

```python
# Run this in Django shell
from accounts.models import Account
from django.db.models import Count

# Find duplicate codes across different owners/branches
duplicates = Account.objects.values('code').annotate(
    count=Count('id')
).filter(count__gt=1, is_deleted=False)

for dup in duplicates:
    print(f"Code {dup['code']} used {dup['count']} times")
    accounts = Account.objects.filter(code=dup['code'], is_deleted=False)
    for acc in accounts:
        print(f"  - Owner: {acc.owner_id}, Branch: {acc.branch_id}, Name: {acc.name}")
```

### Step 3: Resolve Conflicts (if any)

If duplicates exist (unlikely in fresh system):

**Option A: Assign unique codes per tenant**
```python
# Example: Rename second tenant's accounts
account = Account.objects.get(code='101', owner_id=2)
account.code = '101'  # Keep same - will be unique with new constraint
account.save()
```

**Option B: Use child account format**
```python
# Convert to child accounts if appropriate
account = Account.objects.get(code='101', owner_id=2)
parent = Account.objects.get(code='101', owner_id=1, account_level='PARENT')
account.code = '101-001'
account.account_level = 'CHILD'
account.parent = parent
account.save()
```

### Step 4: Apply Migration

```bash
python manage.py migrate accounts
```

---

## Impact Assessment

### Systems Affected

1. **Expense Accounting** ✅ Fixed
   - All `_get_*_account()` methods use `get_or_create(code, owner, branch)`
   - Will work correctly after migration

2. **Inventory Accounting** ✅ Fixed
   - All account lookups use proper `(code, owner, branch)` tuple
   - No changes needed

3. **Income Accounting** ✅ Fixed
   - AR/Cash account creation uses correct pattern
   - Migration will resolve any existing conflicts

4. **HR/Payroll** ✅ Fixed
   - Salary/Tax/Payable accounts use proper pattern
   - Will work correctly after migration

### Testing Checklist

After migration:

- [ ] Create expense in Tenant A with code 101 - should succeed
- [ ] Create expense in Tenant B with code 101 - should succeed (was failing before)
- [ ] Verify both tenants see their own "Cash on Hand" account
- [ ] Post resource consumption - should auto-create AP account (210)
- [ ] Verify no IntegrityErrors in logs
- [ ] Test invoice payment with multiple tenants
- [ ] Verify account balances are isolated per tenant

---

## Code Format Rules (Clarified)

### Parent Accounts

**Format**: 3 digits (100-599)

```python
# Examples
account, created = Account.objects.get_or_create(
    code='101',  # 3 digits only
    owner=owner,
    branch=branch,
    defaults={
        'name': 'Cash on Hand',
        'account_type': 'ASSET',
        'account_level': 'PARENT',  # Must be PARENT
        'parent': None  # Must be None
    }
)
```

Valid parent codes: `100`, `101`, `210`, `400`, `501`, `599`
Invalid: `99`, `600`, `1000`, `101-001`

### Child Accounts

**Format**: XXX-YYY (parent code + dash + 3 digits)

```python
# Examples
parent_account = Account.objects.get(code='101', owner=owner, branch=branch)

child_account, created = Account.objects.get_or_create(
    code='101-001',  # Parent code + dash + 3 digits
    owner=owner,
    branch=branch,
    defaults={
        'name': 'Petty Cash - Main Office',
        'account_type': 'ASSET',  # Must match parent
        'account_level': 'CHILD',  # Must be CHILD
        'parent': parent_account  # Must reference parent
    }
)
```

Valid child codes: `101-001`, `101-999`, `210-001`, `400-123`
Invalid: `101-1`, `101-1234`, `101-ABC`, `101001`

### Validation Regex

Pattern: `^[1-5]\d{2}(-\d{3})?$`

**Breakdown:**
- `^[1-5]` - First digit must be 1-5 (account type indicator)
- `\d{2}` - Two more digits (complete 3-digit parent code)
- `(-\d{3})?` - Optional: dash followed by 3 digits (child suffix)
- `$` - End of string

---

## Related Updates

1. ✅ **STANDARD_CHART_OF_ACCOUNTS.md** - Updated with code format rules
2. ✅ **ACCOUNT_LOOKUP_STANDARDIZATION.md** - Documents get_or_create pattern
3. ✅ **accounts/models.py** - Fixed unique constraint
4. ✅ **All accounting services** - Use correct (code, owner, branch) pattern

---

## Rollback Plan

If migration causes issues:

```bash
# Rollback migration
python manage.py migrate accounts <previous_migration_name>

# Restore old constraint
python manage.py dbshell
# Then run SQL to restore old constraint
```

However, **rollback is NOT recommended** as it will break multi-tenant functionality.

---

## Future Considerations

### Account Code Prefixes

Consider using tenant-specific prefixes in the future:

```python
# Current: All tenants use same codes
Tenant A: 101 - Cash on Hand
Tenant B: 101 - Cash on Hand

# Future option: Tenant prefixes
Tenant A: 101 - Cash on Hand
Tenant B: 101 - Cash on Hand (same code, different owner/branch)

# Or with prefix system:
Tenant A: T1-101 - Cash on Hand
Tenant B: T2-101 - Cash on Hand
```

Current approach (same codes, different owner/branch) is cleaner for reporting.

### Account Code Ranges

Standard numbering already provides good separation:
- 100-199: Assets
- 200-299: Liabilities  
- 300-399: Equity
- 400-499: Income
- 500-599: Expenses (COGS + Operating)

This provides 100 parent accounts per category, each supporting 999 children.

---

**Resolution**: FIXED - Migration must be applied before deploying to production  
**Priority**: P0 - Blocks multi-tenant functionality  
**Owner**: Development Team  
**Review**: Finance Team (for account code standards)
