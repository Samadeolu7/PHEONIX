from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('hr', '0014_hrconfig_enable_pension_default_true'),
    ]

    operations = [
        migrations.AddField(
            model_name='staff',
            name='is_pension_exempt',
            field=models.BooleanField(
                default=False,
                help_text='If True, pension contributions are not calculated for this staff member (e.g. contract staff)',
            ),
        ),
    ]
