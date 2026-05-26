"""
Management command to create WorkflowBinding objects for forms and workflows.

Usage:
    python manage.py create_workflow_bindings
    python manage.py create_workflow_bindings --form-id 123 --workflow-id 456
    python manage.py create_workflow_bindings --auto-match
"""

from django.core.management.base import BaseCommand, CommandError
from automations.models import FormSchema, WorkflowTemplate, WorkflowBinding
from django.db import transaction


class Command(BaseCommand):
    help = 'Create workflow bindings to link forms to workflows'

    def add_arguments(self, parser):
        parser.add_argument(
            '--form-id',
            type=int,
            help='ID of specific form to bind',
        )
        parser.add_argument(
            '--workflow-id',
            type=int,
            help='ID of specific workflow to bind to form',
        )
        parser.add_argument(
            '--auto-match',
            action='store_true',
            help='Automatically match forms to workflows by name pattern',
        )
        parser.add_argument(
            '--list',
            action='store_true',
            help='List all existing bindings',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be created without creating',
        )

    def handle(self, *args, **options):
        if options['list']:
            self.list_bindings()
            return

        if options['form_id'] and options['workflow_id']:
            self.create_specific_binding(
                options['form_id'],
                options['workflow_id'],
                dry_run=options['dry_run']
            )
        elif options['auto_match']:
            self.auto_match_bindings(dry_run=options['dry_run'])
        else:
            self.interactive_binding_creation()

    def list_bindings(self):
        """List all existing workflow bindings"""
        bindings = WorkflowBinding.objects.select_related(
            'form_schema', 'workflow_template'
        ).all()

        if not bindings:
            self.stdout.write(self.style.WARNING('No workflow bindings found!'))
            self.stdout.write('Run with --auto-match to create bindings automatically.')
            return

        self.stdout.write(self.style.SUCCESS(f'Found {bindings.count()} workflow bindings:\n'))
        
        for binding in bindings:
            active = '✓' if binding.is_active else '✗'
            self.stdout.write(
                f'{active} [{binding.id}] {binding.form_schema.name} → {binding.workflow_template.name}'
            )
            if binding.parameters:
                self.stdout.write(f'    Parameters: {binding.parameters}')

    def create_specific_binding(self, form_id, workflow_id, dry_run=False):
        """Create a binding between specific form and workflow"""
        try:
            form = FormSchema.objects.get(id=form_id)
            workflow = WorkflowTemplate.objects.get(id=workflow_id)
        except FormSchema.DoesNotExist:
            raise CommandError(f'Form with ID {form_id} not found')
        except WorkflowTemplate.DoesNotExist:
            raise CommandError(f'Workflow with ID {workflow_id} not found')

        # Check if binding already exists
        existing = WorkflowBinding.objects.filter(
            form_schema=form,
            workflow_template=workflow
        ).first()

        if existing:
            self.stdout.write(
                self.style.WARNING(
                    f'Binding already exists: [{existing.id}] {form.name} → {workflow.name}'
                )
            )
            return

        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    f'[DRY RUN] Would create: {form.name} → {workflow.name}'
                )
            )
            return

        # Create the binding
        binding = WorkflowBinding.objects.create(
            form_schema=form,
            workflow_template=workflow,
            parameters={},
            priority=0,
            is_active=True,
            owner=form.owner,
            branch=form.branch,
            created_by=form.created_by
        )

        self.stdout.write(
            self.style.SUCCESS(
                f'✓ Created binding [{binding.id}]: {form.name} → {workflow.name}'
            )
        )

    def auto_match_bindings(self, dry_run=False):
        """Automatically create bindings by matching form/workflow names"""
        forms = FormSchema.objects.filter(is_active=True)
        created_count = 0
        skipped_count = 0

        self.stdout.write(f'Scanning {forms.count()} active forms...\n')

        for form in forms:
            # Try to find matching workflow by name pattern
            # Example: "100-299 Transaction" -> "Process 100-299 Transaction"
            
            # Strategy 1: Look for exact match
            workflow = WorkflowTemplate.objects.filter(
                name__iexact=form.name,
                is_active=True
            ).first()

            # Strategy 2: Look for "Process <form-name>"
            if not workflow:
                workflow = WorkflowTemplate.objects.filter(
                    name__icontains=form.name,
                    is_active=True
                ).first()

            # Strategy 3: Match by account range (e.g., "100-299")
            if not workflow and '-' in form.name:
                account_range = form.name.split()[0]  # Get "100-299"
                workflow = WorkflowTemplate.objects.filter(
                    name__icontains=account_range,
                    is_active=True
                ).first()

            if not workflow:
                self.stdout.write(
                    self.style.WARNING(
                        f'✗ No matching workflow found for: {form.name}'
                    )
                )
                skipped_count += 1
                continue

            # Check if binding already exists
            if WorkflowBinding.objects.filter(
                form_schema=form,
                workflow_template=workflow
            ).exists():
                self.stdout.write(
                    f'  Already bound: {form.name} → {workflow.name}'
                )
                skipped_count += 1
                continue

            if dry_run:
                self.stdout.write(
                    self.style.WARNING(
                        f'[DRY RUN] Would create: {form.name} → {workflow.name}'
                    )
                )
                created_count += 1
                continue

            # Create the binding
            try:
                binding = WorkflowBinding.objects.create(
                    form_schema=form,
                    workflow_template=workflow,
                    parameters={},
                    priority=0,
                    is_active=True,
                    owner=form.owner,
                    branch=form.branch,
                    created_by=form.created_by
                )
                self.stdout.write(
                    self.style.SUCCESS(
                        f'✓ Created [{binding.id}]: {form.name} → {workflow.name}'
                    )
                )
                created_count += 1
            except Exception as e:
                self.stdout.write(
                    self.style.ERROR(
                        f'✗ Error creating binding for {form.name}: {str(e)}'
                    )
                )

        # Summary
        self.stdout.write('\n' + '='*60)
        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    f'[DRY RUN] Would create {created_count} bindings, {skipped_count} skipped'
                )
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    f'Created {created_count} bindings, {skipped_count} skipped'
                )
            )

    def interactive_binding_creation(self):
        """Interactive prompt to create bindings"""
        self.stdout.write(self.style.SUCCESS('Interactive Workflow Binding Creation\n'))

        # List available forms
        forms = FormSchema.objects.filter(is_active=True)
        self.stdout.write('Available Forms:')
        for i, form in enumerate(forms, 1):
            self.stdout.write(f'  {i}. [{form.id}] {form.name}')

        form_choice = input('\nSelect form number (or ID): ').strip()
        try:
            if form_choice.isdigit() and int(form_choice) <= len(forms):
                form = list(forms)[int(form_choice) - 1]
            else:
                form = FormSchema.objects.get(id=int(form_choice))
        except (ValueError, FormSchema.DoesNotExist):
            raise CommandError('Invalid form selection')

        # List available workflows
        workflows = WorkflowTemplate.objects.filter(is_active=True)
        self.stdout.write('\nAvailable Workflows:')
        for i, workflow in enumerate(workflows, 1):
            self.stdout.write(f'  {i}. [{workflow.id}] {workflow.name}')

        workflow_choice = input('\nSelect workflow number (or ID): ').strip()
        try:
            if workflow_choice.isdigit() and int(workflow_choice) <= len(workflows):
                workflow = list(workflows)[int(workflow_choice) - 1]
            else:
                workflow = WorkflowTemplate.objects.get(id=int(workflow_choice))
        except (ValueError, WorkflowTemplate.DoesNotExist):
            raise CommandError('Invalid workflow selection')

        # Confirm and create
        self.stdout.write(
            f'\nCreate binding: {form.name} → {workflow.name}'
        )
        confirm = input('Proceed? (y/n): ').strip().lower()

        if confirm == 'y':
            self.create_specific_binding(form.id, workflow.id)
        else:
            self.stdout.write('Cancelled.')
