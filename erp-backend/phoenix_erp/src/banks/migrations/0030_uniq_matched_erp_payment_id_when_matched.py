"""
Partial unique index: an ERP payment can be matched_erp_payment_id on at
most one ReconciliationBankTransaction row at a time (while matched=True).

matched_erp_payment_id is a plain IntegerField, not a real FK — nothing at
the DB level ever enforced one-to-one matching. Two reconciliation task
runs with overlapping ±window_days on the same bank_account could each see
an ERP payment as unclaimed and both commit a match to it during the ~90s
their Java HTTP call was in flight (banks/tasks.py's already_matched_erp_ids
exclusion is only a snapshot taken before that call). Confirmed live in
production: 21 payments each simultaneously matched=True on 2-3 different
bank lines. banks/tasks.py's _persist_outcome now rechecks live state
before committing a match, closing the race in the common case; this
index is the last-resort DB-level guarantee for the residual window.

IMPORTANT: this migration will fail with a duplicate-key error if any
matched_erp_payment_id value is still shared by more than one matched=True
row. Run `python manage.py unmatch_duplicate_claimed_payments --user-id
<id> --apply` to clear the existing backlog BEFORE this migration is
applied.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('banks', '0029_reconciliationexception_unresolved_at_and_more'),
    ]

    operations = [
        migrations.AddConstraint(
            model_name='reconciliationbanktransaction',
            constraint=models.UniqueConstraint(
                fields=['matched_erp_payment_id'],
                condition=models.Q(matched=True),
                name='uniq_matched_erp_payment_id_when_matched',
            ),
        ),
    ]
