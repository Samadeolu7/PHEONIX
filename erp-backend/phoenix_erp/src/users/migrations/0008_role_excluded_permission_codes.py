from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0007_tenant_domainconfig_customlabels_nullable'),
    ]

    operations = [
        migrations.AddField(
            model_name='role',
            name='excluded_permission_codes',
            field=models.JSONField(
                blank=True,
                default=list,
                help_text=(
                    'Permission codes explicitly denied for this role even when '
                    'permission_codes contains "*" (e.g., ["po-approve", "pr-approve"])'
                ),
            ),
        ),
    ]
