"""
Migration: add journal_entry FK traceability fields to expense models.

Gap 8: ResourceConsumption.journal_entry → links to the GL transaction created when posted
Gap 9: PrepaidExpense.journal_entry      → links to the initial GL entry (Dr Prepaid / Cr AP or Cash)
"""
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('expenses', '0007_add_staff_fks'),
        ('transactions', '0001_initial'),
    ]

    operations = [
        # Gap 9: journal entry FK on PrepaidExpense
        migrations.AddField(
            model_name='prepaidexpense',
            name='journal_entry',
            field=models.ForeignKey(
                blank=True,
                help_text='Initial GL journal entry (Dr Prepaid / Cr AP or Cash)',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='prepaid_postings',
                to='transactions.transaction',
            ),
        ),
        # Gap 8: journal entry FK on ResourceConsumption
        migrations.AddField(
            model_name='resourceconsumption',
            name='journal_entry',
            field=models.ForeignKey(
                blank=True,
                help_text='Journal entry created when this consumption was posted to GL',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='consumption_postings',
                to='transactions.transaction',
            ),
        ),
    ]
