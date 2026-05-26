#!/usr/bin/env python
"""
Quick script to run the GRN accounting test
"""
import os
import sys
import django

# Add the src directory to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'phoenix_erp.settings')
django.setup()

# Run the test
if __name__ == '__main__':
    from django.core.management import call_command
    
    print("Running GRN Accounting Test...")
    print("=" * 80)
    
    # Run with verbose output
    call_command(
        'test',
        'inventory.tests.test_grn_accounting.GRNAccountingTest',
        verbosity=2,
        keepdb=True,  # Keep test DB for faster subsequent runs
    )
