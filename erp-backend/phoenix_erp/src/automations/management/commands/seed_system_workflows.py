
from django.core.management.base import BaseCommand
from automations.models import WorkflowTemplate
from automations.services.system_workflows import SYSTEM_WORKFLOWS


class Command(BaseCommand):
    help = 'Seed system workflows into database'
    
    def handle(self, *args, **options):
        for workflow_key, workflow_data in SYSTEM_WORKFLOWS.items():
            workflow, created = WorkflowTemplate.objects.update_or_create(
                name=workflow_data['name'],
                workflow_type='system',
                defaults={
                    'description': workflow_data['description'],
                    'access_level': workflow_data['access_level'],
                    'category': workflow_data['category'],
                    'is_atomic': workflow_data['is_atomic'],
                    'is_locked': workflow_data['is_locked'],
                    'required_inputs': workflow_data['required_inputs'],
                    'outputs': workflow_data['outputs'],
                    'workflow_definition': workflow_data['workflow_definition'],
                    'trigger_type': 'manual',
                    'trigger_config': {},
                    'is_active': True,
                    'version': 1,
                }
            )
            
            action = 'Created' if created else 'Updated'
            self.stdout.write(
                self.style.SUCCESS(f'{action} system workflow: {workflow.name}')
            )
        
        self.stdout.write(
            self.style.SUCCESS(f'\nSeeded {len(SYSTEM_WORKFLOWS)} system workflows')
        )
