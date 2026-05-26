from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from automations.models import WorkflowStep

User = get_user_model()

class Command(BaseCommand):
    help = 'Seeds initial workflow steps'

    def handle(self, *args, **options):
        # Get or create superuser for seeding
        user = User.objects.filter(username='samuel').first()
        if not user:
            self.stdout.write('No superuser found. Please create one first.')
            return

        steps = [
            {'code': 'initiated', 'label': 'Initiated', 'order': 10},
            {'code': 'pending_approval', 'label': 'Pending Approval', 'order': 20},
            {'code': 'approved', 'label': 'Approved', 'order': 30},
            {'code': 'processing', 'label': 'Processing', 'order': 40},
            {'code': 'completed', 'label': 'Completed', 'order': 50},
            {'code': 'failed', 'label': 'Failed', 'order': 60},
        ]

        for step_data in steps:
            WorkflowStep.objects.get_or_create(
                code=step_data['code'],
                defaults={
                    'label': step_data['label'],
                    'order': step_data['order'],
                    'created_by': user,
                    'owner': user
                }
            )

        self.stdout.write(self.style.SUCCESS('Successfully seeded workflow steps'))
