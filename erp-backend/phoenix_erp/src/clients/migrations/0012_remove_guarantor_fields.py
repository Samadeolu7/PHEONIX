from django.db import migrations


class Migration(migrations.Migration):
    """
    Remove the six legacy guarantor text fields from Client.
    Guarantor data now lives exclusively in loans.LoanGuarantor,
    where a guarantor is a proper Client record (FK relationship).
    """

    dependencies = [
        ('clients', '0011_clientgroup_assigned_officer'),
    ]

    operations = [
        migrations.RemoveField(model_name='client', name='guarantor_name'),
        migrations.RemoveField(model_name='client', name='guarantor_relationship'),
        migrations.RemoveField(model_name='client', name='guarantor_phone'),
        migrations.RemoveField(model_name='client', name='guarantor_occupation'),
        migrations.RemoveField(model_name='client', name='guarantor_home_address'),
        migrations.RemoveField(model_name='client', name='guarantor_office_address'),
    ]
