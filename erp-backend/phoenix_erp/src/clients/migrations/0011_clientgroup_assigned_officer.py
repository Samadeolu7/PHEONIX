from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('clients', '0010_registration_config_and_prospect_client_type'),
        ('hr', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='clientgroup',
            name='assigned_officer',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='managed_groups',
                to='hr.staff',
                help_text='Credit officer responsible for managing this group and all its members.',
            ),
        ),
        migrations.AddIndex(
            model_name='clientgroup',
            index=models.Index(fields=['assigned_officer'], name='clients_clientgroup_officer_idx'),
        ),
    ]
