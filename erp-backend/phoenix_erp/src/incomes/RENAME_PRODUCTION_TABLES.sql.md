# SQL Script to Rename Production Database Tables

##  Execute this in your PRODUCTION database ONLY

```sql
-- ======================================
-- RENAME TABLES FROM OLD TO NEW NAMES
-- ======================================

-- Rename main tables
ALTER TABLE IF EXISTS incomes_revenue RENAME TO incomes_income;
ALTER TABLE IF EXISTS incomes_revenuecategory RENAME TO incomes_incomecategory;

-- Rename sequences (auto-increment IDs)
ALTER SEQUENCE IF EXISTS incomes_revenue_id_seq RENAME TO incomes_income_id_seq;
ALTER SEQUENCE IF EXISTS incomes_revenuecategory_id_seq RENAME TO incomes_incomecategory_id_seq;

-- Django will automatically handle:
-- - Foreign key references
-- - Index names (already correct from migrations)
-- - Constraints

-- ======================================
-- VERIFICATION QUERIES
-- ======================================

-- Check that new tables exist
SELECT tablename FROM pg_tables 
WHERE tablename IN ('incomes_income', 'incomes_incomecategory')
ORDER BY tablename;

-- Check that old tables are gone
SELECT tablename FROM pg_tables 
WHERE tablename IN ('incomes_revenue', 'incomes_revenuecategory')
ORDER BY tablename;

-- Expected result:
-- incomes_income EXISTS
-- incomes_incomecategory EXISTS  
-- incomes_revenue DOES NOT EXIST
-- incomes_revenuecategory DOES NOT EXIST
```

## How to Execute

### Option 1: Using psql (Command Line)
```bash
psql -U your_username -d phoenix_db -f rename_tables.sql
```

### Option 2: Using Django dbshell
```bash
cd d:\\Users\\User\\Desktop\\PHEONIX-ERP\\erp-backend\\phoenix_erp\\src
python manage.py dbshell

-- Then paste the SQL commands
```

### Option 3: Using pgAdmin or DBeaver
1. Connect to phoenix_db database
2. Open SQL editor
3. Paste and execute the SQL

## IMPORTANT NOTES

1. **Backup First!**
   ```bash
   pg_dump -U your_username phoenix_db > backup_before_rename.sql
   ```

2. **Stop All Services** before running
   - Stop Django server
   - Stop Celery workers
   - Ensure no active connections to database

3. **Run Migrations After** to sync Django's migration history
   ```bash
   python manage.py migrate incomes --fake-initial
   ```

4. **Test Immediately**
   ```bash
   python manage.py test incomes.tests.test_production_readiness
   ```

## If Something Goes Wrong (Rollback)
```sql
-- Rename back to old names
ALTER TABLE incomes_income RENAME TO incomes_revenue;
ALTER TABLE incomes_incomecategory RENAME TO incomes_revenuecategory;

ALTER SEQUENCE incomes_income_id_seq RENAME TO incomes_revenue_id_seq;
ALTER SEQUENCE incomes_incomecategory_id_seq RENAME TO incomes_revenuecategory_id_seq;
```

## After Successful Rename

Your database will have:
- ✅ `incomes_income` (was incomes_revenue)
- ✅ `incomes_incomecategory` (was incomes_revenuecategory)  
- ✅ All foreign keys updated
- ✅ All indexes working
- ✅ Tests passing
- ✅ Production working

The models expect these new names, migrations create these names, so everything will be consistent!
