from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('hr', '0017_salarycomponent_is_advance'),
    ]

    operations = [
        migrations.CreateModel(
            name='PayComponentRemovalRequest',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('owner', models.CharField(blank=True, max_length=100)),
                ('branch', models.CharField(blank=True, max_length=100)),
                ('is_deleted', models.BooleanField(default=False)),
                ('deleted_at', models.DateTimeField(blank=True, null=True)),
                ('reference_number', models.CharField(
                    db_index=True, max_length=50, unique=True,
                    help_text='Auto-generated reference number (e.g. PCR-0001)'
                )),
                ('reason', models.TextField(
                    help_text='Justification for removing this component from the staff member'
                )),
                ('status', models.CharField(
                    choices=[('PENDING', 'Pending'), ('APPROVED', 'Approved'), ('REJECTED', 'Rejected')],
                    default='PENDING', max_length=10
                )),
                ('requested_date', models.DateTimeField(auto_now_add=True)),
                ('approved_date', models.DateTimeField(blank=True, null=True)),
                ('rejection_reason', models.TextField(blank=True, help_text='Reason if rejected')),
                ('approved_by', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='pay_component_removal_requests_approved',
                    to=settings.AUTH_USER_MODEL
                )),
                ('requested_by', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='pay_component_removal_requests_created',
                    to=settings.AUTH_USER_MODEL
                )),
                ('staff_pay_info', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='removal_requests',
                    to='hr.staffpayinfo',
                    help_text='The staff–component assignment to be removed upon approval'
                )),
            ],
            options={
                'ordering': ['-requested_date'],
            },
        ),
        migrations.AddIndex(
            model_name='paycomponentremovalrequest',
            index=models.Index(fields=['status'], name='hr_pcr_status_idx'),
        ),
        migrations.AddIndex(
            model_name='paycomponentremovalrequest',
            index=models.Index(fields=['staff_pay_info', 'status'], name='hr_pcr_spi_status_idx'),
        ),
    ]
