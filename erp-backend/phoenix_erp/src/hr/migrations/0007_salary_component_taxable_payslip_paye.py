# hr/migrations/0007_salary_component_taxable_payslip_paye.py
"""
Migration: Add is_taxable / description to SalaryComponent.
          Add taxable_income, annual_taxable_income, paye_breakdown to Payslip.
          Update allowances help_text to reflect new dict-of-dicts format.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('hr', '0006_staff_id_and_pension'),
    ]

    operations = [
        # ── SalaryComponent ─────────────────────────────────────────────────
        migrations.AddField(
            model_name='salarycomponent',
            name='is_taxable',
            field=models.BooleanField(
                default=True,
                help_text=(
                    'For EARNING components: include in PAYE taxable income. '
                    'Set False for statutory non-taxable allowances (transport, meal, housing '
                    '— where applicable under Nigerian PIT Act). '
                    'DEDUCTION components ignore this flag. '
                    'Pension is always on total gross regardless of this setting.'
                ),
            ),
        ),
        migrations.AddField(
            model_name='salarycomponent',
            name='description',
            field=models.TextField(
                blank=True,
                help_text='Optional description / notes about this component',
            ),
        ),
        # Update ordering to (component_type, name)
        migrations.AlterModelOptions(
            name='salarycomponent',
            options={'ordering': ['component_type', 'name']},
        ),

        # ── Payslip — PAYE audit fields ──────────────────────────────────────
        migrations.AddField(
            model_name='payslip',
            name='taxable_income',
            field=models.DecimalField(
                max_digits=18,
                decimal_places=2,
                default=0,
                help_text=(
                    'Monthly taxable income = sum of all taxable earnings '
                    '(basic + taxable allowances + overtime)'
                ),
            ),
        ),
        migrations.AddField(
            model_name='payslip',
            name='annual_taxable_income',
            field=models.DecimalField(
                max_digits=18,
                decimal_places=2,
                default=0,
                help_text='Annual taxable income = monthly_taxable_income * 12',
            ),
        ),
        migrations.AddField(
            model_name='payslip',
            name='paye_breakdown',
            field=models.JSONField(
                default=list,
                help_text=(
                    'List of PAYE band details for audit. '
                    'Each item: {band, rate, amount_in_band, tax_in_band, cumulative_balance}'
                ),
            ),
        ),
        # Update allowances help_text to reflect new format
        migrations.AlterField(
            model_name='payslip',
            name='allowances',
            field=models.JSONField(
                default=dict,
                help_text=(
                    "Dict of allowance_name: {amount, is_taxable}. "
                    "Example: {\"Housing Allowance\": {\"amount\": 50000, \"is_taxable\": true}}"
                ),
            ),
        ),
    ]
