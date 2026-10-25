from datetime import timedelta

from django.db import migrations

SMART_SAVINGS_NOTICE_DAYS = 14
OPEN_STATUSES = ('pending', 'partially_approved', 'fully_approved')


def backfill(apps, schema_editor):
    """
    Open withdrawal requests created before the notice-period feature have no dates.
    Treat the day the request was created as the day the client asked; Smart Savers
    get the notice period on top, everyone else is due the same day.
    """
    Request = apps.get_model('savings', 'SavingsWithdrawalRequest')
    Smart = apps.get_model('savings', 'SmartSavingsAccount')
    smart_account_ids = set(
        Smart.objects.filter(is_active=True, is_deleted=False).values_list('savings_id', flat=True))

    for wr in Request.objects.filter(status__in=OPEN_STATUSES, payout_due_date__isnull=True):
        asked = wr.created_at.date()
        notice = SMART_SAVINGS_NOTICE_DAYS if wr.savings_account_id in smart_account_ids else 0
        wr.client_requested_on = wr.client_requested_on or asked
        wr.payout_due_date = wr.client_requested_on + timedelta(days=notice)
        wr.save(update_fields=['client_requested_on', 'payout_due_date'])


class Migration(migrations.Migration):

    dependencies = [
        ('savings', '0013_savingswithdrawalrequest_client_requested_on_and_more'),
    ]

    operations = [
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]
