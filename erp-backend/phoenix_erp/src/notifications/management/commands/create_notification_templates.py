# Management command to create templates
# notifications/management/commands/create_notification_templates.py
"""
Django management command to create notification templates
Run: python manage.py create_notification_templates
"""

from django.core.management.base import BaseCommand
from django.db import transaction
from notifications.models import (
    NotificationTemplate, NotificationChannel, TemplateChannelConfig
)
from notifications.fixtures.microfinance_templates import MICROFINANCE_TEMPLATES


class Command(BaseCommand):
    help = 'Create sample notification templates for microfinance'
    
    def add_arguments(self, parser):
        parser.add_argument(
            '--branch-id',
            type=int,
            required=True,
            help='Branch ID for templates'
        )
        parser.add_argument(
            '--owner-id',
            type=int,
            required=True,
            help='Owner user ID'
        )
    
    @transaction.atomic
    def handle(self, *args, **options):
        branch_id = options['branch_id']
        owner_id = options['owner_id']
        
        from branches.models import Branch
        from users.models import User
        
        branch = Branch.objects.get(id=branch_id)
        owner = User.objects.get(id=owner_id)
        
        created_count = 0
        
        for template_data in MICROFINANCE_TEMPLATES:
            # Create template
            template, created = NotificationTemplate.objects.get_or_create(
                code=template_data['code'],
                branch=branch,
                defaults={
                    'name': template_data['name'],
                    'category': template_data['category'],
                    'description': template_data['description'],
                    'default_priority': template_data['default_priority'],
                    'template_variables': template_data['template_variables'],
                    'send_conditions': template_data.get('send_conditions', {}),
                    'schedule_config': template_data.get('schedule_config', {}),
                    'owner': owner,
                    'created_by': owner,
                    'is_active': True,
                }
            )
            
            if created:
                self.stdout.write(
                    self.style.SUCCESS(f'Created template: {template.code}')
                )
                created_count += 1
                
                # Create channel configurations
                for channel_data in template_data.get('channels', []):
                    channel = NotificationChannel.objects.get(code=channel_data['channel_code'])
                    
                    TemplateChannelConfig.objects.create(
                        template=template,
                        channel=channel,
                        subject_template=channel_data.get('subject_template', ''),
                        body_template=channel_data['body_template'],
                        html_template=channel_data.get('html_template', ''),
                        is_active=True,
                    )
            else:
                self.stdout.write(
                    self.style.WARNING(f'Template already exists: {template.code}')
                )
        
        self.stdout.write(
            self.style.SUCCESS(f'\nCreated {created_count} new templates')
        )