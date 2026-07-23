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
bank lines. Two code-level layers now prevent this — run_pool_
reconciliation_match serializes all matching per bank_account behind a
Postgres advisory lock, and _persist_outcome rechecks live claims before
committing — so this index should never actually fire; it is the
last-resort DB-level guarantee against anything that bypasses both (a
lock bug, a future caller, an ops change to the celery worker pool type).

IMPORTANT: this migration fails with a duplicate-key error if any
matched_erp_payment_id value is still shared by more than one matched=True
row. The production backlog (21 → 0) was cleared on 2026-07-23 via
unmatch_duplicate_claimed_payments/unmatch_usurped_reference_matches
before this was allowed to deploy — if it ever fails on a fresh
environment, run those commands first.
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
