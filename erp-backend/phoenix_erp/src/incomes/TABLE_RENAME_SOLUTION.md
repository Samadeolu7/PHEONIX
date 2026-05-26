# FINAL SOLUTION: Database Table Rename Strategy

## Problem Summary ✅ IDENTIFIED
**Production Database:** Has OLD table names (`incomes_revenue`, `incomes_revenuecategory`)  
**Models:** Expect NEW names (`incomes_income`, `incomes_incomecategory`)  
**Migrations:** Create tables with NEW names  
**Test Database:** Has NEW names (created by migrations)

## Root Cause
The models were renamed from `Revenue` → `Income` and `RevenueCategory` → `IncomeCategory`, but **no migration was created to rename the actual database tables**. So:
- Production DB still has old tables
- New deployments create new-named tables  
- Tests work (new names)
- Production broken (old names)

## Solution: Create Table Rename Migration

### Step 1: Create Migration to Rename Tables
```bash
python manage.py makemigrations incomes --empty --name rename_revenue_tables_to_income
```

### Step 2: Edit Migration to Rename Tables

```python
# incomes/migrations/0006_rename_revenue_tables_to_income.py
from django.db import migrations

class Migration(migrations.Migration):

    dependencies = [
        ('incomes', '0005_rename_incomes_rev_referen_eff59d_idx_incomes_inc_referen_ac035b_idx_and_more'),
    ]

    operations = [
        # Rename Revenue model → Income model
        # This renames incomes_revenue → incomes_income
        migrations.RenameModel(
            old_name='Revenue',
            new_name='Income',
        ),
        
        # Rename RevenueCategory model → IncomeCategory model  
        # This renames incomes_revenuecategory → incomes_incomecategory
        migrations.RenameModel(
            old_name='RevenueCategory',
            new_name='IncomeCategory',
        ),
    ]
```

### Step 3: Apply Migration
```bash
# On production (renames tables)
python manage.py migrate incomes

# On test database (no-op - tables already have correct names)
python manage.py test
```

## What This Does
1. **Production:** Renames `incomes_revenue` → `incomes_income` and `incomes_revenuecategory` → `incomes_incomecategory`
2. **Test:** Sees that tables already have correct names, skips
3. **Indexes:** Automatically renamed by Django
4. **Foreign Keys:** Automatically updated by Django

## Alternative (If Migration 0001 Already Has Revenue Models)
If the first migration created these models as "Revenue" and "RevenueCategory", we need to check the migration history and possibly:

1. **Check migration 0001:**
```bash
grep "class Revenue" incomes/migrations/0001_initial.py
```

2. **If found:** Add `RenameModel` operations to a new migration
3. **If not found:** Models were always called Income/IncomeCategory, so production DB just needs manual rename

## Manual Rename (If Needed)
If you want to rename without migration (NOT RECOMMENDED but faster):

```sql
-- Connect to production DB
ALTER TABLE incomes_revenue RENAME TO incomes_income;
ALTER TABLE incomes_revenuecategory RENAME TO incomes_incomecategory;

-- Update sequences
ALTER SEQUENCE incomes_revenue_id_seq RENAME TO incomes_income_id_seq;
ALTER SEQUENCE incomes_revenuecategory_id_seq RENAME TO incomes_incomecategory_id_seq;
```

## RECOMMENDED APPROACH ✅
**Create the RenameModel migration** - it's safe, reversible, and Django-native.

Let me create this migration for you now.
