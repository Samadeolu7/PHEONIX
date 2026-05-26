"""
permissions/migrations/0001_initial.py

Creates:
  - perm_role_policy  (RolePermissionPolicy)
  - perm_user_override (UserPermissionOverride)
  - perm_elevation_log (PermissionElevationLog)
"""

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('pages', '0003_add_page_actions_and_role_permissions'),
        ('users', '0009_role_mf_scope_fields'),
        ('clients', '0001_initial'),
        ('branches', '0003_branch_latitude_branch_longitude'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # ── RolePermissionPolicy ──────────────────────────────────────────────
        migrations.CreateModel(
            name='RolePermissionPolicy',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('can_view',    models.BooleanField(default=False)),
                ('can_create',  models.BooleanField(default=False)),
                ('can_edit',    models.BooleanField(default=False)),
                ('can_delete',  models.BooleanField(default=False)),
                ('can_approve', models.BooleanField(default=False)),
                ('can_export',  models.BooleanField(default=False)),
                ('scope', models.CharField(
                    max_length=20,
                    choices=[
                        ('global',           'All Branches (Global)'),
                        ('own_branch',       'Own Branch Only'),
                        ('assigned_clients', 'Assigned Clients Only'),
                        ('ajo_group',        'Specific Ajo/Savings Group'),
                        ('own_records',      'Own Records Only'),
                    ],
                    default='own_branch',
                    help_text='Data visibility scope for this role on this module/page/action.',
                )),
                ('approval_limit', models.DecimalField(
                    max_digits=18, decimal_places=2,
                    null=True, blank=True,
                    help_text='Maximum monetary amount this role may approve. NULL = unlimited.',
                )),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('role', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='permission_policies',
                    to='users.role',
                )),
                ('module', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='role_policies',
                    to='pages.module',
                    null=True, blank=True,
                )),
                ('page', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='role_policies',
                    to='pages.modulepage',
                    null=True, blank=True,
                )),
                ('action', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='role_policies',
                    to='pages.pageaction',
                    null=True, blank=True,
                )),
                ('created_by', models.ForeignKey(
                    on_delete=django.db.models.deletion.SET_NULL,
                    null=True, blank=True,
                    related_name='created_role_policies',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'db_table': 'perm_role_policy',
                'ordering': ['role', 'module', 'page', 'action'],
            },
        ),
        migrations.AddIndex(
            model_name='rolepermissionpolicy',
            index=models.Index(fields=['role', 'module'], name='perm_role_policy_role_module'),
        ),
        migrations.AddIndex(
            model_name='rolepermissionpolicy',
            index=models.Index(fields=['role', 'page'], name='perm_role_policy_role_page'),
        ),
        migrations.AddIndex(
            model_name='rolepermissionpolicy',
            index=models.Index(fields=['role', 'action'], name='perm_role_policy_role_action'),
        ),

        # ── UserPermissionOverride ────────────────────────────────────────────
        migrations.CreateModel(
            name='UserPermissionOverride',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('can_view',    models.BooleanField(null=True, blank=True)),
                ('can_create',  models.BooleanField(null=True, blank=True)),
                ('can_edit',    models.BooleanField(null=True, blank=True)),
                ('can_delete',  models.BooleanField(null=True, blank=True)),
                ('can_approve', models.BooleanField(null=True, blank=True)),
                ('can_export',  models.BooleanField(null=True, blank=True)),
                ('scope', models.CharField(
                    max_length=20,
                    choices=[
                        ('global',           'All Branches (Global)'),
                        ('own_branch',       'Own Branch Only'),
                        ('assigned_clients', 'Assigned Clients Only'),
                        ('ajo_group',        'Specific Ajo/Savings Group'),
                        ('own_records',      'Own Records Only'),
                    ],
                    null=True, blank=True,
                    help_text='Override the data scope for this user. NULL = use role default.',
                )),
                ('approval_limit', models.DecimalField(
                    max_digits=18, decimal_places=2,
                    null=True, blank=True,
                    help_text='Override approval monetary limit for this user.',
                )),
                ('expiry_type', models.CharField(
                    max_length=20,
                    choices=[
                        ('permanent', 'Permanent'),
                        ('date',      'Expires on Date'),
                        ('datetime',  'Expires at Date/Time'),
                        ('duration',  'Expires After Duration'),
                    ],
                    default='permanent',
                )),
                ('expires_at', models.DateTimeField(
                    null=True, blank=True,
                    help_text='Set when expiry_type is "date" or "datetime".',
                )),
                ('expire_after_hours', models.PositiveIntegerField(
                    null=True, blank=True,
                    help_text='Set when expiry_type is "duration". Hours from granted_at.',
                )),
                ('expiry_behavior', models.CharField(
                    max_length=20,
                    choices=[
                        ('auto_revoke',  'Auto-Revoke on Expiry'),
                        ('auto_suspend', 'Auto-Suspend on Expiry'),
                        ('alert_only',   'Alert Only — Keep Active'),
                    ],
                    default='auto_revoke',
                )),
                ('is_active',    models.BooleanField(default=True)),
                ('is_suspended', models.BooleanField(default=False)),
                ('is_elevated',  models.BooleanField(
                    default=False,
                    help_text="True when this override grants more than the user's role allows.",
                )),
                ('granted_at',    models.DateTimeField(auto_now_add=True)),
                ('grant_reason',  models.TextField(blank=True)),
                ('revoked_at',    models.DateTimeField(null=True, blank=True)),
                ('revoke_reason', models.TextField(blank=True)),
                ('user', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='permission_overrides',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('module', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='user_overrides',
                    to='pages.module',
                    null=True, blank=True,
                )),
                ('page', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='user_overrides',
                    to='pages.modulepage',
                    null=True, blank=True,
                )),
                ('action', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='user_overrides',
                    to='pages.pageaction',
                    null=True, blank=True,
                )),
                ('scope_ajo_group', models.ForeignKey(
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='permission_overrides',
                    to='clients.clientgroup',
                    null=True, blank=True,
                    help_text='The Ajo group this override scopes to (only when scope=ajo_group).',
                )),
                ('granted_by', models.ForeignKey(
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='granted_overrides',
                    to=settings.AUTH_USER_MODEL,
                    null=True, blank=True,
                )),
                ('revoked_by', models.ForeignKey(
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='revoked_overrides',
                    to=settings.AUTH_USER_MODEL,
                    null=True, blank=True,
                )),
            ],
            options={
                'db_table': 'perm_user_override',
                'ordering': ['-granted_at'],
            },
        ),
        migrations.AddIndex(
            model_name='userpermissionoverride',
            index=models.Index(fields=['user', 'is_active'], name='perm_user_override_user_active'),
        ),
        migrations.AddIndex(
            model_name='userpermissionoverride',
            index=models.Index(fields=['is_elevated', 'is_active'], name='perm_user_override_elevated'),
        ),
        migrations.AddIndex(
            model_name='userpermissionoverride',
            index=models.Index(fields=['expires_at'], name='perm_user_override_expires_at'),
        ),

        # ── PermissionElevationLog ────────────────────────────────────────────
        migrations.CreateModel(
            name='PermissionElevationLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('action_code',  models.CharField(max_length=100,
                    help_text='Permission code used (e.g. "loan-approve").')),
                ('record_type',  models.CharField(max_length=100,
                    help_text='Django model name of the affected record.')),
                ('record_id',    models.CharField(max_length=100,
                    help_text='PK of the affected record as a string.')),
                ('scope_used',   models.CharField(max_length=20, choices=[
                    ('global',           'All Branches (Global)'),
                    ('own_branch',       'Own Branch Only'),
                    ('assigned_clients', 'Assigned Clients Only'),
                    ('ajo_group',        'Specific Ajo/Savings Group'),
                    ('own_records',      'Own Records Only'),
                ], blank=True)),
                ('approval_amount', models.DecimalField(
                    max_digits=18, decimal_places=2,
                    null=True, blank=True,
                    help_text='Monetary amount involved (for financial approval actions).',
                )),
                ('field_changes', models.JSONField(
                    default=dict,
                    help_text='{"field_name": {"before": <old>, "after": <new>}}',
                )),
                ('logged_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('user', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='elevation_logs',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('override', models.ForeignKey(
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='elevation_logs',
                    to='permissions.userpermissionoverride',
                    null=True, blank=True,
                    help_text='The specific override that elevated this action.',
                )),
                ('branch', models.ForeignKey(
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='elevation_logs',
                    to='branches.branch',
                    null=True, blank=True,
                )),
            ],
            options={
                'db_table': 'perm_elevation_log',
                'ordering': ['-logged_at'],
            },
        ),
        migrations.AddIndex(
            model_name='permissionelevationlog',
            index=models.Index(fields=['user', 'logged_at'], name='perm_elev_log_user_logged'),
        ),
        migrations.AddIndex(
            model_name='permissionelevationlog',
            index=models.Index(fields=['override', 'logged_at'], name='perm_elev_log_override_logged'),
        ),
        migrations.AddIndex(
            model_name='permissionelevationlog',
            index=models.Index(fields=['record_type', 'record_id'], name='perm_elev_log_record'),
        ),
    ]
