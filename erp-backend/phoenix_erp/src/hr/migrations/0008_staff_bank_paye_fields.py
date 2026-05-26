# hr/migrations/0008_staff_bank_paye_fields.py
"""
Migration: Add paye_pin, bank_name, bank_account_number to Staff model.
These fields support the payroll Excel import and bank payment disbursement.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('hr', '0007_salary_component_taxable_payslip_paye'),
    ]

    operations = [
        migrations.AddField(
            model_name='staff',
            name='paye_pin',
            field=models.CharField(
                blank=True,
                max_length=50,
                help_text='PAYE / Tax Identification Number (TIN) for FIRS filing',
            ),
        ),
        migrations.AddField(
            model_name='staff',
            name='bank_name',
            field=models.CharField(
                blank=True,
                max_length=100,
                help_text='Bank name for salary disbursement',
            ),
        ),
        migrations.AddField(
            model_name='staff',
            name='bank_account_number',
            field=models.CharField(
                blank=True,
                max_length=20,
                help_text='Bank account number for salary disbursement',
            ),
        ),
    ]
