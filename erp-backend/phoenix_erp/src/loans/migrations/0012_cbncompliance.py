"""
Migration 0012 — CBN/IFRS compliance additions

Adds to LoanAccount:
  - interest_suspended + interest_suspended_at  (NPL interest suspension)
  - provision_pct + provision_amount            (CBN provisioning snapshot)

Adds to LoanProduct:
  - provision_expense_account  (Dr on monthly provision posting — EXPENSE)
  - allowance_account          (Cr on monthly provision posting — ASSET contra)
  - interest_suspense_account  (placeholder, INCOME contra — for future accrual reversal)
  - accrued_interest_account   (placeholder, ASSET — for accrual basis entries)

Creates:
  - LoanRestructure             (audit trail of every loan restructure event)
"""
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('loans', '0011_term_unit_repayment_buffer'),
        ('accounts', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # ── LoanProduct: provision + accrual GL accounts ──────────────────
        migrations.AddField(
            model_name='loanproduct',
            name='provision_expense_account',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='loan_products_provision_expense',
                to='accounts.account',
                help_text='P&L account debited when monthly provision is posted (EXPENSE type).',
            ),
        ),
        migrations.AddField(
            model_name='loanproduct',
            name='allowance_account',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='loan_products_allowance',
                to='accounts.account',
                help_text='Balance-sheet contra-asset credited when monthly provision is posted.',
            ),
        ),
        migrations.AddField(
            model_name='loanproduct',
            name='interest_suspense_account',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='loan_products_interest_suspense',
                to='accounts.account',
                help_text='Account used to park suspended interest on NPL loans (LIABILITY/contra-INCOME).',
            ),
        ),
        migrations.AddField(
            model_name='loanproduct',
            name='accrued_interest_account',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='loan_products_accrued_interest',
                to='accounts.account',
                help_text='ASSET account debited in daily interest accrual entries.',
            ),
        ),

        # ── LoanAccount: NPL suspension fields ───────────────────────────
        migrations.AddField(
            model_name='loanaccount',
            name='interest_suspended',
            field=models.BooleanField(
                default=False,
                help_text='True when interest accrual is suspended per CBN NPL rules (90+ DPD).',
            ),
        ),
        migrations.AddField(
            model_name='loanaccount',
            name='interest_suspended_at',
            field=models.DateField(
                blank=True,
                null=True,
                help_text='Date interest was first suspended on this loan.',
            ),
        ),

        # ── LoanAccount: provision snapshot ──────────────────────────────
        migrations.AddField(
            model_name='loanaccount',
            name='provision_pct',
            field=models.DecimalField(
                decimal_places=2,
                default=1,
                max_digits=5,
                help_text='CBN provision rate currently applied (%), updated by daily batch.',
            ),
        ),
        migrations.AddField(
            model_name='loanaccount',
            name='provision_amount',
            field=models.DecimalField(
                decimal_places=2,
                default=0,
                max_digits=18,
                help_text='Required provision in Naira (provision_pct × outstanding_principal).',
            ),
        ),

        # ── LoanRestructure model ─────────────────────────────────────────
        migrations.CreateModel(
            name='LoanRestructure',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('effective_date', models.DateField()),
                ('old_term', models.PositiveIntegerField()),
                ('old_term_unit', models.CharField(max_length=10)),
                ('old_interest_rate', models.DecimalField(decimal_places=2, max_digits=5)),
                ('old_repayment_frequency', models.CharField(max_length=20)),
                ('old_outstanding_principal', models.DecimalField(decimal_places=2, max_digits=18)),
                ('old_installment_amount', models.DecimalField(decimal_places=2, max_digits=18)),
                ('old_maturity_date', models.DateField(blank=True, null=True)),
                ('new_term', models.PositiveIntegerField()),
                ('new_term_unit', models.CharField(max_length=10)),
                ('new_interest_rate', models.DecimalField(decimal_places=2, max_digits=5)),
                ('new_repayment_frequency', models.CharField(max_length=20)),
                ('new_installment_amount', models.DecimalField(decimal_places=2, max_digits=18, default=0)),
                ('new_maturity_date', models.DateField(blank=True, null=True)),
                ('reason', models.TextField(blank=True)),
                ('notes', models.TextField(blank=True)),
                ('loan', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='restructures',
                    to='loans.loanaccount',
                )),
                ('restructured_by', models.ForeignKey(
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='loan_restructures_authorised',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={'ordering': ['-effective_date']},
        ),
    ]
