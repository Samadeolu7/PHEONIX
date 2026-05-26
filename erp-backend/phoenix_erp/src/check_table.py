from django.db import connection

cursor = connection.cursor()
cursor.execute("""
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns 
    WHERE table_name = 'accounts_accountcategory' 
    ORDER BY ordinal_position
""")

print("Columns in accounts_accountcategory table:")
print("-" * 60)
for row in cursor.fetchall():
    print(f"{row[0]:30} {row[1]:20} NULL: {row[2]}")
