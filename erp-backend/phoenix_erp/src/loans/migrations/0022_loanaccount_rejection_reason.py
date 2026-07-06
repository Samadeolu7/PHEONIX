from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('loans', '0021_interest_recognized_at_disbursement'),
    ]

    operations = [
        migrations.AddField(
            model_name='loanaccount',
            name='rejection_reason',
            field=models.TextField(blank=True),
        ),
    ]
