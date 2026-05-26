from decimal import Decimal
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('banks', '0007_bankpayment_supplier'),
    ]

    operations = [
        migrations.AddField(
            model_name='bankpayment',
            name='advance_applied',
            field=models.DecimalField(
                decimal_places=2,
                default=Decimal('0.00'),
                help_text='Total amount of this advance already applied to Accounts Payable records',
                max_digits=18,
            ),
        ),
    ]
