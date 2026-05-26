"""
Migration 0008: Add per-line-item payment allocation support.

Changes:
  - incomes.InvoiceItem: add `amount_paid` field to track cumulative payment per line item
  - incomes.InvoiceItemPayment: new model that records how much of each line item was
    covered by an individual payment transaction.
"""
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('incomes', '0007_add_service_type_to_serviceitem'),
    ]

    operations = [
        # Add amount_paid to InvoiceItem
        migrations.AddField(
            model_name='invoiceitem',
            name='amount_paid',
            field=models.DecimalField(
                max_digits=18,
                decimal_places=2,
                default=0,
                help_text='Amount paid specifically against this line item',
            ),
        ),

        # Create InvoiceItemPayment model
        migrations.CreateModel(
            name='InvoiceItemPayment',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('journal_entry_reference', models.CharField(
                    blank=True,
                    max_length=100,
                    help_text='Payment journal entry reference number',
                )),
                ('payment_date', models.DateField()),
                ('amount', models.DecimalField(
                    max_digits=18,
                    decimal_places=2,
                    help_text='Amount of the payment allocated to this line item',
                )),
                ('notes', models.CharField(blank=True, max_length=500)),
                ('invoice', models.ForeignKey(
                    help_text='The invoice this allocation belongs to',
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='item_payments',
                    to='incomes.invoice',
                )),
                ('invoice_item', models.ForeignKey(
                    help_text='The specific line item being paid for',
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='payment_allocations',
                    to='incomes.invoiceitem',
                )),
            ],
            options={
                'ordering': ['payment_date', 'id'],
            },
        ),
        migrations.AddIndex(
            model_name='invoiceitempayment',
            index=models.Index(fields=['invoice', 'payment_date'], name='incomes_iip_invoice_date_idx'),
        ),
        migrations.AddIndex(
            model_name='invoiceitempayment',
            index=models.Index(fields=['invoice_item'], name='incomes_iip_item_idx'),
        ),
    ]
