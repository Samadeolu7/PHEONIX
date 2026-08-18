# inventory/views_material_request.py
"""
Views for Material Request system
"""
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db import transaction
from django.db.models import Q, Count
from django.utils import timezone
import logging

from common.views import ScopedModelViewSet, resolve_effective_branch
from common.approval_permissions import IsApprover
from .models_material_request import MaterialRequest, MaterialRequestItem
from .serializers_material_request import (
    MaterialRequestSerializer,
    MaterialRequestCreateSerializer,
    MaterialRequestUpdateSerializer,
    MaterialRequestActionSerializer,
    MaterialRequestSummarySerializer,
    MaterialRequestItemSerializer
)

logger = logging.getLogger(__name__)


class MaterialRequestViewSet(ScopedModelViewSet):
    """
    ViewSet for Material Requests
    
    Features:
    - Create and manage material requests
    - Submit for approval
    - Approve/reject requests
    - Fulfill requests (create inventory invoice and reduce stock)
    - Track status and workflow
    """
    queryset = MaterialRequest.objects.all()
    serializer_class = MaterialRequestSerializer
    permission_classes = [IsAuthenticated]
    permission_module = 'inventory'
    permission_page = 'inventory-items'

    def get_queryset(self):
        """Filter by branch and apply search/filter parameters"""
        queryset = super().get_queryset()
        
        # Filter by status
        status_filter = self.request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        
        # Filter by client
        client_id = self.request.query_params.get('client')
        if client_id:
            queryset = queryset.filter(client_id=client_id)
        
        # Filter by date range
        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')
        if date_from:
            queryset = queryset.filter(request_date__gte=date_from)
        if date_to:
            queryset = queryset.filter(request_date__lte=date_to)
        
        # Search by request number or purpose
        search = self.request.query_params.get('search')
        if search:
            queryset = queryset.filter(
                Q(request_number__icontains=search) |
                Q(purpose__icontains=search) |
                Q(client__first_name__icontains=search) |
                Q(client__last_name__icontains=search)
            )
        
        # Filter by service invoice
        service_invoice_id = self.request.query_params.get('service_invoice')
        if service_invoice_id:
            queryset = queryset.filter(service_invoice_id=service_invoice_id)
        
        return queryset.select_related(
            'client', 'requested_by', 'approved_by', 'rejected_by',
            'fulfilled_by', 'delivery_location', 'service_invoice',
            'inventory_invoice'
        ).prefetch_related('items__item')
    
    def get_serializer_class(self):
        """Use different serializers for different actions"""
        if self.action == 'create':
            return MaterialRequestCreateSerializer
        elif self.action in ['update', 'partial_update']:
            return MaterialRequestUpdateSerializer
        return MaterialRequestSerializer
    
    def create(self, request, *args, **kwargs):
        """
        Retired: the client + service-invoice material request workflow has been
        superseded by Office Use Requests (staff-only, posts straight to each
        item's category expense account). This endpoint is kept read-only so
        historical requests remain visible and can still be actioned through
        to completion.
        """
        return Response(
            {
                'error': (
                    'Creating new material requests is no longer supported. '
                    'Use /inventory/office-use-requests/ instead.'
                )
            },
            status=status.HTTP_410_GONE
        )
    
    @action(detail=True, methods=['post'])
    @transaction.atomic
    def submit(self, request, pk=None):
        """Submit material request for approval"""
        material_request = self.get_object()
        
        try:
            material_request.submit(user=request.user)
            serializer = self.get_serializer(material_request)
            return Response({
                'message': 'Material request submitted successfully',
                'data': serializer.data
            })
        except Exception as e:
            logger.error(f"Error submitting material request {pk}: {str(e)}")
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    @transaction.atomic
    def approve(self, request, pk=None):
        """Approve a material request"""
        material_request = self.get_object()
        action_serializer = MaterialRequestActionSerializer(data=request.data)
        action_serializer.is_valid(raise_exception=True)
        
        try:
            notes = action_serializer.validated_data.get('notes', '')
            material_request.approve(user=request.user, notes=notes)
            
            serializer = self.get_serializer(material_request)
            return Response({
                'message': 'Material request approved successfully',
                'data': serializer.data
            })
        except Exception as e:
            logger.error(f"Error approving material request {pk}: {str(e)}")
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    @transaction.atomic
    def reject(self, request, pk=None):
        """Reject a material request"""
        material_request = self.get_object()
        action_serializer = MaterialRequestActionSerializer(data=request.data)
        action_serializer.is_valid(raise_exception=True)
        
        try:
            reason = action_serializer.validated_data.get('reason', '')
            if not reason:
                return Response(
                    {'error': 'Rejection reason is required'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            material_request.reject(user=request.user, reason=reason)
            
            serializer = self.get_serializer(material_request)
            return Response({
                'message': 'Material request rejected',
                'data': serializer.data
            })
        except Exception as e:
            logger.error(f"Error rejecting material request {pk}: {str(e)}")
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['get'], url_path='check-stock')
    def check_stock_availability(self, request, pk=None):
        """
        Check if sufficient stock is available to fulfill this material request.
        
        Returns:
            {
                "available": true/false,
                "errors": ["list of items with insufficient stock"],
                "items": [
                    {
                        "item_id": 1,
                        "item_name": "Item Name",
                        "sku": "SKU123",
                        "requested": 10,
                        "available": 5,
                        "status": "insufficient" / "available" / "not_found"
                    }
                ]
            }
        """
        material_request = self.get_object()
        
        try:
            is_valid, error_messages = material_request.validate_stock_availability()
            
            # Build detailed item status
            from .models import InventoryStock
            items_status = []
            
            for mr_item in material_request.items.select_related('item').all():
                try:
                    stock = InventoryStock.objects.get(
                        item=mr_item.item,
                        location=material_request.delivery_location
                    )
                    
                    item_status = {
                        'item_id': mr_item.item.id,
                        'item_name': mr_item.item.name,
                        'sku': mr_item.item.sku,
                        'requested': mr_item.quantity,
                        'available': stock.quantity_available,
                        'on_hand': stock.quantity_on_hand,
                        'reserved': stock.quantity_reserved,
                        'status': 'available' if stock.quantity_available >= mr_item.quantity else 'insufficient'
                    }
                except InventoryStock.DoesNotExist:
                    item_status = {
                        'item_id': mr_item.item.id,
                        'item_name': mr_item.item.name,
                        'sku': mr_item.item.sku,
                        'requested': mr_item.quantity,
                        'available': 0,
                        'on_hand': 0,
                        'reserved': 0,
                        'status': 'not_found'
                    }
                
                items_status.append(item_status)
            
            return Response({
                'available': is_valid,
                'can_fulfill': is_valid,
                'errors': error_messages,
                'items': items_status,
                'location': {
                    'id': material_request.delivery_location.id,
                    'name': material_request.delivery_location.name,
                    'code': material_request.delivery_location.code
                }
            })
            
        except Exception as e:
            logger.error(f"Error checking stock availability for material request {pk}: {str(e)}")
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    @transaction.atomic
    def fulfill(self, request, pk=None):
        """
        Fulfill material request by creating inventory invoice and reducing stock.
        
        This will validate stock availability before attempting fulfillment.
        If stock is insufficient, the request will be rejected with a 400 error.
        """
        material_request = self.get_object()
        
        try:
            invoice = material_request.fulfill(user=request.user)
            
            serializer = self.get_serializer(material_request)
            return Response({
                'message': 'Material request fulfilled successfully',
                'data': serializer.data,
                'invoice_id': invoice.id,
                'invoice_number': invoice.invoice_number
            })
        except Exception as e:
            logger.error(f"Error fulfilling material request {pk}: {str(e)}")
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    @transaction.atomic
    def cancel(self, request, pk=None):
        """Cancel a material request"""
        material_request = self.get_object()
        
        if material_request.status not in ['draft', 'submitted']:
            return Response(
                {'error': 'Only draft or submitted requests can be cancelled'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        material_request.status = 'cancelled'
        material_request.save()
        
        serializer = self.get_serializer(material_request)
        return Response({
            'message': 'Material request cancelled',
            'data': serializer.data
        })
    
    @action(detail=False, methods=['get'])
    def summary(self, request):
        """Get summary statistics for material requests"""
        queryset = self.get_queryset()
        
        # Count by status
        summary_data = {
            'total_requests': queryset.count(),
            'draft': queryset.filter(status='draft').count(),
            'submitted': queryset.filter(status='submitted').count(),
            'approved': queryset.filter(status='approved').count(),
            'rejected': queryset.filter(status='rejected').count(),
            'fulfilled': queryset.filter(status='fulfilled').count(),
            'pending_approval': queryset.filter(status='submitted').count(),
        }
        
        serializer = MaterialRequestSummarySerializer(summary_data)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'], url_path='pending-approvals')
    def pending_approvals(self, request):
        """Get all material requests pending approval"""
        queryset = self.get_queryset().filter(status='submitted')
        
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'])
    def items(self, request, pk=None):
        """Get all items for a material request"""
        material_request = self.get_object()
        items = material_request.items.all()
        serializer = MaterialRequestItemSerializer(items, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='eligible-items')
    def eligible_items(self, request):
        """
        Return inventory items eligible for a material request against a given invoice.

        Query params:
          - invoice (required): ID of the service invoice
          - search (optional): filter by item name / SKU

        Each item in the response includes:
          - eligibility_type: 'exact_match' | 'category_match'
          - authorized_by: name of the invoice item that grants access
        """
        invoice_id = request.query_params.get('invoice')
        if not invoice_id:
            return Response(
                {'error': 'invoice query parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Load invoice + its items eagerly
        try:
            from incomes.models import Invoice
            invoice = Invoice.objects.prefetch_related(
                'items__service_item',
                'items__inventory_item__category',
            ).get(pk=invoice_id)
        except Exception:
            return Response(
                {'error': 'Invoice not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        # ---------- build authorization sets ----------
        # exact_item_ids: set of InventoryItem PKs directly on the invoice
        exact_item_ids: dict = {}          # item_id -> invoice item description
        # authorized_category_codes: category codes allowed by service items
        authorized_category_codes: dict = {}  # category_code -> service item name
        # authorized_item_types: item_type values allowed by service items
        authorized_item_types: dict = {}  # item_type -> service item name

        for inv_item in invoice.items.all():
            if inv_item.item_type == 'inventory' and inv_item.inventory_item_id:
                exact_item_ids[inv_item.inventory_item_id] = (
                    inv_item.description or inv_item.inventory_item.name
                )
            elif inv_item.item_type == 'service' and inv_item.service_item_id:
                svc = inv_item.service_item
                if svc.allows_material_requests:
                    config = svc.material_request_config or {}
                    for cat_code in config.get('allowed_categories', []):
                        authorized_category_codes[cat_code] = svc.name
                    # Also support matching by item_type label
                    for itype in config.get('allowed_item_types', []):
                        authorized_item_types[itype.strip().lower()] = svc.name

        # ---------- fetch candidate inventory items ----------
        from .models import InventoryItem
        qs = InventoryItem.objects.select_related('category').filter(is_active=True)

        # Scope to the requesting user's effective branch / tenant to prevent
        # cross-tenant (and cross-branch) leakage. resolve_effective_branch()
        # honors the topbar branch-switcher's X-Branch-ID header for elevated
        # users; None means tenant-wide (all branches) rather than "fall back
        # to my own branch".
        user = request.user
        effective_branch = resolve_effective_branch(request)
        if effective_branch:
            qs = qs.filter(branch=effective_branch)
        elif hasattr(user, 'tenant') and user.tenant_id:
            qs = qs.filter(tenant=user.tenant)

        search = request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(
                Q(name__icontains=search) | Q(sku__icontains=search)
            )

        # Build response items
        eligible = []
        ineligible = []

        for item in qs:
            cat = item.category
            cat_code = cat.code if cat else None
            cat_item_type = (cat.item_type or '').strip().lower() if cat else ''

            if item.id in exact_item_ids:
                eligibility_type = 'exact_match'
                authorized_by = exact_item_ids[item.id]
            elif cat_code and cat_code in authorized_category_codes:
                eligibility_type = 'category_match'
                authorized_by = authorized_category_codes[cat_code]
            elif cat_item_type and cat_item_type in authorized_item_types:
                eligibility_type = 'category_match'
                authorized_by = authorized_item_types[cat_item_type]
            else:
                eligibility_type = 'not_eligible'
                authorized_by = None

            entry = {
                'id': item.id,
                'name': item.name,
                'sku': item.sku,
                'category': item.category_id,
                'category_name': cat.name if cat else '',
                'category_code': cat_code or '',
                'category_item_type': cat.item_type if cat else '',
                'unit_of_measure': getattr(item, 'unit_of_measure', ''),
                'eligibility_type': eligibility_type,
                'authorized_by': authorized_by,
            }
            if eligibility_type != 'not_eligible':
                eligible.append(entry)
            else:
                ineligible.append(entry)

        return Response({
            'invoice_id': invoice.id,
            'invoice_number': invoice.invoice_number,
            'eligible_items': eligible,
            'ineligible_items': ineligible,
        })
