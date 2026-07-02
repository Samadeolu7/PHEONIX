from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('loans', '0017_offlinepaymentrecord'),
    ]

    operations = [
        migrations.AddField(
            model_name='loanrepaymentrequest',
            name='covered_installments',
            field=models.ManyToManyField(
                blank=True,
                help_text='Schedule rows this request is intended to settle, oldest-due-first.',
                related_name='repayment_requests',
                to='loans.loanrepaymentschedule',
            ),
        ),
    ]
