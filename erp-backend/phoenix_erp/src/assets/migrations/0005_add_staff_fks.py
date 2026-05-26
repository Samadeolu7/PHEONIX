"""
Migration: Add staff FK fields to FixedAsset and AssetMaintenance

Changes:
  - FixedAsset.assigned_to_staff      → FK to hr.Staff  (who the asset is assigned to)
  - AssetMaintenance.performed_by_staff → FK to hr.Staff (who carried out the maintenance)

The existing CharField fields (assigned_to, performed_by) are kept for backward
compatibility with free-text entries. The new FKs enable direct traceability to
a real Staff record, which in turn enables:
  - Querying all assets assigned to a person
  - Linking maintenance costs to the responsible technician
"""
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('assets', '0004_add_maintenance_accounting'),
        ('hr', '0010_alter_payslip_employee_pension'),
    ]

    operations = [
        # FixedAsset — who the asset is currently assigned to
        migrations.AddField(
            model_name='fixedasset',
            name='assigned_to_staff',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='assigned_assets',
                to='hr.staff',
                help_text='Staff member this asset is currently assigned to',
            ),
        ),
        # AssetMaintenance — who performed/supervised the maintenance
        migrations.AddField(
            model_name='assetmaintenance',
            name='performed_by_staff',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='maintenance_performed',
                to='hr.staff',
                help_text='Staff member who performed or supervised the maintenance',
            ),
        ),
    ]
