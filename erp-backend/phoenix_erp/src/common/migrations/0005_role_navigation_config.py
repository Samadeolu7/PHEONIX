from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('common', '0004_financial_audit_log'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='RoleNavigationConfig',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('role', models.CharField(help_text='Role name, e.g. "Credit Officer"', max_length=100)),
                ('enabled_ids', models.JSONField(default=list, help_text='Ordered list of sidebar button IDs')),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('tenant', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='role_nav_configs', to='users.tenant')),
                ('updated_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'Role Navigation Config',
                'unique_together': {('tenant', 'role')},
            },
        ),
    ]
