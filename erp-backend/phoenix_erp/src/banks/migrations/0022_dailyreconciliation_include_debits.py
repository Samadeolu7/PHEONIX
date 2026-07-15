from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('banks', '0021_backfill_reconciliation_counts'),
    ]

    operations = [
        migrations.AddField(
            model_name='dailyreconciliation',
            name='include_debits',
            field=models.BooleanField(
                default=False,
                help_text=(
                    'Whether this reconciliation run also matches debit transactions. '
                    'Persisted so watchdog re-queues honour the original intent.'
                ),
            ),
        ),
    ]
