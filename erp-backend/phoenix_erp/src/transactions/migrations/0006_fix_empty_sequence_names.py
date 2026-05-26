"""
Data migration: fix TransactionSeries rows whose sequence_name was left empty
by the 0004 seed migration (which used the historical model and therefore
skipped the custom save() logic that derives sequence_name from code).

For every row with an empty sequence_name this migration:
  1. Sets sequence_name = f"seq_ref_{code.lower()}"
  2. Creates the matching Postgres sequence (idempotently via IF NOT EXISTS)
"""

from django.db import migrations


def fix_sequence_names(apps, schema_editor):
    TransactionSeries = apps.get_model("transactions", "TransactionSeries")
    db_alias = schema_editor.connection.alias
    connection = schema_editor.connection

    rows = TransactionSeries.objects.using(db_alias).all()
    for series in rows:
        if not series.sequence_name:
            series.sequence_name = f"seq_ref_{series.code.lower()}"
            series.save(using=db_alias, update_fields=["sequence_name"])

        # Always ensure the Postgres sequence exists (safe if already present)
        with connection.cursor() as cursor:
            cursor.execute(
                f"CREATE SEQUENCE IF NOT EXISTS {series.sequence_name} START 1;"
            )


def reverse_fix(apps, schema_editor):
    # Nothing to reverse — clearing sequence_name would break things again
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("transactions", "0005_remove_workflow_reference_unique_together"),
    ]

    operations = [
        migrations.RunPython(fix_sequence_names, reverse_code=reverse_fix),
    ]
