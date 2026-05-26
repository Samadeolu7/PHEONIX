# Generated manually to add new treasury control fields

import django.db.models.deletion
from decimal import Decimal
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0003_initial'),
        ('branches', '0002_initial'),
        ('cash_management', '0003_initial'),
        ('users', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # Add finance officer sign-off fields to CashReconciliation
        migrations.AddField(
            model_name='cashreconciliation',
            name='finance_officer_signoff',
            field=models.ForeignKey(
                null=True,
                blank=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='signed_off_reconciliations',
                to=settings.AUTH_USER_MODEL,
                help_text='Finance officer who signed off on this reconciliation'
            ),
        ),
        migrations.AddField(
            model_name='cashreconciliation',
            name='finance_officer_signoff_at',
            field=models.DateTimeField(
                null=True,
                blank=True,
                help_text='When finance officer signed off'
            ),
        ),
        migrations.AddField(
            model_name='cashreconciliation',
            name='finance_officer_notes',
            field=models.TextField(
                blank=True,
                default='',
                help_text='Notes from finance officer during sign-off'
            ),
        ),
        migrations.AddField(
            model_name='cashreconciliation',
            name='deposit_required',
            field=models.BooleanField(
                default=False,
                help_text='True if daily deposit is required'
            ),
        ),
        migrations.AddField(
            model_name='cashreconciliation',
            name='deposit_completed',
            field=models.BooleanField(
                default=False,
                help_text='True when cash has been deposited to bank'
            ),
        ),
        migrations.AddField(
            model_name='cashreconciliation',
            name='deposit_slip_number',
            field=models.CharField(
                max_length=50,
                blank=True,
                default='',
                help_text='Bank deposit slip number'
            ),
        ),
        migrations.AddField(
            model_name='cashreconciliation',
            name='deposit_timestamp',
            field=models.DateTimeField(
                null=True,
                blank=True,
                help_text='When deposit was completed'
            ),
        ),
        
        # Create BankReconciliation model
        migrations.CreateModel(
            name='BankReconciliation',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True, help_text='Date and time when this record was created')),
                ('updated_at', models.DateTimeField(auto_now=True, help_text='Date and time when this record was last updated')),
                ('reconciliation_number', models.CharField(help_text='Auto-generated reconciliation number (BR-YYYYMM-XXXX)', max_length=50, unique=True)),
                ('reconciliation_period_start', models.DateField(help_text='Start date of reconciliation period (typically month start)')),
                ('reconciliation_period_end', models.DateField(help_text='End date of reconciliation period (typically month end)')),
                ('bank_statement_date', models.DateField(help_text='Date of the bank statement being reconciled')),
                ('bank_opening_balance', models.DecimalField(decimal_places=2, default=Decimal('0.00'), help_text='Opening balance per bank statement', max_digits=15)),
                ('bank_closing_balance', models.DecimalField(decimal_places=2, default=Decimal('0.00'), help_text='Closing balance per bank statement', max_digits=15)),
                ('gl_opening_balance', models.DecimalField(decimal_places=2, default=Decimal('0.00'), help_text='Opening balance per general ledger', max_digits=15)),
                ('gl_closing_balance', models.DecimalField(decimal_places=2, default=Decimal('0.00'), help_text='Closing balance per general ledger', max_digits=15)),
                ('deposits_in_transit', models.DecimalField(decimal_places=2, default=Decimal('0.00'), help_text='Deposits recorded in GL but not yet in bank', max_digits=15)),
                ('outstanding_checks', models.DecimalField(decimal_places=2, default=Decimal('0.00'), help_text='Checks recorded in GL but not yet cleared by bank', max_digits=15)),
                ('bank_charges', models.DecimalField(decimal_places=2, default=Decimal('0.00'), help_text='Bank charges on statement not yet in GL', max_digits=15)),
                ('bank_interest', models.DecimalField(decimal_places=2, default=Decimal('0.00'), help_text='Bank interest earned not yet in GL', max_digits=15)),
                ('bank_errors', models.DecimalField(decimal_places=2, default=Decimal('0.00'), help_text='Errors made by bank (to be corrected by bank)', max_digits=15)),
                ('gl_errors', models.DecimalField(decimal_places=2, default=Decimal('0.00'), help_text='Errors in GL entries (to be corrected by journal entry)', max_digits=15)),
                ('other_adjustments', models.DecimalField(decimal_places=2, default=Decimal('0.00'), help_text='Other reconciling items', max_digits=15)),
                ('reconciled_balance', models.DecimalField(decimal_places=2, default=Decimal('0.00'), help_text='Calculated reconciled balance (should match bank closing)', max_digits=15)),
                ('variance', models.DecimalField(decimal_places=2, default=Decimal('0.00'), help_text='Difference between reconciled balance and bank closing balance', max_digits=15)),
                ('variance_explanation', models.TextField(blank=True, default='', help_text='Explanation for any variance')),
                ('variance_resolved', models.BooleanField(default=False, help_text='True when variance has been investigated and resolved')),
                ('status', models.CharField(choices=[('DRAFT', 'Draft'), ('PENDING_APPROVAL', 'Pending Approval'), ('APPROVED', 'Approved'), ('REJECTED', 'Rejected')], default='DRAFT', max_length=20)),
                ('reconciling_items', models.JSONField(blank=True, default=list, help_text='Detailed list of reconciling items (deposits in transit, outstanding checks, etc.)')),
                ('bank_statement', models.FileField(blank=True, help_text='Uploaded bank statement PDF', null=True, upload_to='bank_statements/')),
                ('supporting_documents', models.FileField(blank=True, help_text='Supporting documents (deposit slips, cleared checks, etc.)', null=True, upload_to='bank_reconciliation_docs/')),
                ('notes', models.TextField(blank=True, default='', help_text='Internal notes about the reconciliation')),
                ('approval_notes', models.TextField(blank=True, default='', help_text='Notes from approver')),
                ('approved_at', models.DateTimeField(blank=True, help_text='When the reconciliation was approved', null=True)),
                ('rejected_at', models.DateTimeField(blank=True, help_text='When the reconciliation was rejected', null=True)),
                ('rejection_reason', models.TextField(blank=True, default='', help_text='Reason for rejection')),
                ('approved_by', models.ForeignKey(blank=True, help_text='User who approved this reconciliation', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='approved_bank_reconciliations', to=settings.AUTH_USER_MODEL)),
                ('bank_account', models.ForeignKey(help_text='Bank account being reconciled (must be ASSET type)', on_delete=django.db.models.deletion.PROTECT, related_name='bank_reconciliations', to='accounts.account')),
                ('branch', models.ForeignKey(blank=True, help_text='Branch this record belongs to', null=True, on_delete=django.db.models.deletion.SET_NULL, to='branches.branch')),
                ('created_by', models.ForeignKey(blank=True, help_text='User who created this record', null=True, on_delete=django.db.models.deletion.PROTECT, related_name='bankreconciliation_created', to='users.user')),
                ('owner', models.ForeignKey(blank=True, help_text='User who owns/manages this record', null=True, on_delete=django.db.models.deletion.CASCADE, related_name='bankreconciliation_owned', to='users.user')),
                ('prepared_by', models.ForeignKey(help_text='User who prepared this reconciliation', on_delete=django.db.models.deletion.PROTECT, related_name='prepared_bank_reconciliations', to=settings.AUTH_USER_MODEL)),
                ('rejected_by', models.ForeignKey(blank=True, help_text='User who rejected this reconciliation', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='rejected_bank_reconciliations', to=settings.AUTH_USER_MODEL)),
                ('tenant', models.ForeignKey(blank=True, help_text='Tenant (organization) this record belongs to', null=True, on_delete=django.db.models.deletion.CASCADE, related_name='cash_management_bankreconciliation_set', to='users.tenant')),
                ('variance_resolved_by', models.ForeignKey(blank=True, help_text='User who resolved the variance', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='resolved_bank_variances', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'Bank Reconciliation',
                'verbose_name_plural': 'Bank Reconciliations',
                'ordering': ['-reconciliation_period_end', '-created_at'],
                'indexes': [
                    models.Index(fields=['reconciliation_number'], name='cash_manage_reconci_num_idx'),
                    models.Index(fields=['bank_account', 'reconciliation_period_end'], name='cash_manage_bank_period_idx'),
                    models.Index(fields=['status'], name='cash_manage_bank_status_idx'),
                ],
            },
        ),
    ]
