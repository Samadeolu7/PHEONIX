# inventory/views_office_use_request.py
"""
Views for the Office Use Request system.
"""
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db import transaction
from django.db.models import Q
import logging

from common.views import ScopedModelViewSet
from common.approval_permissions import IsApprover
from .models_office_use_request import OfficeUseRequest, OfficeUseRequestItem
from .serializers_office_use_request import (
    OfficeUseRequestSerializer,
    OfficeUseRequestCreateSerializer,
    OfficeUseRequestUpdateSerializer,
    OfficeUseRequestActionSerializer,
)

logger = logging.getLogger(__name__)


class OfficeUseRequestViewSet(ScopedModelViewSet):
    """
    ViewSet for Office Use Requests.

    Endpoints (all prefixed with /inventory/office-use-requests/):
      GET    /                  – list
      POST   /                  – create
      GET    /{id}/             – retrieve
      PATCH  /{id}/             – update (draft only)
      DELETE /{id}/             – soft-delete (draft only)
      POST   /{id}/submit/      – submit for approval
      POST   /{id}/approve/     – approve
      POST   /{id}/reject/      – reject
      POST   /{id}/fulfill/     – fulfil (reduces stock + posts journal)
      POST   /{id}/cancel/      – cancel
      GET    /{id}/check-stock/ – validate stock availability
      GET    /summary/          – aggregate counts
    """

    queryset = OfficeUseRequest.objects.all()
    serializer_class = OfficeUseRequestSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.action in ('approve', 'reject'):
            return [IsAuthenticated(), IsApprover()]
        return super().get_permissions()

    def get_queryset(self):
        qs = super().get_queryset()

        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)

        department = self.request.query_params.get('department')
        if department:
            qs = qs.filter(department__icontains=department)

        requested_by = self.request.query_params.get('requested_by')
        if requested_by:
            qs = qs.filter(requested_by_id=requested_by)

        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')
        if date_from:
            qs = qs.filter(request_date__gte=date_from)
        if date_to:
            qs = qs.filter(request_date__lte=date_to)

        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(
                Q(request_number__icontains=search)
                | Q(purpose__icontains=search)
                | Q(department__icontains=search)
                | Q(requested_by__first_name__icontains=search)
                | Q(requested_by__last_name__icontains=search)
            )

        return qs.select_related(
            'requested_by', 'approved_by', 'rejected_by',
            'fulfilled_by', 'delivery_location', 'expense_account',
            'journal_entry',
        ).prefetch_related('items__item__category')

    def get_serializer_class(self):
        if self.action == 'create':
            return OfficeUseRequestCreateSerializer
        if self.action in ['update', 'partial_update']:
            return OfficeUseRequestUpdateSerializer
        return OfficeUseRequestSerializer

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        obj = serializer.save()
        output = OfficeUseRequestSerializer(obj)
        return Response(output.data, status=status.HTTP_201_CREATED)

    # ── Workflow actions ─────────────────────────────────────────────────────

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def submit(self, request, pk=None):
        obj = self.get_object()
        try:
            obj.submit(user=request.user)
            return Response({
                'message': 'Office use request submitted for approval',
                'data': OfficeUseRequestSerializer(obj).data,
            })
        except Exception as exc:
            logger.error(f"Error submitting office-use request {pk}: {exc}")
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def approve(self, request, pk=None):
        obj = self.get_object()
        action_ser = OfficeUseRequestActionSerializer(data=request.data)
        action_ser.is_valid(raise_exception=True)
        try:
            notes = action_ser.validated_data.get('notes', '')
            obj.approve(user=request.user, notes=notes)
            return Response({
                'message': 'Office use request approved',
                'data': OfficeUseRequestSerializer(obj).data,
            })
        except Exception as exc:
            logger.error(f"Error approving office-use request {pk}: {exc}")
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def reject(self, request, pk=None):
        obj = self.get_object()
        action_ser = OfficeUseRequestActionSerializer(data=request.data)
        action_ser.is_valid(raise_exception=True)
        reason = action_ser.validated_data.get('reason', '')
        if not reason:
            return Response(
                {'error': 'A rejection reason is required'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            obj.reject(user=request.user, reason=reason)
            return Response({
                'message': 'Office use request rejected',
                'data': OfficeUseRequestSerializer(obj).data,
            })
        except Exception as exc:
            logger.error(f"Error rejecting office-use request {pk}: {exc}")
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def fulfill(self, request, pk=None):
        obj = self.get_object()
        try:
            journal_entry = obj.fulfill(user=request.user)
            return Response({
                'message': 'Office use request fulfilled successfully',
                'data': OfficeUseRequestSerializer(obj).data,
                'journal_entry_id': journal_entry.id,
                'journal_entry_reference': journal_entry.workflow_reference,
            })
        except Exception as exc:
            logger.error(f"Error fulfilling office-use request {pk}: {exc}")
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def cancel(self, request, pk=None):
        obj = self.get_object()
        try:
            reason = request.data.get('reason', '')
            obj.cancel(user=request.user, reason=reason)
            return Response({
                'message': 'Office use request cancelled',
                'data': OfficeUseRequestSerializer(obj).data,
            })
        except Exception as exc:
            logger.error(f"Error cancelling office-use request {pk}: {exc}")
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    # ── Stock check ──────────────────────────────────────────────────────────

    @action(detail=True, methods=['get'], url_path='check-stock')
    def check_stock_availability(self, request, pk=None):
        obj = self.get_object()
        try:
            is_valid, error_messages = obj.validate_stock_availability()

            from .models import InventoryStock
            items_status = []
            for req_item in obj.items.select_related('item').all():
                try:
                    stock = InventoryStock.objects.get(
                        item=req_item.item,
                        location=obj.delivery_location,
                    )
                    item_status = {
                        'item_id': req_item.item.id,
                        'item_name': req_item.item.name,
                        'sku': req_item.item.sku,
                        'requested': req_item.quantity,
                        'available': stock.quantity_available,
                        'on_hand': stock.quantity_on_hand,
                        'reserved': stock.quantity_reserved,
                        'status': (
                            'available'
                            if stock.quantity_available >= req_item.quantity
                            else 'insufficient'
                        ),
                    }
                except InventoryStock.DoesNotExist:
                    item_status = {
                        'item_id': req_item.item.id,
                        'item_name': req_item.item.name,
                        'sku': req_item.item.sku,
                        'requested': req_item.quantity,
                        'available': 0,
                        'on_hand': 0,
                        'reserved': 0,
                        'status': 'not_found',
                    }
                items_status.append(item_status)

            return Response({
                'available': is_valid,
                'can_fulfill': is_valid,
                'errors': error_messages,
                'items': items_status,
                'location': {
                    'id': obj.delivery_location.id,
                    'name': obj.delivery_location.name,
                    'code': obj.delivery_location.code,
                },
            })
        except Exception as exc:
            logger.error(f"Error checking stock for office-use request {pk}: {exc}")
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    # ── Summary ──────────────────────────────────────────────────────────────

    @action(detail=False, methods=['get'], url_path='pending-approvals')
    def pending_approvals(self, request):
        """All office use requests awaiting approval (status=submitted)."""
        queryset = self.get_queryset().filter(status='submitted')

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def summary(self, request):
        qs = self.get_queryset()
        return Response({
            'total_requests': qs.count(),
            'draft_count': qs.filter(status='draft').count(),
            'pending_approval_count': qs.filter(status='submitted').count(),
            'approved_count': qs.filter(status='approved').count(),
            'fulfilled_count': qs.filter(status='fulfilled').count(),
            'rejected_count': qs.filter(status='rejected').count(),
            'cancelled_count': qs.filter(status='cancelled').count(),
        })
