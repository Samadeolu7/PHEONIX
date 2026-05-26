# liabilities/views.py
"""
API Views for Accounts Payable and vendor payment management
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from django.db.models import Q, Sum
from decimal import Decimal
import logging

from .models import AccountsPayable
from .serializers import (
    AccountsPayableSerializer,
    AccountsPayableListSerializer,
    CreateAccountsPayableSerializer,
    ValidateThreeWayMatchSerializer,
    MakePaymentSerializer,
    PaymentResultSerializer,
    ThreeWayMatchResultSerializer
)
from common.views import ScopedModelViewSet
from common.managers import OwnerBranchManager

logger = logging.getLogger(__name__)


class AccountsPayableViewSet(ScopedModelViewSet):
    """
    ViewSet for Accounts Payable management
    
    Provides CRUD operations plus custom actions for:
    - 3-way match validation
    - Payment processing
    - Filtering by status, vendor, date range
    
    Inherits ScopedModelViewSet for automatic branch/tenant scoping,
    owner/branch auto-assignment on create, and IsTenantUser permission.
    """
    permission_module = 'liabilities'
    permission_page = 'accounts-payable'
    queryset = AccountsPayable.objects.select_related(
        'account', 'purchase_order', 'posted_by', 'validated_by',
        'branch', 'owner', 'tenant'
    ).all()
    
    def get_queryset(self):
        """
        Branch/tenant scoping is handled by ScopedModelViewSet.
        This method applies additional AP-specific filters from query params.
        """
        queryset = super().get_queryset()

        # Apply filters
        # vendor_type / vendor_id are expressed via GenericForeignKey:
        #   content_type  → the model type (Supplier or Client)
        #   object_id     → the PK of the specific vendor
        vendor_type = self.request.query_params.get('vendor_type')
        vendor_id = self.request.query_params.get('vendor_id')

        if vendor_type or vendor_id:
            from django.contrib.contenttypes.models import ContentType
            _MODEL_MAP = {
                'supplier': ('procurement', 'supplier'),
                'client':   ('clients',    'client'),
            }
            if vendor_type and vendor_type.lower() in _MODEL_MAP:
                app_label, model_name = _MODEL_MAP[vendor_type.lower()]
                try:
                    ct = ContentType.objects.get(app_label=app_label, model=model_name)
                    queryset = queryset.filter(content_type=ct)
                except ContentType.DoesNotExist:
                    pass

            if vendor_id:
                queryset = queryset.filter(object_id=vendor_id)
        
        status = self.request.query_params.get('status')
        if status:
            queryset = queryset.filter(status=status)
        
        match_status = self.request.query_params.get('three_way_match_status')
        if match_status:
            queryset = queryset.filter(three_way_match_status=match_status)
        
        has_po = self.request.query_params.get('has_po')
        if has_po is not None:
            if has_po.lower() == 'true':
                queryset = queryset.filter(purchase_order__isnull=False)
            elif has_po.lower() == 'false':
                queryset = queryset.filter(purchase_order__isnull=True)
        
        # Date range filters
        start_date = self.request.query_params.get('start_date')
        if start_date:
            queryset = queryset.filter(invoice_date__gte=start_date)
        
        end_date = self.request.query_params.get('end_date')
        if end_date:
            queryset = queryset.filter(invoice_date__lte=end_date)
        
        return queryset.order_by('-invoice_date')
    
    def get_serializer_class(self):
        """Use different serializers for different actions"""
        if self.action == 'list':
            return AccountsPayableListSerializer
        elif self.action == 'create':
            return CreateAccountsPayableSerializer
        elif self.action == 'validate_three_way_match':
            return ValidateThreeWayMatchSerializer
        elif self.action == 'make_payment':
            return MakePaymentSerializer
        return AccountsPayableSerializer
    
    # No custom create needed - use serializer's validation and create
    
    @action(detail=True, methods=['post'])
    def validate_three_way_match(self, request, pk=None):
        """
        Validate 3-way match (PO → GRN → Invoice)
        
        POST /api/liabilities/payables/{id}/validate/
        """
        payable = self.get_object()
        
        # Check if PO exists
        if not payable.purchase_order:
            return Response({
                'status': 'not_validated',
                'can_proceed': True,
                'message': 'No Purchase Order linked - validation skipped',
                'discrepancies': []
            }, status=status.HTTP_200_OK)
        
        # Run validation
        try:
            result = payable.validate_three_way_match(user=request.user)
            serializer = ThreeWayMatchResultSerializer(result)
            return Response(serializer.data, status=status.HTTP_200_OK)
        
        except Exception as e:
            logger.error(f"3-way match validation failed for payable {pk}: {str(e)}")
            return Response({
                'error': 'Validation failed',
                'detail': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=True, methods=['post'])
    def make_payment(self, request, pk=None):
        """
        Make payment against accounts payable
        
        POST /api/liabilities/payables/{id}/pay/
        
        Request body:
        {
            "amount": "5000.00",
            "posted_by": 1,
            "posting_notes": "Payment approved",
            "bypass_validation": false
        }
        """
        payable = self.get_object()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        data = serializer.validated_data
        amount = data['amount']
        bank_account_id = data['bank_account_id']
        posting_notes = data.get('posting_notes', '')
        bypass_validation = data.get('bypass_validation', False)

        # Always use the authenticated user as the payment poster.
        # Accepting a user ID from the request body would allow spoofing.
        posted_by = self.request.user

        # Resolve the bank GL account to credit
        from accounts.models import Account
        try:
            bank_gl_account = Account.objects.get(id=bank_account_id, branch=request.user.branch)
        except Account.DoesNotExist:
            return Response({
                'success': False,
                'message': f'GL account {bank_account_id} not found in this branch',
            }, status=status.HTTP_400_BAD_REQUEST)

        # Validate amount
        outstanding = payable.amount - payable.amount_paid
        if amount > outstanding:
            return Response({
                'success': False,
                'message': f'Payment amount ({amount}) exceeds outstanding amount ({outstanding})',
            }, status=status.HTTP_400_BAD_REQUEST)

        # Make payment
        try:
            remaining_balance = payable.make_payment(
                amount=amount,
                posted_by=posted_by,
                notes=posting_notes,
                bypass_validation=bypass_validation,
                bank_gl_account=bank_gl_account,
            )
            
            # Refresh from DB
            payable.refresh_from_db()
            
            result_serializer = PaymentResultSerializer({
                'success': True,
                'message': 'Payment posted successfully',
                'payment_id': None,  # No payment object - make_payment returns remaining balance
                'new_paid_amount': payable.amount_paid,
                'outstanding_amount': remaining_balance,
                'payment_status': payable.status,
                'validation_bypassed': bypass_validation
            })
            
            return Response(result_serializer.data, status=status.HTTP_200_OK)
        
        except ValueError as e:
            return Response({
                'success': False,
                'message': str(e)
            }, status=status.HTTP_400_BAD_REQUEST)
        
        except Exception as e:
            logger.error(f"Payment failed for payable {pk}: {str(e)}")
            return Response({
                'success': False,
                'message': 'Payment processing failed',
                'detail': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=False, methods=['get'])
    def pending_validation(self, request):
        """
        Get payables pending 3-way match validation
        
        GET /api/liabilities/payables/pending_validation/
        """
        queryset = self.get_queryset().filter(
            purchase_order__isnull=False,
            three_way_match_status='not_validated',
            status__in=['unpaid', 'partial']
        )
        
        serializer = AccountsPayableListSerializer(queryset, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def overdue(self, request):
        """
        Get overdue payables
        
        GET /api/liabilities/payables/overdue/
        """
        today = timezone.now().date()
        queryset = self.get_queryset().filter(
            due_date__lt=today,
            status__in=['unpaid', 'partial']
        )
        
        serializer = AccountsPayableListSerializer(queryset, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def failed_validation(self, request):
        """
        Get payables with failed 3-way match
        
        GET /api/liabilities/payables/failed_validation/
        """
        queryset = self.get_queryset().filter(
            three_way_match_status='failed'
        )
        
        serializer = AccountsPayableListSerializer(queryset, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def summary(self, request):
        """
        Get summary statistics
        
        GET /api/liabilities/payables/summary/
        """
        queryset = self.get_queryset()
        
        # Calculate totals
        total_payables = queryset.count()
        total_amount = queryset.aggregate(Sum('amount'))['amount__sum'] or Decimal('0')
        total_paid = queryset.aggregate(Sum('amount_paid'))['amount_paid__sum'] or Decimal('0')
        total_outstanding = total_amount - total_paid
        
        # Status breakdown
        unpaid = queryset.filter(status='unpaid').count()
        partial = queryset.filter(status='partial').count()
        paid = queryset.filter(status='paid').count()
        
        # Overdue
        today = timezone.now().date()
        overdue_count = queryset.filter(
            due_date__lt=today,
            status__in=['unpaid', 'partial']
        ).count()
        
        # Validation status
        not_validated = queryset.filter(three_way_match_status='not_validated').count()
        validation_passed = queryset.filter(three_way_match_status='passed').count()
        validation_warning = queryset.filter(three_way_match_status='warning').count()
        validation_failed = queryset.filter(three_way_match_status='failed').count()
        
        return Response({
            'total_payables': total_payables,
            'total_amount': str(total_amount),
            'total_paid': str(total_paid),
            'total_outstanding': str(total_outstanding),
            'status_breakdown': {
                'unpaid': unpaid,
                'partial': partial,
                'paid': paid
            },
            'overdue_count': overdue_count,
            'validation_status': {
                'not_validated': not_validated,
                'passed': validation_passed,
                'warning': validation_warning,
                'failed': validation_failed
            }
        })
