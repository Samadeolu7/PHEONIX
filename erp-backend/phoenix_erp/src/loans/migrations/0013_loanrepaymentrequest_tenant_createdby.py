from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    """
    Adds tenant and created_by to LoanRepaymentRequest.
    These come from TimeStampedModel but were omitted from the original
    CreateModel migration (0010_loanrepaymentrequest).
    """

    dependencies = [
        ('loans', '0012_cbncompliance'),
        ('users', '0010_daily_reconciliation_and_exception'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='loanrepaymentrequest',
            name='tenant',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='loans_loanrepaymentrequest_set',
                to='users.tenant',
                help_text='Tenant (organization) this record belongs to',
                db_index=True,
            ),
        ),
        migrations.AddField(
            model_name='loanrepaymentrequest',
            name='created_by',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='loanrepaymentrequest_created',
                to=settings.AUTH_USER_MODEL,
                help_text='User who created this record',
            ),
        ),
    ]
