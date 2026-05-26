import os
import sys
import time
import psycopg

# Read DB config from env or defaults (match settings)
DB_NAME = os.environ.get('DB_NAME', 'phoenix_db')
DB_USER = os.environ.get('DB_USER', 'postgres')
DB_PASSWORD = os.environ.get('DB_PASSWORD', 'samore7')
DB_HOST = os.environ.get('DB_HOST', 'localhost')
DB_PORT = os.environ.get('DB_PORT', '5432')

conn_info = dict(host=DB_HOST, port=DB_PORT, user=DB_USER, password=DB_PASSWORD, dbname=DB_NAME)
print('Connecting to', conn_info)

# Use two separate connections
conn1 = psycopg.connect(**conn_info)
conn2 = psycopg.connect(**conn_info)

try:
    cur1 = conn1.cursor()
    cur2 = conn2.cursor()

    # Clean up any existing rows for chosen owner/branch/code for demo
    owner_id = 1
    branch_id = 1
    code = 'demo_accounts'
    cur1.execute("DELETE FROM module_pages WHERE code = %s", (code,))
    cur1.execute("DELETE FROM modules WHERE code = %s", (code,))
    conn1.commit()

    print('Starting transaction 1: insert but do NOT commit yet')
    cur1.execute("BEGIN")
    cur1.execute(
        "INSERT INTO modules (created_at, updated_at, code, name, description, icon, color, \"order\", is_active, required_permission, is_deleted, owner_id, branch_id, tenant_id) VALUES (now(), now(), %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NULL) RETURNING id",
        (code, 'Demo Accounts', 'desc', 'book', '#111111', 0, True, '', False, owner_id, branch_id)
    )
    row = cur1.fetchone()
    print('Inserted in tx1 id=', row[0])

    print('\nIn separate connection (tx2), try to SELECT before commit:')
    cur2.execute("SELECT id FROM modules WHERE code = %s AND owner_id=%s AND branch_id=%s", (code, owner_id, branch_id))
    rows = cur2.fetchall()
    print('tx2 select rows before commit:', rows)

    print('\nIn tx2, try to INSERT same unique key (will this block or error?)')
    try:
        cur2.execute("BEGIN")
        cur2.execute(
            "INSERT INTO modules (created_at, updated_at, code, name, description, icon, color, \"order\", is_active, required_permission, is_deleted, owner_id, branch_id, tenant_id) VALUES (now(), now(), %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NULL) RETURNING id",
            (code, 'Demo Accounts 2', 'desc2', 'book', '#222222', 0, True, '', False, owner_id, branch_id)
        )
        row2 = cur2.fetchone()
        print('tx2 inserted id=', row2[0])
    except Exception as e:
        print('tx2 insert exception:', e)

    print('\nNow commit tx1')
    try:
        conn1.commit()
        print('tx1 committed')
    except Exception as e:
        print('tx1 commit exception:', e)

    print('\nTry to commit tx2 now')
    try:
        conn2.commit()
        print('tx2 committed')
    except Exception as e:
        print('tx2 commit exception:', e)

    print('\nFinal select (conn1)')
    cur1.execute("SELECT id, code FROM modules WHERE code = %s", (code,))
    print(cur1.fetchall())

finally:
    cur1.close()
    cur2.close()
    conn1.close()
    conn2.close()

print('Demo done')
