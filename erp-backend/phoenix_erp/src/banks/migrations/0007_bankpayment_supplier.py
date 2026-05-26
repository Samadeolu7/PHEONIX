from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('banks', '0006_bankpayment_approval_workflow'),
        ('procurement', '0004_goodsreceivednoteitem_quality_data_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='bankpayment',
            name='supplier',
            field=models.ForeignKey(
                blank=True,
                help_text='Supplier for payment-on-account (no AP/PO yet)',
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='bank_payments',
                to='procurement.supplier',
            ),
        ),
    ]
