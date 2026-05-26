
from django.core.management.base import BaseCommand
from django.utils import timezone
from automations.models import AutomationTemplate, AutomationRun
import logging

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Process scheduled workflows (run via cron)'

    def handle(self, *args, **options):
        """
        Find templates with scheduling enabled and create runs if needed.
        This would be called by a cron job or celery beat.
        """
        now = timezone.now()
        
        templates = AutomationTemplate.objects.filter(
            scheduling_enabled=True,
            deleted_at__isnull=True
        )
        
        for template in templates:
            try:
                # Check if it's time to run based on scheduling_config
                if self.should_run(template, now):
                    run = AutomationRun.objects.create(
                        template=template,
                        current_step=template.initial_step,
                        scheduled_at=now,
                        parameters={'trigger_type': 'schedule'},
                        owner=template.owner,
                        created_by=template.created_by
                    )
                    self.stdout.write(
                        self.style.SUCCESS(f'Created scheduled run: {run.run_reference}')
                    )
            except Exception as e:
                logger.exception(f"Failed to create scheduled run for {template.name}: {e}")
                self.stdout.write(
                    self.style.ERROR(f'Failed for {template.name}: {e}')
                )
    
    def should_run(self, template: 'AutomationTemplate', now) -> bool:
        """
        Determine if a template should run based on its scheduling config.
        Implement your cron parsing logic here.
        """
        config = template.scheduling_config or {}
        
        # Simple example: daily at specific hour
        if config.get('frequency') == 'daily':
            target_hour = config.get('hour', 0)
            if now.hour == target_hour and now.minute < 5:  # 5-minute window
                return True
        
        # Add more sophisticated cron-like logic as needed
        return False
