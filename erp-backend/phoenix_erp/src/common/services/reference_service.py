"""
Reference generation and tracking service

Generates unique reference numbers and maintains reference chains
"""
from django.db import transaction
from datetime import datetime
from typing import Optional, Dict, Any, TYPE_CHECKING

if TYPE_CHECKING:
    from common.models import ReferenceTracking


class ReferenceService:
    """
    Service for generating and tracking reference numbers
    
    Generates references like:
    - PR-2026-0001 (Purchase Requisition)
    - PO-2026-0045 (Purchase Order)
    - GRN-2026-0123 (Goods Received Note)
    - EXP-2026-0567 (Expense)
    - AP-2026-0234 (Accounts Payable)
    - PAY-2026-0189 (Payment)
    """
    
    PREFIX_MAP = {
        'purchase_requisition': 'PR',
        'purchase_order': 'PO',
        'goods_received_note': 'GRN',
        'expense': 'EXP',
        'prepaid_expense': 'PREP',
        'prepaid_voucher': 'VOUCH',
        'accounts_payable': 'AP',
        'payment': 'PAY',
        'asset': 'AST',
        'invoice': 'INV',
        'allocation': 'ALLOC',
        'stock_adjustment_request': 'SADJ',
        'payroll': 'PROLL',
        'leave_request': 'LR',
    }
    
    @staticmethod
    @transaction.atomic
    def generate_reference(module: str, model_name: str, tenant, branch) -> str:
        """
        Generate unique reference number using atomic database operations
        
        Format: PREFIX-YYYY-NNNN
        Example: PR-2026-0001
        
        This method is thread-safe and prevents race conditions by using
        SELECT FOR UPDATE to lock rows during number generation.
        
        Args:
            module: Module name (procurement, expenses, etc.)
            model_name: Model name (purchase_requisition, expense, etc.)
            tenant: Tenant instance
            branch: Branch instance
            
        Returns:
            Unique reference number
        """
        from common.models import ReferenceTracking
        from django.db import connection
        import logging
        
        logger = logging.getLogger(__name__)
        prefix = ReferenceService.PREFIX_MAP.get(model_name.lower(), 'REF')
        year = datetime.now().year
        base_pattern = f"{prefix}-{year}"
        
        # Use SELECT FOR UPDATE to lock rows and prevent race conditions
        # This ensures only one transaction can read and increment at a time
        last_ref_tracking = ReferenceTracking.objects.select_for_update().filter(
            module=module,
            model_name=model_name,
            tenant=tenant,
            reference_number__startswith=base_pattern
        ).order_by('-reference_number').first()
        
        last_num_from_tracking = 0
        if last_ref_tracking:
            try:
                last_num_from_tracking = int(last_ref_tracking.reference_number.split('-')[-1])
            except (ValueError, IndexError):
                logger.warning(f"Failed to parse reference number: {last_ref_tracking.reference_number}")
                pass
        
        # Also check the actual model table to prevent duplicates
        # This is crucial when reference is generated before saving (in serializers)
        last_num_from_model = 0
        try:
            from django.apps import apps
            
            # Convert snake_case to PascalCase for Django model lookup
            model_class_name = ''.join(word.capitalize() for word in model_name.split('_'))
            
            try:
                model_class = apps.get_model(module, model_class_name)
            except LookupError:
                logger.debug(f"Model {module}.{model_class_name} not found, trying {model_name}")
                try:
                    model_class = apps.get_model(module, model_name)
                except LookupError:
                    model_class = None
            
            if model_class and hasattr(model_class, 'objects'):
                # Determine which field contains the reference number
                # Common field names: reference_number, request_number, voucher_number, invoice_number, etc.
                ref_field = None
                for field_name in ['reference_number', 'request_number', 'voucher_number', 'invoice_number', 'number']:
                    if hasattr(model_class, field_name):
                        ref_field = field_name
                        break
                
                if ref_field:
                    # IMPORTANT: use a plain QuerySet that bypasses ALL custom managers
                    # (OwnerBranchManager applies soft-delete and tenant filtering which
                    # can hide existing records and cause the same number to be re-issued).
                    from django.db.models.query import QuerySet as PlainQuerySet
                    plain_qs = PlainQuerySet(model=model_class)
                    
                    last_model_ref = plain_qs.filter(
                        **{f'{ref_field}__startswith': base_pattern}
                    ).order_by(f'-{ref_field}').first()
                    
                    if last_model_ref:
                        try:
                            ref_value = getattr(last_model_ref, ref_field)
                            last_num_from_model = int(ref_value.split('-')[-1])
                            logger.debug(f"Found last model reference: {ref_value}, number: {last_num_from_model}")
                        except (ValueError, IndexError, AttributeError):
                            logger.warning(f"Failed to parse model reference from {ref_field}")
                            pass
        except Exception as e:
            logger.debug(f"Model lookup failed for {module}.{model_name}: {str(e)}")
            pass
        
        # Use the higher number to ensure uniqueness
        new_num = max(last_num_from_tracking, last_num_from_model) + 1
        generated = f"{prefix}-{year}-{new_num:04d}"
        logger.info(
            f"generate_reference: module={module}, model={model_name}, "
            f"tracking_max={last_num_from_tracking}, model_max={last_num_from_model}, "
            f"generated={generated}"
        )
        return generated
    
    @staticmethod
    @transaction.atomic
    def register_reference(
        reference_number: str,
        module: str,
        model_name: str,
        object_id: int,
        tenant,
        branch,
        created_by,
        origin_reference: Optional[str] = None,
        parent_reference: Optional[str] = None,
        workflow_run = None,
        status: str = '',
        amount: Optional[float] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> 'ReferenceTracking':
        """
        Register reference in tracking table
        
        Args:
            reference_number: The unique reference number
            module: Module name
            model_name: Model name
            object_id: Primary key of the object
            tenant: Tenant instance
            branch: Branch instance
            created_by: User who created this
            origin_reference: Original reference (if not origin, provide this)
            parent_reference: Immediate parent reference
            workflow_run: Associated workflow run
            status: Current status
            amount: Document amount
            metadata: Additional metadata dict
            
        Returns:
            Created ReferenceTracking instance
        """
        from common.models import ReferenceTracking
        
        # If no origin provided, this IS the origin
        if not origin_reference:
            origin_reference = reference_number
        
        return ReferenceTracking.objects.create(
            reference_number=reference_number,
            module=module,
            model_name=model_name,
            object_id=object_id,
            origin_reference=origin_reference,
            parent_reference=parent_reference or '',
            workflow_run=workflow_run,
            status=status,
            amount=amount,
            metadata=metadata or {},
            tenant=tenant,
            branch=branch,
            created_by=created_by
        )
    
    @staticmethod
    def trace_reference(reference_number: str) -> Dict[str, Any]:
        """
        Get complete chain for a reference
        
        Args:
            reference_number: Reference to trace
            
        Returns:
            Dictionary with origin and chain information
        """
        from common.models import ReferenceTracking
        
        # Find this reference
        ref = ReferenceTracking.objects.filter(
            reference_number=reference_number
        ).first()
        
        if not ref:
            return {'error': 'Reference not found'}
        
        # Find all related references in the chain
        chain = ReferenceTracking.objects.filter(
            origin_reference=ref.origin_reference
        ).order_by('created_at').select_related('workflow_run', 'created_by')
        
        return {
            'reference': reference_number,
            'origin': ref.origin_reference,
            'module': ref.module,
            'status': ref.status,
            'chain': [
                {
                    'reference': r.reference_number,
                    'module': r.module,
                    'model': r.model_name,
                    'status': r.status,
                    'amount': r.amount if r.amount else None,
                    'created_at': r.created_at.isoformat(),
                    'created_by': r.created_by.email if r.created_by else None,
                    'workflow_run_id': r.workflow_run_id,
                    'metadata': r.metadata
                }
                for r in chain
            ]
        }
    
    @staticmethod
    def get_children(reference_number: str):
        """Get all documents created from this reference"""
        from common.models import ReferenceTracking
        
        return ReferenceTracking.objects.filter(
            parent_reference=reference_number
        ).order_by('created_at')
    
    @staticmethod
    def update_status(reference_number: str, status: str):
        """Update status of a reference"""
        from common.models import ReferenceTracking
        
        ReferenceTracking.objects.filter(
            reference_number=reference_number
        ).update(status=status)
