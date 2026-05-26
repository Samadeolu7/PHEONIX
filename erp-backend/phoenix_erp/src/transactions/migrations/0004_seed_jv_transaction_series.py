"""
Data migration: seed core TransactionSeries records.

Ensures the JV (Journal Voucher) series — and a few other common ones —
exist before any GL transactions are created through the frontend.
"""

from django.db import migrations


CORE_SERIES = [
    {"code": "JV",  "description": "Journal Voucher (manual GL entries)"},
    {"code": "CN",  "description": "Credit Notes"},
    {"code": "BT",  "description": "Bank Transfer"},
    {"code": "PC",  "description": "Petty Cash"},
    {"code": "ADJ", "description": "Stock / Balance Adjustment"},
]


def seed_series(apps, schema_editor):
    TransactionSeries = apps.get_model("transactions", "TransactionSeries")
    db_alias = schema_editor.connection.alias
    connection = schema_editor.connection

    for item in CORE_SERIES:
        # Derive sequence_name here because the historical model has no custom
        # save() logic to do it automatically.
        seq_name = f"seq_ref_{item['code'].lower()}"
        try:
            obj, created = TransactionSeries.objects.using(db_alias).get_or_create(
                code=item["code"],
                defaults={
                    "description": item["description"],
                    "sequence_name": seq_name,
                },
            )
            # Backfill missing fields on pre-existing rows
            update_fields = []
            if not obj.description:
                obj.description = item["description"]
                update_fields.append("description")
            if not obj.sequence_name:
                obj.sequence_name = seq_name
                update_fields.append("sequence_name")
            if update_fields:
                obj.save(using=db_alias, update_fields=update_fields)
        except Exception:
            # Row already exists (e.g. IntegrityError on sequence_name unique);
            # safe to skip — the data is already present.
            pass

        # Ensure the Postgres sequence exists regardless of whether we just
        # created the row or it already existed.
        with connection.cursor() as cursor:
            cursor.execute(
                f"CREATE SEQUENCE IF NOT EXISTS {seq_name} START 1;"
            )


def reverse_seed(apps, schema_editor):
    # Only remove series that have NO transactions linked to them
    TransactionSeries = apps.get_model("transactions", "TransactionSeries")
    Transaction = apps.get_model("transactions", "Transaction")
    db_alias = schema_editor.connection.alias

    codes = [s["code"] for s in CORE_SERIES]
    for code in codes:
        try:
            series = TransactionSeries.objects.using(db_alias).get(code=code)
            if not Transaction.objects.using(db_alias).filter(series=series).exists():
                series.delete()
        except TransactionSeries.DoesNotExist:
            pass


class Migration(migrations.Migration):

    dependencies = [
        ("transactions", "0003_add_financial_report_indexes"),
    ]

    operations = [
        migrations.RunPython(seed_series, reverse_code=reverse_seed),
    ]
