# hr/management/commands/setup_hr_workflows.py
"""
Management command to set up HR workflow templates

Usage:
    python manage.py setup_hr_workflows --branch-id 1 --owner-email admin@company.com
"""

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from automations.models import WorkflowTemplate
from branches.models import Branch
from users.models import User
from hr.workflow_examples import HR_WORKFLOW_TEMPLATES
from hr.workflow_step_handlers import register_hr_workflow_handlers


class Command(BaseCommand):
    help = 'Set up HR workflow templates for a branch'

    def add_arguments(self, parser):
        parser.add_argument(
            '--branch-id',
            type=int,
            required=True,
            help='Branch ID to create workflows for'
        )
        parser.add_argument(
            '--owner-email',
            type=str,
            required=True,
            help='Email of user who will own these workflows'
        )
        parser.add_argument(
            '--overwrite',
            action='store_true',
            help='Overwrite existing workflows with same run_sequence'
        )

    @transaction.atomic
    def handle(self, *args, **options):
        branch_id = options['branch_id']
        owner_email = options['owner_email']
        overwrite = options['overwrite']

        # Get branch
        try:
            branch = Branch.objects.get(id=branch_id)
        except Branch.DoesNotExist:
            raise CommandError(f'Branch with ID {branch_id} not found')

        # Get owner
        try:
            owner = User.objects.get(email=owner_email)
        except User.DoesNotExist:
            raise CommandError(f'User with email {owner_email} not found')

        self.stdout.write('\n' + '='*70)
        self.stdout.write(self.style.SUCCESS('HR WORKFLOW TEMPLATES SETUP'))
        self.stdout.write('='*70 + '\n')

        self.stdout.write(f'Branch: {branch.name} (ID: {branch.id})')
        self.stdout.write(f'Owner: {owner.email} (ID: {owner.id})\n')

        # Register workflow handlers
        self.stdout.write('Registering HR workflow step handlers...')
        register_hr_workflow_handlers()
        self.stdout.write(self.style.SUCCESS('✓ Handlers registered\n'))

        # Create workflow templates
        created_count = 0
        updated_count = 0
        skipped_count = 0

        for template_data in HR_WORKFLOW_TEMPLATES:
            name = template_data['name']
            run_sequence = f"HR_{name.upper().replace(' ', '_')}"

            # Check if exists
            existing = WorkflowTemplate.objects.filter(
                branch=branch,
                run_sequence=run_sequence
            ).first()

            if existing and not overwrite:
                self.stdout.write(
                    self.style.WARNING(f'⚠ Skipped: {name} (already exists)')
                )
                skipped_count += 1
                continue

            if existing and overwrite:
                # Update existing
                existing.name = template_data['name']
                existing.description = template_data['description']
                existing.category = template_data['category']
                existing.workflow_definition = template_data['workflow_definition']
                existing.save()

                self.stdout.write(
                    self.style.SUCCESS(f'✓ Updated: {name}')
                )
                updated_count += 1
            else:
                # Create new
                workflow = WorkflowTemplate.objects.create(
                    branch=branch,
                    owner=owner,
                    created_by=owner,
                    name=template_data['name'],
                    run_sequence=run_sequence,
                    description=template_data['description'],
                    category=template_data['category'],
                    workflow_definition=template_data['workflow_definition'],
                    workflow_type='standard',
                    is_active=True
                )

                self.stdout.write(
                    self.style.SUCCESS(f'✓ Created: {name} (ID: {workflow.id})')
                )
                created_count += 1

        # Summary
        self.stdout.write('\n' + '='*70)
        self.stdout.write(self.style.SUCCESS('SUMMARY'))
        self.stdout.write('='*70)
        self.stdout.write(f'Created: {created_count}')
        self.stdout.write(f'Updated: {updated_count}')
        self.stdout.write(f'Skipped: {skipped_count}')
        self.stdout.write('='*70 + '\n')

        # Next steps
        self.stdout.write(self.style.WARNING('NEXT STEPS:'))
        self.stdout.write('1. Create HRConfig for your branch')
        self.stdout.write('2. Link workflow templates to HRConfig')
        self.stdout.write('3. Create FormSchemas for leave requests, attendance, etc.')
        self.stdout.write('4. Create WorkflowBindings to link forms to workflows')
        self.stdout.write('\nExample:')
        self.stdout.write('''
from hr.config_models import HRConfig
from automations.models import WorkflowTemplate

# Create config
config = HRConfig.objects.create(
    branch=branch,
    owner=owner,
    default_leave_workflow=WorkflowTemplate.objects.get(run_sequence='HR_STANDARD_LEAVE_APPROVAL'),
    extended_leave_workflow=WorkflowTemplate.objects.get(run_sequence='HR_EXTENDED_LEAVE_APPROVAL'),
    payroll_approval_workflow=WorkflowTemplate.objects.get(run_sequence='HR_MONTHLY_PAYROLL_PROCESSING')
)
        ''')
