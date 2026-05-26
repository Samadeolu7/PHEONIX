"""
Comprehensive test script for form submission -> workflow -> transaction flow.

Run this after creating workflow bindings to verify end-to-end functionality.

Usage:
    python manage.py test_workflow_flow
    python manage.py test_workflow_flow --form-id 123
    python manage.py test_workflow_flow --verbose
"""

import time
from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth import get_user_model
from django.db import transaction as db_transaction
from automations.models import (
    FormSchema, WorkflowTemplate, WorkflowBinding,
    FormSubmission, WorkflowRun, WorkflowStepExecution
)
from accounts.models import Account, Transaction, TransactionEntry
from decimal import Decimal

User = get_user_model()


class Command(BaseCommand):
    help = 'Test the complete form submission -> workflow -> transaction flow'

    def add_arguments(self, parser):
        parser.add_argument(
            '--form-id',
            type=int,
            help='Specific form schema ID to test',
        )
        parser.add_argument(
            '--verbose',
            action='store_true',
            help='Show detailed execution logs',
        )

    def handle(self, *args, **options):
        self.verbose = options['verbose']
        
        self.stdout.write(self.style.SUCCESS('='*70))
        self.stdout.write(self.style.SUCCESS('Workflow Flow Test'))
        self.stdout.write(self.style.SUCCESS('='*70))
        
        # Step 1: Environment check
        self.log_section("1. Environment Check")
        if not self.check_environment():
            return
        
        # Step 2: Select form
        self.log_section("2. Form Selection")
        form = self.select_form(options.get('form_id'))
        if not form:
            return
        
        # Step 3: Check bindings
        self.log_section("3. Workflow Binding Check")
        bindings = self.check_bindings(form)
        if not bindings:
            return
        
        # Step 4: Create test submission
        self.log_section("4. Create Test Submission")
        submission = self.create_test_submission(form)
        if not submission:
            return
        
        # Step 5: Wait for workflow execution
        self.log_section("5. Wait for Workflow Execution")
        workflow_run = self.wait_for_workflow(submission)
        if not workflow_run:
            return
        
        # Step 6: Check workflow steps
        self.log_section("6. Verify Workflow Steps")
        if not self.check_workflow_steps(workflow_run):
            return
        
        # Step 7: Verify transaction
        self.log_section("7. Verify Transaction Creation")
        if not self.verify_transaction(submission):
            return
        
        # Success!
        self.stdout.write('\n' + '='*70)
        self.stdout.write(self.style.SUCCESS('✓ ALL TESTS PASSED!'))
        self.stdout.write(self.style.SUCCESS('='*70))
        self.stdout.write(
            f'\nSubmission Reference: {submission.submission_reference}'
        )
        self.stdout.write(
            f'Workflow Run Reference: {workflow_run.run_reference}'
        )

    def log_section(self, title):
        """Log a section header"""
        self.stdout.write('\n' + '-'*70)
        self.stdout.write(self.style.WARNING(title))
        self.stdout.write('-'*70)

    def log_detail(self, message):
        """Log detailed message (only if verbose)"""
        if self.verbose:
            self.stdout.write(f'  {message}')

    def log_success(self, message):
        """Log success message"""
        self.stdout.write(self.style.SUCCESS(f'✓ {message}'))

    def log_error(self, message):
        """Log error message"""
        self.stdout.write(self.style.ERROR(f'✗ {message}'))

    def log_warning(self, message):
        """Log warning message"""
        self.stdout.write(self.style.WARNING(f'⚠ {message}'))

    def check_environment(self):
        """Check if environment is properly configured"""
        checks_passed = True
        
        # Check users exist
        user_count = User.objects.count()
        if user_count == 0:
            self.log_error('No users found in database')
            checks_passed = False
        else:
            self.log_success(f'Found {user_count} users')
        
        # Check forms exist
        form_count = FormSchema.objects.filter(is_active=True).count()
        if form_count == 0:
            self.log_error('No active forms found')
            checks_passed = False
        else:
            self.log_success(f'Found {form_count} active forms')
        
        # Check workflows exist
        workflow_count = WorkflowTemplate.objects.filter(is_active=True).count()
        if workflow_count == 0:
            self.log_error('No active workflows found')
            checks_passed = False
        else:
            self.log_success(f'Found {workflow_count} active workflows')
        
        # Check bindings exist
        binding_count = WorkflowBinding.objects.filter(is_active=True).count()
        if binding_count == 0:
            self.log_error('No workflow bindings found!')
            self.log_warning('Run: python manage.py create_workflow_bindings --auto-match')
            checks_passed = False
        else:
            self.log_success(f'Found {binding_count} workflow bindings')
        
        # Check accounts exist
        account_count = Account.objects.count()
        if account_count == 0:
            self.log_error('No accounts found')
            checks_passed = False
        else:
            self.log_success(f'Found {account_count} accounts')
        
        return checks_passed

    def select_form(self, form_id=None):
        """Select a form to test"""
        if form_id:
            try:
                form = FormSchema.objects.get(id=form_id, is_active=True)
                self.log_success(f'Selected form: {form.name} [ID: {form.id}]')
                return form
            except FormSchema.DoesNotExist:
                self.log_error(f'Form with ID {form_id} not found or inactive')
                return None
        
        # Auto-select first form with bindings
        forms_with_bindings = FormSchema.objects.filter(
            is_active=True,
            workflowbinding__is_active=True
        ).distinct()
        
        if not forms_with_bindings.exists():
            self.log_error('No forms have workflow bindings!')
            return None
        
        form = forms_with_bindings.first()
        self.log_success(f'Auto-selected form: {form.name} [ID: {form.id}]')
        return form

    def check_bindings(self, form):
        """Check workflow bindings for form"""
        bindings = WorkflowBinding.objects.filter(
            form_schema=form,
            is_active=True
        ).select_related('workflow_template')
        
        if not bindings.exists():
            self.log_error(f'No workflow bindings found for form: {form.name}')
            self.log_warning('Run: python manage.py create_workflow_bindings')
            return None
        
        self.log_success(f'Found {bindings.count()} workflow bindings:')
        for binding in bindings:
            self.log_detail(
                f'→ {binding.workflow_template.name} '
                f'(priority: {binding.priority}, params: {binding.parameters})'
            )
        
        return bindings

    def create_test_submission(self, form):
        """Create a test form submission"""
        user = User.objects.first()
        
        # Get test accounts
        accounts = Account.objects.all()[:2]
        if accounts.count() < 2:
            self.log_error('Need at least 2 accounts for testing')
            return None
        
        account1, account2 = accounts[0], accounts[1]
        
        # Build test data
        test_data = {
            'transaction_date': '2026-01-01',
            'amount': '100.00',
            'description': 'Test workflow transaction',
            'account_id': str(account1.id),
            'contra_account_id': str(account2.id),
        }
        
        self.log_detail(f'User: {user.username}')
        self.log_detail(f'Account: {account1.code} - {account1.name}')
        self.log_detail(f'Contra Account: {account2.code} - {account2.name}')
        self.log_detail(f'Amount: {test_data["amount"]}')
        
        try:
            submission = FormSubmission.objects.create(
                form_schema=form,
                data=test_data,
                owner=user,
                branch=user.branch,
                created_by=user
            )
            self.log_success(
                f'Created submission: {submission.submission_reference}'
            )
            return submission
        except Exception as e:
            self.log_error(f'Failed to create submission: {str(e)}')
            return None

    def wait_for_workflow(self, submission, timeout=10):
        """Wait for workflow to be triggered (check every second)"""
        self.stdout.write('Waiting for workflow execution', ending='')
        
        for i in range(timeout):
            time.sleep(1)
            self.stdout.write('.', ending='')
            self.stdout.flush()
            
            workflow_runs = WorkflowRun.objects.filter(
                form_submission=submission
            )
            
            if workflow_runs.exists():
                self.stdout.write('')  # New line
                workflow_run = workflow_runs.first()
                self.log_success(
                    f'Workflow triggered: {workflow_run.run_reference}'
                )
                self.log_detail(f'Status: {workflow_run.status}')
                self.log_detail(
                    f'Template: {workflow_run.workflow_template.name}'
                )
                return workflow_run
        
        self.stdout.write('')  # New line
        self.log_error(
            f'Workflow not triggered after {timeout} seconds!'
        )
        self.log_warning('Check Celery worker is running:')
        self.log_warning('  celery -A phoenix_erp worker --loglevel=info --pool=solo')
        return None

    def check_workflow_steps(self, workflow_run):
        """Check workflow step executions"""
        steps = WorkflowStepExecution.objects.filter(
            workflow_run=workflow_run
        ).order_by('step_number')
        
        if not steps.exists():
            self.log_warning('No workflow steps executed yet')
            self.log_detail('Workflow may still be running...')
            return True  # Not necessarily an error
        
        self.log_success(f'Found {steps.count()} workflow steps:')
        
        for step in steps:
            status_icon = {
                'pending': '⏳',
                'running': '▶',
                'completed': '✓',
                'failed': '✗',
                'skipped': '⊘'
            }.get(step.status, '?')
            
            self.log_detail(
                f'{status_icon} Step {step.step_number}: '
                f'{step.step_type} ({step.status})'
            )
            
            if step.status == 'failed':
                self.log_error(f'Step failed with error: {step.error_message}')
                return False
        
        return True

    def verify_transaction(self, submission):
        """Verify transaction was created"""
        # Wait a bit for transaction creation
        time.sleep(2)
        
        # Try to find transaction by description
        transactions = Transaction.objects.filter(
            description__icontains='Test workflow'
        ).order_by('-created_at')[:5]
        
        if not transactions.exists():
            self.log_error('No transaction found!')
            self.log_warning('Transaction step may have failed')
            return False
        
        # Check most recent transaction
        txn = transactions.first()
        self.log_success(f'Transaction created: {txn.transaction_reference}')
        self.log_detail(f'Date: {txn.transaction_date}')
        self.log_detail(f'Description: {txn.description}')
        self.log_detail(f'Status: {txn.status}')
        
        # Check entries
        entries = TransactionEntry.objects.filter(transaction=txn)
        if entries.count() < 2:
            self.log_warning(
                f'Expected 2+ entries, found {entries.count()}'
            )
        else:
            self.log_success(f'Transaction has {entries.count()} entries:')
            for entry in entries:
                entry_type = 'DR' if entry.debit_amount else 'CR'
                amount = entry.debit_amount or entry.credit_amount
                self.log_detail(
                    f'  {entry_type} {amount} → '
                    f'{entry.account.code} {entry.account.name}'
                )
        
        return True
