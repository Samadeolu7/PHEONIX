from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from django.core.exceptions import ValidationError
from django.utils import timezone
from common.views import ScopedModelViewSet
from common.approval_permissions import IsApprover

from .models import Transaction, TransactionEntry, TransactionSeries
from .serializers import (
    TransactionSerializer, TransactionEntrySerializer,
    TransactionSeriesSerializer, TransactionDetailSerializer,
    CreateTransactionSerializer
)


class TransactionViewSet(ScopedModelViewSet):
    """ViewSet for transactions with reversal support"""
    permission_module = 'transactions'
    permission_page = 'transactions'
    serializer_class = TransactionSerializer
    # Remove AllowAny - inherit IsAuthenticated from ScopedModelViewSet
    search_fields = ['description', 'reference_number', 'workflow_reference']
    ordering_fields = ['date', 'created_at', 'reference_number', 'approved']
    ordering = ['-date', '-created_at']
    
    def get_queryset(self):
        queryset = Transaction.objects.filter(
            is_deleted=False
        ).select_related(
            'series', 'approved_by', 'reversed_by'
        ).prefetch_related('entries__account')
        
        # Filter by account if provided
        account_id = self.request.query_params.get('account')
        if account_id:
            queryset = queryset.filter(entries__account_id=account_id).distinct()
        
        # Filter by reference if provided
        reference = self.request.query_params.get('reference')
        if reference:
            queryset = queryset.filter(reference_number__icontains=reference)
        
        # Filter by workflow reference
        workflow_ref = self.request.query_params.get('workflow_reference')
        if workflow_ref:
            queryset = queryset.filter(workflow_reference=workflow_ref)
        
        # Filter by date range
        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')
        if date_from:
            queryset = queryset.filter(date__gte=date_from)
        if date_to:
            queryset = queryset.filter(date__lte=date_to)
        
        # Filter reversed/active
        show_reversed = self.request.query_params.get('show_reversed', 'true')
        if show_reversed.lower() == 'false':
            queryset = queryset.filter(is_reversed=False)
        
        # Filter by approved status
        approved = self.request.query_params.get('approved')
        if approved is not None:
            is_approved = approved.lower() == 'true'
            queryset = queryset.filter(approved=is_approved)
        
        return queryset.order_by('-date', '-created_at')
    
    def get_permissions(self):
        """Voiding requires staff/admin - enforced at both DRF permission layer
        and in the view body as defense-in-depth. Posting/approving is handled
        by HasActionPermission (page-aware) via ScopedModelViewSet."""
        if self.action == 'void':
            return [IsAuthenticated(), permissions.IsAdminUser()]
        return super().get_permissions()

    def get_serializer_class(self):
        if self.action == 'create':
            return CreateTransactionSerializer
        if self.action == 'retrieve':
            return TransactionDetailSerializer
        return TransactionSerializer
    
    def create(self, request, *args, **kwargs):
        """Create a transaction and return the full detail representation."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        # Route through perform_create so owner/branch/tenant scoping and
        # IntegrityError handling from ScopedModelViewSet are applied.
        self.perform_create(serializer)
        output_serializer = TransactionDetailSerializer(
            serializer.instance,
            context=self.get_serializer_context()
        )
        headers = self.get_success_headers(output_serializer.data)
        return Response(output_serializer.data, status=status.HTTP_201_CREATED, headers=headers)
    
    @action(detail=True, methods=['post'])
    def reverse(self, request, pk=None):
        """
        Reverse a transaction by creating an opposite transaction.
        
        Required: reason (string)
        """
        transaction = self.get_object()
        reason = request.data.get('reason', '').strip()
        
        if not reason:
            return Response({
                'error': 'Reason is required for transaction reversal'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        if len(reason) < 10:
            return Response({
                'error': 'Please provide a detailed reason (minimum 10 characters)'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            reversal_txn = transaction.reverse(
                user=request.user,
                reason=reason
            )
            
            return Response({
                'message': 'Transaction reversed successfully',
                'data': {
                    'original': TransactionDetailSerializer(transaction).data,
                    'reversal': TransactionDetailSerializer(reversal_txn).data,
                    'original_reference': transaction.reference_number,
                    'reversal_reference': reversal_txn.reference_number
                }
            }, status=status.HTTP_200_OK)
            
        except ValidationError as e:
            return Response({
                'error': str(e)
            }, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({
                'error': f'Failed to reverse transaction: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=True, methods=['post'])
    def void(self, request, pk=None):
        """
        Void a transaction (mark as invalid without creating reversal).
        
        WARNING: Use with caution. Regular reversal is preferred.
        Requires special permission.
        """
        transaction = self.get_object()
        reason = request.data.get('reason', '').strip()

        # Only staff / superusers may void transactions.
        # Voiding is destructive and irreversible; regular reversal should be used instead.
        if not (request.user.is_staff or request.user.is_superuser):
            return Response(
                {'error': 'You do not have permission to void transactions. Use reversal instead, or contact a system administrator.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        if not reason:
            return Response({
                'error': 'Reason is required for voiding transaction'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            transaction.void(user=request.user, reason=reason)
            
            return Response({
                'message': 'Transaction voided successfully',
                'data': TransactionDetailSerializer(transaction).data,
                'reference': transaction.reference_number
            }, status=status.HTTP_200_OK)
            
        except ValidationError as e:
            return Response({
                'error': str(e)
            }, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({
                'error': f'Failed to void transaction: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=True, methods=['post'])
    def post(self, request, pk=None):
        """Post a transaction (same as approve)"""
        return self.approve(request, pk)
    
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve a transaction"""
        transaction = self.get_object()
        
        if transaction.approved:
            return Response({
                'error': 'Transaction is already approved'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        if transaction.is_reversed:
            return Response({
                'error': 'Cannot approve a reversed transaction'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        transaction.approved = True
        transaction.approved_by = request.user
        transaction.approved_at = timezone.now()
        transaction.save(update_fields=['approved', 'approved_by', 'approved_at'])
        
        return Response({
            'message': 'Transaction approved successfully',
            'data': TransactionDetailSerializer(transaction).data
        })
    
    @action(detail=False, methods=['get'])
    def reversed(self, request):
        """Get all reversed transactions"""
        queryset = self.get_queryset().filter(is_reversed=True)
        serializer = self.get_serializer(queryset, many=True)
        return Response({'data': serializer.data})
    
    @action(detail=False, methods=['get'])
    def reversals(self, request):
        """Get all reversal transactions"""
        queryset = self.get_queryset().filter(is_reversal=True)
        serializer = self.get_serializer(queryset, many=True)
        return Response({'data': serializer.data})
    
    @action(detail=True, methods=['get'])
    def history(self, request, pk=None):
        """
        Get full history of a transaction including reversals
        """
        transaction = self.get_object()
        
        history = {
            'original': TransactionDetailSerializer(transaction).data,
            'reversal': None,
            'reversed_by': None
        }
        
        # If this transaction is reversed, get the reversal
        if transaction.is_reversed and transaction.reversal_transaction:
            history['reversal'] = TransactionDetailSerializer(
                transaction.reversal_transaction
            ).data
        
        # If this is a reversal, get the original
        if transaction.is_reversal and transaction.reverses_transaction:
            history['reversed_by'] = TransactionDetailSerializer(
                transaction.reverses_transaction
            ).data
        
        return Response({'data': history})


class TransactionSeriesViewSet(viewsets.ModelViewSet):
    """ViewSet for transaction series - reference data without owner/branch scoping"""
    permission_module = 'transactions'
    permission_page = 'transaction-series'
    serializer_class = TransactionSeriesSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        # TransactionSeries is reference data without owner/branch scoping
        return TransactionSeries.objects.all()