# products/signals.py
"""
Signal handlers for product lifecycle events
Creates scheduled workflows for interest posting, fee debits, etc.
"""
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
from django.db import transaction
import logging

from products.models import Product
from automations.models import WorkflowTemplate

logger = logging.getLogger(__name__)


@receiver(post_save, sender=Product)
def create_product_workflows(sender, instance, created, **kwargs):
    """
    Create scheduled workflows when product is created or updated
    - Interest posting workflow (if interest_posting_cron is set)
    - Fee debit workflow (if auto_debit_fees is True)
    """
    if not instance.is_active:
        return
    
    # Only create workflows for financial products
    if instance.product_class != 'FINANCIAL':
        return
    
    try:
        with transaction.atomic():
            # Create/update interest posting workflow
            if instance.interest_posting_cron and instance.product_type in ['SAVINGS', 'LOAN']:
                _create_or_update_interest_workflow(instance)
            
            # Create/update fee debit workflow
            if instance.auto_debit_fees and instance.fee_structure:
                _create_or_update_fee_workflow(instance)
    
    except Exception as e:
        logger.error(f"Error creating product workflows for {instance.name}: {str(e)}", exc_info=True)


def _create_or_update_interest_workflow(product: Product):
    """
    Create or update scheduled workflow for interest posting
    One workflow processes all accounts using this product
    """
    workflow_name = f"Interest Posting - {product.name}"
    workflow_code = f"interest_posting_{product.code.lower().replace('-', '_')}"
    
    # Check if workflow already exists
    existing = WorkflowTemplate.objects.filter(
        owner=product.owner,
        branch=product.branch,
        name=workflow_name
    ).first()
    
    # Build workflow definition
    workflow_definition = _build_interest_posting_workflow(product)
    
    if existing:
        # Update existing workflow
        existing.workflow_definition = workflow_definition
        existing.trigger_config = {
            'cron': product.interest_posting_cron,
            'timezone': 'UTC'
        }
        existing.is_active = product.is_active
        existing.save()
        
        logger.info(f"Updated interest posting workflow for product {product.name}")
    else:
        # Create new workflow
        WorkflowTemplate.objects.create(
            owner=product.owner,
            branch=product.branch,
            created_by=product.created_by,
            name=workflow_name,
            description=f"Automatically posts interest for all {product.name} accounts",
            trigger_type='schedule',
            trigger_config={
                'cron': product.interest_posting_cron,
                'timezone': 'UTC',
                'product_id': product.id,
                'product_code': product.code,
                'auto_generated': True,
                'workflow_code': workflow_code
            },
            workflow_definition=workflow_definition,
            workflow_type='system',  # Mark as system workflow
            is_active=True,
            category=f"product_{product.code.lower()}"
        )
        
        logger.info(f"Created interest posting workflow for product {product.name}")


def _build_interest_posting_workflow(product: Product) -> dict:
    """
    Build workflow definition for interest posting
    
    Workflow steps:
    1. Query all active accounts with this product
    2. For each account, calculate interest
    3. Post interest based on product.interest_posting_method
    4. Send summary notification
    """
    steps = []
    
    # Step 1: Query accounts
    steps.append({
        'id': 'query_accounts',
        'name': 'Query Active Accounts',
        'type': 'query',
        'config': {
            'entity': 'Account',
            'where': {
                'savings_account_detail__product_id': str(product.id),
                'savings_account_detail__status': 'active',
                'is_deleted': False
            },
            'select': ['id', 'code', 'name', 'balance'],
            'output_variable': 'accounts'
        },
        'on_success': 'loop_accounts',
        'on_error': 'send_error_notification'
    })
    
    # Step 2: Loop through accounts
    steps.append({
        'id': 'loop_accounts',
        'name': 'Process Each Account',
        'type': 'loop',
        'config': {
            'items': '${accounts}',
            'item_variable': 'account',
            'steps': [
                {
                    'id': 'calculate_interest',
                    'name': 'Calculate Interest',
                    'type': 'calculation',
                    'config': {
                        'calculations': [
                            {
                                'variable': 'daily_interest',
                                'formula': f"(${'{account.balance}'} * {product.interest_rate} / 100) / 365",
                                'description': 'Daily interest calculation'
                            },
                            {
                                'variable': 'monthly_interest',
                                'formula': '${daily_interest} * 30',
                                'description': 'Approximate monthly interest'
                            }
                        ],
                        'output_variable': 'interest_calc'
                    }
                },
                {
                    'id': 'post_interest',
                    'name': 'Post Interest',
                    'type': 'transaction' if product.interest_posting_method == 'auto_journal' else 'approval',
                    'config': _build_interest_posting_config(product)
                }
            ]
        },
        'on_success': 'send_summary',
        'on_error': 'send_error_notification'
    })
    
    # Step 3: Send summary notification
    steps.append({
        'id': 'send_summary',
        'name': 'Send Summary',
        'type': 'notification',
        'config': {
            'notification_type': 'email',
            'recipient': '${workflow.created_by.email}',
            'subject': f'Interest Posting Complete - {product.name}',
            'message': 'Interest posting completed for ${accounts.length} accounts. Total interest posted: ${total_interest}'
        }
    })
    
    # Error handling step
    steps.append({
        'id': 'send_error_notification',
        'name': 'Send Error Notification',
        'type': 'notification',
        'config': {
            'notification_type': 'email',
            'recipient': '${workflow.created_by.email}',
            'subject': f'Interest Posting Failed - {product.name}',
            'message': 'Interest posting failed: ${error.message}'
        }
    })
    
    return {
        'steps': steps,
        'initial_step': 'query_accounts',
        'version': '1.0',
        'metadata': {
            'product_id': product.id,
            'interest_rate': str(product.interest_rate),
            'posting_method': product.interest_posting_method
        }
    }


def _build_interest_posting_config(product: Product) -> dict:
    """Build transaction/approval config based on posting method"""
    if product.interest_posting_method == 'auto_journal':
        # Automatically create journal entry
        return {
            'series_code': 'INT',
            'date': '${current_date}',
            'description': f'Interest posting for {product.name} - ${{account.name}}',
            'entries': [
                {
                    'account_id': '${account.id}',
                    'side': 'CR',
                    'amount': '${interest_calc.monthly_interest}'
                },
                {
                    'account_id': '${product.interest_expense_account_id}',
                    'side': 'DR',
                    'amount': '${interest_calc.monthly_interest}'
                }
            ]
        }
    elif product.interest_posting_method == 'pending_approval':
        # Create approval request
        return {
            'approver_type': 'role',
            'approver_role': 'accountant',
            'approval_message': f'Approve interest posting for ${{account.name}}: ${{interest_calc.monthly_interest}}',
            'timeout_hours': 24,
            'on_approve': 'post_interest_transaction',
            'on_reject': 'skip_account'
        }
    else:  # accrual
        # Just record in InterestAccrual table
        return {
            'entity': 'InterestAccrual',
            'action': 'create',
            'data': {
                'account_id': '${account.id}',
                'amount': '${interest_calc.monthly_interest}',
                'accrual_date': '${current_date}',
                'status': 'pending'
            }
        }


def _create_or_update_fee_workflow(product: Product):
    """
    Create or update scheduled workflow for fee debits
    Processes all accounts using this product
    """
    workflow_name = f"Fee Debit - {product.name}"
    workflow_code = f"fee_debit_{product.code.lower().replace('-', '_')}"
    
    # Check if workflow already exists
    existing = WorkflowTemplate.objects.filter(
        owner=product.owner,
        branch=product.branch,
        name=workflow_name
    ).first()
    
    # Build workflow definition
    workflow_definition = _build_fee_debit_workflow(product)
    
    # Determine cron schedule for fees (default to monthly if not specified)
    fee_cron = product.fee_structure.get('cron', '0 0 1 * *')  # 1st of every month
    
    if existing:
        # Update existing workflow
        existing.workflow_definition = workflow_definition
        existing.trigger_config = {
            'cron': fee_cron,
            'timezone': 'UTC'
        }
        existing.is_active = product.is_active
        existing.save()
        
        logger.info(f"Updated fee debit workflow for product {product.name}")
    else:
        # Create new workflow
        WorkflowTemplate.objects.create(
            owner=product.owner,
            branch=product.branch,
            created_by=product.created_by,
            name=workflow_name,
            description=f"Automatically debits fees for all {product.name} accounts",
            trigger_type='schedule',
            trigger_config={
                'cron': fee_cron,
                'timezone': 'UTC',
                'product_id': product.id,
                'product_code': product.code,
                'auto_generated': True,
                'workflow_code': workflow_code
            },
            workflow_definition=workflow_definition,
            workflow_type='system',
            is_active=True,
            category=f"product_{product.code.lower()}"
        )
        
        logger.info(f"Created fee debit workflow for product {product.name}")


def _build_fee_debit_workflow(product: Product) -> dict:
    """
    Build workflow definition for fee debits
    
    Workflow steps:
    1. Query all active accounts with this product
    2. For each account, calculate applicable fees
    3. Debit fees from account
    4. Send summary notification
    """
    fee_structure = product.fee_structure
    
    steps = []
    
    # Step 1: Query accounts
    steps.append({
        'id': 'query_accounts',
        'name': 'Query Active Accounts',
        'type': 'query',
        'config': {
            'entity': 'Account',
            'where': {
                'savings_account_detail__product_id': str(product.id),
                'savings_account_detail__status': 'active',
                'is_deleted': False
            },
            'select': ['id', 'code', 'name', 'balance'],
            'output_variable': 'accounts'
        },
        'on_success': 'loop_accounts',
        'on_error': 'send_error_notification'
    })
    
    # Step 2: Loop through accounts
    steps.append({
        'id': 'loop_accounts',
        'name': 'Process Each Account',
        'type': 'loop',
        'config': {
            'items': '${accounts}',
            'item_variable': 'account',
            'steps': [
                {
                    'id': 'calculate_fees',
                    'name': 'Calculate Fees',
                    'type': 'calculation',
                    'config': {
                        'calculations': [
                            {
                                'variable': 'maintenance_fee',
                                'formula': str(fee_structure.get('maintenance_fee', 0)),
                                'description': 'Monthly maintenance fee'
                            },
                            {
                                'variable': 'total_fees',
                                'formula': '${maintenance_fee}',
                                'description': 'Total fees to debit'
                            }
                        ],
                        'output_variable': 'fee_calc'
                    }
                },
                {
                    'id': 'check_balance',
                    'name': 'Check Sufficient Balance',
                    'type': 'condition',
                    'config': {
                        'condition': '${account.balance} >= ${fee_calc.total_fees}',
                        'on_true': 'debit_fee',
                        'on_false': 'send_insufficient_balance_notification'
                    }
                },
                {
                    'id': 'debit_fee',
                    'name': 'Debit Fee',
                    'type': 'transaction',
                    'config': {
                        'series_code': 'FEE',
                        'date': '${current_date}',
                        'description': f'Maintenance fee for {product.name} - ${{account.name}}',
                        'entries': [
                            {
                                'account_id': '${account.id}',
                                'side': 'DR',
                                'amount': '${fee_calc.total_fees}'
                            },
                            {
                                'account_id': '${product.fee_income_account_id}',
                                'side': 'CR',
                                'amount': '${fee_calc.total_fees}'
                            }
                        ]
                    }
                },
                {
                    'id': 'send_insufficient_balance_notification',
                    'name': 'Notify Insufficient Balance',
                    'type': 'notification',
                    'config': {
                        'notification_type': 'email',
                        'recipient': '${account.owner.email}',
                        'subject': f'Insufficient Balance for Fee Debit - {product.name}',
                        'message': 'Your account ${account.name} has insufficient balance (${account.balance}) to debit the maintenance fee (${fee_calc.total_fees}). Please add funds to avoid service interruption.'
                    }
                }
            ]
        },
        'on_success': 'send_summary',
        'on_error': 'send_error_notification'
    })
    
    # Step 3: Send summary notification
    steps.append({
        'id': 'send_summary',
        'name': 'Send Summary',
        'type': 'notification',
        'config': {
            'notification_type': 'email',
            'recipient': '${workflow.created_by.email}',
            'subject': f'Fee Debit Complete - {product.name}',
            'message': 'Fee debit completed for ${accounts.length} accounts. Total fees collected: ${total_fees}'
        }
    })
    
    # Error handling step
    steps.append({
        'id': 'send_error_notification',
        'name': 'Send Error Notification',
        'type': 'notification',
        'config': {
            'notification_type': 'email',
            'recipient': '${workflow.created_by.email}',
            'subject': f'Fee Debit Failed - {product.name}',
            'message': 'Fee debit failed: ${error.message}'
        }
    })
    
    return {
        'steps': steps,
        'initial_step': 'query_accounts',
        'version': '1.0',
        'metadata': {
            'product_id': product.id,
            'fee_structure': fee_structure
        }
    }


@receiver(pre_save, sender=Product)
def deactivate_workflows_on_product_deactivation(sender, instance, **kwargs):
    """
    Deactivate associated workflows when product is deactivated
    """
    if instance.pk:  # Only for updates
        try:
            old_instance = Product.objects.get(pk=instance.pk)
            
            # If product is being deactivated
            if old_instance.is_active and not instance.is_active:
                # Deactivate associated workflows
                WorkflowTemplate.objects.filter(
                    metadata__product_id=instance.id,
                    workflow_type='system'
                ).update(is_active=False)
                
                logger.info(f"Deactivated workflows for product {instance.name}")
        
        except Product.DoesNotExist:
            pass
