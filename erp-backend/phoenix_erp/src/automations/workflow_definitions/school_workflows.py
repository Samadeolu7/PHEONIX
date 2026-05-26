# school_workflows.py
"""
School-Specific Workflow Configurations
Complete implementation of all 9 school operational processes
"""

from django.utils import timezone
from datetime import timedelta
from automations.models import WorkflowTemplate, FormSchema
from accounts.models import Account
from incomes.models import IncomeCategory, FeeStructure

from transactions.models import TransactionEntry
from django.core.exceptions import ValidationError\

from procurement.models import PurchaseOrder, GoodsReceivedNote


# ============================================================================
# 1. AUTOMATIC INVOICING FOR SCHOOL FEES
# ============================================================================

def create_auto_invoice_workflow():
    """
    Automatically generates school fee invoices 30 days before due date
    Runs daily via scheduled task
    """
    
    workflow = WorkflowTemplate.objects.create(
        name='Auto Generate School Fee Invoices',
        description='Automatically generates invoices for all active students based on fee schedules',
        trigger_type='scheduled',  # Runs daily
        trigger_config={
            'schedule': 'daily',
            'time': '06:00',  # Run at 6 AM
            'days_before_due': 30
        },
        workflow_type='system',
        access_level='system',
        is_active=True,
        version=1
    )
    
    workflow.steps = [
        {
            'order': 1,
            'step_type': 'query',
            'name': 'Get Active Students',
            'description': 'Fetch all active students who need invoicing',
            'config': {
                'entity': 'Client',
                'filters': [
                    {'field': 'classification__code', 'operator': 'eq', 'value': 'STUDENT'},
                    {'field': 'status', 'operator': 'eq', 'value': 'ACTIVE'}
                ]
            }
        },
        {
            'order': 2,
            'step_type': 'query',
            'name': 'Get Fee Schedules',
            'description': 'Get active fee configurations for current term',
            'config': {
                'entity': 'FeeStructure',
                'filters': [
                    {'field': 'is_active', 'operator': 'eq', 'value': True},
                    {'field': 'term', 'operator': 'eq', 'value': 'current'}
                ]
            }
        },
        {
            'order': 3,
            'step_type': 'loop',
            'name': 'Process Each Student',
            'description': 'Generate invoice for each student',
            'config': {
                'iterate_over': 'step_1_results',
                'sub_steps': [
                    {
                        'step_type': 'function',
                        'name': 'Calculate Student Fees',
                        'function': 'calculate_student_fees',
                        'params': {
                            'student': '${current_item}',
                            'fee_schedules': '${step_2_results}'
                        }
                    },
                    {
                        'step_type': 'validation',
                        'name': 'Check Invoice Not Generated',
                        'function': 'check_invoice_exists',
                        'params': {
                            'student_id': '${current_item.id}',
                            'period': 'current_term'
                        },
                        'on_fail': 'skip'  # Skip if already invoiced
                    },
                    {
                        'step_type': 'action',
                        'name': 'Create Invoice Transaction',
                        'function': 'create_invoice_transaction',
                        'params': {
                            'student': '${current_item}',
                            'fee_items': '${calculated_fees}',
                            'due_date': '${due_date}'
                        }
                    },
                    {
                        'step_type': 'action',
                        'name': 'Send Invoice Email',
                        'function': 'send_invoice_notification',
                        'params': {
                            'student': '${current_item}',
                            'invoice_reference': '${invoice.reference_number}',
                            'parent_email': '${current_item.email}',
                            'template': 'school_invoice'
                        }
                    }
                ]
            }
        },
        {
            'order': 4,
            'step_type': 'notification',
            'name': 'Notify Finance Team',
            'description': 'Send summary to finance team',
            'config': {
                'recipient_role': 'finance_officer',
                'subject': 'Daily Invoice Generation Complete',
                'message': 'Generated ${total_invoices} invoices for ${total_students} students. Total amount: ${total_amount}',
                'include_report': True
            }
        }
    ]
    
    workflow.save()
    return workflow


# ============================================================================
# 7. FIXED ASSET MANAGEMENT
# ============================================================================

def create_asset_management_workflows():
    """
    Asset acquisition, movement tracking, and annual verification workflows
    """
    
    # Workflow 1: Asset Acquisition & Tagging
    acquisition_workflow = WorkflowTemplate.objects.create(
        name='Fixed Asset Acquisition',
        description='Register and tag new fixed assets',
        trigger_type='event',
        trigger_config={'event_name': 'asset.purchase_complete'},
        workflow_type='system',
        access_level='finance',
        is_active=True,
        version=1
    )
    
    acquisition_workflow.steps = [
        {
            'order': 1,
            'step_type': 'action',
            'name': 'Generate Asset Tag',
            'description': 'Create unique FAR ID for asset',
            'function': 'generate_asset_tag',
            'params': {
                'asset_category': '${form_data.category}',
                'location': '${form_data.location}'
            }
        },
        {
            'order': 2,
            'step_type': 'action',
            'name': 'Create Fixed Asset Record',
            'description': 'Register asset in FAR',
            'function': 'create_fixed_asset',
            'params': {
                'asset_tag': '${asset_tag}',
                'description': '${form_data.description}',
                'purchase_cost': '${form_data.cost}',
                'acquisition_date': '${form_data.date}',
                'location': '${form_data.location}',
                'depreciation_method': '${form_data.depreciation_method}',
                'useful_life': '${form_data.useful_life}'
            }
        },
        {
            'order': 3,
            'step_type': 'action',
            'name': 'Create Task for Physical Tagging',
            'function': 'create_task',
            'params': {
                'assigned_to_role': 'asset_custodian',
                'task_type': 'asset_tagging',
                'due_date': '+7_days',
                'priority': 'high',
                'description': 'Physically affix tag ${asset_tag} to ${form_data.description}',
                'related_asset': '${fixed_asset.id}'
            }
        },
        {
            'order': 4,
            'step_type': 'approval',
            'name': 'Verify Physical Tag',
            'config': {
                'approver_role': 'asset_custodian',
                'approval_message': 'Confirm asset ${asset_tag} has been physically tagged and located at ${form_data.location}',
                'timeout_hours': 168,  # 7 days
                'require_photo': True
            }
        }
    ]
    acquisition_workflow.save()
    
    # Workflow 2: Asset Movement
    movement_workflow = WorkflowTemplate.objects.create(
        name='Asset Movement Tracking',
        description='Track and approve asset transfers between locations',
        trigger_type='event',
        trigger_config={'event_name': 'asset.movement_requested'},
        workflow_type='approval',
        access_level='operations',
        is_active=True,
        version=1
    )
    
    movement_workflow.steps = [
        {
            'order': 1,
            'step_type': 'approval',
            'name': 'Authorize Movement',
            'config': {
                'approver_role': 'asset_custodian',
                'approval_message': 'Approve movement of ${form_data.asset_description} from ${form_data.current_location} to ${form_data.new_location}',
                'timeout_hours': 24,
                'require_comment': True
            }
        },
        {
            'order': 2,
            'step_type': 'action',
            'name': 'Update Asset Location',
            'function': 'update_asset_location',
            'params': {
                'asset_id': '${form_data.asset_id}',
                'new_location': '${form_data.new_location}',
                'moved_by': '${form_submission.created_by}',
                'movement_date': 'today'
            }
        },
        {
            'order': 3,
            'step_type': 'notification',
            'name': 'Notify IT/Security',
            'config': {
                'recipients': ['it_manager', 'security_officer'],
                'subject': 'Asset Movement Completed',
                'message': 'Asset ${form_data.asset_tag} moved to ${form_data.new_location}'
            }
        }
    ]
    movement_workflow.save()
    
    return acquisition_workflow, movement_workflow


# ============================================================================
# 8. INVENTORY REORDER AUTOMATION
# ============================================================================

def create_inventory_reorder_workflow():
    """
    Automatic reorder notification when stock falls below minimum
    """
    
    workflow = WorkflowTemplate.objects.create(
        name='Inventory Reorder Notification',
        description='Automatically create purchase request when stock below reorder point',
        trigger_type='scheduled',
        trigger_config={
            'schedule': 'daily',
            'time': '09:00'
        },
        workflow_type='system',
        access_level='procurement',
        is_active=True,
        version=1
    )
    
    workflow.steps = [
        {
            'order': 1,
            'step_type': 'query',
            'name': 'Check Stock Levels',
            'description': 'Find items below reorder point',
            'config': {
                'entity': 'InventoryItem',
                'filters': [
                    {'field': 'quantity_on_hand', 'operator': 'lte', 'field_ref': 'reorder_point'},
                    {'field': 'is_active', 'operator': 'eq', 'value': True}
                ]
            }
        },
        {
            'order': 2,
            'step_type': 'loop',
            'name': 'Process Each Low Stock Item',
            'config': {
                'iterate_over': 'step_1_results',
                'sub_steps': [
                    {
                        'step_type': 'action',
                        'name': 'Create Purchase Request',
                        'function': 'create_purchase_request',
                        'params': {
                            'item': '${current_item}',
                            'quantity': '${current_item.reorder_quantity}',
                            'reason': 'Stock below reorder point',
                            'urgency': 'normal'
                        }
                    },
                    {
                        'step_type': 'notification',
                        'name': 'Alert Procurement Officer',
                        'config': {
                            'recipient_role': 'procurement_officer',
                            'subject': 'Reorder Required: ${current_item.name}',
                            'message': 'Current stock: ${current_item.quantity_on_hand}, Reorder point: ${current_item.reorder_point}'
                        }
                    }
                ]
            }
        }
    ]
    
    workflow.save()
    return workflow


# ============================================================================
# HELPER FUNCTIONS FOR WORKFLOWS
# ============================================================================

def calculate_student_fees(student, fee_schedules):
    """Calculate total fees for a student based on their profile"""
    total_fees = []
    
    for fee in fee_schedules:
        # Check if fee applies to this student
        if fee.applies_to_student(student):
            fee_item = {
                'category': fee.income_category,
                'description': fee.name,
                'amount': fee.calculate_amount(student),
                'account': fee.income_category.account
            }
            total_fees.append(fee_item)
    
    return total_fees


def create_invoice_transaction(student, fee_items, due_date):
    """Create AR transaction for student invoice"""
    from transactions.models import Transaction, TransactionSeries
    
    series = TransactionSeries.objects.get(code='INV')
    total_amount = sum(item['amount'] for item in fee_items)
    
    transaction = Transaction.objects.create(
        series=series,
        date=timezone.now().date(),
        description=f"Invoice for {student.name} - {due_date}",
        status='approved'
    )
    
    # Debit: Student AR Account
    TransactionEntry.objects.create(
        transaction=transaction,
        account=student.receivable_account,
        debit=total_amount,
        credit=0
    )
    
    # Credit: Income accounts (one per fee type)
    for item in fee_items:
        TransactionEntry.objects.create(
            transaction=transaction,
            account=item['account'],
            debit=0,
            credit=item['amount']
        )
    
    return transaction


# def check_budget_allocation(budget_code, amount):
#     """Verify sufficient funds in budget line"""
#     # Implementation would check budget table
#     budget = Budget.objects.get(code=budget_code, period=current_period())
#     available = budget.allocated_amount - budget.spent_amount
    
#     if available < amount:
#         raise ValidationError(f"Insufficient budget. Available: {available}, Requested: {amount}")
    
#     return True


def validate_three_way_match(invoice_amount, invoice_items, po_number):
    """Match invoice, PO, and GRN"""
    po = PurchaseOrder.objects.get(reference_number=po_number)
    grn = GoodsReceivedNote.objects.get(purchase_order=po)
    
    # Check amounts match within tolerance
    if abs(invoice_amount - po.total_amount) > (po.total_amount * 0.05):
        raise ValidationError(f"Invoice amount {invoice_amount} exceeds PO amount {po.total_amount} by more than 5%")
    
    # Check quantities match
    for item in invoice_items:
        po_item = po.items.get(description=item['description'])
        grn_item = grn.items.get(po_item=po_item)
        
        if abs(item['quantity'] - grn_item['quantity']) > (grn_item['quantity'] * 0.02):
            raise ValidationError(f"Quantity mismatch for {item['description']}")
    
    return True


# ============================================================================
# INITIALIZATION FUNCTION
# ============================================================================

def initialize_school_workflows():
    """
    Initialize all school workflows
    Call this from Django management command or admin action
    """
    workflows = []
    
    print("Creating school workflows...")
    
    # 1. Auto Invoicing
    workflows.append(create_auto_invoice_workflow())
    print("✓ Auto Invoice Workflow created")
    
    # 2. Debtor Management
    workflows.append(create_debtor_management_workflow())
    print("✓ Debtor Management Workflow created")
    
    # 3. Purchase Request Approval
    workflows.append(create_purchase_request_workflow())
    print("✓ Purchase Request Workflow created")
    
    # 4. Accounts Payable
    workflows.append(create_accounts_payable_workflow())
    print("✓ Accounts Payable Workflow created")
    
    # 5. Cash Reconciliation
    workflows.append(create_cash_reconciliation_workflow())
    print("✓ Cash Reconciliation Workflow created")
    
    # 6. Payroll Processing
    workflows.append(create_payroll_workflow())
    print("✓ Payroll Workflow created")
    
    # 7. Asset Management
    asset_workflows = create_asset_management_workflows()
    workflows.extend(asset_workflows)
    print("✓ Asset Management Workflows created")
    
    # 8. Inventory Reorder
    workflows.append(create_inventory_reorder_workflow())
    print("✓ Inventory Reorder Workflow created")
    
    print(f"\n✅ Successfully created {len(workflows)} school workflows")
    
    return workflows


# ============================================================================
# DJANGO MANAGEMENT COMMAND
# ============================================================================

"""
Create a management command to run this:

# management/commands/init_school_workflows.py
from django.core.management.base import BaseCommand
from path.to.school_workflows import initialize_school_workflows

class Command(BaseCommand):
    help = 'Initialize school-specific workflows'

    def handle(self, *args, **options):
        workflows = initialize_school_workflows()
        self.stdout.write(
            self.style.SUCCESS(f'Successfully created {len(workflows)} workflows')
        )

# Usage:
# python manage.py init_school_workflows
"""


# ============================================================================
# 4. ACCOUNTS PAYABLE - 3-WAY MATCH
# ============================================================================

def create_accounts_payable_workflow():
    """
    3-way match workflow: Invoice, PO, and GRN must match before payment
    Includes dual-signature authorization for payments
    """
    
    workflow = WorkflowTemplate.objects.create(
        name='Accounts Payable 3-Way Match',
        description='Validates invoice against PO and GRN before processing payment',
        trigger_type='event',
        trigger_config={'event_name': 'expense.invoice_received'},
        workflow_type='approval',
        access_level='finance',
        is_active=True,
        version=1
    )
    
    workflow.steps = [
        {
            'order': 1,
            'step_type': 'validation',
            'name': 'Validate PO Exists',
            'description': 'Ensure invoice references a valid Purchase Order',
            'function': 'validate_purchase_order_exists',
            'params': {
                'po_number': '${form_data.po_number}',
                'vendor_id': '${form_data.vendor_id}'
            },
            'on_fail': 'reject',
            'rejection_message': 'No valid Purchase Order found for PO#: ${form_data.po_number}'
        },
        {
            'order': 2,
            'step_type': 'validation',
            'name': 'Validate GRN Exists',
            'description': 'Ensure goods/services have been received',
            'function': 'validate_goods_received',
            'params': {
                'po_number': '${form_data.po_number}'
            },
            'on_fail': 'reject',
            'rejection_message': 'No Goods Received Note found for this PO'
        },
        {
            'order': 3,
            'step_type': 'validation',
            'name': '3-Way Match',
            'description': 'Match invoice amount, PO amount, and GRN quantity',
            'function': 'validate_three_way_match',
            'params': {
                'invoice_amount': '${form_data.invoice_amount}',
                'invoice_items': '${form_data.line_items}',
                'po_number': '${form_data.po_number}'
            },
            'tolerance': {
                'amount_variance': 0.05,  # 5% tolerance
                'quantity_variance': 0.02  # 2% tolerance
            },
            'on_fail': 'escalate'
        },
        {
            'order': 4,
            'step_type': 'approval',
            'name': 'Finance Officer Review',
            'description': 'Finance officer verifies all documents match',
            'config': {
                'approver_role': 'finance_officer',
                'approval_message': 'Review invoice ${form_data.invoice_number} against PO ${form_data.po_number}',
                'timeout_hours': 24,
                'show_documents': ['invoice', 'purchase_order', 'grn']
            }
        },
        {
            'order': 5,
            'step_type': 'approval',
            'name': 'Finance Manager Approval',
            'description': 'First signature authorization',
            'config': {
                'approver_role': 'finance_manager',
                'approval_message': 'Approve payment of ${form_data.invoice_amount} to ${form_data.vendor_name}',
                'timeout_hours': 48,
                'require_comment': True
            }
        },
        {
            'order': 6,
            'step_type': 'approval',
            'name': 'Principal Approval',
            'description': 'Second signature authorization (dual control)',
            'config': {
                'approver_role': 'principal',
                'approval_message': 'Final approval for payment to ${form_data.vendor_name}',
                'timeout_hours': 48,
                'require_comment': False
            }
        },
        {
            'order': 7,
            'step_type': 'action',
            'name': 'Create Payment Transaction',
            'description': 'Create GL transaction for payment',
            'function': 'create_payment_transaction',
            'params': {
                'vendor_account': '${vendor.payable_account}',
                'amount': '${form_data.invoice_amount}',
                'bank_account': '${school.default_bank_account}',
                'reference': '${form_data.invoice_number}',
                'workflow_reference': '${workflow_run.id}'
            }
        },
        {
            'order': 8,
            'step_type': 'action',
            'name': 'Generate Payment Voucher',
            'description': 'Create payment voucher for records',
            'function': 'generate_payment_voucher',
            'params': {
                'transaction_id': '${transaction.id}',
                'signatories': '${approval_chain}'
            }
        },
        {
            'order': 9,
            'step_type': 'notification',
            'name': 'Notify for Bank Transfer',
            'description': 'Alert bank signatories to execute payment',
            'config': {
                'recipients': ['principal', 'board_treasurer'],
                'subject': 'Payment Ready for Execution',
                'message': 'Payment voucher ${payment_voucher.reference} ready for bank transfer',
                'include_attachment': True
            }
        }
    ]
    
    workflow.save()
    return workflow


# ============================================================================
# 5. DAILY CASH RECONCILIATION
# ============================================================================

def create_cash_reconciliation_workflow():
    """
    Daily cash reconciliation ensuring all receipts match deposits
    Enforces no cash held overnight policy
    """
    
    workflow = WorkflowTemplate.objects.create(
        name='Daily Cash Reconciliation',
        description='Daily reconciliation of cash receipts to bank deposits',
        trigger_type='scheduled',
        trigger_config={
            'schedule': 'daily',
            'time': '17:00'  # 5 PM
        },
        workflow_type='system',
        access_level='finance',
        is_active=True,
        version=1
    )
    
    workflow.steps = [
        {
            'order': 1,
            'step_type': 'query',
            'name': 'Get Today Cash Receipts',
            'description': 'Sum all cash/check receipts for today',
            'config': {
                'entity': 'Transaction',
                'filters': [
                    {'field': 'date', 'operator': 'eq', 'value': 'today'},
                    {'field': 'series.code', 'operator': 'in', 'value': ['RCPT', 'CASH']},
                    {'field': 'status', 'operator': 'eq', 'value': 'approved'}
                ],
                'aggregate': {
                    'total_amount': 'sum(entries.debit)',
                    'receipt_count': 'count(*)'
                }
            }
        },
        {
            'order': 2,
            'step_type': 'action',
            'name': 'Generate Reconciliation Report',
            'description': 'Create daily cash summary',
            'function': 'generate_cash_reconciliation_report',
            'params': {
                'receipts': '${step_1_results}',
                'date': 'today'
            }
        },
        {
            'order': 3,
            'step_type': 'approval',
            'name': 'Cashier Confirmation',
            'description': 'Cashier confirms physical cash matches system',
            'config': {
                'approver_role': 'school_cashier',
                'approval_message': 'Confirm physical cash/checks total: ${step_1_results.total_amount}',
                'timeout_hours': 2,
                'require_comment': True,
                'required_fields': ['physical_cash_count', 'variance_explanation']
            }
        },
        {
            'order': 4,
            'step_type': 'validation',
            'name': 'Check for Variances',
            'description': 'Identify any discrepancies',
            'function': 'check_cash_variance',
            'params': {
                'system_total': '${step_1_results.total_amount}',
                'physical_count': '${approval.physical_cash_count}'
            },
            'tolerance': 0.00,  # Zero tolerance
            'on_fail': 'escalate'
        },
        {
            'order': 5,
            'step_type': 'approval',
            'name': 'Finance Officer Sign-off',
            'description': 'Finance officer reviews and approves reconciliation',
            'config': {
                'approver_role': 'finance_officer',
                'approval_message': 'Review daily reconciliation: ${step_1_results.receipt_count} receipts, ${step_1_results.total_amount} total',
                'timeout_hours': 1,
                'show_report': True
            }
        },
        {
            'order': 6,
            'step_type': 'action',
            'name': 'Create Deposit Slip',
            'description': 'Generate bank deposit documentation',
            'function': 'create_deposit_slip',
            'params': {
                'amount': '${step_1_results.total_amount}',
                'bank_account': '${school.default_bank_account}',
                'deposit_date': 'today',
                'receipt_numbers': '${step_1_results.receipt_references}'
            }
        },
        {
            'order': 7,
            'step_type': 'notification',
            'name': 'Alert for Bank Deposit',
            'description': 'Remind designated staff to make deposit',
            'config': {
                'recipient_role': 'finance_staff',
                'subject': 'Daily Bank Deposit Required',
                'message': 'Deposit ${step_1_results.total_amount} to bank today. Deposit slip: ${deposit_slip.reference}',
                'priority': 'high'
            }
        },
        {
            'order': 8,
            'step_type': 'validation',
            'name': 'Verify Next-Day Deposit',
            'description': 'Check deposit was made next business day',
            'function': 'verify_bank_deposit_made',
            'params': {
                'deposit_slip': '${deposit_slip.reference}',
                'check_after_hours': 24
            },
            'on_fail': 'alert_management'
        }
    ]
    
    workflow.save()
    return workflow


# ============================================================================
# 6. PAYROLL PROCESSING
# ============================================================================

def create_payroll_workflow():
    """
    Monthly payroll processing with multi-level approval
    Includes HR confirmation, calculation audit, and dual approval
    """
    
    workflow = WorkflowTemplate.objects.create(
        name='Monthly Payroll Processing',
        description='Complete payroll cycle from data input to bank submission',
        trigger_type='manual',  # Initiated by HR monthly
        workflow_type='approval',
        access_level='hr',
        is_active=True,
        version=1
    )
    
    workflow.steps = [
        {
            'order': 1,
            'step_type': 'approval',
            'name': 'HR Data Confirmation',
            'description': 'HR confirms all personnel changes for the month',
            'config': {
                'approver_role': 'hr_manager',
                'approval_message': 'Confirm monthly personnel changes: new hires, terminations, leave, overtime',
                'timeout_hours': 48,
                'require_comment': True,
                'required_attachments': ['personnel_changes_report']
            }
        },
        {
            'order': 2,
            'step_type': 'query',
            'name': 'Get Active Staff',
            'description': 'Fetch all active employees',
            'config': {
                'entity': 'Staff',
                'filters': [
                    {'field': 'status', 'operator': 'eq', 'value': 'ACTIVE'}
                ],
                'include_related': ['pay_info', 'salary_components']
            }
        },
        {
            'order': 3,
            'step_type': 'loop',
            'name': 'Calculate Each Employee Payroll',
            'config': {
                'iterate_over': 'step_2_results',
                'sub_steps': [
                    {
                        'step_type': 'function',
                        'name': 'Calculate Gross Pay',
                        'function': 'calculate_gross_pay',
                        'params': {
                            'staff': '${current_item}',
                            'pay_period': '${current_month}'
                        }
                    },
                    {
                        'step_type': 'function',
                        'name': 'Calculate Deductions',
                        'function': 'calculate_deductions',
                        'params': {
                            'staff': '${current_item}',
                            'gross_pay': '${gross_pay}',
                            'tax_rate': '${current_item.tax_rate}',
                            'pension_rate': '${current_item.pension_rate}'
                        }
                    },
                    {
                        'step_type': 'function',
                        'name': 'Calculate Net Pay',
                        'function': 'calculate_net_pay',
                        'params': {
                            'gross_pay': '${gross_pay}',
                            'total_deductions': '${total_deductions}'
                        }
                    }
                ]
            }
        },
        {
            'order': 4,
            'step_type': 'action',
            'name': 'Generate Payroll Report',
            'description': 'Create comprehensive payroll summary',
            'function': 'generate_payroll_report',
            'params': {
                'payroll_data': '${step_3_results}',
                'period': '${current_month}'
            }
        },
        {
            'order': 5,
            'step_type': 'validation',
            'name': 'Audit Sample Calculations',
            'description': 'Random audit of 5% of payroll calculations',
            'function': 'audit_payroll_calculations',
            'params': {
                'payroll_data': '${step_3_results}',
                'sample_percentage': 0.05
            },
            'on_fail': 'escalate'
        },
        {
            'order': 6,
            'step_type': 'approval',
            'name': 'Finance Manager Approval',
            'description': 'First approval of payroll',
            'config': {
                'approver_role': 'finance_manager',
                'approval_message': 'Approve payroll for ${employee_count} employees, total: ${total_net_pay}',
                'timeout_hours': 72,
                'show_report': True,
                'require_comment': True
            }
        },
        {
            'order': 7,
            'step_type': 'approval',
            'name': 'Principal Final Approval',
            'description': 'Final authorization for payroll processing',
            'config': {
                'approver_role': 'principal',
                'approval_message': 'Final approval for payroll disbursement',
                'timeout_hours': 48,
                'require_comment': False
            }
        },
        {
            'order': 8,
            'step_type': 'action',
            'name': 'Create Payroll Transactions',
            'description': 'Generate GL transactions for payroll',
            'function': 'create_payroll_transactions',
            'params': {
                'payroll_data': '${step_3_results}',
                'workflow_reference': '${workflow_run.id}'
            }
        },
        {
            'order': 9,
            'step_type': 'action',
            'name': 'Generate Bank File',
            'description': 'Create bank transfer file',
            'function': 'generate_bank_transfer_file',
            'params': {
                'payroll_data': '${step_3_results}',
                'bank_format': 'SWIFT_MT103'
            }
        },
        {
            'order': 10,
            'step_type': 'notification',
            'name': 'Notify for Bank Submission',
            'config': {
                'recipients': ['principal', 'finance_manager'],
                'subject': 'Payroll Ready for Bank Submission',
                'message': 'Payroll file ready. Total amount: ${total_net_pay}',
                'include_attachment': True,
                'attachment': '${bank_file}'
            }
        }
    ]
    
    workflow.save()
    return workflow


# ============================================================================
# 2. DEBTOR MANAGEMENT (AGED RECEIVABLES)
# ============================================================================

def create_debtor_management_workflow():
    """
    Automated debtor reminder sequence based on aging
    30 days: Email reminder
    60 days: Phone call task
    90+ days: Escalation to Principal
    """
    
    workflow = WorkflowTemplate.objects.create(
        name='Debtor Reminder Sequence',
        description='Automated communication sequence for overdue school fees',
        trigger_type='scheduled',
        trigger_config={
            'schedule': 'daily',
            'time': '08:00'
        },
        workflow_type='system',
        access_level='system',
        is_active=True,
        version=1
    )
    
    workflow.steps = [
        {
            'order': 1,
            'step_type': 'query',
            'name': 'Get 30-Day Overdue Accounts',
            'description': 'Students with balances 1-30 days overdue',
            'config': {
                'entity': 'Account',
                'filters': [
                    {'field': 'account_type', 'operator': 'eq', 'value': 'RECEIVABLE'},
                    {'field': 'balance', 'operator': 'gt', 'value': 0},
                    {'field': 'days_overdue', 'operator': 'between', 'value': [1, 30]}
                ]
            }
        },
        {
            'order': 2,
            'step_type': 'loop',
            'name': 'Send 30-Day Reminders',
            'config': {
                'iterate_over': 'step_1_results',
                'sub_steps': [
                    {
                        'step_type': 'action',
                        'name': 'Send Polite Email Reminder',
                        'function': 'send_email',
                        'params': {
                            'recipient': '${current_item.client.email}',
                            'template': 'debtor_reminder_30day',
                            'subject': 'Friendly Reminder: School Fee Payment',
                            'data': {
                                'student_name': '${current_item.client.name}',
                                'balance': '${current_item.balance}',
                                'days_overdue': '${current_item.days_overdue}'
                            }
                        }
                    },
                    {
                        'step_type': 'action',
                        'name': 'Log Communication',
                        'function': 'log_communication_attempt',
                        'params': {
                            'client_id': '${current_item.client.id}',
                            'method': 'email',
                            'category': '30_day_reminder',
                            'status': 'sent'
                        }
                    }
                ]
            }
        },
        {
            'order': 3,
            'step_type': 'query',
            'name': 'Get 60-Day Overdue Accounts',
            'config': {
                'entity': 'Account',
                'filters': [
                    {'field': 'account_type', 'operator': 'eq', 'value': 'RECEIVABLE'},
                    {'field': 'balance', 'operator': 'gt', 'value': 0},
                    {'field': 'days_overdue', 'operator': 'between', 'value': [31, 60]}
                ]
            }
        },
        {
            'order': 4,
            'step_type': 'loop',
            'name': 'Process 60-Day Overdue',
            'config': {
                'iterate_over': 'step_3_results',
                'sub_steps': [
                    {
                        'step_type': 'action',
                        'name': 'Create Phone Call Task',
                        'function': 'create_task',
                        'params': {
                            'assigned_to_role': 'collections_officer',
                            'task_type': 'phone_call',
                            'priority': 'high',
                            'due_date': 'today',
                            'description': 'Call parent regarding ${current_item.balance} overdue for ${current_item.days_overdue} days',
                            'related_client': '${current_item.client.id}'
                        }
                    },
                    {
                        'step_type': 'action',
                        'name': 'Send Formal Email',
                        'function': 'send_email',
                        'params': {
                            'recipient': '${current_item.client.email}',
                            'template': 'debtor_reminder_60day',
                            'subject': 'Urgent: Outstanding School Fee Payment',
                            'data': {
                                'student_name': '${current_item.client.name}',
                                'balance': '${current_item.balance}',
                                'days_overdue': '${current_item.days_overdue}',
                                'payment_options': True
                            }
                        }
                    }
                ]
            }
        },
        {
            'order': 5,
            'step_type': 'query',
            'name': 'Get 90+ Day Overdue Accounts',
            'config': {
                'entity': 'Account',
                'filters': [
                    {'field': 'account_type', 'operator': 'eq', 'value': 'RECEIVABLE'},
                    {'field': 'balance', 'operator': 'gt', 'value': 0},
                    {'field': 'days_overdue', 'operator': 'gte', 'value': 90}
                ]
            }
        },
        {
            'order': 6,
            'step_type': 'loop',
            'name': 'Escalate 90+ Day Overdue',
            'config': {
                'iterate_over': 'step_5_results',
                'sub_steps': [
                    {
                        'step_type': 'action',
                        'name': 'Create Escalation Task',
                        'function': 'create_task',
                        'params': {
                            'assigned_to_role': 'principal',
                            'task_type': 'escalation',
                            'priority': 'critical',
                            'due_date': 'today',
                            'description': 'Account 90+ days overdue: ${current_item.client.name} - ${current_item.balance}. Decision needed on disciplinary action.',
                            'related_client': '${current_item.client.id}'
                        }
                    },
                    {
                        'step_type': 'notification',
                        'name': 'Notify Finance Manager',
                        'config': {
                            'recipient_role': 'finance_manager',
                            'subject': 'Critical: Account Escalation Required',
                            'message': 'Student ${current_item.client.name} has ${current_item.balance} overdue for ${current_item.days_overdue} days'
                        }
                    }
                ]
            }
        }
    ]
    
    workflow.save()
    return workflow


# ============================================================================
# 3. PURCHASE REQUEST APPROVAL WORKFLOW
# ============================================================================

def create_purchase_request_workflow():
    """
    Multi-level approval for purchase requests with budget validation
    Level 1: Department Head (<10,000)
    Level 2: Board Treasurer (≥10,000)
    """
    
    workflow = WorkflowTemplate.objects.create(
        name='Purchase Request Approval',
        description='Multi-level approval workflow for school purchases with budget validation',
        trigger_type='event',
        trigger_config={'event_name': 'expense.purchase_request_created'},
        workflow_type='approval',
        access_level='department',
        is_active=True,
        version=1
    )
    
    workflow.steps = [
        {
            'order': 1,
            'step_type': 'validation',
            'name': 'Validate Purchase Request Data',
            'description': 'Ensure all required fields are present',
            'config': {
                'required_fields': ['department', 'budget_code', 'estimated_cost', 'item_description', 'quantity'],
                'on_fail': 'reject'
            }
        },
        {
            'order': 2,
            'step_type': 'validation',
            'name': 'Check Budget Availability',
            'description': 'Verify funds available in budget line',
            'function': 'check_budget_allocation',
            'params': {
                'budget_code': '${form_data.budget_code}',
                'amount': '${form_data.estimated_cost}'
            },
            'on_fail': 'reject',
            'rejection_message': 'Insufficient funds in budget code ${form_data.budget_code}'
        },
        {
            'order': 3,
            'step_type': 'conditional',
            'name': 'Route Based on Amount',
            'description': 'Different approval paths based on purchase amount',
            'conditions': [
                {
                    'if': '${form_data.estimated_cost} < 10000',
                    'then': 'department_head_approval',
                    'else': 'dual_approval'
                }
            ]
        },
        {
            'order': 4,
            'step_type': 'approval',
            'name': 'Department Head Approval',
            'description': 'Department head reviews and approves request',
            'step_id': 'department_head_approval',
            'config': {
                'approver_role': 'department_head',
                'approval_message': 'Review and approve purchase request for ${form_data.item_description}',
                'timeout_hours': 48,
                'can_delegate': True,
                'require_comment': False
            }
        },
        {
            'order': 5,
            'step_type': 'approval',
            'name': 'Principal Approval',
            'description': 'Principal final approval for larger purchases',
            'step_id': 'dual_approval',
            'config': {
                'approver_role': 'principal',
                'approval_message': 'High-value purchase request (${form_data.estimated_cost})',
                'timeout_hours': 72,
                'require_comment': True
            },
            'skip_if': '${form_data.estimated_cost} < 10000'
        },
        {
            'order': 6,
            'step_type': 'approval',
            'name': 'Board Treasurer Approval',
            'description': 'Board treasurer for amounts ≥10,000',
            'config': {
                'approver_role': 'board_treasurer',
                'approval_message': 'Major capital expenditure approval required',
                'timeout_hours': 120,
                'require_comment': True,
                'attachment_required': True
            },
            'skip_if': '${form_data.estimated_cost} < 10000'
        },
        {
            'order': 7,
            'step_type': 'action',
            'name': 'Generate Purchase Order',
            'description': 'Create official sequenced PO',
            'function': 'create_purchase_order',
            'params': {
                'expense_id': '${form_submission.id}',
                'approved_amount': '${form_data.estimated_cost}',
                'approver_signatures': '${approval_chain}'
            }
        },
        {
            'order': 8,
            'step_type': 'action',
            'name': 'Send PO to Vendor',
            'description': 'Email PO to vendor',
            'function': 'send_purchase_order',
            'params': {
                'vendor_email': '${form_data.vendor_email}',
                'po_reference': '${purchase_order.reference_number}',
                'attachment': '${purchase_order.pdf}'
            }
        },
        {
            'order': 9,
            'step_type': 'notification',
            'name': 'Notify Requestor',
            'description': 'Inform requester of approval',
            'config': {
                'recipient': '${form_submission.created_by}',
                'subject': 'Purchase Request Approved - PO ${purchase_order.reference_number}',
                'template': 'purchase_request_approved'
            }
        }
    ]
    
    workflow.save()
    return workflow
 
 
 #   = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = 
 #   1 0 .   I N V O I C E   B A T C H   A P P R O V A L   W I T H   D I S C O U N T   V I S I B I L I T Y 
 #   = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = 
 
 d e f   c r e a t e _ i n v o i c e _ b a t c h _ a p p r o v a l _ w o r k f l o w ( ) : 
         w o r k f l o w   =   W o r k f l o w T e m p l a t e . o b j e c t s . c r e a t e ( 
                 n a m e = ' I n v o i c e   B a t c h   A p p r o v a l ' , 
                 d e s c r i p t i o n = ' A p p r o v e   b u l k   i n v o i c e   g e n e r a t i o n   w i t h   d i s c o u n t / s c h o l a r s h i p   v i s i b i l i t y ' , 
                 t r i g g e r _ t y p e = ' m a n u a l ' , 
                 w o r k f l o w _ t y p e = ' a p p r o v a l ' , 
                 a c c e s s _ l e v e l = ' a d m i n ' , 
                 i s _ a c t i v e = T r u e , 
                 v e r s i o n = 1 , 
                 r e q u i r e s _ a p p r o v a l = T r u e 
         ) 
         r e t u r n   w o r k f l o w 
  
 