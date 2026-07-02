from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('banks', '0013_bankaccount_feed_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='dailyreconciliation',
            name='is_deleted',
            field=models.BooleanField(default=False),
        ),
    ]
