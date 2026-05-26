from django.core.management.base import BaseCommand
from automations.workflow_definitions import initialize_school_workflows
from django.db import transaction
class Command(BaseCommand):
    help = 'Initialize school-specific workflows'

    def handle(self, *args, **options):
        with transaction.atomic():
            try:
                workflows = initialize_school_workflows()
            except Exception as e:
                self.stdout.write(self.style.ERROR(f'Error initializing workflows: {e}'))
                return

        self.stdout.write(
            self.style.SUCCESS(f'Successfully created {len(workflows)} workflows')
        )