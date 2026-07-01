"""
Migration: add unique partial index to prevent a client from having more than
one non-closed, non-deleted SavingsAccount per savings product.

IMPORTANT: Run `python manage.py merge_duplicate_accounts` BEFORE applying
this migration.  If duplicates exist in the database, the constraint
creation will fail with a unique-violation error.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('savings', '0007_add_payment_method_to_withdrawal'),
    ]

    operations = [
        migrations.AddConstraint(
            model_name='savingsaccount',
            constraint=models.UniqueConstraint(
                fields=['client', 'product'],
                condition=models.Q(is_deleted=False) & ~models.Q(status='closed'),
                name='unique_active_savings_per_client_product',
            ),
        ),
        migrations.AddIndex(
            model_name='savingsaccount',
            index=models.Index(fields=['client', 'product'], name='savings_sav_client_product_idx'),
        ),
    ]
