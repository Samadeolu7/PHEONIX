import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('banks', '0030_uniq_matched_erp_payment_id_when_matched'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='reconciliationexception',
            name='claimed_by',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='claimed_recon_exceptions', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name='reconciliationexception',
            name='claimed_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='reconciliationexception',
            name='claim_note',
            field=models.TextField(blank=True),
        ),
    ]
