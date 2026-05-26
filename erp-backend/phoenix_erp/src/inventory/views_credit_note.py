"""
Credit Note Views

REST API endpoints for credit note management.
"""

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters
from django.db.models import Q, Sum
from django.http import HttpResponse
from django.core.exceptions import ValidationError

from inventory.models_credit_note import CreditNote, CreditNoteItem
from inventory.serializers_credit_note import (
    CreditNoteSerializer,
    CreditNoteReadSerializer,
    CreditNoteItemSerializer,
    CreditNoteApplySerializer,
    CreditNoteCancelSerializer,
    CreditNoteReverseSerializer,
)
from inventory.services.credit_note_accounting import CreditNoteAccountingService
from common.views import ScopedModelViewSet


class CreditNoteViewSet(ScopedModelViewSet):
    """
    ViewSet for credit note management
    
    Endpoints:
    - GET /credit-notes/ - List all credit notes
    - POST /credit-notes/ - Create new credit note
    - GET /credit-notes/{id}/ - Get credit note details
    - PATCH /credit-notes/{id}/ - Update credit note
    - DELETE /credit-notes/{id}/ - Soft delete credit note
    - POST /credit-notes/{id}/apply/ - Apply credit to customer account
    - POST /credit-notes/{id}/cancel/ - Cancel credit note
    - POST /credit-notes/{id}/reverse/ - Reverse applied credit
    - GET /credit-notes/{id}/pdf/ - Download credit note PDF
    """
    
    queryset = CreditNote.objects.all()
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'client', 'original_invoice', 'applied_to_account', 'issue_date']
    search_fields = ['credit_note_number', 'reason', 'client__first_name', 'client__last_name']
    ordering_fields = ['issue_date', 'created_at', 'total_amount']
    ordering = ['-issue_date']
    
    def get_queryset(self):
        """Get credit notes with related data"""
        queryset = super().get_queryset()
        queryset = queryset.select_related(
            'client',
            'original_invoice',
            'created_by',
            'applied_by',
            'reversed_by',
            'branch'
        ).prefetch_related('items')
        
        # Filter by invoice if nested route
        invoice_pk = self.kwargs.get('invoice_pk')
        if invoice_pk:
            queryset = queryset.filter(original_invoice_id=invoice_pk)
        
        # Filter by client if provided
        client_id = self.request.query_params.get('client_id')
        if client_id:
            queryset = queryset.filter(client_id=client_id)
        
        # Filter by date range
        from_date = self.request.query_params.get('from_date')
        to_date = self.request.query_params.get('to_date')
        if from_date:
            queryset = queryset.filter(issue_date__gte=from_date)
        if to_date:
            queryset = queryset.filter(issue_date__lte=to_date)
        
        return queryset
    
    def get_serializer_class(self):
        """Return appropriate serializer based on action"""
        if self.action == 'list' or self.action == 'retrieve':
            return CreditNoteReadSerializer
        elif self.action == 'apply':
            return CreditNoteApplySerializer
        elif self.action == 'cancel':
            return CreditNoteCancelSerializer
        elif self.action == 'reverse':
            return CreditNoteReverseSerializer
        return CreditNoteSerializer
    
    def perform_create(self, serializer):
        """Create credit note with branch and owner"""
        # Get invoice_pk from nested route if present
        invoice_pk = self.kwargs.get('invoice_pk')
        
        # Prepare save kwargs
        save_kwargs = {
            'branch': self.request.user.branch,
            'owner': self.request.user,
            'created_by': self.request.user
        }
        
        # If accessed via nested route, set original_invoice from URL
        if invoice_pk:
            from inventory.models import Invoice
            try:
                invoice = Invoice.objects.get(pk=invoice_pk, branch=self.request.user.branch)
                save_kwargs['original_invoice'] = invoice
                
                # Auto-set client from invoice if not provided
                if 'client' not in serializer.validated_data:
                    save_kwargs['client'] = invoice.client
            except Invoice.DoesNotExist:
                raise ValidationError(f"Invoice with id {invoice_pk} does not exist")
        
        serializer.save(**save_kwargs)
    
    def perform_update(self, serializer):
        """Update credit note"""
        # Can only update draft credit notes
        if serializer.instance.status != 'draft':
            raise ValidationError("Can only update draft credit notes")
        
        serializer.save()
    
    def perform_destroy(self, instance):
        """Soft delete credit note"""
        # Can only delete draft credit notes
        if instance.status != 'draft':
            raise ValidationError("Can only delete draft credit notes")
        
        instance.is_deleted = True
        instance.save()
    
    @action(detail=True, methods=['post'])
    def apply(self, request, pk=None):
        """
        Apply credit note to customer account
        
        Creates journal entries and updates customer balance.
        """
        credit_note = self.get_object()
        serializer = self.get_serializer(credit_note, data=request.data)
        serializer.is_valid(raise_exception=True)
        
        try:
            # Apply credit using accounting service
            accounting_service = CreditNoteAccountingService(credit_note)
            journal_entry = accounting_service.apply_credit_to_account(
                applied_by=request.user,
                notes=serializer.validated_data.get('notes')
            )
            
            # Return updated credit note
            response_serializer = CreditNoteReadSerializer(
                credit_note,
                context={'request': request}
            )
            
            return Response({
                'success': True,
                'message': f'Credit note {credit_note.credit_note_number} applied successfully',
                'credit_note': response_serializer.data,
                'journal_entry_id': journal_entry.id
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """
        Cancel credit note
        
        Can only cancel draft or issued credit notes that haven't been applied.
        """
        credit_note = self.get_object()
        serializer = self.get_serializer(credit_note, data=request.data)
        serializer.is_valid(raise_exception=True)
        
        try:
            # Update status
            credit_note.status = 'cancelled'
            credit_note.notes = (credit_note.notes or '') + f"\nCancellation reason: {serializer.validated_data['cancellation_reason']}"
            credit_note.save()
            
            response_serializer = CreditNoteReadSerializer(
                credit_note,
                context={'request': request}
            )
            
            return Response({
                'success': True,
                'message': f'Credit note {credit_note.credit_note_number} cancelled',
                'credit_note': response_serializer.data
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['post'])
    def reverse(self, request, pk=None):
        """
        Reverse applied credit note
        
        Creates reversing journal entries and restores customer balance.
        """
        credit_note = self.get_object()
        serializer = self.get_serializer(credit_note, data=request.data)
        serializer.is_valid(raise_exception=True)
        
        try:
            # Reverse credit using accounting service
            accounting_service = CreditNoteAccountingService(credit_note)
            journal_entry = accounting_service.reverse_credit(
                reversed_by=request.user,
                reversal_reason=serializer.validated_data['reversal_reason']
            )
            
            response_serializer = CreditNoteReadSerializer(
                credit_note,
                context={'request': request}
            )
            
            return Response({
                'success': True,
                'message': f'Credit note {credit_note.credit_note_number} reversed successfully',
                'credit_note': response_serializer.data,
                'journal_entry_id': journal_entry.id
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['post'])
    def issue(self, request, pk=None):
        """
        Issue draft credit note
        
        Changes status from draft to issued.
        """
        credit_note = self.get_object()
        
        if credit_note.status != 'draft':
            return Response({
                'success': False,
                'error': 'Can only issue draft credit notes'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            credit_note.status = 'issued'
            credit_note.save()
            
            response_serializer = CreditNoteReadSerializer(
                credit_note,
                context={'request': request}
            )
            
            return Response({
                'success': True,
                'message': f'Credit note {credit_note.credit_note_number} issued',
                'credit_note': response_serializer.data
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['get'])
    def pdf(self, request, pk=None):
        """
        Generate and download credit note as PDF
        
        Reuses invoice PDF service with credit note branding.
        """
        credit_note = self.get_object()
        
        try:
            from inventory.services.credit_note_pdf import CreditNotePDFService
            
            pdf_service = CreditNotePDFService(credit_note)
            pdf_content = pdf_service.generate()
            
            response = HttpResponse(pdf_content, content_type='application/pdf')
            response['Content-Disposition'] = f'attachment; filename="credit_note_{credit_note.credit_note_number}.pdf"'
            
            return response
            
        except Exception as e:
            return Response({
                'success': False,
                'error': f'PDF generation failed: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=False, methods=['get'])
    def summary(self, request):
        """
        Get credit notes summary statistics
        
        Returns total credits by status, client, etc.
        """
        queryset = self.get_queryset()
        
        summary = {
            'total_count': queryset.count(),
            'total_amount': queryset.aggregate(Sum('total_amount'))['total_amount__sum'] or 0,
            'by_status': {},
            'unapplied_count': queryset.filter(applied_to_account=False, status='issued').count(),
            'unapplied_amount': queryset.filter(
                applied_to_account=False,
                status='issued'
            ).aggregate(Sum('total_amount'))['total_amount__sum'] or 0,
        }
        
        # Group by status
        for status_choice in CreditNote._meta.get_field('status').choices:
            status_code = status_choice[0]
            count = queryset.filter(status=status_code).count()
            amount = queryset.filter(status=status_code).aggregate(
                Sum('total_amount')
            )['total_amount__sum'] or 0
            
            summary['by_status'][status_code] = {
                'count': count,
                'amount': amount
            }
        
        return Response(summary, status=status.HTTP_200_OK)


class CreditNoteItemViewSet(ScopedModelViewSet):
    """
    ViewSet for credit note items
    
    Typically managed through parent credit note, but can be accessed directly.
    """
    
    queryset = CreditNoteItem.objects.all()
    permission_classes = [IsAuthenticated]
    serializer_class = CreditNoteItemSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['credit_note', 'item', 'return_reason', 'stock_returned']
    
    def get_queryset(self):
        """Get items for credit notes with related data"""
        queryset = super().get_queryset()
        return queryset.select_related(
            'credit_note',
            'item',
            'original_invoice_item'
        )
