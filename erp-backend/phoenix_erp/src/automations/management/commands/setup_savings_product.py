# ============================================
# Complete Example: Premium Savings Product Configuration
# This shows how to set up the workflow system for your savings product
# ============================================

"""
PREMIUM SAVINGS PRODUCT REQUIREMENTS:
- Monthly fee if account is active
- 6% interest if no withdrawal for 3 months
- If withdrawal before 3 months, deduct monthly fees for incomplete months
- Daily cron job to check and apply interest
"""

from django.core.management.base import BaseCommand
from automations.models import (
    WorkflowStep, BusinessFunction, AutomationTemplate,
    EventTrigger, FormSchema
)


class Command(BaseCommand):
    help = 'Set up Premium Savings Product workflows'

    def handle(self, *args, **options):
        tenant = self.get_tenant()  # Your method to get tenant
        
        # Step 1: Create Workflow Steps
        self.stdout.write('Creating workflow steps...')
        steps = self.create_workflow_steps()
        
        # Step 2: Create Business Functions
        self.stdout.write('Creating business functions...')
        functions = self.create_business_functions(tenant)
        
        # Step 3: Create Automation Templates
        self.stdout.write('Creating automation templates...')
        templates = self.create_automation_templates(tenant, steps, functions)
        
        # Step 4: Create Event Triggers
        self.stdout.write('Creating event triggers...')
        self.create_event_triggers(tenant, templates)
        
        self.stdout.write(self.style.SUCCESS('✓ Premium Savings Product configured successfully!'))
    
    def create_workflow_steps(self):
        """Create workflow steps for the savings product."""
        steps = {}
        
        # Withdrawal workflow steps
        steps['validate_withdrawal'] = WorkflowStep.objects.create(
            code='validate_withdrawal',
            label='Validate Withdrawal',
            order=10
        )
        
        steps['check_cycle'] = WorkflowStep.objects.create(
            code='check_cycle',
            label='Check 3-Month Cycle',
            order=20
        )
        
        steps['calculate_fee'] = WorkflowStep.objects.create(
            code='calculate_fee',
            label='Calculate Early Withdrawal Fee',
            order=30
        )
        
        steps['process_withdrawal'] = WorkflowStep.objects.create(
            code='process_withdrawal',
            label='Process Withdrawal',
            order=40
        )
        
        steps['update_account'] = WorkflowStep.objects.create(
            code='update_account',
            label='Update Account Status',
            order=50
        )
        
        steps['notify_customer'] = WorkflowStep.objects.create(
            code='notify_customer',
            label='Send Notification',
            order=60
        )
        
        # Interest calculation steps
        steps['query_accounts'] = WorkflowStep.objects.create(
            code='query_accounts',
            label='Query Eligible Accounts',
            order=10
        )
        
        steps['check_eligibility'] = WorkflowStep.objects.create(
            code='check_eligibility',
            label='Check Interest Eligibility',
            order=20
        )
        
        steps['calculate_interest'] = WorkflowStep.objects.create(
            code='calculate_interest',
            label='Calculate Interest',
            order=30
        )
        
        steps['credit_interest'] = WorkflowStep.objects.create(
            code='credit_interest',
            label='Credit Interest to Account',
            order=40
        )
        
        return steps
    
    def create_business_functions(self, tenant):
        """Create business functions for the workflows."""
        functions = {}
        
        # Query function: Get account details
        functions['get_account'] = BusinessFunction.objects.create(
            owner=tenant,
            name='get_account_details',
            friendly_name='Get Account Details',
            function_type='database',
            config={
                'query': {
                    'entity': 'Account',
                    'select': ['id', 'balance', 'last_withdrawal_date', 'product_type'],
                    'where': {
                        'id': '${account_id}'
                    }
                }
            }
        )
        
        # Condition: Check if 3 months passed
        functions['check_3_months'] = BusinessFunction.objects.create(
            owner=tenant,
            name='check_three_month_cycle',
            friendly_name='Check 3-Month Cycle',
            function_type='condition',
            config={
                'logic': 'AND',
                'conditions': [
                    {
                        'field': 'days_since_withdrawal',
                        'operator': 'greater_than_or_equal',
                        'value': 90,
                        'data_source': 'step_check_cycle'
                    }
                ],
                'true_step': 'process_withdrawal',  # No fee
                'false_step': 'calculate_fee'  # Calculate fee
            }
        )
        
        # Calculation: Calculate early withdrawal fee
        functions['calc_early_fee'] = BusinessFunction.objects.create(
            owner=tenant,
            name='calculate_early_withdrawal_fee',
            friendly_name='Calculate Early Withdrawal Fee',
            function_type='calculation',
            config={
                'formula': '(90 - days_since_withdrawal) / 30 * monthly_fee',
                'variables': {
                    'days_since_withdrawal': 'step_check_cycle.days_since_withdrawal',
                    'monthly_fee': 'account.product_config.monthly_fee'
                },
                'result_variable': 'early_withdrawal_fee'
            }
        )
        
        # Internal process: Debit account
        functions['debit_account'] = BusinessFunction.objects.create(
            owner=tenant,
            name='process_debit_transaction',
            friendly_name='Process Debit Transaction',
            function_type='internal_process',
            config={
                'process': 'transactions.process_debit',
                'parameters': {
                    'account_id': '${account_id}',
                    'amount': '${withdrawal_amount} + ${early_withdrawal_fee}',
                    'description': 'Withdrawal + early withdrawal fee',
                    'reference': '${run_reference}'
                }
            }
        )
        
        # Query: Find eligible accounts for interest
        functions['query_eligible_accounts'] = BusinessFunction.objects.create(
            owner=tenant,
            name='query_eligible_accounts',
            friendly_name='Query Eligible Accounts',
            function_type='database',
            config={
                'query': {
                    'entity': 'Account',
                    'select': ['id', 'balance', 'last_withdrawal_date'],
                    'where': {
                        'product_type': 'premium_savings',
                        'status': 'active'
                    }
                }
            }
        )
        
        # Condition: Check if exactly 90 days
        functions['check_90_days'] = BusinessFunction.objects.create(
            owner=tenant,
            name='check_exactly_90_days',
            friendly_name='Check Exactly 90 Days',
            function_type='condition',
            config={
                'logic': 'AND',
                'conditions': [
                    {
                        'field': 'days_since_withdrawal',
                        'operator': 'equals',
                        'value': 90
                    }
                ],
                'true_step': 'calculate_interest',
                'false_step': 'notify_customer'  # Skip to end
            }
        )
        
        # Calculation: Calculate 6% interest
        functions['calc_interest'] = BusinessFunction.objects.create(
            owner=tenant,
            name='calculate_interest_amount',
            friendly_name='Calculate 6% Interest',
            function_type='calculation',
            config={
                'formula': 'balance * 0.06',
                'variables': {
                    'balance': 'account.balance'
                },
                'result_variable': 'interest_amount'
            }
        )
        
        # Internal process: Credit interest
        functions['credit_interest'] = BusinessFunction.objects.create(
            owner=tenant,
            name='credit_interest_transaction',
            friendly_name='Credit Interest',
            function_type='internal_process',
            config={
                'process': 'transactions.process_credit',
                'parameters': {
                    'account_id': '${account.id}',
                    'amount': '${interest_amount}',
                    'description': 'Interest earned - 3-month cycle',
                    'reference': '${run_reference}'
                }
            }
        )
        
        # Email notification
        functions['send_email'] = BusinessFunction.objects.create(
            owner=tenant,
            name='send_notification_email',
            friendly_name='Send Email Notification',
            function_type='email',
            config={
                'from_email': 'noreply@yourbank.com',
                'subject': 'Transaction Alert - {transaction_type}',
                'template': '''
                    Dear {customer_name},
                    
                    Your transaction has been processed:
                    Amount: {amount}
                    Fee: {fee}
                    New Balance: {new_balance}
                    
                    Thank you for banking with us.
                ''',
                'recipients': ['${account.user.email}']
            }
        )
        
        return functions
    
    def create_automation_templates(self, tenant, steps, functions):
        """Create automation templates."""
        templates = {}
        
        # Link functions to steps
        steps['validate_withdrawal'].business_function = functions['get_account']
        steps['validate_withdrawal'].save()
        
        steps['check_cycle'].business_function = functions['check_3_months']
        steps['check_cycle'].save()
        
        steps['calculate_fee'].business_function = functions['calc_early_fee']
        steps['calculate_fee'].save()
        
        steps['process_withdrawal'].business_function = functions['debit_account']
        steps['process_withdrawal'].save()
        
        steps['notify_customer'].business_function = functions['send_email']
        steps['notify_customer'].save()
        
        # Create withdrawal automation template
        templates['withdrawal'] = AutomationTemplate.objects.create(
            owner=tenant,
            name='Premium Savings Withdrawal',
            description='Process withdrawals with early withdrawal fee logic',
            initial_step=steps['validate_withdrawal'],
            final_step=steps['notify_customer'],
            requires_approval=False,
            scheduling_enabled=False
        )
        
        # Link interest calculation functions to steps
        steps['query_accounts'].business_function = functions['query_eligible_accounts']
        steps['query_accounts'].save()
        
        steps['check_eligibility'].business_function = functions['check_90_days']
        steps['check_eligibility'].save()
        
        steps['calculate_interest'].business_function = functions['calc_interest']
        steps['calculate_interest'].save()
        
        steps['credit_interest'].business_function = functions['credit_interest']
        steps['credit_interest'].save()
        
        # Create interest calculation template (scheduled daily)
        templates['interest'] = AutomationTemplate.objects.create(
            owner=tenant,
            name='Daily Interest Calculation',
            description='Calculate and credit interest for eligible accounts',
            initial_step=steps['query_accounts'],
            final_step=steps['notify_customer'],
            requires_approval=False,
            scheduling_enabled=True,
            scheduling_config={
                'frequency': 'daily',
                'hour': 0,  # Run at midnight
                'cron': '0 0 * * *'
            }
        )
        
        return templates
    
    def create_event_triggers(self, tenant, templates):
        """Create event triggers."""
        
        # Trigger withdrawal workflow on withdrawal events
        EventTrigger.objects.create(
            owner=tenant,
            template=templates['withdrawal'],
            event_type='transaction',
            event_name='withdrawal',
            entity_type='Transaction',
            filter_conditions={
                'product_type': 'premium_savings',
                'transaction_type': 'withdrawal'
            },
            field_mappings={
                'account.id': 'account_id',
                'amount': 'withdrawal_amount',
                'transaction.id': 'transaction_id',
                'account.balance': 'current_balance',
                'account.last_withdrawal_date': 'last_withdrawal_date'
            },
            active=True
        )
        
        self.stdout.write(self.style.SUCCESS('✓ Event triggers configured'))
    
    def get_tenant(self):
        """Get or create tenant - customize based on your setup."""
        from users.models import Tenant
        # This is just an example - adapt to your needs
        tenant, _ = Tenant.objects.get_or_create(
            name='Demo Tenant',
            slug='demo'
        )
        return tenant


# ============================================
# Usage in your views/APIs
# ============================================

"""
# In your transactions view/API:

from automations.signals import trigger_workflow_from_event

def process_withdrawal(request):
    account = get_object_or_404(Account, id=request.data['account_id'])
    amount = Decimal(request.data['amount'])
    
    # Calculate days since last withdrawal
    if account.last_withdrawal_date:
        days_since = (timezone.now().date() - account.last_withdrawal_date).days
    else:
        days_since = 999  # First withdrawal
    
    # Trigger the workflow
    runs = trigger_workflow_from_event(
        event_name='withdrawal',
        event_data={
            'account_id': account.id,
            'withdrawal_amount': float(amount),
            'product_type': account.product_type,
            'current_balance': float(account.balance),
            'last_withdrawal_date': account.last_withdrawal_date.isoformat() if account.last_withdrawal_date else None,
            'days_since_withdrawal': days_since,
            'customer_name': account.user.get_full_name(),
        },
        tenant=request.user.tenant
    )
    
    return Response({
        'message': 'Withdrawal initiated',
        'workflow_runs': [run.run_reference for run in runs]
    })
"""


# ============================================
# Celery Beat Configuration
# ============================================

"""
# In your celery.py or settings.py:

from celery.schedules import crontab

CELERY_BEAT_SCHEDULE = {
    'process-scheduled-workflows': {
        'task': 'automations.tasks.process_scheduled_workflows',
        'schedule': crontab(minute='*/5'),  # Every 5 minutes
    },
}
"""