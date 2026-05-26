from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('hr', '0011_employeedocument'),
    ]

    operations = [
        migrations.AddField(
            model_name='salarycomponent',
            name='is_pensionable',
            field=models.BooleanField(
                default=False,
                help_text=(
                    'Include this earning in the pension contribution base '
                    '(Nigerian Pension Reform Act). '
                    'Set True for Basic Salary, Housing Allowance, and Transport Allowance only.'
                ),
            ),
        ),
        # Back-fill known pensionable component names that may already exist in the DB.
        migrations.RunSQL(
            sql="""
                UPDATE hr_salarycomponent
                SET is_pensionable = TRUE
                WHERE name IN ('Basic Salary', 'Housing Allowance', 'Transport Allowance');
            """,
            reverse_sql="""
                UPDATE hr_salarycomponent
                SET is_pensionable = FALSE
                WHERE name IN ('Basic Salary', 'Housing Allowance', 'Transport Allowance');
            """,
        ),
    ]
