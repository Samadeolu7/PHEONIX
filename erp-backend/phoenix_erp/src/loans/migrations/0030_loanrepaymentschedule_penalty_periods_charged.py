from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('loans', '0029_widen_fee_gl_account_to_include_liability'),
    ]

    operations = [
        migrations.AddField(
            model_name='loanrepaymentschedule',
            name='penalty_periods_charged',
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
    ]
