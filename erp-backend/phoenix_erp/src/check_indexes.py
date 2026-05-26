#!/usr/bin/env python
"""Check what indexes exist in the incomes tables"""
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'phoenix.settings')
django.setup()

from django.db import connection

with connection.cursor() as cursor:
    cursor.execute("""
        SELECT tablename, indexname 
        FROM pg_indexes 
        WHERE tablename LIKE 'incomes_%' 
        ORDER BY tablename, indexname;
    """)
    
    results = cursor.fetchall()
    
    print("\n=== INCOMES TABLE INDEXES ===\n")
    current_table = None
    for table, index in results:
        if table != current_table:
            print(f"\n{table}:")
            current_table = table
        print(f"  - {index}")
    
    print(f"\n\nTotal indexes: {len(results)}")
