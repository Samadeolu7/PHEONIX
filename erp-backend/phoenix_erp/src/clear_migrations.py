"""
Clear migration history from database to fix inconsistent migration error
"""
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'phoenix.settings')
django.setup()

from django.db import connection

# Clear ALL migration records (including Django core apps)
cursor = connection.cursor()
cursor.execute("DELETE FROM django_migrations")
deleted_count = cursor.rowcount
connection.commit()

print(f"\n✅ SUCCESS: Deleted {deleted_count} migration records")
print("✅ Database migration history completely cleared")
print("\n📋 Next step: Run 'python manage.py migrate' to apply all migrations fresh\n")
