"""
Migration: add journal_entry FK traceability fields to asset models.

Gap 5: AssetDepreciation.journal_entry  → links to the GL transaction created when posted
Gap 6: AssetMaintenance.journal_entry   → links to the GL transaction created when posted
Gap 7: FixedAsset.disposal_journal_entry → links to the disposal GL transaction
"""
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('assets', '0005_add_staff_fks'),
        ('transactions', '0001_initial'),
    ]

    operations = [
        # Gap 7: disposal journal entry FK on FixedAsset
        migrations.AddField(
            model_name='fixedasset',
            name='disposal_journal_entry',
            field=models.ForeignKey(
                blank=True,
                help_text='Journal entry recording the asset disposal / sale',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='disposed_assets',
                to='transactions.transaction',
            ),
        ),
        # Gap 5: journal entry FK on AssetDepreciation
        migrations.AddField(
            model_name='assetdepreciation',
            name='journal_entry',
            field=models.ForeignKey(
                blank=True,
                help_text='Journal entry recording this depreciation charge',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='depreciation_entries',
                to='transactions.transaction',
            ),
        ),
        # Gap 6: journal entry FK on AssetMaintenance
        migrations.AddField(
            model_name='assetmaintenance',
            name='journal_entry',
            field=models.ForeignKey(
                blank=True,
                help_text='Journal entry recording this maintenance expense',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='maintenance_entries',
                to='transactions.transaction',
            ),
        ),
    ]
