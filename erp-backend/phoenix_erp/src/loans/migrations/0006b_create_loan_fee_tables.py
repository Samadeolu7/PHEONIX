"""
Migration: create LoanProductFee, LoanProductSavingsRequirement, LoanFeeApplication tables.

These models were added to loans/models.py but their CreateModel migration was never
written.  Migration 0007 assumed the tables already existed and tried to AlterField/AddField
on them, causing 'relation does not exist' errors on the production server.

This migration creates the tables in their pre-0007 / pre-0008 state:
  - LoanProductFee: base fields only (debit_destination & default_savings_product
    are added by 0007_loanproductfee_debit_destination)
  - LoanProductSavingsRequirement: full fields (no later migration touches it)
  - LoanFeeApplication: base fields only (debit_destination_used &
    savings_account_debited are added by 0008_loanfeeapplication_audit_fields)
"""
import decimal

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0001_initial'),
        ('branches', '0005_insurance_verifier_disbursement'),
        ('loans', '0006_java_app_prep_bvn_bankfeed_loanwriteoff'),
        ('products', '0001_initial'),
        ('transactions', '0006_fix_empty_sequence_names'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # ── LoanProductFee ───────────────────────────────────────────────────────
        migrations.CreateModel(
            name='LoanProductFee',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('is_deleted', models.BooleanField(default=False)),
                ('name', models.CharField(
                    help_text='e.g. Admin Fee, Registration Fee, Risk Premium',
                    max_length=100,
                )),
                ('fee_type', models.CharField(
                    choices=[('fixed', 'Fixed Amount'), ('percentage', 'Percentage of Loan Amount')],
                    default='fixed',
                    max_length=20,
                )),
                ('fixed_amount', models.DecimalField(
                    decimal_places=2, default=decimal.Decimal('0.00'), max_digits=18,
                    help_text='Used when fee_type = fixed',
                )),
                ('percentage', models.DecimalField(
                    decimal_places=2, default=decimal.Decimal('0.00'), max_digits=5,
                    help_text='Percentage of approved loan amount. Used when fee_type = percentage.',
                )),
                ('posting_trigger', models.CharField(
                    choices=[
                        ('approval', 'At Loan Approval'),
                        ('disbursement', 'At Disbursement'),
                    ],
                    default='approval',
                    max_length=20,
                )),
                ('is_active', models.BooleanField(default=True)),
                ('order', models.PositiveIntegerField(
                    default=0,
                    help_text='Display order on forms and reports.',
                )),
                # FK fields
                ('branch', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    help_text='Branch this record belongs to',
                    to='branches.branch',
                )),
                ('created_by', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='loanproductfee_created',
                    help_text='User who created this record',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('gl_income_account', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='loan_product_fee_lines',
                    help_text='Income GL account where this fee is posted.',
                    to='accounts.account',
                )),
                ('loan_product', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='fee_lines',
                    to='loans.loanproduct',
                )),
                ('owner', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='loanproductfee_owned',
                    help_text='User who owns/manages this record',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('tenant', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='loans_loanproductfee_set',
                    help_text='Tenant (organization) this record belongs to',
                    to='users.tenant',
                )),
            ],
            options={
                'ordering': ['loan_product', 'order', 'name'],
            },
        ),
        migrations.AlterUniqueTogether(
            name='loanproductfee',
            unique_together={('loan_product', 'name')},
        ),

        # ── LoanProductSavingsRequirement ────────────────────────────────────────
        migrations.CreateModel(
            name='LoanProductSavingsRequirement',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('is_deleted', models.BooleanField(default=False)),
                ('requirement_type', models.CharField(
                    choices=[
                        ('percentage', 'Percentage of Loan Amount'),
                        ('fixed', 'Fixed Amount'),
                    ],
                    default='percentage',
                    max_length=20,
                )),
                ('value', models.DecimalField(
                    decimal_places=2, max_digits=10,
                    help_text='10 = 10% of loan amount (percentage) or ₦10,000 (fixed).',
                )),
                ('is_active', models.BooleanField(default=True)),
                # FK fields
                ('branch', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    help_text='Branch this record belongs to',
                    to='branches.branch',
                )),
                ('created_by', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='loanproductsavingsrequirement_created',
                    help_text='User who created this record',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('loan_product', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='savings_requirements',
                    to='loans.loanproduct',
                )),
                ('owner', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='loanproductsavingsrequirement_owned',
                    help_text='User who owns/manages this record',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('savings_product', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    limit_choices_to={'product_type': 'SAVINGS'},
                    related_name='loan_savings_requirements',
                    help_text='The savings product whose balance is checked.',
                    to='products.product',
                )),
                ('tenant', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='loans_loanproductsavingsrequirement_set',
                    help_text='Tenant (organization) this record belongs to',
                    to='users.tenant',
                )),
            ],
            options={
                'ordering': ['loan_product', 'savings_product'],
            },
        ),

        # ── LoanFeeApplication ────────────────────────────────────────────────────
        # NOTE: debit_destination_used and savings_account_debited are added by
        # migration 0008_loanfeeapplication_audit_fields.
        migrations.CreateModel(
            name='LoanFeeApplication',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('is_deleted', models.BooleanField(default=False)),
                ('calculated_amount', models.DecimalField(
                    decimal_places=2, max_digits=18,
                    help_text='Amount computed at the time the fee was applied.',
                )),
                ('posted', models.BooleanField(default=False)),
                ('posting_date', models.DateField(blank=True, null=True)),
                # FK fields
                ('branch', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    help_text='Branch this record belongs to',
                    to='branches.branch',
                )),
                ('created_by', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='loanfeeapplication_created',
                    help_text='User who created this record',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('fee_config', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='applications',
                    to='loans.loanproductfee',
                )),
                ('journal_entry', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='loan_fee_applications',
                    to='transactions.transaction',
                )),
                ('loan_account', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='fee_applications',
                    to='loans.loanaccount',
                )),
                ('owner', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='loanfeeapplication_owned',
                    help_text='User who owns/manages this record',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('tenant', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='loans_loanfeeapplication_set',
                    help_text='Tenant (organization) this record belongs to',
                    to='users.tenant',
                )),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.AlterUniqueTogether(
            name='loanfeeapplication',
            unique_together={('loan_account', 'fee_config')},
        ),
    ]
