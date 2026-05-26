"""
Complete integration test: Parent Account Creation -> Auto-Generated Components -> Child Account Selection -> Transaction

This test covers the NEW parent-level form generation flow:
1. Create PARENT account (triggers signal to auto-generate form/workflow/report)
2. Create CHILD accounts under the parent
3. Verify auto-generated form includes child_account_id selector
4. Verify auto-generated workflow uses ${data.child_account_id}
5. Submit form (selecting a specific child account)
6. Wait for Celery to execute workflow
7. Verify transaction created on the SELECTED CHILD account
8. Verify account balances updated correctly

Usage:
    python manage.py test_account_transaction_flow
    python manage.py test_account_transaction_flow --verbose
    python manage.py test_account_transaction_flow --amount 500
"""

import time
from decimal import Decimal
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.db import transaction as db_transaction
from django.utils import timezone

from automations.models import (
    FormSchema, WorkflowTemplate, WorkflowBinding,
    FormSubmission, WorkflowRun, StepExecution as WorkflowStepExecution
)
from accounts.models import (
    Account, AccountCategory
)
from transactions.models import Transaction, TransactionEntry, TransactionSeries

User = get_user_model()


class Command(BaseCommand):
    help = 'Test complete account transaction flow with Celery'

    def add_arguments(self, parser):
        parser.add_argument(
            '--amount',
            type=float,
            default=100.00,
            help='Transaction amount to test',
        )
        parser.add_argument(
            '--verbose',
            action='store_true',
            help='Show detailed logs',
        )
        parser.add_argument(
            '--skip-cleanup',
            action='store_true',
            help='Skip cleanup of test data',
        )

    def handle(self, *args, **options):
        self.verbose = options['verbose']
        self.test_amount = Decimal(str(options['amount']))
        self.skip_cleanup = options['skip_cleanup']
        
        # Track created objects for cleanup
        self.created_objects = {
            'accounts': [],
            'forms': [],
            'workflows': [],
            'bindings': [],
            'submissions': [],
            'runs': [],
            'transactions': [],
        }
        
        self.stdout.write(self.style.SUCCESS('='*70))
        self.stdout.write(self.style.SUCCESS('PARENT-LEVEL FORM GENERATION TEST'))
        self.stdout.write(self.style.SUCCESS('='*70))
        self.stdout.write(f'\nTest Amount: ${self.test_amount}')
        self.stdout.write(f'Verbose: {self.verbose}')
        self.stdout.write('')
        
        # Clean up old test data first
        self.log_section("0. Cleanup Old Test Data")
        self.cleanup_old_test_data()
        
        try:
            # Step 1: Setup (user, branch, category)
            self.log_section("1. Setup Test Environment")
            self.setup_environment()
            
            # Step 2: Create PARENT account (triggers signal)
            self.log_section("2. Create PARENT Account (Triggers Auto-Generation)")
            parent_account = self.create_parent_account()
            
            # Step 3: Verify auto-generated components
            self.log_section("3. Verify Auto-Generated Form/Workflow/Report")
            form, workflow, binding = self.verify_auto_generated_components(parent_account)
            
            # Step 4: Create CHILD accounts under parent
            self.log_section("4. Create CHILD Accounts Under Parent")
            child_accounts = self.create_child_accounts(parent_account)
            
            # Step 5: Create contra account
            self.log_section("5. Create Contra Account (Cash)")
            contra_account = self.create_contra_account()
            
            # Step 6: Record initial balances
            self.log_section("6. Record Initial Account Balances")
            selected_child = child_accounts[0]  # Use first child for test
            initial_child_balance = self.get_account_balance(selected_child)
            initial_contra_balance = self.get_account_balance(contra_account)
            self.log_success(f'Child Account ({selected_child.code}): ${initial_child_balance}')
            self.log_success(f'Contra Account ({contra_account.code}): ${initial_contra_balance}')
            
            # Step 7: Submit form (selecting specific child account)
            self.log_section("7. Submit Form (Select Child Account)")
            submission = self.submit_form_with_child_selection(form, selected_child, contra_account)
            
            # Step 8: Wait for workflow execution
            self.log_section("8. Wait for Celery Workflow Execution")
            workflow_run = self.wait_for_workflow(submission)
            
            # Step 9: Verify workflow steps
            self.log_section("9. Verify Workflow Steps")
            self.verify_workflow_steps(workflow_run)
            
            # Step 10: Verify transaction
            self.log_section("10. Verify Transaction Created")
            transaction_obj = self.verify_transaction(submission)
            
            # Step 11: Verify transaction is on CHILD account (not parent)
            self.log_section("11. Verify Transaction on Selected Child Account")
            self.verify_transaction_on_child(transaction_obj, selected_child)
            
            # Step 12: Verify account balances
            self.log_section("12. Verify Account Balances Updated")
            self.verify_account_balances(
                selected_child, contra_account,
                initial_child_balance, initial_contra_balance,
                transaction_obj
            )
            
            # Success!
            self.stdout.write('\n' + '='*70)
            self.stdout.write(self.style.SUCCESS('✓ ALL TESTS PASSED!'))
            self.stdout.write(self.style.SUCCESS('='*70))
            self.stdout.write('\nTest Summary:')
            self.stdout.write(f'  Parent Account: {parent_account.code} - {parent_account.name}')
            self.stdout.write(f'  Child Accounts: {len(child_accounts)} created')
            self.stdout.write(f'  Selected Child: {selected_child.code} - {selected_child.name}')
            self.stdout.write(f'  Auto-Generated Form: {form.name}')
            self.stdout.write(f'  Auto-Generated Workflow: {workflow.name}')
            self.stdout.write(f'  Form Submission: {submission.submission_reference}')
            self.stdout.write(f'  Workflow Run: {workflow_run.run_reference}')
            self.stdout.write(f'  Transaction: {transaction_obj.reference_number}')
            self.stdout.write(f'  Amount: ${self.test_amount}')
            self.stdout.write(f'  ✓ Transaction created on CHILD account (not parent)')
            self.stdout.write('')
            
        except Exception as e:
            self.stdout.write('\n' + '='*70)
            self.stdout.write(self.style.ERROR('✗ TEST FAILED'))
            self.stdout.write(self.style.ERROR('='*70))
            self.stdout.write(self.style.ERROR(f'Error: {str(e)}'))
            import traceback
            self.stdout.write(traceback.format_exc())
            
        finally:
            # Cleanup
            if not self.skip_cleanup:
                self.log_section("Cleanup Test Data")
                self.cleanup()

    def log_section(self, title):
        """Log section header"""
        self.stdout.write('\n' + '-'*70)
        self.stdout.write(self.style.WARNING(title))
        self.stdout.write('-'*70)

    def log_success(self, message):
        """Log success message"""
        self.stdout.write(self.style.SUCCESS(f'✓ {message}'))

    def log_error(self, message):
        """Log error message"""
        self.stdout.write(self.style.ERROR(f'✗ {message}'))

    def log_detail(self, message):
        """Log detailed message (only if verbose)"""
        if self.verbose:
            self.stdout.write(f'  {message}')

    def cleanup_old_test_data(self):
        """Clean up old test data from previous runs"""
        # Delete old workflow runs with test names first (they reference templates)
        # Use all_objects to include soft-deleted items, or hard delete them
        from django.db import connection
        
        # Delete old transaction entries first (before transactions)
        with connection.cursor() as cursor:
            cursor.execute("""
                DELETE FROM transactions_transactionentry 
                WHERE transaction_id IN (
                    SELECT id FROM transactions_transaction 
                    WHERE workflow_reference LIKE 'test_transaction_wor_%'
                )
            """)
        self.log_detail('Deleted old transaction entries')
        
        # Delete old transactions with test workflow references
        with connection.cursor() as cursor:
            cursor.execute("DELETE FROM transactions_transaction WHERE workflow_reference LIKE 'test_transaction_wor_%'")
        self.log_detail('Deleted old transactions')
        
        with connection.cursor() as cursor:
            # Hard delete all workflow runs with test reference patterns
            cursor.execute("DELETE FROM automations_workflowrun WHERE run_reference LIKE 'test_transaction_wor_%'")
        self.log_detail('Deleted old workflow runs')
        
        # Delete old step executions (orphaned if any)
        with connection.cursor() as cursor:
            cursor.execute("DELETE FROM step_executions WHERE execution_id NOT IN (SELECT id FROM automations_workflowrun)")
        self.log_detail('Deleted orphaned step executions')
        
        # Delete old workflow bindings (broader pattern for auto-generated)
        WorkflowBinding.objects.filter(
            workflow_template__workflow_type='master_template'
        ).filter(
            form_schema__name__icontains='Test'
        ).delete()
        self.log_detail('Deleted old workflow bindings')
        
        # Delete old workflow templates (master templates)
        WorkflowTemplate.objects.filter(
            workflow_type='master_template',
            owner=self.user if hasattr(self, 'user') else None
        ).delete()
        self.log_detail('Deleted old workflow templates')
        
        # Delete old form submissions
        FormSubmission.objects.filter(form_schema__name__icontains='Test').delete()
        self.log_detail('Deleted old form submissions')
        
        # Delete old forms
        FormSchema.objects.filter(name__icontains='Test').delete()
        self.log_detail('Deleted old forms')
        
        # Delete old module pages
        with connection.cursor() as cursor:
            cursor.execute("DELETE FROM module_pages WHERE url_path LIKE '%/500%' OR url_path LIKE '%/101%'")
        self.log_detail('Deleted old module pages')
        
        # Delete CHILD accounts first (to avoid foreign key issues)
        Account.objects.filter(code__startswith='500-', is_deleted=False).delete()
        Account.objects.filter(code__startswith='101-', is_deleted=False).delete()
        self.log_detail('Deleted old child accounts')
        
        # Delete old test parent accounts
        Account.objects.filter(code__in=['500', '101']).update(is_deleted=True)
        self.log_detail('Soft-deleted old test accounts')
        
        self.log_success('Cleanup complete')

    def setup_environment(self):
        """Setup user, branch, and basic data"""
        # Get or create test user
        self.user = User.objects.first()
        if not self.user:
            raise Exception("No users found. Please create a user first.")
        
        self.log_success(f'Using user: {self.user.username}')
        self.log_detail(f'Branch: {self.user.branch.name if hasattr(self.user, "branch") and self.user.branch else "No branch"}')
        
        # Get or create account category
        self.category = AccountCategory.objects.first()
        if not self.category:
            # Create a test category
            self.category = AccountCategory.objects.create(
                name='Test Category',
                code_prefix='900',
                section=5,  # Expenses
                owner=self.user,
                branch=self.user.branch,
                created_by=self.user
            )
            self.log_success('Created test category')
        else:
            self.log_success(f'Using category: {self.category.name}')
        
        # Get or create transaction series
        self.series = TransactionSeries.objects.first()
        if not self.series:
            self.series = TransactionSeries.objects.create(
                code='TEST',
                description='Test Transaction Series'
            )
            self.log_success('Created transaction series')
        else:
            self.log_success(f'Using transaction series: {self.series.code}')

    def create_parent_account(self):
        """Create PARENT account - this triggers signal to auto-generate form/workflow/report"""
        timestamp = timezone.now().strftime('%Y%m%d%H%M%S')
        
        # Delete any existing test accounts with this code
        Account.objects.filter(code='500', is_deleted=False).update(is_deleted=True)
        
        # Create PARENT account (this triggers the signal!)
        parent_account = Account.objects.create(
            code='500',  # Valid expense account code (500-599)
            name=f'Test Expense Parent {timestamp}',
            account_type='EXPENSE',
            account_level=Account.LEVEL_PARENT,  # PARENT level - triggers signal
            category=self.category,
            balance=Decimal('0.00'),
            balance_bf=Decimal('0.00'),
            owner=self.user,
            branch=self.user.branch,
            created_by=self.user
        )
        self.created_objects['accounts'].append(parent_account)
        self.log_success(f'Created PARENT account: {parent_account.code}')
        self.log_detail(f'Account Type: {parent_account.account_type}, Level: {parent_account.account_level}')
        self.log_detail('Signal should have triggered to auto-generate form/workflow/report...')
        
        # Wait a moment for signal to complete
        time.sleep(2)
        
        return parent_account

    def create_child_accounts(self, parent):
        """Create CHILD accounts under the parent - these do NOT trigger signals"""
        child_accounts = []
        
        for i in range(1, 4):  # Create 3 child accounts
            child = Account.objects.create(
                code=f'500-{i}',
                name=f'{parent.name} - Child {i}',
                account_type=parent.account_type,
                account_level=Account.LEVEL_CHILD,  # CHILD level - NO signal
                parent=parent,
                category=self.category,
                balance=Decimal('0.00'),
                balance_bf=Decimal('0.00'),
                owner=self.user,
                branch=self.user.branch,
                created_by=self.user
            )
            self.created_objects['accounts'].append(child)
            child_accounts.append(child)
            self.log_success(f'Created CHILD account: {child.code}')
        
        self.log_detail(f'Total child accounts created: {len(child_accounts)}')
        return child_accounts

    def create_contra_account(self):
        """Create contra account (cash) for transactions"""
        timestamp = timezone.now().strftime('%Y%m%d%H%M%S')
        
        # Delete any existing test accounts with this code
        Account.objects.filter(code='101', is_deleted=False).update(is_deleted=True)
        
        contra_account = Account.objects.create(
            code='101',  # Valid asset account code (100-199)
            name=f'Test Cash Account {timestamp}',
            account_type='ASSET',
            account_level=Account.LEVEL_PARENT,
            category=self.category,
            balance=Decimal('10000.00'),  # Start with good balance
            balance_bf=Decimal('10000.00'),
            owner=self.user,
            branch=self.user.branch,
            created_by=self.user
        )
        self.created_objects['accounts'].append(contra_account)
        self.log_success(f'Created contra account: {contra_account.code}')
        
        return contra_account

    def verify_auto_generated_components(self, parent_account):
        """Verify that form, workflow, and binding were auto-generated by signal"""
        # Find auto-generated form for this parent account
        forms = FormSchema.objects.filter(
            name__icontains=parent_account.name,
            owner=self.user
        ).order_by('-created_at')
        
        if not forms.exists():
            raise Exception(f'No auto-generated form found for parent account {parent_account.code}!')
        
        form = forms.first()
        self.created_objects['forms'].append(form)
        self.log_success(f'Found auto-generated form: {form.name}')
        
        # Verify form has child_account_id field as first field
        fields = form.schema.get('fields', [])
        if not fields:
            raise Exception('Form has no fields!')
        
        first_field = fields[0]
        if first_field.get('id') != 'child_account_id':
            raise Exception(f'First field should be child_account_id, got: {first_field.get("id")}')
        
        self.log_success('✓ Form has child_account_id as first field')
        self.log_detail(f'Field type: {first_field.get("type")}')
        self.log_detail(f'Filter parent ID: {first_field.get("metadata", {}).get("filter_parent_id")}')
        
        # Find associated workflow binding
        bindings = WorkflowBinding.objects.filter(
            form_schema=form
        )
        
        if not bindings.exists():
            raise Exception('No workflow binding found for auto-generated form!')
        
        binding = bindings.first()
        self.created_objects['bindings'].append(binding)
        self.log_success(f'Found workflow binding')
        
        workflow = binding.workflow_template
        self.created_objects['workflows'].append(workflow)
        self.log_success(f'Found auto-generated workflow: {workflow.name}')
        self.log_detail(f'Workflow type: {workflow.workflow_type}')
        self.log_detail(f'Run sequence: {workflow.run_sequence}')
        
        # Verify workflow uses ${data.child_account_id}
        workflow_def = workflow.workflow_definition
        steps = workflow_def.get('steps', [])
        
        if not steps:
            raise Exception('Workflow has no steps!')
        
        # Find transaction step
        txn_step = None
        for step in steps:
            if step.get('type') == 'transaction':
                txn_step = step
                break
        
        if not txn_step:
            raise Exception('Workflow has no transaction step!')
        
        entries = txn_step.get('config', {}).get('entries', [])
        if not entries:
            raise Exception('Transaction step has no entries!')
        
        # Check if any entry uses ${data.child_account_id}
        uses_child_id = any(
            '${data.child_account_id}' in str(entry.get('account_id', ''))
            for entry in entries
        )
        
        if not uses_child_id:
            raise Exception('Workflow does not use ${data.child_account_id} variable!')
        
        self.log_success('✓ Workflow uses ${data.child_account_id} for transaction')
        
        return form, workflow, binding

    def submit_form_with_child_selection(self, form, selected_child, contra_account):
        """Submit form with child account selection"""
        submission = FormSubmission.objects.create(
            form_schema=form,
            data={
                'child_account_id': selected_child.id,  # NEW: Select specific child
                'contra_account_id': contra_account.id,  # NEW: Contra account for double-entry
                'transaction_date': timezone.now().date().isoformat(),
                'amount': float(self.test_amount),
                'description': f'Test transaction - ${self.test_amount} on child {selected_child.code}',
            },
            owner=self.user,
            branch=self.user.branch,
            created_by=self.user
        )
        self.created_objects['submissions'].append(submission)
        self.log_success(f'Submitted form: {submission.submission_reference}')
        self.log_detail(f'Selected child account: {selected_child.code} (ID: {selected_child.id})')
        self.log_detail(f'Contra account: {contra_account.code} (ID: {contra_account.id})')
        self.log_detail(f'Transaction amount: ${self.test_amount}')
        
        return submission

    def verify_transaction_on_child(self, transaction_obj, expected_child):
        """Verify transaction was created on the selected CHILD account (not parent)"""
        entries = TransactionEntry.objects.filter(transaction=transaction_obj)
        
        # Find entry for the expense account
        expense_entry = None
        for entry in entries:
            if entry.account.account_type == 'EXPENSE':
                expense_entry = entry
                break
        
        if not expense_entry:
            raise Exception('No expense entry found in transaction!')
        
        actual_account = expense_entry.account
        
        if actual_account.id != expected_child.id:
            raise Exception(
                f'Transaction on WRONG account! '
                f'Expected: {expected_child.code} (ID: {expected_child.id}), '
                f'Actual: {actual_account.code} (ID: {actual_account.id})'
            )
        
        if actual_account.account_level != Account.LEVEL_CHILD:
            raise Exception(
                f'Transaction should be on CHILD account, but account level is: {actual_account.account_level}'
            )
        
        self.log_success(f'✓ Transaction created on CHILD account: {actual_account.code}')
        self.log_detail(f'Account level: {actual_account.account_level}')
        self.log_detail(f'Parent account: {actual_account.parent.code if actual_account.parent else "None"}')
        
        return True

    def get_account_balance(self, account):
        """Get current account balance"""
        account.refresh_from_db()
        return account.balance

    def submit_form(self, form, target_account, contra_account):
        """DEPRECATED: Use submit_form_with_child_selection instead"""
        raise Exception('This method is deprecated. Use submit_form_with_child_selection.')


    def wait_for_workflow(self, submission, timeout=15):
        """Wait for workflow to be triggered and start executing"""
        self.stdout.write('Waiting for Celery to execute workflow', ending='')
        
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
                self.created_objects['runs'].append(workflow_run)
                self.log_success(f'Workflow triggered: {workflow_run.run_reference}')
                self.log_detail(f'Status: {workflow_run.status}')
                
                # Wait a bit more for it to complete
                for j in range(10):
                    time.sleep(1)
                    workflow_run.refresh_from_db()
                    if workflow_run.status in ['completed', 'failed']:
                        break
                
                return workflow_run
        
        self.stdout.write('')  # New line
        raise Exception(f'Workflow not triggered after {timeout} seconds! Check Celery worker is running.')

    def verify_workflow_steps(self, workflow_run):
        """Verify workflow steps executed correctly"""
        # Check execution log instead of StepExecution records
        if not workflow_run.execution_log:
            raise Exception('No workflow steps in execution log!')
        
        steps = workflow_run.execution_log
        self.log_success(f'Found {len(steps)} workflow steps in execution log')
        
        for i, step in enumerate(steps, 1):
            status = step.get('status', 'unknown')
            step_id = step.get('step_id', 'unknown')
            
            status_icon = {
                'pending': '⏳',
                'running': '▶',
                'completed': '✓',
                'success': '✓',
                'failed': '✗',
                'error': '✗',
                'skipped': '⊘'
            }.get(status, '?')
            
            self.log_detail(f'{status_icon} Step {i}: {step_id} - {status}')
            
            if status in ['failed', 'error']:
                error = step.get('error', 'Unknown error')
                self.log_error(f'Error: {error}')
                raise Exception(f'Workflow step {step_id} failed: {error}')
        
        # Verify at least one step completed
        completed_steps = [s for s in steps if s.get('status') in ['completed', 'success']]
        if not completed_steps:
            raise Exception('No steps completed successfully!')

    def verify_transaction(self, submission):
        """Verify transaction was created"""
        # Wait a moment for transaction to be created
        time.sleep(2)
        
        # Try to find transaction by description
        transactions = Transaction.objects.filter(
            description__icontains='Test transaction'
        ).order_by('-created_at')[:5]
        
        if not transactions.exists():
            raise Exception('No transaction found!')
        
        transaction_obj = transactions.first()
        self.created_objects['transactions'].append(transaction_obj)
        
        self.log_success(f'Transaction: {transaction_obj.reference_number}')
        self.log_detail(f'Date: {transaction_obj.date}')
        self.log_detail(f'Description: {transaction_obj.description}')
        self.log_detail(f'Approved (Posted): {transaction_obj.approved}')
        
        # Check entries
        entries = TransactionEntry.objects.filter(transaction=transaction_obj)
        
        if entries.count() < 2:
            raise Exception(f'Expected 2+ entries, found {entries.count()}')
        
        self.log_success(f'Transaction has {entries.count()} entries:')
        
        total_debit = Decimal('0.00')
        total_credit = Decimal('0.00')
        
        for entry in entries:
            entry_side = entry.side
            amount = entry.amount
            self.log_detail(
                f'  {entry_side} ${amount} → {entry.account.code} ({entry.account.name})'
            )
            
            if entry_side == 'DR':
                total_debit += amount
            else:
                total_credit += amount
        
        # Verify balanced
        if total_debit != total_credit:
            raise Exception(f'Transaction not balanced! Debit: ${total_debit}, Credit: ${total_credit}')
        
        self.log_success(f'Transaction is balanced: ${total_debit}')
        
        return transaction_obj

    def verify_account_balances(self, child_account, contra_account, 
                                initial_child, initial_contra, transaction_obj):
        """Verify account balances were updated correctly on CHILD account"""
        current_child_balance = self.get_account_balance(child_account)
        current_contra_balance = self.get_account_balance(contra_account)
        
        self.log_success('Account Balances:')
        self.log_detail(f'Child Account ({child_account.code}):')
        self.log_detail(f'  Initial: ${initial_child}')
        self.log_detail(f'  Current: ${current_child_balance}')
        self.log_detail(f'  Change:  ${current_child_balance - initial_child}')
        
        self.log_detail(f'Contra Account ({contra_account.code}):')
        self.log_detail(f'  Initial: ${initial_contra}')
        self.log_detail(f'  Current: ${current_contra_balance}')
        self.log_detail(f'  Change:  ${current_contra_balance - initial_contra}')
        
        # Verify balances changed correctly
        # For expense (debit) account, balance should increase
        # For cash (credit) account, balance should decrease
        expected_child_change = self.test_amount
        expected_contra_change = -self.test_amount
        
        actual_child_change = current_child_balance - initial_child
        actual_contra_change = current_contra_balance - initial_contra
        
        if actual_child_change != expected_child_change:
            raise Exception(
                f'Child account balance change incorrect! '
                f'Expected: ${expected_child_change}, Actual: ${actual_child_change}'
            )
        
        if actual_contra_change != expected_contra_change:
            raise Exception(
                f'Contra account balance change incorrect! '
                f'Expected: ${expected_contra_change}, Actual: ${actual_contra_change}'
            )
        
        self.log_success('✓ Account balances updated correctly on CHILD account!')

    def cleanup(self):
        """Clean up test data - Delete in proper order to avoid FK constraints"""
        try:
            # Delete in reverse order of creation
            for txn in self.created_objects['transactions']:
                TransactionEntry.objects.filter(transaction=txn).delete()
                txn.delete()
                self.log_detail(f'Deleted transaction: {txn.reference_number}')
            
            for run in self.created_objects['runs']:
                WorkflowStepExecution.objects.filter(execution=run).delete()
                run.delete()
                self.log_detail(f'Deleted workflow run: {run.run_reference}')
            
            for submission in self.created_objects['submissions']:
                submission.delete()
                self.log_detail(f'Deleted submission: {submission.submission_reference}')
            
            for binding in self.created_objects['bindings']:
                binding.delete()
                self.log_detail('Deleted workflow binding')
            
            for workflow in self.created_objects['workflows']:
                workflow.delete()
                self.log_detail(f'Deleted workflow: {workflow.name}')
            
            for form in self.created_objects['forms']:
                form.delete()
                self.log_detail(f'Deleted form: {form.name}')
            
            # Delete accounts: CHILD accounts first, then PARENT accounts
            child_accounts = [acc for acc in self.created_objects['accounts'] if acc.account_level == Account.LEVEL_CHILD]
            parent_accounts = [acc for acc in self.created_objects['accounts'] if acc.account_level == Account.LEVEL_PARENT]
            
            for account in child_accounts:
                account.delete()
                self.log_detail(f'Deleted child account: {account.code}')
            
            for account in parent_accounts:
                account.delete()
                self.log_detail(f'Deleted parent account: {account.code}')
            
            self.log_success('Cleanup complete')
            
        except Exception as e:
            self.log_error(f'Cleanup failed: {str(e)}')
