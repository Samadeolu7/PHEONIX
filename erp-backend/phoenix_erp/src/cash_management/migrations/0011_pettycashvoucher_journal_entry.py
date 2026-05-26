from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('cash_management', '0010_bank_account_fk_on_expense_and_replenishment'),
        ('transactions', '0003_add_financial_report_indexes'),
    ]

    operations = [
        migrations.AddField(
            model_name='pettycashvoucher',
            name='journal_entry',
            field=models.ForeignKey(
                blank=True,
                help_text='GL transaction created when cash is disbursed',
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='petty_cash_vouchers',
                to='transactions.transaction',
            ),
        ),
    ]
