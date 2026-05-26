"""
Migration: Add accounts_payable FK to PrepaidExpense

When a prepaid expense is backed by a supplier, the initial GL entry is
  Dr  Prepaid Expense (Asset)
  Cr  Accounts Payable (Liability → supplier)

This FK links the prepaid record back to that AP so payment status can be
tracked and the bank-payment workflow can clear it correctly.
"""
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('expenses', '0005_add_odometer_reading_to_prepaid_voucher'),
        ('liabilities', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='prepaidexpense',
            name='accounts_payable',
            field=models.ForeignKey(
                blank=True,
                help_text='AP record created when this prepaid is backed by a supplier payable',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='prepaid_expenses',
                to='liabilities.accountspayable',
            ),
        ),
    ]
