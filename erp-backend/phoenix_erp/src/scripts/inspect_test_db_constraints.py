import os
import sys
import django

# Ensure src is on path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'phoenix.settings')

django.setup()

from django.conf import settings
import psycopg

# Determine test DB name
default_db = settings.DATABASES['default']
default_name = default_db.get('NAME')
test_name = os.environ.get('TEST_DB_NAME') or f"test_{default_name}"

print('Connecting to test DB:', test_name)
conn_info = {
    'host': default_db.get('HOST') or 'localhost',
    'port': default_db.get('PORT') or '5432',
    'user': default_db.get('USER'),
    'password': default_db.get('PASSWORD'),
    'dbname': test_name,
}

print('Conn info host=%s port=%s user=%s db=%s' % (conn_info['host'], conn_info['port'], conn_info['user'], conn_info['dbname']))

with psycopg.connect(**conn_info) as conn:
    with conn.cursor() as cur:
        # Actual DB table names defined in pages.models: 'modules' and 'module_pages'
        tables = ['modules', 'module_pages']

        print('\n=== Columns ===')
        for t in tables:
            cur.execute("SELECT column_name, is_nullable, data_type, column_default FROM information_schema.columns WHERE table_name = %s ORDER BY ordinal_position", (t,))
            rows = cur.fetchall()
            print(f"\nTable: {t}")
            for r in rows:
                print('  ', r)

        print('\n=== Constraints (pg_constraint) ===')
        for t in tables:
            cur.execute("SELECT conname, contype, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = %s::regclass", (t,))
            rows = cur.fetchall()
            print(f"\nTable: {t}")
            for r in rows:
                print('  ', r)

        print('\n=== Indexes (pg_indexes) ===')
        for t in tables:
            cur.execute("SELECT indexname, indexdef FROM pg_indexes WHERE tablename = %s", (t,))
            rows = cur.fetchall()
            print(f"\nTable: {t}")
            for r in rows:
                print('  ', r)

        print('\n=== Sample raw rows (first 5) ===')
        for t in tables:
            cur.execute(f"SELECT * FROM {t} LIMIT 5")
            rows = cur.fetchall()
            print(f"\nTable: {t} -> {len(rows)} rows")
            for r in rows:
                print('  ', r)

print('\nDone.')
