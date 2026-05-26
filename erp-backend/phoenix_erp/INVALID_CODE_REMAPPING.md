# Invalid Account Code Remapping Guide

## Summary

The dry-run generator found **15 validation failures** for account codes that don't conform to the 3-digit parent code constraint (100-599 range).

## Required Code Remappings

Based on the standard chart of accounts migration and SYSTEM_ACCOUNTS definitions:

### 4-Digit Parent Codes → 3-Digit Codes

| Old Code | Description | New Code | Notes |
|----------|-------------|----------|-------|
| `1000` | Assets (Root) | `100` | Top-level asset category - use 100 range |
| `1100` | Inventory/Current Assets | `120` | Matches SYSTEM_ACCOUNTS `'inventory'` |
| `1200` | Accounts Receivable | `140` | From migration remapping |
| `2000` | Liabilities (Root) | `200` | Top-level liability category - use 200 range |
| `3000` | Equity (Root) | `300` | Top-level equity category - use 300 range |
| `4000` | Income (Root) | `400` | Top-level income category - use 400 range |

### Out-of-Range Codes

| Old Code | Description | New Code | Notes |
|----------|-------------|----------|-------|
| `670` | Salary Expense | `580` | From migration remapping (old 670 → 580) |
| `670-001` | General Salary Expense | `580-001` | Child account follows parent remapping |
| `999` | Unknown (needs investigation) | TBD | Check source context - possibly test fixture |

## Files Requiring Manual Updates

### 1. `src/accounts/management/commands/setup_user_accounts.py`
**Lines: 60, 75, 90, 105**

- `1000` → `100` (Assets root)
- `2000` → `200` (Liabilities root)
- `3000` → `300` (Equity root)
- `4000` → `400` (Income root)

**Action**: Update all 4-digit category codes to 3-digit equivalents

### 2. `src/hr/services/payroll_accounting.py`
**Line: ~140-160 (multiple occurrences)**

- `670-001` → `580-001` (General Salary Expense)
- Parent code `670` → `580`

**Action**: Replace all references to 670/670-001 with 580/580-001

### 3. `src/incomes/models.py` (if present)
**Check for**: `1200` (Accounts Receivable)

- `1200` → `140` (per migration standard)
- `1200-XXX` → `140-XXX` (child accounts)

**Action**: Remap receivables accounts to 140 range

### 4. Test fixtures / Import scripts
**Check for**: `999`, `1100`, and other legacy codes

**Action**: Review context and remap to appropriate 3-digit codes

## Validation After Remapping

After applying code changes, re-run the generator:

```bash
python tools/generate_account_replacements.py
```

Expected result: **0 validation warnings**

All codes should now pass validation:
- Parent codes: 100-599 (3 digits)
- Child codes: XXX-YYY format (where XXX is valid parent)

## Reference: Standard Code Ranges

```
100-199: Assets
  101: Cash on Hand
  102: Bank Account
  110: Petty Cash
  120: Inventory Asset
  130: Prepaid Expenses
  140: Accounts Receivable
  150: Fixed Assets
  160: Accumulated Depreciation
  
200-299: Liabilities
  210: Accounts Payable
  220: Accrued Expenses
  230: Salaries Payable
  240: Interest Payable
  250: Tax Payable
  
300-399: Equity
  301: Owner's Equity
  310: Retained Earnings
  
400-499: Income/Revenue
  400: Sales Revenue
  410: Service Revenue
  420: Tuition Income
  430: Other Income
  440: Sales Returns
  
500-599: Expenses
  500: Cost of Goods Sold (COGS)
  501: General Expenses
  510: Operating Expenses
  520: Rent Expense
  530: Utilities Expense
  540: Insurance Expense
  550: Supplies Expense
  560: Advertising Expense
  570: Professional Fees
  580: Salary Expense (remapped from 670)
  590: Miscellaneous Expense
```

## Next Steps

1. ✅ **Completed**: Generator identifies invalid codes
2. ⏳ **Current**: Apply remapping to source files
3. ⏳ **Next**: Re-run generator to verify 0 validation warnings
4. ⏳ **Then**: Apply safe replacements across codebase
5. ⏳ **Finally**: Run test suite to ensure no breakage
