"""
Manual merge migration to resolve conflicting leaf nodes in the
accounts migration graph. This migration depends on both conflicting
leaves so Django has a single linear history for applying migrations.

It intentionally contains no operations and is a safe no-op.
"""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0003_initial"),
        ("accounts", "0004_setup_standard_chart_of_accounts"),
    ]

    operations = []
