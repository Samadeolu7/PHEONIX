# cash_management/migrations/0006_add_receivable_to_cashcollection.py
"""
Add receivable field to CashCollection model
This allows income account to be derived from the invoice being paid
"""
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('cash_management', '0005_sync_existing_schema'),
        ('receivables', '0002_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='cashcollection',
            name='receivable',
            field=models.ForeignKey(
                blank=True,
                help_text='The receivable (invoice/loan/entitlement) being paid. The income account is automatically derived from this.',
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='cash_collections',
                to='receivables.customerreceivable'
            ),
        ),
    ]
