"""
Migration 0009: Add default_scope and default_approval_limit to Role.

These fields power the microfinance scope system — every role now carries
a default data-visibility scope and an optional monetary approval ceiling.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0008_role_excluded_permission_codes'),
    ]

    operations = [
        migrations.AddField(
            model_name='role',
            name='default_scope',
            field=models.CharField(
                max_length=20,
                choices=[
                    ('global',           'All Branches (Global)'),
                    ('own_branch',       'Own Branch Only'),
                    ('assigned_clients', 'Assigned Clients Only'),
                    ('ajo_group',        'Specific Ajo/Savings Group'),
                    ('own_records',      'Own Records Only'),
                ],
                default='own_branch',
                help_text=(
                    'Default data-visibility scope for all users with this role. '
                    'Individual RolePermissionPolicy entries can narrow or widen this.'
                ),
            ),
        ),
        migrations.AddField(
            model_name='role',
            name='default_approval_limit',
            field=models.DecimalField(
                max_digits=18,
                decimal_places=2,
                null=True,
                blank=True,
                help_text=(
                    'Default monetary approval ceiling for this role. '
                    'NULL = unlimited.  Can be overridden per-policy and per-user.'
                ),
            ),
        ),
    ]
