# inventory/views.py - COMPLETE VERSION
"""
INVENTORY MANAGEMENT API VIEWS

This module provides REST API endpoints for managing inventory items, stock levels,
and stock movements. All operations maintain proper accounting integration and audit trails.

KEY CONCEPTS:
--------------
1. InventoryItem: Master product data (WHAT the item is)
   - Name, SKU, pricing, category
   - Item-level settings (valuation method, reorder levels)
   - Access via: GET/POST /inventory/items/

2. InventoryStock: Quantity tracking per location (HOW MUCH, WHERE)
   - quantity_on_hand: Physical units
   - quantity_reserved: Reserved for orders
   - quantity_available: Available to sell (on_hand - reserved)
   - Access via: GET /inventory/items/{id}/stock/ (nested)
   - Or: GET /inventory/stock/ (flat list)

3. StockMovement: Audit trail (WHEN, WHY quantities changed)
   - Created automatically by InventoryService
   - Never create manually
   - Access via: GET /inventory/items/{id}/movements/ (nested)

STOCK OPERATIONS (use InventoryService, never modify quantities directly):
--------------------------------------------------------------------------
- receive_stock() - Add stock from purchases/receipts
- reduce_stock() - Remove stock for sales/consumption
- transfer_stock() - Move between locations
- adjust_stock() - Corrections/cycle counts
- reserve_stock() - Hold for orders
- release_reservation() - Cancel reservations

All operations create journal entries and maintain audit trail.
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db import transaction
from django.db.models import Q, Sum, Count, F, Prefetch
from django.utils import timezone
from decimal import Decimal
import logging
from drf_spectacular.utils import extend_schema, extend_schema_view, OpenApiParameter, OpenApiResponse
from drf_spectacular.types import OpenApiTypes

from common.views import ScopedModelViewSet
from common.approval_permissions import IsApprover
from .models import (
    InventoryItem, InventoryCategory, Location, InventoryStock, StockMovement,
    InventoryAllocation, AllocationItem, AllocationRedemption, RedemptionItem,
    AssetUsageLog, InventoryCostLayer, CostLayerConsumption
)
from .serializers import (
    InventoryItemSerializer, InventoryCategorySerializer,
    LocationSerializer, InventoryStockSerializer, StockMovementSerializer,
    InventoryAllocationSerializer, AllocationSummarySerializer,
    AllocationItemSerializer, AllocationRedemptionSerializer,
    RedemptionItemSerializer, RedemptionCreateSerializer,
    AssetUsageLogSerializer, InventoryCostLayerSerializer,
    CostLayerConsumptionSerializer, ItemValuationSerializer,
    RecalculateValuationSerializer, ValuationReportSerializer
)

logger = logging.getLogger(__name__)


class PendingApprovalsViewSet(viewsets.ViewSet):
    """
    Unified dashboard for all pending approvals across inventory operations.
    
    GET /api/inventory/pending-approvals/
    
    Returns aggregated list of all items awaiting approval:
    - Stock adjustments
    - Stock transfers
    - Write-offs
    - Sales orders
    
    Optional filters:
    - ?type=adjustment|transfer|writeoff|sales_order
    - ?sort=date|cost  (default: date, descending)
    """
    permission_module = 'inventory'
    permission_page = 'pending-approvals'
    permission_classes = [IsAuthenticated]
    
    def list(self, request):
        """Get all pending approvals across all inventory operations"""
        from inventory.models import StockAdjustmentRequest, StockTransferRequest, WriteOffRequest, SalesOrder
        
        user = request.user
        filter_type = request.query_params.get('type')
        sort_by = request.query_params.get('sort', 'date')
        
        # Initialize results
        items = []
        
        # 1. Stock Adjustment Requests
        if not filter_type or filter_type == 'adjustment':
            adjustments = StockAdjustmentRequest.objects.filter(
                status='pending',
                owner=user,
                branch=user.branch
            ).select_related('item', 'location', 'requested_by')
            
            for adj in adjustments:
                items.append({
                    'id': adj.id,
                    'type': 'adjustment',
                    'type_display': 'Stock Adjustment',
                    'request_number': adj.request_number,
                    'requested_by': adj.requested_by.get_full_name() if adj.requested_by else 'Unknown',
                    'requested_at': adj.created_at,
                    'item': adj.item.name,
                    'item_sku': adj.item.sku,
                    'location': adj.location.name,
                    'adjustment_type': adj.adjustment_type,
                    'quantity': str(adj.quantity),
                    'estimated_cost': str(adj.estimated_cost) if adj.estimated_cost else '0.00',
                    'reason': adj.reason,
                    'notes': adj.notes,
                    'detail_url': f'/api/inventory/adjustments/{adj.id}/',
                    'approve_url': f'/api/inventory/adjustments/{adj.id}/approve/',
                    'reject_url': f'/api/inventory/adjustments/{adj.id}/reject/'
                })
        
        # 2. Stock Transfer Requests
        if not filter_type or filter_type == 'transfer':
            transfers = StockTransferRequest.objects.filter(
                status='pending',
                owner=user,
                branch=user.branch
            ).select_related('item', 'from_location', 'to_location', 'requested_by')
            
            for tfr in transfers:
                items.append({
                    'id': tfr.id,
                    'type': 'transfer',
                    'type_display': 'Stock Transfer',
                    'request_number': tfr.request_number,
                    'requested_by': tfr.requested_by.get_full_name() if tfr.requested_by else 'Unknown',
                    'requested_at': tfr.created_at,
                    'item': tfr.item.name,
                    'item_sku': tfr.item.sku,
                    'from_location': tfr.from_location.name,
                    'to_location': tfr.to_location.name,
                    'quantity': str(tfr.quantity),
                    'estimated_cost': str(tfr.quantity * (tfr.unit_cost or tfr.item.cost_price)),
                    'reason': tfr.reason,
                    'notes': tfr.notes,
                    'detail_url': f'/api/inventory/transfers/{tfr.id}/',
                    'approve_url': f'/api/inventory/transfers/{tfr.id}/approve/',
                    'reject_url': f'/api/inventory/transfers/{tfr.id}/reject/'
                })
        
        # 3. Write-off Requests
        if not filter_type or filter_type == 'writeoff':
            writeoffs = WriteOffRequest.objects.filter(
                status='pending',
                owner=user,
                branch=user.branch
            ).select_related('item', 'location', 'requested_by')
            
            for wo in writeoffs:
                items.append({
                    'id': wo.id,
                    'type': 'writeoff',
                    'type_display': 'Write-off',
                    'request_number': wo.request_number,
                    'requested_by': wo.requested_by.get_full_name() if wo.requested_by else 'Unknown',
                    'requested_at': wo.created_at,
                    'item': wo.item.name,
                    'item_sku': wo.item.sku,
                    'location': wo.location.name,
                    'quantity': str(wo.quantity),
                    'estimated_cost': str(wo.estimated_cost) if wo.estimated_cost else '0.00',
                    'reason': wo.reason,
                    'notes': wo.notes,
                    'detail_url': f'/api/inventory/writeoffs/{wo.id}/',
                    'approve_url': f'/api/inventory/writeoffs/{wo.id}/approve/',
                    'reject_url': f'/api/inventory/writeoffs/{wo.id}/reject/'
                })
        
        # 4. Sales Orders
        if not filter_type or filter_type == 'sales_order':
            sales_orders = SalesOrder.objects.filter(
                status='pending_approval',
                owner=user,
                branch=user.branch
            ).select_related('client', 'created_by')
            
            for so in sales_orders:
                items.append({
                    'id': so.id,
                    'type': 'sales_order',
                    'type_display': 'Sales Order',
                    'request_number': so.so_number,
                    'requested_by': so.created_by.get_full_name() if so.created_by else 'Unknown',
                    'requested_at': so.created_at,
                    'client': so.client.full_name if so.client else 'Unknown',
                    'total_amount': str(so.total_amount),
                    'estimated_cost': str(so.total_amount),  # For sorting purposes
                    'notes': so.notes or '',
                    'detail_url': f'/api/inventory/sales-orders/{so.id}/',
                    'approve_url': f'/api/inventory/sales-orders/{so.id}/approve/',
                    'reject_url': f'/api/inventory/sales-orders/{so.id}/reject/'
                })
        
        # Sort results
        if sort_by == 'cost':
            items.sort(key=lambda x: Decimal(x.get('estimated_cost', '0')), reverse=True)
        else:  # Default: sort by date
            items.sort(key=lambda x: x['requested_at'], reverse=True)
        
        # Calculate summary stats
        summary = {
            'total_pending': len(items),
            'by_type': {}
        }
        
        for item in items:
            item_type = item['type']
            if item_type not in summary['by_type']:
                summary['by_type'][item_type] = {
                    'count': 0,
                    'total_value': Decimal('0')
                }
            summary['by_type'][item_type]['count'] += 1
            summary['by_type'][item_type]['total_value'] += Decimal(item.get('estimated_cost', '0'))
        
        # Convert Decimals to strings for JSON serialization
        for type_key in summary['by_type']:
            summary['by_type'][type_key]['total_value'] = str(summary['by_type'][type_key]['total_value'])
        
        return Response({
            'count': len(items),
            'pending_approvals': items,
            'summary': summary
        }, status=status.HTTP_200_OK)


class InventoryCategoryViewSet(ScopedModelViewSet):
    """
    API endpoint for inventory categories.
    
    Categories group inventory items and link them to GL accounts
    for automatic accounting integration.
    
    List categories:
        GET /inventory/categories/
    
    Create category:
        POST /inventory/categories/
        {
            "name": "Electronics",
            "code": "ELEC",
            "inventory_account": 1,  # Asset account
            "cogs_account": 2,       # Expense account
            "sales_account": 3       # Income account
        }
    
    Update category:
        PATCH /inventory/categories/{id}/
    """
    permission_module = 'inventory'
    permission_page = 'inventory-categories'
    queryset = InventoryCategory.objects.all()
    serializer_class = InventoryCategorySerializer


class InventoryItemViewSet(ScopedModelViewSet):
    """
    API endpoint for inventory items (Master Product Data).
    
    InventoryItem represents WHAT the item is:
    - Product name, SKU, description
    - Pricing (cost price, selling price)
    - Category, unit of measure
    - Reorder settings
    - Valuation method (FIFO/LIFO/Average)
    
    For stock quantities, use nested endpoints:
    - GET /inventory/items/{id}/stock/ - Stock at all locations
    - GET /inventory/items/{id}/movements/ - Movement history
    
    List items:
        GET /inventory/items/
        Query params:
        - is_active: true/false
        - category: category ID
        - search: Search by name/SKU/barcode
    
    Create item:
        POST /inventory/items/
        {
            "name": "iPhone 15 Pro",
            "sku": "IPHONE15PRO",
            "category": 1,
            "unit_of_measure": "unit",
            "cost_price": "900.00",
            "selling_price": "1200.00",
            "valuation_method": "fifo",
            "reorder_level": "10",
            "reorder_quantity": "50",
            "is_active": true
        }
    
    Get item with stock summary:
        GET /inventory/items/{id}/
        Response includes:
        - Item details
        - total_stock (across all locations)
        - total_available
        - total_reserved
        - total_value
    """
    permission_module = 'inventory'
    permission_page = 'inventory-items'
    queryset = InventoryItem.objects.all()
    serializer_class = InventoryItemSerializer
    
    def get_queryset(self):
        queryset = super().get_queryset()
        
        # Filter by active status
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() == 'true')
        
        # Filter by category
        category = self.request.query_params.get('category')
        if category:
            queryset = queryset.filter(category_id=category)
        
        # Search by name or SKU
        search = self.request.query_params.get('search')
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search) | 
                Q(sku__icontains=search) | 
                Q(barcode__icontains=search)
            )
        
        return queryset
    
    @action(detail=False, methods=['get'])
    def summary(self, request):
        """Get inventory items summary for dropdowns"""
        items = self.get_queryset().filter(is_active=True)
        data = items.values('id', 'name', 'sku', 'unit_of_measure', 'selling_price')
        return Response({'success': True, 'data': list(data)})

    @action(detail=False, methods=['get'], url_path='low_stock')
    def low_stock(self, request):
        """
        Get items that need reordering (total stock <= reorder level).

        Uses database-level annotation to avoid N+1 per-item queries.
        Only returns active items.

        Query params:
          - category: Filter by category ID
          - search: Search by name, SKU, or barcode
          - page / page_size: Standard pagination
        """
        from django.db.models import Sum, DecimalField, Value
        from django.db.models.functions import Coalesce

        queryset = self.get_queryset().filter(is_active=True)

        # Annotate with the total stock across all locations
        queryset = queryset.annotate(
            computed_total_stock=Coalesce(
                Sum('stock_records__quantity_on_hand'),
                Value(0),
                output_field=DecimalField(),
            )
        ).filter(
            computed_total_stock__lte=F('reorder_level')
        )

        # Optional category filter
        category = request.query_params.get('category')
        if category:
            queryset = queryset.filter(category_id=category)

        # Optional search
        search = request.query_params.get('search', '').strip()
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search)
                | Q(sku__icontains=search)
                | Q(barcode__icontains=search)
            )

        queryset = queryset.order_by('computed_total_stock')

        # Paginate
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)


class LocationViewSet(ScopedModelViewSet):
    permission_module = 'inventory'
    permission_page = 'locations'
    queryset = Location.objects.all()
    serializer_class = LocationSerializer


class InventoryStockViewSet(ScopedModelViewSet):
    """
    API endpoint for inventory stock levels (Quantity Tracking).
    
    InventoryStock tracks HOW MUCH of an item exists at EACH LOCATION.
    
    Key Fields:
    - quantity_on_hand: Physical units in location
    - quantity_reserved: Reserved for orders (not available)
    - quantity_available: Can be sold (on_hand - reserved)
    - average_cost: Weighted average cost per unit
    - total_value: quantity_on_hand * average_cost
    
    Access Patterns:
    
    1. Nested (preferred): Get stock for specific item
       GET /inventory/items/{item_id}/stock/
       Returns all stock records for that item across locations
    
    2. Flat: Get all stock records
       GET /inventory/stock/
       Query params:
       - item: Filter by item ID
       - location: Filter by location ID
    
    3. By location:
       GET /inventory/stock/by_location/?location={id}
       Returns all items at that location
    
    IMPORTANT: Never modify stock quantities directly!
    Use InventoryService methods via custom actions or
    procurement/sales endpoints that handle accounting properly.
    
    Example Response:
    {
        "id": 1,
        "item": 5,
        "item_name": "iPhone 15 Pro",
        "location": 2,
        "location_name": "Main Warehouse",
        "quantity_on_hand": "50.00",
        "quantity_reserved": "10.00",
        "quantity_available": "40.00",
        "average_cost": "900.00",
        "total_value": "45000.00"
    }
    """
    permission_module = 'inventory'
    permission_page = 'stock'
    queryset = InventoryStock.objects.all()
    serializer_class = InventoryStockSerializer
    
    def get_queryset(self):
        queryset = super().get_queryset()
        
        # Support nested filtering: /items/{item_id}/stock/
        item_pk = self.kwargs.get('item_pk')
        if item_pk:
            queryset = queryset.filter(item_id=item_pk)
        
        # Filter by item (query param)
        item_id = self.request.query_params.get('item')
        if item_id:
            queryset = queryset.filter(item_id=item_id)
        
        # Filter by location (query param)
        location_id = self.request.query_params.get('location')
        if location_id:
            queryset = queryset.filter(location_id=location_id)
        
        # Only show records with stock
        show_empty = self.request.query_params.get('show_empty', 'false')
        if show_empty.lower() != 'true':
            queryset = queryset.filter(quantity_on_hand__gt=0)
        
        return queryset.select_related('item', 'location')
    
    @action(detail=False, methods=['get'])
    def by_location(self, request):
        """Get stock grouped by location"""
        location_id = request.query_params.get('location')
        if not location_id:
            return Response(
                {'error': 'location parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        stocks = self.get_queryset().filter(location_id=location_id)
        serializer = self.get_serializer(stocks, many=True)
        return Response({'success': True, 'data': serializer.data})


class StockMovementViewSet(ScopedModelViewSet):
    """
    API endpoint for stock movement history (Audit Trail).
    
    StockMovement records every change to inventory quantities.
    These are created automatically by InventoryService - never create manually.
    
    Movement Types:
    - RECEIVE: Stock received from supplier
    - SALE: Stock sold to customer
    - TRANSFER_OUT: Stock transferred out to another location
    - TRANSFER_IN: Stock received from another location
    - ADJUSTMENT: Manual adjustment (cycle count, damage, etc.)
    - ALLOCATION: Reserved for allocation/voucher
    - REDEMPTION: Consumed from allocation
    
    Access Patterns:
    
    1. Nested (preferred): Get movements for specific item
       GET /inventory/items/{item_id}/movements/
       Query params:
       - date_from: Start date (YYYY-MM-DD)
       - date_to: End date (YYYY-MM-DD)
       - movement_type: Filter by type
       - location: Filter by location ID
    
    2. Flat: Get all movements
       GET /inventory/movements/
       Same query params as nested
    
    Example Response:
    {
        "id": 1,
        "item": 5,
        "item_name": "iPhone 15 Pro",
        "location": 2,
        "location_name": "Main Warehouse",
        "movement_type": "RECEIVE",
        "quantity": "50.00",
        "unit_cost": "900.00",
        "reference_number": "PO-2024-001",
        "notes": "Purchase from Supplier XYZ",
        "created_at": "2024-01-15T10:30:00Z",
        "created_by_name": "John Doe"
    }
    """
    permission_module = 'inventory'
    permission_page = 'stock-movements'
    queryset = StockMovement.objects.all()
    serializer_class = StockMovementSerializer
    
    def get_queryset(self):
        queryset = super().get_queryset()
        
        # Support nested filtering: /items/{item_id}/movements/
        item_pk = self.kwargs.get('item_pk')
        if item_pk:
            queryset = queryset.filter(item_id=item_pk)
        
        # Filter by item (query param)
        item_id = self.request.query_params.get('item')
        if item_id:
            queryset = queryset.filter(item_id=item_id)
        
        # Filter by location (from or to)
        location_id = self.request.query_params.get('location')
        if location_id:
            queryset = queryset.filter(
                Q(from_location_id=location_id) | Q(to_location_id=location_id)
            )
        
        # Filter by movement type
        movement_type = self.request.query_params.get('movement_type')
        if movement_type:
            queryset = queryset.filter(movement_type=movement_type)
        
        # Filter by date range
        date_from = self.request.query_params.get('date_from')
        if date_from:
            queryset = queryset.filter(created_at__date__gte=date_from)
        
        date_to = self.request.query_params.get('date_to')
        if date_to:
            queryset = queryset.filter(created_at__date__lte=date_to)
        
        return queryset.select_related('item','created_by').order_by('-created_at')


# ================================================================
# STOCK ADJUSTMENTS & TRANSFERS
# ================================================================

class StockAdjustmentViewSet(ScopedModelViewSet):
    """
    API endpoint for stock adjustments.
    
    Use this for inventory corrections:
    - Cycle count adjustments
    - Damaged/expired items
    - Lost/stolen items
    - Found items
    
    Supports approval workflow based on InventoryConfig settings.
    
    POST /api/inventory/adjustments/
    Body: {
        "item_id": 5,
        "location_id": 2,
        "adjustment_type": "increase",  // or "decrease"
        "quantity": "10.00",
        "reason": "Cycle count correction",
        "notes": "Found 10 units during physical count",
        "unit_cost": "25.50"  // Optional, for cost-based approval thresholds
    }
    
    POST /api/inventory/adjustments/{id}/approve/  - Approve pending adjustment
    POST /api/inventory/adjustments/{id}/reject/   - Reject pending adjustment
    POST /api/inventory/adjustments/{id}/execute/  - Execute approved adjustment
    """
    permission_module = 'inventory'
    permission_page = 'stock-adjustments'
    http_method_names = ['get', 'post', 'head', 'options']

    def get_permissions(self):
        if self.action in ('approve', 'reject'):
            return [IsAuthenticated(), IsApprover()]
        return super().get_permissions()

    def get_serializer_class(self):
        from inventory.models import StockAdjustmentRequest
        from rest_framework import serializers
        
        class StockAdjustmentRequestSerializer(serializers.ModelSerializer):
            requested_by_name = serializers.CharField(source='requested_by.get_full_name', read_only=True)
            approved_by_name = serializers.CharField(source='approved_by.get_full_name', read_only=True, allow_null=True)
            item_name = serializers.CharField(source='item.name', read_only=True)
            item_sku = serializers.CharField(source='item.sku', read_only=True)
            location_name = serializers.CharField(source='location.name', read_only=True)
            
            class Meta:
                model = StockAdjustmentRequest
                fields = [
                    'id', 'request_number', 'requested_by', 'requested_by_name',
                    'item', 'item_name', 'item_sku', 'location', 'location_name',
                    'adjustment_type', 'quantity', 'unit_cost', 'estimated_cost',
                    'reason', 'notes', 'status', 'approved_by', 'approved_by_name',
                    'approved_at', 'approval_notes', 'stock_movement',
                    'created_at', 'updated_at'
                ]
                read_only_fields = ['request_number', 'estimated_cost', 'approved_by', 'approved_at', 'stock_movement']
        
        return StockAdjustmentRequestSerializer
    
    def get_queryset(self):
        """Show adjustment requests"""
        from inventory.models import StockAdjustmentRequest
        return StockAdjustmentRequest.objects.filter(
            owner__tenant=self.request.user.tenant,
            branch=self.request.user.branch
        ).select_related(
            'item', 'location', 'requested_by', 'approved_by'
        ).order_by('-created_at')
    
    @transaction.atomic
    def create(self, request, *args, **kwargs):
        """Create stock adjustment (direct or pending approval)"""
        from inventory.stock_service import InventoryService
        from inventory.models import StockAdjustmentRequest
        from inventory.config_models import InventoryConfig
        
        data = request.data
        item_id = data.get('item_id') or data.get('item')
        location_id = data.get('location_id') or data.get('location')
        adjustment_type = data.get('adjustment_type')
        quantity = Decimal(str(data.get('quantity', 0)))
        reason = data.get('reason', '')
        notes = data.get('notes', '')
        unit_cost = data.get('unit_cost')
        
        # Validate
        if not all([item_id, location_id, adjustment_type, quantity]):
            return Response({
                'error': 'item_id, location_id, adjustment_type, and quantity are required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        if adjustment_type not in ['increase', 'decrease']:
            return Response({
                'error': 'adjustment_type must be "increase" or "decrease"'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            item = InventoryItem.objects.get(
                pk=item_id,
                owner__tenant=request.user.tenant,
                branch=request.user.branch,
                is_deleted=False
            )
            location = Location.objects.get(
                pk=location_id,
                owner__tenant=request.user.tenant,
                branch=request.user.branch,
                is_deleted=False
            )
        except (InventoryItem.DoesNotExist, Location.DoesNotExist):
            return Response({
                'error': 'Item or location not found'
            }, status=status.HTTP_404_NOT_FOUND)
        
        # Convert unit_cost if provided
        if unit_cost:
            unit_cost = Decimal(str(unit_cost))
        else:
            # Use item's cost if available
            unit_cost = item.cost_price or Decimal('0')
        
        estimated_cost = quantity * unit_cost
        
        # Check if approval is required
        config, _ = InventoryConfig.objects.get_or_create(
            owner=request.user,
            branch=request.user.branch
        )
        
        requires_approval = config.requires_adjustment_approval(estimated_cost)
        
        if requires_approval:
            # Create approval request using ReferenceService
            from common.services.reference_service import ReferenceService
            
            tenant = getattr(request.user, 'tenant', request.user)
            
            request_number = ReferenceService.generate_reference(
                module='inventory',
                model_name='stock_adjustment_request',
                tenant=tenant,
                branch=request.user.branch
            )
            
            adjustment_request = StockAdjustmentRequest.objects.create(
                owner=request.user,
                created_by=request.user,
                branch=request.user.branch,
                request_number=request_number,
                requested_by=request.user,
                item=item,
                location=location,
                adjustment_type=adjustment_type,
                quantity=quantity,
                unit_cost=unit_cost,
                estimated_cost=estimated_cost,
                reason=reason,
                notes=notes,
                status='pending'
            )
            
            # CRITICAL: Register the reference number in tracking table
            ReferenceService.register_reference(
                reference_number=request_number,
                module='inventory',
                model_name='stock_adjustment_request',
                object_id=adjustment_request.id,
                tenant=tenant,
                branch=request.user.branch,
                created_by=request.user,
                status='pending',
                amount=estimated_cost if estimated_cost else Decimal('0'),
                metadata={
                    'item_id': item.id,
                    'item_name': item.name,
                    'adjustment_type': adjustment_type,
                    'quantity': str(quantity),
                    'reason': reason
                }
            )
            
            serializer = self.get_serializer(adjustment_request)
            return Response({
                'success': True,
                'message': 'Stock adjustment request created. Awaiting approval.',
                'requires_approval': True,
                'data': serializer.data
            }, status=status.HTTP_201_CREATED)
        
        else:
            # Execute immediately
            adjustment_quantity = quantity if adjustment_type == 'increase' else -quantity
            reference_number = f"ADJ-{timezone.now().strftime('%Y%m%d-%H%M%S')}"
            
            stock, movement = InventoryService.adjust_stock(
                item=item,
                location=location,
                adjustment_quantity=adjustment_quantity,
                reason=reason,
                reference_number=reference_number,
                user=request.user
            )
            
            return Response({
                'success': True,
                'message': 'Stock adjusted successfully (no approval required)',
                'requires_approval': False,
                'movement_id': movement.id if movement else None
            }, status=status.HTTP_201_CREATED)
    
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve stock adjustment request"""
        from inventory.models import StockAdjustmentRequest
        
        adjustment_request = self.get_object()
        
        if adjustment_request.status != 'pending':
            return Response({
                'error': 'Only pending requests can be approved'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        approval_notes = request.data.get('notes', '')
        
        adjustment_request.status = 'approved'
        adjustment_request.approved_by = request.user
        adjustment_request.approved_at = timezone.now()
        adjustment_request.approval_notes = approval_notes
        adjustment_request.save()
        
        serializer = self.get_serializer(adjustment_request)
        return Response({
            'success': True,
            'message': 'Adjustment request approved. Ready for execution.',
            'data': serializer.data
        }, status=status.HTTP_200_OK)
    
    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """Reject stock adjustment request"""
        from inventory.models import StockAdjustmentRequest
        
        adjustment_request = self.get_object()
        
        if adjustment_request.status != 'pending':
            return Response({
                'error': 'Only pending requests can be rejected'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        approval_notes = request.data.get('notes', 'Rejected')
        
        adjustment_request.status = 'rejected'
        adjustment_request.approved_by = request.user
        adjustment_request.approved_at = timezone.now()
        adjustment_request.approval_notes = approval_notes
        adjustment_request.save()
        
        serializer = self.get_serializer(adjustment_request)
        return Response({
            'success': True,
            'message': 'Adjustment request rejected',
            'data': serializer.data
        }, status=status.HTTP_200_OK)
    
    @action(detail=True, methods=['post'])
    @transaction.atomic
    def execute(self, request, pk=None):
        """Execute approved stock adjustment"""
        from inventory.models import StockAdjustmentRequest
        from inventory.stock_service import InventoryService
        
        adjustment_request = self.get_object()
        
        if adjustment_request.status != 'approved':
            return Response({
                'error': 'Only approved requests can be executed'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Execute adjustment
        adjustment_quantity = adjustment_request.quantity if adjustment_request.adjustment_type == 'increase' else -adjustment_request.quantity
        
        stock, movement = InventoryService.adjust_stock(
            item=adjustment_request.item,
            location=adjustment_request.location,
            adjustment_quantity=adjustment_quantity,
            reason=f"Approved by {adjustment_request.approved_by.get_full_name()}. {adjustment_request.reason}",
            reference_number=adjustment_request.request_number,
            user=request.user
        )
        
        # Link to movement
        adjustment_request.stock_movement = movement
        adjustment_request.status = 'executed'
        adjustment_request.save()
        
        serializer = self.get_serializer(adjustment_request)
        return Response({
            'success': True,
            'message': 'Stock adjustment executed successfully',
            'data': serializer.data
        }, status=status.HTTP_200_OK)


class StockTransferViewSet(ScopedModelViewSet):
    """
    API endpoint for stock transfers between locations.
    
    Use this to move inventory from one location to another.
    Supports approval workflow based on InventoryConfig settings.
    
    POST /api/inventory/transfers/
    Body: {
        "item_id": 5,
        "from_location_id": 2,
        "to_location_id": 3,
        "quantity": "25.00",
        "notes": "Transfer to branch warehouse",
        "reference_number": "TRF-2026-001",
        "unit_cost": "50.00"  // Optional, for cost-based approval thresholds
    }
    
    POST /api/inventory/transfers/{id}/approve/  - Approve pending transfer
    POST /api/inventory/transfers/{id}/reject/   - Reject pending transfer
    POST /api/inventory/transfers/{id}/execute/  - Execute approved transfer
    """
    permission_module = 'inventory'
    permission_page = 'stock-transfers'
    http_method_names = ['get', 'post', 'head', 'options']
    
    def get_serializer_class(self):
        from inventory.models import StockTransferRequest
        from rest_framework import serializers
        
        class StockTransferRequestSerializer(serializers.ModelSerializer):
            requested_by_name = serializers.CharField(source='requested_by.get_full_name', read_only=True)
            approved_by_name = serializers.CharField(source='approved_by.get_full_name', read_only=True, allow_null=True)
            item_name = serializers.CharField(source='item.name', read_only=True)
            item_sku = serializers.CharField(source='item.sku', read_only=True)
            from_location_name = serializers.CharField(source='from_location.name', read_only=True)
            to_location_name = serializers.CharField(source='to_location.name', read_only=True)
            
            class Meta:
                model = StockTransferRequest
                fields = [
                    'id', 'request_number', 'requested_by', 'requested_by_name',
                    'item', 'item_name', 'item_sku',
                    'from_location', 'from_location_name',
                    'to_location', 'to_location_name',
                    'quantity', 'unit_cost', 'estimated_cost',
                    'reason', 'notes', 'reference_number', 'status',
                    'approved_by', 'approved_by_name', 'approved_at', 'approval_notes',
                    'transfer_out_movement', 'transfer_in_movement',
                    'created_at', 'updated_at'
                ]
                read_only_fields = ['request_number', 'estimated_cost', 'approved_by', 'approved_at', 
                                    'transfer_out_movement', 'transfer_in_movement']
        
        return StockTransferRequestSerializer
    
    def get_queryset(self):
        """Show transfer requests"""
        from inventory.models import StockTransferRequest
        return StockTransferRequest.objects.filter(
            owner__tenant=self.request.user.tenant,
            branch=self.request.user.branch
        ).select_related(
            'item', 'from_location', 'to_location', 'requested_by', 'approved_by'
        ).order_by('-created_at')
    
    @transaction.atomic
    def create(self, request, *args, **kwargs):
        """Create stock transfer (direct or pending approval)"""
        from inventory.stock_service import InventoryService
        from inventory.models import StockTransferRequest
        from inventory.config_models import InventoryConfig
        
        data = request.data
        item_id = data.get('item_id') or data.get('item')
        from_location_id = data.get('from_location_id') or data.get('from_location')
        to_location_id = data.get('to_location_id') or data.get('to_location')
        quantity = Decimal(str(data.get('quantity', 0)))
        reason = data.get('reason', '')
        notes = data.get('notes', '')
        reference_number = data.get('reference_number', '')
        unit_cost = data.get('unit_cost')
        
        # Validate
        if not all([item_id, from_location_id, to_location_id, quantity]):
            return Response({
                'error': 'item_id, from_location_id, to_location_id, and quantity are required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        if from_location_id == to_location_id:
            return Response({
                'error': 'from_location and to_location must be different'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            item = InventoryItem.objects.get(
                pk=item_id,
                owner__tenant=request.user.tenant,
                branch=request.user.branch,
                is_deleted=False
            )
            from_location = Location.objects.get(
                pk=from_location_id,
                owner__tenant=request.user.tenant,
                branch=request.user.branch,
                is_deleted=False
            )
            to_location = Location.objects.get(
                pk=to_location_id,
                owner__tenant=request.user.tenant,
                branch=request.user.branch,
                is_deleted=False
            )
        except (InventoryItem.DoesNotExist, Location.DoesNotExist):
            return Response({
                'error': 'Item or location not found'
            }, status=status.HTTP_404_NOT_FOUND)
        
        # Convert unit_cost if provided
        if unit_cost:
            unit_cost = Decimal(str(unit_cost))
        else:
            # Use item's cost if available
            unit_cost = item.cost_price or Decimal('0')
        
        estimated_cost = quantity * unit_cost
        
        # Check if approval is required
        config, _ = InventoryConfig.objects.get_or_create(
            owner=request.user,
            branch=request.user.branch
        )
        
        requires_approval = config.requires_transfer_approval(estimated_cost)
        
        if requires_approval:
            # Create approval request with unique request_number
            # Generate unique request number by checking today's max sequence
            from django.db import IntegrityError
            max_attempts = 10
            transfer_request = None
            
            for attempt in range(max_attempts):
                try:
                    today = timezone.now().date()
                    # Get today's transfer requests to determine next sequence number
                    today_prefix = f"{config.transfer_prefix}-{today.strftime('%Y%m%d')}"
                    existing_today = StockTransferRequest.objects.filter(
                        request_number__startswith=today_prefix,
                        owner__tenant=request.user.tenant,
                        branch=request.user.branch
                    ).count()
                    
                    request_number = f"{today_prefix}-{existing_today + 1 + attempt:04d}"
                    
                    transfer_request = StockTransferRequest.objects.create(
                        owner=request.user,
                        created_by=request.user,
                        branch=request.user.branch,
                        request_number=request_number,
                        requested_by=request.user,
                        item=item,
                        from_location=from_location,
                        to_location=to_location,
                        quantity=quantity,
                        unit_cost=unit_cost,
                        estimated_cost=estimated_cost,
                        reason=reason,
                        notes=notes,
                        reference_number=reference_number,
                        status='pending'
                    )
                    # Success! Break out of retry loop
                    break
                except IntegrityError as e:
                    error_msg = str(e).lower()
                    if 'request_number' in error_msg and 'unique' in error_msg:
                        # Duplicate request_number, retry with next sequence
                        if attempt == max_attempts - 1:
                            # Last attempt failed
                            logger.error(f"Failed to generate unique request_number after {max_attempts} attempts")
                            return Response({
                                'error': 'Unable to generate unique request number',
                                'detail': 'Please try again. If the issue persists, contact support.',
                                'debug_info': str(e) if request.user.is_staff else None
                            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
                        continue
                    else:
                        # Different integrity error, provide detailed info
                        logger.error(f"IntegrityError creating transfer request: {e}", exc_info=True)
                        
                        # Extract constraint name if available
                        constraint_name = None
                        if 'constraint' in error_msg:
                            try:
                                constraint_name = error_msg.split('constraint')[1].split()[0].strip('"')
                            except:
                                pass
                        
                        return Response({
                            'error': 'Duplicate record detected',
                            'detail': str(e),
                            'constraint': constraint_name,
                            'debug_info': 'A transfer request with these exact details may already exist. Please check pending requests or modify your input.'
                        }, status=status.HTTP_400_BAD_REQUEST)
            
            if not transfer_request:
                return Response({
                    'error': 'Failed to create transfer request',
                    'detail': 'Unable to generate unique request after multiple attempts'
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            
            serializer = self.get_serializer(transfer_request)
            return Response({
                'success': True,
                'message': 'Stock transfer request created. Awaiting approval.',
                'requires_approval': True,
                'data': serializer.data
            }, status=status.HTTP_201_CREATED)
        
        else:
            # Execute immediately
            out_movement, from_stock, to_stock = InventoryService.transfer_stock(
                item=item,
                from_location=from_location,
                to_location=to_location,
                quantity=quantity,
                reference_number=reference_number,
                user=request.user
            )
            
            return Response({
                'success': True,
                'message': 'Stock transferred successfully (no approval required)',
                'requires_approval': False,
                'movement_out_id': out_movement.id if out_movement else None
            }, status=status.HTTP_201_CREATED)
    
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve stock transfer request"""
        from inventory.models import StockTransferRequest
        
        transfer_request = self.get_object()
        
        if transfer_request.status != 'pending':
            return Response({
                'error': 'Only pending requests can be approved'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        approval_notes = request.data.get('notes', '')
        
        transfer_request.status = 'approved'
        transfer_request.approved_by = request.user
        transfer_request.approved_at = timezone.now()
        transfer_request.approval_notes = approval_notes
        transfer_request.save()
        
        serializer = self.get_serializer(transfer_request)
        return Response({
            'success': True,
            'message': 'Transfer request approved. Ready for execution.',
            'data': serializer.data
        }, status=status.HTTP_200_OK)
    
    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """Reject stock transfer request"""
        from inventory.models import StockTransferRequest
        
        transfer_request = self.get_object()
        
        if transfer_request.status != 'pending':
            return Response({
                'error': 'Only pending requests can be rejected'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        approval_notes = request.data.get('notes', 'Rejected')
        
        transfer_request.status = 'rejected'
        transfer_request.approved_by = request.user
        transfer_request.approved_at = timezone.now()
        transfer_request.approval_notes = approval_notes
        transfer_request.save()
        
        serializer = self.get_serializer(transfer_request)
        return Response({
            'success': True,
            'message': 'Transfer request rejected',
            'data': serializer.data
        }, status=status.HTTP_200_OK)
    
    @action(detail=True, methods=['post'])
    @transaction.atomic
    def execute(self, request, pk=None):
        """Execute approved stock transfer"""
        from inventory.models import StockTransferRequest
        from inventory.stock_service import InventoryService
        
        transfer_request = self.get_object()
        
        if transfer_request.status != 'approved':
            return Response({
                'error': 'Only approved requests can be executed'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Execute transfer
        out_movement, from_stock, to_stock = InventoryService.transfer_stock(
            item=transfer_request.item,
            from_location=transfer_request.from_location,
            to_location=transfer_request.to_location,
            quantity=transfer_request.quantity,
            reference_number=transfer_request.reference_number or transfer_request.request_number,
            user=request.user
        )
        
        # Find the transfer movements
        transfer_out = StockMovement.objects.filter(
            item=transfer_request.item,
            from_location=transfer_request.from_location,
            to_location=transfer_request.to_location,
            movement_type='transfer'
        ).order_by('-created_at').first()
        
        transfer_in = StockMovement.objects.filter(
            item=transfer_request.item,
            from_location=transfer_request.from_location,
            to_location=transfer_request.to_location,
            movement_type='transfer'
        ).order_by('-created_at').first()
        
        # Link to movements
        transfer_request.transfer_out_movement = transfer_out
        transfer_request.transfer_in_movement = transfer_in
        transfer_request.status = 'executed'
        transfer_request.save()
        
        serializer = self.get_serializer(transfer_request)
        return Response({
            'success': True,
            'message': 'Stock transfer executed successfully',
            'data': serializer.data
        }, status=status.HTTP_200_OK)


# ================================================================
# ALLOCATION & REDEMPTION VIEWS
# ================================================================

class InventoryAllocationViewSet(ScopedModelViewSet):
    """ViewSet for inventory allocations"""
    permission_module = 'inventory'
    permission_page = 'allocations'
    queryset = InventoryAllocation.objects.all()
    serializer_class = InventoryAllocationSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        queryset = super().get_queryset()
        
        # Annotate with calculated fields
        queryset = queryset.annotate(
            remaining_amount=F('allocated_amount') - F('redeemed_amount'),
            redemption_count=Count('redemptions')
        )
        
        # Prefetch related items
        queryset = queryset.prefetch_related(
            Prefetch('items', queryset=AllocationItem.objects.all()),
            'client',
            'linked_invoice',
            'linked_product',
            'linked_asset'
        )
        
        # Filter by status
        status_param = self.request.query_params.get('status')
        if status_param:
            queryset = queryset.filter(status=status_param)
        
        # Filter by client
        client_id = self.request.query_params.get('client')
        if client_id:
            queryset = queryset.filter(client_id=client_id)
        
        # Filter by allocation type
        allocation_type = self.request.query_params.get('type')
        if allocation_type:
            queryset = queryset.filter(allocation_type=allocation_type)
        
        return queryset.order_by('-created_at')
    
    def get_serializer_class(self):
        if self.action == 'list':
            return AllocationSummarySerializer
        return InventoryAllocationSerializer
    
    @action(detail=False, methods=['get'])
    def search(self, request):
        """
        Search for allocations by number, client name, or client ID
        
        GET /api/inventory/allocations/search/?query=ALLOC-123
        GET /api/inventory/allocations/search/?query=John%20Doe
        """
        query = request.query_params.get('query', '').strip()
        
        if len(query) < 3:
            return Response({
                'success': False,
                'message': 'Search query must be at least 3 characters'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        allocations = self.get_queryset().filter(
            Q(allocation_number__icontains=query) |
            Q(client__name__icontains=query) |
            Q(client__client_id__icontains=query)
        )[:10]  # Limit to 10 results
        
        serializer = AllocationSummarySerializer(allocations, many=True)
        return Response({
            'success': True,
            'data': serializer.data
        })
    
    @action(detail=True, methods=['get'])
    def items(self, request, pk=None):
        """Get allocation items with availability"""
        allocation = self.get_object()
        items = allocation.items.all().select_related('item')
        
        serializer = AllocationItemSerializer(items, many=True)
        return Response({
            'success': True,
            'data': serializer.data
        })
    
    @action(detail=True, methods=['post'])
    def add_item(self, request, pk=None):
        """Add item to allocation"""
        allocation = self.get_object()
        
        if allocation.status != 'active':
            return Response({
                'success': False,
                'message': 'Can only add items to active allocations'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        serializer = AllocationItemSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(allocation=allocation)
            return Response({
                'success': True,
                'message': 'Item added successfully',
                'data': serializer.data
            })
        
        return Response({
            'success': False,
            'errors': serializer.errors
        }, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        """Activate allocation"""
        allocation = self.get_object()
        
        if allocation.status == 'active':
            return Response({
                'success': False,
                'message': 'Allocation is already active'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        allocation.status = 'active'
        allocation.save()
        
        return Response({
            'success': True,
            'message': 'Allocation activated successfully'
        })
    
    @action(detail=True, methods=['post'])
    def suspend(self, request, pk=None):
        """Suspend allocation"""
        allocation = self.get_object()
        
        allocation.status = 'suspended'
        allocation.save()
        
        return Response({
            'success': True,
            'message': 'Allocation suspended successfully'
        })
    
    @action(detail=True, methods=['post'])
    def close(self, request, pk=None):
        """Close allocation"""
        allocation = self.get_object()
        
        allocation.status = 'completed'
        allocation.save()
        
        return Response({
            'success': True,
            'message': 'Allocation closed successfully'
        })


class AllocationRedemptionViewSet(ScopedModelViewSet):
    """ViewSet for allocation redemptions"""
    permission_module = 'inventory'
    permission_page = 'allocation-redemptions'
    queryset = AllocationRedemption.objects.all()
    serializer_class = AllocationRedemptionSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        queryset = super().get_queryset()
        
        # Prefetch related data
        queryset = queryset.prefetch_related(
            Prefetch('items', queryset=RedemptionItem.objects.select_related('allocation_item__item')),
            'allocation__client',
            'redeemed_by'
        )
        
        # Filter by allocation
        allocation_id = self.request.query_params.get('allocation')
        if allocation_id:
            queryset = queryset.filter(allocation_id=allocation_id)
        
        # Filter by date range
        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')
        if date_from:
            queryset = queryset.filter(redemption_date__gte=date_from)
        if date_to:
            queryset = queryset.filter(redemption_date__lte=date_to)
        
        return queryset.order_by('-redemption_date', '-created_at')
    
    @transaction.atomic
    @action(detail=False, methods=['post'])
    def redeem(self, request):
        """
        Process redemption transaction
        
        POST /api/inventory/redemptions/redeem/
        Body: {
            "allocation_id": 1,
            "items": [
                {"allocation_item_id": 1, "quantity": 2},
                {"allocation_item_id": 2, "quantity": 1}
            ],
            "meter_reading": 45350,  // Optional, for fuel allocations
            "notes": "Redemption notes",
            "payment_method": "allocation"
        }
        """
        serializer = RedemptionCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({
                'success': False,
                'errors': serializer.errors
            }, status=status.HTTP_400_BAD_REQUEST)
        
        data = serializer.validated_data
        allocation_id = data['allocation_id']
        items_data = data['items']
        meter_reading = data.get('meter_reading')
        
        try:
            # Get allocation
            allocation = InventoryAllocation.objects.select_for_update().get(
                id=allocation_id,
                owner=request.user,
                is_deleted=False
            )
            
            if allocation.status not in ['active', 'partial_access']:
                return Response({
                    'success': False,
                    'message': f'Allocation is {allocation.status}, cannot redeem'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Check if there's a linked fee entitlement and verify payment status
            fee_entitlement = allocation.fee_entitlements.first()
            if fee_entitlement:
                can_access, reason = fee_entitlement.can_access_service('inventory_redemption')
                if not can_access:
                    return Response({
                        'success': False,
                        'message': f'Cannot redeem items: {reason}',
                        'payment_required': True,
                        'payment_status': {
                            'total_amount': fee_entitlement.total_amount,
                            'amount_paid': fee_entitlement.amount_paid,
                            'minimum_required': fee_entitlement.minimum_required,
                            'balance': fee_entitlement.balance,
                            'payment_percentage': fee_entitlement.payment_percentage
                        }
                    }, status=status.HTTP_402_PAYMENT_REQUIRED)
            
            # Check expiry
            if allocation.valid_until and allocation.valid_until < timezone.now().date():
                return Response({
                    'success': False,
                    'message': 'Allocation has expired'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Calculate totals and validate items
            total_amount = Decimal('0')
            redemption_items = []
            
            for item_data in items_data:
                allocation_item = AllocationItem.objects.select_for_update().get(
                    id=item_data['allocation_item_id'],
                    allocation=allocation,
                    is_deleted=False
                )
                
                quantity = Decimal(str(item_data['quantity']))
                remaining = allocation_item.allocated_quantity - allocation_item.redeemed_quantity
                
                # Validate quantity
                if quantity > remaining:
                    if not allocation.allow_overage:
                        return Response({
                            'success': False,
                            'message': f'Insufficient quantity for {allocation_item.item.name}. Available: {remaining}'
                        }, status=status.HTTP_400_BAD_REQUEST)
                    
                    # Check overage limit
                    overage_percent = ((quantity - remaining) / remaining) * 100
                    if overage_percent > allocation.max_overage_percent:
                        return Response({
                            'success': False,
                            'message': f'Overage exceeds maximum allowed ({allocation.max_overage_percent}%)'
                        }, status=status.HTTP_400_BAD_REQUEST)
                
                # Check one-time only rule
                if allocation_item.is_one_time_only and allocation_item.redeemed_quantity > 0:
                    return Response({
                        'success': False,
                        'message': f'{allocation_item.item.name} can only be redeemed once'
                    }, status=status.HTTP_400_BAD_REQUEST)
                
                item_total = quantity * allocation_item.unit_price
                total_amount += item_total
                
                redemption_items.append({
                    'allocation_item': allocation_item,
                    'quantity': quantity,
                    'unit_price': allocation_item.unit_price,
                    'total': item_total
                })
            
            # Check if allocation has sufficient balance
            remaining_balance = allocation.allocated_amount - allocation.redeemed_amount
            if total_amount > remaining_balance and not allocation.allow_overage:
                return Response({
                    'success': False,
                    'message': f'Insufficient allocation balance. Available: ₦{remaining_balance:,.2f}'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Handle fuel efficiency check
            anomaly_detected = False
            anomaly_reason = None
            fuel_efficiency = None
            efficiency_variance = None
            distance_traveled = None
            previous_meter_reading = allocation.last_meter_reading
            
            if allocation.requires_meter_reading:
                if not meter_reading:
                    return Response({
                        'success': False,
                        'message': 'Meter reading is required for this allocation'
                    }, status=status.HTTP_400_BAD_REQUEST)
                
                # Calculate fuel efficiency
                if previous_meter_reading and previous_meter_reading > 0:
                    distance_traveled = meter_reading - previous_meter_reading
                    
                    # Get fuel quantity from items (assuming fuel is measured in liters)
                    fuel_liters = sum(
                        item['quantity'] for item in redemption_items 
                        if 'fuel' in item['allocation_item'].item.name.lower()
                    )
                    
                    if fuel_liters > 0:
                        fuel_efficiency = distance_traveled / fuel_liters
                        
                        # Get expected efficiency from allocation metadata
                        expected_efficiency = allocation.metadata.get('avg_efficiency', 10.0)  # Default 10 km/L
                        efficiency_variance = ((fuel_efficiency - expected_efficiency) / expected_efficiency) * 100
                        
                        # Check for anomalies (>20% deviation)
                        if abs(efficiency_variance) > 20:
                            anomaly_detected = True
                            anomaly_reason = f"Fuel efficiency variance: {efficiency_variance:.1f}%"
            
            # Create redemption record
            redemption = AllocationRedemption.objects.create(
                allocation=allocation,
                redemption_date=timezone.now(),
                total_amount=total_amount,
                payment_method=data.get('payment_method', 'allocation'),
                payment_reference=data.get('payment_reference', ''),
                meter_reading=meter_reading,
                previous_meter_reading=previous_meter_reading,
                distance_traveled=distance_traveled,
                fuel_efficiency=fuel_efficiency,
                efficiency_variance=efficiency_variance,
                requires_approval=anomaly_detected,
                anomaly_detected=anomaly_detected,
                anomaly_reason=anomaly_reason,
                notes=data.get('notes', ''),
                redeemed_by=request.user,
                owner=request.user,
                branch=request.user.branch,
                created_by=request.user
            )
            
            # Create redemption items
            for item_data in redemption_items:
                RedemptionItem.objects.create(
                    redemption=redemption,
                    allocation_item=item_data['allocation_item'],
                    quantity_redeemed=item_data['quantity'],
                    unit_price=item_data['unit_price'],
                    total_amount=item_data['total']
                )
                
                # Update allocation item
                allocation_item = item_data['allocation_item']
                allocation_item.redeemed_quantity += item_data['quantity']
                allocation_item.save()
            
            # Update allocation
            allocation.redeemed_amount += total_amount
            if meter_reading:
                allocation.last_meter_reading = meter_reading
            
            # Check if allocation should be completed
            if allocation.redeemed_amount >= allocation.allocated_amount:
                allocation.status = 'completed'
            
            allocation.save()
            
            # Serialize and return
            response_serializer = AllocationRedemptionSerializer(redemption)
            
            response_data = {
                'success': True,
                'message': 'Redemption processed successfully',
                'data': response_serializer.data,
                'warning': anomaly_reason if anomaly_detected else None
            }
            
            if anomaly_detected:
                response_data['requires_approval'] = True
            
            return Response(response_data)
            
        except InventoryAllocation.DoesNotExist:
            return Response({
                'success': False,
                'message': 'Allocation not found'
            }, status=status.HTTP_404_NOT_FOUND)
        except AllocationItem.DoesNotExist:
            return Response({
                'success': False,
                'message': 'Allocation item not found'
            }, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Error processing redemption: {str(e)}")
            return Response({
                'success': False,
                'message': f'Error processing redemption: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve a redemption (for anomaly cases)"""
        redemption = self.get_object()
        
        if not redemption.requires_approval:
            return Response({
                'success': False,
                'message': 'This redemption does not require approval'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        if redemption.approved:
            return Response({
                'success': False,
                'message': 'Redemption already approved'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        redemption.approved = True
        redemption.approved_by = request.user
        redemption.approved_at = timezone.now()
        redemption.save()
        
        return Response({
            'success': True,
            'message': 'Redemption approved successfully'
        })
    
    @action(detail=False, methods=['get'])
    def recent(self, request):
        """Get recent redemptions"""
        limit = int(request.query_params.get('limit', 10))
        redemptions = self.get_queryset()[:limit]
        
        serializer = self.get_serializer(redemptions, many=True)
        return Response({
            'success': True,
            'data': serializer.data
        })


class AssetUsageLogViewSet(ScopedModelViewSet):
    """ViewSet for asset usage logs"""
    permission_module = 'inventory'
    permission_page = 'asset-usage-logs'
    queryset = AssetUsageLog.objects.all()
    serializer_class = AssetUsageLogSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        queryset = super().get_queryset()
        
        # Filter by asset
        asset_id = self.request.query_params.get('asset')
        if asset_id:
            queryset = queryset.filter(asset_id=asset_id)
        
        return queryset.order_by('-log_date', '-created_at')


# ================================================================
# INVENTORY VALUATION & COST TRACKING
# ================================================================

class InventoryCostLayerViewSet(ScopedModelViewSet):
    """ViewSet for viewing inventory cost layers"""
    permission_module = 'inventory'
    permission_page = 'cost-layers'
    queryset = InventoryCostLayer.objects.all()
    serializer_class = InventoryCostLayerSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['item', 'location', 'transaction_type', 'is_depleted']
    ordering_fields = ['transaction_date', 'created_at', 'unit_cost']
    ordering = ['transaction_date', 'created_at']
    
    def get_queryset(self):
        queryset = super().get_queryset()
        
        # Filter by date range
        start_date = self.request.query_params.get('start_date')
        end_date = self.request.query_params.get('end_date')
        
        if start_date:
            queryset = queryset.filter(transaction_date__gte=start_date)
        if end_date:
            queryset = queryset.filter(transaction_date__lte=end_date)
        
        # Filter active layers only
        active_only = self.request.query_params.get('active_only', 'false').lower() == 'true'
        if active_only:
            queryset = queryset.filter(is_depleted=False, quantity_remaining__gt=0)
        
        return queryset


class CostLayerConsumptionViewSet(ScopedModelViewSet):
    """ViewSet for viewing cost layer consumption records"""
    permission_module = 'inventory'
    permission_page = 'cost-layer-consumptions'
    queryset = CostLayerConsumption.objects.all()
    serializer_class = CostLayerConsumptionSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['movement', 'cost_layer']
    ordering_fields = ['consumption_date', 'created_at']
    ordering = ['-consumption_date']
    
    def get_queryset(self):
        queryset = super().get_queryset()
        
        # Filter by item
        item_id = self.request.query_params.get('item')
        if item_id:
            queryset = queryset.filter(cost_layer__item_id=item_id)
        
        # Filter by date range
        start_date = self.request.query_params.get('start_date')
        end_date = self.request.query_params.get('end_date')
        
        if start_date:
            queryset = queryset.filter(consumption_date__gte=start_date)
        if end_date:
            queryset = queryset.filter(consumption_date__lte=end_date)
        
        return queryset


class ItemValuationViewSet(viewsets.GenericViewSet):
    """ViewSet for item valuation operations"""
    permission_module = 'inventory'
    permission_page = 'item-valuations'
    permission_classes = [IsAuthenticated]
    
    @action(detail=True, methods=['get'], url_path='valuation')
    def get_valuation(self, request, pk=None):
        """
        Get current valuation for an inventory item
        GET /api/inventory/items/{id}/valuation/
        """
        try:
            item = InventoryItem.objects.get(
                pk=pk,
                owner=request.user,
                is_deleted=False
            )
        except InventoryItem.DoesNotExist:
            return Response(
                {'error': 'Item not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Get stock across all locations
        stock_records = InventoryStock.objects.filter(
            item=item,
            is_deleted=False
        )
        
        total_quantity = sum(s.quantity_on_hand for s in stock_records)
        total_value = sum(s.total_value for s in stock_records)
        
        # Get active cost layers
        active_layers = InventoryCostLayer.objects.filter(
            item=item,
            is_depleted=False,
            quantity_remaining__gt=0
        )
        
        data = {
            'item_id': item.id,
            'sku': item.sku,
            'name': item.name,
            'valuation_method': item.valuation_method,
            'quantity_on_hand': total_quantity,
            'average_cost': total_value / total_quantity if total_quantity > 0 else Decimal('0'),
            'total_value': total_value,
            'category': item.category.name,
            'locations': stock_records.count(),
            'active_cost_layers': active_layers.count(),
            'cost_layers_total_qty': sum(layer.quantity_remaining for layer in active_layers),
            'cost_layers_total_value': sum(layer.remaining_value for layer in active_layers)
        }
        
        return Response(data)
    
    @action(detail=True, methods=['post'], url_path='recalculate')
    def recalculate_valuation(self, request, pk=None):
        """
        Recalculate valuation for an inventory item
        POST /api/inventory/items/{id}/recalculate/
        """
        try:
            item = InventoryItem.objects.get(
                pk=pk,
                owner=request.user,
                is_deleted=False
            )
        except InventoryItem.DoesNotExist:
            return Response(
                {'error': 'Item not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        from inventory.services.valuation_service import InventoryValuationService
        
        # Recalculate for all locations
        locations = Location.objects.filter(
            branch=item.branch,
            is_deleted=False
        )
        
        results = []
        for location in locations:
            service = InventoryValuationService(item, location)
            result = service.recalculate_stock_valuation()
            results.append({
                'location': location.name,
                **result
            })
        
        return Response({
            'message': 'Valuation recalculated successfully',
            'item': item.sku,
            'results': results
        })
    
    @action(detail=False, methods=['get'], url_path='valuation-report')
    def valuation_report(self, request):
        """
        Get inventory valuation report
        GET /api/inventory/items/valuation-report/
        """
        from inventory.services.valuation_service import BatchValuationService
        
        # Get filters
        branch_id = request.query_params.get('branch_id')
        category_id = request.query_params.get('category_id')
        location_id = request.query_params.get('location_id')
        
        branch = request.user.branch if not branch_id else None
        category = None
        if category_id:
            try:
                from inventory.models import InventoryCategory
                category = InventoryCategory.objects.get(pk=category_id)
            except InventoryCategory.DoesNotExist:
                pass
        
        location = None
        if location_id:
            try:
                from inventory.models import Location
                location = Location.objects.get(pk=location_id)
            except Location.DoesNotExist:
                pass
        
        # Generate report
        report = BatchValuationService.get_valuation_report(
            branch=branch,
            category=category,
            location=location
        )
        
        # Filter by valuation method if specified
        method = request.query_params.get('valuation_method')
        if method:
            report = [r for r in report if r['valuation_method'] == method]
        
        # Calculate totals
        total_quantity = sum(r['quantity_on_hand'] for r in report)
        total_value = sum(r['total_value'] for r in report)
        
        return Response({
            'items': report,
            'summary': {
                'total_items': len(report),
                'total_quantity': total_quantity,
                'total_value': total_value,
                'average_cost': total_value / total_quantity if total_quantity > 0 else Decimal('0')
            }
        })
    
    @action(detail=False, methods=['post'], url_path='recalculate-all')
    def recalculate_all(self, request):
        """
        Recalculate valuation for all items
        POST /api/inventory/items/recalculate-all/
        """
        from inventory.services.valuation_service import BatchValuationService
        
        branch = request.user.branch
        category_id = request.data.get('category_id')
        
        category = None
        if category_id:
            try:
                from inventory.models import InventoryCategory
                category = InventoryCategory.objects.get(pk=category_id)
            except InventoryCategory.DoesNotExist:
                pass
        
        # Run batch recalculation
        result = BatchValuationService.recalculate_all_items(
            branch=branch,
            category=category
        )
        
        return Response({
            'message': 'Batch recalculation completed',
            **result
        })


class WriteOffRequestViewSet(ScopedModelViewSet):
    """
    API endpoint for inventory write-off approval workflow.
    
    Use this to write off damaged, expired, or obsolete inventory.
    Supports approval workflow based on InventoryConfig settings.
    
    POST /api/inventory/writeoffs/
    Body: {
        "item_id": 5,
        "location_id": 2,
        "quantity": "10.00",
        "unit_cost": "50.00",
        "reason": "Damaged in warehouse",
        "notes": "Water damage from roof leak"
    }
    
    POST /api/inventory/writeoffs/{id}/approve/  - Approve pending write-off
    POST /api/inventory/writeoffs/{id}/reject/   - Reject pending write-off
    POST /api/inventory/writeoffs/{id}/execute/  - Execute approved write-off
    """
    permission_module = 'inventory'
    permission_page = 'write-offs'
    http_method_names = ['get', 'post', 'head', 'options']
    
    def get_serializer_class(self):
        from inventory.models import WriteOffRequest
        from rest_framework import serializers
        
        class WriteOffRequestSerializer(serializers.ModelSerializer):
            requested_by_name = serializers.CharField(source='requested_by.get_full_name', read_only=True)
            approved_by_name = serializers.CharField(source='approved_by.get_full_name', read_only=True, allow_null=True)
            item_name = serializers.CharField(source='item.name', read_only=True)
            item_sku = serializers.CharField(source='item.sku', read_only=True)
            location_name = serializers.CharField(source='location.name', read_only=True)
            
            class Meta:
                model = WriteOffRequest
                fields = [
                    'id', 'request_number', 'requested_by', 'requested_by_name',
                    'item', 'item_name', 'item_sku',
                    'location', 'location_name',
                    'quantity', 'unit_cost', 'estimated_cost',
                    'reason', 'notes', 'status',
                    'approved_by', 'approved_by_name', 'approved_at', 'approval_notes',
                    'stock_movement',
                    'created_at', 'updated_at'
                ]
                read_only_fields = ['request_number', 'estimated_cost', 'approved_by', 'approved_at', 'stock_movement']
        
        return WriteOffRequestSerializer
    
    def get_queryset(self):
        """Show write-off requests"""
        from inventory.models import WriteOffRequest
        return WriteOffRequest.objects.filter(
            owner__tenant=self.request.user.tenant,
            branch=self.request.user.branch
        ).select_related(
            'item', 'location', 'requested_by', 'approved_by'
        ).order_by('-created_at')
    
    @transaction.atomic
    def create(self, request, *args, **kwargs):
        """Create write-off request (direct or pending approval)"""
        from inventory.stock_service import InventoryService
        from inventory.models import WriteOffRequest
        from inventory.config_models import InventoryConfig
        
        data = request.data
        item_id = data.get('item_id') or data.get('item')
        location_id = data.get('location_id') or data.get('location')
        quantity = Decimal(str(data.get('quantity', 0)))
        reason = data.get('reason', '')
        notes = data.get('notes', '')
        unit_cost = data.get('unit_cost')
        
        # Validate
        if not all([item_id, location_id, quantity, reason]):
            return Response({
                'error': 'item_id, location_id, quantity, and reason are required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            item = InventoryItem.objects.get(
                pk=item_id,
                owner__tenant=request.user.tenant,
                branch=request.user.branch,
                is_deleted=False
            )
            location = Location.objects.get(
                pk=location_id,
                owner__tenant=request.user.tenant,
                branch=request.user.branch,
                is_deleted=False
            )
        except (InventoryItem.DoesNotExist, Location.DoesNotExist):
            return Response({
                'error': 'Item or location not found'
            }, status=status.HTTP_404_NOT_FOUND)
        
        # Convert unit_cost if provided
        if unit_cost:
            unit_cost = Decimal(str(unit_cost))
        else:
            # Use item's cost if available
            unit_cost = item.cost_price or Decimal('0')
        
        estimated_cost = quantity * unit_cost
        
        # Check if approval is required
        config, _ = InventoryConfig.objects.get_or_create(
            owner=request.user,
            branch=request.user.branch
        )
        
        requires_approval = config.requires_writeoff_approval(estimated_cost)
        
        if requires_approval:
            # Create approval request
            request_number = f"WO-{timezone.now().strftime('%Y%m%d')}-{WriteOffRequest.objects.count() + 1:04d}"
            
            writeoff_request = WriteOffRequest.objects.create(
                owner=request.user,
                created_by=request.user,
                branch=request.user.branch,
                request_number=request_number,
                requested_by=request.user,
                item=item,
                location=location,
                quantity=quantity,
                unit_cost=unit_cost,
                estimated_cost=estimated_cost,
                reason=reason,
                notes=notes,
                status='pending'
            )
            
            serializer = self.get_serializer(writeoff_request)
            return Response({
                'success': True,
                'message': 'Write-off request created. Awaiting approval.',
                'requires_approval': True,
                'data': serializer.data
            }, status=status.HTTP_201_CREATED)
        
        else:
            # Execute immediately
            stock, movement = InventoryService.adjust_stock(
                item=item,
                location=location,
                adjustment_quantity=-quantity,
                reason=f"Write-off: {reason}",
                reference_number=f"WO-{timezone.now().strftime('%Y%m%d-%H%M%S')}",
                user=request.user
            )
            
            return Response({
                'success': True,
                'message': 'Write-off executed successfully (no approval required)',
                'requires_approval': False,
                'movement_id': movement.id if movement else None
            }, status=status.HTTP_201_CREATED)
    
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve write-off request"""
        from inventory.models import WriteOffRequest
        
        writeoff_request = self.get_object()
        
        if writeoff_request.status != 'pending':
            return Response({
                'error': 'Only pending requests can be approved'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        approval_notes = request.data.get('notes', '')
        
        writeoff_request.status = 'approved'
        writeoff_request.approved_by = request.user
        writeoff_request.approved_at = timezone.now()
        writeoff_request.approval_notes = approval_notes
        writeoff_request.save()
        
        serializer = self.get_serializer(writeoff_request)
        return Response({
            'success': True,
            'message': 'Write-off request approved. Ready for execution.',
            'data': serializer.data
        }, status=status.HTTP_200_OK)
    
    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """Reject write-off request"""
        from inventory.models import WriteOffRequest
        
        writeoff_request = self.get_object()
        
        if writeoff_request.status != 'pending':
            return Response({
                'error': 'Only pending requests can be rejected'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        approval_notes = request.data.get('notes', 'Rejected')
        
        writeoff_request.status = 'rejected'
        writeoff_request.approved_by = request.user
        writeoff_request.approved_at = timezone.now()
        writeoff_request.approval_notes = approval_notes
        writeoff_request.save()
        
        serializer = self.get_serializer(writeoff_request)
        return Response({
            'success': True,
            'message': 'Write-off request rejected',
            'data': serializer.data
        }, status=status.HTTP_200_OK)
    
    @action(detail=True, methods=['post'])
    @transaction.atomic
    def execute(self, request, pk=None):
        """Execute approved write-off"""
        from inventory.models import WriteOffRequest
        from inventory.stock_service import InventoryService
        
        writeoff_request = self.get_object()
        
        if writeoff_request.status != 'approved':
            return Response({
                'error': 'Only approved requests can be executed'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Execute write-off
        stock, movement = InventoryService.adjust_stock(
            item=writeoff_request.item,
            location=writeoff_request.location,
            adjustment_quantity=-writeoff_request.quantity,
            reason=f"Write-off (Approved by {writeoff_request.approved_by.get_full_name()}): {writeoff_request.reason}",
            reference_number=writeoff_request.request_number,
            user=request.user
        )
        
        # Update movement type to write_off (adjust_stock creates 'adjustment' type)
        movement.movement_type = 'write_off'
        movement.save()
        
        # Link to movement
        writeoff_request.stock_movement = movement
        writeoff_request.status = 'executed'
        writeoff_request.save()
        
        serializer = self.get_serializer(writeoff_request)
        return Response({
            'success': True,
            'message': 'Write-off executed successfully',
            'data': serializer.data
        }, status=status.HTTP_200_OK)


class SalesOrderViewSet(ScopedModelViewSet):
    """
    API endpoint for sales orders with approval workflow.
    
    POST /api/inventory/sales-orders/
    Body: {
        "client_id": 3,
        "order_date": "2026-01-08",
        "items": [
            {
                "item_id": 5,
                "quantity": "10",
                "unit_price": "100.00"
            }
        ]
    }
    
    POST /api/inventory/sales-orders/{id}/submit/   - Submit for approval
    POST /api/inventory/sales-orders/{id}/approve/  - Approve order
    POST /api/inventory/sales-orders/{id}/reject/   - Reject order
    POST /api/inventory/sales-orders/{id}/confirm/  - Confirm approved order
    """
    permission_module = 'inventory'
    permission_page = 'sales-orders'
    http_method_names = ['get', 'post', 'patch', 'head', 'options']
    
    def get_serializer_class(self):
        from inventory.models import SalesOrder, SalesOrderItem
        from clients.models import Client
        from rest_framework import serializers
        
        class SalesOrderItemSerializer(serializers.ModelSerializer):
            item_name = serializers.CharField(source='item.name', read_only=True)
            item_sku = serializers.CharField(source='item.sku', read_only=True)
            
            class Meta:
                model = SalesOrderItem
                fields = ['id', 'item', 'item_name', 'item_sku', 'description', 
                         'quantity', 'unit_price', 'discount', 'total_price', 'quantity_delivered']
                read_only_fields = ['total_price']
        
        class SalesOrderSerializer(serializers.ModelSerializer):
            client_name = serializers.CharField(source='client.name', read_only=True)
            approved_by_name = serializers.CharField(source='approved_by.get_full_name', read_only=True, allow_null=True)
            items = SalesOrderItemSerializer(many=True, read_only=True)
            
            class Meta:
                model = SalesOrder
                fields = [
                    'id', 'so_number', 'client', 'client_name',
                    'order_date', 'expected_delivery_date',
                    'status', 'subtotal', 'discount', 'tax_amount', 'total_amount',
                    'approved_by', 'approved_by_name', 'approved_at', 'approval_notes',
                    'notes', 'items', 'created_at', 'updated_at'
                ]
                read_only_fields = ['so_number', 'approved_by', 'approved_at']
        
        return SalesOrderSerializer
    
    def get_queryset(self):
        from inventory.models import SalesOrder
        return SalesOrder.objects.filter(
            owner__tenant=self.request.user.tenant,
            branch=self.request.user.branch
        ).select_related('client', 'approved_by').prefetch_related('items').order_by('-created_at')
    
    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        """Submit sales order for approval"""
        from inventory.config_models import InventoryConfig
        
        order = self.get_object()
        
        if order.status not in ['draft']:
            return Response({
                'error': 'Only draft orders can be submitted for approval'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Check if approval required
        config, _ = InventoryConfig.objects.get_or_create(
            owner=request.user,
            branch=request.user.branch
        )
        
        requires_approval = config.requires_sales_order_approval(order.total_amount)
        
        if requires_approval:
            order.status = 'pending_approval'
            order.save()
            
            serializer = self.get_serializer(order)
            return Response({
                'success': True,
                'requires_approval': True,
                'message': 'Sales order submitted for approval',
                'data': serializer.data
            }, status=status.HTTP_200_OK)
        else:
            # Auto-approve
            order.status = 'confirmed'
            order.save()
            
            serializer = self.get_serializer(order)
            return Response({
                'success': True,
                'requires_approval': False,
                'message': 'Sales order confirmed (no approval required)',
                'data': serializer.data
            }, status=status.HTTP_200_OK)
    
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve sales order"""
        order = self.get_object()
        
        if order.status != 'pending_approval':
            return Response({
                'error': 'Only pending orders can be approved'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        approval_notes = request.data.get('notes', '')
        
        order.status = 'approved'
        order.approved_by = request.user
        order.approved_at = timezone.now()
        order.approval_notes = approval_notes
        order.save()
        
        serializer = self.get_serializer(order)
        return Response({
            'success': True,
            'message': 'Sales order approved',
            'data': serializer.data
        }, status=status.HTTP_200_OK)
    
    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """Reject sales order"""
        order = self.get_object()
        
        if order.status != 'pending_approval':
            return Response({
                'error': 'Only pending orders can be rejected'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        approval_notes = request.data.get('notes', 'Rejected')
        
        order.status = 'rejected'
        order.approved_by = request.user
        order.approved_at = timezone.now()
        order.approval_notes = approval_notes
        order.save()
        
        serializer = self.get_serializer(order)
        return Response({
            'success': True,
            'message': 'Sales order rejected',
            'data': serializer.data
        }, status=status.HTTP_200_OK)
    
    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        """Confirm approved sales order for processing"""
        order = self.get_object()
        
        if order.status not in ['approved']:
            return Response({
                'error': 'Only approved orders can be confirmed'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        order.status = 'confirmed'
        order.save()
        
        serializer = self.get_serializer(order)
        return Response({
            'success': True,
            'message': 'Sales order confirmed and ready for processing',
            'data': serializer.data
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Cancel a sales order"""
        order = self.get_object()

        non_cancellable = ['delivered', 'cancelled']
        if order.status in non_cancellable:
            return Response({
                'error': f'Cannot cancel an order with status "{order.status}"'
            }, status=status.HTTP_400_BAD_REQUEST)

        reason = request.data.get('reason', '')
        order.status = 'cancelled'
        if reason:
            order.notes = f"{order.notes or ''}\n[Cancelled] {reason}".strip()
        order.save()

        serializer = self.get_serializer(order)
        return Response({
            'success': True,
            'message': 'Sales order cancelled',
            'data': serializer.data
        }, status=status.HTTP_200_OK)

# ================================================================
# PHYSICAL COUNT / INVENTORY VARIANCE API
# ================================================================

class PhysicalCountViewSet(ScopedModelViewSet):
    """
    API endpoints for physical inventory counts
    
    Physical counts are used to verify actual stock quantities against system records
    and identify variances for reconciliation.
    
    Workflow:
    1. Create count (POST /physical-counts/) - status=draft
    2. Add count lines (POST /physical-counts/{id}/add_lines/)
    3. Submit for review (POST /physical-counts/{id}/submit/)
    4. Review and approve (POST /physical-counts/{id}/approve/)
    5. Post adjustments (POST /physical-counts/{id}/post_adjustments/)
    
    Endpoints:
    - GET /physical-counts/ - List all counts
    - POST /physical-counts/ - Create new count
    - GET /physical-counts/{id}/ - Get count details
    - PUT/PATCH /physical-counts/{id}/ - Update count
    - POST /physical-counts/{id}/add_lines/ - Add count lines
    - POST /physical-counts/{id}/submit/ - Submit for review
    - POST /physical-counts/{id}/approve/ - Approve count
    - POST /physical-counts/{id}/reject/ - Reject count
    - POST /physical-counts/{id}/post_adjustments/ - Post variance adjustments
    - GET /physical-counts/{id}/variance_report/ - Get variance analysis
    - GET /physical-counts/variance_summary/ - Get variance summary across counts
    """
    permission_module = 'inventory'
    permission_page = 'physical-counts'
    from .serializers import PhysicalCountSerializer, PhysicalCountListSerializer
    from .models import PhysicalCount
    
    queryset = PhysicalCount.objects.all()
    serializer_class = PhysicalCountSerializer
    filterset_fields = ['status', 'location', 'count_date', 'counted_by']
    search_fields = ['count_number', 'notes']
    ordering_fields = ['count_date', 'created_at', 'total_variance_value']
    ordering = ['-count_date']
    
    def get_serializer_class(self):
        """Use list serializer for list action"""
        if self.action == 'list':
            from .serializers import PhysicalCountListSerializer
            return PhysicalCountListSerializer
        return super().get_serializer_class()
    
    def perform_create(self, serializer):
        """Set counted_by and apply branch/tenant scoping."""
        user, branch, tenant = self._resolve_create_scope()
        serializer.save(counted_by=user, owner=user, branch=branch, tenant=tenant)
    
    @action(detail=True, methods=['post'])
    def add_lines(self, request, pk=None):
        """
        Add multiple count lines to a physical count
        
        POST /physical-counts/{id}/add_lines/
        {
            "lines": [
                {
                    "item_id": 1,
                    "counted_quantity": "100.00",
                    "notes": "Bin A",
                    "variance_reason": "shrinkage"
                },
                ...
            ]
        }
        """
        from .models import PhysicalCountLine, InventoryStock
        from .serializers import PhysicalCountLineCreateSerializer, PhysicalCountLineSerializer
        
        count = self.get_object()
        
        if count.status not in ['draft', 'in_progress']:
            return Response({
                'error': 'Can only add lines to draft or in-progress counts'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        lines_data = request.data.get('lines', [])
        if not lines_data:
            return Response({
                'error': 'No lines provided'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Validate input
        serializer = PhysicalCountLineCreateSerializer(data=lines_data, many=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        created_lines = []
        errors = []
        
        with transaction.atomic():
            for line_data in serializer.validated_data:
                item_id = line_data['item_id']
                counted_qty = line_data['counted_quantity']
                notes = line_data.get('notes', '')
                variance_reason = line_data.get('variance_reason', '')
                
                try:
                    # Get or create stock record for this item at the count location
                    from .models import InventoryItem
                    item = InventoryItem.objects.get(id=item_id, owner=count.owner)
                    
                    stock, created = InventoryStock.objects.get_or_create(
                        item=item,
                        location=count.location,
                        defaults={
                            'owner': count.owner,
                            'branch': count.branch,
                            'quantity_on_hand': 0,
                            'quantity_reserved': 0,
                            'quantity_available': 0,
                            'average_cost': item.cost_price
                        }
                    )
                    
                    # Create count line
                    count_line = PhysicalCountLine.objects.create(
                        physical_count=count,
                        item=item,
                        system_quantity=stock.quantity_on_hand,
                        counted_quantity=counted_qty,
                        unit_cost=stock.average_cost,
                        variance_reason=variance_reason,
                        notes=notes,
                        owner=count.owner,
                        branch=count.branch
                    )
                    
                    created_lines.append(count_line)
                    
                except Exception as e:
                    errors.append(f"Item {item_id}: {str(e)}")
            
            # Update count status to in_progress if it was draft
            if count.status == 'draft':
                count.status = 'in_progress'
                count.save()
            
            # Recalculate summary
            count.calculate_summary()
        
        if errors:
            return Response({
                'success': False,
                'errors': errors,
                'created_count': len(created_lines)
            }, status=status.HTTP_207_MULTI_STATUS)
        
        # Return created lines
        lines_serializer = PhysicalCountLineSerializer(created_lines, many=True)
        return Response({
            'success': True,
            'message': f'Added {len(created_lines)} count lines',
            'data': lines_serializer.data
        }, status=status.HTTP_201_CREATED)
    
    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        """Submit count for review"""
        count = self.get_object()
        
        if count.status not in ['draft', 'in_progress']:
            return Response({
                'error': 'Count already submitted or approved'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        if count.count_lines.count() == 0:
            return Response({
                'error': 'Cannot submit count with no lines'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        count.status = 'pending_review'
        count.save()
        
        serializer = self.get_serializer(count)
        return Response({
            'success': True,
            'message': 'Physical count submitted for review',
            'data': serializer.data
        })
    
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve count after review"""
        count = self.get_object()
        
        if count.status != 'pending_review':
            return Response({
                'error': 'Count must be pending review to approve'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        review_notes = request.data.get('notes', '')
        
        count.status = 'approved'
        count.reviewed_by = request.user
        count.reviewed_at = timezone.now()
        count.review_notes = review_notes
        count.save()
        
        serializer = self.get_serializer(count)
        return Response({
            'success': True,
            'message': 'Physical count approved',
            'data': serializer.data
        })
    
    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """Reject count and return to draft"""
        count = self.get_object()
        
        if count.status != 'pending_review':
            return Response({
                'error': 'Only pending counts can be rejected'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        review_notes = request.data.get('notes', '')
        
        count.status = 'draft'
        count.reviewed_by = request.user
        count.reviewed_at = timezone.now()
        count.review_notes = review_notes
        count.save()
        
        serializer = self.get_serializer(count)
        return Response({
            'success': True,
            'message': 'Physical count rejected and returned to draft',
            'data': serializer.data
        })
    
    @action(detail=True, methods=['post'])
    def post_adjustments(self, request, pk=None):
        """
        Post stock adjustments for all variances
        Creates stock movements and updates inventory quantities
        """
        from .services import InventoryService
        
        count = self.get_object()
        
        if count.status != 'approved':
            return Response({
                'error': 'Only approved counts can be posted'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Check if already posted
        if count.count_lines.filter(adjustment_posted=True).exists():
            return Response({
                'error': 'Adjustments have already been posted for this count'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        posted_count = 0
        errors = []
        
        with transaction.atomic():
            inventory_service = InventoryService(
                owner=count.owner,
                branch=count.branch,
                user=request.user
            )
            
            for line in count.count_lines.all():
                if line.variance == 0:
                    # No adjustment needed
                    line.adjustment_posted = True
                    line.save()
                    continue
                
                try:
                    # Get stock record
                    stock = InventoryStock.objects.get(
                        item=line.item,
                        location=count.location,
                        owner=count.owner
                    )
                    
                    # Determine adjustment type
                    if line.variance > 0:
                        # Surplus - increase stock
                        movement = inventory_service.adjust_stock(
                            stock=stock,
                            quantity=abs(line.variance),
                            adjustment_type='surplus',
                            reason=f"Physical count surplus: {count.count_number}",
                            reference=count.count_number,
                            notes=f"Variance reason: {line.get_variance_reason_display()}. {line.notes}"
                        )
                    else:
                        # Shortage - decrease stock
                        movement = inventory_service.adjust_stock(
                            stock=stock,
                            quantity=abs(line.variance),
                            adjustment_type='shortage',
                            reason=f"Physical count shortage: {count.count_number}",
                            reference=count.count_number,
                            notes=f"Variance reason: {line.get_variance_reason_display()}. {line.notes}"
                        )
                    
                    line.adjustment_posted = True
                    line.stock_movement = movement
                    line.save()
                    posted_count += 1
                    
                except Exception as e:
                    errors.append(f"Line {line.id} ({line.item.sku}): {str(e)}")
            
            # Mark count as posted
            count.status = 'posted'
            count.save()
        
        if errors:
            return Response({
                'success': False,
                'errors': errors,
                'posted_count': posted_count
            }, status=status.HTTP_207_MULTI_STATUS)
        
        return Response({
            'success': True,
            'message': f'Posted {posted_count} stock adjustments',
            'posted_count': posted_count
        })
    
    @action(detail=True, methods=['get'])
    def variance_report(self, request, pk=None):
        """
        Get detailed variance analysis for a physical count
        
        Returns:
        - Summary statistics
        - Variance by category
        - Variance by reason
        - Top variances by value
        """
        count = self.get_object()
        lines = count.count_lines.select_related('item', 'item__category')
        
        # Summary
        summary = {
            'total_lines': lines.count(),
            'total_variance_value': str(Decimal(str(count.total_variance_value))),
            'lines_with_variance': lines.exclude(variance=0).count(),
            'surplus_lines': lines.filter(variance__gt=0).count(),
            'shortage_lines': lines.filter(variance__lt=0).count(),
            'total_surplus_value': str(Decimal(str(lines.filter(variance__gt=0).aggregate(
                total=Sum('variance_value'))['total'] or 0))),
            'total_shortage_value': str(Decimal(str(lines.filter(variance__lt=0).aggregate(
                total=Sum('variance_value'))['total'] or 0))),
        }
        
        # By category
        by_category = []
        from django.db.models import Sum as DjangoSum
        categories = lines.values('item__category__name').annotate(
            line_count=Count('id'),
            variance_value=DjangoSum('variance_value')
        ).order_by('-variance_value')
        
        for cat in categories:
            by_category.append({
                'category': cat['item__category__name'] or 'Uncategorized',
                'line_count': cat['line_count'],
                'variance_value': str(Decimal(str(cat['variance_value'] or 0)))
            })
        
        # By reason
        by_reason = []
        reasons = lines.exclude(variance_reason='').values('variance_reason').annotate(
            line_count=Count('id'),
            variance_value=DjangoSum('variance_value')
        ).order_by('-variance_value')
        
        for reason in reasons:
            by_reason.append({
                'reason': reason['variance_reason'],
                'line_count': reason['line_count'],
                'variance_value': str(Decimal(str(reason['variance_value'] or 0)))
            })
        
        # Top variances
        from .serializers import PhysicalCountLineSerializer
        top_variances = lines.order_by('-variance_value')[:20]
        top_variances_data = PhysicalCountLineSerializer(top_variances, many=True).data
        
        return Response({
            'success': True,
            'data': {
                'summary': summary,
                'by_category': by_category,
                'by_reason': by_reason,
                'top_variances': top_variances_data
            }
        })
    
    @action(detail=False, methods=['get'])
    def variance_summary(self, request):
        """
        Get variance summary across multiple physical counts
        Supports filtering by date range, location, status
        """
        from .serializers import VarianceReportSerializer
        from .models import PhysicalCountLine
        
        # Validate filters
        serializer = VarianceReportSerializer(data=request.query_params)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        filters = serializer.validated_data
        
        # Build queryset
        counts_qs = self.get_queryset()
        
        if filters.get('location_id'):
            counts_qs = counts_qs.filter(location_id=filters['location_id'])
        if filters.get('start_date'):
            counts_qs = counts_qs.filter(count_date__gte=filters['start_date'])
        if filters.get('end_date'):
            counts_qs = counts_qs.filter(count_date__lte=filters['end_date'])
        
        # Get all lines from matching counts
        lines_qs = PhysicalCountLine.objects.filter(
            physical_count__in=counts_qs
        ).select_related('item', 'item__category', 'physical_count__location')
        
        if filters.get('category_id'):
            lines_qs = lines_qs.filter(item__category_id=filters['category_id'])
        if filters.get('variance_reason'):
            lines_qs = lines_qs.filter(variance_reason=filters['variance_reason'])
        if filters.get('variance_threshold'):
            threshold = filters['variance_threshold']
            lines_qs = lines_qs.filter(
                Q(variance_percent__gte=threshold) | Q(variance_percent__lte=-threshold)
            )
        
        # Summary
        from django.db.models import Sum as DjangoSum, Avg
        summary = lines_qs.aggregate(
            total_lines=Count('id'),
            total_variance_value=DjangoSum('variance_value'),
            avg_variance_percent=Avg('variance_percent')
        )
        
        summary.update({
            'total_lines': summary['total_lines'] or 0,
            'total_variance_value': str(Decimal(str(summary['total_variance_value'] or 0))),
            'avg_variance_percent': str(Decimal(str(summary['avg_variance_percent'] or 0)).quantize(Decimal('0.0001'))),
            'total_counts': counts_qs.count(),
        })
        
        # Group by location
        by_location = []
        locations = lines_qs.values(
            'physical_count__location__name'
        ).annotate(
            line_count=Count('id'),
            variance_value=DjangoSum('variance_value')
        ).order_by('-variance_value')
        
        for loc in locations:
            by_location.append({
                'location': loc['physical_count__location__name'],
                'line_count': loc['line_count'],
                'variance_value': str(Decimal(str(loc['variance_value'] or 0)))
            })
        
        # Group by category
        by_category = []
        categories = lines_qs.values('item__category__name').annotate(
            line_count=Count('id'),
            variance_value=DjangoSum('variance_value')
        ).order_by('-variance_value')
        
        for cat in categories:
            by_category.append({
                'category': cat['item__category__name'] or 'Uncategorized',
                'line_count': cat['line_count'],
                'variance_value': str(Decimal(str(cat['variance_value'] or 0)))
            })
        
        # Group by reason
        by_reason = []
        reasons = lines_qs.exclude(variance_reason='').values('variance_reason').annotate(
            line_count=Count('id'),
            variance_value=DjangoSum('variance_value')
        ).order_by('-variance_value')
        
        for reason in reasons:
            by_reason.append({
                'reason': reason['variance_reason'],
                'line_count': reason['line_count'],
                'variance_value': str(Decimal(str(reason['variance_value'] or 0)))
            })
        
        return Response({
            'success': True,
            'data': {
                'summary': summary,
                'by_location': by_location,
                'by_category': by_category,
                'by_reason': by_reason
            }
        })


class PhysicalCountLineViewSet(ScopedModelViewSet):
    """
    API endpoints for individual physical count lines
    Usually accessed via nested route: /physical-counts/{id}/lines/
    """
    permission_module = 'inventory'
    permission_page = 'physical-count-lines'
    from .models import PhysicalCountLine
    from .serializers import PhysicalCountLineSerializer
    
    queryset = PhysicalCountLine.objects.all()
    serializer_class = PhysicalCountLineSerializer
    filterset_fields = ['physical_count', 'item', 'variance_reason', 'adjustment_posted']
    search_fields = ['item__sku', 'item__name', 'notes']
    ordering_fields = ['variance', 'variance_value', 'variance_percent']
    ordering = ['-variance_value']