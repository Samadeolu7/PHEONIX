# Code Uniqueness Analysis - Multi-Tenant Issues

## Executive Summary

**Date**: January 19, 2026  
**Critical Issues Found**: Multiple models using globally unique `code` fields  
**Impact**: Breaks multi-tenant functionality across the system  
**Priority**: P0 - Must fix before production deployment

---

## Classification of Issues

### ✅ Category 1: CORRECTLY SCOPED (No Action Needed)

These models properly scope `code` uniqueness to tenant/branch:

| Model | Unique Constraint | Status |
|-------|------------------|--------|
| **ExpenseCategory** | `('branch', 'code')` | ✅ Correct |
| **InventoryCategory** | `('branch', 'code')` | ✅ Correct |
| **InventoryLocation** | `('branch', 'code')` | ✅ Correct |
| **HR Department** | `('branch', 'code')` | ✅ Correct |
| **NotificationTemplate** | `('branch', 'code')` | ✅ Correct |
| **Asset** | `('branch', 'code')` | ✅ Correct |
| **Product** | `('branch', 'code')` | ✅ Correct |
| **ProductVariant** | `('product', 'code')` | ✅ Correct |
| **Module** (pages) | `('owner', 'branch', 'code')` | ✅ Correct |
| **PageInstance** | `('owner', 'branch', 'context', 'code')` | ✅ Correct |
| **Resource** (expenses) | `('branch', 'resource_code')` | ✅ Correct |

---

### ⚠️ Category 2: SYSTEM-WIDE UNIQUE (Needs Review)

These should be globally unique (system configuration, not tenant data):

| Model | Field | Purpose | Assessment |
|-------|-------|---------|------------|
| **TransactionSeries** | `code` | System-wide transaction prefixes (CA, LN, JV) | ⚠️ Needs review - should tenants share or have separate series? |
| **Branch** | `code` | Branch identification across system | ⚠️ Needs review - branches might be shared or tenant-specific |
| **Industry** | `code` | Industry classifications (global reference) | ✅ Correct - system reference data |
| **ReportCategory** | `code` | Report categorization (global) | ✅ Correct - system configuration |
| **ReportTemplate** | `code` | Report templates (global) | ⚠️ Needs review - should tenants customize? |
| **NotificationChannel** | `code` | Notification channels (email, sms, etc.) | ✅ Correct - system configuration |

---

### 🔴 Category 3: CRITICAL BUGS (Must Fix)

These models have global unique `code` but should be tenant-scoped:

#### 1. **IncomeCategory** 🔴 CRITICAL
```python
# CURRENT (BROKEN)
code = models.CharField(max_length=20, unique=True)

# SHOULD BE
class Meta:
    unique_together = [('owner', 'branch', 'code')]
    # OR
    constraints = [
        models.UniqueConstraint(
            fields=['code', 'owner', 'branch'],
            condition=models.Q(is_deleted=False),
            name='unique_income_category_code_per_tenant'
        )
    ]
```

**Impact**: Only ONE tenant can have "TUITION" as income category code  
**Used In**: Income tracking, fee structures, revenue recognition  
**Business Impact**: High - blocks multi-school deployments

---

#### 2. **FeeStructure** 🔴 CRITICAL
```python
# CURRENT (BROKEN)
code = models.CharField(max_length=20, unique=True)

# SHOULD BE
class Meta:
    unique_together = [('owner', 'branch', 'code')]
```

**Impact**: Only ONE school can have "TERM1-2026" fee structure  
**Used In**: Student billing, receivables, payments  
**Business Impact**: Critical - completely breaks school fee management for multiple tenants

---

#### 3. **ClientClassification** 🔴 HIGH
```python
# CURRENT (BROKEN)
code = models.CharField(max_length=20, unique=True, db_index=True)

# SHOULD BE
class Meta:
    unique_together = [('owner', 'branch', 'code')]
```

**Impact**: Only ONE tenant can have "VIP" client classification  
**Used In**: Client categorization, credit limits, special rates  
**Business Impact**: High - limits client segmentation strategies

---

#### 4. **AcademicYear** 🔴 HIGH
```python
# CURRENT (BROKEN)
code = models.CharField(max_length=20, unique=True)  # e.g., "AY2025"

# SHOULD BE
class Meta:
    unique_together = [('owner', 'code')]  # Academic years can span branches
```

**Impact**: Only ONE school can use "AY2025"  
**Used In**: Fee structures, student enrollment, academic calendars  
**Business Impact**: Critical for multi-school SaaS deployment

---

#### 5. **DiscountProgram** 🔴 HIGH
```python
# CURRENT (BROKEN)
program_code = models.CharField(max_length=50, unique=True)

# SHOULD BE
class Meta:
    unique_together = [('owner', 'branch', 'program_code')]
```

**Impact**: Only ONE institution can have "SCHOLAR-MERIT-2026"  
**Used In**: Scholarships, fee discounts, financial aid  
**Business Impact**: High - blocks independent scholarship programs per tenant

---

#### 6. **Supplier** (procurement) 🔴 MEDIUM
```python
# CURRENT (BROKEN)
supplier_code = models.CharField(max_length=50, unique=True)

# SHOULD BE
class Meta:
    unique_together = [('owner', 'branch', 'supplier_code')]
```

**Impact**: Only ONE tenant can have supplier "SUP-001"  
**Used In**: Purchase orders, goods receipt, accounts payable  
**Business Impact**: Medium - limits vendor management

---

### 📊 Category 4: WORKFLOW/AUTOMATION (Special Handling)

#### WorkflowRun / AutomationRun
```python
run_reference = models.CharField(max_length=30, unique=True)
```

**Assessment**: ⚠️ Needs special handling
- Run references are auto-generated (not user-provided)
- Should include tenant ID in the reference format
- Example: `T001-WF-20260119-0001` (Tenant 001, Workflow, Date, Sequence)

**Recommendation**: Add tenant prefix to auto-generated references

---

## Impact Matrix

| Model | Tenant Impact | Priority | Migration Complexity |
|-------|--------------|----------|---------------------|
| Account | ✅ FIXED | P0 | Medium |
| IncomeCategory | 🔴 Broken | P0 | Low |
| FeeStructure | 🔴 Broken | P0 | Low |
| AcademicYear | 🔴 Broken | P0 | Low |
| DiscountProgram | 🔴 Broken | P0 | Medium |
| ClientClassification | 🔴 Broken | P1 | Low |
| Supplier | 🔴 Broken | P1 | Medium |
| TransactionSeries | ⚠️ Review needed | P2 | High |
| Branch | ⚠️ Review needed | P2 | High |
| WorkflowRun | ⚠️ Needs prefix | P2 | Medium |

---

## Recommended Fixes

### Fix 1: IncomeCategory
```python
# incomes/models.py
class IncomeCategory(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    name = models.CharField(max_length=200)
    code = models.CharField(max_length=20)  # Remove unique=True
    # ... other fields
    
    class Meta:
        unique_together = [('owner', 'branch', 'code')]
        ordering = ['code']
```

### Fix 2: FeeStructure
```python
# incomes/models.py
class FeeStructure(...):
    code = models.CharField(max_length=20)  # Remove unique=True
    
    class Meta:
        unique_together = [('owner', 'branch', 'code')]
```

### Fix 3: ClientClassification
```python
# clients/models.py
class ClientClassification(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    code = models.CharField(max_length=20, db_index=True)  # Remove unique=True
    
    class Meta:
        unique_together = [('owner', 'branch', 'code')]
```

### Fix 4: AcademicYear
```python
# incomes/models.py
class AcademicYear(...):
    code = models.CharField(max_length=20)  # Remove unique=True
    
    class Meta:
        unique_together = [('owner', 'code')]  # Owner level, not branch
```

### Fix 5: DiscountProgram
```python
# incomes/models.py
class DiscountProgram(...):
    program_code = models.CharField(max_length=50, db_index=True)  # Remove unique=True
    
    class Meta:
        unique_together = [('owner', 'branch', 'program_code')]
```

### Fix 6: Supplier
```python
# procurement/models.py
class Supplier(...):
    supplier_code = models.CharField(max_length=50, db_index=True)  # Remove unique=True
    
    class Meta:
        unique_together = [('owner', 'branch', 'supplier_code')]
```

---

## Migration Strategy

### Phase 1: Critical Fixes (P0) - DO NOW
1. IncomeCategory
2. FeeStructure  
3. AcademicYear
4. DiscountProgram

**Estimated Impact**: Blocks multi-tenant production deployment

### Phase 2: High Priority (P1) - Next Sprint
1. ClientClassification
2. Supplier

**Estimated Impact**: Limits functionality but system operational

### Phase 3: Review & Design (P2) - Following Sprint
1. TransactionSeries (needs design decision)
2. Branch (needs tenant architecture review)
3. WorkflowRun (needs reference format design)

---

## Testing Checklist

After each fix, test:

- [ ] Tenant A creates code "ABC" - succeeds
- [ ] Tenant B creates code "ABC" - succeeds (was failing before)
- [ ] Tenant A creates duplicate "ABC" - fails with IntegrityError
- [ ] Verify data isolation - Tenant A cannot see Tenant B's "ABC"
- [ ] Test all get_or_create calls with (code, owner, branch)
- [ ] Verify existing data not corrupted

---

## Code Search Patterns

To find similar issues:

```bash
# Find models with unique=True on code field
grep -r "code.*unique=True" src/*/models.py

# Find UniqueConstraint on code only
grep -r "UniqueConstraint.*fields=\['code'\]" src/

# Find unique_together without owner/branch
grep -r "unique_together.*=.*code" src/*/models.py | grep -v owner | grep -v branch
```

---

## Related Documentation

- [CRITICAL_ACCOUNT_CONSTRAINT_FIX.md](CRITICAL_ACCOUNT_CONSTRAINT_FIX.md) - Account model fix (completed)
- [STANDARD_CHART_OF_ACCOUNTS.md](STANDARD_CHART_OF_ACCOUNTS.md) - Multi-tenant account codes
- [ACCOUNT_LOOKUP_STANDARDIZATION.md](ACCOUNT_LOOKUP_STANDARDIZATION.md) - get_or_create patterns

---

## Decision Log

### TransactionSeries - Pending Decision

**Options:**
1. **System-wide shared** (current) - All tenants use same series codes (CA, LN, JV)
   - Pros: Consistent numbering, simpler
   - Cons: Tenants can't customize series

2. **Tenant-specific** - Each tenant has their own series
   - Pros: Full customization per tenant
   - Cons: More complex, migration needed

**Recommendation**: Keep system-wide for now, add tenant prefix to reference numbers

### Branch - Pending Decision

**Questions:**
1. Are branches shared across tenants? (e.g., franchise model)
2. Or is each branch owned by exactly one tenant?

**Recommendation**: Needs business requirements clarification

---

**Status**: Phase 1 fixes required before production  
**Owner**: Development Team  
**Review Date**: Weekly until resolved  
**Blockers**: None - can proceed with fixes immediately
