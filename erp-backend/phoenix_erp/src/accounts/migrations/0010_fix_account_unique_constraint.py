# Generated 2026-03-11
#
# Changes the unique constraint on Account.code from (code, owner, branch)
# to (code, tenant, branch).
#
# WHY:
#   The old constraint used `owner` as a scoping key, but `owner` is not
#   a reliable tenant identifier.  When the tenant-creation signal and the
#   `setup_chart_of_accounts` management command both resolved to different
#   owner users (e.g. system_1 vs. the real admin user), they could each
#   insert a full chart of 135 accounts with the same codes but different
#   owners — passing the old constraint but producing duplicate rows.
#
# PREREQUISITE:
#   Run `python manage.py deduplicate_accounts` BEFORE applying this
#   migration to collapse any existing (code, tenant, branch) duplicates
#   into a single row.  The migration will fail if duplicates exist.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0009_update_account_code_validator'),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name='account',
            name='unique_code_per_owner_branch_when_not_deleted',
        ),
        migrations.AddConstraint(
            model_name='account',
            constraint=models.UniqueConstraint(
                condition=models.Q(is_deleted=False),
                fields=['code', 'tenant', 'branch'],
                name='unique_code_per_tenant_branch_when_not_deleted',
            ),
        ),
    ]
