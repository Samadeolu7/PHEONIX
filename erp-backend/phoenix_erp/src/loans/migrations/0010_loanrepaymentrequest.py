from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('loans', '0009_loanproduct_straight_line_method'),
        ('savings', '0004_savingsproduct_withdrawal_models'),
        ('transactions', '0006_fix_empty_sequence_names'),
        ('branches', '0005_insurance_verifier_disbursement'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='LoanRepaymentRequest',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('owner', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='loan_repayment_requests_owned',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('branch', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='loan_repayment_requests',
                    to='branches.branch',
                )),
                ('loan', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='repayment_requests',
                    to='loans.loanaccount',
                )),
                ('savings_account', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='loan_repayment_requests',
                    to='savings.savingsaccount',
                )),
                ('amount', models.DecimalField(decimal_places=2, max_digits=18)),
                ('payment_date', models.DateField()),
                ('requested_by', models.ForeignKey(
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='submitted_loan_repayment_requests',
                    to=settings.AUTH_USER_MODEL,
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
                ('reviewed_by', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='reviewed_loan_repayment_requests',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('reviewed_at', models.DateTimeField(blank=True, null=True)),
                ('rejection_reason', models.TextField(blank=True)),
                ('journal_entry', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='loan_repayment_request_journals',
                    to='transactions.transaction',
                )),
                ('notes', models.TextField(blank=True)),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
    ]
