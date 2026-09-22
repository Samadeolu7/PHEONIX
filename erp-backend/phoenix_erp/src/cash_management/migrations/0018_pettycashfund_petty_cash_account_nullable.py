# Generated manually to match cash_management/models.py PettyCashFund.petty_cash_account

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0013_alter_account_code'),
        ('cash_management', '0017_pettycashfund_disbursement_mode_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='pettycashfund',
            name='petty_cash_account',
            field=models.ForeignKey(
                blank=True,
                null=True,
                help_text=(
                    "Petty Cash GL Account (ASSET account - typically 110-xxx). Only "
                    "meaningful in 'cash' disbursement_mode, where it tracks the "
                    "physical till. Leave unset for 'bank_transfer' mode - disburse() "
                    "credits the chosen BankAccount's own GL account instead and "
                    "never touches this fund's balance."
                ),
                on_delete=django.db.models.deletion.PROTECT,
                related_name='petty_cash_funds',
                to='accounts.account',
            ),
        ),
    ]
