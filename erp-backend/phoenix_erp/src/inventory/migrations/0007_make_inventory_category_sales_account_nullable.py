import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0001_initial'),
        ('inventory', '0006_add_item_type_to_inventorycategory'),
    ]

    operations = [
        migrations.AlterField(
            model_name='inventorycategory',
            name='sales_account',
            field=models.ForeignKey(
                blank=True,
                help_text='Income account for sales revenue (auto-created per category if not provided)',
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='sales_categories',
                to='accounts.account',
            ),
        ),
    ]
