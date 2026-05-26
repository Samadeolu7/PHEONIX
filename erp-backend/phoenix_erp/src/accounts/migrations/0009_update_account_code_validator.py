# Generated manually 2026-03-08
#
# Switches account codes from the old 3-digit (100-599) scheme to the
# FIRS/IFRS-compliant 4-digit scheme (1000-5999).
#
# Old format:  ^[1-5]\d{2}(-\d{3})?$   (e.g., 101, 140-001)
# New format:  ^\d{4}$                  (e.g., 1100, 1101)
#
# Parent-child relationships are maintained via ForeignKey, so dash
# notation in codes is no longer required or allowed.

import django.core.validators
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0008_account_is_cashier_bank'),
    ]

    operations = [
        # ── 1. Relax the code validator to allow 4-digit codes ──────────────
        migrations.AlterField(
            model_name='account',
            name='code',
            field=models.CharField(
                max_length=10,
                validators=[
                    django.core.validators.RegexValidator(
                        r'^\d{4}$',
                        'Account code must be exactly 4 digits (e.g., 1100, 1101). '
                        'Range: 1000–1999 Assets, 2000–2999 Liabilities, '
                        '3000–3999 Equity, 4000–4999 Revenue, 5000–5999 Expenses.',
                    )
                ],
                help_text='4-digit FIRS/IFRS account code.',
            ),
        ),

        # ── 2. Update AccountCategory section choice descriptions ────────────
        migrations.AlterField(
            model_name='accountcategory',
            name='section',
            field=models.PositiveSmallIntegerField(
                choices=[
                    (1, 'Assets (1000–1999)'),
                    (2, 'Liabilities (2000–2999)'),
                    (3, 'Equity (3000–3999)'),
                    (4, 'Revenue / Income (4000–4999)'),
                    (5, 'Expenses (5000–5999)'),
                ]
            ),
        ),
    ]
