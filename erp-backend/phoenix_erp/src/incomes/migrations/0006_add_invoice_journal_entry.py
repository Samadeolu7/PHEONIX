# Generated migration for adding journal_entry field to Invoice model

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('transactions', '0003_add_financial_report_indexes'),
        ('incomes', '0005_add_service_item_and_fee_structure_component'),
    ]

    operations = [
        migrations.AddField(
            model_name='invoice',
            name='journal_entry',
            field=models.ForeignKey(
                blank=True,
                help_text='Journal entry created when invoice was posted (Dr. AR / Cr. Income)',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='invoices',
                to='transactions.transaction'
            ),
        ),
    ]
