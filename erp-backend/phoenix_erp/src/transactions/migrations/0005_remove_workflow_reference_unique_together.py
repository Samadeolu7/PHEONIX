"""
Remove workflow_reference from Transaction.unique_together.

Rationale: When two manual JVs have no workflow_reference (NULL/blank),
the DB-level unique constraint on (owner, workflow_reference) fires an
IntegrityError because some databases treat (owner, NULL) as violating
a unique pair. Manual journal entries frequently have no workflow reference,
so this constraint must be dropped.

The index on (owner, workflow_reference) is kept for query performance.
"""

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("transactions", "0004_seed_jv_transaction_series"),
    ]

    operations = [
        migrations.AlterUniqueTogether(
            name="transaction",
            unique_together={("owner", "reference_number")},
        ),
    ]
