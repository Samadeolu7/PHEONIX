# banks/views.py
"""
Views for Bank Management System
Provides CRUD operations and workflow management for banks and transfers
"""
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from django.db.models import Q, Sum, Count, F
from django.utils import timezone
from django.shortcuts import get_object_or_404
from decimal import Decimal
import logging

from common.views import ScopedModelViewSet
from common.approval_permissions import IsApprover, can_user_approve
from .models import Bank, BankAccount, BankTransfer, BankPayment
from .serializers import (
    BankSerializer,
    BankAccountSerializer,
    BankAccountDetailSerializer,
    BankTransferSerializer,
    BankTransferActionSerializer,
    BankAccountBalanceLogSerializer,
    BankPaymentSerializer,
)


logger = logging.getLogger(__name__)


def _error_message(exc: Exception) -> str:
    """Extract a clean message from an exception for API error responses.

    Django's ValidationError renders via str() as a list repr (e.g.
    "['Only draft transfers can be submitted for approval.']"), so pull
    from .messages when available instead of relying on str(exc).
    """
    messages = getattr(exc, 'messages', None)
    if messages:
        return ' '.join(messages)
    return str(exc)


class BankViewSet(ScopedModelViewSet):
    """
    ViewSet for Bank management
    
    Endpoints:
    - GET /api/banks/ - List all banks
    - POST /api/banks/ - Create new bank
    - GET /api/banks/{id}/ - Get bank details
    - PUT/PATCH /api/banks/{id}/ - Update bank
    - DELETE /api/banks/{id}/ - Delete bank (soft delete)
    - GET /api/banks/{id}/accounts/ - Get all accounts at this bank
    - GET /api/banks/{id}/summary/ - Get bank summary statistics
    """
    permission_module = 'banks'
    permission_page = 'banks'
    queryset = Bank.objects.all()
    serializer_class = BankSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        """Filter banks by branch and active status"""
        queryset = super().get_queryset()
        
        # Filter by active status
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() == 'true')
        
        # Search by bank name
        search = self.request.query_params.get('search')
        if search:
            queryset = queryset.filter(
                Q(bank_name__icontains=search) |
                Q(bank_code__icontains=search) |
                Q(branch_name__icontains=search)
            )
        
        return queryset.order_by('bank_name', 'branch_name')
    
    @action(detail=True, methods=['get'])
    def accounts(self, request, pk=None):
        """Get all accounts at this bank"""
        bank = self.get_object()
        accounts = bank.accounts.filter(is_deleted=False)
        
        # Filter by active status
        is_active = request.query_params.get('is_active')
        if is_active is not None:
            accounts = accounts.filter(is_active=is_active.lower() == 'true')
        
        serializer = BankAccountSerializer(accounts, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'])
    def summary(self, request, pk=None):
        """Get bank summary statistics"""
        bank = self.get_object()
        
        accounts = bank.accounts.filter(is_active=True, is_deleted=False)
        
        summary = {
            'bank_id': bank.id,
            'bank_name': bank.bank_name,
            'branch_name': bank.branch_name,
            'total_accounts': accounts.count(),
            'active_accounts': accounts.filter(is_active=True).count(),
            'suspended_accounts': accounts.filter(is_suspended=True).count(),
            'total_balance': accounts.aggregate(total=Sum('current_balance'))['total'] or Decimal('0'),
            'accounts_by_type': {
                item['account_type']: item['count']
                for item in accounts.values('account_type').annotate(count=Count('id'))
            }
        }
        
        return Response(summary)


class BankPaymentViewSet(ScopedModelViewSet):
    """
    ViewSet for BankPayment management

    Endpoints:
    - GET /api/bank-payments/ - List all bank payments
    - POST /api/bank-payments/ - Create payment (status: pending, awaiting approval)
    - GET /api/bank-payments/{id}/ - Get payment details
    - POST /api/bank-payments/{id}/approve/ - Approve and post payment
    - POST /api/bank-payments/{id}/reject/ - Reject payment
    - GET /api/bank-payments/pending_approvals/ - Get payments pending approval
    """
    permission_module = 'banks'
    permission_page = 'bank-payments'
    queryset = BankPayment.objects.all()
    serializer_class = BankPaymentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        if self.action in ('approve', 'reject'):
            return [permissions.IsAuthenticated(), IsApprover()]
        return super().get_permissions()

    def get_queryset(self):
        """Filter payments by various criteria.

        We bypass ScopedModelViewSet.get_queryset()'s for_user() shortcut so
        that we can include payments whose branch is NULL (legacy records that
        were saved before branch injection was added to the serializer).  The
        tenant filter still scopes results to the authenticated user's tenant.
        """
        user = self.request.user

        # Build a fresh queryset scoped by tenant (and optionally branch)
        qs = BankPayment.objects.filter(is_deleted=False)

        if not getattr(user, 'is_system_admin', False):
            tenant = getattr(user, 'tenant', None)
            if tenant:
                qs = qs.filter(tenant=tenant)

            branch = getattr(user, 'branch', None)
            if branch:
                # Include exact branch match OR null-branch records that belong
                # to the same tenant (records created before branch was injected)
                qs = qs.filter(Q(branch=branch) | Q(branch__isnull=True))

        queryset = qs

        status_filter = self.request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)

        bank_account = self.request.query_params.get('bank_account')
        if bank_account:
            queryset = queryset.filter(bank_account_id=bank_account)

        payment_type = self.request.query_params.get('payment_type')
        if payment_type == 'payable':
            queryset = queryset.filter(accounts_payable__isnull=False)
        elif payment_type == 'expense':
            queryset = queryset.filter(expense__isnull=False)
        elif payment_type == 'on_account':
            queryset = queryset.filter(supplier__isnull=False)

        date_from = self.request.query_params.get('date_from')
        if date_from:
            queryset = queryset.filter(payment_date__gte=date_from)

        date_to = self.request.query_params.get('date_to')
        if date_to:
            queryset = queryset.filter(payment_date__lte=date_to)

        search = self.request.query_params.get('search')
        if search:
            queryset = queryset.filter(
                Q(payment_number__icontains=search) |
                Q(reference_number__icontains=search) |
                Q(description__icontains=search) |
                Q(accounts_payable__invoice_number__icontains=search) |
                Q(expense__reference_number__icontains=search)
            )

        return queryset.select_related(
            'bank_account__bank', 'accounts_payable', 'expense', 'supplier',
            'approved_by', 'posted_by'
        )

    def perform_create(self, serializer):
        """Create payment in pending status — does not post directly."""
        user, branch, tenant = self._resolve_create_scope()
        serializer.save(
            created_by=user,
            owner=user,
            branch=branch,
            tenant=tenant,
        )

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve and post payment."""
        payment = self.get_object()

        notes = request.data.get('notes', '')
        try:
            payment.approve_payment(approved_by=request.user, notes=notes)
            logger.info(f"Payment {payment.payment_number} approved by {request.user}")
            serializer = self.get_serializer(payment)
            return Response(serializer.data)
        except Exception as e:
            return Response({'error': _error_message(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """Reject payment."""
        payment = self.get_object()

        reason = request.data.get('reason', '')
        if not reason:
            return Response(
                {'error': 'Rejection reason is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            payment.reject_payment(rejected_by=request.user, reason=reason)
            logger.info(f"Payment {payment.payment_number} rejected by {request.user}")
            serializer = self.get_serializer(payment)
            return Response(serializer.data)
        except Exception as e:
            return Response({'error': _error_message(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'], url_path='pending-approvals')
    def pending_approvals(self, request):
        """Get all payments pending approval."""
        payments = self.get_queryset().filter(status='pending')
        serializer = self.get_serializer(payments, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='apply-advance')
    def apply_advance(self, request, pk=None):
        """
        Apply an on-account advance payment against an Accounts Payable record.

        This posts the clearing entry:
            Dr Accounts Payable   (liability reduces)
            Cr Supplier Advances  (asset reduces — advance consumed)

        POST /api/bank-payments/{id}/apply-advance/
        Body:
          {
            "accounts_payable": <int>,   -- AP record id
            "amount": "1000.00",
            "notes": "optional",
            "bypass_validation": false   -- skip 3-way match check
          }
        """
        payment = self.get_object()

        if not payment.supplier_id:
            return Response(
                {'error': 'Only on-account (supplier advance) payments can be applied to invoices.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if payment.status != 'posted':
            return Response(
                {'error': f'Payment must be posted before applying. Current status: {payment.status}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ap_id = request.data.get('accounts_payable')
        amount = request.data.get('amount')
        notes = request.data.get('notes', '')
        bypass_validation = request.data.get('bypass_validation', False)

        if not ap_id:
            return Response(
                {'error': '"accounts_payable" (AP record id) is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not amount:
            return Response(
                {'error': '"amount" is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from liabilities.models import AccountsPayable
        try:
            payable = AccountsPayable.objects.get(pk=ap_id)
        except AccountsPayable.DoesNotExist:
            return Response(
                {'error': f'Accounts Payable record {ap_id} not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            result = payment.apply_advance_to_payable(
                payable=payable,
                amount=amount,
                posted_by=request.user,
                notes=notes,
                bypass_validation=bypass_validation,
            )
            logger.info(
                f"Advance {payment.payment_number} applied to AP {payable.reference_number} "
                f"(amount={amount}) by {request.user}"
            )
            serializer = self.get_serializer(payment)
            return Response({
                'payment': serializer.data,
                'application': result,
            })
        except Exception as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)


class BankAccountViewSet(ScopedModelViewSet):
    """
    ViewSet for BankAccount management
    
    Endpoints:
    - GET /api/bank-accounts/ - List all bank accounts
    - POST /api/bank-accounts/ - Create new bank account
    - GET /api/bank-accounts/{id}/ - Get account details
    - PUT/PATCH /api/bank-accounts/{id}/ - Update account
    - DELETE /api/bank-accounts/{id}/ - Delete account (soft delete)
    - GET /api/bank-accounts/{id}/ledger/ - Get account ledger
    - GET /api/bank-accounts/{id}/summary/ - Get account summary
    - POST /api/bank-accounts/{id}/suspend/ - Suspend account
    - POST /api/bank-accounts/{id}/activate/ - Activate account
    """
    permission_module = 'banks'
    permission_page = 'bank-accounts'
    queryset = BankAccount.objects.all()
    permission_classes = [permissions.IsAuthenticated]
    
    def get_serializer_class(self):
        """Use detailed serializer for retrieve action"""
        if self.action == 'retrieve':
            return BankAccountDetailSerializer
        return BankAccountSerializer
    
    def get_queryset(self):
        """Filter bank accounts by various criteria"""
        queryset = super().get_queryset()
        
        # Filter by bank
        bank_id = self.request.query_params.get('bank')
        if bank_id:
            queryset = queryset.filter(bank_id=bank_id)
        
        # Filter by active status
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() == 'true')
        
        # Filter by suspended status
        is_suspended = self.request.query_params.get('is_suspended')
        if is_suspended is not None:
            queryset = queryset.filter(is_suspended=is_suspended.lower() == 'true')
        
        # Filter by account type
        account_type = self.request.query_params.get('account_type')
        if account_type:
            queryset = queryset.filter(account_type=account_type)
        
        # Filter by cashier collection accounts
        is_cashier_collection = self.request.query_params.get('is_cashier_collection_account')
        if is_cashier_collection is not None:
            queryset = queryset.filter(is_cashier_collection_account=is_cashier_collection.lower() == 'true')
        
        # Filter by account manager
        account_manager = self.request.query_params.get('account_manager')
        if account_manager:
            queryset = queryset.filter(account_manager_id=account_manager)
        
        # Search
        search = self.request.query_params.get('search')
        if search:
            queryset = queryset.filter(
                Q(account_number__icontains=search) |
                Q(account_name__icontains=search) |
                Q(bank__bank_name__icontains=search)
            )
        
        return queryset.select_related('bank', 'gl_account', 'account_manager')
    
    @action(detail=True, methods=['get'])
    def ledger(self, request, pk=None):
        """
        Get account ledger report
        
        Query Parameters:
        - date_from: Start date (YYYY-MM-DD)
        - date_to: End date (YYYY-MM-DD)
        - include_unapproved: Include unapproved transactions (default: false)
        """
        bank_account = self.get_object()
        
        # Get query parameters
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        include_unapproved = request.query_params.get('include_unapproved', 'false').lower() == 'true'
        
        # Get ledger from GL account
        from transactions.models import TransactionEntry
        
        # Build query
        entries_query = TransactionEntry.objects.filter(
            account=bank_account.gl_account
        ).select_related('transaction', 'transaction__owner')
        
        # Filter by approved status
        if not include_unapproved:
            entries_query = entries_query.filter(transaction__approved=True)
        
        # Filter by date range
        if date_from:
            entries_query = entries_query.filter(transaction__date__gte=date_from)
        if date_to:
            entries_query = entries_query.filter(transaction__date__lte=date_to)
        
        # Order by date
        entries_query = entries_query.order_by('transaction__date', 'transaction__id')
        
        # Calculate opening balance
        opening_balance = Decimal('0.00')
        if date_from:
            opening_entries = TransactionEntry.objects.filter(
                account=bank_account.gl_account,
                transaction__date__lt=date_from
            )
            if not include_unapproved:
                opening_entries = opening_entries.filter(transaction__approved=True)
            
            for entry in opening_entries:
                if entry.side == 'DEBIT':
                    opening_balance += entry.amount
                else:
                    opening_balance -= entry.amount
        
        # Process entries and calculate running balance
        ledger_entries = []
        running_balance = opening_balance
        
        for entry in entries_query:
            # Update running balance
            if entry.side == 'DEBIT':
                running_balance += entry.amount
            else:
                running_balance -= entry.amount
            
            ledger_entries.append({
                'date': entry.transaction.date.isoformat(),
                'transaction_id': entry.transaction.id,
                'reference_number': entry.transaction.reference_number,
                'description': entry.transaction.description,
                'debit': entry.amount if entry.side == 'DEBIT' else Decimal('0'),
                'credit': entry.amount if entry.side == 'CREDIT' else Decimal('0'),
                'balance': running_balance,
                'created_by': entry.transaction.owner.get_full_name() if entry.transaction.owner else None,
                'approved': entry.transaction.approved,
            })
        
        # Calculate totals
        total_debits = sum(e['debit'] for e in ledger_entries)
        total_credits = sum(e['credit'] for e in ledger_entries)
        
        return Response({
            'account': {
                'id': bank_account.id,
                'account_number': bank_account.account_number,
                'account_name': bank_account.account_name,
                'bank_name': bank_account.bank.bank_name,
                'current_balance': bank_account.current_balance,
            },
            'period': {
                'date_from': date_from,
                'date_to': date_to,
            },
            'opening_balance': opening_balance,
            'closing_balance': running_balance,
            'total_debits': total_debits,
            'total_credits': total_credits,
            'entries': ledger_entries,
            'entry_count': len(ledger_entries),
        })
    
    @action(detail=True, methods=['get'])
    def summary(self, request, pk=None):
        """Get account summary statistics"""
        bank_account = self.get_object()
        
        # Get transfer statistics
        incoming_pending = bank_account.incoming_transfers.filter(
            status__in=['pending', 'approved']
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
        
        outgoing_pending = bank_account.outgoing_transfers.filter(
            status__in=['pending', 'approved']
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
        
        # Get recent transactions count
        from transactions.models import TransactionEntry
        recent_transactions = TransactionEntry.objects.filter(
            account=bank_account.gl_account,
            transaction__date__gte=timezone.now().date() - timezone.timedelta(days=30)
        ).count()
        
        summary = {
            'account_id': bank_account.id,
            'account_number': bank_account.account_number,
            'account_name': bank_account.account_name,
            'bank_name': bank_account.bank.bank_name,
            'current_balance': bank_account.current_balance,
            'available_balance': bank_account.get_available_balance(),
            'incoming_pending': incoming_pending,
            'outgoing_pending': outgoing_pending,
            'recent_transactions_count': recent_transactions,
            'is_active': bank_account.is_active,
            'is_suspended': bank_account.is_suspended,
        }
        
        return Response(summary)
    
    @action(detail=True, methods=['post'])
    def suspend(self, request, pk=None):
        """Suspend bank account"""
        bank_account = self.get_object()
        
        if bank_account.is_suspended:
            return Response(
                {'error': 'Account is already suspended'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        bank_account.is_suspended = True
        bank_account.save(update_fields=['is_suspended'])
        
        logger.info(f"Bank account {bank_account.account_number} suspended by {request.user}")
        
        serializer = self.get_serializer(bank_account)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        """Activate suspended bank account"""
        bank_account = self.get_object()
        
        if not bank_account.is_suspended:
            return Response(
                {'error': 'Account is not suspended'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        bank_account.is_suspended = False
        bank_account.save(update_fields=['is_suspended'])
        
        logger.info(f"Bank account {bank_account.account_number} activated by {request.user}")
        
        serializer = self.get_serializer(bank_account)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='create-gl-account')
    def create_gl_account(self, request, pk=None):
        """
        Create (or re-link) a GL account for a bank account that is missing one.
        Safe to call multiple times – it is idempotent once a GL account exists.
        POST /api/bank-accounts/{id}/create-gl-account/
        """
        bank_account = self.get_object()
        if bank_account.gl_account_id:
            serializer = self.get_serializer(bank_account)
            return Response(
                {'message': 'GL account already exists', 'bank_account': serializer.data}
            )
        try:
            bank_account._auto_create_gl_account()
            bank_account.save(update_fields=['gl_account'])  # persist the new FK
            logger.info(
                f"GL account created for bank account {bank_account.account_number} "
                f"by {request.user}"
            )
            serializer = self.get_serializer(bank_account)
            return Response(
                {'message': 'GL account created successfully', 'bank_account': serializer.data}
            )
        except Exception as exc:
            logger.error(
                f"Failed to create GL account for bank account {bank_account.id}: {exc}",
                exc_info=True,
            )
            return Response(
                {'error': f'Failed to create GL account: {exc}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=False, methods=['post'], url_path='repair-missing-gl')
    def repair_missing_gl(self, request):
        """
        Bulk-repair all bank accounts that have no linked GL account.
        Returns the count of accounts fixed and any failures.
        POST /api/bank-accounts/repair-missing-gl/
        """
        broken = list(
            self.get_queryset().filter(gl_account__isnull=True)
        )
        fixed = []
        failed = []
        for ba in broken:
            try:
                ba._auto_create_gl_account()
                ba.save(update_fields=['gl_account'])
                fixed.append({'id': ba.id, 'account_number': ba.account_number})
                logger.info(
                    f"[repair-missing-gl] GL account created for bank account "
                    f"{ba.account_number} by {request.user}"
                )
            except Exception as exc:
                failed.append({
                    'id': ba.id,
                    'account_number': ba.account_number,
                    'error': str(exc),
                })
                logger.error(
                    f"[repair-missing-gl] Failed for bank account {ba.id}: {exc}",
                    exc_info=True,
                )
        return Response({
            'fixed_count': len(fixed),
            'failed_count': len(failed),
            'fixed': fixed,
            'failed': failed,
        })


class BankTransferViewSet(ScopedModelViewSet):
    """
    ViewSet for BankTransfer management with approval workflow
    
    Endpoints:
    - GET /api/bank-transfers/ - List all transfers
    - POST /api/bank-transfers/ - Create new transfer (draft)
    - GET /api/bank-transfers/{id}/ - Get transfer details
    - PUT/PATCH /api/bank-transfers/{id}/ - Update transfer (draft only)
    - DELETE /api/bank-transfers/{id}/ - Delete transfer (draft only)
    - POST /api/bank-transfers/{id}/submit/ - Submit for approval
    - POST /api/bank-transfers/{id}/approve/ - Approve transfer
    - POST /api/bank-transfers/{id}/second_approve/ - Second approval (dual approval)
    - POST /api/bank-transfers/{id}/reject/ - Reject transfer
    - GET /api/bank-transfers/pending_approvals/ - Get transfers pending approval
    - GET /api/bank-transfers/my_transfers/ - Get my initiated transfers
    """
    permission_module = 'banks'
    permission_page = 'bank-transfers'
    queryset = BankTransfer.objects.all()
    serializer_class = BankTransferSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        """approve/second_approve/reject bypass the auto-appended
        HasActionPermission (which would require can_approve on
        banks:bank-transfers for ALL four transfer-type branches) in favor of
        _check_approval_permission()'s own, more precise per-transfer-type
        check. This matters: migrate_bank_transfer_policies.py deliberately
        does NOT grant can_approve on banks:bank-transfers to branch managers
        (bank-to-cashier approvers) or to ordinary cashiers/account managers
        (cashier-to-cashier / cashier-to-bank approvers) — only to directors/
        admins. Leaving HasActionPermission in place would 403 those three
        approval paths before the request ever reached the view body, no
        matter what _check_approval_permission decided.

        pending_approvals is also exempted: it's the list an approver checks
        to see what needs their action, so gating it by the generic can_view
        flag (HasActionPermission's default for a GET action) creates the
        same trap — an admin who grants only can_approve (the obviously
        relevant flag for "can this role approve transfers") without also
        remembering to separately tick can_view leaves the approver unable to
        even see the list they're supposed to act on. See the manual check
        inside pending_approvals() below: can_view OR can_approve satisfies it.
        """
        if self.action in ('approve', 'second_approve', 'reject', 'pending_approvals'):
            return [permissions.IsAuthenticated()]
        return super().get_permissions()

    def _is_transfer_manager(self):
        """
        True for directors, admins, and branch managers who oversee all transfers.

        Driven by RolePermissionPolicy(module='banks', page='bank-transfers').can_edit
        — see permissions/management/commands/migrate_bank_transfer_policies.py, which
        grants can_edit=True to director/admin/branch_manager-fragment roles (mirroring
        this method's old staff_profile.role_level check) without granting can_approve
        to branch_manager, preserving approve()'s narrower director/admin-only gate.
        """
        from permissions.services import PermissionResolver
        user = self.request.user
        if self._is_elevated_user(user):
            return True
        eff = PermissionResolver.resolve(user, module='banks', page='bank-transfers')
        return eff.can_edit

    def get_queryset(self):
        """Filter transfers by various criteria"""
        queryset = super().get_queryset()

        # Regular users see their own initiated transfers, plus any cashier-to-
        # cashier transfer pending their approval as the destination cashier
        # (they're neither the initiator nor a transfer manager, so without this
        # they'd never be able to discover a transfer sent to them).
        # Managers/directors see all.
        if not self._is_transfer_manager():
            queryset = queryset.filter(
                Q(initiated_by=self.request.user) |
                Q(destination_cashier_account__cashier=self.request.user)
            )

        # Filter by status
        status_filter = self.request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        
        # Filter by source type
        source_type = self.request.query_params.get('source_type')
        if source_type:
            queryset = queryset.filter(source_type=source_type)
        
        # Filter by date range
        date_from = self.request.query_params.get('date_from')
        if date_from:
            queryset = queryset.filter(transfer_date__gte=date_from)
        
        date_to = self.request.query_params.get('date_to')
        if date_to:
            queryset = queryset.filter(transfer_date__lte=date_to)
        
        # Filter by source bank account
        source_bank = self.request.query_params.get('source_bank_account')
        if source_bank:
            queryset = queryset.filter(source_bank_account_id=source_bank)
        
        # Filter by destination bank account
        destination_bank = self.request.query_params.get('destination_bank_account')
        if destination_bank:
            queryset = queryset.filter(destination_bank_account_id=destination_bank)
        
        # Filter by initiated by
        initiated_by = self.request.query_params.get('initiated_by')
        if initiated_by:
            queryset = queryset.filter(initiated_by_id=initiated_by)
        
        # Search
        search = self.request.query_params.get('search')
        if search:
            queryset = queryset.filter(
                Q(transfer_number__icontains=search) |
                Q(description__icontains=search) |
                Q(reference_number__icontains=search)
            )
        
        return queryset.select_related(
            'source_cashier_account',
            'source_bank_account',
            'destination_bank_account',
            'destination_cashier_account',
            'initiated_by',
            'approved_by',
            'second_approved_by'
        ).order_by('-transfer_date', '-created_at')
    
    def perform_create(self, serializer):
        """Set initiated_by on create"""
        user, branch, tenant = self._resolve_create_scope()
        serializer.save(
            initiated_by=user,
            owner=user,
            branch=branch,
            tenant=tenant,
        )
    
    def update(self, request, *args, **kwargs):
        """Only allow updates on draft transfers"""
        instance = self.get_object()
        
        if instance.status != 'draft':
            return Response(
                {'error': f'Cannot update transfer in {instance.status} status. Only draft transfers can be updated.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        return super().update(request, *args, **kwargs)
    
    def destroy(self, request, *args, **kwargs):
        """Only allow deletion of own draft transfers"""
        instance = self.get_object()

        if instance.initiated_by != request.user and not self._is_transfer_manager():
            return Response(
                {'error': 'You can only delete transfers you initiated.'},
                status=status.HTTP_403_FORBIDDEN
            )

        if instance.status != 'draft':
            return Response(
                {'error': f'Cannot delete transfer in {instance.status} status. Only draft transfers can be deleted.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        return super().destroy(request, *args, **kwargs)
    
    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        """Submit transfer for approval"""
        transfer = self.get_object()

        if transfer.initiated_by != request.user and not self._is_transfer_manager():
            return Response(
                {'error': 'You can only submit transfers you initiated.'},
                status=status.HTTP_403_FORBIDDEN
            )

        try:
            transfer.submit_for_approval(request.user)
            logger.info(f"Transfer {transfer.transfer_number} submitted by {request.user}")
            
            serializer = self.get_serializer(transfer)
            return Response(serializer.data)
        
        except Exception as e:
            return Response(
                {'error': _error_message(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    def _check_approval_permission(self, request, transfer, *, allow_bank_to_cashier=True):
        """Return a 403 Response if request.user may not act (approve/reject) on
        this transfer, or None if they may.

        RolePermissionPolicy.can_approve on banks:bank-transfers (the Permission
        Setup page — director-level authority) governs the bank-to-bank branch,
        and ALSO acts as a fallback for cashier-to-bank AND cashier-to-cashier,
        so a director can always step in regardless of which specific account
        or cashier is involved. This was deliberately NOT the case originally
        (cashier-to-cashier was a hard, no-override invariant) — changed per a
        business decision that senior staff can themselves hold a cashier
        float, and requiring a junior staff member (as the literal destination
        cashier) to be the only one who can confirm receipt into a senior's
        float was unworkable. A director now serves as the escalation path.
        The remaining branch is gated purely by object identity, not by
        anything grantable on that page:
          - bank-to-cashier: the branch-manager-tier role check
            (BankTransfer.can_user_manage_bank_to_cashier), which already
            includes directors/admins — not a RolePermissionPolicy grant.
        Both cashier-to-bank and cashier-to-cashier allow EITHER the relevant
        object-identity check (destination BankAccount's account_manager, or
        destination CashierAccount's cashier) OR a director, so a cashier who
        happens to also be that account's manager still can't rubber-stamp
        their own transfer (see the maker-checker guard below, which blocks
        that regardless).

        allow_bank_to_cashier=False is used by second_approve(), which
        structurally never reaches a bank-to-cashier transfer (those are
        single-approval) and omits that branch entirely, matching the
        original inline logic.

        Maker-checker: whoever initiated the transfer may never approve or
        reject it themselves, no matter which branch below would otherwise
        allow them through (director authority included) — segregation of
        duties between the person who moves the money and the person who
        signs off on it.
        """
        if transfer.initiated_by_id == request.user.id:
            return Response(
                {'error': 'You cannot approve or reject a transfer you initiated.'},
                status=status.HTTP_403_FORBIDDEN
            )

        if allow_bank_to_cashier and transfer.source_type == 'bank' and transfer.destination_type == 'cashier':
            # Bank-to-cashier: same role gate as initiating one (branch manager /
            # supervisor / director / admin) — see BankTransfer.can_user_manage_bank_to_cashier
            # for why this is a separate, looser gate than plain bank-to-bank.
            if not BankTransfer.can_user_manage_bank_to_cashier(request.user):
                return Response(
                    {'error': 'Only branch managers, supervisors, and directors can approve '
                               'bank-to-cashier transfers'},
                    status=status.HTTP_403_FORBIDDEN
                )
        elif transfer.source_type == 'bank':
            # Bank-to-bank transfers require director/admin approval — driven by
            # RolePermissionPolicy(module='banks', page='bank-transfers').can_approve.
            # See migrate_bank_transfer_policies.py for the equivalent-grant migration
            # from the old staff_profile.role_level check this replaces.
            if not self._has_bank_transfer_approve_grant(request.user):
                return Response(
                    {'error': 'Only directors can approve bank-to-bank transfers'},
                    status=status.HTTP_403_FORBIDDEN
                )
        elif transfer.destination_type == 'cashier':
            # Cashier-to-cashier transfers require the destination cashier —
            # OR a director (see docstring above for why this is no longer a
            # hard, no-override invariant).
            is_destination_cashier = bool(
                transfer.destination_cashier_account
                and transfer.destination_cashier_account.cashier == request.user
            )
            if not is_destination_cashier and not self._has_bank_transfer_approve_grant(request.user):
                return Response(
                    {'error': 'Only the destination cashier or a director can approve this transfer'},
                    status=status.HTTP_403_FORBIDDEN
                )
        else:
            # Cashier-to-bank transfers require the destination account manager
            # — OR a director (same RolePermissionPolicy grant as bank-to-bank),
            # so a director can always step in regardless of transfer type,
            # while an ordinary cashier still can't approve their own transfer
            # to an account they don't manage (and the maker-checker guard
            # above blocks them even if they DO happen to manage it themselves).
            is_account_manager = transfer.destination_bank_account.account_manager == request.user
            if not is_account_manager and not self._has_bank_transfer_approve_grant(request.user):
                return Response(
                    {'error': 'Only the destination account manager or a director can approve '
                               'this transfer'},
                    status=status.HTTP_403_FORBIDDEN
                )
        return None

    @staticmethod
    def _has_bank_transfer_approve_grant(user):
        """True if RolePermissionPolicy(module='banks', page='bank-transfers')
        grants this user can_approve — i.e. they hold director-level approval
        authority regardless of which specific bank account is involved."""
        from permissions.services import PermissionResolver
        eff = PermissionResolver.resolve(user, module='banks', page='bank-transfers', action='approve')
        return bool(eff.can_approve)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve transfer (first approval)"""
        transfer = self.get_object()

        permission_error = self._check_approval_permission(request, transfer)
        if permission_error:
            return permission_error

        serializer = BankTransferActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            transfer.approve(request.user, serializer.validated_data.get('notes', ''))
            logger.info(f"Transfer {transfer.transfer_number} approved by {request.user}")

            response_serializer = self.get_serializer(transfer)
            return Response(response_serializer.data)

        except Exception as e:
            return Response(
                {'error': _error_message(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=True, methods=['post'])
    def second_approve(self, request, pk=None):
        """Second approval for dual approval transfers"""
        transfer = self.get_object()

        # Cashier-to-cashier transfers are single-approval only (see approve()'s
        # dual-approval gate) and structurally never reach this state, but reject
        # explicitly here too rather than relying solely on that being true.
        if transfer.destination_type == 'cashier':
            return Response(
                {'error': 'Cashier-to-cashier transfers do not require or support second approval.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        permission_error = self._check_approval_permission(request, transfer, allow_bank_to_cashier=False)
        if permission_error:
            return permission_error

        serializer = BankTransferActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            transfer.second_approve(request.user, serializer.validated_data.get('notes', ''))
            logger.info(f"Transfer {transfer.transfer_number} second approved by {request.user}")

            response_serializer = self.get_serializer(transfer)
            return Response(response_serializer.data)

        except Exception as e:
            return Response(
                {'error': _error_message(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """Reject transfer"""
        transfer = self.get_object()

        permission_error = self._check_approval_permission(request, transfer)
        if permission_error:
            return permission_error

        serializer = BankTransferActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        reason = serializer.validated_data.get('reason', '')
        if not reason:
            return Response(
                {'error': 'Rejection reason is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            transfer.reject(request.user, reason)
            logger.info(f"Transfer {transfer.transfer_number} rejected by {request.user}")
            
            response_serializer = self.get_serializer(transfer)
            return Response(response_serializer.data)
        
        except Exception as e:
            return Response(
                {'error': _error_message(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=False, methods=['get'], url_path='pending-approvals')
    def pending_approvals(self, request):
        """Get transfers pending approval.

        Accessible to anyone with can_view OR can_approve on
        banks:bank-transfers — see get_permissions() docstring for why this
        can't just be the default can_view-only check.
        """
        from permissions.services import PermissionResolver
        eff = PermissionResolver.resolve(request.user, module='banks', page='bank-transfers')
        if not (eff.can_view or eff.can_approve):
            return Response(
                {'error': 'You do not have permission to view pending approvals.'},
                status=status.HTTP_403_FORBIDDEN
            )

        transfers = self.get_queryset().filter(
            status__in=['pending', 'approved']
        )

        # Filter for second approval if needed
        needs_second_approval = request.query_params.get('needs_second_approval')
        if needs_second_approval:
            transfers = transfers.filter(
                status='approved',
                second_approved_by__isnull=True
            )

        serializer = self.get_serializer(transfers, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def my_transfers(self, request):
        """Get transfers initiated by current user"""
        transfers = self.get_queryset().filter(initiated_by=request.user)
        
        serializer = self.get_serializer(transfers, many=True)
        return Response(serializer.data)


# NOTE: BankFeedConsentViewSet and BankStatementUploadViewSet were removed as
# dead code (2026-07) — a Mono/open-banking consent flow and a parallel
# manual-line-matching feature, neither ever reachable from any frontend page
# and both superseded by the upload-based DailyReconciliation flow below.
# BankFeedConsent/BankStatementUpload/BankStatementLine models and their
# migrations are left untouched.


# ── Bank-Recon daily reconciliation views ────────────────────────────────────

from django.utils import timezone as tz

from .models import ReconciliationBankTransaction, DailyReconciliation, ReconciliationException
from .parsers import parse_statement_file
from .serializers import (
    DailyReconciliationSerializer,
    DailyReconciliationListSerializer,
    ReconciliationExceptionSerializer,
)
from .tasks import run_reconciliation_match


class StatementUploadView(APIView):
    """
    POST /api/banks/reconciliations/upload/

    Accepts a multipart/form-data upload with fields:
      - bank_account_id   (int)
      - statement_file    (CSV, .xlsx, or .qif file)
      - include_debits    (optional bool, default false — also reconcile
                            withdrawals/disbursements/charges, not just
                            incoming payments)

    Workflow:
      1. Parse the file (format chosen by extension: CSV, Excel, or QIF)
      2. Store parsed lines into ReconciliationBankTransaction, deduped by bank_ref
         (Django owns this storage — Bank-Recon/Java has no database)
      3. Group parsed transactions by their own value_date — a statement
         commonly spans more than one day (e.g. a weekly export) — and
         create one DailyReconciliation (status='processing') per distinct
         date found, enqueuing banks.tasks.run_reconciliation_match for
         each. Dates that already have a reconciliation for this account
         are skipped rather than failing the whole upload.

    Returns 202 immediately — each reconciliation's matching call can take
    up to ~90 seconds, so it must not block this request. The frontend
    polls GET /api/banks/reconciliations/<pk>/ for each result.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        bank_account_id = request.data.get('bank_account_id')
        statement_file  = request.FILES.get('statement_file')
        # Debit-side reconciliation (withdrawals, disbursements, bank charges)
        # is opt-in — most reconciliations only care about incoming payments.
        include_debits = str(request.data.get('include_debits', '')).strip().lower() in ('1', 'true', 'yes', 'on')

        # --- basic validation ---
        if not bank_account_id:
            return Response({'detail': 'bank_account_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if not statement_file:
            return Response({'detail': 'statement_file is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            bank_account = BankAccount.objects.get(pk=bank_account_id)
        except BankAccount.DoesNotExist:
            return Response({'detail': 'Bank account not found.'}, status=status.HTTP_404_NOT_FOUND)

        # --- parse statement file (CSV / Excel / QIF, by extension) ---
        try:
            parsed_transactions = parse_statement_file(
                statement_file,
                filename=statement_file.name,
                account_number=bank_account.account_number,
            )
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        if not parsed_transactions:
            return Response({'detail': 'No transactions found in the uploaded file.'}, status=status.HTTP_400_BAD_REQUEST)

        # --- store parsed lines, deduped by (bank_account, bank_ref) ---
        for t in parsed_transactions:
            ReconciliationBankTransaction.objects.get_or_create(
                bank_account=bank_account,
                bank_ref=t.bank_ref,
                defaults={
                    'value_date': t.value_date,
                    'direction': t.direction,
                    'amount': Decimal(t.amount),
                    'narration': t.narration,
                    'balance_after': Decimal(t.balance_after) if t.balance_after else None,
                },
            )

        # --- one DailyReconciliation per distinct date actually present in
        # the file — the whole point is the caller shouldn't have to know
        # or care whether this statement covers one day or thirty. A date
        # that already has a reconciliation is re-run (not skipped) — a
        # reconciled day is never really "closed": postings lag, and late-
        # arriving transactions must still be matchable against it. Only a
        # date whose reconciliation is *currently in flight* is skipped, to
        # avoid a racing duplicate task. ---
        dates = sorted({t.value_date for t in parsed_transactions})

        created = []
        rerun = []
        skipped_dates = []
        for d in dates:
            # .for_user(), not a plain .filter() — OwnerBranchManager's
            # default queryset relies on a thread-local tenant set by
            # middleware, which isn't reliably populated in time for a
            # DRF-authenticated request (see for_user()'s own docstring).
            # A plain .filter() here would risk not finding an existing
            # reconciliation and creating a duplicate instead of re-running it.
            existing = DailyReconciliation.objects.for_user(request.user).filter(
                bank_account=bank_account, reconciliation_date=d,
            ).first()

            candidates = list(ReconciliationBankTransaction.objects.filter(
                bank_account=bank_account,
                value_date=d,
                matched=False,
            ))

            # The same uploaded file is attached to every reconciliation
            # created from it; its stream must be rewound before each save
            # or every FileField after the first ends up empty.
            statement_file.seek(0)

            if existing is None:
                recon = DailyReconciliation.objects.create(
                    bank_account=bank_account,
                    reconciliation_date=d,
                    uploaded_by=request.user,
                    statement_file=statement_file,
                    status='processing',
                    total_bank_transactions=len(candidates),
                    owner=request.user,
                    branch=getattr(request.user, 'branch', None),
                    # Explicit, not left to TimeStampedModel.save()'s
                    # thread-local fallback — that fallback only fills in
                    # when the middleware-set thread-local happens to be
                    # populated in time, which isn't reliable for a
                    # DRF-authenticated request. An unset tenant here would
                    # make this row invisible to every tenant-scoped query
                    # (including the list/detail views) forever.
                    tenant=getattr(request.user, 'tenant', None),
                )
                run_reconciliation_match.delay(recon.id, include_debits)
                created.append(recon)
            elif existing.status == 'processing':
                skipped_dates.append(str(d))
            else:
                existing.uploaded_by = request.user
                existing.statement_file = statement_file
                existing.status = 'processing'
                existing.total_bank_transactions = len(candidates)
                existing.rerun_count = F('rerun_count') + 1
                existing.save(update_fields=[
                    'uploaded_by', 'statement_file', 'status',
                    'total_bank_transactions', 'rerun_count', 'updated_at',
                ])
                run_reconciliation_match.delay(existing.id, include_debits)
                existing.refresh_from_db()
                rerun.append(existing)

        if not created and not rerun:
            return Response(
                {'detail': 'Every date in this statement is currently being reconciled — try again shortly.',
                 'skipped_dates': skipped_dates},
                status=status.HTTP_409_CONFLICT,
            )

        return Response(
            {
                'reconciliations': DailyReconciliationSerializer(created, many=True).data,
                'reconciliations_rerun': DailyReconciliationSerializer(rerun, many=True).data,
                'skipped_dates': skipped_dates,
            },
            status=status.HTTP_202_ACCEPTED,
        )


class DailyReconciliationListView(APIView):
    """
    GET /api/banks/reconciliations/
    List daily reconciliations visible to the authenticated user — their own
    branch, or every branch for a director/global-scope role (DailyReconciliation
    .objects.for_user() already handles that bypass; a hard branch= filter
    here would incorrectly block a director from seeing other branches).
    """
    permission_classes = [permissions.IsAuthenticated]
    permission_module = 'banks'
    permission_page = 'bank-reconciliation-exceptions'

    def get(self, request):
        qs = DailyReconciliation.objects.for_user(request.user).select_related(
            'bank_account', 'uploaded_by', 'branch'
        ).order_by('-reconciliation_date')

        bank_account_id = request.query_params.get('bank_account')
        if bank_account_id:
            qs = qs.filter(bank_account_id=bank_account_id)

        reconciliation_status = request.query_params.get('status')
        if reconciliation_status:
            qs = qs.filter(status=reconciliation_status)

        branch_id = request.query_params.get('branch')
        if branch_id:
            qs = qs.filter(branch_id=branch_id)

        serializer = DailyReconciliationListSerializer(qs, many=True)
        return Response(serializer.data)


class DailyReconciliationDetailView(APIView):
    """
    GET /api/banks/reconciliations/<pk>/
    Retrieve a single reconciliation with all its exceptions.
    """
    permission_classes = [permissions.IsAuthenticated]
    permission_module = 'banks'
    permission_page = 'bank-reconciliation-exceptions'

    def get(self, request, pk):
        recon = get_object_or_404(DailyReconciliation.objects.for_user(request.user), pk=pk)
        serializer = DailyReconciliationSerializer(recon)
        return Response(serializer.data)


class RerunReconciliationView(APIView):
    """
    POST /api/banks/reconciliations/<pk>/rerun/

    Re-trigger matching for an existing reconciliation with no new file —
    useful right after a director resolves exceptions, or when new ERP
    entries land with no accompanying new statement. Reuses the currently
    stored (and possibly since-grown) ReconciliationBankTransaction pool.
    """
    permission_classes = [permissions.IsAuthenticated]
    permission_module = 'banks'
    permission_page = 'bank-reconciliation-exceptions'

    def post(self, request, pk):
        recon = get_object_or_404(DailyReconciliation.objects.for_user(request.user), pk=pk)

        if recon.status == 'processing':
            return Response(
                {'detail': 'This reconciliation is currently being matched — try again shortly.'},
                status=status.HTTP_409_CONFLICT,
            )

        include_debits = str(request.data.get('include_debits', '')).strip().lower() in ('1', 'true', 'yes', 'on')

        recon.status = 'processing'
        recon.rerun_count = F('rerun_count') + 1
        recon.save(update_fields=['status', 'rerun_count', 'updated_at'])
        run_reconciliation_match.delay(recon.id, include_debits)
        recon.refresh_from_db()

        serializer = DailyReconciliationSerializer(recon)
        return Response(serializer.data, status=status.HTTP_202_ACCEPTED)


class ResolveExceptionView(APIView):
    """
    PATCH /api/banks/reconciliations/<recon_pk>/exceptions/<exc_pk>/resolve/

    Only directors may resolve a reconciliation exception — branch managers
    and credit officers handle the cash/loan repayments being reconciled
    here, so they're exactly who this control exists to check; only a
    director is trusted to close one out. Everyone with visibility into the
    reconciliation can still see the exception, just not resolve it.
    Request body:
      resolution_notes  (optional str)
    """
    permission_classes = [permissions.IsAuthenticated]
    permission_module = 'banks'
    permission_page = 'bank-reconciliation-exceptions'

    def patch(self, request, recon_pk, exc_pk):
        recon = get_object_or_404(DailyReconciliation.objects.for_user(request.user), pk=recon_pk)

        if not can_user_approve(request.user, module=self.permission_module, page=self.permission_page):
            return Response(
                {'detail': 'Only directors may resolve reconciliation exceptions.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        exc_obj = get_object_or_404(ReconciliationException, pk=exc_pk, reconciliation=recon)

        if exc_obj.resolved:
            return Response({'detail': 'Exception is already resolved.'}, status=status.HTTP_400_BAD_REQUEST)

        exc_obj.resolved         = True
        exc_obj.resolved_by      = request.user
        exc_obj.resolved_at      = tz.now()
        exc_obj.resolution_notes = request.data.get('resolution_notes', '')
        exc_obj.save(update_fields=['resolved', 'resolved_by', 'resolved_at', 'resolution_notes'])

        serializer = ReconciliationExceptionSerializer(exc_obj)
        return Response(serializer.data)
