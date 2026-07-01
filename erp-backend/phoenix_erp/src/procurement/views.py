# procurement/views.py
"""
API views for procurement management

PROCUREMENT WORKFLOWS:

1. REQUISITION-TO-PO WORKFLOW (Recommended):
   a) Create PR: POST /api/procurement/requisitions/create_with_workflow/
      - Creates PR with items
      - Triggers approval workflow
      - Returns PR and workflow_run_id
   
   b) Approve PR: Handled by workflow system at /api/automations/approvals/
   
   c) Convert to PO: POST /api/procurement/requisitions/{id}/convert-to-po/
      - Converts approved PR to PO
      - Copies all items from PR
      - Marks PR as 'po_created'

2. DIRECT PO CREATION (No PR):
   a) Create PO directly: POST /api/procurement/orders/
      Body: {
        "supplier": 1,
        "order_date": "2026-01-11",
        "delivery_location": 1,
        "items": [
          {
            "item": 1,
            "quantity": 10,
            "unit_price": "50.00"
          }
        ]
      }
      - Creates PO with items in one request
      - Use PurchaseOrderDetailSerializer which handles nested items

3. RECEIVING GOODS:
   a) Create GRN: POST /api/procurement/grn/
   b) Inspect: POST /api/procurement/grn/{id}/inspect/
   c) Post to inventory: POST /api/procurement/grn/{id}/post/
"""
from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from decimal import Decimal

from .models import (
    Supplier, SupplierDocument, PurchaseRequisition, PurchaseRequisitionItem,
    PurchaseOrder, GoodsReceivedNote, PurchaseReturn, SupplierQuote,
    ProcurementConfig
)
from .serializers import (
    SupplierSerializer, SupplierDocumentSerializer,
    PurchaseRequisitionSerializer,
    PurchaseOrderSerializer, PurchaseOrderDetailSerializer,
    GoodsReceivedNoteSerializer, PurchaseReturnSerializer,
    SupplierQuoteSerializer, ProcurementConfigSerializer,
    ConvertToPOSerializer
)
from inventory.stock_service import InventoryService, ProcurementService
from common.views import ScopedModelViewSet
from common.approval_permissions import IsApprover
from common.services.reference_service import ReferenceService
from common.models import ReferenceTracking
from automations.models import WorkflowTemplate, WorkflowRun

# Import drf-spectacular for OpenAPI documentation
try:
    from drf_spectacular.utils import extend_schema, OpenApiParameter, OpenApiResponse
    HAS_SPECTACULAR = True
except ImportError:
    HAS_SPECTACULAR = False
    # Fallback decorator that does nothing
    def extend_schema(*args, **kwargs):
        def decorator(func):
            return func
        return decorator

import logging
logger = logging.getLogger(__name__)


class SupplierViewSet(ScopedModelViewSet):
    """
    API endpoint for suppliers
    """
    serializer_class = SupplierSerializer
    permission_classes = [IsAuthenticated]
    queryset = Supplier.objects.none()  # For schema generation
    
    def get_queryset(self):
        # Protect against schema generation with AnonymousUser
        if getattr(self, 'swagger_fake_view', False):
            return Supplier.objects.none()
        
        return Supplier.objects.filter(
            branch=self.request.user.branch
        )
    
    def perform_create(self, serializer):
        """Create supplier with auto-generated code"""
        from django.db import IntegrityError
        from rest_framework.exceptions import ValidationError
        import random
        
        # Generate unique supplier code
        max_attempts = 10
        for attempt in range(max_attempts):
            # Generate format: SUP-YYYYMMDD-XXXX
            from datetime import datetime
            date_str = datetime.now().strftime('%Y%m%d')
            random_part = f"{random.randint(1000, 9999)}"
            supplier_code = f"SUP-{date_str}-{random_part}"
            
            # Check if code exists
            if not Supplier.objects.filter(supplier_code=supplier_code).exists():
                try:
                    serializer.save(
                        supplier_code=supplier_code,
                        owner=self.request.user,
                        branch=self.request.user.branch,
                        tenant=getattr(self.request.user, 'tenant', None)
                    )
                    return
                except IntegrityError as e:
                    if 'supplier_code' in str(e) and attempt < max_attempts - 1:
                        continue  # Try again with new code
                    raise ValidationError({
                        'supplier_code': 'Failed to generate unique supplier code. Please try again.'
                    })
        
        raise ValidationError({
            'supplier_code': 'Unable to generate unique supplier code after multiple attempts.'
        })
    
    @action(detail=True, methods=['get'])
    def performance(self, request, pk=None):
        """Get supplier performance metrics"""
        supplier = self.get_object()
        
        # Calculate metrics
        total_pos = supplier.purchase_orders.count()
        completed_pos = supplier.purchase_orders.filter(
            status='received'
        ).count()
        
        avg_delivery_time = None  # Calculate from PO vs GRN dates
        
        return Response({
            'supplier': self.get_serializer(supplier).data,
            'metrics': {
                'total_purchase_orders': total_pos,
                'completed_orders': completed_pos,
                'completion_rate': (completed_pos / total_pos * 100) if total_pos > 0 else 0,
                'average_delivery_time_days': avg_delivery_time
            }
        })


class SupplierDocumentViewSet(ScopedModelViewSet):
    """
    API endpoint for supplier document management.
    Supports upload, list, retrieve, and delete of supplier documents.
    """
    serializer_class = SupplierDocumentSerializer
    permission_classes = [IsAuthenticated]
    queryset = SupplierDocument.objects.none()

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return SupplierDocument.objects.none()

        qs = SupplierDocument.objects.filter(
            branch=self.request.user.branch
        ).select_related('supplier', 'uploaded_by')

        supplier_id = self.request.query_params.get('supplier')
        if supplier_id:
            qs = qs.filter(supplier_id=supplier_id)

        category = self.request.query_params.get('category')
        if category:
            qs = qs.filter(category=category)

        return qs.order_by('-created_at')

    def perform_create(self, serializer):
        serializer.save(
            uploaded_by=self.request.user,
            owner=self.request.user,
            branch=self.request.user.branch,
        )

    @action(detail=False, methods=['get'])
    def categories(self, request):
        """Return the list of document category choices"""
        return Response([
            {'value': value, 'label': label}
            for value, label in SupplierDocument.CATEGORY_CHOICES
        ])


class PurchaseRequisitionViewSet(ScopedModelViewSet):
    """
    API endpoint for purchase requisitions
    """
    serializer_class = PurchaseRequisitionSerializer
    permission_classes = [IsAuthenticated]
    queryset = PurchaseRequisition.objects.none()  # For schema generation
    permission_module = 'procurement'
    permission_page = 'purchase-requisitions'
    
    def get_queryset(self):
        # Protect against schema generation with AnonymousUser
        if getattr(self, 'swagger_fake_view', False):
            return PurchaseRequisition.objects.none()
        
        # Filter by branch (which inherently filters by tenant through branch.owner)
        # This works even when requested_by is None
        return PurchaseRequisition.objects.filter(
            branch=self.request.user.branch
        ).select_related(
            'requested_by', 'approved_by', 'branch'
        ).prefetch_related('items', 'items__item')
    
    def perform_create(self, serializer):
        """Create PR with auto-generated number"""
        from django.db import IntegrityError
        from rest_framework.exceptions import ValidationError
        from datetime import datetime
        import random
        
        # Generate unique PR number
        max_attempts = 10
        for attempt in range(max_attempts):
            date_str = datetime.now().strftime('%Y%m%d')
            random_part = f"{random.randint(1000, 9999)}"
            pr_number = f"PR-{date_str}-{random_part}"
            
            if not PurchaseRequisition.objects.filter(pr_number=pr_number).exists():
                try:
                    serializer.save(
                        pr_number=pr_number,
                        owner=self.request.user,
                        branch=self.request.user.branch,
                        tenant=getattr(self.request.user, 'tenant', None)
                    )
                    return
                except IntegrityError as e:
                    if 'pr_number' in str(e) and attempt < max_attempts - 1:
                        continue
                    raise ValidationError({
                        'pr_number': 'Failed to generate unique PR number. Please try again.'
                    })
        
        raise ValidationError({
            'pr_number': 'Unable to generate unique PR number after multiple attempts.'
        })
    
    def get_permissions(self):
        """Delegate to ScopedModelViewSet; PermissionResolver handles approve/reject gating."""
        return super().get_permissions()

    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        "Submit purchase requisition for approval"
        requisition = self.get_object()
        
        if requisition.status != 'draft':
            return Response(
                {'error': 'Only draft requisitions can be submitted'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        requisition.status = 'submitted'
        requisition.save()
        
        # Use serializer with items included
        serializer = PurchaseRequisitionSerializer(requisition, context={'request': request})
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def verify_invoice(self, request, pk=None):
        """
        Verify vendor invoice details for PR (required before approval).
        Admin/Finance fills in vendor invoice information.
        """
        requisition = self.get_object()
        
        if requisition.status not in ['draft', 'submitted']:
            return Response(
                {'error': 'Can only verify invoices for draft or submitted requisitions'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Update invoice fields
        requisition.vendor_invoice_number = request.data.get('vendor_invoice_number', '')
        requisition.vendor_invoice_date = request.data.get('vendor_invoice_date')
        requisition.vendor_invoice_amount = request.data.get('vendor_invoice_amount')
        
        # Handle file upload if present
        if 'vendor_invoice_file' in request.FILES:
            requisition.vendor_invoice_file = request.FILES['vendor_invoice_file']
        
        requisition.invoice_verified_by = request.user
        requisition.invoice_verified_at = timezone.now()
        requisition.save()
        
        serializer = PurchaseRequisitionSerializer(requisition, context={'request': request})
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """
        Approve purchase requisition.
        """
        try:
            from permissions.services import PermissionResolver
            effective = PermissionResolver.resolve(
                request.user, module='procurement', page='purchase-requisitions', action='approve',
            )
            if not effective.can_approve:
                return Response(
                    {'detail': 'You do not have permission to approve purchase requisitions.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
        except Exception:
            pass  # Fail-open during rollout

        requisition = self.get_object()

        # Approval limit check against requisition total
        try:
            from permissions.services import PermissionResolver
            from decimal import Decimal as _Decimal
            effective = PermissionResolver.resolve(
                request.user, module='procurement', page='purchase-requisitions', action='approve',
            )
            if effective.approval_limit is not None:
                total = getattr(requisition, 'total_amount', None) or getattr(requisition, 'estimated_total', None) or 0
                if _Decimal(str(total)) > _Decimal(str(effective.approval_limit)):
                    return Response(
                        {'detail': f'Requisition total {total} exceeds your approval limit of {effective.approval_limit}. Please escalate to a supervisor.'},
                        status=status.HTTP_403_FORBIDDEN,
                    )
        except Exception:
            pass

        if requisition.status != 'submitted':
            return Response(
                {'error': 'Only submitted requisitions can be approved'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Change status to approved (ignore request body to avoid validation issues)
        requisition.status = 'approved'
        requisition.approved_by = request.user
        requisition.approved_at = timezone.now()
        requisition.save()

        # Notify the requester that their PR was approved
        try:
            from notifications.services import NotificationService
            notification_service = NotificationService()
            if getattr(requisition, 'requested_by', None):
                notification_service.send_from_template(
                    template_code='pr_approved',
                    recipient=requisition.requested_by,
                    context={
                        'pr_number': getattr(requisition, 'pr_number', str(requisition.pk)),
                        'approved_by': request.user.get_full_name() or request.user.username,
                    },
                    owner=request.user,
                    branch=getattr(request.user, 'branch', None),
                    related_object=requisition,
                    channels=['in_app'],
                )
        except Exception as e:
            logger.warning(f"PR approval notification failed (non-blocking): {e}")

        # Use serializer with items included
        serializer = PurchaseRequisitionSerializer(requisition, context={'request': request})
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """Reject purchase requisition"""
        try:
            from permissions.services import PermissionResolver
            effective = PermissionResolver.resolve(
                request.user, module='procurement', page='purchase-requisitions', action='reject',
            )
            if not effective.can_approve:
                return Response(
                    {'detail': 'You do not have permission to reject purchase requisitions.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
        except Exception:
            pass  # Fail-open during rollout

        requisition = self.get_object()

        if requisition.status not in ('submitted', 'pending'):
            return Response(
                {'error': f'Cannot reject a requisition with status "{requisition.status}". Only submitted requisitions can be rejected.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        
        requisition.status = 'rejected'
        requisition.rejection_reason = request.data.get('reason', '')
        requisition.save()

        # Notify the requester that their PR was rejected
        try:
            from notifications.services import NotificationService
            notification_service = NotificationService()
            if getattr(requisition, 'requested_by', None):
                notification_service.send_from_template(
                    template_code='pr_rejected',
                    recipient=requisition.requested_by,
                    context={
                        'pr_number': getattr(requisition, 'pr_number', str(requisition.pk)),
                        'rejected_by': request.user.get_full_name() or request.user.username,
                        'reason': requisition.rejection_reason or 'No reason provided',
                    },
                    owner=request.user,
                    branch=getattr(request.user, 'branch', None),
                    related_object=requisition,
                    channels=['in_app'],
                )
        except Exception as e:
            logger.warning(f"PR rejection notification failed (non-blocking): {e}")

        # Use serializer with items included
        serializer = PurchaseRequisitionSerializer(requisition, context={'request': request})
        return Response(serializer.data)
    
    @action(detail=False, methods=['post'])
    def create_with_workflow(self, request):
        """
        Create a purchase requisition and trigger approval workflow.
        
        POST /api/procurement/requisitions/create_with_workflow/
        
        Body:
        {
            "department": "IT",
            "purpose": "New laptops for development team",
            "required_by_date": "2026-02-15",
            "items": [
                {
                    "item_description": "Dell Laptop XPS 15",
                    "quantity": 5,
                    "unit_price": 1200.00,
                    "specifications": "i7, 16GB RAM, 512GB SSD"
                }
            ]
        }
        
        Returns:
        {
            "success": true,
            "pr_id": 123,
            "pr_number": "PR-2026-0001",
            "workflow_run_id": 456,
            "status": "submitted",
            "estimated_total": 6000.00
        }
        """
        try:
            with transaction.atomic():
                # Get user's branch for reference generation
                branch = getattr(request.user, 'branch', None)
                
                # Generate unique PR number
                from datetime import datetime
                import random
                
                max_attempts = 10
                pr_number = None
                
                for attempt in range(max_attempts):
                    date_str = datetime.now().strftime('%Y%m%d')
                    random_part = f"{random.randint(1000, 9999)}"
                    pr_number_candidate = f"PR-{date_str}-{random_part}"
                    
                    if not PurchaseRequisition.objects.filter(pr_number=pr_number_candidate).exists():
                        pr_number = pr_number_candidate
                        break
                
                if pr_number is None:
                    return Response(
                        {
                            'success': False,
                            'message': 'Unable to generate unique PR number. Please try again.'
                        },
                        status=status.HTTP_500_INTERNAL_SERVER_ERROR
                    )
                
                # Create PR (owner and branch auto-filled by BranchScopedModel)
                pr_data = {
                    'pr_number': pr_number,
                    'requested_by': request.user,
                    'department': request.data.get('department'),
                    'purpose': request.data.get('purpose'),
                    'required_by_date': request.data.get('required_by_date'),
                    'status': 'submitted',
                    'owner': request.user,
                    'branch': branch
                }
                
                pr = PurchaseRequisition.objects.create(**pr_data)
                
                # Create PR items from request data
                items = request.data.get('items', [])
                estimated_total = Decimal('0')
                
                for item_data in items:
                    quantity = Decimal(str(item_data.get('quantity', 0)))
                    unit_price = Decimal(str(item_data.get('estimated_unit_price', item_data.get('unit_price', 0))))
                    
                    # Create PR item
                    PurchaseRequisitionItem.objects.create(
                        requisition=pr,
                        item_id=item_data.get('item') if item_data.get('item') else None,
                        description=item_data.get('description', item_data.get('item_description', '')),
                        quantity=quantity,
                        estimated_unit_price=unit_price,
                        notes=item_data.get('notes', '')
                    )
                    
                    estimated_total += quantity * unit_price
                
                # Update PR estimated_total
                pr.estimated_total = estimated_total
                pr.save()
                
                # Register reference
                ReferenceService.register_reference(
                    reference_number=pr_number,
                    module='procurement',
                    model_name='purchase_requisition',
                    object_id=pr.id,
                    origin_reference=pr_number,
                    parent_reference=None,
                    workflow_run=None,  # Will be set when workflow starts
                    status='submitted',
                    amount=estimated_total,
                    metadata={
                        'department': pr_data.get('department', ''),
                        'purpose': pr_data['purpose'],
                        'items_count': len(items)
                    },
                    tenant=request.user.tenant,
                    branch=branch,
                    created_by=request.user
                )
                
                # Update PR with reference
                pr.origin_reference = pr_number
                pr.save()
                
                # Get workflow template
                try:
                    workflow_template = WorkflowTemplate.objects.get(
                        name='PRApprovalStandard',
                        is_active=True
                    )
                except WorkflowTemplate.DoesNotExist:
                    return Response(
                        {
                            'success': False,
                            'message': 'PR approval workflow template not found. Please run setup_pr_workflow command.'
                        },
                        status=status.HTTP_500_INTERNAL_SERVER_ERROR
                    )
                
                # Create workflow run
                workflow_run = WorkflowRun.objects.create(
                    template=workflow_template,
                    owner=request.user,
                    branch=branch,
                    status='queued',
                    context={
                        'pr_id': pr.id,
                        'reference_number': pr_number,
                        'estimated_total': str(estimated_total),
                        'department': pr_data.get('department', ''),
                        'items': items,
                        'triggered_by_user_id': request.user.id,
                        'triggered_by_username': request.user.username
                    }
                )
                
                # Update PR with workflow_run
                pr.workflow_run = workflow_run
                pr.save()
                
                # Update reference tracking with workflow_run
                ReferenceService.update_status(pr_number, 'submitted')
                ref_tracking = ReferenceTracking.objects.get(reference_number=pr_number)
                ref_tracking.workflow_run = workflow_run
                ref_tracking.save()
                
                # Execute workflow asynchronously
                from automations.workflow_executor import WorkflowExecutor
                executor = WorkflowExecutor(workflow_run)
                
                # Execute on transaction commit to ensure PR is saved
                transaction.on_commit(lambda: executor.execute())
                
                return Response({
                    'success': True,
                    'pr_id': pr.id,
                    'pr_number': pr_number,
                    'workflow_run_id': workflow_run.id,
                    'status': pr.status,
                    'estimated_total': estimated_total,
                    'message': 'Purchase requisition created and workflow started'
                })
                
        except Exception as e:
            return Response(
                {
                    'success': False,
                    'message': f'Error creating PR with workflow: {str(e)}'
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        requisition.rejection_reason = request.data.get('reason', '')
        requisition.save()
        
        return Response(self.get_serializer(requisition).data)
    
    @extend_schema(
        request=ConvertToPOSerializer,
        responses={
            201: PurchaseOrderDetailSerializer,
            400: OpenApiResponse(description="Bad request - validation errors or invalid status")
        },
        description="""
        Convert an approved purchase requisition to a purchase order.
        
        **Required fields:**
        - supplier: ID of the supplier
        - delivery_location: ID of the delivery location
        
        **Optional fields:**
        - expected_delivery_date: When delivery is expected
        - order_date: Order date (defaults to today)
        - payment_terms: e.g., "Net 30", "Net 60"
        - contact_person: Contact at supplier
        - contact_phone: Contact phone number
        - contact_email: Contact email
        - notes: Additional notes
        
        **Process:**
        1. Validates PR is in 'approved' status
        2. Creates new PO with provided details
        3. Copies all items from PR to PO
        4. Sets PR status to 'po_created'
        5. Calculates PO totals
        
        **Returns:** Complete PO details with all items
        """
    )
    @action(detail=True, methods=['post'], url_path='convert-to-po')
    def convert_to_po(self, request, pk=None):
        """
        Convert approved purchase requisition to purchase order
        """
        requisition = self.get_object()
        
        if requisition.status != 'approved':
            return Response(
                {'error': 'Only approved requisitions can be converted to PO'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Validate request data using dedicated serializer
        convert_serializer = ConvertToPOSerializer(data=request.data)
        if not convert_serializer.is_valid():
            return Response(
                {
                    'error': 'Validation failed',
                    'details': convert_serializer.errors,
                    'hint': 'Required fields: supplier (int), delivery_location (int)'
                },
                status=status.HTTP_400_BAD_REQUEST
            )
        
        validated_data = convert_serializer.validated_data
        
        # Generate unique PO number
        from datetime import datetime
        import random
        
        max_attempts = 10
        po_number = None
        
        for attempt in range(max_attempts):
            date_str = datetime.now().strftime('%Y%m%d')
            random_part = f"{random.randint(1000, 9999)}"
            po_number_candidate = f"PO-{date_str}-{random_part}"
            
            if not PurchaseOrder.objects.filter(po_number=po_number_candidate).exists():
                po_number = po_number_candidate
                break
        
        if po_number is None:
            return Response(
                {'error': 'Unable to generate unique PO number. Please try again.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        
        # Get selected quote if provided
        selected_quote = validated_data.get('selected_quote')
        
        # If quote is provided, validate it belongs to this requisition
        if selected_quote:
            if selected_quote.requisition_id != requisition.id:
                return Response(
                    {'error': 'Selected quote does not belong to this requisition'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Use quote details for PO
            supplier = selected_quote.supplier
            payment_terms = validated_data.get('payment_terms') or selected_quote.payment_terms
        else:
            # Use provided supplier from request
            supplier = validated_data['supplier']
            payment_terms = validated_data.get('payment_terms', '')
        
        # Create PO from requisition using validated data
        po_data = {
            'requisition': requisition.id,
            'supplier': supplier.id,
            'delivery_location': validated_data['delivery_location'].id,
            'order_date': validated_data.get('order_date', timezone.now().date()),
            'expected_delivery_date': validated_data.get('expected_delivery_date'),
            'payment_terms': payment_terms,
            'custom_payment_terms': validated_data.get('custom_payment_terms', ''),
            'contact_person': validated_data.get('contact_person', ''),
            'contact_phone': validated_data.get('contact_phone', ''),
            'contact_email': validated_data.get('contact_email', ''),
            'notes': validated_data.get('notes', f'Created from PR: {requisition.pr_number}'),
            'status': 'draft'
        }
        
        serializer = PurchaseOrderSerializer(data=po_data, context={'request': request})
        if serializer.is_valid():
            # Pass po_number and selected_quote in save()
            po = serializer.save(
                po_number=po_number,
                owner=request.user,
                branch=request.user.branch,
                selected_quote=selected_quote
            )
            
            # Copy items from quote if available, otherwise from requisition
            from procurement.models import PurchaseOrderItem
            
            if selected_quote:
                # Use quote items (with actual supplier pricing)
                for quote_item in selected_quote.items.all():
                    PurchaseOrderItem.objects.create(
                        purchase_order=po,
                        item=quote_item.item,
                        description=quote_item.description or quote_item.item.name,
                        quantity=quote_item.quantity,
                        unit_price=quote_item.unit_price,
                        discount=Decimal('0'),
                        tax_rate=Decimal('0'),
                        total_price=quote_item.total_price
                    )
            else:
                # Use requisition items (with estimated pricing)
                for req_item in requisition.items.all():
                    PurchaseOrderItem.objects.create(
                        purchase_order=po,
                        item=req_item.item,
                        description=req_item.description or req_item.item.name,
                        quantity=req_item.quantity,
                        unit_price=req_item.estimated_unit_price,
                        discount=Decimal('0'),
                        tax_rate=Decimal('0'),
                        total_price=req_item.quantity * req_item.estimated_unit_price
                    )
            
            # Update requisition status
            requisition.status = 'po_created'
            requisition.save()
            
            # Update quote status if used
            if selected_quote and selected_quote.status != 'selected':
                selected_quote.status = 'selected'
                selected_quote.save()
            
            # Recalculate PO totals
            po.calculate_totals()
            
            return Response(
                {
                    'success': True,
                    'message': f'Successfully converted PR {requisition.pr_number} to PO',
                    'po': PurchaseOrderDetailSerializer(po).data
                },
                status=status.HTTP_201_CREATED
            )
        
        return Response(
            {
                'error': 'Validation failed',
                'details': serializer.errors
            },
            status=status.HTTP_400_BAD_REQUEST
        )


class PurchaseOrderViewSet(ScopedModelViewSet):
    """
    API endpoint for purchase orders

    Uses PurchaseOrderDetailSerializer for create/update to handle nested items.
    Uses PurchaseOrderSerializer for list view for performance.
    """
    permission_classes = [IsAuthenticated]
    queryset = PurchaseOrder.objects.none()  # For schema generation
    permission_module = 'procurement'
    permission_page = 'purchase-orders'

    def get_permissions(self):
        """Delegate to ScopedModelViewSet; PermissionResolver handles approve gating."""
        return super().get_permissions()

    def get_serializer_class(self):
        # Use detail serializer (with items) for these actions
        if self.action in ['retrieve', 'create', 'update', 'partial_update', 'approve', 'reject', 'submit', 'send_to_supplier', 'acknowledge']:
            return PurchaseOrderDetailSerializer
        return PurchaseOrderSerializer
    
    def get_queryset(self):
        # Protect against schema generation with AnonymousUser
        if getattr(self, 'swagger_fake_view', False):
            return PurchaseOrder.objects.none()
        
        # Filter by branch (which inherently filters by tenant through branch.owner)
        queryset = PurchaseOrder.objects.filter(
            branch=self.request.user.branch
        ).select_related('supplier', 'delivery_location', 'branch').prefetch_related('items', 'items__item')
        
        # Filter by status
        status_filter = self.request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        
        # Filter by supplier — accept both ?supplier=X (frontend default) and ?supplier_id=X
        supplier_id = (
            self.request.query_params.get('supplier')
            or self.request.query_params.get('supplier_id')
        )
        if supplier_id:
            queryset = queryset.filter(supplier_id=supplier_id)

        return queryset.order_by('-order_date')
    
    @transaction.atomic
    def perform_create(self, serializer):
        """Create PO with items and calculate totals"""
        from django.db import IntegrityError
        from rest_framework.exceptions import ValidationError
        import random
        from datetime import datetime
        
        # Generate unique PO number
        max_attempts = 10
        po = None
        
        for attempt in range(max_attempts):
            # Generate format: PO-YYYYMMDD-XXXX
            date_str = datetime.now().strftime('%Y%m%d')
            random_part = f"{random.randint(1000, 9999)}"
            po_number = f"PO-{date_str}-{random_part}"
            
            # Check if PO number exists
            if not PurchaseOrder.objects.filter(po_number=po_number).exists():
                try:
                    # PurchaseOrderDetailSerializer handles items creation
                    po = serializer.save(
                        po_number=po_number,
                        owner=self.request.user,
                        branch=self.request.user.branch,
                        tenant=getattr(self.request.user, 'tenant', None)
                    )
                    break
                except IntegrityError as e:
                    if 'po_number' in str(e) and attempt < max_attempts - 1:
                        continue  # Try again with new PO number
                    raise ValidationError({
                        'po_number': 'Failed to generate unique PO number. Please try again.'
                    })
        
        if po is None:
            raise ValidationError({
                'po_number': 'Unable to generate unique PO number after multiple attempts.'
            })
        
        # Calculate totals after items are created
        po.calculate_totals()
    
    @transaction.atomic
    def perform_update(self, serializer):
        """Update PO and recalculate totals"""
        po = serializer.save()
        # Recalculate totals after items are updated
        po.calculate_totals()
    
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve purchase order"""
        try:
            from permissions.services import PermissionResolver
            from decimal import Decimal as _Decimal
            effective = PermissionResolver.resolve(
                request.user, module='procurement', page='purchase-orders', action='approve',
            )
            if not effective.can_approve:
                return Response(
                    {'detail': 'You do not have permission to approve purchase orders.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
        except Exception:
            pass  # Fail-open during rollout

        po = self.get_object()

        # Approval limit check against PO total amount
        try:
            from permissions.services import PermissionResolver
            from decimal import Decimal as _Decimal
            effective = PermissionResolver.resolve(
                request.user, module='procurement', page='purchase-orders', action='approve',
            )
            if effective.approval_limit is not None:
                total = getattr(po, 'total_amount', None) or getattr(po, 'grand_total', None) or 0
                if _Decimal(str(total)) > _Decimal(str(effective.approval_limit)):
                    return Response(
                        {'detail': f'PO total {total} exceeds your approval limit of {effective.approval_limit}. Please escalate to a supervisor.'},
                        status=status.HTTP_403_FORBIDDEN,
                    )
        except Exception:
            pass

        if po.status != 'submitted':
            return Response(
                {'error': 'Only submitted POs can be approved'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        po.status = 'approved'
        po.approved_by = request.user
        po.approved_at = timezone.now()
        po.save()

        # Notify relevant users that the PO was approved
        try:
            from notifications.services import NotificationService
            notification_service = NotificationService()
            # Notify the PO creator / requisition requester
            po_creator = getattr(po, 'created_by', None) or getattr(po, 'owner', None)
            if po_creator and po_creator != request.user:
                notification_service.send_from_template(
                    template_code='po_approved',
                    recipient=po_creator,
                    context={
                        'po_number': getattr(po, 'po_number', str(po.pk)),
                        'approved_by': request.user.get_full_name() or request.user.username,
                        'supplier_name': str(getattr(po, 'supplier', 'N/A')),
                        'total_amount': str(getattr(po, 'total_amount', '0')),
                    },
                    owner=request.user,
                    branch=getattr(request.user, 'branch', None),
                    related_object=po,
                    channels=['in_app'],
                )
        except Exception as e:
            logger.warning(f"PO approval notification failed (non-blocking): {e}")

        return Response(self.get_serializer(po).data)
    
    @action(detail=True, methods=['post'])
    def send_to_supplier(self, request, pk=None):
        """Mark PO as sent to supplier"""
        po = self.get_object()
        
        if po.status not in ['approved', 'sent']:
            return Response(
                {'error': 'PO must be approved before sending'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        po.status = 'sent'
        po.save()
        
        # TODO: Send email to supplier
        
        return Response(self.get_serializer(po).data)
    
    @action(detail=True, methods=['post'])
    def acknowledge(self, request, pk=None):
        """Supplier acknowledges PO"""
        po = self.get_object()
        
        po.status = 'acknowledged'
        po.acknowledged_at = timezone.now()
        po.supplier_po_number = request.data.get('supplier_po_number', '')
        po.save()
        
        return Response(self.get_serializer(po).data)
    
    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Cancel purchase order"""
        po = self.get_object()
        
        if po.status == 'received':
            return Response(
                {'error': 'Cannot cancel a fully received PO'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        po.status = 'cancelled'
        po.save()
        
        return Response(self.get_serializer(po).data)
    
    @action(detail=True, methods=['get'])
    def pending_items(self, request, pk=None):
        """Get items pending receipt"""
        po = self.get_object()
        
        pending = []
        for item in po.items.all():
            if item.quantity_pending > 0:
                pending.append({
                    'id': item.id,
                    'item': {
                        'id': item.item.id,
                        'sku': item.item.sku,
                        'name': item.item.name,
                    },
                    'quantity_ordered': str(item.quantity),
                    'quantity_received': str(item.quantity_received),
                    'quantity_pending': str(item.quantity_pending),
                    'unit_price': str(item.unit_price)
                })
        
        return Response(pending)


class GoodsReceivedNoteViewSet(ScopedModelViewSet):
    """
    API endpoint for goods received notes
    """
    serializer_class = GoodsReceivedNoteSerializer
    permission_classes = [IsAuthenticated]
    queryset = GoodsReceivedNote.objects.none()  # For schema generation
    
    def get_queryset(self):
        # Protect against schema generation with AnonymousUser
        if getattr(self, 'swagger_fake_view', False):
            return GoodsReceivedNote.objects.none()
        
        return GoodsReceivedNote.objects.filter(
            branch=self.request.user.branch
        ).select_related('supplier', 'received_location', 'purchase_order', 'branch').prefetch_related('items', 'items__item')
    
    @transaction.atomic
    def perform_create(self, serializer):
        """
        Create GRN with auto-generated number and MANDATORY posting.
        
        CRITICAL: GRNs are ALWAYS posted immediately to maintain accounting integrity.
        This ensures inventory increases are matched with corresponding liabilities.
        
        The posting process:
        1. Creates GRN with unique number
        2. Calculates total amount
        3. AUTOMATICALLY posts to accounting (Dr: Inventory, Cr: AP)
        4. Updates inventory levels
        5. Creates AccountsPayable record
        
        If posting fails, the entire GRN creation is rolled back (transaction.atomic).
        """
        from django.db import IntegrityError
        from rest_framework.exceptions import ValidationError
        from datetime import datetime
        import random
        import logging
        
        logger = logging.getLogger(__name__)
        
        # Generate unique GRN number
        max_attempts = 10
        grn = None
        
        for attempt in range(max_attempts):
            date_str = datetime.now().strftime('%Y%m%d')
            random_part = f"{random.randint(1000, 9999)}"
            grn_number = f"GRN-{date_str}-{random_part}"
            
            if not GoodsReceivedNote.objects.filter(grn_number=grn_number).exists():
                try:
                    grn = serializer.save(
                        grn_number=grn_number,
                        owner=self.request.user,
                        branch=self.request.user.branch,
                        tenant=getattr(self.request.user, 'tenant', None),
                        received_by=self.request.user
                    )
                    break
                except IntegrityError as e:
                    if 'grn_number' in str(e) and attempt < max_attempts - 1:
                        continue
                    raise ValidationError({
                        'grn_number': 'Failed to generate unique GRN number. Please try again.'
                    })
        
        if grn is None:
            raise ValidationError({
                'grn_number': 'Unable to generate unique GRN number after multiple attempts.'
            })
        
        grn.calculate_total()
        
        # MANDATORY: Post GRN to accounting immediately
        # If this fails, the entire transaction is rolled back due to @transaction.atomic
        from inventory.stock_service import ProcurementService
        try:
            grn, payable = ProcurementService.post_grn(grn, user=self.request.user)
            grn.refresh_from_db()  # Get updated is_posted status
            logger.info(f"GRN {grn.grn_number} created and posted successfully")
        except Exception as e:
            logger.error(f"Failed to post GRN {grn.grn_number}: {str(e)}")
            # Re-raise exception to trigger rollback
            raise ValidationError({
                'posting_error': f'Failed to post GRN to accounting: {str(e)}. GRN creation cancelled.'
            })
    
    @action(detail=True, methods=['post'])
    def post(self, request, pk=None):
        """
        Post GRN to inventory and accounting
        This is the key action that:
        1. Updates inventory levels
        2. Creates accounts payable
        3. Creates journal entries
        """
        grn = self.get_object()
        
        if grn.is_posted:
            return Response(
                {'error': 'GRN already posted'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Check quality status
        if grn.quality_status == 'pending':
            return Response(
                {'error': 'Quality inspection must be completed before posting'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            # Use service to post GRN
            grn, payable = ProcurementService.post_grn(grn, user=request.user)
            
            return Response({
                'success': True,
                'message': 'GRN posted successfully',
                'grn': self.get_serializer(grn).data,
                'accounts_payable_id': payable.id,
                'total_amount': str(grn.total_amount)
            })
        
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def inspect(self, request, pk=None):
        """Complete quality inspection"""
        grn = self.get_object()
        
        grn.quality_status = request.data.get('quality_status', 'passed')
        grn.inspected_by = request.user
        grn.inspection_notes = request.data.get('inspection_notes', '')
        grn.save()
        
        # Update item quality data
        items_data = request.data.get('items', [])
        for item_data in items_data:
            item = grn.items.get(id=item_data['id'])
            item.quantity_accepted = Decimal(item_data.get('quantity_accepted', item.quantity_received))
            item.quantity_rejected = Decimal(item_data.get('quantity_rejected', 0))
            item.condition_notes = item_data.get('condition_notes', '')
            item.rejection_reason = item_data.get('rejection_reason', '')

            # Persist extended quality inspection fields
            quality_data = {}
            for key in (
                'condition_rating', 'visual_inspection', 'packaging_condition',
                'expiry_check', 'batch_verification', 'temperature_check',
            ):
                if key in item_data:
                    quality_data[key] = item_data[key]
            if quality_data:
                item.quality_data = quality_data

            item.save()
        
        return Response(self.get_serializer(grn).data)
    
    @action(detail=True, methods=['get'])
    def generate_pdf(self, request, pk=None):
        """Generate PDF receipt for GRN"""
        grn = self.get_object()
        
        # TODO: Implement PDF generation
        # Use reportlab or weasyprint
        
        return Response({
            'message': 'PDF generation not yet implemented',
            'grn_number': grn.grn_number
        })


class PurchaseReturnViewSet(ScopedModelViewSet):
    """
    API endpoint for purchase returns
    """
    serializer_class = PurchaseReturnSerializer
    permission_classes = [IsAuthenticated]
    queryset = PurchaseReturn.objects.none()  # For schema generation
    
    def get_queryset(self):
        # Protect against schema generation with AnonymousUser
        if getattr(self, 'swagger_fake_view', False):
            return PurchaseReturn.objects.none()
        
        return PurchaseReturn.objects.filter(
            branch=self.request.user.branch
        ).select_related('branch')
    
    @transaction.atomic
    def perform_create(self, serializer):
        """Create return with auto-generated number"""
        from django.db import IntegrityError
        from rest_framework.exceptions import ValidationError
        from datetime import datetime
        import random
        
        # Generate unique return number
        max_attempts = 10
        purchase_return = None
        
        for attempt in range(max_attempts):
            date_str = datetime.now().strftime('%Y%m%d')
            random_part = f"{random.randint(1000, 9999)}"
            return_number = f"RET-{date_str}-{random_part}"
            
            if not PurchaseReturn.objects.filter(return_number=return_number).exists():
                try:
                    purchase_return = serializer.save(
                        return_number=return_number,
                        owner=self.request.user,
                        branch=self.request.user.branch,
                        tenant=getattr(self.request.user, 'tenant', None)
                    )
                    break
                except IntegrityError as e:
                    if 'return_number' in str(e) and attempt < max_attempts - 1:
                        continue
                    raise ValidationError({
                        'return_number': 'Failed to generate unique return number. Please try again.'
                    })
        
        if purchase_return is None:
            raise ValidationError({
                'return_number': 'Unable to generate unique return number after multiple attempts.'
            })
        
        purchase_return.calculate_total()
    
    @action(detail=True, methods=['get'])
    def gl_entries(self, request, pk=None):
        """Get GL / journal entries for a posted purchase return"""
        purchase_return = self.get_object()
        if not purchase_return.journal_entry:
            return Response({'entries': [], 'message': 'Not yet posted'})

        je = purchase_return.journal_entry
        lines = je.entries.select_related('account').all()
        return Response({
            'journal_entry_id': je.id,
            'reference': je.reference_number if hasattr(je, 'reference_number') else str(je),
            'date': str(je.date),
            'description': je.description,
            'is_posted': getattr(je, 'is_posted', True),
            'entries': [
                {
                    'id': line.id,
                    'account_id': line.account_id,
                    'account_code': getattr(line.account, 'code', ''),
                    'account_name': getattr(line.account, 'name', str(line.account)),
                    'debit': str(line.amount) if line.side == 'debit' else '0.00',
                    'credit': str(line.amount) if line.side == 'credit' else '0.00',
                }
                for line in lines
            ],
        })

    @action(detail=True, methods=['post'])
    def post(self, request, pk=None):
        """Post return - reduce inventory and create credit"""
        purchase_return = self.get_object()
        
        if purchase_return.is_posted:
            return Response(
                {'error': 'Return already posted'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            with transaction.atomic():
                # Reduce inventory for each returned item
                for item in purchase_return.items.all():
                    InventoryService.reduce_stock(
                        item=item.item,
                        location=purchase_return.grn.received_location,
                        quantity=item.quantity_returned,
                        movement_type='return_out',
                        reference_number=purchase_return.return_number,
                        unit_cost=item.unit_cost,
                        user=request.user
                    )
                
                # Create journal entry for return
                # Dr: Accounts Payable, Cr: Inventory
                from transactions.models import Transaction as JournalEntry, TransactionEntry as JournalEntryLine
                from liabilities.models import AccountsPayable
                
                # Get or create transaction series for purchase returns
                from transactions.models import TransactionSeries
                series, _ = TransactionSeries.objects.get_or_create(
                    code='PRET',
                    defaults={
                        'name': 'Purchase Returns',
                        'description': 'Purchase Return Transactions'
                    }
                )
                
                journal_entry = JournalEntry.objects.create(
                    series=series,
                    date=purchase_return.return_date,
                    description=f"Purchase Return - {purchase_return.supplier.name}",
                    workflow_reference=purchase_return.return_number,
                    branch=purchase_return.branch,
                    owner=purchase_return.owner
                )
                
                # Find the payable account
                payable_account = purchase_return.grn.accounts_payable.account
                
                # Dr: Accounts Payable (reduce liability)
                JournalEntryLine.objects.create(
                    transaction=journal_entry,
                    account=payable_account,
                    side=JournalEntryLine.DEBIT,
                    amount=purchase_return.total_amount
                )
                
                # Cr: Inventory (reduce asset)
                inventory_account = purchase_return.items.first().item.category.inventory_account
                JournalEntryLine.objects.create(
                    transaction=journal_entry,
                    account=inventory_account,
                    side=JournalEntryLine.CREDIT,
                    amount=purchase_return.total_amount
                )
                
                # POST the journal entry to update account balances
                journal_entry.post()
                
                # Update payable amount
                payable = purchase_return.grn.accounts_payable
                payable.amount -= purchase_return.total_amount
                payable.save()
                
                purchase_return.is_posted = True
                purchase_return.posted_at = timezone.now()
                purchase_return.journal_entry = journal_entry
                purchase_return.save()
            
            return Response({
                'success': True,
                'message': 'Return posted successfully',
                'return': self.get_serializer(purchase_return).data
            })
        
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )


class SupplierQuoteViewSet(ScopedModelViewSet):
    """
    API endpoint for supplier quotes
    """
    serializer_class = SupplierQuoteSerializer
    permission_classes = [IsAuthenticated]
    queryset = SupplierQuote.objects.none()  # For schema generation
    
    def get_queryset(self):
        # Protect against schema generation with AnonymousUser
        if getattr(self, 'swagger_fake_view', False):
            return SupplierQuote.objects.none()
        
        return SupplierQuote.objects.filter(
            branch=self.request.user.branch
        ).select_related('branch', 'requisition', 'supplier').prefetch_related('items', 'items__item')
    
    def perform_create(self, serializer):
        """Create quote with auto-generated number"""
        from django.db import IntegrityError
        from rest_framework.exceptions import ValidationError
        from datetime import datetime
        import random
        
        # Generate unique quote number
        max_attempts = 10
        for attempt in range(max_attempts):
            date_str = datetime.now().strftime('%Y%m%d')
            random_part = f"{random.randint(1000, 9999)}"
            quote_number = f"QUOTE-{date_str}-{random_part}"
            
            if not SupplierQuote.objects.filter(quote_number=quote_number).exists():
                try:
                    serializer.save(
                        quote_number=quote_number,
                        owner=self.request.user,
                        branch=self.request.user.branch,
                        tenant=getattr(self.request.user, 'tenant', None)
                    )
                    return
                except IntegrityError as e:
                    if 'quote_number' in str(e) and attempt < max_attempts - 1:
                        continue
                    raise ValidationError({
                        'quote_number': 'Failed to generate unique quote number. Please try again.'
                    })
        
        raise ValidationError({
            'quote_number': 'Unable to generate unique quote number after multiple attempts.'
        })
    
    @action(detail=True, methods=['post'])
    def select(self, request, pk=None):
        """Select this quote as winner"""
        quote = self.get_object()
        
        # Mark other quotes for this requisition as rejected
        if quote.requisition:
            SupplierQuote.objects.filter(
                requisition=quote.requisition
            ).exclude(id=quote.id).update(status='rejected')
        
        quote.status = 'selected'
        quote.save()
        
        return Response(self.get_serializer(quote).data)
    
    @extend_schema(
        parameters=[
            OpenApiParameter(
                name='requisition_id',
                type=int,
                location=OpenApiParameter.QUERY,
                required=True,
                description='ID of the requisition to compare quotes for'
            )
        ],
        responses={
            200: OpenApiResponse(description="List of quotes with comparison data"),
            400: OpenApiResponse(description="requisition_id is required")
        },
        description="Compare all received quotes for a specific requisition"
    )
    @action(detail=False, methods=['get'])
    def compare(self, request):
        """Compare quotes for a requisition"""
        requisition_id = request.query_params.get('requisition_id')
        
        if not requisition_id:
            return Response(
                {'error': 'requisition_id required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        quotes = self.get_queryset().filter(
            requisition_id=requisition_id,
            status='received'
        ).prefetch_related('items')
        
        comparison = []
        for quote in quotes:
            comparison.append({
                'quote': self.get_serializer(quote).data,
                'total_amount': quote.total_amount,
                'delivery_terms': quote.delivery_terms,
                'payment_terms': quote.payment_terms
            })
        
        return Response(comparison)
    
    @extend_schema(
        parameters=[
            OpenApiParameter(
                name='requisition_id',
                type=int,
                location=OpenApiParameter.QUERY,
                required=True,
                description='ID of the requisition to get quotes for'
            )
        ],
        responses={
            200: OpenApiResponse(description="All quotes for the requisition"),
            400: OpenApiResponse(description="requisition_id is required or invalid")
        },
        description="Get all quotes (any status) for a specific requisition with items included"
    )
    @action(detail=False, methods=['get'], url_path='by-requisition')
    def by_requisition(self, request):
        """
        Get all quotes for a specific requisition
        
        GET /api/procurement/supplier-quotes/by-requisition/?requisition_id=123
        
        Returns all quotes (any status) for the given requisition with items included
        """
        requisition_id = request.query_params.get('requisition_id')
        
        if not requisition_id:
            return Response(
                {'error': 'requisition_id parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            requisition_id = int(requisition_id)
        except (ValueError, TypeError):
            return Response(
                {'error': 'requisition_id must be a valid integer'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get all quotes for this requisition
        quotes = self.get_queryset().filter(
            requisition_id=requisition_id
        ).order_by('-quote_date', '-created_at')
        
        serializer = self.get_serializer(quotes, many=True)
        
        return Response({
            'requisition_id': requisition_id,
            'count': quotes.count(),
            'quotes': serializer.data
        })


# ========== NEW: Procurement Configuration Views ==========

from rest_framework import filters
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Q

from procurement.config_models import ProcurementConfig
from procurement.serializers import (
    ProcurementConfigSerializer,
    WorkflowTemplateListSerializer,
    ThreeWayMatchingRequestSerializer,
    ThreeWayMatchingResponseSerializer
)
from procurement.services.three_way_matching import (
    ThreeWayMatchingService,
    MatchingReportGenerator
)
from automations.models import WorkflowTemplate


class ProcurementConfigViewSet(ScopedModelViewSet):
    """
    ViewSet for procurement configuration
    
    Typically one config per branch, but supports multiple if needed
    """
    serializer_class = ProcurementConfigSerializer
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['branch', 'enable_three_way_matching']
    ordering_fields = ['created_at', 'updated_at']
    ordering = ['-created_at']
    
    def get_queryset(self):
        """Filter by user's branches"""
        return ProcurementConfig.objects.filter(
            Q(branch=self.request.user.branch) | Q(owner=self.request.user)
        )
    
    def perform_create(self, serializer):
        """Set owner on create"""
        serializer.save(
            owner=self.request.user,
            branch=self.request.user.branch,
            tenant=getattr(self.request.user, 'tenant', None)
        )
    
    @action(detail=False, methods=['get'])
    def for_branch(self, request):
        """
        Get procurement config for a specific branch
        GET /api/procurement/config/for_branch/?branch_id=1
        """
        branch_id = request.query_params.get('branch_id', request.user.branch.id)
        
        try:
            config = ProcurementConfig.objects.get(branch_id=branch_id)
            serializer = self.get_serializer(config)
            return Response(serializer.data)
        except ProcurementConfig.DoesNotExist:
            return Response(
                {'error': 'Config not found for this branch'},
                status=status.HTTP_404_NOT_FOUND
            )
    
    @action(detail=False, methods=['get'])
    def available_workflows(self, request):
        """
        Get available workflow templates for procurement
        GET /api/procurement/config/available_workflows/?category=procurement
        """
        category = request.query_params.get('category', 'procurement')
        workflows = WorkflowTemplate.objects.filter(
            is_active=True,
            category=category,
            branch=request.user.branch
        ).order_by('name')
        
        serializer = WorkflowTemplateListSerializer(workflows, many=True)
        return Response(serializer.data)


class ThreeWayMatchingViewSet(viewsets.ViewSet):
    """
    ViewSet for 3-way matching operations
    """
    permission_classes = [IsAuthenticated]
    
    @action(detail=False, methods=['post'])
    def match(self, request):
        """
        Perform 3-way matching
        POST /api/procurement/three-way-matching/match/
        Body: {
            "po_id": 1,
            "grn_id": 2,
            "invoice_amount": "1000.00",
            "invoice_items": []
        }
        """
        # Validate request
        request_serializer = ThreeWayMatchingRequestSerializer(data=request.data)
        if not request_serializer.is_valid():
            return Response(
                request_serializer.errors,
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get objects
        po_id = request_serializer.validated_data['po_id']
        grn_id = request_serializer.validated_data['grn_id']
        invoice_amount = request_serializer.validated_data.get('invoice_amount')
        invoice_items = request_serializer.validated_data.get('invoice_items', [])
        
        try:
            po = PurchaseOrder.objects.get(id=po_id)
            grn = GoodsReceivedNote.objects.get(id=grn_id)
        except (PurchaseOrder.DoesNotExist, GoodsReceivedNote.DoesNotExist) as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Get procurement config
        try:
            config = ProcurementConfig.objects.get(branch=po.branch)
        except ProcurementConfig.DoesNotExist:
            return Response(
                {'error': 'Procurement config not found for this branch'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Perform matching
        service = ThreeWayMatchingService(config)
        
        if invoice_amount is not None:
            # Full 3-way match
            result = service.match_po_grn_invoice(po, grn, invoice_amount, invoice_items)
        else:
            # PO-GRN match only
            result = service.match_po_grn(po, grn)
        
        # Generate report
        result['report'] = MatchingReportGenerator.generate_report(result)
        
        # Serialize response
        response_serializer = ThreeWayMatchingResponseSerializer(result)
        return Response(response_serializer.data)
    
    @action(detail=False, methods=['post'])
    def match_po_grn(self, request):
        """
        Perform PO-GRN matching (2-way)
        POST /api/procurement/three-way-matching/match_po_grn/
        Body: {"po_id": 1, "grn_id": 2}
        """
        po_id = request.data.get('po_id')
        grn_id = request.data.get('grn_id')
        
        if not po_id or not grn_id:
            return Response(
                {'error': 'po_id and grn_id are required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            po = PurchaseOrder.objects.get(id=po_id)
            grn = GoodsReceivedNote.objects.get(id=grn_id)
            config = ProcurementConfig.objects.get(branch=po.branch)
        except (PurchaseOrder.DoesNotExist, GoodsReceivedNote.DoesNotExist,
                ProcurementConfig.DoesNotExist) as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_404_NOT_FOUND
            )
        
        service = ThreeWayMatchingService(config)
        result = service.match_po_grn(po, grn)
        result['report'] = MatchingReportGenerator.generate_report(result)
        
        response_serializer = ThreeWayMatchingResponseSerializer(result)
        return Response(response_serializer.data)