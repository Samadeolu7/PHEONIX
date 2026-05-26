"""
Complete database reset script
Drops all tables and recreates the database schema from scratch
"""
import os
import django
import sys

# Setup Django
sys.path.insert(0, os.path.dirname(__file__))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'phoenix.settings')
django.setup()

from django.db import connection

def reset_database():
    """Drop all tables and sequences"""
    with connection.cursor() as cursor:
        print("Fetching all tables...")
        
        # Get all tables
        cursor.execute("""
            SELECT tablename FROM pg_tables 
            WHERE schemaname = 'public'
        """)
        tables = [row[0] for row in cursor.fetchall()]
        
        print(f"Found {len(tables)} tables")
        
        if tables:
            print("\nDropping all tables...")
            # Drop all tables with CASCADE
            for table in tables:
                try:
                    cursor.execute(f'DROP TABLE IF EXISTS "{table}" CASCADE')
                    print(f"  Dropped: {table}")
                except Exception as e:
                    print(f"  Error dropping {table}: {e}")
        
        # Get all sequences
        cursor.execute("""
            SELECT sequence_name FROM information_schema.sequences 
            WHERE sequence_schema = 'public'
        """)
        sequences = [row[0] for row in cursor.fetchall()]
        
        if sequences:
            print(f"\nDropping {len(sequences)} sequences...")
            for sequence in sequences:
                try:
                    cursor.execute(f'DROP SEQUENCE IF EXISTS "{sequence}" CASCADE')
                    print(f"  Dropped: {sequence}")
                except Exception as e:
                    print(f"  Error dropping {sequence}: {e}")
        
        print("\n✓ Database completely cleaned!")
        print("\nNext steps:")
        print("1. Run: python manage.py migrate")
        print("2. Run: python manage.py createsuperuser")
        print("3. Restart the Django server")

if __name__ == '__main__':
    print("=" * 60)
    print("  DATABASE COMPLETE RESET")
    print("=" * 60)
    print("\nWARNING: This will delete ALL data in the database!")
    print("Press Ctrl+C to cancel, or Enter to continue...")
    input()
    
    try:
        reset_database()
    except Exception as e:
        print(f"\n✗ Error: {e}")
        import traceback
        traceback.print_exc()
