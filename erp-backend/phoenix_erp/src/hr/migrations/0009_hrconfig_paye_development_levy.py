# hr/migrations/0009_hrconfig_paye_development_levy.py
"""
Migration: Add PAYE and Development Levy configuration fields to HRConfig.

New fields:
  enable_paye                    – toggle for automatic PAYE calculation (default: True)
  enable_development_levy        – toggle for per-employee annual Development Levy (default: True)
  development_levy_annual_amount – flat annual amount per employee (default: ₦1,000)

Background:
  The Nigeria Tax Act 2024 (NTA 2024) maintains the Development Levy as a flat
  per-employee charge (₦1,000/year) while abolishing the old Consolidated Relief
  Allowance (CRA).  The PAYE bands are already stored as class constants in
  HRConfig.PAYE_BANDS and reflect the NTA 2024 graduated rates.
"""
import django.core.validators
from decimal import Decimal
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('hr', '0008_staff_bank_paye_fields'),
    ]

    operations = [
        # ── PAYE toggle ───────────────────────────────────────────────────────
        migrations.AddField(
            model_name='hrconfig',
            name='enable_paye',
            field=models.BooleanField(
                default=True,
                help_text='Enable automatic PAYE tax calculation using the Nigerian Tax Act 2024 bands',
            ),
        ),

        # ── Development Levy toggle ───────────────────────────────────────────
        migrations.AddField(
            model_name='hrconfig',
            name='enable_development_levy',
            field=models.BooleanField(
                default=True,
                help_text='Deduct the annual Development Levy per employee (NTA 2024)',
            ),
        ),

        # ── Development Levy amount ───────────────────────────────────────────
        migrations.AddField(
            model_name='hrconfig',
            name='development_levy_annual_amount',
            field=models.DecimalField(
                max_digits=10,
                decimal_places=2,
                default=Decimal('1000.00'),
                validators=[django.core.validators.MinValueValidator(Decimal('0.00'))],
                help_text='Annual Development Levy per employee in local currency (standard: ₦1,000/year)',
            ),
        ),
    ]
