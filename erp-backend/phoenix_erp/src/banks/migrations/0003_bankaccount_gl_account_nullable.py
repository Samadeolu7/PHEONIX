"""
Make BankAccount.gl_account nullable so that the GL child account
can be auto-created in BankAccount.save() without requiring the caller
to pre-create the Account first.
"""

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0009_update_account_code_validator'),
        ('banks', '0002_add_contact_fields_and_invoice_bank_flag'),
    ]

    operations = [
        migrations.AlterField(
            model_name='bankaccount',
            name='gl_account',
            field=models.OneToOneField(
                blank=True,
                null=True,
                help_text=(
                    "General Ledger account (ASSET, CHILD level) for this bank account. "
                    "Auto-created under 1100 Cash and Cash Equivalents if left blank."
                ),
                on_delete=django.db.models.deletion.PROTECT,
                related_name='bank_account',
                to='accounts.account',
            ),
        ),
    ]
