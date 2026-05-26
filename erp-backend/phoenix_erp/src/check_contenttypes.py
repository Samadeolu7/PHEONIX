import psycopg

conn = psycopg.connect('dbname=phoenix_db user=phoenix_erp password=phoenix123 host=localhost')
cur = conn.cursor()

# Check django_content_type table structure
cur.execute("""
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name='django_content_type'
    ORDER BY ordinal_position
""")

print("django_content_type columns:")
for row in cur.fetchall():
    print(f"  {row[0]}: {row[1]}")

conn.close()
