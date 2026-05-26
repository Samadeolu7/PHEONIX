from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('hr', '0016_salarycomponent_gl_account'),
    ]

    operations = [
        migrations.AddField(
            model_name='salarycomponent',
            name='is_advance',
            field=models.BooleanField(
                default=False,
                help_text=(
                    'For DEDUCTION components only. '
                    'Set True when this deduction represents a cash advance physically disbursed '
                    'to the staff member (e.g. Salary Advance, Staff Loan). '
                    'On approval a journal entry is posted: Dr gl_account / Cr Cash/Bank. '
                    'Set False for pure salary-reduction deductions (e.g. Development Levy, '
                    'cooperative dues) where no cash leaves the organisation at approval time.'
                ),
            ),
        ),
    ]
