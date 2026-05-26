from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('hr', '0013_alter_salarycomponent_is_taxable'),
    ]

    operations = [
        # 1. Update the column default so new rows default to True
        migrations.AlterField(
            model_name='hrconfig',
            name='enable_pension',
            field=models.BooleanField(
                default=True,
                help_text='Enable pension deduction and employer contribution for this branch',
            ),
        ),
        # 2. Back-fill existing configs that still have enable_pension=False
        migrations.RunSQL(
            sql='UPDATE hr_hrconfig SET enable_pension = TRUE WHERE enable_pension = FALSE;',
            reverse_sql='UPDATE hr_hrconfig SET enable_pension = FALSE WHERE enable_pension = TRUE;',
        ),
    ]
