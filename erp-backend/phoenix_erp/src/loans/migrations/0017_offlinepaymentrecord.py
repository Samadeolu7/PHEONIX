from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('loans', '0016_loan_guarantor_person_fk'),
        ('transactions', '0006_fix_empty_sequence_names'),
        ('branches', '0005_insurance_verifier_disbursement'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='OfflinePaymentRecord',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('owner', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='offline_payment_records_owned',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('branch', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='offline_payment_records_branch',
                    to='branches.branch',
                )),
                ('client_name', models.CharField(max_length=200)),
                ('loan_number', models.CharField(max_length=50)),
                ('amount', models.DecimalField(decimal_places=2, max_digits=18)),
                ('payment_date', models.DateField()),
                ('payment_mode', models.CharField(
                    choices=[('cash', 'Cash'), ('mobile_money', 'Mobile Money'), ('bank_transfer', 'Bank Transfer')],
                    default='cash',
                    max_length=20,
                )),
                ('bank_reference', models.CharField(blank=True, max_length=100)),
                ('notes', models.TextField(blank=True)),
                ('latitude', models.DecimalField(blank=True, decimal_places=6, max_digits=9, null=True)),
                ('longitude', models.DecimalField(blank=True, decimal_places=6, max_digits=9, null=True)),
                ('location_accuracy', models.DecimalField(
                    blank=True, decimal_places=2, max_digits=8, null=True,
                    help_text='GPS accuracy radius in metres',
                )),
                ('location_address', models.CharField(
                    blank=True, max_length=500,
                    help_text='Reverse-geocoded human-readable address (optional)',
                )),
                ('status', models.CharField(
                    choices=[
                        ('pending', 'Pending Approval'),
                        ('approved', 'Approved'),
                        ('rejected', 'Rejected'),
                        ('posted', 'Posted'),
                    ],
                    default='pending',
                    max_length=20,
                )),
                ('rejection_reason', models.TextField(blank=True)),
                ('reviewed_at', models.DateTimeField(blank=True, null=True)),
                ('loan', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='offline_payment_records',
                    to='loans.loanaccount',
                )),
                ('recorded_by', models.ForeignKey(
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='offline_payment_records',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('reviewed_by', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='reviewed_offline_payment_records',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('journal_entry', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='offline_payment_record_journals',
                    to='transactions.transaction',
                )),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
    ]
