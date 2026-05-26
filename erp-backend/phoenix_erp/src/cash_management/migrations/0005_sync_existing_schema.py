# Generated manually to sync Django's migration state with existing database schema
# The database already has all necessary columns from migration 0003
# This migration just marks the state as current without making changes
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('cash_management', '0004_add_bank_reconciliation_and_treasury_controls'),
    ]

    operations = [
        # No operations needed - schema is already correct
    ]
