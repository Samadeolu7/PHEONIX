# Generated manually 2026-06-17
# Adds SavingsProduct, WithdrawalApprovalTier, SavingsWithdrawalRequest,
# and WithdrawalApprovalStep — all four models existed in models.py but had
# never been included in a migration, leaving the DB tables missing.

import django.db.models.deletion
from decimal import Decimal
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('savings', '0003_savings_cycles_and_smart_savings'),
        ('accounts', '0012_subledger_account_codes'),
        ('banks', '0013_bankaccount_feed_fields'),
        ('branches', '0005_insurance_verifier_disbursement'),
        ('products', '0003_savings_cycles_and_smart_savings'),
        ('transactions', '0006_fix_empty_sequence_names'),
        ('users', '0010_daily_reconciliation_and_exception'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [

        # ── 1. SavingsProduct ────────────────────────────────────────────────
        migrations.CreateModel(
            name='SavingsProduct',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                # TimeStampedModel
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                # SoftDeleteModel
                ('is_deleted', models.BooleanField(default=False)),
                # BranchScopedModel
                ('branch', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    help_text='Branch this record belongs to',
                    to='branches.branch',
                )),
                # TimeStampedModel FKs
                ('tenant', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='savings_savingsproduct_set',
                    help_text='Tenant (organization) this record belongs to',
                    to='users.tenant',
                )),
                ('owner', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='savingsproduct_owned',
                    help_text='User who owns/manages this record',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('created_by', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='savingsproduct_created',
                    help_text='User who created this record',
                    to=settings.AUTH_USER_MODEL,
                )),
                # Own fields
                ('product', models.OneToOneField(
                    on_delete=django.db.models.deletion.PROTECT,
                    limit_choices_to={'product_type': 'SAVINGS'},
                    related_name='savings_product_config',
                    to='products.product',
                )),
                ('interest_expense_account', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.PROTECT,
                    limit_choices_to={'account_type': 'EXPENSE'},
                    related_name='savings_interest_expense',
                    help_text='Expense GL account for interest paid TO clients at cycle end.',
                    to='accounts.account',
                )),
                ('penalty_income_account', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.PROTECT,
                    limit_choices_to={'account_type': 'INCOME'},
                    related_name='savings_cycle_penalty_income',
                    help_text='Income GL account for penalties on early cycle withdrawal.',
                    to='accounts.account',
                )),
                ('is_daily_contribution', models.BooleanField(
                    default=False,
                    help_text='True for Ajo / daily-collection type accounts.',
                )),
                ('first_deposit_is_income', models.BooleanField(
                    default=False,
                    help_text='When True, the first deposit each calendar month is posted as income.',
                )),
                ('first_deposit_income_account', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.PROTECT,
                    limit_choices_to={'account_type': 'INCOME'},
                    related_name='savings_first_deposit_income',
                    help_text='Income GL account for first-deposit income.',
                    to='accounts.account',
                )),
                ('has_savings_cycle', models.BooleanField(
                    default=False,
                    help_text='Enable fixed-term cycle savings.',
                )),
                ('cycle_length_months', models.PositiveIntegerField(
                    null=True, blank=True,
                    help_text='Length of the savings cycle in months.',
                )),
                ('cycle_interest_rate', models.DecimalField(
                    max_digits=5, decimal_places=2,
                    null=True, blank=True,
                    help_text='Interest rate (%) paid on opening balance if cycle completes.',
                )),
                ('cycle_break_penalty_rate', models.DecimalField(
                    max_digits=5, decimal_places=2,
                    null=True, blank=True,
                    help_text='Penalty rate (%) of balance charged on early cycle break.',
                )),
                ('cycle_auto_renew', models.BooleanField(
                    default=True,
                    help_text='Automatically start a new cycle when the current one matures.',
                )),
                ('withdrawal_needs_approval', models.BooleanField(
                    default=True,
                    help_text='All withdrawals on this product must go through the approval workflow.',
                )),
                ('only_account_manager_can_withdraw', models.BooleanField(
                    default=True,
                    help_text='Only the assigned account manager may initiate a withdrawal request.',
                )),
            ],
            options={
                'ordering': ['product__name'],
            },
        ),

        # ── 2. WithdrawalApprovalTier ────────────────────────────────────────
        migrations.CreateModel(
            name='WithdrawalApprovalTier',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                # TimeStampedModel
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                # SoftDeleteModel
                ('is_deleted', models.BooleanField(default=False)),
                # TimeStampedModel FKs
                ('tenant', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='savings_withdrawalapprovaltier_set',
                    help_text='Tenant (organization) this record belongs to',
                    to='users.tenant',
                )),
                ('owner', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='withdrawal_approval_tiers',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('created_by', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='withdrawalapprovaltier_created',
                    to=settings.AUTH_USER_MODEL,
                )),
                # Own fields
                ('tier_name', models.CharField(max_length=100)),
                ('min_amount', models.DecimalField(max_digits=18, decimal_places=2, default=Decimal('0.00'))),
                ('max_amount', models.DecimalField(
                    max_digits=18, decimal_places=2,
                    null=True, blank=True,
                    help_text='Leave blank for no upper limit (highest tier).',
                )),
                ('required_approvers', models.PositiveIntegerField(
                    default=1,
                    help_text='Number of distinct approvals needed before the withdrawal executes.',
                )),
                ('approver_roles', models.JSONField(
                    default=list,
                    help_text='List of Django auth.Group names that can approve.',
                )),
                ('is_active', models.BooleanField(default=True)),
                ('order', models.PositiveIntegerField(
                    default=0,
                    help_text='Evaluated from lowest to highest order; first matching tier is used.',
                )),
            ],
            options={
                'ordering': ['owner', 'order'],
            },
        ),

        # ── 3. SavingsWithdrawalRequest ──────────────────────────────────────
        migrations.CreateModel(
            name='SavingsWithdrawalRequest',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                # TimeStampedModel
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                # SoftDeleteModel
                ('is_deleted', models.BooleanField(default=False)),
                # BranchScopedModel
                ('branch', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    help_text='Branch this record belongs to',
                    to='branches.branch',
                )),
                # TimeStampedModel FKs
                ('tenant', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='savings_savingswithdrawalrequest_set',
                    help_text='Tenant (organization) this record belongs to',
                    to='users.tenant',
                )),
                ('owner', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='savingswithdrawalrequest_owned',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('created_by', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='savingswithdrawalrequest_created',
                    to=settings.AUTH_USER_MODEL,
                )),
                # Own fields
                ('savings_account', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='withdrawal_requests',
                    to='savings.savingsaccount',
                )),
                ('requested_by', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='initiated_withdrawal_requests',
                    help_text="Must be the client's account_manager when only_account_manager_can_withdraw is True.",
                    to=settings.AUTH_USER_MODEL,
                )),
                ('amount', models.DecimalField(max_digits=18, decimal_places=2)),
                ('description', models.TextField(blank=True)),
                ('status', models.CharField(
                    max_length=20,
                    choices=[
                        ('pending', 'Pending'),
                        ('partially_approved', 'Partially Approved'),
                        ('fully_approved', 'Fully Approved'),
                        ('rejected', 'Rejected'),
                        ('cancelled', 'Cancelled'),
                        ('completed', 'Completed'),
                    ],
                    default='pending',
                    db_index=True,
                )),
                ('required_approvals', models.PositiveIntegerField(
                    help_text='Snapshot of WithdrawalApprovalTier.required_approvers at creation time.',
                )),
                ('approvals_received', models.PositiveIntegerField(default=0)),
                ('applied_tier', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='withdrawal_requests',
                    help_text='The tier that was matched for this request.',
                    to='savings.withdrawalapprovaltier',
                )),
                ('destination_bank_account', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='incoming_withdrawal_requests',
                    help_text='Bank account to credit when withdrawal completes.',
                    to='banks.bankaccount',
                )),
                ('cashier_account', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.PROTECT,
                    limit_choices_to={'account_type': 'ASSET'},
                    related_name='withdrawal_request_cashier',
                    help_text='Cash / Cashier GL account used when no bank account.',
                    to='accounts.account',
                )),
                ('journal_entry', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='savings_withdrawal_requests',
                    to='transactions.transaction',
                )),
            ],
            options={
                'ordering': ['-created_at'],
                'indexes': [
                    models.Index(fields=['status', 'created_at'], name='savings_swr_status_ca_idx'),
                    models.Index(fields=['savings_account', 'status'], name='savings_swr_acct_st_idx'),
                ],
            },
        ),

        # ── 4. WithdrawalApprovalStep ────────────────────────────────────────
        migrations.CreateModel(
            name='WithdrawalApprovalStep',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                # TimeStampedModel
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                # SoftDeleteModel
                ('is_deleted', models.BooleanField(default=False)),
                # TimeStampedModel FKs
                ('tenant', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='savings_withdrawalapprovalstep_set',
                    help_text='Tenant (organization) this record belongs to',
                    to='users.tenant',
                )),
                ('owner', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='withdrawalapprovalstep_owned',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('created_by', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='withdrawalapprovalstep_created',
                    to=settings.AUTH_USER_MODEL,
                )),
                # Own fields
                ('withdrawal_request', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='approval_steps',
                    to='savings.savingswithdrawalrequest',
                )),
                ('step_number', models.PositiveIntegerField(
                    help_text='1-based position in the approval chain.',
                )),
                ('approver', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='withdrawal_approval_steps',
                    help_text='Populated when an eligible user claims and responds to this step.',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('status', models.CharField(
                    max_length=10,
                    choices=[
                        ('pending', 'Pending'),
                        ('approved', 'Approved'),
                        ('rejected', 'Rejected'),
                    ],
                    default='pending',
                    db_index=True,
                )),
                ('comment', models.TextField(blank=True)),
                ('responded_at', models.DateTimeField(null=True, blank=True)),
            ],
            options={
                'ordering': ['withdrawal_request', 'step_number'],
            },
        ),
        migrations.AlterUniqueTogether(
            name='withdrawalapprovalstep',
            unique_together={('withdrawal_request', 'step_number')},
        ),
    ]
