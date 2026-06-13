# Generated 2026-06-13
#
# Upgrades the Account.code field to support both:
#   - 4-digit GL/parent codes   (e.g. 1150)  — unchanged for existing data
#   - PPPP-NNNNN sub-ledger codes (e.g. 1150-00001) — new for individual
#     client loan and savings accounts (unlimited scale, no collision with GL)
#
# Why this is needed
# ------------------
# Previously the validator required EXACTLY 4 digits for every account,
# which meant individual client savings/loan accounts had to compete for
# 4-digit codes in the parent's section range (e.g. 1151, 1152 …).  This:
#   (a) collided with other defined parent accounts (1200, 1210, …)
#   (b) limited each GL parent to ~99 child accounts
#
# The new format is PPPP-NNNNN — a fixed 4-digit parent prefix, a hyphen,
# and a 5-digit zero-padded sequence.  max_length=10 covers this exactly
# (4 + 1 + 5 = 10 chars).  Existing data is unaffected.
#
# Correct accounting treatment (IFRS / CBN Microfinance):
#   1150  Customer Loan Portfolio  (LOAN type, ASSET section 1000–1999)
#     └─ 1150-00001  Loan – John Doe (LN-1)       ← sub-ledger entry
#     └─ 1150-00002  Loan – Jane Doe (LN-2)
#
#   2140  Customer Savings and Deposits  (SAVINGS type, LIABILITY section 2000–2999)
#     └─ 2140-00001  Savings – John Doe            ← sub-ledger entry
#     └─ 2140-00002  Savings – Jane Doe

import django.core.validators
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0011_bank_account_fk_on_expense_and_replenishment'),
    ]

    operations = [
        migrations.AlterField(
            model_name='account',
            name='code',
            field=models.CharField(
                max_length=10,
                validators=[
                    django.core.validators.RegexValidator(
                        r'^\d{4}(-\d{5})?$',
                        'Account code must be either a 4-digit GL code (e.g. 1150) '
                        'or a sub-ledger code in PPPP-NNNNN format (e.g. 1150-00001). '
                        'GL ranges: 1000\u20131999 Assets, 2000\u20132999 Liabilities, '
                        '3000\u20133999 Equity, 4000\u20134999 Revenue, 5000\u20135999 Expenses.',
                    )
                ],
                help_text=(
                    '4-digit GL code (e.g. 1150) for parent accounts, or '
                    'PPPP-NNNNN (e.g. 1150-00001) for sub-ledger child accounts.'
                ),
            ),
        ),
    ]
