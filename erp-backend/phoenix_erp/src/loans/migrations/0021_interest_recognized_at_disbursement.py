from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('loans', '0020_loan_origin'),
    ]

    operations = [
        migrations.AddField(
            model_name='loanaccount',
            name='interest_recognized_at_disbursement',
            field=models.BooleanField(default=False, help_text="True if this loan's full interest was credited to Interest Income at disbursement (the default when the product has interest_income_account configured and is not using the deferred/unearned compromise). record_payment() then collects the interest portion straight against the Loan Receivable instead of crediting Income again."),
        ),
    ]
