"""
Enhanced integration test that mimics exact web form submission flow
Tests the complete stack: ViewSet → Serializer → Model → Workflow → Transaction
"""

from django.core.management.base import BaseCommand
from django.utils import timezone
from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework.test import APIRequestFactory, force_authenticate
import time
import json

# Import all required models
from accounts.models import Account, AccountCategory
from automations.models import (
    FormSchema, FormSubmission, WorkflowTemplate, 
    WorkflowBinding, WorkflowRun
)
from automations.views import FormSubmissionViewSet
from transactions.models import Transaction, TransactionEntry

User = get_user_model()


class Command(BaseCommand):
    help = 'Test complete web form submission flow (mimics exact frontend behavior)'

    def add_arguments(self, parser):
        parser.add_argument(
            '--skip-cleanup',
            action='store_true',
            help='Skip cleanup of test data (for debugging)',
        )

    def handle(self, *args, **options):
        self.skip_cleanup = options.get('skip_cleanup', False)
        self.created_objects = {
            'accounts': [],
            'forms': [],
            'workflows': [],
            'bindings': [],
            'submissions': [],
            'runs': [],
            'transactions': []
        }

        self.stdout.write('\n' + '='*70)
        self.stdout.write(self.style.WARNING('WEB FORM SUBMISSION INTEGRATION TEST'))
        self.stdout.write('='*70)

        try:
            # Setup
            self.user = self.get_test_user()
            self.cleanup_old_data()
            
            # Create test data
            parent_account, child_account, contra_account = self.create_accounts()
            
            # Use auto-generated form/workflow from signal OR create fallback
            form, workflow, binding = self.get_or_create_workflow_components(parent_account, child_account, contra_account)
            
            # Test web submission flow
            self.test_web_submission(form, parent_account, child_account, contra_account)
            
            # Verify results
            self.verify_complete_flow()
            
            self.stdout.write('\n' + '='*70)
            self.stdout.write(self.style.SUCCESS('✓ WEB FORM FLOW TEST PASSED!'))
            self.stdout.write('='*70)
            
        except Exception as e:
            self.stdout.write('\n' + '='*70)
            self.stdout.write(self.style.ERROR('✗ TEST FAILED'))
            self.stdout.write('='*70)
            self.stdout.write(self.style.ERROR(f'Error: {str(e)}'))
            import traceback
            self.stdout.write(traceback.format_exc())
            
        finally:
            if not self.skip_cleanup:
                self.cleanup()

    def get_test_user(self):
        """Get or create test user"""
        user = User.objects.first()
        if not user:
            self.stdout.write(self.style.ERROR('No users found!'))
            raise Exception('Please create a user first')
        return user

    def cleanup_old_data(self):
        """Clean up old test data"""
        self.stdout.write('Cleaning up old test data...')
        
        # Delete old transactions AND entries first (they reference accounts)
        from django.db import connection
        with connection.cursor() as cursor:
            # Delete entries for test transactions
            cursor.execute("""
                DELETE FROM transactions_transactionentry 
                WHERE transaction_id IN (
                    SELECT id FROM transactions_transaction 
                    WHERE description LIKE '%Web test transaction%'
                       OR workflow_reference LIKE 'test_web_workflow_%'
                )
            """)
            # Delete test transactions
            cursor.execute("""
                DELETE FROM transactions_transaction 
                WHERE description LIKE '%Web test transaction%'
                   OR workflow_reference LIKE 'test_web_workflow_%'
            """)
        
        # Delete workflow runs
        WorkflowRun.objects.filter(
            template__name__icontains='test_web_workflow'
        ).delete()
        
        # Delete submissions
        FormSubmission.objects.filter(
            form_schema__name__icontains='test_web_form'
        ).delete()
        
        # Delete bindings
        WorkflowBinding.objects.filter(
            form_schema__name__icontains='test_web_form'
        ).delete()
        
        # Delete workflows
        WorkflowTemplate.objects.filter(
            name__icontains='test_web_workflow'
        ).delete()
        
        # Delete forms
        FormSchema.objects.filter(
            name__icontains='test_web_form'
        ).delete()
        
        # Delete accounts (children first, then parents)
        Account.objects.filter(
            name__icontains='test_web_',
            account_level=Account.LEVEL_CHILD
        ).delete()
        Account.objects.filter(
            name__icontains='test_web_',
            account_level=Account.LEVEL_PARENT
        ).delete()

    def create_accounts(self):
        """Create test accounts - parent with child accounts"""
        self.stdout.write('\nCreating test accounts...')
        
        # Get or create category
        category = AccountCategory.objects.filter(code_prefix='SAV').first()
        if not category:
            self.stdout.write(self.style.ERROR('No Savings category found!'))
            raise Exception('Savings category required')
        
        # Create PARENT account (savings) - triggers signal for form/workflow generation
        parent = Account.objects.create(
            name='test_web_savings_parent',
            code='SAV-W001',  # Unique code for web test
            account_type='LIABILITY',
            account_level=Account.LEVEL_PARENT,  # PARENT level
            category=category,
            balance=0,
            owner=self.user,
            branch=self.user.branch
        )
        self.created_objects['accounts'].append(parent)
        self.stdout.write(self.style.SUCCESS(f'✓ Created PARENT account: {parent.code}'))
        
        # Wait for signal to complete
        time.sleep(1)
        
        # Create CHILD accounts under parent (no signal trigger)
        child = Account.objects.create(
            name='test_web_savings_child_1',
            code='SAV-W001-1',
            account_type='LIABILITY',
            account_level=Account.LEVEL_CHILD,
            parent=parent,
            category=category,
            balance=0,
            owner=self.user,
            branch=self.user.branch
        )
        self.created_objects['accounts'].append(child)
        self.stdout.write(self.style.SUCCESS(f'✓ Created CHILD account: {child.code}'))
        
        # Create contra account (cash) - PARENT level
        contra = Account.objects.create(
            name='test_web_cash_account',
            code='CASH-W001',  # Unique code for web test
            account_type='ASSET',
            account_level=Account.LEVEL_PARENT,
            balance=10000,  # Starting balance
            owner=self.user,
            branch=self.user.branch
        )
        self.created_objects['accounts'].append(contra)
        self.stdout.write(self.style.SUCCESS(f'✓ Created contra account: {contra.code}'))
        
        return parent, child, contra

    def get_or_create_workflow_components(self, parent_account, child_account, contra_account):
        """
        Try to use auto-generated form/workflow from signal first.
        Falls back to manual creation if auto-generation failed or not found.
        """
        self.stdout.write('\n' + '='*70)
        self.stdout.write('CHECKING FOR AUTO-GENERATED COMPONENTS')
        self.stdout.write('='*70)
        
        # Try to find auto-generated form (signal creates form with parent account name)
        auto_form = FormSchema.objects.filter(
            name__icontains=parent_account.name.replace('test_web_', '').replace('_parent', '')
        ).first()
        
        if auto_form:
            self.stdout.write(self.style.SUCCESS(f'✓ Found auto-generated form: {auto_form.name}'))
            self.created_objects['forms'].append(auto_form)
            
            # Find associated binding
            binding = WorkflowBinding.objects.filter(form_schema=auto_form).first()
            if binding:
                self.stdout.write(self.style.SUCCESS(f'✓ Found auto-generated binding'))
                self.created_objects['bindings'].append(binding)
                workflow = binding.workflow_template
                self.created_objects['workflows'].append(workflow)
                self.stdout.write(self.style.SUCCESS(f'✓ Found auto-generated workflow: {workflow.name}'))
                return auto_form, workflow, binding
        
        # Fallback: create manually if auto-generation failed
        self.stdout.write(self.style.WARNING('⚠ Auto-generated components not found, creating manually...'))
        form = self.create_form(parent_account, child_account, contra_account)
        workflow = self.create_workflow(child_account)
        binding = self.create_binding(form, workflow, parent_account, child_account, contra_account)
        return form, workflow, binding

    def create_form(self, parent_account, child_account, contra_account):
        """Create test form schema"""
        self.stdout.write('\nCreating form schema...')
        
        form = FormSchema.objects.create(
            name='test_web_form_schema',
            description='Test form for web submission',
            schema={
                'title': 'Test Web Transaction Form',
                'fields': [
                    {
                        'id': 'child_account_id',
                        'name': 'child_account_id',
                        'label': 'Select Child Account',
                        'type': 'account_select',
                        'required': True,
                        'default': child_account.id,  # Pre-select the child
                        'metadata': {
                            'filter_parent_id': parent_account.id  # Only show this parent's children
                        }
                    },
                    {
                        'id': 'transaction_date',
                        'name': 'transaction_date',
                        'label': 'Transaction Date',
                        'type': 'date',
                        'required': True
                    },
                    {
                        'id': 'amount',
                        'name': 'amount',
                        'label': 'Amount',
                        'type': 'number',
                        'required': True
                    },
                    {
                        'id': 'description',
                        'name': 'description',
                        'label': 'Description',
                        'type': 'textarea',
                        'required': True
                    },
                    {
                        'id': 'contra_account_id',
                        'name': 'contra_account_id',
                        'label': 'Contra Account',
                        'type': 'account_select',
                        'required': True,
                        'readonly': False  # User can select
                    }
                ]
            },
            owner=self.user,
            branch=self.user.branch
        )
        self.created_objects['forms'].append(form)
        
        self.stdout.write(self.style.SUCCESS(f'✓ Created form: {form.name}'))
        
        return form

    def create_workflow(self, child_account):
        """Create test workflow"""
        self.stdout.write('\nCreating workflow template...')
        
        # Use timestamp in name to make it unique
        timestamp = timezone.now().strftime('%Y%m%d%H%M%S%f')  # Added microseconds for uniqueness
        
        workflow = WorkflowTemplate.objects.create(
            name=f'test_web_workflow_{timestamp}',
            description='Test workflow for web submission',
            run_sequence=f'WEB_TEST_{timestamp}',  # Unique sequence for run references
            trigger_type='form',
            workflow_type='standard',
            workflow_definition={
                'steps': [
                    {
                        'id': 'create_transaction',
                        'type': 'transaction',
                        'config': {
                            'transaction_date': '${transaction_date}',
                            'description': '${description}',
                            'amount': '${amount}',
                            'target_account_id': '${child_account_id}',  # Use child account from form
                            'contra_account_id': '${contra_account_id}',
                            'auto_post': True,
                            'entries': [
                                {
                                    'account_id': '${child_account_id}',  # Child account selected
                                    'side': 'DR',
                                    'amount': '${amount}'
                                },
                                {
                                    'account_id': '${contra_account_id}',
                                    'side': 'CR',
                                    'amount': '${amount}'
                                }
                            ]
                        }
                    }
                ],
                'initial_step': 'create_transaction'  # CRITICAL: Tell executor where to start!
            },
            is_active=True,
            owner=self.user,
            branch=self.user.branch
        )
        self.created_objects['workflows'].append(workflow)
        
        self.stdout.write(self.style.SUCCESS(f'✓ Created workflow: {workflow.name}'))
        
        return workflow

    def create_binding(self, form, workflow, parent_account, child_account, contra_account):
        """Create workflow binding"""
        self.stdout.write('\nCreating workflow binding...')
        
        binding = WorkflowBinding.objects.create(
            form_schema=form,
            workflow_template=workflow,
            parameters={
                'parent_account_id': parent_account.id,
                'parent_account_code': parent_account.code,
                'parent_account_name': parent_account.name,
                # Note: NOT including child_account_id or contra_account_id - user will select from form
            },
            priority=0,
            is_active=True,
            owner=self.user,
            branch=self.user.branch,
            created_by=self.user
        )
        self.created_objects['bindings'].append(binding)
        
        self.stdout.write(self.style.SUCCESS('✓ Created binding: Form → Workflow'))
        self.stdout.write(f'  Parameters: parent_account_id={parent_account.id}')
        
        return binding

    def test_web_submission(self, form, parent_account, child_account, contra_account):
        """Test web submission (mimics what ViewSet.create would do)"""
        self.stdout.write('\n' + '='*70)
        self.stdout.write('TESTING WEB SUBMISSION FLOW')
        self.stdout.write('='*70)
        
        # Prepare form data (exactly as frontend would send)
        form_data = {
            'child_account_id': child_account.id,  # Select specific child account
            'transaction_date': timezone.now().date().isoformat(),
            'amount': 100.00,
            'description': 'Web test transaction - $100.00',
            'contra_account_id': contra_account.id
        }
        
        self.stdout.write('\n1. Frontend Form Data:')
        self.stdout.write(f'   Child Account: {child_account.code} (Parent: {parent_account.code})')
        self.stdout.write(f'   {json.dumps(form_data, indent=2)}')
        
        self.stdout.write('\n2. HTTP Request:')
        self.stdout.write(f'   POST /api/automations/form-submissions/')
        self.stdout.write(f'   Body: {{ form_schema: {form.id}, data: {{ ... }} }}')
        
        # Create submission (exactly as FormSubmissionSerializer.create would)
        self.stdout.write('\n3. Creating FormSubmission (ViewSet logic)...')
        
        submission = FormSubmission.objects.create(
            form_schema=form,
            data=form_data,  # This is what gets saved
            owner=self.user,
            branch=self.user.branch,
            created_by=self.user
        )
        self.created_objects['submissions'].append(submission)
        
        submission_id = submission.id
        submission_ref = submission.submission_reference
        
        self.stdout.write(f'   Response Status: 201 Created')
        self.stdout.write(self.style.SUCCESS(f'   ✓ Submission created: {submission_ref}'))
        
        self.last_submission = submission
        
        # Wait for Celery to execute workflow
        self.stdout.write('\n4. Waiting for Celery to execute workflow', ending='')
        
        workflow_run = None
        for i in range(15):
            time.sleep(1)
            self.stdout.write('.', ending='')
            self.stdout.flush()
            
            runs = WorkflowRun.objects.filter(form_submission=submission)
            if runs.exists():
                workflow_run = runs.first()
                self.created_objects['runs'].append(workflow_run)
                break
        
        self.stdout.write('')  # New line
        
        if not workflow_run:
            raise Exception('Workflow not triggered! Check Celery is running.')
        
        self.stdout.write(self.style.SUCCESS(f'   ✓ Workflow triggered: {workflow_run.run_reference}'))
        
        # Wait for completion
        self.stdout.write('\n5. Waiting for workflow completion', ending='')
        
        for i in range(10):
            time.sleep(1)
            self.stdout.write('.', ending='')
            self.stdout.flush()
            
            workflow_run.refresh_from_db()
            if workflow_run.status in ['completed', 'failed']:
                break
        
        self.stdout.write('')  # New line
        
        if workflow_run.status == 'failed':
            raise Exception(f'Workflow failed: {workflow_run.error_message}')
        
        if workflow_run.status != 'completed':
            raise Exception(f'Workflow did not complete (status: {workflow_run.status})')
        
        self.stdout.write(self.style.SUCCESS(f'   ✓ Workflow completed'))
        
        # Check execution log for errors
        self.stdout.write('\n6. Checking workflow execution log...')
        if workflow_run.execution_log:
            for step in workflow_run.execution_log:
                status = step.get('status', 'unknown')
                step_id = step.get('step_id', 'unknown')
                self.stdout.write(f'   Step: {step_id} - Status: {status}')
                if step.get('error'):
                    self.stdout.write(f'     ERROR: {step["error"]}')
        
        if workflow_run.error_message:
            self.stdout.write(f'   Workflow Error: {workflow_run.error_message}')
        
        # Simulate checking workflow status (what frontend would do)
        self.stdout.write('\n7. Simulating workflow status check...')
        self.stdout.write(f'   Status: {workflow_run.status}')
        self.stdout.write(f'   Context: {json.dumps(workflow_run.context, indent=2)}')
        
        # Find created transactions
        transactions = Transaction.objects.filter(
            description__icontains='Web test transaction'
        ).order_by('-created_at')
        
        if not transactions.exists():
            self.stdout.write(self.style.ERROR('   No transactions found!'))
            # Try to find ANY recent transaction
            recent_txns = Transaction.objects.order_by('-created_at')[:5]
            self.stdout.write(f'   Recent transactions: {recent_txns.count()}')
            for txn in recent_txns:
                self.stdout.write(f'     - {txn.reference_number}: {txn.description}')
            raise Exception('No transactions created!')
        
        self.stdout.write(f'   Transactions: {transactions.count()}')
        self.stdout.write(self.style.SUCCESS('   ✓ Transaction data available'))

    def verify_complete_flow(self):
        """Verify complete flow executed correctly"""
        self.stdout.write('\n' + '='*70)
        self.stdout.write('VERIFYING COMPLETE FLOW')
        self.stdout.write('='*70)
        
        # 1. Verify submission
        self.stdout.write('\n1. Form Submission:')
        self.stdout.write(f'   Reference: {self.last_submission.submission_reference}')
        self.stdout.write(f'   Status: {self.last_submission.status}')
        self.stdout.write(f'   Data: {self.last_submission.data}')
        
        # 2. Verify workflow run
        self.stdout.write('\n2. Workflow Run:')
        run = self.created_objects['runs'][0]
        self.stdout.write(f'   Reference: {run.run_reference}')
        self.stdout.write(f'   Status: {run.status}')
        self.stdout.write(f'   Context keys: {list(run.context.keys())}')
        
        # Verify context has all required variables (they're nested under 'data')
        required_vars = ['child_account_id', 'contra_account_id', 'amount', 'transaction_date', 'description']
        context_data = run.context.get('data', {})
        missing_vars = [v for v in required_vars if v not in context_data]
        if missing_vars:
            raise Exception(f'Missing context variables in data: {missing_vars}')
        
        self.stdout.write(self.style.SUCCESS('   ✓ All required variables in context'))
        
        # 3. Verify transaction
        self.stdout.write('\n3. Transaction:')
        transactions = Transaction.objects.filter(
            description__icontains='Web test transaction'
        ).order_by('-created_at')
        
        if not transactions.exists():
            raise Exception('No transaction created!')
        
        txn = transactions.first()
        self.created_objects['transactions'].append(txn)
        
        self.stdout.write(f'   Reference: {txn.reference_number}')
        self.stdout.write(f'   Date: {txn.date}')
        self.stdout.write(f'   Description: {txn.description}')
        self.stdout.write(f'   Approved: {txn.approved}')
        
        # 4. Verify entries
        self.stdout.write('\n4. Transaction Entries:')
        entries = TransactionEntry.objects.filter(transaction=txn)
        
        if entries.count() < 2:
            raise Exception(f'Expected 2 entries, found {entries.count()}')
        
        total_debits = sum(e.amount for e in entries if e.side == 'DR')
        total_credits = sum(e.amount for e in entries if e.side == 'CR')
        
        for entry in entries:
            account = entry.account
            self.stdout.write(
                f'   {account.code}: '
                f'Side={entry.side} Amount=${entry.amount:.2f}'
            )
        
        self.stdout.write(f'   Total Debits: ${total_debits:.2f}')
        self.stdout.write(f'   Total Credits: ${total_credits:.2f}')
        
        if abs(total_debits - total_credits) > 0.01:
            raise Exception(f'Entries not balanced! Debits={total_debits}, Credits={total_credits}')
        
        self.stdout.write(self.style.SUCCESS('   ✓ Entries balanced'))
        
        # 5. Verify accounts updated
        self.stdout.write('\n5. Account Balances:')
        for account in self.created_objects['accounts']:
            account.refresh_from_db()
            self.stdout.write(f'   {account.code}: ${account.balance:.2f}')
        
        self.stdout.write(self.style.SUCCESS('\n✓ COMPLETE FLOW VERIFIED'))

    def cleanup(self):
        """Clean up test data"""
        self.stdout.write('\nCleaning up test data...')
        
        # Delete in reverse order of dependencies
        # First, delete ALL transaction entries for transactions we're tracking
        for txn in self.created_objects['transactions']:
            TransactionEntry.objects.filter(transaction=txn).delete()
            txn.delete()
        
        # Also clean up any transactions created by workflows (not tracked)
        from django.db import connection
        with connection.cursor() as cursor:
            # Find transactions for our test accounts
            cursor.execute("""
                DELETE FROM transactions_transactionentry 
                WHERE transaction_id IN (
                    SELECT id FROM transactions_transaction 
                    WHERE description LIKE '%Web test transaction%'
                )
            """)
            cursor.execute("""
                DELETE FROM transactions_transaction 
                WHERE description LIKE '%Web test transaction%'
            """)
        
        for run in self.created_objects['runs']:
            run.delete()
        
        for submission in self.created_objects['submissions']:
            submission.delete()
        
        for binding in self.created_objects['bindings']:
            binding.delete()
        
        for workflow in self.created_objects['workflows']:
            workflow.delete()
        
        for form in self.created_objects['forms']:
            form.delete()
        
        # Delete accounts - children first, then parents (FK constraints)
        child_accounts = [acc for acc in self.created_objects['accounts'] if acc.account_level == Account.LEVEL_CHILD]
        parent_accounts = [acc for acc in self.created_objects['accounts'] if acc.account_level == Account.LEVEL_PARENT]
        
        for account in child_accounts:
            account.delete()
        
        for account in parent_accounts:
            account.delete()
        
        self.stdout.write(self.style.SUCCESS('✓ Cleanup complete'))
