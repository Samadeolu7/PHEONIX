"""
Migration: Add staff FK fields for full traceability

Changes:
  - ResourceConsumption.operator  → FK to hr.Staff (the person who drove/operated)
  - PrepaidVoucher.beneficiary_staff → FK to hr.Staff (the employee beneficiary)

These FKs sit alongside the existing CharField fields (operator_name, beneficiary_name)
for backward compatibility. The FKs enable:
  1. Direct traceability to a real staff record
  2. Creating payroll deduction requests (BonusDeductionRequest) from consumption irregularities
"""
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('expenses', '0006_prepaidexpense_accounts_payable'),
        ('hr', '0010_alter_payslip_employee_pension'),
    ]

    operations = [
        # ResourceConsumption.operator — who drove/operated/consumed
        migrations.AddField(
            model_name='resourceconsumption',
            name='operator',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='resource_consumptions_operated',
                to='hr.staff',
                help_text='Staff member who operated/consumed the resource (driver, technician)',
            ),
        ),
        # PrepaidVoucher.beneficiary_staff — the employee the voucher was issued to
        migrations.AddField(
            model_name='prepaidvoucher',
            name='beneficiary_staff',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='prepaid_vouchers',
                to='hr.staff',
                help_text='Staff beneficiary for employee-type vouchers',
            ),
        ),
    ]
