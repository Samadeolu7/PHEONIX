# incomes/services/discount_workflow_service.py
"""
Service for executing workflows during discount eligibility and approval
"""
import logging
from typing import Dict, List, Optional, Tuple
from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from django.core.exceptions import ValidationError

from automations.models import WorkflowRun
from automations.workflow_executor import WorkflowExecutor
from incomes.models_discount import DiscountProgram, DiscountApplication
from clients.models import Client

logger = logging.getLogger(__name__)


class DiscountWorkflowService:
    """
    Handles workflow execution for discount eligibility and approval
    """
    
    @staticmethod
    def validate_eligibility_with_workflow(
        program: DiscountProgram,
        client: Client,
        invoice_amount: Decimal,
        context_data: Optional[Dict] = None
    ) -> Tuple[bool, Optional[str], Optional[Dict]]:
        """
        Run eligibility workflow if configured
        
        Args:
            program: DiscountProgram to validate
            client: Client to check eligibility for
            invoice_amount: Total invoice amount
            context_data: Additional context data
        
        Returns:
            Tuple of (is_eligible, error_message, workflow_result)
        """
        if not program.eligibility_workflow:
            # No workflow configured, pass through
            return (True, None, None)
        
        try:
            # Build workflow context
            workflow_context = {
                'discount_program': {
                    'id': program.id,
                    'code': program.program_code,
                    'name': program.name,
                    'type': program.program_type,
                    'discount_type': program.discount_type,
                    'discount_value': float(program.discount_value),
                    'eligibility_criteria': program.eligibility_criteria,
                },
                'client': {
                    'id': client.id,
                    'code': client.client_id,
                    'name': str(client),
                    'classification_code': client.classification.code if client.classification else None,
                    'metadata': client.metadata,
                },
                'invoice': {
                    'amount': float(invoice_amount),
                },
                'timestamp': timezone.now().isoformat(),
            }
            
            # Merge additional context
            if context_data:
                workflow_context.update(context_data)
            
            # Ensure all dates are serialized as strings for JSON
            for key in ['invoice_date', 'due_date', 'start_date', 'end_date']:
                if key in workflow_context and hasattr(workflow_context[key], 'isoformat'):
                    workflow_context[key] = workflow_context[key].isoformat()
            
            # Create workflow run
            workflow_run = WorkflowRun.objects.create(
                template=program.eligibility_workflow,
                context=workflow_context,
                owner=program.owner,
                branch=program.branch,
                created_by=client.created_by
            )
            
            # Execute workflow with timeout
            executor = WorkflowExecutor(workflow_run)
            result = executor.execute()
            
            # Check execution status
            workflow_run.refresh_from_db()
            
            if workflow_run.status == 'completed':
                # Extract eligibility decision from result
                is_eligible = result.get('eligible', False)
                reason = result.get('reason', '')
                
                logger.info(
                    f"Eligibility workflow completed for {program.program_code}: "
                    f"eligible={is_eligible}, client={client.client_id}"
                )
                
                return (is_eligible, reason if not is_eligible else None, result)
            
            elif workflow_run.status == 'failed':
                error_msg = workflow_run.error_message or "Workflow execution failed"
                logger.error(
                    f"Eligibility workflow failed for {program.program_code}: {error_msg}"
                )
                
                # If workflow is required, fail eligibility
                if program.eligibility_workflow_required:
                    return (False, error_msg, None)
                else:
                    # If workflow is optional, log and pass through
                    return (True, None, None)
            
            else:
                # Unexpected status
                error_msg = f"Workflow ended with unexpected status: {workflow_run.status}"
                logger.warning(error_msg)
                
                if program.eligibility_workflow_required:
                    return (False, error_msg, None)
                else:
                    return (True, None, None)
        
        except Exception as e:
            logger.exception(
                f"Exception during eligibility workflow execution for {program.program_code}"
            )
            
            if program.eligibility_workflow_required:
                return (False, str(e), None)
            else:
                # Optional workflow, don't fail eligibility on exception
                return (True, None, None)
    
    @staticmethod
    def get_discount_preview(
        program: DiscountProgram,
        client_classification_code: str,
        academic_term_id: int
    ) -> Dict:
        """
        Get preview of discount impact for approval workflow
        
        Args:
            program: DiscountProgram to preview
            client_classification_code: Class/classification code to preview for
            academic_term_id: Academic term ID
        
        Returns:
            Dictionary with preview statistics
        """
        from clients.models import Client, ClientClassification
        from incomes.models import Invoice
        from incomes.services.receivables_service import ReceivablesService
        
        # Get clients in classification
        try:
            classification = ClientClassification.objects.get(
                code=client_classification_code,
                owner=program.owner,
                branch=program.branch
            )
            clients = Client.objects.filter(
                classification=classification,
                is_deleted=False
            )
        except ClientClassification.DoesNotExist:
            return {
                'error': f'Classification {client_classification_code} not found',
                'eligible_count': 0,
                'total_discount': 0,
                'clients': []
            }
        
        # Get the academic term
        from incomes.models_calendar import AcademicTerm
        try:
            term = AcademicTerm.objects.get(id=academic_term_id)
        except AcademicTerm.DoesNotExist:
            return {
                'program_code': program.program_code,
                'classification_code': client_classification_code,
                'eligible_count': 0,
                'total_discount': 0,
                'clients': [],
                'error': 'Academic term not found'
            }
        
        service = ReceivablesService()
        
        eligible_clients = []
        total_discount = Decimal('0.00')
        
        # Get fee structures for the classification
        from incomes.models import FeeStructure
        fee_structures = FeeStructure.objects.filter(
            is_active=True,
            branch=clients[0].branch if clients else None
        )
        
        for client in clients:
            # Calculate fees for this student
            fee_items = service.calculate_applicable_fees(
                student=client,
                fee_structures=list(fee_structures),
                academic_year=term.academic_year.name,
                term=term.name
            )
            
            if not fee_items:
                continue
                
            # Check eligibility with calculated fees
            applicable_discounts = service.calculate_applicable_discounts(
                student=client,
                fee_items=fee_items,
                invoice_date=str(timezone.now().date()),
                due_date=str(term.payment_due_date),
                academic_year=term.academic_year.name,
                term=term.name
            )
            
            # Check if this program is in applicable discounts
            matching_discount = next(
                (d for d in applicable_discounts if d['program'].id == program.id),
                None
            )
            
            if matching_discount:
                discount_amount = matching_discount['discount_amount']
                eligible_clients.append({
                    'client_id': client.id,
                    'client_code': client.client_id,
                    'client_name': str(client),
                    'discount_amount': float(discount_amount),
                    'criteria_matched': matching_discount.get('criteria_matched', [])
                })
                total_discount += discount_amount
        
        return {
            'program_code': program.program_code,
            'program_name': program.name,
            'classification_code': client_classification_code,
            'eligible_count': len(eligible_clients),
            'total_discount': float(total_discount),
            'budget_remaining': float(program.budget_remaining),
            'will_exceed_budget': (
                program.budget_allocated > 0 and 
                total_discount > program.budget_remaining
            ),
            'clients': eligible_clients[:100],  # Limit to first 100 for preview
            'total_clients_checked': clients.count()
        }
    
    @staticmethod
    @transaction.atomic
    def create_approval_workflow_run(
        discount_applications: List[DiscountApplication],
        approval_context: Optional[Dict] = None
    ) -> Optional[WorkflowRun]:
        """
        Create workflow run for discount approval
        
        Args:
            discount_applications: List of applications to approve
            approval_context: Additional context data
        
        Returns:
            WorkflowRun instance if workflow configured, None otherwise
        """
        if not discount_applications:
            return None
        
        # Get program from first application (assume all same program)
        program = discount_applications[0].program
        
        if not program.approval_workflow:
            # No approval workflow configured
            return None
        
        # Build approval context
        applications_data = []
        total_discount = Decimal('0.00')
        
        for app in discount_applications:
            discount_amount = app.actual_discount_value
            applications_data.append({
                'id': app.id,
                'application_number': app.application_number,
                'client_id': app.client.id,
                'client_code': app.client.client_id,
                'client_name': str(app.client),
                'discount_amount': float(discount_amount),
                'reason': app.reason,
                'application_date': app.application_date.isoformat(),
            })
            total_discount += discount_amount
        
        workflow_context = {
            'approval_request': {
                'program_code': program.program_code,
                'program_name': program.name,
                'program_type': program.program_type,
                'application_count': len(discount_applications),
                'total_discount': float(total_discount),
                'budget_remaining': float(program.budget_remaining),
                'will_exceed_budget': (
                    program.budget_allocated > 0 and 
                    total_discount > program.budget_remaining
                ),
            },
            'applications': applications_data,
            'timestamp': timezone.now().isoformat(),
        }
        
        # Merge additional context
        if approval_context:
            workflow_context.update(approval_context)
        
        # Create workflow run
        workflow_run = WorkflowRun.objects.create(
            template=program.approval_workflow,
            context=workflow_context,
            status='awaiting_approval',
            owner=program.owner,
            branch=program.branch,
            created_by=discount_applications[0].created_by
        )
        
        logger.info(
            f"Created approval workflow run {workflow_run.run_reference} "
            f"for {len(discount_applications)} discount applications"
        )
        
        return workflow_run
    
    @staticmethod
    def validate_workflow_steps(workflow_definition: Dict) -> List[str]:
        """
        Validate that workflow only contains allowed step types
        
        Args:
            workflow_definition: Workflow definition JSON
        
        Returns:
            List of validation errors (empty if valid)
        """
        errors = []
        allowed_step_types = ['query', 'calculate', 'loop', 'condition', 'approval']
        
        steps = workflow_definition.get('steps', [])
        
        for step in steps:
            step_id = step.get('id', 'unknown')
            step_type = step.get('type', '')
            
            if step_type not in allowed_step_types:
                errors.append(
                    f"Step '{step_id}' has invalid type '{step_type}'. "
                    f"Only {', '.join(allowed_step_types)} steps are allowed."
                )
            
            if step_type == 'transaction':
                errors.append(
                    f"Step '{step_id}' is a transaction step. "
                    f"Transaction steps are not allowed in discount eligibility workflows."
                )
        
        return errors
