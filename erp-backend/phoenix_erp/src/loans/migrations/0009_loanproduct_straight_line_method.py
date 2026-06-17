"""
Migration: add 'straight_line' as a choice for interest_calculation_method
and flip all existing products to straight_line (institutional default).

- Schema: alter the field default from 'reducing_balance' to 'straight_line'
- Data:   update every LoanProduct whose method is 'reducing_balance' or 'flat'
          to 'straight_line' (the institution uses straight-line / flat-rate only)
"""
from django.db import migrations, models


def set_straight_line(apps, schema_editor):
    LoanProduct = apps.get_model('loans', 'LoanProduct')
    LoanProduct.objects.filter(
        interest_calculation_method__in=['reducing_balance', 'flat', 'compound']
    ).update(interest_calculation_method='straight_line')


def revert_straight_line(apps, schema_editor):
    LoanProduct = apps.get_model('loans', 'LoanProduct')
    LoanProduct.objects.filter(
        interest_calculation_method='straight_line'
    ).update(interest_calculation_method='flat')


class Migration(migrations.Migration):

    dependencies = [
        ('loans', '0008_loanfeeapplication_audit_fields'),
    ]

    operations = [
        migrations.AlterField(
            model_name='loanproduct',
            name='interest_calculation_method',
            field=models.CharField(
                choices=[
                    ('straight_line', 'Straight Line'),
                    ('flat', 'Flat Rate'),
                    ('reducing_balance', 'Reducing Balance'),
                    ('compound', 'Compound Interest'),
                ],
                default='straight_line',
                max_length=20,
            ),
        ),
        migrations.RunPython(set_straight_line, revert_straight_line),
    ]
