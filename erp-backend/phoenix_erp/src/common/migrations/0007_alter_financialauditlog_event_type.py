# Generated manually to keep migration state in sync with the new
# CLIENT_REGISTRATION_FEE event type added to FinancialAuditLog.EVENT_CHOICES
# (choices-only change — no schema/constraint impact).

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('common', '0006_alter_financialauditlog_event_type'),
    ]

    operations = [
        migrations.AlterField(
            model_name='financialauditlog',
            name='event_type',
            field=models.CharField(choices=[('loan_approve', 'Loan Approved'), ('loan_disburse', 'Loan Disbursed'), ('loan_repay', 'Loan Repayment'), ('loan_balance_correction', 'Loan Balance Correction'), ('savings_deposit', 'Savings Deposit'), ('savings_withdraw', 'Savings Withdrawal'), ('journal_post', 'Journal Entry Posted'), ('permission_change', 'Permission Changed'), ('user_role_change', 'User Role Changed'), ('client_registration_fee', 'Client Registration Fee Collected')], db_index=True, max_length=30),
        ),
    ]
