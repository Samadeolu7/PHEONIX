from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0001_initial'),
        ('hr', '0015_staff_is_pension_exempt'),
    ]

    operations = [
        migrations.AddField(
            model_name='salarycomponent',
            name='gl_account',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='salary_components',
                to='accounts.account',
                help_text=(
                    'For DEDUCTION components: the balance-sheet account that tracks this liability '
                    '(e.g. "Staff Advances and Loans" 1112). '
                    'When an advance is issued: Dr this account / Cr Bank. '
                    'When deducted at payroll: Dr Salary Payable / Cr this account.'
                ),
            ),
        ),
    ]
