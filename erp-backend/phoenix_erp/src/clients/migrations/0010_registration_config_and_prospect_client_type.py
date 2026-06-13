# Generated manually by Copilot

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0012_subledger_account_codes'),
        ('branches', '0004_add_contact_fields_and_invoice_bank_flag'),
        ('clients', '0009_java_app_prep_bvn_bankfeed_loanwriteoff'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('users', '0008_role_excluded_permission_codes'),
    ]

    operations = [
        migrations.AlterField(
            model_name='client',
            name='client_type',
            field=models.CharField(
                blank=True,
                choices=[
                    ('dc', 'Daily Contributor'),
                    ('wl', 'Weekly Client'),
                    ('ml', 'Monthly Client'),
                    ('pr', 'Prospect'),
                ],
                db_index=True,
                help_text='Primary client type (dc=daily, wl=weekly, ml=monthly, pr=prospect)',
                max_length=5,
                null=True,
            ),
        ),
        migrations.CreateModel(
            name='ClientRegistrationConfig',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('is_deleted', models.BooleanField(default=False)),
                ('daily_registration_fee', models.DecimalField(decimal_places=2, default=0, max_digits=18)),
                ('daily_id_fee', models.DecimalField(decimal_places=2, default=0, max_digits=18)),
                ('weekly_registration_fee', models.DecimalField(decimal_places=2, default=0, max_digits=18)),
                ('weekly_id_fee', models.DecimalField(decimal_places=2, default=0, max_digits=18)),
                ('monthly_registration_fee', models.DecimalField(decimal_places=2, default=0, max_digits=18)),
                ('monthly_id_fee', models.DecimalField(decimal_places=2, default=0, max_digits=18)),
                ('is_active', models.BooleanField(default=True)),
                ('branch', models.ForeignKey(blank=True, help_text='Branch this record belongs to', null=True, on_delete=django.db.models.deletion.SET_NULL, to='branches.branch')),
                ('created_by', models.ForeignKey(blank=True, help_text='User who created this record', null=True, on_delete=django.db.models.deletion.PROTECT, related_name='%(class)s_created', to=settings.AUTH_USER_MODEL)),
                ('id_fee_income_account', models.ForeignKey(limit_choices_to={'account_type': 'INCOME'}, on_delete=django.db.models.deletion.PROTECT, related_name='client_id_fee_income_configs', to='accounts.account')),
                ('owner', models.ForeignKey(blank=True, help_text='User who owns/manages this record', null=True, on_delete=django.db.models.deletion.CASCADE, related_name='%(class)s_owned', to=settings.AUTH_USER_MODEL)),
                ('registration_income_account', models.ForeignKey(limit_choices_to={'account_type': 'INCOME'}, on_delete=django.db.models.deletion.PROTECT, related_name='client_registration_income_configs', to='accounts.account')),
                ('tenant', models.ForeignKey(blank=True, help_text='Tenant (organization) this record belongs to', null=True, on_delete=django.db.models.deletion.CASCADE, related_name='%(app_label)s_%(class)s_set', to='users.tenant')),
            ],
            options={
                'ordering': ['-updated_at'],
            },
        ),
    ]
