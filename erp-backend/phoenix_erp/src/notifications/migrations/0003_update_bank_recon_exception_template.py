from django.db import migrations

from notifications.fixtures.microfinance_templates import MICROFINANCE_TEMPLATES

TEMPLATE_CODE = 'bank_recon_bank_only_exception'


def _get_template_data():
    return next(t for t in MICROFINANCE_TEMPLATES if t['code'] == TEMPLATE_CODE)


def update_template(apps, schema_editor):
    """
    create_notification_templates' get_or_create() only sets fields on
    creation, so a template already seeded on a server (from before this
    change) never picks up an updated fixture on its own. This generalizes
    the bank_only-only wording to also cover erp_only, and fixes a real
    rendering bug: the old context used a raw 'branch' key that collided
    with a declared template_variable of the same name, so {{branch}}
    rendered as a literal Python dict repr instead of the branch name (see
    banks/tasks.py's _notify_directors_of_high_priority_exception).
    """
    NotificationTemplate = apps.get_model('notifications', 'NotificationTemplate')
    NotificationChannel = apps.get_model('notifications', 'NotificationChannel')
    TemplateChannelConfig = apps.get_model('notifications', 'TemplateChannelConfig')

    template_data = _get_template_data()

    for template in NotificationTemplate.objects.filter(code=TEMPLATE_CODE):
        template.name = template_data['name']
        template.description = template_data['description']
        template.template_variables = template_data['template_variables']
        template.save(update_fields=['name', 'description', 'template_variables'])

        for channel_data in template_data['channels']:
            try:
                channel = NotificationChannel.objects.get(code=channel_data['channel_code'])
            except NotificationChannel.DoesNotExist:
                continue
            TemplateChannelConfig.objects.update_or_create(
                template=template, channel=channel,
                defaults={
                    'subject_template': channel_data.get('subject_template', ''),
                    'body_template': channel_data['body_template'],
                    'html_template': channel_data.get('html_template', ''),
                    'is_active': True,
                },
            )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('notifications', '0002_initial'),
    ]

    operations = [
        migrations.RunPython(update_template, noop_reverse),
    ]
