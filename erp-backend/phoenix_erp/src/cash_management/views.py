# cash_management/views.py
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Sum, Q
from .permissions import CanPostTodayPermission
from django.utils import timezone
from django.shortcuts import get_object_or_404
from decimal import Decimal
import logging

from common.views import ScopedModelViewSet

from .models import (
    CashierAccount,
    CashCollection,
    CashTransfer,
    CashReconciliation,
    BankReconciliation,
    PettyCashFund,
    PettyCashVoucher,
    PettyCashReplenishment
)
from .serializers import (
    CashierAccountSerializer,
    CashCollectionSerializer,
    CashReconciliationSerializer,
    FinanceOfficerSignoffSerializer,
    CashTransferSerializer,
    CashTransferActionSerializer,
    BankReconciliationSerializer,
    BankReconciliationActionSerializer,
    DailyCashSummarySerializer
)
from .services.cash_service import (
    CashCollectionService,
    CashTransferService,
    CashReconciliationService,
    CashierAccountService
)

logger = logging.getLogger(__name__)


class CashierAccountViewSet(viewsets.ModelViewSet):
    permission_module = 'cash-management'
    permission_page = 'cashier-accounts'
    queryset = CashierAccount.objects.all()
    serializer_class = CashierAccountSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        queryset = super().get_queryset()
        
        if hasattr(self.request.user, 'branch') and self.request.user.branch:
            queryset = queryset.filter(branch=self.request.user.branch)
        
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() == 'true')
        
        needs_reconciliation = self.request.query_params.get('needs_reconciliation')
        if needs_reconciliation and needs_reconciliation.lower() == 'true':
            today = timezone.now().date()
            queryset = queryset.filter(
                Q(last_reconciled_at__date__lt=today) | Q(last_reconciled_at__isnull=True),
                is_active=True,
                is_suspended=False
            )
        
        return queryset
    
    @action(detail=True, methods=['get'])
    def summary(self, request, pk=None):
        cashier = self.get_object()
        date_str = request.query_params.get('date')
        date = timezone.datetime.strptime(date_str, '%Y-%m-%d').date() if date_str else timezone.now().date()
        
        summary = CashierAccountService.get_cashier_summary(cashier, date)
        return Response(summary)
    
    @action(detail=False, methods=['get'])
    def pending_reconciliations(self, request):
        date_str = request.query_params.get('date')
        date = timezone.datetime.strptime(date_str, '%Y-%m-%d').date() if date_str else timezone.now().date()
        
        branch = request.user.branch if hasattr(request.user, 'branch') else None
        pending = CashReconciliationService.get_pending_reconciliations(branch, date)
        
        serializer = self.get_serializer(pending, many=True)
        return Response(serializer.data)


class CashCollectionViewSet(ScopedModelViewSet):
    permission_module = 'cash-management'
    permission_page = 'cash-collections'
    queryset = CashCollection.objects.all()
    serializer_class = CashCollectionSerializer
    permission_classes = [permissions.IsAuthenticated]
    officer_client_lookup = 'client__assigned_officer'
    
    def get_queryset(self):
        queryset = super().get_queryset()
        
        cashier_id = self.request.query_params.get('cashier_account')
        if cashier_id:
            queryset = queryset.filter(cashier_account_id=cashier_id)
        
        date_str = self.request.query_params.get('date')
        if date_str:
            date = timezone.datetime.strptime(date_str, '%Y-%m-%d').date()
            queryset = queryset.filter(collection_date=date)
        
        client_id = self.request.query_params.get('client')
        if client_id:
            queryset = queryset.filter(client_id=client_id)
        
        is_posted = self.request.query_params.get('is_posted')
        if is_posted is not None:
            queryset = queryset.filter(is_posted=is_posted.lower() == 'true')
        
        return queryset.order_by('-collection_date', '-created_at')
    
    def perform_create(self, serializer):
        cashier_account = serializer.validated_data['cashier_account']
        client = serializer.validated_data['client']
        amount_due = serializer.validated_data['amount_due']
        amount_collected = serializer.validated_data['amount_collected']
        payment_purpose = serializer.validated_data['payment_purpose']
        
        collection = CashCollectionService.record_collection(
            cashier_account=cashier_account,
            client=client,
            amount_due=amount_due,
            amount_collected=amount_collected,
            payment_purpose=payment_purpose,
            user=self.request.user,
            collection_date=serializer.validated_data.get('collection_date'),
            notes=serializer.validated_data.get('notes', ''),
            collection_mode=serializer.validated_data.get('collection_mode', 'cash'),
            credit_account=serializer.validated_data.get('credit_account')
        )
        
        return collection
    
    @action(detail=True, methods=['post'])
    def post_to_gl(self, request, pk=None):
        collection = self.get_object()
        
        if collection.is_posted:
            return Response(
                {'error': 'Collection already posted'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            credit_account_id = request.data.get('credit_account')
            if not credit_account_id:
                return Response(
                    {'error': 'credit_account is required'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            from accounts.models import Account
            credit_account = Account.objects.get(id=credit_account_id)
            
            journal = CashCollectionService._post_collection(collection, credit_account, request.user)
            
            return Response({
                'message': 'Collection posted successfully',
                'journal_entry_id': journal.id,
                'receipt_number': collection.receipt_number
            })
        except Exception as e:
            logger.error(f"Error posting collection {collection.receipt_number}: {e}")
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=True, methods=['get'], url_path='deposit-slip')
    def deposit_slip(self, request, pk=None):
        """Generate and return a deposit slip PDF for this cash collection."""
        collection = self.get_object()
        download = request.query_params.get('download', 'false').lower() == 'true'

        try:
            from reports.pdf_generators import DepositSlipPDFGenerator
            generator = DepositSlipPDFGenerator(collection, request.user)
            return generator.as_response(download=download)
        except Exception as e:
            logger.error(f"Error generating deposit slip for {collection.receipt_number}: {e}")
            return Response(
                {'error': f'Failed to generate deposit slip: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class CashReconciliationViewSet(viewsets.ModelViewSet):
    permission_module = 'cash-management'
    permission_page = 'cash-reconciliation'
    queryset = CashReconciliation.objects.all()
    serializer_class = CashReconciliationSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        queryset = super().get_queryset()
        
        cashier_id = self.request.query_params.get('cashier_account')
        if cashier_id:
            queryset = queryset.filter(cashier_account_id=cashier_id)
        
        # Support both 'date' and date range filters
        date_str = self.request.query_params.get('date')
        if date_str:
            date = timezone.datetime.strptime(date_str, '%Y-%m-%d').date()
            queryset = queryset.filter(reconciliation_date=date)
        
        date_from = self.request.query_params.get('reconciliation_date_from')
        if date_from:
            date = timezone.datetime.strptime(date_from, '%Y-%m-%d').date()
            queryset = queryset.filter(reconciliation_date__gte=date)
        
        date_to = self.request.query_params.get('reconciliation_date_to')
        if date_to:
            date = timezone.datetime.strptime(date_to, '%Y-%m-%d').date()
            queryset = queryset.filter(reconciliation_date__lte=date)
        
        status_filter = self.request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        
        # Support both parameter names for finance signoff filter
        needs_signoff = self.request.query_params.get('needs_finance_signoff') or self.request.query_params.get('pending_signoff')
        if needs_signoff and needs_signoff.lower() == 'true':
            queryset = queryset.filter(
                reconciled_by__isnull=False,
                finance_officer_signoff__isnull=True
            )
        
        return queryset.order_by('-reconciliation_date', '-created_at')
    
    def perform_create(self, serializer):
        cashier_account = serializer.validated_data['cashier_account']
        physical_count = serializer.validated_data['physical_count']
        
        reconciliation = CashReconciliationService.perform_reconciliation(
            cashier_account=cashier_account,
            physical_count=physical_count,
            user=self.request.user,
            reconciliation_date=serializer.validated_data.get('reconciliation_date'),
            denomination_details=serializer.validated_data.get('denomination_details'),
            notes=serializer.validated_data.get('notes', '')
        )
        
        return reconciliation
    
    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def finance_officer_signoff(self, request, pk=None):
        reconciliation = self.get_object()
        
        if reconciliation.finance_officer_signoff:
            return Response(
                {'error': 'Reconciliation already signed off'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if not reconciliation.reconciled_by:
            return Response(
                {'error': 'Reconciliation not yet performed by cashier'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        serializer = FinanceOfficerSignoffSerializer(
            reconciliation,
            data=request.data,
            context={'request': request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        
        result_serializer = CashReconciliationSerializer(reconciliation)
        return Response(result_serializer.data)


class CashTransferViewSet(viewsets.ModelViewSet):
    permission_module = 'cash-management'
    permission_page = 'cash-transfers'
    queryset = CashTransfer.objects.all()
    serializer_class = CashTransferSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        queryset = super().get_queryset()
        
        cashier_id = self.request.query_params.get('cashier_account')
        if cashier_id:
            queryset = queryset.filter(cashier_account_id=cashier_id)
        
        status_filter = self.request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        
        date_str = self.request.query_params.get('date')
        if date_str:
            date = timezone.datetime.strptime(date_str, '%Y-%m-%d').date()
            queryset = queryset.filter(transfer_date=date)
        
        pending_approval = self.request.query_params.get('pending_approval')
        if pending_approval and pending_approval.lower() == 'true':
            queryset = queryset.filter(status='pending')
        
        return queryset.order_by('-transfer_date', '-created_at')
    
    def perform_create(self, serializer):
        transfer = CashTransferService.initiate_transfer(
            cashier_account=serializer.validated_data['cashier_account'],
            destination_account=serializer.validated_data['destination_account'],
            amount=serializer.validated_data['amount'],
            user=self.request.user,
            transfer_date=serializer.validated_data.get('transfer_date'),
            bank_deposit_slip=serializer.validated_data.get('bank_deposit_slip', ''),
            notes=serializer.validated_data.get('notes', '')
        )
        
        return transfer
    
    @action(detail=True, methods=['post'])
    def execute_action(self, request, pk=None):
        transfer = self.get_object()
        
        serializer = CashTransferActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        action_type = serializer.validated_data['action']
        notes = serializer.validated_data.get('notes', '')
        
        try:
            if action_type == 'submit':
                transfer.submit(request.user)
                message = 'Transfer submitted for approval'
            
            elif action_type == 'approve':
                result = transfer.approve(request.user, notes)
                if result == 'first_approval':
                    message = 'First approval recorded, awaiting second approval'
                elif result == 'second_approval_posted':
                    message = 'Second approval recorded and transfer posted to GL'
                else:
                    message = 'Transfer approved and posted to GL'
            
            elif action_type == 'reject':
                transfer.reject(request.user, notes)
                message = 'Transfer rejected'
            
            else:
                return Response(
                    {'error': 'Invalid action'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            result_serializer = CashTransferSerializer(transfer)
            return Response({
                'message': message,
                'transfer': result_serializer.data
            })
        
        except Exception as e:
            logger.error(f"Error executing transfer action: {e}")
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )


class BankReconciliationViewSet(ScopedModelViewSet):
    permission_module = 'cash-management'
    permission_page = 'bank-reconciliation'
    queryset = BankReconciliation.objects.all()
    serializer_class = BankReconciliationSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        queryset = super().get_queryset()
        
        bank_account_id = self.request.query_params.get('bank_account')
        if bank_account_id:
            queryset = queryset.filter(bank_account_id=bank_account_id)
        
        period_end = self.request.query_params.get('period_end')
        if period_end:
            date = timezone.datetime.strptime(period_end, '%Y-%m-%d').date()
            queryset = queryset.filter(reconciliation_period_end=date)
        
        status_filter = self.request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        
        pending_approval = self.request.query_params.get('pending_approval')
        if pending_approval and pending_approval.lower() == 'true':
            queryset = queryset.filter(status__in=['balanced', 'variance_pending'], approved_by__isnull=True)
        
        return queryset.order_by('-reconciliation_period_end', '-reconciliation_date')
    
    def perform_create(self, serializer):
        user, branch, tenant = self._resolve_create_scope()
        serializer.save(prepared_by=user, owner=user, branch=branch, tenant=tenant)
    
    @action(detail=True, methods=['post'])
    def submit_for_review(self, request, pk=None):
        """Transition a draft reconciliation to in_review status."""
        reconciliation = self.get_object()
        if reconciliation.status != 'draft':
            return Response(
                {'error': f'Cannot submit reconciliation with status "{reconciliation.status}". Only draft reconciliations can be submitted.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        reconciliation.status = 'in_review'
        reconciliation.save(update_fields=['status', 'updated_at'])
        result_serializer = BankReconciliationSerializer(reconciliation)
        return Response({
            'message': 'Reconciliation submitted for review',
            'reconciliation': result_serializer.data
        })
    
    @action(detail=True, methods=['post'])
    def execute_action(self, request, pk=None):
        reconciliation = self.get_object()
        
        serializer = BankReconciliationActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        action_type = serializer.validated_data['action']
        notes = serializer.validated_data.get('notes', '')
        
        try:
            if action_type == 'approve':
                reconciliation.approve(request.user, notes)
                message = 'Bank reconciliation approved'
            
            elif action_type == 'reject':
                reconciliation.reject(request.user, notes)
                message = 'Bank reconciliation rejected'
            
            else:
                return Response(
                    {'error': 'Invalid action'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            result_serializer = BankReconciliationSerializer(reconciliation)
            return Response({
                'message': message,
                'reconciliation': result_serializer.data
            })
        
        except Exception as e:
            logger.error(f"Error executing reconciliation action: {e}")
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=False, methods=['get'])
    def daily_summary(self, request):
        date_str = request.query_params.get('date')
        date = timezone.datetime.strptime(date_str, '%Y-%m-%d').date() if date_str else timezone.now().date()
        
        branch = request.user.branch if hasattr(request.user, 'branch') else None
        
        collections = CashCollection.objects.filter(
            collection_date=date,
            is_posted=True
        )
        if branch:
            collections = collections.filter(branch=branch)
        
        total_collections = collections.aggregate(Sum('amount_collected'))['amount_collected__sum'] or Decimal('0.00')
        collection_count = collections.count()
        
        deposits = CashTransfer.objects.filter(
            transfer_date=date,
            status='posted'
        )
        if branch:
            deposits = deposits.filter(branch=branch)
        
        total_deposits = deposits.aggregate(Sum('amount'))['amount__sum'] or Decimal('0.00')
        deposit_count = deposits.count()
        
        reconciliations = CashReconciliation.objects.filter(
            reconciliation_date=date
        )
        if branch:
            reconciliations = reconciliations.filter(branch=branch)
        
        pending_reconciliations = reconciliations.filter(reconciled_by__isnull=True).count()
        completed_reconciliations = reconciliations.filter(reconciled_by__isnull=False).count()
        
        cashiers_needing = CashReconciliationService.get_pending_reconciliations(branch, date)
        cashiers_need_reconciliation = [c.name for c in cashiers_needing]
        
        unsigned_reconciliations = reconciliations.filter(
            reconciled_by__isnull=False,
            finance_officer_signoff__isnull=True
        )
        cashiers_without_signoff = [r.cashier_account.name for r in unsigned_reconciliations]
        
        all_reconciled = pending_reconciliations == 0
        all_signed_off = len(cashiers_without_signoff) == 0
        all_deposited = total_collections <= total_deposits
        
        compliance_items = [all_reconciled, all_signed_off, all_deposited]
        compliance_percentage = int((sum(compliance_items) / len(compliance_items)) * 100)
        
        summary_data = {
            'date': date,
            'total_collections': total_collections,
            'collection_count': collection_count,
            'total_deposits': total_deposits,
            'deposit_count': deposit_count,
            'pending_reconciliations': pending_reconciliations,
            'completed_reconciliations': completed_reconciliations,
            'cashiers_need_reconciliation': cashiers_need_reconciliation,
            'cashiers_without_signoff': cashiers_without_signoff,
            'all_reconciled': all_reconciled,
            'all_signed_off': all_signed_off,
            'all_deposited': all_deposited,
            'compliance_percentage': compliance_percentage
        }
        
        serializer = DailyCashSummarySerializer(summary_data)
        return Response(serializer.data)


class SummaryViewSet(viewsets.ViewSet):
    """Provides dashboard and cashier summary endpoints for the frontend."""
    permission_module = 'cash-management'
    permission_page = 'summary'
    permission_classes = [permissions.IsAuthenticated]

    @action(detail=False, methods=['get'])
    def dashboard(self, request):
        # Delegate to daily summary logic similar to BankReconciliationViewSet.daily_summary
        date_str = request.query_params.get('date')
        date = timezone.datetime.strptime(date_str, '%Y-%m-%d').date() if date_str else timezone.now().date()

        branch = request.user.branch if hasattr(request.user, 'branch') else None

        collections = CashCollection.objects.filter(
            collection_date=date,
            is_posted=True
        )
        if branch:
            collections = collections.filter(branch=branch)

        total_collections = collections.aggregate(Sum('amount_collected'))['amount_collected__sum'] or Decimal('0.00')
        collection_count = collections.count()

        deposits = CashTransfer.objects.filter(
            transfer_date=date,
            status='posted'
        )
        if branch:
            deposits = deposits.filter(branch=branch)

        total_deposits = deposits.aggregate(Sum('amount'))['amount__sum'] or Decimal('0.00')
        deposit_count = deposits.count()

        reconciliations = CashReconciliation.objects.filter(
            reconciliation_date=date
        )
        if branch:
            reconciliations = reconciliations.filter(branch=branch)

        pending_reconciliations = reconciliations.filter(reconciled_by__isnull=True).count()
        completed_reconciliations = reconciliations.filter(reconciled_by__isnull=False).count()

        cashiers_needing = CashReconciliationService.get_pending_reconciliations(branch, date)
        cashiers_need_reconciliation = [c.name for c in cashiers_needing]

        unsigned_reconciliations = reconciliations.filter(
            reconciled_by__isnull=False,
            finance_officer_signoff__isnull=True
        )
        cashiers_without_signoff = [r.cashier_account.name for r in unsigned_reconciliations]

        all_reconciled = pending_reconciliations == 0
        all_signed_off = len(cashiers_without_signoff) == 0
        all_deposited = total_collections <= total_deposits

        compliance_items = [all_reconciled, all_signed_off, all_deposited]
        compliance_percentage = int((sum(compliance_items) / len(compliance_items)) * 100)

        summary_data = {
            'date': date,
            'total_collections': total_collections,
            'collection_count': collection_count,
            'total_deposits': total_deposits,
            'deposit_count': deposit_count,
            'pending_reconciliations': pending_reconciliations,
            'completed_reconciliations': completed_reconciliations,
            'cashiers_need_reconciliation': cashiers_need_reconciliation,
            'cashiers_without_signoff': cashiers_without_signoff,
            'all_reconciled': all_reconciled,
            'all_signed_off': all_signed_off,
            'all_deposited': all_deposited,
            'compliance_percentage': compliance_percentage
        }

        serializer = DailyCashSummarySerializer(summary_data)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def cashiers(self, request):
        # Return a brief summary for each cashier account
        branch = request.user.branch if hasattr(request.user, 'branch') else None
        qs = CashierAccount.objects.filter(is_active=True, is_suspended=False)
        if branch:
            qs = qs.filter(branch=branch)

        data = []
        today = timezone.now().date()
        for c in qs:
            needs_recon = c.last_reconciled_at is None or c.last_reconciled_at.date() < today
            data.append({
                'id': c.id,
                'name': c.name,
                'account_number': c.account_number,
                'current_balance': c.current_balance,
                'needs_reconciliation': needs_recon,
            })

        return Response(data)


# ============================================
# PETTY CASH VIEWSETS
# ============================================

class PettyCashFundViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing Petty Cash Funds
    
    Endpoints:
    - GET /api/cash-management/petty-cash-funds/ - List all funds
    - POST /api/cash-management/petty-cash-funds/ - Create new fund
    - GET /api/cash-management/petty-cash-funds/{id}/ - Get fund details
    - PUT/PATCH /api/cash-management/petty-cash-funds/{id}/ - Update fund
    - DELETE /api/cash-management/petty-cash-funds/{id}/ - Delete fund
    - POST /api/cash-management/petty-cash-funds/{id}/setup/ - Setup fund (create GL entry)
    - GET /api/cash-management/petty-cash-funds/{id}/summary/ - Get fund summary
    """
    permission_module = 'cash-management'
    permission_page = 'petty-cash-funds'
    from .models import PettyCashFund
    from .serializers import PettyCashFundSerializer
    
    queryset = PettyCashFund.objects.all()
    serializer_class = PettyCashFundSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        queryset = super().get_queryset()
        
        # Filter by branch
        if hasattr(self.request.user, 'branch') and self.request.user.branch:
            queryset = queryset.filter(branch=self.request.user.branch)
        
        # Filter by status
        status = self.request.query_params.get('status')
        if status:
            queryset = queryset.filter(status=status)
        
        # Filter by custodian
        custodian_id = self.request.query_params.get('custodian')
        if custodian_id:
            queryset = queryset.filter(custodian_id=custodian_id)
        
        # Filter funds needing replenishment
        needs_replenishment = self.request.query_params.get('needs_replenishment')
        if needs_replenishment and needs_replenishment.lower() == 'true':
            queryset = [f for f in queryset if f.needs_replenishment]
        
        return queryset
    
    @action(detail=False, methods=['get'], url_path='default')
    def get_default_fund(self, request):
        """
        Get (or auto-create) the single petty cash fund for this branch.

        Looks for the petty cash GL account (code 1102 or name containing
        "Petty Cash") and returns the fund linked to it.  If no fund exists
        yet it creates one automatically so that users never have to manually
        create a fund.

        Returns 404 only when the chart of accounts has not been set up yet.
        """
        from accounts.models import Account
        from django.db import IntegrityError
        from django.db.models import QuerySet as DjQuerySet

        branch = getattr(request.user, 'branch', None)
        tenant = getattr(request.user, 'tenant', None)

        def _raw_fund_qs():
            """Bypass OwnerBranchManager tenant-filter to find funds with tenant=NULL."""
            qs = DjQuerySet(model=PettyCashFund).filter(is_deleted=False)
            if branch:
                qs = qs.filter(branch=branch)
            return qs

        def _backfill_tenant(f):
            """If a fund was created without tenant, stamp it now so future lookups work."""
            if tenant and not f.tenant_id:
                f.tenant = tenant
                f.save(update_fields=['tenant'])

        # â”€â”€ 1. Look for an existing active fund (tenant-scoped) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        qs = PettyCashFund.objects.all()
        if branch:
            qs = qs.filter(branch=branch)
        fund = qs.filter(status='active').first() or qs.first()

        # â”€â”€ 1b. Fallback: fund may exist with tenant=NULL (created before tenant
        #        was propagated). Use a plain QuerySet that bypasses the manager.
        if fund is None:
            fund = _raw_fund_qs().filter(status='active').first() or _raw_fund_qs().first()
            if fund:
                _backfill_tenant(fund)

        if fund:
            serializer = self.get_serializer(fund)
            return Response(serializer.data)

        # â”€â”€ 2. No fund yet â€“ find the petty cash GL account â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        acct_qs = Account.objects.filter(account_type='ASSET')
        if branch:
            acct_qs = acct_qs.filter(branch=branch)

        petty_cash_account = (
            acct_qs.filter(code='1102').first()
            or acct_qs.filter(code__startswith='1102').first()
            or acct_qs.filter(name__icontains='petty cash').first()
            or acct_qs.filter(code='1001').first()                     # KTIL microfinance: Cash In Hand
            or acct_qs.filter(name__icontains='cash in hand').first()  # KTIL name fallback
        )

        if not petty_cash_account:
            return Response(
                {
                    'detail': (
                        'No cash GL account found for petty cash (tried code 1102, 1001 and '
                        'names "Petty Cash" / "Cash In Hand"). Please set up the chart of '
                        'accounts first.'
                    )
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        # â”€â”€ 3. Auto-create the single fund â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        create_kwargs = dict(
            fund_name=petty_cash_account.name or 'Petty Cash Fund',
            fund_code='PC-001',
            custodian=request.user,
            petty_cash_account=petty_cash_account,
            float_amount=Decimal('50000.00'),
            replenishment_threshold=Decimal('10000.00'),
            single_transaction_limit=Decimal('5000.00'),
            status='active',
            established_by=request.user,
            owner=request.user,
            tenant=tenant,
        )
        if branch:
            create_kwargs['branch'] = branch

        try:
            fund = PettyCashFund.objects.create(**create_kwargs)
        except IntegrityError:
            # fund_code='PC-001' already exists but wasn't visible through the
            # tenant-scoped manager (e.g. tenant=NULL on existing record).
            fund = _raw_fund_qs().filter(status='active').first() or _raw_fund_qs().first()
            if fund is None:
                # Last resort: any PC-001 in DB regardless of branch
                fund = DjQuerySet(model=PettyCashFund).filter(
                    is_deleted=False, fund_code='PC-001'
                ).first()
            if fund is None:
                return Response(
                    {'detail': 'Petty cash fund conflict â€” please contact support.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            _backfill_tenant(fund)
        except Exception as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        serializer = self.get_serializer(fund)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def setup(self, request, pk=None):
        """
        Setup fund by creating initial GL entry
        Dr. Petty Cash Account (ASSET)
        Cr. Cash/Bank Account (ASSET)
        """
        from django.db import transaction as db_transaction
        from transactions.models import Transaction, TransactionEntry, TransactionSeries
        
        fund = self.get_object()
        
        if fund.setup_journal_entry:
            return Response(
                {'error': 'Fund already setup'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        source_account_id = request.data.get('source_account')
        if not source_account_id:
            return Response(
                {'error': 'source_account is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        from accounts.models import Account
        try:
            source_account = Account.objects.get(id=source_account_id)
        except Account.DoesNotExist:
            return Response(
                {'error': 'Source account not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        if source_account.account_type != 'ASSET':
            return Response(
                {'error': 'Source account must be an ASSET account (Cash/Bank)'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        with db_transaction.atomic():
            # Create journal entry
            series, _ = TransactionSeries.objects.get_or_create(
                code='PCSET',
                defaults={'description': 'Petty Cash Fund Setup'}
            )
            
            journal_entry = Transaction.objects.create(
                series=series,
                date=fund.established_date,
                description=f"Setup petty cash fund - {fund.fund_name}",
                workflow_reference=fund.fund_code,
                owner=fund.owner,
                branch=fund.branch,
                created_by=request.user
            )
            
            # Debit: Petty Cash Account
            TransactionEntry.objects.create(
                transaction=journal_entry,
                account=fund.petty_cash_account,
                side=TransactionEntry.DEBIT,
                amount=fund.float_amount,
                description=f"Initial float for {fund.fund_name}"
            )
            
            # Credit: Source Account (Cash/Bank)
            TransactionEntry.objects.create(
                transaction=journal_entry,
                account=source_account,
                side=TransactionEntry.CREDIT,
                amount=fund.float_amount,
                description=f"Fund {fund.fund_name} established"
            )
            
            # Update fund
            fund.setup_journal_entry = journal_entry
            fund.current_balance = fund.float_amount
            fund.save(update_fields=['setup_journal_entry', 'current_balance'])
        
        serializer = self.get_serializer(fund)
        return Response(serializer.data, status=status.HTTP_200_OK)
    
    @action(detail=True, methods=['get'])
    def summary(self, request, pk=None):
        """Get fund summary with statistics"""
        fund = self.get_object()
        
        from .models import PettyCashVoucher
        
        summary = {
            'fund': self.get_serializer(fund).data,
            'statistics': {
                'total_vouchers': fund.vouchers.count(),
                'pending_vouchers': fund.vouchers.filter(status='pending').count(),
                'approved_vouchers': fund.vouchers.filter(status='approved').count(),
                'disbursed_vouchers': fund.vouchers.filter(status='disbursed').count(),
                'retired_vouchers': fund.vouchers.filter(status='retired').count(),
                'total_disbursed': fund.disbursed_amount,
                'needs_replenishment': fund.needs_replenishment,
            }
        }
        
        return Response(summary)


class PettyCashVoucherViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing Petty Cash Vouchers (PCVs)
    
    Workflow endpoints:
    - POST /api/cash-management/petty-cash-vouchers/ - Create voucher (draft)
    - POST /api/cash-management/petty-cash-vouchers/{id}/submit/ - Submit for approval
    - POST /api/cash-management/petty-cash-vouchers/{id}/approve/ - Approve voucher
    - POST /api/cash-management/petty-cash-vouchers/{id}/reject/ - Reject voucher
    - POST /api/cash-management/petty-cash-vouchers/{id}/disburse/ - Disburse cash (collection)
    - POST /api/cash-management/petty-cash-vouchers/{id}/retire/ - Retire with receipt
    """
    permission_module = 'cash-management'
    permission_page = 'petty-cash-vouchers'
    from .models import PettyCashVoucher
    from .serializers import PettyCashVoucherSerializer, PettyCashVoucherActionSerializer
    
    queryset = PettyCashVoucher.objects.all()
    serializer_class = PettyCashVoucherSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        queryset = super().get_queryset()
        
        # Filter by branch
        if hasattr(self.request.user, 'branch') and self.request.user.branch:
            queryset = queryset.filter(branch=self.request.user.branch)
        
        # Filter by fund
        fund_id = self.request.query_params.get('fund')
        if fund_id:
            queryset = queryset.filter(fund_id=fund_id)
        
        # Filter by status
        status_param = self.request.query_params.get('status')
        if status_param:
            queryset = queryset.filter(status=status_param)
        
        # Filter by requestor
        requested_by_id = self.request.query_params.get('requested_by')
        if requested_by_id:
            queryset = queryset.filter(requested_by_id=requested_by_id)
        
        # Filter pending approval
        pending_approval = self.request.query_params.get('pending_approval')
        if pending_approval and pending_approval.lower() == 'true':
            queryset = queryset.filter(status='pending')
        
        # Filter awaiting disbursement
        awaiting_disbursement = self.request.query_params.get('awaiting_disbursement')
        if awaiting_disbursement and awaiting_disbursement.lower() == 'true':
            queryset = queryset.filter(status='approved')
        
        # Filter awaiting retirement (receipt submission)
        awaiting_retirement = self.request.query_params.get('awaiting_retirement')
        if awaiting_retirement and awaiting_retirement.lower() == 'true':
            queryset = queryset.filter(status='disbursed', receipt_submitted=False)
        
        return queryset
    
    def perform_create(self, serializer):
        """Auto-generate voucher number, auto-provision fund if needed."""
        from .models import PettyCashFund
        from accounts.models import Account
        from decimal import Decimal as _Decimal

        fund = serializer.validated_data.get('fund')

        # â”€â”€ Auto-provision the default fund when none is provided â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if fund is None:
            from django.db import IntegrityError as _IntegrityError
            from django.db.models import QuerySet as _DjQS

            branch = getattr(self.request.user, 'branch', None)
            tenant = getattr(self.request.user, 'tenant', None)

            def _raw_qs():
                qs = _DjQS(model=PettyCashFund).filter(is_deleted=False)
                if branch:
                    qs = qs.filter(branch=branch)
                return qs

            # Manager-scoped lookup first
            qs = PettyCashFund.objects.all()
            if branch:
                qs = qs.filter(branch=branch)
            fund = qs.filter(status='active').first() or qs.first()

            # Fallback: fund may exist with tenant=NULL
            if fund is None:
                fund = _raw_qs().filter(status='active').first() or _raw_qs().first()
                if fund and tenant and not fund.tenant_id:
                    fund.tenant = tenant
                    fund.save(update_fields=['tenant'])

            if fund is None:
                # No fund at all â€” try to auto-create one from GL account 1102
                acct_qs = Account.objects.filter(account_type='ASSET')
                if branch:
                    acct_qs = acct_qs.filter(branch=branch)
                petty_cash_account = (
                    acct_qs.filter(code='1102').first()
                    or acct_qs.filter(code__startswith='1102').first()
                    or acct_qs.filter(name__icontains='petty cash').first()
                    or acct_qs.filter(code='1001').first()                     # KTIL microfinance: Cash In Hand
                    or acct_qs.filter(name__icontains='cash in hand').first()  # KTIL name fallback
                )
                if petty_cash_account is None:
                    from rest_framework.exceptions import ValidationError as DRFValidationError
                    raise DRFValidationError(
                        "No petty cash fund exists and no cash GL account was found "
                        "(tried code 1102, 1001 and names 'Petty Cash' / 'Cash In Hand'). "
                        "Please set up a petty cash fund first."
                    )
                create_kwargs = dict(
                    fund_name=petty_cash_account.name or 'Petty Cash Fund',
                    fund_code='PC-001',
                    custodian=self.request.user,
                    petty_cash_account=petty_cash_account,
                    float_amount=_Decimal('50000.00'),
                    replenishment_threshold=_Decimal('10000.00'),
                    single_transaction_limit=_Decimal('5000.00'),
                    status='active',
                    established_by=self.request.user,
                    owner=self.request.user,
                    tenant=tenant,
                )
                if branch:
                    create_kwargs['branch'] = branch
                try:
                    fund = PettyCashFund.objects.create(**create_kwargs)
                except _IntegrityError:
                    # Race condition â€” fund was just created by another request
                    fund = _raw_qs().filter(status='active').first() or _raw_qs().first()
                    if fund is None:
                        fund = _DjQS(model=PettyCashFund).filter(
                            is_deleted=False, fund_code='PC-001'
                        ).first()
                    if fund is None:
                        from rest_framework.exceptions import ValidationError as DRFValidationError
                        raise DRFValidationError('Petty cash fund conflict â€” please contact support.')

        # â”€â”€ Generate voucher number: PCV-{YEAR}-{SEQUENTIAL} â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        # NOTE: Query globally (not just fund.vouchers) because voucher_number
        # has a global unique constraint.  Wrap in atomic + select_for_update
        # to prevent duplicate numbers under concurrent requests.
        import datetime
        from django.db import transaction as _db_transaction

        year = datetime.datetime.now().year
        year_prefix = f'PCV-{year}'

        with _db_transaction.atomic():
            # Lock all rows for this year so concurrent requests are serialised.
            last_voucher = (
                PettyCashVoucher.objects
                .filter(voucher_number__startswith=year_prefix)
                .select_for_update()
                .order_by('-voucher_number')
                .first()
            )

            if last_voucher:
                try:
                    last_num = int(last_voucher.voucher_number.split('-')[-1])
                except (ValueError, IndexError):
                    last_num = 0
                new_num = last_num + 1
            else:
                new_num = 1

            voucher_number = f'{year_prefix}-{new_num:04d}'

            serializer.save(
                fund=fund,
                voucher_number=voucher_number,
                requested_by=self.request.user,
                owner=self.request.user,
                branch=getattr(self.request.user, 'branch', None),
            )
    
    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        """Submit voucher for approval"""
        voucher = self.get_object()
        
        try:
            voucher.submit()
            serializer = self.get_serializer(voucher)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve voucher"""
        from .serializers import PettyCashVoucherActionSerializer
        
        voucher = self.get_object()
        action_serializer = PettyCashVoucherActionSerializer(data=request.data)
        action_serializer.is_valid(raise_exception=True)
        
        try:
            voucher.approve(
                user=request.user,
                notes=action_serializer.validated_data.get('notes', '')
            )
            serializer = self.get_serializer(voucher)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """Reject voucher"""
        from .serializers import PettyCashVoucherActionSerializer
        
        voucher = self.get_object()
        action_serializer = PettyCashVoucherActionSerializer(data=request.data)
        action_serializer.is_valid(raise_exception=True)
        
        reason = action_serializer.validated_data.get('reason', '')
        if not reason:
            return Response(
                {'error': 'Rejection reason is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            voucher.reject(user=request.user, reason=reason)
            serializer = self.get_serializer(voucher)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def disburse(self, request, pk=None):
        """Disburse cash (custodian gives cash to payee)"""
        from .serializers import PettyCashVoucherActionSerializer
        
        voucher = self.get_object()
        action_serializer = PettyCashVoucherActionSerializer(data=request.data)
        action_serializer.is_valid(raise_exception=True)
        
        try:
            voucher.disburse(
                user=request.user,
                amount=action_serializer.validated_data.get('amount')
            )
            serializer = self.get_serializer(voucher)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def retire(self, request, pk=None):
        """Retire voucher by submitting receipt"""
        from .serializers import PettyCashVoucherActionSerializer
        
        voucher = self.get_object()
        action_serializer = PettyCashVoucherActionSerializer(data=request.data)
        action_serializer.is_valid(raise_exception=True)
        
        receipt_amount = action_serializer.validated_data.get('receipt_amount')
        receipt_date = action_serializer.validated_data.get('receipt_date')
        receipt_reference = action_serializer.validated_data.get('receipt_reference', '')
        variance_explanation = action_serializer.validated_data.get('variance_explanation', '')
        
        if not receipt_amount or not receipt_date:
            return Response(
                {'error': 'receipt_amount and receipt_date are required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            voucher.retire(
                user=request.user,
                receipt_amount=receipt_amount,
                receipt_date=receipt_date,
                receipt_reference=receipt_reference,
                variance_explanation=variance_explanation
            )
            serializer = self.get_serializer(voucher)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def upload_receipt(self, request, pk=None):
        """Upload a receipt file for the voucher"""
        from .models import PettyCashReceipt
        from .serializers import PettyCashReceiptSerializer
        
        voucher = self.get_object()
        
        # Check if file is provided
        if 'file' not in request.FILES:
            return Response(
                {'error': 'No file provided'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Create receipt
        receipt_data = {
            'voucher': voucher.id,
            'file': request.FILES['file'],
            'description': request.data.get('description', '')
        }
        
        serializer = PettyCashReceiptSerializer(data=receipt_data, context={'request': request})
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['get'])
    def receipts(self, request, pk=None):
        """Get all receipts for this voucher"""
        from .models import PettyCashReceipt
        from .serializers import PettyCashReceiptSerializer
        
        voucher = self.get_object()
        receipts = PettyCashReceipt.objects.filter(voucher=voucher)
        serializer = PettyCashReceiptSerializer(receipts, many=True, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)
    
    @action(detail=True, methods=['delete'], url_path='receipts/(?P<receipt_id>[^/.]+)')
    def delete_receipt(self, request, pk=None, receipt_id=None):
        """Delete a specific receipt"""
        from .models import PettyCashReceipt
        
        voucher = self.get_object()
        
        try:
            receipt = PettyCashReceipt.objects.get(id=receipt_id, voucher=voucher)
            receipt.delete()
            return Response(
                {'message': 'Receipt deleted successfully'},
                status=status.HTTP_204_NO_CONTENT
            )
        except PettyCashReceipt.DoesNotExist:
            return Response(
                {'error': 'Receipt not found'},
                status=status.HTTP_404_NOT_FOUND
            )


class PettyCashReplenishmentViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing Petty Cash Replenishments
    
    Workflow endpoints:
    - POST /api/cash-management/petty-cash-replenishments/ - Create replenishment
    - POST /api/cash-management/petty-cash-replenishments/{id}/submit/ - Submit for review
    - POST /api/cash-management/petty-cash-replenishments/{id}/verify/ - Finance verification
    - POST /api/cash-management/petty-cash-replenishments/{id}/approve/ - Approve
    - POST /api/cash-management/petty-cash-replenishments/{id}/reject/ - Reject
    - POST /api/cash-management/petty-cash-replenishments/{id}/post/ - Post to GL
    """
    permission_module = 'cash-management'
    permission_page = 'petty-cash-replenishments'
    from .models import PettyCashReplenishment
    from .serializers import PettyCashReplenishmentSerializer, PettyCashReplenishmentActionSerializer
    
    queryset = PettyCashReplenishment.objects.all()
    serializer_class = PettyCashReplenishmentSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        queryset = super().get_queryset()
        
        # Filter by branch
        if hasattr(self.request.user, 'branch') and self.request.user.branch:
            queryset = queryset.filter(branch=self.request.user.branch)
        
        # Filter by fund
        fund_id = self.request.query_params.get('fund')
        if fund_id:
            queryset = queryset.filter(fund_id=fund_id)
        
        # Filter by status
        status_param = self.request.query_params.get('status')
        if status_param:
            queryset = queryset.filter(status=status_param)
        
        return queryset

    def perform_create(self, serializer):
        """
        Auto-generate replenishment number and compute all totals from the
        explicitly selected voucher_ids.  The frontend sends a list of retired
        voucher IDs; we look them up, validate them, derive period/amounts, then
        save the replenishment and link the vouchers back to it.
        """
        from .models import PettyCashVoucher
        from decimal import Decimal
        import datetime

        fund = serializer.validated_data['fund']
        voucher_ids = serializer.validated_data.pop('voucher_ids', [])

        # â”€â”€ Fetch and validate selected vouchers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        selected_vouchers = list(
            PettyCashVoucher.objects.filter(
                id__in=voucher_ids,
                fund=fund,
                status='retired',
                replenishment__isnull=True,   # not already in another replenishment
            )
        )

        # â”€â”€ Derive period dates from voucher dates â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        voucher_dates = [v.voucher_date for v in selected_vouchers]
        today = datetime.date.today()
        period_start = min(voucher_dates) if voucher_dates else today
        period_end = max(voucher_dates) if voucher_dates else today

        # â”€â”€ Calculate totals â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        total_vouchers = sum(
            v.actual_amount_disbursed or v.amount or Decimal('0')
            for v in selected_vouchers
        )
        total_receipts = sum(
            v.receipt_amount or Decimal('0') for v in selected_vouchers
        )
        total_variance = total_vouchers - total_receipts
        # Replenishment amount = what needs to be transferred back to the fund.
        # When no vouchers are attached (direct top-up), fall back to the
        # custodian's explicitly requested_amount; default to 0 if none given.
        explicit_request = serializer.validated_data.get('requested_amount') or Decimal('0')
        if total_receipts > 0:
            replenishment_amount = total_receipts
        elif total_vouchers > 0:
            replenishment_amount = total_vouchers
        else:
            replenishment_amount = explicit_request  # direct top-up with no vouchers

        # â”€â”€ Replenishment source: use petty cash GL account from the fund â”€â”€â”€â”€â”€
        replenishment_source = (
            serializer.validated_data.get('replenishment_source')
            or fund.petty_cash_account
        )

        # â”€â”€ Generate replenishment number: PCR-{YEAR}-{SEQUENTIAL} â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        year = datetime.datetime.now().year
        last_replenishment = fund.replenishments.filter(
            replenishment_number__startswith=f'PCR-{year}'
        ).order_by('-replenishment_number').first()

        new_num = (int(last_replenishment.replenishment_number.split('-')[-1]) + 1
                   if last_replenishment else 1)
        replenishment_number = f'PCR-{year}-{new_num:04d}'

        # â”€â”€ Build expense breakdown by category â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        expense_breakdown = {}
        for v in selected_vouchers:
            cat_name = (
                v.expense_category.name if v.expense_category else 'Uncategorised'
            )
            entry = expense_breakdown.setdefault(cat_name, {'amount': 0, 'vouchers': []})
            entry['amount'] += float(v.actual_amount_disbursed or v.amount or 0)
            entry['vouchers'].append(v.voucher_number)

        # â”€â”€ Save replenishment â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        replenishment = serializer.save(
            replenishment_number=replenishment_number,
            submitted_by=self.request.user,
            owner=self.request.user,
            branch=getattr(self.request.user, 'branch', None),
            period_start=period_start,
            period_end=period_end,
            fund_balance_before=fund.current_balance,
            replenishment_source=replenishment_source,
            replenishment_amount=replenishment_amount,
            requested_amount=explicit_request or replenishment_amount,
            total_vouchers_amount=total_vouchers,
            total_receipts_amount=total_receipts,
            total_variance=total_variance,
            expense_breakdown=expense_breakdown,
        )

        # â”€â”€ Link vouchers to this replenishment â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        PettyCashVoucher.objects.filter(id__in=[v.id for v in selected_vouchers]).update(
            replenishment=replenishment
        )


    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        """Submit replenishment for review"""
        replenishment = self.get_object()
        
        try:
            replenishment.submit()
            serializer = self.get_serializer(replenishment)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def verify(self, request, pk=None):
        """Finance officer verifies receipts"""
        from .serializers import PettyCashReplenishmentActionSerializer
        
        replenishment = self.get_object()
        action_serializer = PettyCashReplenishmentActionSerializer(data=request.data)
        action_serializer.is_valid(raise_exception=True)
        
        try:
            replenishment.verify(
                user=request.user,
                notes=action_serializer.validated_data.get('notes', '')
            )
            serializer = self.get_serializer(replenishment)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve replenishment"""
        from .serializers import PettyCashReplenishmentActionSerializer
        
        replenishment = self.get_object()
        action_serializer = PettyCashReplenishmentActionSerializer(data=request.data)
        action_serializer.is_valid(raise_exception=True)
        
        try:
            replenishment.approve(
                user=request.user,
                notes=action_serializer.validated_data.get('notes', ''),
                approved_amount=action_serializer.validated_data.get('approved_amount'),
            )
            serializer = self.get_serializer(replenishment)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """Reject replenishment"""
        from .serializers import PettyCashReplenishmentActionSerializer
        
        replenishment = self.get_object()
        action_serializer = PettyCashReplenishmentActionSerializer(data=request.data)
        action_serializer.is_valid(raise_exception=True)
        
        reason = action_serializer.validated_data.get('reason', '')
        if not reason:
            return Response(
                {'error': 'Rejection reason is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            replenishment.reject(user=request.user, reason=reason)
            serializer = self.get_serializer(replenishment)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def post(self, request, pk=None):
        """Post replenishment to GL"""
        replenishment = self.get_object()
        
        try:
            replenishment.post(user=request.user)
            serializer = self.get_serializer(replenishment)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )


# ============================================================================
# Daily Collection Workflow ViewSets
# ============================================================================

from .models import DailyCollectionSheet, CollectionSheetItem
from .serializers import (
    DailyCollectionSheetSerializer,
    DailyCollectionSheetDetailSerializer,
    DailyCollectionSheetCreateSerializer,
    CollectionSheetItemSerializer,
    CollectionSheetItemCreateSerializer,
    CollectItemSerializer,
    ConfirmTransferSerializer,
    RejectTransferSerializer,
    SubmitSheetSerializer,
)


class DailyCollectionSheetViewSet(ScopedModelViewSet):
    """
    CRUD + workflow actions for DailyCollectionSheet.

    Credit officers see only their own sheets (scoped via get_queryset).
    Supervisors see their own subordinates' sheets as well.
    """

    permission_module = 'cash-management'
    permission_page = 'collection-sheets'
    # No officer_client_lookup needed: the sheet IS the officer's direct object
    # and we scope it explicitly via get_queryset below.
    officer_client_lookup = None

    def get_queryset(self):
        user = self.request.user

        # System admin — unrestricted
        if user.is_superuser or (hasattr(user, 'is_system_admin') and user.is_system_admin):
            qs = DailyCollectionSheet.objects.select_related(
                'credit_officer', 'submitted_to', 'reconciled_by'
            ).prefetch_related('items')
            return qs

        qs = DailyCollectionSheet.objects.select_related(
            'credit_officer', 'submitted_to', 'reconciled_by'
        )

        # Scope to user's own staff profile
        try:
            staff = user.staff_profile
        except Exception:
            return qs.none()

        from django.db.models import Q
        role = getattr(staff, 'role_level', None)
        if role == 'credit_officer':
            qs = qs.filter(credit_officer=staff)
        elif role == 'supervisor':
            qs = qs.filter(
                Q(credit_officer=staff) |
                Q(credit_officer__reports_to=staff)
            )
        # branch_manager / director / admin see everything in their branch
        return qs

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return DailyCollectionSheetCreateSerializer
        if self.action == 'retrieve':
            return DailyCollectionSheetDetailSerializer
        return DailyCollectionSheetSerializer

    # -- Actions ---------------------------------------------------------------

    @action(detail=True, methods=['post'], url_path='activate')
    def activate(self, request, pk=None):
        """Move sheet from draft to active."""
        sheet = self.get_object()
        try:
            sheet.activate()
        except Exception as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            DailyCollectionSheetSerializer(sheet, context={'request': request}).data
        )

    @action(detail=True, methods=['post'], url_path='generate-from-schedule')
    def generate_from_schedule(self, request, pk=None):
        """
        Auto-populate sheet items from today's LoanRepaymentSchedule entries
        for all clients assigned to this officer.
        Idempotent — will skip items that already exist on this sheet.
        """
        sheet = self.get_object()
        if sheet.status not in ('draft', 'active'):
            return Response(
                {'error': 'Sheet must be draft or active to generate items.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        created_count = 0
        skipped_count = 0

        try:
            from loans.models import LoanRepaymentSchedule, LoanAccount

            officer = sheet.credit_officer
            # All loans belonging to clients assigned to this officer
            due_installments = LoanRepaymentSchedule.objects.filter(
                loan_account__client__assigned_officer=officer,
                due_date=sheet.collection_date,
                status__in=['pending', 'partial'],
            ).select_related('loan_account__client', 'loan_account')

            for inst in due_installments:
                exists = CollectionSheetItem.objects.filter(
                    sheet=sheet,
                    loan_installment=inst,
                ).exists()
                if exists:
                    skipped_count += 1
                    continue

                CollectionSheetItem.objects.create(
                    sheet=sheet,
                    client=inst.loan_account.client,
                    collection_type='loan_repayment',
                    loan_account=inst.loan_account,
                    loan_installment=inst,
                    amount_expected=inst.total_due,
                    owner=sheet.owner,
                    branch=sheet.branch,
                )
                created_count += 1

        except ImportError:
            pass

        sheet.refresh_totals()
        return Response({
            'created': created_count,
            'skipped': skipped_count,
            'message': f"Generated {created_count} item(s) from today's schedule.",
        })

    @action(detail=True, methods=['post'], url_path='submit')
    def submit(self, request, pk=None):
        """Officer submits their EOD sheet to their superior."""
        sheet = self.get_object()
        serializer = SubmitSheetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        submitted_to = serializer.validated_data.get('submitted_to')
        if serializer.validated_data.get('notes'):
            sheet.notes = (
                sheet.notes + '\n' + serializer.validated_data['notes']
            ).strip()
            sheet.save(update_fields=['notes'])

        try:
            sheet.submit(submitted_by_user=request.user, submitted_to_staff=submitted_to)
        except Exception as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            DailyCollectionSheetSerializer(sheet, context={'request': request}).data
        )

    @action(detail=True, methods=['post'], url_path='reconcile')
    def reconcile(self, request, pk=None):
        """Supervisor / branch manager marks the sheet as reconciled."""
        try:
            staff = request.user.staff_profile
            allowed_roles = ('supervisor', 'branch_manager', 'director', 'admin')
            if getattr(staff, 'role_level', None) not in allowed_roles:
                return Response(
                    {'error': 'Only supervisors and above can reconcile sheets.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
        except Exception:
            if not request.user.is_superuser:
                return Response(
                    {'error': 'Only supervisors and above can reconcile sheets.'},
                    status=status.HTTP_403_FORBIDDEN,
                )

        sheet = self.get_object()
        try:
            sheet.reconcile(reconciled_by_user=request.user)
        except Exception as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            DailyCollectionSheetSerializer(sheet, context={'request': request}).data
        )

    @action(detail=True, methods=['get'], url_path='pending-transfers')
    def pending_transfers(self, request, pk=None):
        """Return all items on this sheet with pending bank transfer confirmation."""
        sheet = self.get_object()
        items = sheet.items.filter(transfer_confirmation_status='pending')
        serializer = CollectionSheetItemSerializer(
            items, many=True, context={'request': request}
        )
        return Response(serializer.data)


class CollectionSheetItemViewSet(ScopedModelViewSet):
    """
    CRUD + collection actions for individual items on a DailyCollectionSheet.

    Feature #14: CanPostTodayPermission ensures a credit officer cannot record
    new items while they have prior-day unreconciled sheets.
    """

    permission_module = 'cash-management'
    permission_page = 'collection-sheet-items'
    permission_classes = [permissions.IsAuthenticated, CanPostTodayPermission]
    officer_client_lookup = 'client__assigned_officer'

    def get_queryset(self):
        qs = CollectionSheetItem.objects.select_related(
            'sheet__credit_officer', 'client',
            'loan_account', 'loan_installment',
            'savings_account', 'bank_account_credited',
        )

        # Optionally filter by sheet
        sheet_id = self.request.query_params.get('sheet')
        if sheet_id:
            qs = qs.filter(sheet_id=sheet_id)

        # Apply role-based scoping via base class
        return self._apply_officer_scope(qs)

    def get_serializer_class(self):
        if self.action == 'create':
            return CollectionSheetItemCreateSerializer
        if self.action == 'collect':
            return CollectItemSerializer
        if self.action == 'confirm_transfer':
            return ConfirmTransferSerializer
        if self.action == 'reject_transfer':
            return RejectTransferSerializer
        return CollectionSheetItemSerializer

    # -- Actions ---------------------------------------------------------------

    @action(detail=True, methods=['post'], url_path='collect')
    def collect(self, request, pk=None):
        """
        Record the amount received from the client.
        Sets amount_collected, payment_mode, bank_reference, status.
        Does NOT post to GL — call post_payment after this.
        """
        item = self.get_object()
        if item.is_posted:
            return Response(
                {'error': 'Item is already posted to the GL.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = CollectItemSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # Feature #8: credit officers may only use cash or bank_transfer.
        # mobile_money must be initiated by a supervisor or above.
        try:
            staff = request.user.staff_profile
            role = getattr(staff, 'role_level', None)
        except Exception:
            role = None
        if role == 'credit_officer' and data.get('payment_mode') == 'mobile_money':
            return Response(
                {'error': 'Credit officers cannot record mobile money payments. '
                          'Please ask a supervisor to process this payment.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        item.amount_collected = data['amount_collected']
        item.payment_mode = data['payment_mode']
        item.bank_reference = data.get('bank_reference', '')
        item.status = data.get('status', 'collected')
        if data.get('notes'):
            item.notes = (item.notes + '\n' + data['notes']).strip()
        if data.get('bank_account_credited'):
            item.bank_account_credited = data['bank_account_credited']

        # Auto-set transfer_confirmation_status for non-cash payments
        if item.payment_mode in ('bank_transfer', 'mobile_money'):
            item.transfer_confirmation_status = 'pending'
        else:
            item.transfer_confirmation_status = 'na'

        item.save()
        item.sheet.refresh_totals()

        return Response(
            CollectionSheetItemSerializer(item, context={'request': request}).data
        )

    @action(detail=True, methods=['post'], url_path='post-payment')
    def post_payment(self, request, pk=None):
        """Post a CASH item to the GL and credit the officer's till."""
        item = self.get_object()
        try:
            item.post_cash_collection(user=request.user)
        except Exception as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            CollectionSheetItemSerializer(item, context={'request': request}).data
        )

    @action(detail=True, methods=['post'], url_path='confirm-transfer')
    def confirm_transfer(self, request, pk=None):
        """
        Supervisor confirms a client's direct bank transfer.
        Posts GL: DR bank account, CR loan / savings.
        """
        try:
            staff = request.user.staff_profile
            allowed_roles = ('supervisor', 'branch_manager', 'director', 'admin')
            if getattr(staff, 'role_level', None) not in allowed_roles:
                return Response(
                    {'error': 'Only supervisors and above can confirm bank transfers.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
        except Exception:
            if not request.user.is_superuser:
                return Response(
                    {'error': 'Only supervisors and above can confirm bank transfers.'},
                    status=status.HTTP_403_FORBIDDEN,
                )

        item = self.get_object()
        serializer = ConfirmTransferSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        bank_acct = serializer.validated_data.get('bank_account_credited')
        bank_gl = bank_acct.account if bank_acct else None

        try:
            item.confirm_bank_transfer(user=request.user, bank_gl_account=bank_gl)
        except Exception as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            CollectionSheetItemSerializer(item, context={'request': request}).data
        )

    @action(detail=True, methods=['post'], url_path='reject-transfer')
    def reject_transfer(self, request, pk=None):
        """Mark an unconfirmed bank transfer as rejected."""
        try:
            staff = request.user.staff_profile
            allowed_roles = ('supervisor', 'branch_manager', 'director', 'admin')
            if getattr(staff, 'role_level', None) not in allowed_roles:
                return Response(
                    {'error': 'Only supervisors and above can reject bank transfers.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
        except Exception:
            if not request.user.is_superuser:
                return Response(
                    {'error': 'Only supervisors and above can reject bank transfers.'},
                    status=status.HTTP_403_FORBIDDEN,
                )

        item = self.get_object()
        serializer = RejectTransferSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            item.reject_bank_transfer(
                user=request.user,
                reason=serializer.validated_data.get('reason', ''),
            )
        except Exception as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            CollectionSheetItemSerializer(item, context={'request': request}).data
        )
