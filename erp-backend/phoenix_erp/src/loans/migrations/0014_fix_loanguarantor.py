from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    """
    Make LoanGuarantor.guarantor non-nullable.
    Every guarantor record must now reference a proper Client.

    If you have existing rows with guarantor IS NULL, remove them first:
        DELETE FROM loans_loanguarantor WHERE guarantor_id IS NULL;
    """

    dependencies = [
        ('clients', '0012_remove_guarantor_fields'),
        ('loans', '0013_loanrepaymentrequest_tenant_createdby'),
    ]

    operations = [
        migrations.AlterField(
            model_name='loanguarantor',
            name='guarantor',
            field=models.ForeignKey(
                to='clients.Client',
                on_delete=django.db.models.deletion.PROTECT,
                related_name='guaranteed_loans',
            ),
        ),
    ]
