from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('expenses', '0009_expensecategory_budget_amount_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='prepaidexpense',
            name='auto_amortize',
            field=models.BooleanField(default=False, help_text='Release this prepayment to expense automatically every month'),
        ),
        migrations.AddField(
            model_name='prepaidexpense',
            name='amortization_start_date',
            field=models.DateField(blank=True, null=True, help_text='First month covered by the prepayment (e.g. rent start date)'),
        ),
        migrations.AddField(
            model_name='prepaidexpense',
            name='amortization_months',
            field=models.PositiveIntegerField(blank=True, null=True, help_text="Number of months the prepayment covers (e.g. 12 for a year's rent)"),
        ),
    ]
