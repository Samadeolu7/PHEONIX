# incomes/views.py
"""
ViewSets for income, invoices, and fee entitlements
"""
from rest_framework import status
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from django.db import transaction
from django.db.models import Q, Sum, Count, Prefetch
from common.approval_permissions import IsApprover
from django.utils import timezone
from decimal import Decimal
from django.core.exceptions import ValidationError
import logging
from common.views import ScopedModelViewSet
from .models import (
    IncomeCategory, Income, FeeStructure, ServiceItem, Invoice,
    FeeEntitlement, EntitlementPaymentLog, EntitlementUsageLog,
    PaymentPlan, PaymentPlanInstallment
)
from .serializers import (
    IncomeCategorySerializer, IncomeSerializer, FeeStructureSerializer,
    ServiceItemSerializer,
    InvoiceSerializer, InvoiceCreateSerializer, InvoiceUpdateSerializer,
    FeeEntitlementSerializer, FeeEntitlementListSerializer,
    EntitlementPaymentLogSerializer, EntitlementUsageLogSerializer,
    PaymentPlanSerializer, PaymentPlanInstallmentSerializer,
    RecordPaymentSerializer, ConsumeUnitsSerializer, CheckAccessSerializer,
    AccessResponseSerializer, RedeemInventorySerializer,
    CreateInvoiceWithEntitlementSerializer, FeeSummarySerializer,
    BulkInvoiceCreateSerializer, EnrollSerializer
)
from .services.school_fees import SchoolFeesService
from .services.accounting_integration import IncomeAccountingService
from .models_calendar import AcademicYear, AcademicTerm
from .serializers import AcademicYearSerializer, AcademicTermSerializer

logger = logging.getLogger(__name__)


class AcademicYearViewSet(ScopedModelViewSet):
    """
    CRUD + lifecycle management for Academic Years (sessions).

    Extra actions
    -------------
    POST /{id}/activate/      â€” make this year the active session
    POST /{id}/close_session/ â€” close the session + run year-end accounting
    GET  /current/            â€” return the currently active year
    """
    permission_module = 'incomes'
    permission_page = 'academic-years'
    queryset = AcademicYear.objects.prefetch_related('terms').all()
    serializer_class = AcademicYearSerializer
    permission_classes = [IsAuthenticated]
    ordering = ['-start_date']

    def get_queryset(self):
        qs = super().get_queryset()
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() == 'true')
        return qs

    @action(detail=False, methods=['get'], url_path='current')
    def current(self, request):
        """Return the currently active academic year."""
        year = AcademicYear.objects.for_user(request.user).filter(is_active=True).first()
        if not year:
            return Response({'detail': 'No active academic year found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(AcademicYearSerializer(year).data)

    @action(detail=True, methods=['post'], url_path='activate')
    def activate(self, request, pk=None):
        """Set this academic year as the active session (deactivates all others)."""
        year = self.get_object()
        with transaction.atomic():
            # Deactivate all other years for the same owner/branch
            AcademicYear.objects.for_user(request.user).exclude(pk=year.pk).update(is_active=False)
            year.is_active = True
            # Bypass clean() so we don't raise the "already active" error for self
            AcademicYear.objects.filter(pk=year.pk).update(is_active=True)
            year.refresh_from_db()
        return Response(AcademicYearSerializer(year).data)

    @action(detail=True, methods=['post'], url_path='close-session')
    def close_session(self, request, pk=None):
        """
        Close this academic session:
        1. Deactivate the year (is_active = False)
        2. Run accounting year-end closure (retained earnings, opening balances)

        The accounting closure uses the calendar year of the academic year's end_date
        so that the retained earnings journal posts to the right fiscal period.
        """
        year = self.get_object()

        if not year.is_active:
            return Response(
                {'detail': 'This academic year is not currently active.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        accounting_result = {'skipped': False, 'error': None}

        with transaction.atomic():
            # 1. Deactivate the academic year
            AcademicYear.objects.filter(pk=year.pk).update(is_active=False)
            year.refresh_from_db()

            # 2. Year-end accounting closure
            try:
                from accounts.services import year_end_close
                fiscal_year = year.end_date.year
                year_end_close(request.user, request.user.branch, fiscal_year)
            except Exception as exc:
                accounting_result['error'] = str(exc)
                # We still deactivate the year; accounting errors are non-fatal
                # but we report them to the caller.

        return Response({
            'detail': f'Academic year "{year.name}" has been closed.',
            'academic_year': AcademicYearSerializer(year).data,
            'accounting_closure': accounting_result,
        })


class AcademicTermViewSet(ScopedModelViewSet):
    """CRUD for academic terms within a year."""
    permission_module = 'incomes'
    permission_page = 'academic-terms'
    queryset = AcademicTerm.objects.select_related('academic_year').all()
    serializer_class = AcademicTermSerializer
    permission_classes = [IsAuthenticated]
    ordering = ['academic_year', 'start_date']

    def get_queryset(self):
        qs = super().get_queryset()
        year_id = self.request.query_params.get('academic_year')
        if year_id:
            qs = qs.filter(academic_year_id=year_id)
        return qs


class IncomeCategoryViewSet(ScopedModelViewSet):
    """ViewSet for income categories"""
    permission_module = 'incomes'
    permission_page = 'income-categories'
    queryset = IncomeCategory.objects.all()
    serializer_class = IncomeCategorySerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        queryset = super().get_queryset()
        
        # Filter by active status
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() == 'true')
        
        # Search by name or code
        search = self.request.query_params.get('search')
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search) |
                Q(code__icontains=search) |
                Q(description__icontains=search)
            )
        
        return queryset.select_related('income_account')


class ServiceItemViewSet(ScopedModelViewSet):
    """ViewSet for the service catalog â€” GET /api/incomes/service-items/"""
    permission_module = 'incomes'
    permission_page = 'service-items'
    queryset = ServiceItem.objects.all()
    serializer_class = ServiceItemSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = super().get_queryset()
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() == 'true')
        search = self.request.query_params.get('search')
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search) | Q(code__icontains=search)
            )
        return queryset.select_related('category')


class IncomeViewSet(ScopedModelViewSet):
    """ViewSet for income transactions"""
    permission_module = 'incomes'
    permission_page = 'incomes'
    queryset = Income.objects.all()
    serializer_class = IncomeSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        queryset = super().get_queryset()
        
        # Filter by client (accept either `client` or `client_id`)
        client_id = self.request.query_params.get('client') or self.request.query_params.get('client_id')
        if client_id:
            queryset = queryset.filter(client_id=client_id)
        
        # Filter by category
        category_id = self.request.query_params.get('category_id')
        if category_id:
            queryset = queryset.filter(category_id=category_id)
        
        # Filter by status
        status_filter = self.request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        
        # Filter by date range
        from_date = self.request.query_params.get('from_date')
        to_date = self.request.query_params.get('to_date')
        if from_date:
            queryset = queryset.filter(income_date__gte=from_date)
        if to_date:
            queryset = queryset.filter(income_date__lte=to_date)
        
        # Search
        search = self.request.query_params.get('search')
        if search:
            queryset = queryset.filter(
                Q(reference_number__icontains=search) |
                Q(description__icontains=search)
            )
        
        return queryset.select_related('category', 'client', 'invoice')
    
    @action(detail=True, methods=['post'])
    def record_payment(self, request, pk=None):
        """Record payment for an income"""
        income = self.get_object()
        serializer = RecordPaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        amount = serializer.validated_data['amount']
        
        # Validate payment amount
        if amount > income.balance:
            return Response(
                {'error': f'Payment amount exceeds balance of {income.balance}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            with transaction.atomic():
                # Get bank account (optional - uses config if not specified)
                bank_account = None
                bank_account_id = serializer.validated_data.get('bank_account_id')
                if bank_account_id:
                    from banks.models import BankAccount as BankAccountModel
                    try:
                        bank_obj = BankAccountModel.objects.select_related('gl_account').get(id=bank_account_id)
                        if bank_obj.gl_account is None:
                            return Response(
                                {'error': f'Bank account {bank_account_id} has no linked GL account. Please re-save the bank account to auto-create one.'},
                                status=status.HTTP_400_BAD_REQUEST
                            )
                        bank_account = bank_obj.gl_account
                    except BankAccountModel.DoesNotExist:
                        return Response(
                            {'error': f'Bank account {bank_account_id} not found'},
                            status=status.HTTP_400_BAD_REQUEST
                        )
                
                # Record payment with accounting entries
                journal_entry = IncomeAccountingService.record_income_receipt(
                    income=income,
                    amount=amount,
                    payment_method=serializer.validated_data.get('payment_method', 'cash'),
                    bank_account=bank_account,
                    user=request.user,
                    notes=serializer.validated_data.get('notes', '')
                )
                
                income.amount_paid += amount
                
                # Update status
                if income.amount_paid >= income.amount:
                    income.status = 'paid'
                elif income.amount_paid > 0:
                    income.status = 'partial'
                
                income.save()
                
                return Response({
                    'success': True,
                    'income_id': income.id,
                    'amount_paid': str(amount),
                    'new_balance': str(income.balance),
                    'status': income.status,
                    'journal_entry_id': journal_entry.id,
                    'reference_number': journal_entry.reference_number
                })
        except Exception as e:
            logger.error(f"Error recording payment: {str(e)}", exc_info=True)
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )


class FeeStructureViewSet(ScopedModelViewSet):
    """ViewSet for fee structures"""
    permission_module = 'incomes'
    permission_page = 'fee-structures'
    queryset = FeeStructure.objects.all()
    serializer_class = FeeStructureSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.action in ('approve', 'reject'):
            return [IsAuthenticated(), IsApprover()]
        return super().get_permissions()
    
    def get_queryset(self):
        queryset = super().get_queryset()
        
        # Filter by active status
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() == 'true')
        
        # Filter by category
        category_id = self.request.query_params.get('category_id')
        if category_id:
            queryset = queryset.filter(category_id=category_id)

        # Filter by approval status (server-side, avoids client-side filtering)
        approval_status = self.request.query_params.get('approval_status')
        if approval_status:
            queryset = queryset.filter(approval_status=approval_status)

        # Filter by effective date.
        # Only apply when an explicit effective_date is passed OR when no
        # approval_status filter is active (pending-approval structures may have
        # future effective dates â€“ we don't want to hide them).
        effective_date_str = self.request.query_params.get('effective_date')
        if effective_date_str or not approval_status:
            effective_date = effective_date_str or timezone.now().date()
            queryset = queryset.filter(
                Q(effective_from__lte=effective_date) | Q(effective_from__isnull=True),
                Q(effective_to__gte=effective_date) | Q(effective_to__isnull=True)
            )

        # Search
        search = self.request.query_params.get('search')
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search) |
                Q(code__icontains=search) |
                Q(description__icontains=search)
            )
        
        return queryset.select_related('category')
    
    @action(detail=True, methods=['post'])
    def submit_for_approval(self, request, pk=None):
        """
        Submit fee structure for Principal/Board approval
        Changes status from draft to pending_approval
        """
        fee_structure = self.get_object()
        
        if fee_structure.approval_status != 'draft':
            return Response(
                {'error': f'Only draft fee structures can be submitted. Current status: {fee_structure.get_approval_status_display()}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        fee_structure.approval_status = 'pending_approval'
        fee_structure.save()
        
        return Response({
            'message': 'Fee structure submitted for approval',
            'fee_structure': FeeStructureSerializer(fee_structure).data
        })
    
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """
        Approve fee structure (Principal/Board action)
        Required for compliance with annual fee schedule approval process
        """
        from incomes.serializers import FeeStructureApprovalSerializer
        
        fee_structure = self.get_object()
        
        if fee_structure.approval_status not in ['draft', 'pending_approval']:
            return Response(
                {'error': f'Cannot approve fee structure with status: {fee_structure.get_approval_status_display()}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        serializer = FeeStructureApprovalSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        fee_structure.approval_status = 'approved'
        fee_structure.approved_by = request.user
        fee_structure.approved_at = timezone.now()
        fee_structure.approval_notes = serializer.validated_data.get('approval_notes', '')
        fee_structure.save()
        
        return Response({
            'message': 'Fee structure approved successfully',
            'fee_structure': FeeStructureSerializer(fee_structure).data
        })
    
    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """
        Reject fee structure (Principal/Board action)
        """
        from incomes.serializers import FeeStructureApprovalSerializer
        
        fee_structure = self.get_object()
        
        if fee_structure.approval_status not in ['draft', 'pending_approval']:
            return Response(
                {'error': f'Cannot reject fee structure with status: {fee_structure.get_approval_status_display()}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        serializer = FeeStructureApprovalSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        if not serializer.validated_data.get('approval_notes'):
            return Response(
                {'error': 'Rejection reason is required in approval_notes'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        fee_structure.approval_status = 'rejected'
        fee_structure.approved_by = request.user
        fee_structure.approved_at = timezone.now()
        fee_structure.approval_notes = serializer.validated_data['approval_notes']
        fee_structure.save()
        
        return Response({
            'message': 'Fee structure rejected',
            'fee_structure': FeeStructureSerializer(fee_structure).data
        })

    @action(detail=False, methods=['get'], url_path='pending-approvals')
    def pending_approvals(self, request):
        """Return all fee structures awaiting approval (approval_status=pending_approval).

        Bypasses the effective-date filter so future-dated structures are included.
        """
        queryset = self.get_queryset().filter(approval_status='pending_approval')

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)


class InvoiceViewSet(ScopedModelViewSet):
    """ViewSet for invoices"""
    permission_module = 'incomes'
    permission_page = 'invoices'
    queryset = Invoice.objects.all()
    serializer_class = InvoiceSerializer
    permission_classes = [IsAuthenticated]
    
    def get_serializer_class(self):
        """Return appropriate serializer based on action"""
        if self.action == 'create':
            return InvoiceCreateSerializer
        elif self.action in ['update', 'partial_update']:
            return InvoiceUpdateSerializer
        return InvoiceSerializer
    
    def get_queryset(self):
        queryset = super().get_queryset()
        
        # Filter by client. Accept both `client_id` (legacy) and `client` (frontend alias).
        client_id = self.request.query_params.get('client_id') or self.request.query_params.get('client')
        if client_id:
            try:
                # Try to coerce to int, but allow string ids if used elsewhere
                client_filter = int(client_id)
            except (TypeError, ValueError):
                client_filter = client_id
            queryset = queryset.filter(client_id=client_filter)
        
        # Filter by status
        status_filter = self.request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        
        # Filter by date range
        from_date = self.request.query_params.get('from_date')
        to_date = self.request.query_params.get('to_date')
        if from_date:
            queryset = queryset.filter(invoice_date__gte=from_date)
        if to_date:
            queryset = queryset.filter(invoice_date__lte=to_date)
        
        # Filter overdue
        overdue = self.request.query_params.get('overdue')
        if overdue == 'true':
            queryset = queryset.filter(
                due_date__lt=timezone.now().date(),
                status__in=['draft', 'sent', 'partial']
            )
        
        # Search
        search = self.request.query_params.get('search')
        if search:
            queryset = queryset.filter(
                Q(invoice_number__icontains=search) |
                Q(description__icontains=search)
            )
        
        return queryset.select_related('client', 'fee_structure')

    def perform_create(self, serializer):
        """Auto-generate invoice_number and register in ReferenceTracking"""
        from common.services.reference_service import ReferenceService
        from common.models import ReferenceTracking
        from django.db import transaction, IntegrityError

        user = self.request.user
        tenant = getattr(user, 'tenant', user)

        # Generate unique invoice number OUTSIDE the transaction
        invoice_number = ReferenceService.generate_reference(
            module='incomes',
            model_name='invoice',
            tenant=tenant,
            branch=user.branch
        )
        
        logger.info(f"Creating invoice with number: {invoice_number}")

        max_retries = 3
        for attempt in range(1, max_retries + 1):
            try:
                with transaction.atomic():
                    # Save invoice with generated number
                    invoice = serializer.save(
                        invoice_number=invoice_number,
                        owner=user,
                        branch=user.branch,
                        tenant=tenant
                    )
                    
                    logger.info(f"Invoice {invoice_number} saved with ID: {invoice.id}")

                    # Register reference
                    ReferenceService.register_reference(
                        reference_number=invoice_number,
                        module='incomes',
                        model_name='invoice',
                        object_id=invoice.id,
                        tenant=tenant,
                        branch=user.branch,
                        created_by=user,
                        status=invoice.status,
                        amount=float(invoice.total_amount) if invoice.total_amount else 0.0,
                        metadata=invoice.metadata or {}
                    )
                    
                    logger.info(f"Reference {invoice_number} registered successfully")
                    break  # Success â€” exit retry loop
                    
            except IntegrityError as e:
                error_msg = str(e)
                logger.warning(
                    f"IntegrityError on attempt {attempt}/{max_retries} "
                    f"for invoice number {invoice_number}: {error_msg}"
                )
                
                # Only retry for duplicate invoice_number conflicts
                if ('invoice_number' in error_msg.lower() or 'unique' in error_msg.lower()) \
                        and attempt < max_retries:
                    # The generated number was already taken â€” generate the next one
                    invoice_number = ReferenceService.generate_reference(
                        module='incomes',
                        model_name='invoice',
                        tenant=tenant,
                        branch=user.branch
                    )
                    logger.info(f"Retrying with new invoice number: {invoice_number}")
                else:
                    # Exhausted retries or a different integrity error
                    raise
    
    @action(detail=True, methods=['post'])
    def mark_sent(self, request, pk=None):
        """Mark invoice as sent"""
        invoice = self.get_object()
        invoice.status = 'sent'
        invoice.save()
        return Response({'status': 'Invoice marked as sent'})
    
    @action(detail=True, methods=['post'])
    def post(self, request, pk=None):
        """
        Post invoice to accounting - creates journal entry for revenue recognition.
        
        This implements accrual basis accounting:
        - Dr. Accounts Receivable (Asset) 
        - Cr. Income/Revenue (Income)
        
        Revenue is recognized when earned (invoice created), not when cash is received.
        """
        invoice = self.get_object()
        
        try:
            journal_entry = invoice.post(user=request.user)
            
            # Refresh invoice to get updated fields
            invoice.refresh_from_db()
            
            serializer = self.get_serializer(invoice)
            
            return Response({
                'success': True,
                'message': 'Invoice posted to accounting successfully',
                'invoice': serializer.data,
                'journal_entry_id': journal_entry.id,
                'journal_entry_reference': journal_entry.reference_number
            })
            
        except ValidationError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            logger.error(f"Error posting invoice {invoice.invoice_number}: {str(e)}", exc_info=True)
            return Response(
                {'error': f'Failed to post invoice: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Cancel invoice"""
        invoice = self.get_object()
        if invoice.amount_paid > 0:
            return Response(
                {'error': 'Cannot cancel invoice with payments'},
                status=status.HTTP_400_BAD_REQUEST
            )
        invoice.status = 'cancelled'
        invoice.save()
        return Response({'status': 'Invoice cancelled'})

    @action(detail=True, methods=['post'])
    def record_payment(self, request, pk=None):
        """
        Record payment for an invoice.
        
        Creates journal entry:
        Dr. Bank/Cash Account (Asset)
        Cr. Accounts Receivable (Asset)
        
        Supports optional per-line-item allocation via `line_item_allocations`.
        When allocations are not provided, the payment is distributed proportionally
        across unpaid line items.
        
        Note: Invoice must be posted first (revenue already recognized).
        This entry converts receivable to cash.
        """
        from decimal import Decimal
        invoice = self.get_object()
        logger.info(f"[PAYMENT] Recording payment for invoice {invoice.invoice_number} (ID: {invoice.id})")
        logger.info(f"[PAYMENT] Invoice current state - Total: {invoice.total_amount or invoice.amount}, Paid: {invoice.amount_paid}, Status: {invoice.status}")
        
        # Validate invoice is posted
        if not invoice.is_posted:
            return Response(
                {'error': 'Invoice must be posted before recording payments. Use the /post endpoint first.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        serializer = RecordPaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        amount = serializer.validated_data['amount']
        logger.info(f"[PAYMENT] Payment amount requested: {amount}")

        # Validate payment amount
        if amount > invoice.balance:
            return Response(
                {'error': f'Payment amount exceeds balance of {invoice.balance}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if amount <= 0:
            return Response(
                {'error': 'Payment amount must be greater than zero'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Validate line_item_allocations reference valid items on this invoice
        raw_allocations = serializer.validated_data.get('line_item_allocations') or []
        if raw_allocations:
            invoice_item_ids = set(invoice.items.values_list('id', flat=True))
            for entry in raw_allocations:
                if int(entry['invoice_item_id']) not in invoice_item_ids:
                    return Response(
                        {'error': f"invoice_item_id {entry['invoice_item_id']} does not belong to this invoice"},
                        status=status.HTTP_400_BAD_REQUEST
                    )

        try:
            with transaction.atomic():
                from accounts.models import Account
                
                # Get payment method (defaults to 'cash')
                payment_method = serializer.validated_data.get('payment_method', 'cash')
                
                # Resolve bank/cash account
                bank_account = None
                bank_account_id = serializer.validated_data.get('bank_account_id')
                if bank_account_id:
                    from banks.models import BankAccount as BankAccountModel
                    try:
                        bank_obj = BankAccountModel.objects.select_related('gl_account').get(id=bank_account_id)
                        if bank_obj.gl_account is None:
                            return Response(
                                {'error': f'Bank account {bank_account_id} has no linked GL account. Please re-save the bank account to auto-create one.'},
                                status=status.HTTP_400_BAD_REQUEST
                            )
                        bank_account = bank_obj.gl_account
                    except BankAccountModel.DoesNotExist:
                        return Response(
                            {'error': f'Bank account {bank_account_id} not found'},
                            status=status.HTTP_400_BAD_REQUEST
                        )
                else:
                    # No bank account selected â†’ fall back to configured default account
                    bank_account = IncomeAccountingService.get_cash_account(
                        owner=invoice.owner,
                        branch=invoice.branch,
                        payment_method=payment_method,
                        income_category=invoice.fee_structure.category if invoice.fee_structure else None,
                        user=request.user
                    )
                
                # Get Accounts Receivable account
                from accounts.utils.account_creation import get_or_create_child_account
                ar_account = get_or_create_child_account(
                    parent_code='1110',
                    child_suffix='001',
                    name='Trade Debtors (Accounts Receivable)',
                    account_type='ASSET',
                    owner=invoice.owner,
                    branch=invoice.branch,
                    parent_name='Trade and Other Receivables'
                )
                
                # Create journal entry for payment
                from transactions.models import Transaction as JournalEntry, TransactionEntry as JournalEntryLine, TransactionSeries
                from django.utils import timezone as tz
                import uuid
                
                series, _ = TransactionSeries.objects.get_or_create(
                    code='INV',
                    defaults={'description': 'Invoice Transactions'}
                )
                
                payment_ref = f"{invoice.invoice_number}-PMT-{uuid.uuid4().hex[:8]}"
                payment_date = serializer.validated_data.get('payment_date') or tz.now().date()
                client_label = invoice.client.full_name if invoice.client_id else ''
                pmt_description = (
                    f"Payment: {client_label} - {invoice.invoice_number}"
                    if client_label else
                    f"Payment for invoice {invoice.invoice_number}"
                )

                journal_entry = JournalEntry.objects.create(
                    series=series,
                    date=payment_date,
                    description=pmt_description,
                    workflow_reference=payment_ref,
                    owner=invoice.owner,
                    branch=invoice.branch,
                    created_by=request.user
                )
                
                # Dr. Bank/Cash (increase cash)
                JournalEntryLine.objects.create(
                    transaction=journal_entry,
                    account=bank_account,
                    side=JournalEntryLine.DEBIT,
                    amount=amount
                )
                
                # Cr. Accounts Receivable (reduce receivable)
                JournalEntryLine.objects.create(
                    transaction=journal_entry,
                    account=ar_account,
                    side=JournalEntryLine.CREDIT,
                    amount=amount
                )
                
                # Post the journal entry to update account balances
                logger.info(f"[PAYMENT] Posting payment entry (ID: {journal_entry.id}, Ref: {payment_ref})")
                journal_entry.post()
                
                # â”€â”€ Per-line-item allocation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
                # Build allocation map: invoice_item_id â†’ Decimal amount
                from .models import InvoiceItem, InvoiceItemPayment

                if raw_allocations:
                    allocation_map = {
                        int(e['invoice_item_id']): Decimal(str(e['amount']))
                        for e in raw_allocations
                    }
                else:
                    # Proportional distribution across items that still have a balance
                    items = list(invoice.items.filter(is_deleted=False))
                    total_balance = sum(item.line_balance for item in items) or Decimal('1')
                    allocation_map = {}
                    remaining = amount
                    for item in items:
                        if item.line_balance <= 0:
                            continue
                        proportion = item.line_balance / total_balance
                        alloc = (proportion * amount).quantize(Decimal('0.01'))
                        if alloc > remaining:
                            alloc = remaining
                        allocation_map[item.id] = alloc
                        remaining -= alloc
                    # Assign any rounding remainder to the first item with a balance
                    if remaining > 0:
                        for item in items:
                            if item.line_balance > 0:
                                allocation_map[item.id] = allocation_map.get(item.id, Decimal('0')) + remaining
                                break

                # Persist allocations and update per-item amounts_paid
                allocation_records = []
                for item_id, alloc_amount in allocation_map.items():
                    if alloc_amount <= 0:
                        continue
                    try:
                        item = InvoiceItem.objects.get(id=item_id)
                    except InvoiceItem.DoesNotExist:
                        continue
                    # Cap at item's remaining balance to avoid over-payment at item level
                    alloc_amount = min(alloc_amount, item.line_balance)
                    if alloc_amount <= 0:
                        continue
                    item.amount_paid = item.amount_paid + alloc_amount
                    item.save(update_fields=['amount_paid'])

                    # Sync FeeEntitlement for service items that create entitlements
                    if item.creates_entitlement:
                        if item.entitlement_id:
                            # Update existing entitlement's paid amount and access status
                            ent = item.entitlement
                            ent.amount_paid = ent.amount_paid + alloc_amount
                            ent._update_status_and_access()
                            if ent.inventory_allocation_id:
                                ent._update_allocation_status()
                            ent.save()
                            EntitlementPaymentLog.objects.create(
                                entitlement=ent,
                                amount=alloc_amount,
                                payment_date=payment_date,
                                balance_after=ent.balance,
                                owner=ent.owner,
                                branch=ent.branch,
                                created_by=request.user,
                            )
                        elif item.service_item_id:
                            # No entitlement exists yet â€” create one on first payment
                            svc = item.service_item
                            cfg = svc.entitlement_config or {}
                            ptt = cfg.get('payment_term_type', 'minimum_deposit')
                            min_pct = Decimal(str(cfg.get('minimum_required_percent', 100)))
                            minimum_required = (item.line_total * min_pct / Decimal('100')).quantize(Decimal('0.01'))
                            ent = FeeEntitlement.objects.create(
                                client=invoice.client,
                                invoice=invoice,
                                service_item=svc,
                                fee_structure=invoice.fee_structure,
                                payment_term_type=ptt,
                                total_amount=item.line_total,
                                amount_paid=alloc_amount,
                                minimum_required=minimum_required,
                                access_rules=cfg,
                                owner=invoice.owner,
                                branch=invoice.branch,
                                tenant=invoice.tenant,
                                created_by=request.user,
                            )
                            ent._update_status_and_access()
                            ent.save(update_fields=['status', 'current_access_level', 'completed_at'])
                            # Link the invoice item to the newly created entitlement
                            item.entitlement = ent
                            item.save(update_fields=['entitlement'])
                            EntitlementPaymentLog.objects.create(
                                entitlement=ent,
                                amount=alloc_amount,
                                payment_date=payment_date,
                                balance_after=ent.balance,
                                owner=ent.owner,
                                branch=ent.branch,
                                created_by=request.user,
                            )

                    record = InvoiceItemPayment.objects.create(
                        invoice=invoice,
                        invoice_item=item,
                        payment_date=payment_date,
                        amount=alloc_amount,
                        journal_entry_reference=payment_ref,
                        notes=serializer.validated_data.get('notes', ''),
                    )
                    allocation_records.append(record)

                logger.info(
                    f"[PAYMENT] Created {len(allocation_records)} line-item allocation records "
                    f"for payment {payment_ref}"
                )

                # Update invoice payment tracking
                old_amount_paid = invoice.amount_paid
                invoice.amount_paid += amount
                
                # Update status based on payment
                if invoice.amount_paid >= (invoice.total_amount or invoice.amount):
                    invoice.status = 'paid'
                elif invoice.amount_paid > 0:
                    invoice.status = 'partial'
                
                invoice.save(update_fields=['amount_paid', 'status'])
                
                logger.info(f"[PAYMENT] âœ… SUCCESS - Payment recorded for invoice {invoice.invoice_number}")
                logger.info(f"[PAYMENT] Amount paid: {old_amount_paid} â†’ {invoice.amount_paid}, Status: {invoice.status}")
                
                return Response({
                    'success': True,
                    'invoice_id': invoice.id,
                    'amount_paid': str(amount),
                    'total_paid': str(invoice.amount_paid),
                    'balance_remaining': str(invoice.balance),
                    'status': invoice.status,
                    'journal_entry_id': journal_entry.id,
                    'journal_entry_reference': payment_ref,
                    'line_item_allocations': [
                        {
                            'id': r.id,
                            'invoice_item_id': r.invoice_item_id,
                            'description': r.invoice_item.description[:80],
                            'amount': str(r.amount),
                            'payment_percentage': str(r.invoice_item.payment_percentage),
                            'line_balance': str(r.invoice_item.line_balance),
                            'creates_entitlement': r.invoice_item.creates_entitlement,
                            'entitlement_id': r.invoice_item.entitlement_id,
                            'entitlement_status': (
                                r.invoice_item.entitlement.status
                                if r.invoice_item.entitlement_id else None
                            ),
                            'entitlement_access_level': (
                                r.invoice_item.entitlement.current_access_level
                                if r.invoice_item.entitlement_id else None
                            ),
                        }
                        for r in allocation_records
                    ],
                })
                
        except Exception as e:
            logger.error(f"[PAYMENT] âŒ ERROR recording payment for invoice {invoice.invoice_number}: {str(e)}", exc_info=True)
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=True, methods=['get'], url_path='payment_history')
    def payment_history(self, request, pk=None):
        """
        Return a list of payments recorded against this invoice together with
        any pending/approved/rejected reversal requests for each payment.

        Each entry:
          - payment_reference
          - payment_date
          - amount
          - is_reversed (GL entry already reversed)
          - reversal_reference (reference of the reversing GL entry, if any)
          - reversal_request: {id, status, reason, requested_by, approved_by,
                               draft_journal_entry_id} or null
        """
        from .models import InvoiceItemPayment, PaymentReversalRequest
        from transactions.models import Transaction as JournalEntry

        invoice = self.get_object()

        # Aggregate item_payments by journal_entry_reference
        refs = (
            InvoiceItemPayment.objects
            .filter(invoice=invoice)
            .values('journal_entry_reference', 'payment_date')
            .annotate(total_amount=Sum('amount'))
            .order_by('payment_date', 'journal_entry_reference')
        )

        # Pre-fetch reversal requests for this invoice
        reversal_requests = {
            r.payment_reference: r
            for r in PaymentReversalRequest.objects.filter(invoice=invoice)
            .select_related('requested_by', 'approved_by', 'draft_journal_entry')
        }

        results = []
        for row in refs:
            ref = row['journal_entry_reference']
            je = None
            try:
                je = JournalEntry.objects.get(workflow_reference=ref, owner=invoice.owner)
            except JournalEntry.DoesNotExist:
                pass

            rr = reversal_requests.get(ref)
            reversal_request_data = None
            if rr:
                reversal_request_data = {
                    'id': rr.id,
                    'status': rr.status,
                    'reason': rr.reason,
                    'requested_by': (
                        rr.requested_by.get_full_name() or rr.requested_by.username
                    ),
                    'approved_by': (
                        (rr.approved_by.get_full_name() or rr.approved_by.username)
                        if rr.approved_by else None
                    ),
                    'approved_at': rr.approved_at,
                    'rejection_reason': rr.rejection_reason,
                    'draft_journal_entry_id': (
                        rr.draft_journal_entry_id
                    ),
                    'draft_journal_entry_ref': (
                        rr.draft_journal_entry.reference_number
                        if rr.draft_journal_entry else None
                    ),
                }

            results.append({
                'payment_reference': ref,
                'payment_date': row['payment_date'],
                'amount': str(row['total_amount']),
                'is_reversed': je.is_reversed if je else False,
                'reversal_reference': (
                    je.reversal_transaction.reference_number
                    if je and je.is_reversed and je.reversal_transaction
                    else None
                ),
                'reversal_request': reversal_request_data,
            })

        return Response({'payments': results})

    @action(detail=True, methods=['post'], url_path='request_payment_reversal')
    def request_payment_reversal(self, request, pk=None):
        """
        Step 1 â€” Submit a payment reversal request.

        Creates a PaymentReversalRequest (status=pending) AND a draft
        (unapproved) GL journal entry with the offsetting debit/credit lines
        so the approver can review the accounting impact before approving.

        Body:
          - payment_reference (str, required): journal_entry_reference of the
            payment to reverse (e.g. "INV-0001-PMT-abc123de").
          - reason (str, required): Reason for the reversal (min 10 chars).
        """
        from .models import InvoiceItemPayment, PaymentReversalRequest
        from transactions.models import (
            Transaction as JournalEntry,
            TransactionEntry,
            TransactionSeries,
        )

        invoice = self.get_object()
        payment_reference = (request.data.get('payment_reference') or '').strip()
        reason = (request.data.get('reason') or '').strip()

        if not payment_reference:
            return Response({'error': 'payment_reference is required'}, status=status.HTTP_400_BAD_REQUEST)
        if not reason:
            return Response({'error': 'reason is required'}, status=status.HTTP_400_BAD_REQUEST)
        if len(reason) < 10:
            return Response(
                {'error': 'Please provide a more detailed reason (minimum 10 characters)'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Guard: no duplicate pending request for the same payment
        if PaymentReversalRequest.objects.filter(
            invoice=invoice,
            payment_reference=payment_reference,
            status=PaymentReversalRequest.STATUS_PENDING,
        ).exists():
            return Response(
                {'error': 'A reversal request for this payment is already pending approval'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Locate the original GL journal entry
        try:
            original_je = JournalEntry.objects.get(
                workflow_reference=payment_reference,
                owner=invoice.owner,
            )
        except JournalEntry.DoesNotExist:
            return Response(
                {'error': f'No journal entry found for payment reference "{payment_reference}"'},
                status=status.HTTP_404_NOT_FOUND,
            )

        if original_je.is_reversed:
            return Response(
                {'error': 'This payment has already been reversed'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not original_je.approved:
            return Response(
                {'error': 'Only posted journal entries can be reversed'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Determine payment amount from InvoiceItemPayment records
        item_payments = InvoiceItemPayment.objects.filter(
            invoice=invoice,
            journal_entry_reference=payment_reference,
        ).select_related('invoice_item__entitlement')

        payment_amount = item_payments.aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

        if payment_amount <= 0:
            # Fallback: derive from debit side of the original GL entry
            payment_amount = original_je.entries.filter(
                side=TransactionEntry.DEBIT
            ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

        if payment_amount <= 0:
            return Response(
                {'error': 'Could not determine the payment amount from the journal entry'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            with transaction.atomic():
                # Create the draft (unapproved) reversal GL entry so the
                # approver can review the debit/credit lines before approving.
                series, _ = TransactionSeries.objects.get_or_create(
                    code='REV',
                    defaults={'description': 'Reversals'},
                )
                draft_je = JournalEntry.objects.create(
                    series=series,
                    date=original_je.date,
                    reference_number=f'{payment_reference}-REV-DRAFT',
                    workflow_reference=f'{payment_reference}-REV-PENDING',
                    description=(
                        f'[PENDING APPROVAL] Reversal of payment {payment_reference} '
                        f'on invoice {invoice.invoice_number}. Reason: {reason}'
                    ),
                    owner=invoice.owner,
                    branch=invoice.branch,
                    created_by=request.user,
                    is_reversal=True,
                    reverses_transaction=original_je,
                    # approved=False (default) â€” this is intentionally a draft
                )

                # Mirror the original entry lines with sides flipped (DRâ†’CR, CRâ†’DR)
                for entry in original_je.entries.all():
                    opposite_side = (
                        TransactionEntry.CREDIT
                        if entry.side == TransactionEntry.DEBIT
                        else TransactionEntry.DEBIT
                    )
                    TransactionEntry.objects.create(
                        transaction=draft_je,
                        account=entry.account,
                        side=opposite_side,
                        amount=entry.amount,
                    )

                # Record the reversal request
                reversal_request = PaymentReversalRequest.objects.create(
                    invoice=invoice,
                    payment_reference=payment_reference,
                    amount=payment_amount,
                    reason=reason,
                    status=PaymentReversalRequest.STATUS_PENDING,
                    requested_by=request.user,
                    draft_journal_entry=draft_je,
                    owner=invoice.owner,
                    branch=invoice.branch,
                    created_by=request.user,
                    tenant=getattr(invoice, 'tenant', None),
                )

            return Response({
                'success': True,
                'message': (
                    'Reversal request submitted. An approver must review and approve '
                    'before the payment is reversed.'
                ),
                'reversal_request_id': reversal_request.id,
                'draft_journal_entry_id': draft_je.id,
                'draft_journal_entry_ref': draft_je.reference_number,
                'amount': str(payment_amount),
            }, status=status.HTTP_201_CREATED)

        except Exception as e:
            logger.error(
                f'[REQUEST_REVERSAL] âŒ ERROR creating reversal request for '
                f'payment {payment_reference} on invoice '
                f'{invoice.invoice_number}: {str(e)}',
                exc_info=True,
            )
            return Response(
                {'error': f'Failed to create reversal request: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=True, methods=['post'], url_path='approve_payment_reversal')
    def approve_payment_reversal(self, request, pk=None):
        """
        Step 2a â€” Approve a pending payment reversal request.

        Requires IsApprover permission.

        Atomically:
          1. Posts the draft GL reversal journal entry.
          2. Marks the original GL payment entry as reversed.
          3. Rolls back per-line-item allocations and entitlement amounts.
          4. Reduces invoice.amount_paid and resets invoice status.
          5. Marks the PaymentReversalRequest as approved.

        Body:
          - reversal_request_id (int, required): ID of the PaymentReversalRequest.
        """
        from .models import InvoiceItemPayment, PaymentReversalRequest, EntitlementPaymentLog
        from transactions.models import Transaction as JournalEntry

        if not (request.user.is_staff or hasattr(request.user, 'is_approver') and request.user.is_approver):
            # Secondary check â€” DRF permission class is the primary gate
            from common.approval_permissions import IsApprover as _IsApprover
            perm = _IsApprover()
            if not perm.has_permission(request, self):
                return Response(
                    {'error': 'You do not have permission to approve payment reversals'},
                    status=status.HTTP_403_FORBIDDEN,
                )

        invoice = self.get_object()
        request_id = request.data.get('reversal_request_id')

        if not request_id:
            return Response({'error': 'reversal_request_id is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            reversal_request = PaymentReversalRequest.objects.select_related(
                'draft_journal_entry'
            ).get(id=request_id, invoice=invoice)
        except PaymentReversalRequest.DoesNotExist:
            return Response(
                {'error': 'Reversal request not found for this invoice'},
                status=status.HTTP_404_NOT_FOUND,
            )

        if reversal_request.status != PaymentReversalRequest.STATUS_PENDING:
            return Response(
                {'error': f'Reversal request is already {reversal_request.status}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            original_je = JournalEntry.objects.get(
                workflow_reference=reversal_request.payment_reference,
                owner=invoice.owner,
            )
        except JournalEntry.DoesNotExist:
            return Response(
                {'error': 'Original payment journal entry not found'},
                status=status.HTTP_404_NOT_FOUND,
            )

        if original_je.is_reversed:
            return Response(
                {'error': 'The original payment has already been reversed'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        item_payments = InvoiceItemPayment.objects.filter(
            invoice=invoice,
            journal_entry_reference=reversal_request.payment_reference,
        ).select_related('invoice_item__entitlement')

        payment_amount = reversal_request.amount

        try:
            with transaction.atomic():
                draft_je = reversal_request.draft_journal_entry

                # 1. Post the draft reversal GL entry (marks it approved=True and
                #    updates all account balances)
                draft_je.post()

                # 2. Link the original GL entry to its reversal and mark it reversed
                original_je.is_reversed = True
                original_je.reversed_at = timezone.now()
                original_je.reversed_by = request.user
                original_je.reversal_reason = reversal_request.reason
                original_je.reversal_transaction = draft_je
                original_je.save(update_fields=[
                    'is_reversed', 'reversed_at', 'reversed_by',
                    'reversal_reason', 'reversal_transaction',
                ])

                # 3. Roll back per-line-item allocations
                for item_payment in item_payments:
                    item = item_payment.invoice_item
                    reversal_amount = item_payment.amount
                    item.amount_paid = max(Decimal('0'), item.amount_paid - reversal_amount)
                    item.save(update_fields=['amount_paid'])

                    if item.creates_entitlement and item.entitlement_id:
                        ent = item.entitlement
                        ent.amount_paid = max(Decimal('0'), ent.amount_paid - reversal_amount)
                        ent._update_status_and_access()
                        if ent.inventory_allocation_id:
                            ent._update_allocation_status()
                        ent.save()
                        EntitlementPaymentLog.objects.create(
                            entitlement=ent,
                            amount=-reversal_amount,
                            payment_date=timezone.now().date(),
                            balance_after=ent.balance,
                            owner=ent.owner,
                            branch=ent.branch,
                            created_by=request.user,
                        )

                # 4. Update invoice totals and status
                invoice.amount_paid = max(Decimal('0'), invoice.amount_paid - payment_amount)
                total = invoice.total_amount if invoice.total_amount else (invoice.amount or Decimal('0'))
                if invoice.amount_paid <= 0:
                    invoice.status = 'sent'
                elif invoice.amount_paid < total:
                    invoice.status = 'partial'
                else:
                    invoice.status = 'paid'
                invoice.save(update_fields=['amount_paid', 'status'])

                # 5. Mark the request as approved
                reversal_request.status = PaymentReversalRequest.STATUS_APPROVED
                reversal_request.approved_by = request.user
                reversal_request.approved_at = timezone.now()
                reversal_request.save(update_fields=['status', 'approved_by', 'approved_at'])

            invoice.refresh_from_db()
            serializer = self.get_serializer(invoice)
            return Response({
                'success': True,
                'message': (
                    f'Payment reversal approved. '
                    f'â‚¦{payment_amount} reversed from invoice {invoice.invoice_number}.'
                ),
                'reversed_amount': str(payment_amount),
                'invoice': serializer.data,
            }, status=status.HTTP_200_OK)

        except ValidationError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.error(
                f'[APPROVE_REVERSAL] âŒ ERROR approving reversal request {request_id} '
                f'for invoice {invoice.invoice_number}: {str(e)}',
                exc_info=True,
            )
            return Response(
                {'error': f'Failed to approve reversal: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=True, methods=['post'], url_path='reject_payment_reversal')
    def reject_payment_reversal(self, request, pk=None):
        """
        Step 2b â€” Reject a pending payment reversal request.

        Requires IsApprover permission.
        Voids the draft GL journal entry and marks the request as rejected.

        Body:
          - reversal_request_id (int, required): ID of the PaymentReversalRequest.
          - rejection_reason (str, required): Reason for rejection (min 10 chars).
        """
        from .models import PaymentReversalRequest

        invoice = self.get_object()
        request_id = request.data.get('reversal_request_id')
        rejection_reason = (request.data.get('rejection_reason') or '').strip()

        if not request_id:
            return Response({'error': 'reversal_request_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        if not rejection_reason:
            return Response({'error': 'rejection_reason is required'}, status=status.HTTP_400_BAD_REQUEST)
        if len(rejection_reason) < 10:
            return Response(
                {'error': 'Please provide a more detailed rejection reason (minimum 10 characters)'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            reversal_request = PaymentReversalRequest.objects.select_related(
                'draft_journal_entry'
            ).get(id=request_id, invoice=invoice)
        except PaymentReversalRequest.DoesNotExist:
            return Response(
                {'error': 'Reversal request not found for this invoice'},
                status=status.HTTP_404_NOT_FOUND,
            )

        if reversal_request.status != PaymentReversalRequest.STATUS_PENDING:
            return Response(
                {'error': f'Reversal request is already {reversal_request.status}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            with transaction.atomic():
                # Void (soft-delete) the draft GL entry so it doesn't pollute reports
                if reversal_request.draft_journal_entry:
                    draft_je = reversal_request.draft_journal_entry
                    try:
                        draft_je.void(user=request.user, reason=f'Reversal request rejected: {rejection_reason}')
                    except Exception:
                        # If void fails (e.g. already voided), just delete it
                        draft_je.is_deleted = True
                        draft_je.save(update_fields=['is_deleted'])

                reversal_request.status = PaymentReversalRequest.STATUS_REJECTED
                reversal_request.approved_by = request.user
                reversal_request.approved_at = timezone.now()
                reversal_request.rejection_reason = rejection_reason
                reversal_request.save(update_fields=[
                    'status', 'approved_by', 'approved_at', 'rejection_reason',
                ])

            return Response({
                'success': True,
                'message': 'Reversal request rejected. The payment remains in effect.',
                'reversal_request_id': reversal_request.id,
            }, status=status.HTTP_200_OK)

        except Exception as e:
            logger.error(
                f'[REJECT_REVERSAL] âŒ ERROR rejecting reversal request {request_id} '
                f'for invoice {invoice.invoice_number}: {str(e)}',
                exc_info=True,
            )
            return Response(
                {'error': f'Failed to reject reversal request: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=False, methods=['post'], url_path='bulk_create')
    def bulk_create(self, request):
        """
        Bulk create invoices for multiple clients
        
        POST /api/incomes/invoices/bulk_create/
        {
            "fee_structure": 1,
            "clients": [1, 2, 3, 4, 5],
            "invoice_date": "2025-02-01",
            "due_date": "2025-02-28",
            "description_template": "{student_name} - {fee_structure_name}",
            "period_context": {
                "academic_year": "2024-2025",
                "term": "2"
            }
        }
        """
        from common.services.reference_service import ReferenceService
        from .serializers import BulkInvoiceCreateSerializer
        from clients.models import Client
        
        serializer = BulkInvoiceCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        data = serializer.validated_data
        fee_structure_id = data['fee_structure']
        client_ids = data['clients']
        invoice_date = data['invoice_date']
        due_date = data['due_date']
        description_template = data.get('description_template', '{student_name} - {fee_structure_name}')
        period_context = data.get('period_context', {})
        
        # Get fee structure
        fee_structure = FeeStructure.objects.get(id=fee_structure_id)
        
        # Get clients
        clients = Client.objects.filter(id__in=client_ids)
        
        created_invoices = []
        failed = []
        
        with transaction.atomic():
            for client in clients:
                try:
                    # Generate invoice number
                    invoice_number = ReferenceService.generate_reference(
                        module='incomes',
                        model_name='invoice',
                        tenant=request.user.tenant if hasattr(request.user, 'tenant') else request.user,
                        branch=request.user.branch
                    )
                    
                    # Format description
                    description = description_template.format(
                        student_name=client.full_name,
                        fee_structure_name=fee_structure.name,
                        client_name=client.full_name
                    )
                    
                    # Create invoice
                    invoice = Invoice.objects.create(
                        client=client,
                        invoice_number=invoice_number,
                        invoice_date=invoice_date,
                        due_date=due_date,
                        description=description,
                        amount=fee_structure.base_amount,
                        fee_structure=fee_structure,
                        metadata=period_context,
                        owner=request.user,
                        branch=request.user.branch,
                        tenant=request.user.tenant if hasattr(request.user, 'tenant') else None,
                        status='draft'
                    )
                    
                    # Register reference
                    ReferenceService.register_reference(
                        reference_number=invoice_number,
                        module='incomes',
                        model_name='invoice',
                        object_id=invoice.id,
                        tenant=request.user.tenant if hasattr(request.user, 'tenant') else request.user,
                        branch=request.user.branch,
                        created_by=request.user,
                        status=invoice.status,
                        amount=float(invoice.amount),
                        metadata=invoice.metadata or {}
                    )
                    
                    created_invoices.append({
                        'id': invoice.id,
                        'invoice_number': invoice.invoice_number,
                        'client_id': client.id,
                        'client_name': client.full_name,
                        'amount': str(invoice.amount)
                    })
                    
                except Exception as e:
                    failed.append({
                        'client_id': client.id,
                        'client_name': client.full_name,
                        'error': str(e)
                    })
        
        return Response({
            'success': True,
            'created_count': len(created_invoices),
            'failed_count': len(failed),
            'total_amount': str(sum(float(inv['amount']) for inv in created_invoices)),
            'created_invoices': created_invoices,
            'failed': failed if failed else None
        }, status=status.HTTP_201_CREATED if created_invoices else status.HTTP_400_BAD_REQUEST)
    
    @action(detail=False, methods=['post'], url_path='generate-term-invoices')
    def generate_term_invoices(self, request):
        """
        Trigger workflow to generate invoices for a term
        
        POST /api/incomes/invoices/generate-term-invoices/
        {
            "academic_year": "2025-2026",
            "term": "first",
            "invoice_date": "2025-09-01",
            "due_date": "2025-09-30",
            "class_codes": ["P1A", "P1B"]  // Optional: specific classes only
        }
        """
        from .services.receivables_service import ReceivablesService
        from clients.models import Client, ClientClassification
        
        # Validate required fields
        required = ['academic_year', 'term', 'invoice_date', 'due_date']
        missing = [f for f in required if f not in request.data]
        if missing:
            return Response(
                {"error": f"Missing required fields: {missing}"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        service = ReceivablesService()
        academic_year = request.data['academic_year']
        term = request.data['term']
        invoice_date = request.data['invoice_date']
        due_date = request.data['due_date']
        class_codes = request.data.get('class_codes', [])
        
        # Get active students grouped by class
        students_query = Client.objects.filter(status='active').select_related('classification')
        
        if class_codes:
            students_query = students_query.filter(classification__code__in=class_codes)
        
        # Group by classification
        from collections import defaultdict
        classes = defaultdict(list)
        
        for student in students_query:
            if student.classification:
                classes[student.classification.code].append(student)
        
        if not classes:
            return Response(
                {"error": "No active students found"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get active fee structures for this term
        fee_structures = FeeStructure.objects.filter(
            is_active=True,
            industry_config__academic_year=academic_year,
            industry_config__term=term
        )
        
        if not fee_structures.exists():
            return Response(
                {"error": f"No active fee structures found for {academic_year} {term}"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Generate invoices per class
        total_invoices = 0
        total_amount = Decimal('0')
        results_by_class = {}
        
        for class_code, students in classes.items():
            class_invoices = []
            
            for student in students:
                # Check for duplicate
                if service.check_duplicate_invoice(student.id, term, academic_year):
                    logger.info(f"Invoice already exists for student {student.id}")
                    continue
                
                # Calculate fees
                fee_items = service.calculate_applicable_fees(
                    student, list(fee_structures), academic_year, term
                )
                
                if not fee_items:
                    continue
                
                # Calculate discounts
                discounts = service.calculate_applicable_discounts(
                    student, fee_items, invoice_date, due_date, academic_year, term
                )
                
                # Create draft invoice
                try:
                    invoice = service.create_draft_invoice(
                        student=student,
                        fee_items=fee_items,
                        invoice_date=invoice_date,
                        due_date=due_date,
                        metadata={
                            'academic_year': academic_year,
                            'term': term,
                            'class_code': class_code,
                            'class_name': student.classification.name if student.classification else ''
                        },
                        applicable_discounts=discounts
                    )
                    class_invoices.append(invoice)
                    total_amount += invoice.amount
                except Exception as e:
                    logger.error(f"Failed to create invoice for student {student.id}: {e}")
            
            if class_invoices:
                results_by_class[class_code] = {
                    'count': len(class_invoices),
                    'total_amount': float(sum(inv.amount for inv in class_invoices))
                }
                total_invoices += len(class_invoices)
        
        return Response({
            "message": f"Generated {total_invoices} draft invoices",
            "total_invoices": total_invoices,
            "total_amount": float(total_amount),
            "classes": results_by_class,
            "status": "draft",
            "next_step": "Review class summaries and approve"
        })
    
    @action(detail=False, methods=['get'], url_path='class-summary')
    def class_summary(self, request):
        """
        Get invoice summary by class for approval
        
        GET /api/incomes/invoices/class-summary/?academic_year=2025-2026&term=first&status=draft
        """
        from .services.receivables_service import ReceivablesService
        
        academic_year = request.query_params.get('academic_year')
        term = request.query_params.get('term')
        status_filter = request.query_params.get('status', 'draft')
        
        if not academic_year or not term:
            return Response(
                {"error": "academic_year and term are required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get invoices grouped by class
        invoices = Invoice.objects.filter(
            metadata__academic_year=academic_year,
            metadata__term=term,
            status=status_filter
        ).select_related('client', 'client__classification')
        
        # Group by class
        from collections import defaultdict
        classes = defaultdict(list)
        for invoice in invoices:
            class_code = invoice.metadata.get('class_code')
            if class_code:
                classes[class_code].append(invoice)
        
        # Generate summaries
        service = ReceivablesService()
        summaries = [
            service.generate_class_invoice_summary(class_code, inv_list)
            for class_code, inv_list in classes.items()
        ]
        
        return Response({
            "academic_year": academic_year,
            "term": term,
            "status": status_filter,
            "total_classes": len(summaries),
            "total_invoices": sum(s['invoice_count'] for s in summaries),
            "grand_total": sum(s['grand_total'] for s in summaries),
            "total_discounts": sum(s['total_discounts'] for s in summaries),
            "classes": summaries
        })
    
    @action(detail=False, methods=['post'], url_path='approve-class-invoices')
    def approve_class_invoices(self, request):
        """
        Approve invoices for specific classes
        
        POST /api/incomes/invoices/approve-class-invoices/
        {
            "approved_classes": ["P1A", "P1B", "P2A"],
            "academic_year": "2025-2026",
            "term": "first",
            "comment": "Approved with adjustments"
        }
        """
        from .services.receivables_service import ReceivablesService
        
        approved_classes = request.data.get('approved_classes', [])
        academic_year = request.data.get('academic_year')
        term = request.data.get('term')
        
        if not all([approved_classes, academic_year, term]):
            return Response(
                {"error": "approved_classes, academic_year, and term are required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get draft invoices for approved classes
        invoice_ids = Invoice.objects.filter(
            metadata__academic_year=academic_year,
            metadata__term=term,
            metadata__class_code__in=approved_classes,
            status='draft'
        ).values_list('id', flat=True)
        
        if not invoice_ids:
            return Response(
                {"error": "No draft invoices found for specified classes"},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Activate invoices
        service = ReceivablesService()
        updated = service.activate_invoices(list(invoice_ids), new_status='sent')
        
        # Create entitlements
        service.create_fee_entitlements_bulk(
            list(invoice_ids),
            {'year': academic_year, 'term': term}
        )
        
        return Response({
            "message": f"Activated {updated} invoices for {len(approved_classes)} classes",
            "invoice_count": updated,
            "approved_classes": approved_classes,
            "status": "sent"
        })
    
    @action(detail=False, methods=['post'], url_path='generate-pdfs')
    def generate_pdfs(self, request):
        """
        Generate PDFs for invoices
        
        POST /api/incomes/invoices/generate-pdfs/
        {
            "class_code": "P1A",
            "academic_year": "2025-2026",
            "term": "first"
        }
        """
        from .services.pdf_batch_service import InvoicePDFBatchService
        
        class_code = request.data.get('class_code')
        academic_year = request.data.get('academic_year')
        term = request.data.get('term')
        
        if not all([class_code, academic_year, term]):
            return Response(
                {"error": "class_code, academic_year, and term are required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get invoices
        invoice_ids = Invoice.objects.filter(
            metadata__class_code=class_code,
            metadata__academic_year=academic_year,
            metadata__term=term,
            status__in=['sent', 'partial', 'paid']
        ).values_list('id', flat=True)
        
        if not invoice_ids:
            return Response(
                {"error": "No invoices found for specified criteria"},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Generate PDFs
        pdf_service = InvoicePDFBatchService()
        results = pdf_service.generate_class_invoice_pdfs(
            class_code,
            list(invoice_ids)
        )
        
        # Create ZIP
        successful_pdfs = [r for r in results if 'error' not in r]
        if successful_pdfs:
            zip_path = f"invoices/{academic_year}/{term}/{class_code}.zip"
            try:
                zip_url = pdf_service.create_invoice_zip(class_code, successful_pdfs, zip_path)
                full_zip_url = request.build_absolute_uri(zip_url)
            except Exception as e:
                logger.error(f"Failed to create ZIP: {e}")
                full_zip_url = None
        else:
            full_zip_url = None
        
        return Response({
            "message": f"Generated {len(successful_pdfs)} PDFs",
            "total_invoices": len(results),
            "successful": len(successful_pdfs),
            "failed": len(results) - len(successful_pdfs),
            "zip_download_url": full_zip_url,
            "results": results[:10]  # Limit results for response size
        })
    
    @action(detail=True, methods=['get'], url_path='download-pdf')
    def download_pdf(self, request, pk=None):
        """
        Download individual invoice PDF.

        GET /api/incomes/invoices/{id}/download-pdf/

        The PDF is generated fresh on every request by WeasyPrint.
        The frontend disables the button while a request is in-flight so
        the user cannot trigger duplicate generations.
        """
        from django.http import HttpResponse

        invoice = self.get_object()

        # SECURITY: only allow download for approved / posted invoices
        if not getattr(invoice, 'is_posted', False):
            return Response(
                {'error': 'Invoice must be approved before downloading.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            from .services.pdf_batch_service import InvoicePDFBatchService

            pdf_service = InvoicePDFBatchService()
            pdf_bytes = pdf_service._generate_invoice_pdf(invoice)

            response = HttpResponse(pdf_bytes, content_type='application/pdf')
            response['Content-Disposition'] = (
                f'attachment; filename="{invoice.invoice_number}.pdf"'
            )
            return response

        except Exception as e:
            logger.error(f"Failed to generate PDF for invoice {invoice.invoice_number}: {e}")
            return Response(
                {"error": f"Failed to generate PDF: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=True, methods=['post'], url_path='send-email')
    def send_email(self, request, pk=None):
        """
        Send an invoice PDF to an email address. Only allowed for approved/posted invoices.
        POST /api/incomes/invoices/{id}/send-email/ { email, subject, message }
        """
        # Email sending is currently disabled by policy/config.
        # Return a clear response so frontend does not attempt to send emails.
        return Response(
            {"error": "Email sending is disabled in this environment."},
            status=status.HTTP_501_NOT_IMPLEMENTED
        )
    
    @action(detail=False, methods=['get'], url_path='download-class-zip')
    def download_class_zip(self, request):
        """
        Download ZIP of all invoices for a class
        
        GET /api/incomes/invoices/download-class-zip/?class_code=P1A&academic_year=2025-2026&term=first
        """
        from django.core.files.storage import default_storage
        from django.http import FileResponse
        
        class_code = request.query_params.get('class_code')
        academic_year = request.query_params.get('academic_year')
        term = request.query_params.get('term')
        
        if not all([class_code, academic_year, term]):
            return Response(
                {"error": "class_code, academic_year, and term are required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        zip_path = f"invoices/{academic_year}/{term}/{class_code}.zip"
        
        if not default_storage.exists(zip_path):
            return Response(
                {"error": "ZIP archive not found. Generate PDFs first."},
                status=status.HTTP_404_NOT_FOUND
            )
        
        zip_file = default_storage.open(zip_path, 'rb')
        response = FileResponse(zip_file, content_type='application/zip')
        response['Content-Disposition'] = f'attachment; filename="{class_code}_{term}_{academic_year}.zip"'
        return response
    
    # ========================================================================
    # BULK INVOICE GENERATION ENDPOINTS
    # ========================================================================
    
    @action(detail=False, methods=['post'], url_path='generate-batch')
    def generate_batch(self, request):
        """
        Generate batch of invoices for entire class
        
        POST /api/incomes/invoices/generate-batch/
        {
            "term_id": 1,
            "classification_id": 5,
            "fee_structure_id": 3,
            "due_date": "2026-02-28",  // optional
            "notes": "First term fees"
        }
        
        Returns batch summary with discount/scholarship visibility
        """
        from .serializers import GenerateBatchSerializer
        from .services.bulk_invoice_service import BulkInvoiceService
        
        serializer = GenerateBatchSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            result = BulkInvoiceService.generate_batch_for_term(
                term_id=serializer.validated_data['term_id'],
                classification_id=serializer.validated_data['classification_id'],
                fee_structure_id=serializer.validated_data['fee_structure_id'],
                branch=request.user.branch,
                owner=request.user,
                due_date=serializer.validated_data.get('due_date'),
                notes=serializer.validated_data.get('notes', ''),
            )
            
            return Response(result, status=status.HTTP_201_CREATED)
            
        except ValidationError as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            logger.error(f"Batch generation failed: {e}")
            return Response(
                {"error": f"Failed to generate batch: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['get'], url_path='batch-summary')
    def batch_summary(self, request):
        """
        Get summary of batch for approval review
        Shows all discounts/scholarships
        
        GET /api/incomes/invoices/batch-summary/?batch_id=BATCH-T1-P3A-20260118120000
        """
        from .serializers import BatchSummarySerializer
        from .services.bulk_invoice_service import BulkInvoiceService
        
        batch_id = request.query_params.get('batch_id')
        if not batch_id:
            return Response(
                {"error": "batch_id parameter is required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            summary = BulkInvoiceService.get_batch_summary(
                batch_id=batch_id,
                branch=request.user.branch
            )
            
            serializer = BatchSummarySerializer(summary)
            return Response(serializer.data)
            
        except ValidationError as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            logger.error(f"Batch summary failed: {e}")
            return Response(
                {"error": f"Failed to get batch summary: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['get'], url_path='batch-sample')
    def batch_sample(self, request):
        """
        Get random sample of batch invoices for Finance Officer review
        Compliance requirement: Review sample before bulk approval
        
        GET /api/incomes/invoices/batch-sample/?batch_id=BATCH-T1-P3A-20260118120000&sample_pct=5
        """
        from .services.bulk_invoice_service import BulkInvoiceService
        
        batch_id = request.query_params.get('batch_id')
        if not batch_id:
            return Response(
                {"error": "batch_id parameter is required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Optional parameters
        sample_size = request.query_params.get('sample_size')
        sample_pct = request.query_params.get('sample_pct', 5.0)
        
        try:
            sample_size = int(sample_size) if sample_size else None
            sample_pct = float(sample_pct)
        except ValueError:
            return Response(
                {"error": "sample_size and sample_pct must be numeric"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            sample = BulkInvoiceService.get_batch_sample(
                batch_id=batch_id,
                branch=request.user.branch,
                sample_size=sample_size,
                sample_pct=sample_pct
            )
            
            return Response(sample)
            
        except ValidationError as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            logger.error(f"Batch sample failed: {e}")
            return Response(
                {"error": f"Failed to get batch sample: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['get'], url_path='batch-approval-report')
    def batch_approval_report(self, request):
        """
        Generate PDF approval report for batch
        Compliance requirement: Sign-off report confirming zero discrepancies
        
        GET /api/incomes/invoices/batch-approval-report/?batch_id=BATCH-T1-P3A-20260118120000
        
        Returns PDF file download
        """
        from django.http import HttpResponse
        from .services.bulk_invoice_service import BulkInvoiceService
        
        batch_id = request.query_params.get('batch_id')
        if not batch_id:
            return Response(
                {"error": "batch_id parameter is required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            # Get batch summary
            summary = BulkInvoiceService.get_batch_summary(
                batch_id=batch_id,
                branch=request.user.branch
            )
            
            # Generate PDF report
            pdf_content = BulkInvoiceService.generate_approval_report(
                batch_id=batch_id,
                branch=request.user.branch,
                approver=request.user,
                summary=summary
            )
            
            # Return as downloadable PDF
            response = HttpResponse(pdf_content, content_type='application/pdf')
            response['Content-Disposition'] = f'attachment; filename="batch_approval_{batch_id}.pdf"'
            return response
            
        except ValidationError as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            logger.error(f"Batch approval report failed: {e}")
            return Response(
                {"error": f"Failed to generate approval report: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['post'], url_path='approve-batch')
    def approve_batch(self, request):
        """
        Approve batch of invoices
        Converts draft to receivables (status='pending')
        Allows selective approval of discounts
        
        POST /api/incomes/invoices/approve-batch/
        {
            "batch_id": "BATCH-T1-P3A-20260118120000",
            "notes": "Approved for term 1",
            "approved_discount_invoice_ids": [123, 456, 789]  // optional, null = approve all
        }
        """
        from .serializers import ApproveRejectSerializer
        from .services.bulk_invoice_service import BulkInvoiceService
        
        batch_id = request.data.get('batch_id')
        if not batch_id:
            return Response(
                {"error": "batch_id is required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        serializer = ApproveRejectSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            result = BulkInvoiceService.approve_batch(
                batch_id=batch_id,
                branch=request.user.branch,
                approver=request.user,
                notes=serializer.validated_data.get('notes', ''),
                approved_discount_invoice_ids=serializer.validated_data.get('approved_discount_invoice_ids')
            )
            
            return Response(result, status=status.HTTP_200_OK)
            
        except ValidationError as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            logger.error(f"Batch approval failed: {e}")
            return Response(
                {"error": f"Failed to approve batch: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['post'], url_path='reject-batch')
    def reject_batch(self, request):
        """
        Reject entire batch of invoices
        Soft deletes all draft invoices
        
        POST /api/incomes/invoices/reject-batch/
        {
            "batch_id": "BATCH-T1-P3A-20260118120000",
            "reason": "Incorrect fee structure applied"
        }
        """
        from .serializers import ApproveRejectSerializer
        from .services.bulk_invoice_service import BulkInvoiceService
        
        batch_id = request.data.get('batch_id')
        reason = request.data.get('reason', '')
        
        if not batch_id:
            return Response(
                {"error": "batch_id is required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            result = BulkInvoiceService.reject_batch(
                batch_id=batch_id,
                branch=request.user.branch,
                rejector=request.user,
                reason=reason
            )
            
            return Response(result, status=status.HTTP_200_OK)
            
        except ValidationError as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            logger.error(f"Batch rejection failed: {e}")
            return Response(
                {"error": f"Failed to reject batch: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['get'], url_path='batch-list')
    def batch_list(self, request):
        """
        List all invoice batches
        
        GET /api/incomes/invoices/batch-list/?status=draft
        """
        from .serializers import BatchListSerializer
        from .services.bulk_invoice_service import BulkInvoiceService
        
        status_filter = request.query_params.get('status')
        
        try:
            batches = BulkInvoiceService.list_batches(
                branch=request.user.branch,
                status=status_filter
            )
            
            serializer = BatchListSerializer(batches, many=True)
            return Response(serializer.data)
            
        except Exception as e:
            logger.error(f"Batch list failed: {e}")
            return Response(
                {"error": f"Failed to list batches: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['get'], url_path='batch-pdf')
    def batch_pdf(self, request):
        """
        Download ZIP of all invoices in a batch
        
        GET /api/incomes/invoices/batch-pdf/?batch_id=BATCH-T1-P3A-20260118120000
        """
        from .services.pdf_batch_service import InvoicePDFBatchService
        from django.http import HttpResponse
        
        batch_id = request.query_params.get('batch_id')
        if not batch_id:
            return Response(
                {"error": "batch_id parameter is required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            # Get all invoices in batch
            invoices = Invoice.objects.filter(
                metadata__batch_id=batch_id,
                branch=request.user.branch
            ).select_related('client', 'fee_structure')
            
            if not invoices.exists():
                return Response(
                    {"error": "No invoices found in batch"},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            # Generate ZIP
            pdf_service = InvoicePDFBatchService()
            zip_bytes = pdf_service.generate_batch_zip(invoices, batch_id)
            
            response = HttpResponse(zip_bytes, content_type='application/zip')
            response['Content-Disposition'] = f'attachment; filename="{batch_id}.zip"'
            return response
            
        except Exception as e:
            logger.error(f"Batch PDF generation failed: {e}")
            return Response(
                {"error": f"Failed to generate batch PDF: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class FeeEntitlementViewSet(ScopedModelViewSet):
    """ViewSet for fee entitlements"""
    permission_module = 'incomes'
    permission_page = 'fee-entitlements'
    queryset = FeeEntitlement.objects.all()
    permission_classes = [IsAuthenticated]
    
    def get_serializer_class(self):
        if self.action == 'list':
            return FeeEntitlementListSerializer
        return FeeEntitlementSerializer
    
    def create(self, request, *args, **kwargs):
        """
        Create entitlement - redirects to create_with_invoice action
        
        Entitlements must be created through create_with_invoice endpoint
        which properly handles invoice generation and entitlement setup.
        """
        # Extract data and redirect to create_with_invoice
        return self.create_with_invoice(request)
    
    def get_queryset(self):
        queryset = super().get_queryset()
        
        # Filter by client
        client_id = self.request.query_params.get('client_id')
        if client_id:
            queryset = queryset.filter(client_id=client_id)
        
        # Filter by status
        status_filter = self.request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        
        # Filter by academic period
        academic_year = self.request.query_params.get('academic_year')
        if academic_year:
            queryset = queryset.filter(academic_period__year=academic_year)
        
        term = self.request.query_params.get('term')
        if term:
            queryset = queryset.filter(academic_period__term=term)
        
        # Filter by payment term type
        payment_term = self.request.query_params.get('payment_term_type')
        if payment_term:
            queryset = queryset.filter(payment_term_type=payment_term)
        
        # Include related data
        queryset = queryset.select_related(
            'client', 'invoice', 'service_item', 'fee_structure', 'inventory_allocation'
        ).prefetch_related(
            'payment_logs', 'usage_logs', 'status_logs'
        )
        
        return queryset
    
    @action(detail=False, methods=['post'])
    def enroll(self, request):
        """
        Enroll a student/client - creates invoice and entitlement automatically
        
        This is the main enrollment endpoint that:
        1. Creates an invoice for the fee structure
        2. Creates an entitlement with payment terms and access rules
        3. Sets up automatic payment tracking
        
        Example:
        POST /api/incomes/entitlements/enroll/
        {
          "client": 1,
          "fee_structure": 1,
          "academic_period": {"year": "2024-2025", "term": "2"},
          "payment_terms": {"type": "minimum_deposit", "minimum_percent": 50},
          "access_rules": {"allowed_services": ["classes", "library"]}
        }
        """
        serializer = EnrollSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        
        try:
            from clients.models import Client
            from datetime import timedelta
            from common.services.reference_service import ReferenceService
            
            client = Client.objects.get(id=data['client'])
            fee_structure = FeeStructure.objects.get(id=data['fee_structure'])
            tenant = getattr(request.user, 'tenant', request.user)
            
            # Extract payment terms
            payment_terms = data.get('payment_terms', {})
            payment_type = payment_terms.get('type', 'minimum_deposit')
            minimum_percent = Decimal(str(payment_terms.get('minimum_percent', 50)))
            full_access_percent = Decimal(str(payment_terms.get('full_access_percent', 100)))
            grace_period_days = payment_terms.get('grace_period_days', 14)
            
            # Extract access rules
            access_rules = data.get('access_rules', {})
            allowed_services = access_rules.get('allowed_services', [])
            restricted_services = access_rules.get('restricted_services', [])
            
            # Extract academic period
            academic_period = data.get('academic_period', {})
            
            with transaction.atomic():
                # 1. Generate unique invoice number using ReferenceService
                invoice_number = ReferenceService.generate_reference(
                    module='incomes',
                    model_name='invoice',
                    tenant=tenant,
                    branch=request.user.branch
                )
                
                # 2. Create invoice
                invoice = Invoice.objects.create(
                    client=client,
                    invoice_number=invoice_number,
                    invoice_date=timezone.now().date(),
                    due_date=timezone.now().date() + timedelta(days=30),
                    description=f"{fee_structure.name} - {academic_period.get('year', '')} Term {academic_period.get('term', '')}",
                    amount=fee_structure.base_amount,
                    fee_structure=fee_structure,
                    status='sent',
                    metadata=academic_period,
                    owner=request.user,
                    branch=request.user.branch,
                    created_by=request.user
                )
                
                # Register the invoice number
                ReferenceService.register_reference(
                    reference_number=invoice_number,
                    module='incomes',
                    model_name='invoice',
                    object_id=invoice.id,
                    tenant=tenant,
                    branch=request.user.branch,
                    created_by=request.user
                )
                
                # 3. Calculate minimum required
                minimum_required = (fee_structure.base_amount * minimum_percent) / 100
                
                # 4. Build comprehensive access rules
                complete_access_rules = {
                    'requires_minimum': True,
                    'full_access_at_percent': float(full_access_percent),
                    'grace_period_days': grace_period_days,
                    'restrict_on_overdue': True,
                    'allowed_services': allowed_services,
                    'restricted_services': restricted_services,
                    'minimum_percent': float(minimum_percent)
                }
                
                # 5. Create entitlement
                entitlement = FeeEntitlement.objects.create(
                    client=client,
                    invoice=invoice,
                    fee_structure=fee_structure,
                    academic_period=academic_period,
                    payment_term_type=payment_type,
                    total_amount=fee_structure.base_amount,
                    amount_paid=Decimal('0.00'),
                    minimum_required=minimum_required,
                    access_rules=complete_access_rules,
                    status='pending',
                    current_access_level='none',
                    valid_from=timezone.now().date(),
                    tenant=getattr(request.user, 'tenant', None),
                    owner=request.user,
                    branch=request.user.branch,
                    created_by=request.user
                )
                
                # 6. Link inventory allocation if provided
                if data.get('inventory_allocation_id'):
                    entitlement.inventory_allocation_id = data['inventory_allocation_id']
                    entitlement.save()
                
                logger.info(
                    f"Enrollment successful - Client: {client.full_name}, "
                    f"Invoice: {invoice_number}, Entitlement: {entitlement.id}"
                )
                
                # Return properly serialized data
                serializer = FeeEntitlementListSerializer(entitlement)
                return Response(serializer.data, status=status.HTTP_201_CREATED)
                
        except Client.DoesNotExist:
            return Response(
                {'error': 'Client not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        except FeeStructure.DoesNotExist:
            return Response(
                {'error': 'Fee structure not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            logger.error(f"Error enrolling student: {str(e)}", exc_info=True)
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=False, methods=['post'])
    def create_with_invoice(self, request):
        """Create invoice and entitlement together"""
        serializer = CreateInvoiceWithEntitlementSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        try:
            from clients.models import Client
            
            client = Client.objects.get(id=serializer.validated_data['client_id'])
            fee_structure = FeeStructure.objects.get(
                id=serializer.validated_data['fee_structure_id']
            )
            
            # Create invoice and entitlement
            invoice, entitlement = SchoolFeesService.create_student_invoice(
                client=client,
                fee_structure=fee_structure,
                academic_period=serializer.validated_data.get('academic_period', {}),
                payment_term_type=serializer.validated_data['payment_term_type'],
                minimum_deposit_percent=serializer.validated_data.get('minimum_deposit_percent', Decimal('0')),
                installment_config=serializer.validated_data.get('installment_config'),
                owner=request.user,
                branch=request.user.branch,
                created_by=request.user
            )
            
            # Update access rules if provided
            if serializer.validated_data.get('access_rules'):
                entitlement.access_rules.update(serializer.validated_data['access_rules'])
                entitlement.save(update_fields=['access_rules'])
            
            # Link inventory allocation if provided
            if serializer.validated_data.get('inventory_allocation_id'):
                entitlement.inventory_allocation_id = serializer.validated_data['inventory_allocation_id']
                entitlement.save()
            
            return Response({
                'success': True,
                'data': {
                    'invoice_id': invoice.id,
                    'invoice_number': invoice.invoice_number,
                    'entitlement_id': entitlement.id,
                    'total_amount': str(entitlement.total_amount),
                    'minimum_required': str(entitlement.minimum_required),
                    'status': entitlement.status,
                    'access_level': entitlement.current_access_level,
                }
            }, status=status.HTTP_201_CREATED)
            
        except Exception as e:
            logger.error(f"Error creating invoice with entitlement: {str(e)}", exc_info=True)
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def record_payment(self, request, pk=None):
        """Record payment for entitlement"""
        entitlement = self.get_object()
        serializer = RecordPaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        amount = serializer.validated_data['amount']
        payment_date = serializer.validated_data.get('payment_date', timezone.now().date())
        
        try:
            # Get bank account (optional - uses config if not specified)
            bank_account = None
            bank_account_id = serializer.validated_data.get('bank_account_id')
            if bank_account_id:
                from banks.models import BankAccount as BankAccountModel
                try:
                    bank_obj = BankAccountModel.objects.select_related('gl_account').get(id=bank_account_id)
                    if bank_obj.gl_account is None:
                        return Response(
                            {'error': f'Bank account {bank_account_id} has no linked GL account. Please re-save the bank account to auto-create one.'},
                            status=status.HTTP_400_BAD_REQUEST
                        )
                    bank_account = bank_obj.gl_account
                except BankAccountModel.DoesNotExist:
                    return Response(
                        {'error': f'Bank account {bank_account_id} not found'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
            
            # Record payment with accounting entries
            journal_entry = IncomeAccountingService.record_entitlement_payment(
                entitlement=entitlement,
                amount=amount,
                payment_method=serializer.validated_data.get('payment_method', 'cash'),
                bank_account=bank_account,
                user=request.user,
                notes=serializer.validated_data.get('notes', '')
            )
            
            entitlement.record_payment(amount, payment_date)
            
            return Response({
                'success': True,
                'entitlement_id': entitlement.id,
                'amount_paid': str(amount),
                'new_balance': str(entitlement.balance),
                'payment_percentage': str(entitlement.payment_percentage),
                'status': entitlement.status,
                'access_level': entitlement.current_access_level,
                'journal_entry_id': journal_entry.id,
                'reference_number': journal_entry.reference_number
            })
        except Exception as e:
            logger.error(f"Error recording payment: {str(e)}", exc_info=True)
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def consume_units(self, request, pk=None):
        """Consume units from prepaid allocation"""
        entitlement = self.get_object()
        serializer = ConsumeUnitsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        try:
            entitlement.consume_units(
                units=serializer.validated_data['units'],
                service_code=serializer.validated_data.get('service_code')
            )
            
            return Response({
                'success': True,
                'units_consumed': str(serializer.validated_data['units']),
                'remaining_units': str(entitlement.remaining_units),
                'status': entitlement.status
            })
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def check_access(self, request, pk=None):
        """Check if entitlement allows access to a service"""
        entitlement = self.get_object()
        serializer = CheckAccessSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        service_code = serializer.validated_data.get('service_code')
        can_access, reason = entitlement.can_access_service(service_code)
        
        response_data = {
            'can_access': can_access,
            'reason': reason,
            'entitlement_status': entitlement.status,
            'payment_percentage': entitlement.payment_percentage,
            'access_level': entitlement.current_access_level
        }
        
        response_serializer = AccessResponseSerializer(data=response_data)
        response_serializer.is_valid(raise_exception=True)
        
        return Response(response_serializer.data)
    
    @action(detail=True, methods=['post'])
    def redeem_inventory(self, request, pk=None):
        """Redeem inventory items linked to entitlement"""
        entitlement = self.get_object()
        serializer = RedeemInventorySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        try:
            redemption = entitlement.trigger_inventory_redemption(
                items_to_redeem=serializer.validated_data['items'],
                user=request.user
            )
            
            return Response({
                'success': True,
                'redemption_id': redemption.id,
                'redemption_code': redemption.redemption_code,
                'items_redeemed': len(serializer.validated_data['items'])
            })
        except Exception as e:
            logger.error(f"Error redeeming inventory: {str(e)}", exc_info=True)
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def suspend(self, request, pk=None):
        """Suspend entitlement"""
        entitlement = self.get_object()
        reason = request.data.get('reason', 'Payment overdue')
        
        try:
            entitlement.suspend(reason)
            return Response({
                'success': True,
                'status': entitlement.status
            })
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def reactivate(self, request, pk=None):
        """Reactivate suspended entitlement"""
        entitlement = self.get_object()
        
        try:
            entitlement.reactivate()
            return Response({
                'success': True,
                'status': entitlement.status,
                'access_level': entitlement.current_access_level
            })
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=False, methods=['get'])
    def summary(self, request):
        """Get fee summary for a client"""
        client_id = request.query_params.get('client_id')
        if not client_id:
            return Response(
                {'error': 'client_id is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            from clients.models import Client
            client = Client.objects.get(id=client_id)
            
            # Get entitlements
            entitlements = FeeEntitlement.objects.filter(
                client=client,
                owner=request.user,
                branch=request.user.branch
            )
            
            # Calculate totals
            totals = entitlements.aggregate(
                total_fees=Sum('total_amount'),
                total_paid=Sum('amount_paid')
            )
            
            summary_data = {
                'client_id': client.id,
                'client_name': client.full_name,
                'total_fees': totals['total_fees'] or Decimal('0'),
                'total_paid': totals['total_paid'] or Decimal('0'),
                'total_balance': (totals['total_fees'] or Decimal('0')) - (totals['total_paid'] or Decimal('0')),
                'active_entitlements': entitlements.filter(status='active').count(),
                'pending_entitlements': entitlements.filter(status='pending').count(),
                'overdue_invoices': Invoice.objects.filter(
                    client=client,
                    due_date__lt=timezone.now().date(),
                    status__in=['draft', 'sent', 'partial']
                ).count(),
                'entitlements': entitlements[:10]  # Latest 10
            }
            
            serializer = FeeSummarySerializer(data=summary_data)
            serializer.is_valid(raise_exception=True)
            return Response(serializer.data)
            
        except Client.DoesNotExist:
            return Response(
                {'error': 'Client not found'},
                status=status.HTTP_404_NOT_FOUND
            )


class PaymentPlanViewSet(ScopedModelViewSet):
    """ViewSet for payment plans"""
    permission_module = 'incomes'
    permission_page = 'payment-plans'
    queryset = PaymentPlan.objects.all()
    serializer_class = PaymentPlanSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        queryset = super().get_queryset()
        
        # Filter by entitlement
        entitlement_id = self.request.query_params.get('entitlement_id')
        if entitlement_id:
            queryset = queryset.filter(entitlement_id=entitlement_id)
        
        # Filter by status
        status_filter = self.request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        
        return queryset.select_related('entitlement').prefetch_related('installments')
    
    @action(detail=True, methods=['post'])
    def generate_schedule(self, request, pk=None):
        """Generate installment schedule for payment plan"""
        payment_plan = self.get_object()
        
        try:
            payment_plan.generate_schedule()
            return Response({
                'success': True,
                'installments_created': payment_plan.installments.count()
            })
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )


class PaymentPlanInstallmentViewSet(ScopedModelViewSet):
    """ViewSet for payment plan installments"""
    permission_module = 'incomes'
    permission_page = 'payment-plan-installments'
    queryset = PaymentPlanInstallment.objects.all()
    serializer_class = PaymentPlanInstallmentSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        queryset = super().get_queryset()
        
        # Filter by payment plan
        payment_plan_id = self.request.query_params.get('payment_plan_id')
        if payment_plan_id:
            queryset = queryset.filter(payment_plan_id=payment_plan_id)
        
        # Filter by status
        status_filter = self.request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        
        # Filter overdue
        overdue = self.request.query_params.get('overdue')
        if overdue == 'true':
            queryset = queryset.filter(
                due_date__lt=timezone.now().date(),
                status__in=['pending', 'partial']
            )
        
        return queryset.select_related('payment_plan')
    
    @action(detail=True, methods=['post'])
    def record_payment(self, request, pk=None):
        """Record payment for installment"""
        installment = self.get_object()
        serializer = RecordPaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        amount = serializer.validated_data['amount']
        payment_method = serializer.validated_data.get('payment_method', 'cash')
        
        try:
            with transaction.atomic():
                # Resolve bank/cash GL account
                bank_account = None
                bank_account_id = serializer.validated_data.get('bank_account_id')
                if bank_account_id:
                    from banks.models import BankAccount as BankAccountModel
                    try:
                        bank_obj = BankAccountModel.objects.select_related('gl_account').get(id=bank_account_id)
                        if bank_obj.gl_account is None:
                            return Response(
                                {'error': f'Bank account {bank_account_id} has no linked GL account.'},
                                status=status.HTTP_400_BAD_REQUEST
                            )
                        bank_account = bank_obj.gl_account
                    except BankAccountModel.DoesNotExist:
                        return Response(
                            {'error': f'Bank account {bank_account_id} not found'},
                            status=status.HTTP_400_BAD_REQUEST
                        )

                # Create GL journal entry for this installment payment
                entitlement = installment.payment_plan.entitlement
                journal_entry = IncomeAccountingService.record_entitlement_payment(
                    entitlement=entitlement,
                    amount=amount,
                    payment_method=payment_method,
                    bank_account=bank_account,
                    user=request.user,
                    notes=serializer.validated_data.get('notes', '')
                )

                # Update installment and entitlement amounts/status (no GL â€” already done above)
                installment.record_payment(amount)

            return Response({
                'success': True,
                'installment_id': installment.id,
                'amount_paid': str(amount),
                'balance': str(installment.balance),
                'status': installment.status,
                'journal_entry_id': journal_entry.id,
                'journal_entry_reference': journal_entry.workflow_reference,
            })
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )



# -----------------------------------------------------------------------------
# Payment Reversal Request — list view (for Approvals page)
# GET  /incomes/payment-reversal-requests/?status=pending|approved|rejected
# -----------------------------------------------------------------------------
from rest_framework.views import APIView


class PaymentReversalRequestListView(APIView):
    """
    Return all PaymentReversalRequest records visible to the requesting user.

    Query params:
      - status: pending | approved | rejected  (default: pending)
      - invoice_id: filter by invoice

    Used by the front-end Approvals page so approvers can see and act on
    pending payment reversal requests without navigating to individual invoices.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from .models import PaymentReversalRequest
        from django.db.models import Q

        status_filter = request.query_params.get('status', 'pending')

        # Build a tenant/branch-scoped queryset the same way ScopedModelViewSet does
        qs = PaymentReversalRequest.objects.select_related(
            'invoice', 'invoice__client', 'requested_by', 'approved_by', 'draft_journal_entry'
        ).order_by('-created_at')

        user = request.user
        # System admins see everything
        if not getattr(user, 'is_system_admin', False):
            if hasattr(user, 'tenant') and user.tenant:
                qs = qs.filter(tenant=user.tenant)
            elif hasattr(user, 'branch') and user.branch:
                qs = qs.filter(Q(branch=user.branch) | Q(branch__isnull=True))

        if status_filter in ('pending', 'approved', 'rejected'):
            qs = qs.filter(status=status_filter)

        invoice_id = request.query_params.get('invoice_id')
        if invoice_id:
            qs = qs.filter(invoice_id=invoice_id)

        data = []
        for rr in qs:
            data.append({
                'id': rr.id,
                'invoice_id': rr.invoice_id,
                'invoice_number': rr.invoice.invoice_number if rr.invoice else None,
                'client_name': (
                    rr.invoice.client.full_name
                    if rr.invoice and rr.invoice.client_id
                    else None
                ),
                'payment_reference': rr.payment_reference,
                'amount': str(rr.amount),
                'reason': rr.reason,
                'status': rr.status,
                'requested_by': (
                    rr.requested_by.get_full_name() or rr.requested_by.username
                ) if rr.requested_by else None,
                'created_at': rr.created_at,
                'approved_by': (
                    rr.approved_by.get_full_name() or rr.approved_by.username
                ) if rr.approved_by else None,
                'approved_at': rr.approved_at,
                'rejection_reason': rr.rejection_reason,
                'draft_journal_entry_ref': (
                    rr.draft_journal_entry.reference_number
                    if rr.draft_journal_entry else None
                ),
            })

        return Response({'results': data, 'count': len(data)})
