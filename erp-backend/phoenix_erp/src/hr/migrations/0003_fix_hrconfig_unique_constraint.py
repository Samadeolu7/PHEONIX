# Generated manually to fix HRConfig unique constraint
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('hr', '0002_initial'),
    ]

    operations = [
        migrations.AlterUniqueTogether(
            name='hrconfig',
            unique_together={('tenant', 'owner', 'branch')},
        ),
    ]
