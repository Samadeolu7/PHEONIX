"""
Migration: Add GL account FKs to LoanProduct and LoanAccount.

Changes:
  LoanProduct:
    + disbursement_account      FK → accounts.Account (null, ASSET)
    + interest_income_account   FK → accounts.Account (null, INCOME)
    + fee_income_account        FK → accounts.Account (null, INCOME)
    + penalty_income_account    FK → accounts.Account (null, INCOME)

  LoanAccount:
    + disbursement_journal_entry FK → transactions.Transaction (null)
"""

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('loans', '0002_initial'),
        ('accounts', '0003_initial'),
        ('transactions', '0003_add_financial_report_indexes'),
    ]

    operations = [
        # ── LoanProduct: disbursement_account ─────────────────────────────
        migrations.AddField(
            model_name='loanproduct',
            name='disbursement_account',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='loan_products_disbursed_from',
                limit_choices_to={'account_type': 'ASSET'},
                to='accounts.account',
                help_text='Cash/Bank GL account from which loan funds are disbursed',
            ),
        ),
        # ── LoanProduct: interest_income_account ──────────────────────────
        migrations.AddField(
            model_name='loanproduct',
            name='interest_income_account',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='loan_products_interest_income',
                limit_choices_to={'account_type': 'INCOME'},
                to='accounts.account',
                help_text='Income GL account for interest earned on this loan product',
            ),
        ),
        # ── LoanProduct: fee_income_account ───────────────────────────────
        migrations.AddField(
            model_name='loanproduct',
            name='fee_income_account',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='loan_products_fee_income',
                limit_choices_to={'account_type': 'INCOME'},
                to='accounts.account',
                help_text='Income GL account for processing/admin fees on this loan product',
            ),
        ),
        # ── LoanProduct: penalty_income_account ───────────────────────────
        migrations.AddField(
            model_name='loanproduct',
            name='penalty_income_account',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='loan_products_penalty_income',
                limit_choices_to={'account_type': 'INCOME'},
                to='accounts.account',
                help_text='Income GL account for late payment penalties on this loan product',
            ),
        ),
        # ── LoanAccount: disbursement_journal_entry ───────────────────────
        migrations.AddField(
            model_name='loanaccount',
            name='disbursement_journal_entry',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='loan_disbursements',
                to='transactions.transaction',
                help_text='Journal entry created when this loan was disbursed',
            ),
        ),
    ]
