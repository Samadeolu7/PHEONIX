"""
Migration: add debit_destination_used and savings_account_debited to LoanFeeApplication.

These fields complete the audit trail for each fee posting:
  - debit_destination_used: the actual destination ('cashier' or 'savings') used
  - savings_account_debited: FK to the specific savings account debited (when savings)
"""
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('loans', '0007_loanproductfee_debit_destination'),
        ('savings', '0003_savings_cycles_and_smart_savings'),
    ]

    operations = [
        migrations.AddField(
            model_name='loanfeeapplication',
            name='debit_destination_used',
            field=models.CharField(
                blank=True,
                default='',
                help_text="Actual debit destination used at posting time: 'cashier' or 'savings'.",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='loanfeeapplication',
            name='savings_account_debited',
            field=models.ForeignKey(
                blank=True,
                help_text="The savings account that was debited (when debit_destination_used='savings').",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='fee_debits',
                to='savings.savingsaccount',
            ),
        ),
    ]
