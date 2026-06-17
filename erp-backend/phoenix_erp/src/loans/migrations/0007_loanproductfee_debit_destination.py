"""
Migration: add debit_destination, default_savings_product to LoanProductFee
and add 'registration' as a valid posting_trigger value.
"""
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('loans', '0006_java_app_prep_bvn_bankfeed_loanwriteoff'),
        ('loans', '0006b_create_loan_fee_tables'),   # tables must exist before AlterField/AddField
        ('products', '0001_initial'),
    ]

    operations = [
        # Widen the posting_trigger choices to include 'registration'.
        # The field itself is a CharField so no data change is needed;
        # Django only validates choices at form/serializer level, not DB level.
        migrations.AlterField(
            model_name='loanproductfee',
            name='posting_trigger',
            field=models.CharField(
                choices=[
                    ('registration', 'At Loan Registration'),
                    ('approval', 'At Loan Approval'),
                    ('disbursement', 'At Disbursement'),
                ],
                default='registration',
                max_length=20,
            ),
        ),
        # Add debit_destination
        migrations.AddField(
            model_name='loanproductfee',
            name='debit_destination',
            field=models.CharField(
                choices=[
                    ('cashier', 'Cashier Account'),
                    ('savings', 'Client Savings Account'),
                    ('user_choice', 'User Chooses at Registration'),
                ],
                default='cashier',
                help_text=(
                    'Where the debit (cash collected) side of the fee GL entry goes. '
                    'cashier = teller cash account; '
                    "savings = deducted from the client's savings account; "
                    'user_choice = staff decides at registration time.'
                ),
                max_length=20,
            ),
        ),
        # Add default_savings_product
        migrations.AddField(
            model_name='loanproductfee',
            name='default_savings_product',
            field=models.ForeignKey(
                blank=True,
                help_text=(
                    'Default savings product to debit when debit_destination=savings '
                    "or when the user picks savings and a specific product is pre-selected. "
                    "Leave blank to use the client's first active savings account."
                ),
                limit_choices_to={'product_type': 'SAVINGS'},
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='loan_fee_default_savings',
                to='products.product',
            ),
        ),
    ]
