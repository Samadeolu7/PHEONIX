from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('loans', '0010_loanrepaymentrequest'),
    ]

    operations = [
        # LoanProduct: configurable term unit + first-repayment buffer
        migrations.AddField(
            model_name='loanproduct',
            name='term_unit',
            field=models.CharField(
                choices=[('days', 'Days'), ('weeks', 'Weeks'), ('months', 'Months')],
                default='months',
                max_length=10,
                help_text=(
                    'Unit for min_term_months / max_term_months and for loan term entry. '
                    'Existing products default to months.'
                ),
            ),
        ),
        migrations.AddField(
            model_name='loanproduct',
            name='first_repayment_buffer_days',
            field=models.PositiveIntegerField(
                default=0,
                help_text=(
                    'Minimum calendar days from disbursement before the first repayment '
                    'installment is due. 0 = first installment follows normal cadence. '
                    'E.g. 14 means first weekly repayment will not be before day 14.'
                ),
            ),
        ),
        # LoanAccount: store which unit was used when the loan was created
        migrations.AddField(
            model_name='loanaccount',
            name='term_unit',
            field=models.CharField(
                choices=[('days', 'Days'), ('weeks', 'Weeks'), ('months', 'Months')],
                default='months',
                max_length=10,
                help_text='Unit in which term_months is expressed (days / weeks / months).',
            ),
        ),
    ]
