import os
import sys
import django

# Ensure src is on path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'phoenix.settings')

django.setup()

from django.db import connection

TABLES = ['pages_module', 'pages_modulepage']

def q(sql, params=None):
    with connection.cursor() as c:
        c.execute(sql, params or [])
        return c.fetchall()

print('=== Columns ===')
for t in TABLES:
    rows = q("SELECT column_name, is_nullable, data_type, column_default FROM information_schema.columns WHERE table_name = %s ORDER BY ordinal_position", [t])
    print(f"\nTable: {t}")
    for r in rows:
        print('  ', r)

print('\n=== Constraints (pg_constraint) ===')
for t in TABLES:
    rows = q("SELECT conname, contype, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = %s::regclass", [t])
    print(f"\nTable: {t}")
    for r in rows:
        print('  ', r)

print('\n=== Indexes (pg_indexes) ===')
for t in TABLES:
    rows = q("SELECT indexname, indexdef FROM pg_indexes WHERE tablename = %s", [t])
    print(f"\nTable: {t}")
    for r in rows:
        print('  ', r)

print('\n=== Sample raw rows (first 5) ===')
for t in TABLES:
    rows = q(f"SELECT * FROM {t} LIMIT 5")
    print(f"\nTable: {t} -> {len(rows)} rows")
    for r in rows:
        print('  ', r)

print('\nInspector done.')
