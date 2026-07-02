import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('cash_management', '0013_daily_collection_sheet'),
        ('banks', '0014_dailyreconciliation_is_deleted'),
    ]

    operations = [
        migrations.AddField(
            model_name='banktransfer',
            name='destination_type',
            field=models.CharField(
                choices=[('bank', 'Bank Account'), ('cashier', 'Cashier Account')],
                default='bank',
                help_text='Type of destination account',
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name='banktransfer',
            name='destination_bank_account',
            field=models.ForeignKey(
                blank=True,
                help_text='Destination bank account (if destination type is bank)',
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='incoming_transfers',
                to='banks.bankaccount',
            ),
        ),
        migrations.AddField(
            model_name='banktransfer',
            name='destination_cashier_account',
            field=models.ForeignKey(
                blank=True,
                help_text='Destination cashier account (if destination type is cashier)',
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='incoming_transfers',
                to='cash_management.cashieraccount',
            ),
        ),
    ]
