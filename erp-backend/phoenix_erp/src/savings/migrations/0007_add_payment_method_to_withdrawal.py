from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('savings', '0006_add_disbursed_by_to_withdrawal_request'),
    ]

    operations = [
        migrations.AddField(
            model_name='savingswithdrawalrequest',
            name='payment_method',
            field=models.CharField(
                max_length=10,
                choices=[('cash', 'Cash'), ('bank', 'Bank Transfer')],
                null=True,
                blank=True,
                help_text=(
                    "Set by the Branch Manager during approval. "
                    "'cash' = teller payout via a cashier GL account; "
                    "'bank' = bank transfer. Amounts >= NGN 50,000 are forced to 'bank'."
                ),
            ),
        ),
    ]
