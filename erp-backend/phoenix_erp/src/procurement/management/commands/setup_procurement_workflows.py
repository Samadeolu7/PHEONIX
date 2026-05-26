# procurement/management/commands/setup_procurement_workflows.py
"""
Management command to set up procurement workflow templates.
Uses the existing WorkflowTemplate system - no complex configuration needed!
"""
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model

from automations.models import WorkflowTemplate
from procurement.workflow_examples import (
    STANDARD_PR_WORKFLOW,
    PO_WITH_3WAY_MATCHING_WORKFLOW,
    INVOICE_MATCHING_WORKFLOW,
    EMERGENCY_PURCHASE_WORKFLOW
)

User = get_user_model()


class Command(BaseCommand):
    help = 'Set up procurement workflow templates'
    
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
            help='Owner user email'
        )
    
    def handle(self, *args, **options):
        branch_id = options['branch_id']
        owner_email = options['owner_email']
        
        try:
            from branches.models import Branch
            branch = Branch.objects.get(id=branch_id)
            owner = User.objects.get(email=owner_email)
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'Error: {e}'))
            return
        
        self.stdout.write(self.style.SUCCESS('=' * 70))
        self.stdout.write(self.style.SUCCESS('PROCUREMENT WORKFLOWS SETUP'))
        self.stdout.write(self.style.SUCCESS('=' * 70))
        self.stdout.write(f'\nBranch: {branch.name}')
        self.stdout.write(f'Owner: {owner.email}\n')
        
        workflows_to_create = [
            ('PR_STANDARD', STANDARD_PR_WORKFLOW),
            ('PO_3WAY_MATCH', PO_WITH_3WAY_MATCHING_WORKFLOW),
            ('INVOICE_MATCH', INVOICE_MATCHING_WORKFLOW),
            ('EMERGENCY_PURCHASE', EMERGENCY_PURCHASE_WORKFLOW),
        ]
        
        created_count = 0
        for code, definition in workflows_to_create:
            workflow, created = WorkflowTemplate.objects.get_or_create(
                run_sequence=code,
                owner=owner,
                branch=branch,
                defaults={
                    'name': definition['name'],
                    'description': definition['description'],
                    'trigger_type': definition['trigger_type'],
                    'trigger_config': definition.get('trigger_config', {}),
                    'workflow_definition': definition['workflow_definition'],
                    'workflow_type': 'template',
                    'access_level': 'internal',
                    'is_active': True,
                }
            )
            
            if created:
                created_count += 1
                self.stdout.write(
                    self.style.SUCCESS(f'✓ Created: {workflow.name} ({code})')
                )
            else:
                self.stdout.write(
                    f'  Exists: {workflow.name} ({code})'
                )
        
        self.stdout.write('\n' + '=' * 70)
        self.stdout.write(self.style.SUCCESS(f'SETUP COMPLETE!'))
        self.stdout.write('=' * 70)
        self.stdout.write(f'Created: {created_count} new workflows')
        self.stdout.write(f'Total: {len(workflows_to_create)} procurement workflows available')
        
        self.stdout.write('\n' + self.style.WARNING('NEXT STEPS:'))
        self.stdout.write('1. Create FormSchema for PRs, POs, GRNs, Invoices')
        self.stdout.write('2. Create WorkflowBindings to link forms to workflows')
        self.stdout.write('3. Configure ProcurementConfig for 3-way matching settings')
        self.stdout.write('4. Test workflows with sample data')
        
        self.stdout.write('\n' + self.style.WARNING('EXAMPLE: Link PR form to workflow'))
        self.stdout.write('from automations.models import FormSchema, WorkflowTemplate, WorkflowBinding')
        self.stdout.write(f'pr_form = FormSchema.objects.get(name="Purchase Requisition Form")')
        self.stdout.write(f'pr_workflow = WorkflowTemplate.objects.get(run_sequence="PR_STANDARD")')
        self.stdout.write('WorkflowBinding.objects.create(')
        self.stdout.write('    form_schema=pr_form,')
        self.stdout.write('    workflow_template=pr_workflow,')
        self.stdout.write('    priority=10,')
        self.stdout.write('    is_active=True')
        self.stdout.write(')')
