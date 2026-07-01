"""
Expense workflow service

Handles workflow actions for expense approvals
"""
from django.utils import timezone
from django.db import transaction
from common.services.reference_service import ReferenceService


class ExpenseWorkflowService:
    """Handle expense workflow actions"""
    
    @staticmethod
    def handle_expense_validation(workflow_run, context):
        """
        Validate expense request
        
        Context:
          {
            "expense_id": 123,
            "amount": 500.00,
            "category_id": 5,
            "has_receipt": true
          }
        """
        from expenses.models import Expense
        
        expense = Expense.objects.get(id=context['expense_id'])
        
        # Validation checks
        if expense.amount <= 0:
            return {
                'success': False,
                'error': 'Amount must be greater than zero'
            }
        
        if expense.requires_approval and not context.get('has_receipt'):
            return {
                'success': False,
                'error': 'Receipt required for approval'
            }
        
        # Calculate totals
        expense.subtotal = expense.amount
        expense.tax_amount_field = expense.amount * 0  # Calculate tax if needed
        expense.total_amount = expense.subtotal + expense.tax_amount_field
        expense.status = 'submitted'
        expense.save()
        
        return {
            'success': True,
            'amount': expense.total_amount,
            'expense_type': expense.expense_type,
            'next_action': 'route_to_approver'
        }
    
    @staticmethod
    def route_expense_approver(workflow_run, context):
        """Determine expense approver based on amount"""
        from users.models import User
        
        amount = context.get('amount', 0)
        
        # Approval rules based on amount
        if amount < 100:
            role = 'supervisor'
        elif amount < 500:
            role = 'department_manager'
        elif amount < 5000:
            role = 'finance_manager'
        else:
            role = 'cfo'
        
        approver = User.objects.filter(
            role=role,
            branch=workflow_run.branch,
            is_active=True
        ).first()
        
        if not approver:
            # Fallback
            approver = User.objects.filter(
                branch=workflow_run.branch,
                is_active=True
            ).exclude(role='staff').first()
        
        if not approver:
            return {
                'success': False,
                'error': f'No approver found for amount: ${amount}'
            }
        
        return {
            'success': True,
            'approver_id': approver.id,
            'approver_email': approver.email,
            'approver_name': f"{approver.first_name} {approver.last_name}",
            'approval_level': role,
            'next_action': 'wait_for_approval'
        }
    
    @staticmethod
    @transaction.atomic
    def handle_expense_approval(workflow_run, context):
        """
        Process expense approval
        
        Context:
          {
            "expense_id": 123,
            "decision": "approved",
            "approver_id": 45,
            "comments": "Approved"
          }
        """
        from expenses.models import Expense
        
        expense = Expense.objects.select_for_update().get(id=context['expense_id'])
        decision = context['decision']
        approver_id = context['approver_id']
        
        # Update approval chain
        approval_entry = {
            'approver_id': approver_id,
            'decision': decision,
            'comments': context.get('comments', ''),
            'timestamp': timezone.now().isoformat(),
            'level': context.get('approval_level', 'unknown')
        }
        
        if not isinstance(expense.approval_chain, list):
            expense.approval_chain = []
        
        expense.approval_chain.append(approval_entry)
        
        if decision == 'approved':
            expense.status = 'approved'
            expense.approved = True
            expense.approved_by_id = approver_id
            expense.approved_at = timezone.now()
            expense.save()
            
            # Update reference tracking if exists
            if expense.reference_number:
                ReferenceService.update_status(expense.reference_number, 'approved')
            
            # Create accounting entry
            try:
                from expenses.services.accounting_service import ExpenseAccountingService
                result = ExpenseAccountingService.record_expense(
                    expense=expense,
                    payment_account_id=context.get('payment_account_id')
                )
                
                if result.get('success'):
                    expense.is_posted = True
                    expense.posted_at = timezone.now()
                    expense.save()
            except Exception as e:
                # Log error but don't fail workflow
                print(f"Error creating accounting entry: {e}")
            
            return {
                'success': True,
                'message': f'Expense {expense.reference_number} approved',
                'next_action': 'payment_processing'
            }
        
        else:  # rejected
            expense.status = 'rejected'
            expense.save()
            
            # Update reference tracking
            if expense.reference_number:
                ReferenceService.update_status(expense.reference_number, 'rejected')
            
            return {
                'success': True,
                'message': 'Expense rejected',
                'next_action': 'end'
            }
    
    @staticmethod
    def process_payment(workflow_run, context):
        """
        Process expense payment
        
        Can be extended to integrate with payment systems
        """
        from expenses.models import Expense
        
        expense_id = context.get('expense_id')
        expense = Expense.objects.get(id=expense_id)
        
        # Mark as paid
        expense.status = 'paid'
        expense.save()
        
        # Update reference tracking
        if expense.reference_number:
            ReferenceService.update_status(expense.reference_number, 'paid')
        
        return {
            'success': True,
            'message': f'Payment processed for {expense.reference_number}',
            'next_action': 'end'
        }
