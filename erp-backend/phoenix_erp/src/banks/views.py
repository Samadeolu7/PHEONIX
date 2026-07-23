# banks/views.py
"""
Views for Bank Management System
Provides CRUD operations and workflow management for banks and transfers
"""
from rest_framework import viewsets, status, permissions, generics
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from django.db.models import Q, Sum, Count, F, Avg
from django.utils import timezone
from django.shortcuts import get_object_or_404
from decimal import Decimal
import logging

from common.views import ScopedModelViewSet
from common.approval_permissions import IsApprover, can_user_approve, can_user_edit
from .models import Bank, BankAccount, BankTransfer, BankPayment
from .services import (
    check_transfer_approval_permission,
    check_exception_resolution_authority,
    resolve_exception_first,
    check_exception_second_resolution_authority,
    resolve_exception_second,
)
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

        # Maker-checker: a payment created via ResolveExceptionToExpenseView
        # (banks/views.py) — identifiable by pending_exception_resolutions —
        # can't be approved by the same person who drafted it. Scoped to this
        # origin only, not every BankPayment, since self-approval isn't
        # guarded anywhere else in this viewset today (e.g. ordinary
        # supplier/AP payments) and changing that wasn't asked for.
        if payment.pending_exception_resolutions.exists() and payment.created_by_id == request.user.id:
            return Response(
                {'error': 'You created this payment — a different director must approve it.'},
                status=status.HTTP_403_FORBIDDEN,
            )

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

    def _get_transfer_scope(self):
        """Return the effective scope for bank transfers from PermissionResolver.

        Scope controls which transfers a user sees:
        - ``global``            → all transfers across all branches
        - ``own_branch``        → all transfers in the user's branch (branch
          filtering is handled upstream by ``for_user()``)
        - ``assigned_clients``  → only transfers the user initiated or where
          they are the destination cashier
        - ``own_records``       → only transfers the user initiated
        """
        from permissions.services import PermissionResolver, SCOPE_GLOBAL, SCOPE_OWN_BRANCH
        user = self.request.user
        if self._is_elevated_user(user):
            return SCOPE_GLOBAL
        eff = PermissionResolver.resolve(user, module='banks', page='bank-transfers')
        return eff.scope

    def get_queryset(self):
        """Filter transfers by various criteria"""
        queryset = super().get_queryset()

        # Scope-based filtering: transfer managers see data per their scope,
        # non-managers see only their own initiated + destination transfers.
        scope = self._get_transfer_scope()

        if scope == 'global':
            # Elevated users / global scope — see everything (branch override
            # via X-Branch-ID is handled by _apply_director_branch_override).
            pass
        elif scope == 'own_branch':
            # Branch-scoped — for_user() already filtered to this branch.
            # If the user is NOT a transfer manager, further narrow to own.
            if not self._is_transfer_manager():
                queryset = queryset.filter(
                    Q(initiated_by=self.request.user) |
                    Q(destination_cashier_account__cashier=self.request.user)
                )
        elif scope == 'assigned_clients':
            # Credit-officer style — only transfers linked to this user.
            queryset = queryset.filter(
                Q(initiated_by=self.request.user) |
                Q(destination_cashier_account__cashier=self.request.user)
            )
        elif scope == 'own_records':
            # Strictest — only transfers the user initiated.
            queryset = queryset.filter(initiated_by=self.request.user)
        else:
            # Unknown scope — fall back to own-transfers-only.
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
        this transfer, or None if they may. See
        banks.services.check_transfer_approval_permission for the business
        rules this delegates to.
        """
        error_message = check_transfer_approval_permission(
            transfer, request.user, allow_bank_to_cashier=allow_bank_to_cashier
        )
        if error_message:
            return Response({'error': error_message}, status=status.HTTP_403_FORBIDDEN)
        return None

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
    ReconciliationBankTransactionSerializer,
)
from .tasks import run_pool_reconciliation_match


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
         date found, then enqueue a single
         banks.tasks.run_pool_reconciliation_match for the whole upload
         (scoped to this bank_account). Dates that already have a
         reconciliation for this account are skipped rather than failing
         the whole upload.

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

        from .reconciliation_utils import ingest_reconciliation_transactions
        created, rerun, skipped_dates = ingest_reconciliation_transactions(
            bank_account, statement_file, parsed_transactions,
            include_debits=include_debits, user=request.user,
        )

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


class MatchedTransactionsView(APIView):
    """
    GET /api/banks/reconciliations/<recon_pk>/transactions/

    Every bank-statement line ingested for this reconciliation's bank
    account/date — matched and unmatched alike. Before this endpoint
    existed, the only visibility into a reconciliation was its exceptions
    list, so a cleanly-matched transfer (the common case — see the
    fetch_erp_payments/ReconciliationBankTransaction investigation that
    prompted this) was invisible everywhere in the product even though
    ReconciliationBankTransaction has tracked matched/matched_erp_payment_id
    from the start.

    ReconciliationBankTransaction has no FK to DailyReconciliation — it's a
    persistent pool per bank_account, deduplicated by bank_ref and reused
    across reruns and the ±window matching used by
    run_pool_reconciliation_match (see banks/tasks.py) — so rows are looked
    up by (bank_account,
    value_date) rather than by reconciliation id, matching exactly what a
    statement upload for this reconciliation's date would have populated.

    Query params:
      matched — 'true' | 'false' | omit for all
    """
    permission_classes = [permissions.IsAuthenticated]
    permission_module = 'banks'
    permission_page = 'bank-reconciliation-exceptions'

    def get(self, request, recon_pk):
        recon = get_object_or_404(DailyReconciliation.objects.for_user(request.user), pk=recon_pk)

        base_qs = ReconciliationBankTransaction.objects.filter(
            bank_account=recon.bank_account,
            value_date=recon.reconciliation_date,
        )

        qs = base_qs
        matched_param = request.query_params.get('matched')
        if matched_param is not None:
            qs = qs.filter(matched=matched_param.strip().lower() == 'true')

        transactions = list(
            qs.select_related('matched_erp_officer', 'unmatched_by').order_by('-matched', '-amount')
        )

        # matched_erp_payment_id is a plain int (Java's match response only
        # names an id, not the transaction), so the ERP-side narration/date
        # can't be resolved via select_related — batch-fetch and stash.
        payment_ids = [tx.matched_erp_payment_id for tx in transactions if tx.matched_erp_payment_id]
        if payment_ids:
            from transactions.models import Transaction
            txn_by_id = {
                t.id: t for t in Transaction.objects.filter(id__in=payment_ids).only('id', 'description', 'date')
            }
            for tx in transactions:
                erp_txn = txn_by_id.get(tx.matched_erp_payment_id)
                if erp_txn:
                    tx._erp_transaction_description = erp_txn.description
                    tx._erp_transaction_date = erp_txn.date

        serializer = ReconciliationBankTransactionSerializer(transactions, many=True)
        return Response({
            'results': serializer.data,
            'matched_count': base_qs.filter(matched=True).count(),
            'unmatched_count': base_qs.filter(matched=False).count(),
        })


class UnmatchTransactionView(APIView):
    """
    POST /api/banks/reconciliations/<recon_pk>/transactions/<tx_id>/unmatch/

    Manually undo an incorrect auto-match so a genuinely outstanding
    transaction (e.g. a default hiding behind a bad match) becomes visible
    again, instead of looking reconciled. Director-only, no branch-manager
    fallback — deliberately stricter than exception resolution, since this
    reopens something the matcher already closed. Never touches the
    underlying GL Transaction/TransactionEntry — see
    ReconciliationBankTransaction.unmatch() for what actually changes.

    Request body:
      reason  (str, required)
    """
    permission_classes = [permissions.IsAuthenticated]
    permission_module = 'banks'
    permission_page = 'bank-reconciliation-exceptions'

    def post(self, request, recon_pk, tx_id):
        recon = get_object_or_404(DailyReconciliation.objects.for_user(request.user), pk=recon_pk)

        if not can_user_approve(request.user, module=self.permission_module, page=self.permission_page):
            return Response(
                {'detail': 'Only directors may unmatch a reconciliation transaction.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        tx = get_object_or_404(
            ReconciliationBankTransaction,
            pk=tx_id, bank_account=recon.bank_account, value_date=recon.reconciliation_date,
        )

        reason = request.data.get('reason', '')
        try:
            tx.unmatch(request.user, reason)
        except Exception as exc:
            return Response({'detail': _error_message(exc)}, status=status.HTTP_400_BAD_REQUEST)

        serializer = ReconciliationBankTransactionSerializer(tx)
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
        recon.include_debits = include_debits
        recon.rerun_count = F('rerun_count') + 1
        recon.save(update_fields=['status', 'include_debits', 'rerun_count', 'updated_at'])
        run_pool_reconciliation_match.delay(recon.bank_account_id)
        recon.refresh_from_db()

        serializer = DailyReconciliationSerializer(recon)
        return Response(serializer.data, status=status.HTTP_202_ACCEPTED)


class BulkRerunReconciliationView(APIView):
    """
    POST /api/banks/reconciliations/bulk-rerun/

    Re-trigger matching for ALL reconciliations that are not currently
    processing — picks up newly approved/posted ERP payments (expenses,
    disbursements, bank charges) across all days and bank accounts so
    they can be auto-matched and linked.

    Request body:
      include_debits  (bool, optional) — also match DEBIT-direction ERP
                        payments (default: false, only CREDIT)
      bank_account_id (int, optional) — limit to a single bank account
      date_from       (str, optional) — YYYY-MM-DD, only re-run from this date
      date_to         (str, optional) — YYYY-MM-DD, only re-run up to this date
    """
    permission_classes = [permissions.IsAuthenticated]
    permission_module = 'banks'
    permission_page = 'bank-reconciliation-exceptions'

    def post(self, request):
        include_debits = str(request.data.get('include_debits', '')).strip().lower() in ('1', 'true', 'yes', 'on')
        bank_account_id = request.data.get('bank_account_id')
        date_from = request.data.get('date_from')
        date_to = request.data.get('date_to')

        qs = DailyReconciliation.objects.for_user(request.user).exclude(status='processing')

        if bank_account_id:
            qs = qs.filter(bank_account_id=bank_account_id)
        if date_from:
            qs = qs.filter(reconciliation_date__gte=date_from)
        if date_to:
            qs = qs.filter(reconciliation_date__lte=date_to)

        queued = []
        skipped = []
        touched_bank_account_ids = set()

        for recon in qs.select_related('bank_account').order_by('reconciliation_date'):
            if recon.status == 'processing':
                skipped.append({
                    'id': recon.id,
                    'bank_account': recon.bank_account_id,
                    'date': str(recon.reconciliation_date),
                    'reason': 'already processing',
                })
                continue

            recon.status = 'processing'
            recon.include_debits = include_debits
            recon.rerun_count = F('rerun_count') + 1
            recon.save(update_fields=['status', 'include_debits', 'rerun_count', 'updated_at'])
            recon.refresh_from_db()
            touched_bank_account_ids.add(recon.bank_account_id)

            queued.append({
                'id': recon.id,
                'bank_account': recon.bank_account_id,
                'date': str(recon.reconciliation_date),
                'rerun_count': recon.rerun_count,
            })

        # One pool task per distinct bank_account touched by this request,
        # not one per row — a "rerun everything for account X" request used
        # to fire N per-date tasks that all raced each other over the same
        # account's candidate pool; run_pool_reconciliation_match re-queries
        # which rows are actually processing once it holds that account's
        # lock, so a single dispatch per account picks all of them up.
        for bank_account_id in touched_bank_account_ids:
            run_pool_reconciliation_match.delay(bank_account_id)

        return Response({
            'queued': len(queued),
            'skipped': len(skipped),
            'details': queued + skipped,
        }, status=status.HTTP_202_ACCEPTED)


class ResolveExceptionView(APIView):
    """
    PATCH /api/banks/reconciliations/<recon_pk>/exceptions/<exc_pk>/resolve/

    Resolution authority is tiered by amount match, not a flat director-only
    gate:
      - Perfect match (bank_amount == erp_amount exactly): a branch manager
        (can_edit on this page) or a director (can_approve) may resolve it.
      - Any amount mismatch — including bank_only/erp_only exceptions, which
        have no counterpart amount at all — requires director approval
        (can_approve), and resolution_notes is mandatory so there's a paper
        trail explaining the discrepancy. There is no upper bound on the
        mismatch a director may resolve; the tolerance only controls whether
        notes are required, not whether resolution is blocked.
    Everyone with visibility into the reconciliation can still see the
    exception, just not necessarily resolve it.

    A single director resolving an exception was previously sufficient
    regardless of amount — a director could clear an arbitrarily large
    erp_only/bank_only/amount_diff discrepancy with nothing but a one-line
    note. See ReconciliationException.requires_dual_approval_to_resolve:
    at/above RECONCILIATION_EXCEPTION_DUAL_APPROVAL_THRESHOLD (excluding
    perfect matches, which stay branch-manager-resolvable as before), this
    endpoint now only records the FIRST director's action and leaves
    `resolved` False — SecondResolveExceptionView (below) is where a
    second, different director actually closes it out.

    Request body:
      resolution_notes  (str; required unless the exception is a perfect match)
    """
    permission_classes = [permissions.IsAuthenticated]
    permission_module = 'banks'
    permission_page = 'bank-reconciliation-exceptions'

    def patch(self, request, recon_pk, exc_pk):
        recon = get_object_or_404(DailyReconciliation.objects.for_user(request.user), pk=recon_pk)
        exc_obj = get_object_or_404(ReconciliationException, pk=exc_pk, reconciliation=recon)

        if exc_obj.resolved:
            return Response({'detail': 'Exception is already resolved.'}, status=status.HTTP_400_BAD_REQUEST)
        if exc_obj.pending_bank_payment_id:
            return Response(
                {'detail': f'A payment is already pending for this exception '
                           f'({exc_obj.pending_bank_payment.payment_number}) — it will resolve '
                           f'automatically once that payment is approved and matched.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        error_message = check_exception_resolution_authority(exc_obj, request.user)
        if error_message:
            return Response({'detail': error_message}, status=status.HTTP_403_FORBIDDEN)

        resolution_notes = request.data.get('resolution_notes', '')
        if not exc_obj.is_perfect_match:
            from .reconciliation_utils import reason_too_short, MIN_REASON_LENGTH
            if reason_too_short(resolution_notes):
                return Response(
                    {'detail': f'resolution_notes is required (at least {MIN_REASON_LENGTH} characters) '
                               f'to resolve an exception with an amount mismatch.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        fully_resolved = resolve_exception_first(exc_obj, request.user, resolution_notes)

        serializer = ReconciliationExceptionSerializer(exc_obj)
        if not fully_resolved:
            return Response(serializer.data, status=status.HTTP_202_ACCEPTED)
        return Response(serializer.data)


class SecondResolveExceptionView(APIView):
    """
    PATCH /api/banks/reconciliations/<recon_pk>/exceptions/<exc_pk>/resolve/second/

    The confirming half of dual-approval resolution — see
    ReconciliationException.requires_dual_approval_to_resolve and
    ResolveExceptionView's docstring. Only reachable once a first director
    has already acted (resolved_by set, resolved still False) on an
    exception at/above the dual-approval threshold. Director-only, must be
    a different director from the first (mirrors BankTransfer.second_
    approve's identical same-approver guard), mandatory reason.

    Request body:
      resolution_notes  (str, required)
    """
    permission_classes = [permissions.IsAuthenticated]
    permission_module = 'banks'
    permission_page = 'bank-reconciliation-exceptions'

    def patch(self, request, recon_pk, exc_pk):
        recon = get_object_or_404(DailyReconciliation.objects.for_user(request.user), pk=recon_pk)
        exc_obj = get_object_or_404(ReconciliationException, pk=exc_pk, reconciliation=recon)

        if exc_obj.resolved:
            return Response({'detail': 'Exception is already resolved.'}, status=status.HTTP_400_BAD_REQUEST)
        if not exc_obj.resolved_by_id:
            return Response(
                {'detail': 'This exception has not been through a first resolution yet.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not exc_obj.requires_dual_approval_to_resolve:
            return Response(
                {'detail': 'This exception does not require a second approval.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        error_message = check_exception_second_resolution_authority(exc_obj, request.user)
        if error_message:
            return Response({'detail': error_message}, status=status.HTTP_403_FORBIDDEN)

        from .reconciliation_utils import reason_too_short, MIN_REASON_LENGTH
        resolution_notes = request.data.get('resolution_notes', '')
        if reason_too_short(resolution_notes):
            return Response(
                {'detail': f'resolution_notes is required (at least {MIN_REASON_LENGTH} characters) '
                           f'for the second approval.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        resolve_exception_second(exc_obj, request.user, resolution_notes)

        serializer = ReconciliationExceptionSerializer(exc_obj)
        return Response(serializer.data)


class ResolveExceptionToExpenseView(APIView):
    """
    POST /api/banks/reconciliations/<recon_pk>/exceptions/<exc_pk>/resolve-to-expense/

    Creates a draft Expense + pending BankPayment for a bank-only DEBIT
    exception (e.g. stamp duty, bank charges — money that left the account
    with no ERP record) so it can go through the normal expense approval
    workflow and post to the GL. Does NOT resolve the exception itself —
    that happens automatically once the payment is approved and posted
    (BankPaymentViewSet.approve, unchanged, director-only) and a later
    reconciliation rerun matches the new GL entry against this bank line,
    via the existing auto-resolve step in _persist_outcome (banks/tasks.py).

    Branch manager or director may initiate (can_user_edit OR can_user_approve)
    — the real control point is the separate approval step above, which is
    what actually moves money/posts the GL entry. No system-enforced amount
    cap; the approval step is the safeguard.

    Amount/date/description are taken directly from the exception's bank-side
    fields and are not user-editable, so the eventual auto-resolve match
    lines up exactly with what the bank statement shows.

    Request body:
      category     (int, required) — ExpenseCategory id
      payee_name   (str, optional)
      description  (str, optional) — defaults to the exception's bank_narration
    """
    permission_classes = [permissions.IsAuthenticated]
    permission_module = 'banks'
    permission_page = 'bank-reconciliation-exceptions'

    def post(self, request, recon_pk, exc_pk):
        recon = get_object_or_404(DailyReconciliation.objects.for_user(request.user), pk=recon_pk)
        exc_obj = get_object_or_404(ReconciliationException, pk=exc_pk, reconciliation=recon)

        allowed = (
            can_user_edit(request.user, module=self.permission_module, page=self.permission_page)
            or can_user_approve(request.user, module=self.permission_module, page=self.permission_page)
        )
        if not allowed:
            return Response(
                {'detail': 'Only branch managers or directors may post an exception to expense.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        if exc_obj.exception_type != 'bank_only' or exc_obj.direction != 'DEBIT':
            return Response(
                {'detail': 'Only a bank-only debit exception can be posted to expense.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if exc_obj.resolved:
            return Response({'detail': 'Exception is already resolved.'}, status=status.HTTP_400_BAD_REQUEST)
        if exc_obj.pending_bank_payment_id:
            return Response(
                {'detail': f'A payment is already pending for this exception '
                           f'({exc_obj.pending_bank_payment.payment_number}).'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        category_id = request.data.get('category')
        if not category_id:
            return Response({'detail': 'category is required.'}, status=status.HTTP_400_BAD_REQUEST)

        # The bank's own reference (not exc_obj.bank_transaction_id, which is
        # Java's internal UUID for the line, nor bank_narration, which is
        # free text) lives on the ReconciliationBankTransaction row that id
        # points to — see its bank_ref field. Carried onto BankPayment.
        # reference_number (the field meant for "bank slip, invoice ref,
        # etc.") so it survives approval; Expense.payment_reference is
        # deliberately NOT relied on for this — BankPayment.post_payment()
        # overwrites it with the internal BPM-XXXX number at posting time
        # regardless of what's set here, so it's only ever a transient
        # pre-approval value, not where this should permanently live.
        bank_ref = ''
        if exc_obj.bank_transaction_id:
            bank_tx = ReconciliationBankTransaction.objects.filter(
                pk=exc_obj.bank_transaction_id
            ).only('bank_ref').first()
            if bank_tx:
                bank_ref = bank_tx.bank_ref

        from expenses.serializers import ExpenseSerializer

        expense_serializer = ExpenseSerializer(
            data={
                'category': category_id,
                'expense_date': exc_obj.bank_date,
                'description': request.data.get('description') or exc_obj.bank_narration or 'Bank charge',
                'amount': exc_obj.bank_amount,
                'payee_name': request.data.get('payee_name', ''),
                'payment_method': 'bank_transfer',
                'payment_reference': bank_ref,
                'bank_account': recon.bank_account_id,
            },
            context={'request': request},
        )
        try:
            expense_serializer.is_valid(raise_exception=True)
        except Exception as exc:
            return Response({'detail': _error_message(exc)}, status=status.HTTP_400_BAD_REQUEST)
        # tenant=recon.tenant explicitly — TimeStampedModel.save()'s thread-
        # local fallback isn't reliably populated in time for a DRF-
        # authenticated request (the exact bug already hit once for
        # DailyReconciliation.tenant — see test_uploaded_reconciliation_
        # has_tenant_set_and_is_listable). Leaving it unset here would
        # silently produce a BankPayment/Expense invisible to their own
        # tenant-scoped viewsets, including the approver's own request.
        expense = expense_serializer.save(tenant=recon.tenant)

        # branch=recon.branch (not request.user.branch) — this payment
        # belongs to the bank account being reconciled, which may differ
        # from an elevated (cross-branch) director's own branch. owner is
        # the acting user, matching BankPaymentViewSet.perform_create.
        payment = BankPayment.objects.create(
            bank_account=recon.bank_account,
            amount=exc_obj.bank_amount,
            description=expense.description,
            reference_number=bank_ref,
            payment_date=exc_obj.bank_date,
            expense=expense,
            status='pending',
            owner=request.user,
            branch=recon.branch,
            tenant=recon.tenant,
            created_by=request.user,
        )

        exc_obj.pending_bank_payment = payment
        exc_obj.save(update_fields=['pending_bank_payment'])

        serializer = ReconciliationExceptionSerializer(exc_obj)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class LinkCandidatesView(generics.ListAPIView):
    """
    GET /api/banks/exceptions/<exc_id>/link-candidates/

    Valid partners for manually linking against the given exception — either
    via LinkResolveExceptionsView (exact amount match) or, for a DEBIT
    bank_only/erp_only pair, LinkResolveBankChargeView (bank_only up to
    FEE_LINK_MAX_AMOUNT higher than erp_only — a bank-deducted transfer fee
    never recorded in the ERP). See is_valid_exception_pairing and
    bank_charge_fee (banks/reconciliation_utils.py) for the exact rules this
    encodes: bank_only+bank_only (opposite direction — a compensating
    transfer), bank_only+erp_only same direction+exact amount (missed
    auto-match), or bank_only+erp_only same DEBIT direction+bank_only up to
    FEE_LINK_MAX_AMOUNT higher (bank charge). erp_only+erp_only and
    amount_diff are never returned. Same bank account, unresolved, any
    reconciliation date — candidates can span dates, so this isn't nested
    under a single DailyReconciliation. The frontend distinguishes exact vs.
    fee candidates itself by comparing amounts (both bank_amount and
    erp_amount are always serialized) and calls the matching endpoint.
    """
    serializer_class = ReconciliationExceptionSerializer
    permission_classes = [permissions.IsAuthenticated]
    permission_module = 'banks'
    permission_page = 'bank-reconciliation-exceptions'

    def get_queryset(self):
        source = get_object_or_404(
            ReconciliationException.objects.filter(
                reconciliation__in=DailyReconciliation.objects.for_user(self.request.user),
            ),
            pk=self.kwargs['exc_id'],
        )

        amount = source.resolve_amount
        if amount is None or source.exception_type not in ('bank_only', 'erp_only'):
            return ReconciliationException.objects.none()

        # NOT filtered to the source's own bank account here — the
        # opposite-direction erp_only branch below may span accounts (the
        # phantom inter-bank transfer case). Every other branch re-applies
        # the same-account restriction itself.
        qs = ReconciliationException.objects.filter(
            reconciliation__in=DailyReconciliation.objects.for_user(self.request.user),
            resolved=False,
        ).exclude(pk=source.pk).select_related('reconciliation', 'reconciliation__bank_account')

        from .reconciliation_utils import FEE_LINK_MAX_AMOUNT

        same_account = Q(reconciliation__bank_account_id=source.reconciliation.bank_account_id)

        if source.exception_type == 'bank_only':
            opposite = 'DEBIT' if source.direction == 'CREDIT' else 'CREDIT'
            same_direction_erp_only = same_account & Q(exception_type='erp_only', direction=source.direction)
            if source.direction == 'DEBIT':
                # Widened from exact match to include the bank-charge-fee
                # case: erp_only amount up to FEE_LINK_MAX_AMOUNT lower than
                # this bank_only exception's amount.
                same_direction_erp_only &= Q(
                    erp_amount__lte=amount, erp_amount__gte=amount - FEE_LINK_MAX_AMOUNT,
                )
            else:
                same_direction_erp_only &= Q(erp_amount=amount)
            qs = qs.filter(
                (same_account & Q(exception_type='bank_only', direction=opposite, bank_amount=amount))
                | same_direction_erp_only
            )
        else:  # erp_only — a same-direction bank_only, or an opposite-direction erp_only
            opposite = 'DEBIT' if source.direction == 'CREDIT' else 'CREDIT'
            bank_only_same_direction = same_account & Q(
                exception_type='bank_only', direction=source.direction,
            )
            if source.direction == 'DEBIT':
                bank_only_same_direction &= Q(
                    bank_amount__gte=amount, bank_amount__lte=amount + FEE_LINK_MAX_AMOUNT,
                )
            else:
                bank_only_same_direction &= Q(bank_amount=amount)
            # Opposite-direction erp_only candidates deliberately span ALL
            # the user's visible bank accounts, not just the source's own:
            # same-account is the internal-movement case (petty-cash relink
            # netting to zero on one GL), cross-account is the phantom
            # inter-bank transfer case (recorded transfer neither of whose
            # legs reached its bank — link-resolving that pair also posts
            # counter entries; see LinkResolveExceptionsView).
            qs = qs.filter(
                bank_only_same_direction
                | Q(exception_type='erp_only', direction=opposite, erp_amount=amount)
            )

        return qs.order_by('-is_high_priority', '-created_at')


class LinkResolveExceptionsView(APIView):
    """
    POST /api/banks/exceptions/link-resolve/

    Manually link two exceptions on the same bank account together and
    resolve both at once. Three cases (see is_valid_exception_pairing,
    banks/reconciliation_utils.py):
      - bank_only + bank_only, opposite direction — a compensating-transfer
        scenario (money went to the wrong bank, then a manual transfer
        brought it back).
      - bank_only + erp_only, same direction — the bank line and the ERP
        payment plausibly failed to auto-match on reference/narration and
        are actually the same real transaction.
      - erp_only + erp_only, opposite direction — an internal ERP movement
        (e.g. a petty-cash relink) whose two legs net to zero against the
        bank GL, with no bank statement line ever expected for either.
    Either pair may span different reconciliation dates on the same
    account, so this isn't nested under a single DailyReconciliation.
    Director-only, exact amount match only (no tolerance) — linking two
    unrelated-looking anomalies together is at least as sensitive a
    judgment call as resolving a genuine amount mismatch, which already
    requires director sign-off.

    Request body:
      exception_a_id, exception_b_id  (int, required)
      resolution_notes                 (str, required)
    """
    permission_classes = [permissions.IsAuthenticated]
    permission_module = 'banks'
    permission_page = 'bank-reconciliation-exceptions'

    def post(self, request):
        if not can_user_approve(request.user, module=self.permission_module, page=self.permission_page):
            return Response(
                {'detail': 'Only directors may link two reconciliation exceptions together.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        from .reconciliation_utils import is_valid_exception_pairing, reason_too_short, MIN_REASON_LENGTH

        resolution_notes = request.data.get('resolution_notes', '')
        if reason_too_short(resolution_notes):
            return Response(
                {'detail': f'resolution_notes is required (at least {MIN_REASON_LENGTH} characters) '
                           f'to link two exceptions together.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        a_id = request.data.get('exception_a_id')
        b_id = request.data.get('exception_b_id')
        if not a_id or not b_id or a_id == b_id:
            return Response(
                {'detail': 'exception_a_id and exception_b_id are required and must differ.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        qs = ReconciliationException.objects.filter(
            reconciliation__in=DailyReconciliation.objects.for_user(request.user)
        ).select_related('reconciliation')
        exc_a = get_object_or_404(qs, pk=a_id)
        exc_b = get_object_or_404(qs, pk=b_id)

        for exc in (exc_a, exc_b):
            if exc.resolved:
                return Response(
                    {'detail': 'Exception is already resolved.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        both_erp_only = {exc_a.exception_type, exc_b.exception_type} == {'erp_only'}
        cross_account = exc_a.reconciliation.bank_account_id != exc_b.reconciliation.bank_account_id
        if cross_account and not both_erp_only:
            # Only the phantom-transfer pair below may span accounts — a
            # bank_only line always belongs to exactly one real statement.
            return Response(
                {'detail': 'Both exceptions must belong to the same bank account.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not is_valid_exception_pairing(exc_a, exc_b):
            return Response(
                {'detail': 'These two exceptions cannot be linked — two bank_only exceptions '
                           'with opposite directions (a compensating transfer), a bank_only and an '
                           'erp_only exception with the same direction (a missed auto-match), or two '
                           'erp_only exceptions with opposite directions (an internal ERP movement '
                           'that nets to zero with no bank line).'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if exc_a.resolve_amount != exc_b.resolve_amount:
            return Response(
                {'detail': 'The two exceptions must have exactly the same amount to be linked.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        now = tz.now()
        from django.core.exceptions import ValidationError as DjangoValidationError
        from django.db import transaction as db_transaction

        from .reconciliation_utils import phantom_transfer_transactions, recompute_reconciliation_counts

        # A cross-account erp_only pair is a phantom inter-bank transfer:
        # both legs recorded in the ERP, neither seen by its bank — each
        # bank GL is misstated by the amount, so resolving the exceptions
        # alone would freeze both GLs out of step with the real banks
        # forever. The recorded transaction(s) must also be reversed
        # (counter entries via the audited Transaction.reverse path), and
        # that only happens when the pair verifiably has the transfer
        # shape — see phantom_transfer_transactions for the checks.
        reversal_refs = []
        with db_transaction.atomic():
            if both_erp_only and cross_account:
                try:
                    txns_to_reverse = phantom_transfer_transactions(exc_a, exc_b)
                    for txn in txns_to_reverse:
                        txn.reverse(request.user, reason=(
                            f'Phantom inter-bank transfer — neither leg appears in its bank statement '
                            f'(link-resolved exceptions #{exc_a.id}/#{exc_b.id}). {resolution_notes}'
                        ))
                        reversal_refs.append(txn.reversal_transaction.reference_number)
                except DjangoValidationError as exc:
                    detail = '; '.join(exc.messages) if hasattr(exc, 'messages') else str(exc)
                    return Response({'detail': detail}, status=status.HTTP_400_BAD_REQUEST)

            final_notes = resolution_notes
            if reversal_refs:
                final_notes = (
                    f'{resolution_notes} | Counter entries posted: {", ".join(reversal_refs)} '
                    f'(phantom transfer reversed — neither leg reached its bank).'
                )

            for exc, other in ((exc_a, exc_b), (exc_b, exc_a)):
                exc.resolved = True
                exc.resolved_by = request.user
                exc.resolved_at = now
                exc.resolution_notes = final_notes
                exc.netted_with = other
                exc.save(update_fields=['resolved', 'resolved_by', 'resolved_at', 'resolution_notes', 'netted_with'])

            for recon in {exc_a.reconciliation, exc_b.reconciliation}:
                recompute_reconciliation_counts(recon)

        return Response({
            'exception_a': ReconciliationExceptionSerializer(exc_a).data,
            'exception_b': ReconciliationExceptionSerializer(exc_b).data,
            'reversal_references': reversal_refs,
        })


class LinkResolveBankChargeView(APIView):
    """
    POST /api/banks/exceptions/link-resolve-bank-charge/

    The BankTransfer/MOVEB-series pattern found in the missing-money gap
    analysis: the sending bank deducts a transfer fee that was never
    recorded in the ERP, so the same real event shows up as a bank_only
    DEBIT exception (the full amount, including the fee) and a separate
    erp_only DEBIT exception (the amount actually recorded) that differ by
    a small, plausible fee instead of matching exactly — so plain
    LinkResolveExceptionsView (exact match only) can't close them.

    This both (a) links and resolves the pair immediately, same as plain
    Link — the director's confirmation that these are the same underlying
    transfer is what closes them — and (b) creates a draft Expense +
    pending BankPayment for the fee difference against a fixed "Bank
    Charges" category (get_or_create_bank_charges_category), so the fee
    itself still goes through the normal director-gated BankPayment
    approval step before it posts to the GL — this endpoint never posts
    money movement directly, matching every other resolve pathway. The
    created Expense/BankPayment description spells out both source
    exception ids, their amounts, and the computed fee, specifically so the
    director approving the payment can see exactly where the charge came
    from and how much it is, without having to dig back through the two
    original exceptions.

    Director-only (can_user_approve) — same tier as plain Link, and
    stricter than resolve-to-expense's initiator step, since this both
    closes two exceptions AND creates a new payment in one action.

    Request body:
      bank_only_exception_id, erp_only_exception_id  (int, required)
      resolution_notes                                (str, required)
    """
    permission_classes = [permissions.IsAuthenticated]
    permission_module = 'banks'
    permission_page = 'bank-reconciliation-exceptions'

    def post(self, request):
        if not can_user_approve(request.user, module=self.permission_module, page=self.permission_page):
            return Response(
                {'detail': 'Only directors may link an exception pair as a bank charge.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        from .reconciliation_utils import (
            bank_charge_fee, FEE_LINK_MAX_AMOUNT, get_or_create_bank_charges_category,
            reason_too_short, recompute_reconciliation_counts, MIN_REASON_LENGTH,
        )

        resolution_notes = request.data.get('resolution_notes', '')
        if reason_too_short(resolution_notes):
            return Response(
                {'detail': f'resolution_notes is required (at least {MIN_REASON_LENGTH} characters) '
                           f'to link an exception pair as a bank charge.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        bank_id = request.data.get('bank_only_exception_id')
        erp_id = request.data.get('erp_only_exception_id')
        if not bank_id or not erp_id:
            return Response(
                {'detail': 'bank_only_exception_id and erp_only_exception_id are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        qs = ReconciliationException.objects.filter(
            reconciliation__in=DailyReconciliation.objects.for_user(request.user)
        ).select_related('reconciliation')
        bank_exc = get_object_or_404(qs, pk=bank_id)
        erp_exc = get_object_or_404(qs, pk=erp_id)

        if bank_exc.exception_type != 'bank_only' or erp_exc.exception_type != 'erp_only':
            return Response(
                {'detail': 'bank_only_exception_id must be a bank_only exception and '
                           'erp_only_exception_id must be an erp_only exception.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        for exc in (bank_exc, erp_exc):
            if exc.resolved:
                return Response({'detail': 'Exception is already resolved.'}, status=status.HTTP_400_BAD_REQUEST)
        if bank_exc.pending_bank_payment_id:
            return Response(
                {'detail': f'A payment is already pending for the bank_only exception '
                           f'({bank_exc.pending_bank_payment.payment_number}).'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if bank_exc.reconciliation.bank_account_id != erp_exc.reconciliation.bank_account_id:
            return Response(
                {'detail': 'Both exceptions must belong to the same bank account.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        fee = bank_charge_fee(bank_exc, erp_exc)
        if fee is None:
            return Response(
                {'detail': 'These two exceptions do not fit the bank-charge shape — both must be '
                           'DEBIT, and the bank_only amount must be larger than the erp_only amount.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if fee > FEE_LINK_MAX_AMOUNT:
            return Response(
                {'detail': f'The difference (₦{fee}) exceeds the ₦{FEE_LINK_MAX_AMOUNT} cap for '
                           f'this pathway. Use Resolve to Expense for a larger, uncategorized difference.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            payment = _resolve_bank_charge_pair(request, bank_exc, erp_exc, fee, resolution_notes)
        except Exception as exc:
            return Response({'detail': _error_message(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            'bank_only_exception': ReconciliationExceptionSerializer(bank_exc).data,
            'erp_only_exception': ReconciliationExceptionSerializer(erp_exc).data,
            'fee_amount': str(fee),
            'payment_id': payment.id,
        }, status=status.HTTP_201_CREATED)


def _resolve_bank_charge_pair(request, bank_exc, erp_exc, fee, resolution_notes):
    """
    The actual work behind both LinkResolveBankChargeView (one pair) and
    BulkLinkResolveBankChargeView (many pairs found by find_bank_charge_pairs)
    — atomically creates the draft Expense + pending "Bank Charges"
    BankPayment for `fee` and resolves+links both exceptions. Never posts
    money movement itself; the created BankPayment still needs its own
    director approval before it hits the GL, same as every other resolve
    pathway. Raises on failure (validation, race conditions) — the caller
    decides how to report that (400 response for the single-pair view, a
    per-pair "failed" entry for the bulk view).
    """
    from django.db import transaction as db_transaction
    from expenses.serializers import ExpenseSerializer
    from .reconciliation_utils import get_or_create_bank_charges_category, recompute_reconciliation_counts

    recon = bank_exc.reconciliation
    category = get_or_create_bank_charges_category(
        branch=recon.branch, tenant=recon.tenant, owner=request.user,
    )
    description = (
        f"Bank charge on transfer — linked bank_only exception #{bank_exc.id} "
        f"(₦{bank_exc.bank_amount}, {bank_exc.bank_narration or 'no narration'}) against "
        f"erp_only exception #{erp_exc.id} (₦{erp_exc.erp_amount}, "
        f"{erp_exc.erp_narration or 'no narration'}) — fee ₦{fee}"
    )

    with db_transaction.atomic():
        expense_serializer = ExpenseSerializer(
            data={
                'category': category.id,
                'expense_date': bank_exc.bank_date,
                'description': description,
                'amount': fee,
                'payment_method': 'bank_transfer',
                'bank_account': recon.bank_account_id,
            },
            context={'request': request},
        )
        expense_serializer.is_valid(raise_exception=True)
        expense = expense_serializer.save(tenant=recon.tenant)

        payment = BankPayment.objects.create(
            bank_account=recon.bank_account,
            amount=fee,
            description=description,
            payment_date=bank_exc.bank_date,
            expense=expense,
            status='pending',
            owner=request.user,
            branch=recon.branch,
            tenant=recon.tenant,
            created_by=request.user,
        )

        now = tz.now()
        bank_exc.pending_bank_payment = payment
        for exc, other in ((bank_exc, erp_exc), (erp_exc, bank_exc)):
            exc.resolved = True
            exc.resolved_by = request.user
            exc.resolved_at = now
            exc.resolution_notes = resolution_notes
            exc.netted_with = other
        bank_exc.save(update_fields=[
            'resolved', 'resolved_by', 'resolved_at', 'resolution_notes',
            'netted_with', 'pending_bank_payment',
        ])
        erp_exc.save(update_fields=[
            'resolved', 'resolved_by', 'resolved_at', 'resolution_notes', 'netted_with',
        ])

        for r in {bank_exc.reconciliation, erp_exc.reconciliation}:
            recompute_reconciliation_counts(r)

    return payment


class BulkLinkResolveBankChargeView(APIView):
    """
    POST /api/banks/exceptions/bulk-link-resolve-bank-charge/

    Auto-pairs every unambiguous bank_only/erp_only DEBIT bank-charge match
    on one bank account (find_bank_charge_pairs, banks/reconciliation_utils.py)
    and resolves them all in one action — the batch equivalent of repeatedly
    using LinkResolveBankChargeView one pair at a time. Deliberately
    conservative: any bank_only exception with more than one viable erp_only
    candidate (or vice versa) is left out entirely rather than guessed at —
    those still show up for manual review via the ordinary Link picker.

    Each pair still creates its own pending "Bank Charges" BankPayment
    requiring individual director approval before it posts — this endpoint
    never posts money movement itself, only resolves+links the exceptions
    and drafts the payments, same invariant as the single-pair pathway.

    Pass dry_run: true to preview what would happen (pairs found, total
    fee, counts of ambiguous/unmatched) without creating or resolving
    anything — strongly recommended before the real run, since this acts
    on however many pairs are found in a single request with no per-pair
    confirmation step.

    Director-only (can_user_approve) — same tier as the single-pair pathway.

    Request body:
      bank_account_id    (int, required)
      resolution_notes   (str, required unless dry_run)
      dry_run            (bool, optional, default false)
    """
    permission_classes = [permissions.IsAuthenticated]
    permission_module = 'banks'
    permission_page = 'bank-reconciliation-exceptions'

    def post(self, request):
        if not can_user_approve(request.user, module=self.permission_module, page=self.permission_page):
            return Response(
                {'detail': 'Only directors may bulk-link exceptions as bank charges.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        from .reconciliation_utils import find_bank_charge_pairs, reason_too_short, MIN_REASON_LENGTH

        bank_account_id = request.data.get('bank_account_id')
        if not bank_account_id:
            return Response({'detail': 'bank_account_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
        get_object_or_404(BankAccount, pk=bank_account_id)

        dry_run = bool(request.data.get('dry_run', False))
        resolution_notes = request.data.get('resolution_notes', '')
        if not dry_run and reason_too_short(resolution_notes):
            return Response(
                {'detail': f'resolution_notes is required (at least {MIN_REASON_LENGTH} characters) '
                           f'to bulk-link exceptions as bank charges.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        scoped_qs = ReconciliationException.objects.filter(
            reconciliation__in=DailyReconciliation.objects.for_user(request.user)
        )
        pairs, ambiguous, unmatched = find_bank_charge_pairs(bank_account_id, scoped_qs)

        if dry_run:
            total_fee = sum((fee for _b, _e, fee in pairs), Decimal('0'))
            return Response({
                'would_resolve_count': len(pairs),
                'would_resolve': [
                    {
                        'bank_only_exception_id': b.id, 'erp_only_exception_id': e.id,
                        'fee_amount': str(fee),
                    }
                    for b, e, fee in pairs
                ],
                'total_fee_amount': str(total_fee),
                'ambiguous_count': len(ambiguous),
                'ambiguous_bank_only_exception_ids': [b.id for b in ambiguous],
                'unmatched_count': len(unmatched),
                'unmatched_bank_only_exception_ids': [b.id for b in unmatched],
            })

        resolved = []
        failed = []
        total_fee = Decimal('0')
        for bank_exc, erp_exc, fee in pairs:
            try:
                payment = _resolve_bank_charge_pair(request, bank_exc, erp_exc, fee, resolution_notes)
            except Exception as exc:
                failed.append({
                    'bank_only_exception_id': bank_exc.id, 'erp_only_exception_id': erp_exc.id,
                    'detail': _error_message(exc),
                })
                continue
            resolved.append({
                'bank_only_exception_id': bank_exc.id, 'erp_only_exception_id': erp_exc.id,
                'fee_amount': str(fee), 'payment_id': payment.id,
            })
            total_fee += fee

        return Response({
            'resolved_count': len(resolved),
            'resolved': resolved,
            'total_fee_amount': str(total_fee),
            'failed_count': len(failed),
            'failed': failed,
            'ambiguous_count': len(ambiguous),
            'ambiguous_bank_only_exception_ids': [b.id for b in ambiguous],
            'unmatched_count': len(unmatched),
            'unmatched_bank_only_exception_ids': [b.id for b in unmatched],
        }, status=status.HTTP_201_CREATED)


class UnresolveExceptionView(APIView):
    """
    POST /api/banks/exceptions/<exc_id>/unresolve/

    Reopens an exception that was resolved standalone (the plain per-row
    Resolve action) before it was properly paired against its real
    counterpart — e.g. an erp_only exception resolved with a generic note
    like "Inter bank" instead of being Linked to the bank_only line it
    actually belongs to, permanently consuming the one valid match and
    stranding the other side. See ReconciliationException.unresolve() for
    the validation this enforces (refuses anything resolved via Link/
    Bulk-Link or with a pending/posted payment attached — those need their
    own remediation).

    Director-only (can_user_approve), no branch-manager fallback — same
    tier as UnmatchTransactionView, since this reopens something already
    closed rather than closing something new.

    Request body:
      reason  (str, required)
    """
    permission_classes = [permissions.IsAuthenticated]
    permission_module = 'banks'
    permission_page = 'bank-reconciliation-exceptions'

    def post(self, request, exc_id):
        if not can_user_approve(request.user, module=self.permission_module, page=self.permission_page):
            return Response(
                {'detail': 'Only directors may unresolve a reconciliation exception.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        exc = get_object_or_404(
            ReconciliationException.objects.filter(
                reconciliation__in=DailyReconciliation.objects.for_user(request.user),
            ),
            pk=exc_id,
        )

        reason = request.data.get('reason', '')
        try:
            additional = exc.unresolve(request.user, reason)
        except Exception as exc_err:
            return Response({'detail': _error_message(exc_err)}, status=status.HTTP_400_BAD_REQUEST)

        serializer = ReconciliationExceptionSerializer(exc)
        data = {'exception': serializer.data}
        if additional:
            data['counterpart'] = ReconciliationExceptionSerializer(additional[0]).data
        else:
            data['counterpart'] = None
        return Response(data)


def _clean_up_stranded_pair(request, resolved_exc, unresolved_exc, fee, resolution_notes):
    """
    The actual work behind BulkCleanUpStrandedPairsView for one pair found
    by find_stranded_resolved_pairs — reopens the standalone-resolved side
    (ReconciliationException.unresolve(), which itself refuses anything
    already netted or with a pending payment, so this can never double-
    charge a fee that already went through), then links it against its
    real counterpart: an exact amount match nets with no fee (mirrors
    LinkResolveExceptionsView's resolve loop); a fee-tolerant match reuses
    _resolve_bank_charge_pair to create the real "Bank Charges" payment.
    Raises on failure — the caller reports that as a per-pair "failed" entry.
    """
    from django.db import transaction as db_transaction

    unresolve_reason = f'Auto-reopened by Clean Up: {resolution_notes}'

    with db_transaction.atomic():
        resolved_exc.unresolve(request.user, unresolve_reason)

        if fee is not None:
            bank_exc, erp_exc = (
                (resolved_exc, unresolved_exc) if resolved_exc.exception_type == 'bank_only'
                else (unresolved_exc, resolved_exc)
            )
            payment = _resolve_bank_charge_pair(request, bank_exc, erp_exc, fee, resolution_notes)
            return {'fee_amount': str(fee), 'payment_id': payment.id}

        from .reconciliation_utils import recompute_reconciliation_counts

        now = tz.now()
        for exc, other in ((resolved_exc, unresolved_exc), (unresolved_exc, resolved_exc)):
            exc.resolved = True
            exc.resolved_by = request.user
            exc.resolved_at = now
            exc.resolution_notes = resolution_notes
            exc.netted_with = other
            exc.save(update_fields=['resolved', 'resolved_by', 'resolved_at', 'resolution_notes', 'netted_with'])
        for r in {resolved_exc.reconciliation, unresolved_exc.reconciliation}:
            recompute_reconciliation_counts(r)

        return {'fee_amount': None, 'payment_id': None}


def _serialize_exception_summary(exc, fee=None):
    """Compact shape for one exception inside an ambiguous-pair candidate
    list — just enough for a director to visually tell candidates apart
    (amount, narration, date) without a second round-trip per candidate."""
    return {
        'id': exc.id,
        'exception_type': exc.exception_type,
        'direction': exc.direction,
        'amount': str(exc.resolve_amount) if exc.resolve_amount is not None else None,
        'narration': exc.bank_narration or exc.erp_narration or '',
        'date': str(exc.bank_date or exc.erp_date) if (exc.bank_date or exc.erp_date) else None,
        'fee_amount': str(fee) if fee is not None else None,
    }


def _serialize_ambiguous_exception(resolved_exc, candidates):
    """One standalone-resolved exception plus every viable-but-not-unique
    candidate found for it — enough detail for a director to review in the
    Clean Up modal and manually pick the right one, rather than the backend
    guessing at something that could misfile real money."""
    return {
        **_serialize_exception_summary(resolved_exc),
        'resolved_exception_id': resolved_exc.id,
        'candidates': [_serialize_exception_summary(c, fee) for c, fee in candidates],
    }


class BulkCleanUpStrandedPairsView(APIView):
    """
    POST /api/banks/exceptions/bulk-clean-up-stranded-pairs/

    Finds every bank_only/erp_only exception that was resolved standalone
    (the plain per-row Resolve action — netted_with and pending_bank_payment
    both None) while its real counterpart on the same bank account is still
    sitting unresolved, across every bank account the requesting user can
    see (find_stranded_resolved_pairs, banks/reconciliation_utils.py) — the
    production pattern that motivated this: a director resolved an erp_only
    exception with a generic note like "Inter bank" instead of Linking it
    to the bank_only line it actually belonged to, permanently consuming
    the one valid match and stranding the other side.

    For each unambiguous pair found, atomically reopens the standalone-
    resolved side and links it against its real counterpart — an exact
    amount match nets with no fee; a DEBIT bank_only up to
    FEE_LINK_MAX_AMOUNT higher creates a real "Bank Charges" payment for the
    difference, same machinery as LinkResolveBankChargeView. Structurally
    cannot double-charge a fee: unresolve() refuses anything already netted
    or with a pending payment attached, so a pair already properly linked
    (by this or any other pathway) is never touched again, no matter how
    many times this is run.

    Does NOT trigger a reconciliation rerun — this only cleans up existing
    exception state, it doesn't go looking for newly-posted ERP payments.
    Run "Re-run matching" on the relevant reconciliation separately first if
    you need those picked up before cleaning up.

    Pass dry_run: true to preview every pair this would touch (and how)
    without changing anything — strongly recommended before the real run,
    since this reopens exceptions your team already closed, with no
    per-pair confirmation once the real run starts. "Unambiguous" (exactly
    one candidate found) is not the same as "correct" — pass
    excluded_resolved_exception_ids for pairs a director disagrees with
    after reviewing the preview. The resolved side of an excluded pair is
    still reopened (unresolve()) — the whole reason it's in this list at
    all is that it was closed unilaterally with no verification, which is
    true regardless of whether this particular suggested candidate is the
    right one — it's just NOT linked to the suggested candidate. It goes
    back into the ordinary unresolved pool for proper manual review.

    Director-only (can_user_approve) — same tier as Unresolve/Link/Bulk-Link.

    Request body:
      resolution_notes                    (str, required unless dry_run)
      dry_run                             (bool, optional, default false)
      excluded_resolved_exception_ids     (list[int], optional — reopens
                                            these without linking them)
    """
    permission_classes = [permissions.IsAuthenticated]
    permission_module = 'banks'
    permission_page = 'bank-reconciliation-exceptions'

    def post(self, request):
        if not can_user_approve(request.user, module=self.permission_module, page=self.permission_page):
            return Response(
                {'detail': 'Only directors may clean up stranded exception pairs.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        from .reconciliation_utils import find_stranded_resolved_pairs, reason_too_short, MIN_REASON_LENGTH

        dry_run = bool(request.data.get('dry_run', False))
        resolution_notes = request.data.get('resolution_notes', '')
        if not dry_run and reason_too_short(resolution_notes):
            return Response(
                {'detail': f'resolution_notes is required (at least {MIN_REASON_LENGTH} characters) '
                           f'to clean up stranded exception pairs.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        scoped_qs = ReconciliationException.objects.filter(
            reconciliation__in=DailyReconciliation.objects.for_user(request.user)
        )
        pairs, ambiguous = find_stranded_resolved_pairs(scoped_qs)

        # A pair the automatic matcher calls "unambiguous" isn't necessarily
        # right — a director reviewing the preview may disagree with the
        # specific candidate suggested. The resolved side still gets
        # reopened either way (it was closed unilaterally, with no
        # verification, independent of whether this candidate is correct)
        # — excluding it here only skips the LINK step, so it goes back
        # into the ordinary unresolved pool instead of being paired with a
        # candidate a director has just said is wrong.
        excluded_ids = {int(i) for i in (request.data.get('excluded_resolved_exception_ids') or [])}
        excluded_pairs = [(r, u, fee) for r, u, fee in pairs if r.id in excluded_ids]
        pairs = [(r, u, fee) for r, u, fee in pairs if r.id not in excluded_ids]

        ambiguous_detail = [_serialize_ambiguous_exception(r, candidates) for r, candidates in ambiguous]

        if dry_run:
            return Response({
                'would_clean_up_count': len(pairs),
                'would_clean_up': [
                    {
                        'resolved_exception_id': r.id, 'unresolved_exception_id': u.id,
                        'fee_amount': str(fee) if fee is not None else None,
                        'resolved_exception': _serialize_exception_summary(r),
                        'unresolved_exception': _serialize_exception_summary(u, fee),
                    }
                    for r, u, fee in pairs
                ],
                'ambiguous_count': len(ambiguous),
                'ambiguous_exception_ids': [r.id for r, _candidates in ambiguous],
                'ambiguous': ambiguous_detail,
            })

        cleaned_up = []
        failed = []
        for resolved_exc, unresolved_exc, fee in pairs:
            resolved_summary = _serialize_exception_summary(resolved_exc)
            unresolved_summary = _serialize_exception_summary(unresolved_exc, fee)
            try:
                result = _clean_up_stranded_pair(request, resolved_exc, unresolved_exc, fee, resolution_notes)
            except Exception as exc:
                failed.append({
                    'resolved_exception_id': resolved_exc.id, 'unresolved_exception_id': unresolved_exc.id,
                    'detail': _error_message(exc),
                })
                continue
            cleaned_up.append({
                'resolved_exception_id': resolved_exc.id, 'unresolved_exception_id': unresolved_exc.id,
                'resolved_exception': resolved_summary, 'unresolved_exception': unresolved_summary,
                **result,
            })

        unresolved_only = []
        for resolved_exc, _unresolved_exc, _fee in excluded_pairs:
            try:
                resolved_exc.unresolve(
                    request.user,
                    f'Clean Up: reopened, but not linked to the suggested candidate — {resolution_notes}',
                )
            except Exception as exc:
                failed.append({'resolved_exception_id': resolved_exc.id, 'detail': _error_message(exc)})
                continue
            unresolved_only.append({
                'resolved_exception_id': resolved_exc.id,
                'resolved_exception': _serialize_exception_summary(resolved_exc),
            })

        return Response({
            'cleaned_up_count': len(cleaned_up),
            'cleaned_up': cleaned_up,
            'unresolved_only_count': len(unresolved_only),
            'unresolved_only': unresolved_only,
            'failed_count': len(failed),
            'failed': failed,
            'ambiguous_count': len(ambiguous),
            'ambiguous_exception_ids': [r.id for r, _candidates in ambiguous],
            'ambiguous': ambiguous_detail,
        }, status=status.HTTP_201_CREATED)


def _build_evidence_request_messages(exceptions):
    """
    Splits the evidence-request text across as many chunks as needed to
    respect ThreadMessage.body's max_length=1000 — an officer with dozens of
    outstanding items would otherwise overflow a single message. Returns a
    list of message body strings in the order they should be posted.
    """
    from .reconciliation_utils import _LOAN_NUMBER_RE

    BODY_LIMIT = 1000
    SAFETY_MARGIN = 20  # room for the "(continued)" prefix on overflow chunks

    intro = (
        "We're reviewing outstanding loan repayment records against bank statements. "
        f"The following {len(exceptions)} repayment(s) recorded on your officer account "
        "don't currently match any bank transaction we can find. Could you help us "
        "locate evidence (bank slip, transfer receipt, or client confirmation) for "
        "each? Please reply to this thread and attach whatever you have.\n"
    )
    lines = []
    for i, exc in enumerate(exceptions, start=1):
        loan_match = _LOAN_NUMBER_RE.search(exc.erp_narration or '')
        loan_ref = f"Loan {loan_match.group(1).strip()} — " if loan_match else ''
        narration = (exc.erp_narration or 'no narration')[:80]
        lines.append(f"{i}. {loan_ref}₦{exc.erp_amount} on {exc.erp_date} — {narration}")

    total = sum((exc.erp_amount or Decimal('0')) for exc in exceptions)
    outro = f"\nTotal: ₦{total} across {len(exceptions)} item(s)."

    chunks = []
    current = intro
    for line in lines:
        candidate = current + line if current == intro else current + "\n" + line
        if len(candidate) > BODY_LIMIT - SAFETY_MARGIN:
            chunks.append(current)
            current = "(continued) " + line
        else:
            current = candidate

    if len(current) + len(outro) <= BODY_LIMIT:
        chunks.append(current + outro)
    else:
        chunks.append(current)
        chunks.append("(continued)" + outro)

    return chunks


def _create_officer_evidence_thread(request, page, officer, exceptions):
    """
    Creates one Discussions thread (threads app) addressed to `officer`,
    listing every exception in `exceptions` and asking them to attach
    evidence. Mirrors what ThreadViewSet.perform_create does by hand (direct
    ORM creation bypasses is_threadable/user_can_initiate_thread — those only
    apply to the DRF-facing create path, not Thread.objects.create() itself)
    — creates the initiator's own ThreadParticipant too so the director who
    triggered this can see replies, exactly as the ViewSet does.
    """
    from django.db import transaction as db_transaction
    from threads.models import Thread, ThreadParticipant, ThreadMessage

    tenant = getattr(request.user, 'tenant', None)
    officer_label = officer.get_full_name() or officer.username

    with db_transaction.atomic():
        thread = Thread.objects.create(
            page=page,
            title=f"Reconciliation evidence review — {officer_label}",
            initiated_by=request.user,
            reason='query',
            owner=request.user,
            created_by=request.user,
            tenant=tenant,
            branch=getattr(officer, 'branch', None),
        )
        ThreadParticipant.objects.create(
            thread=thread, user=request.user, added_by=request.user,
            can_add_participants=True, tenant=tenant, owner=request.user, created_by=request.user,
        )
        ThreadParticipant.objects.create(
            thread=thread, user=officer, added_by=request.user,
            can_add_participants=False, tenant=tenant, owner=request.user, created_by=request.user,
        )
        for body in _build_evidence_request_messages(exceptions):
            ThreadMessage.objects.create(
                thread=thread, author=request.user, body=body,
                tenant=tenant, owner=request.user, created_by=request.user,
            )

    return thread


class BulkCreateOfficerEvidenceThreadsView(APIView):
    """
    POST /api/banks/exceptions/bulk-create-officer-evidence-threads/

    For every officer with unresolved erp_only exceptions that have NO
    plausible bank_only counterpart anywhere on their bank account
    (find_unexplained_erp_only_by_officer, banks/reconciliation_utils.py —
    deliberately excludes anything Clean Up/Link could still auto-resolve,
    since those already have real bank money sitting nearby and aren't
    evidence of a missing payment), creates one Discussions thread addressed
    to that officer, listing every such item and asking them to attach
    evidence (bank slip, transfer receipt, client confirmation).

    Run this AFTER Clean Up/manual ambiguous review has closed out
    everything it can — anything still unresolved at that point genuinely
    has no bank-side match found anywhere, which is what makes it worth a
    formal evidence request rather than more auto-matching.

    Unattributed exceptions (no officer recorded) are always excluded —
    there is no user to address a thread to.

    Pass dry_run: true to preview which officers would receive a thread, how
    many items/how much each covers, and the full per-item detail (amount,
    date, narration) — without creating anything. Pass
    excluded_exception_ids on the real run to leave specific items out of
    whichever officer's thread they belong to (e.g. a director already
    knows the answer for one and wants to handle it separately); an officer
    whose every item gets excluded is skipped entirely rather than sent an
    empty thread.

    Director-only (can_user_approve).

    Request body:
      dry_run                   (bool, optional, default false)
      excluded_exception_ids    (list[int], optional — leaves these specific
                                  items out of the officer's thread)
    """
    permission_classes = [permissions.IsAuthenticated]
    permission_module = 'banks'
    permission_page = 'bank-reconciliation-exceptions'

    def post(self, request):
        if not can_user_approve(request.user, module=self.permission_module, page=self.permission_page):
            return Response(
                {'detail': 'Only directors may request reconciliation evidence from officers.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        from .reconciliation_utils import find_unexplained_erp_only_by_officer

        dry_run = bool(request.data.get('dry_run', False))
        excluded_ids = {int(i) for i in (request.data.get('excluded_exception_ids') or [])}

        scoped_qs = ReconciliationException.objects.filter(
            reconciliation__in=DailyReconciliation.objects.for_user(request.user)
        )
        by_officer = find_unexplained_erp_only_by_officer(scoped_qs)

        if excluded_ids:
            for bucket in by_officer.values():
                bucket['exceptions'] = [exc for exc in bucket['exceptions'] if exc.id not in excluded_ids]

        previews = []
        skipped = []
        for officer_id, bucket in by_officer.items():
            officer = bucket['officer']
            exceptions = bucket['exceptions']
            if not exceptions:
                skipped.append({
                    'officer_id': officer_id,
                    'officer_name': officer.get_full_name() or officer.username,
                })
                continue
            total = sum((exc.erp_amount or Decimal('0')) for exc in exceptions)
            previews.append({
                'officer_id': officer_id,
                'officer_name': officer.get_full_name() or officer.username,
                'branch_name': getattr(getattr(officer, 'branch', None), 'name', None),
                'item_count': len(exceptions),
                'total_amount': str(total),
                'exception_ids': [exc.id for exc in exceptions],
                'items': [_serialize_exception_summary(exc) for exc in exceptions],
            })
        previews.sort(key=lambda p: Decimal(p['total_amount']), reverse=True)

        if dry_run:
            return Response({
                'would_create_count': len(previews),
                'would_create': previews,
                'skipped_count': len(skipped),
                'skipped': skipped,
            })

        from pages.models import ModulePage

        # .for_tenant(), not the bare default manager — ModulePage.objects'
        # default queryset only filters by tenant via a thread-local that
        # isn't reliably set in a DRF request context (the same bug class
        # documented elsewhere in this app for DailyReconciliation.tenant);
        # an unset thread-local here would silently mix every tenant's copy
        # of this page together and risk flipping/reading the wrong one.
        tenant = getattr(request.user, 'tenant', None)
        page_qs = ModulePage.objects.for_tenant(tenant).filter(
            module__code='banks', code='bank-reconciliation-exceptions',
        )
        page_qs.update(is_threadable=True)
        page = page_qs.first()
        if page is None:
            return Response(
                {'detail': 'The bank-reconciliation-exceptions page is not seeded yet — '
                           'run the seed_permissions management command first.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        created = []
        failed = []
        for officer_id, bucket in by_officer.items():
            officer = bucket['officer']
            exceptions = bucket['exceptions']
            if not exceptions:
                continue  # every item for this officer was excluded — already in `skipped`
            try:
                thread = _create_officer_evidence_thread(request, page, officer, exceptions)
            except Exception as exc:
                failed.append({'officer_id': officer_id, 'detail': _error_message(exc)})
                continue
            created.append({
                'officer_id': officer_id, 'thread_id': thread.id, 'item_count': len(exceptions),
            })

        return Response({
            'created_count': len(created),
            'created': created,
            'skipped_count': len(skipped),
            'skipped': skipped,
            'failed_count': len(failed),
            'failed': failed,
        }, status=status.HTTP_201_CREATED)


def _is_global_user(user):
    """
    True when the user has cross-branch access — same convention as
    analytics/views.py's helper of the same name (duplicated rather than
    imported cross-app, matching this codebase's existing pattern).
    """
    if getattr(user, 'is_system_admin', False):
        return True
    if callable(getattr(user, 'is_owner', None)) and user.is_owner():
        return True
    try:
        return user.roles.filter(is_active=True, default_scope='global').exists()
    except Exception:
        return False


class ManualOverridesReportView(APIView):
    """
    GET /api/banks/reports/manual-overrides/

    Audit trail for the three most abuse-prone manual pathways added
    alongside the resolve-flexibility features: unmatch (UnmatchTransactionView),
    link-resolve/netting (LinkResolveExceptionsView), and resolve-to-expense
    (ResolveExceptionToExpenseView). Each is otherwise only visible by digging
    through individual reconciliations one at a time — this surfaces all of
    them in one place so a director/auditor can review who did what and why.

    Branch scoping via DailyReconciliation.objects.for_user() — directors/
    global-scope users see every branch's activity, everyone else is pinned
    to their own branch, same as every other reconciliation endpoint.

    Query params (optional): date_from, date_to — ISO dates, applied to each
    event's own action timestamp (unmatched_at / resolved_at / payment
    created_at, respectively).
    """
    permission_classes = [permissions.IsAuthenticated]
    permission_module = 'banks'
    permission_page = 'bank-reconciliation-exceptions'

    def get(self, request):
        scoped_recons = DailyReconciliation.objects.for_user(request.user)
        bank_account_ids = list(scoped_recons.values_list('bank_account_id', flat=True).distinct())
        bank_account_names = dict(
            BankAccount.objects.filter(id__in=bank_account_ids).values_list('id', 'account_name')
        )

        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')

        events = []

        # ── Unmatches ────────────────────────────────────────────────────
        unmatch_qs = ReconciliationBankTransaction.objects.filter(
            bank_account_id__in=bank_account_ids, unmatched_by__isnull=False,
        ).select_related('unmatched_by')
        if date_from:
            unmatch_qs = unmatch_qs.filter(unmatched_at__date__gte=date_from)
        if date_to:
            unmatch_qs = unmatch_qs.filter(unmatched_at__date__lte=date_to)
        for tx in unmatch_qs:
            events.append({
                'type': 'unmatch',
                'action_at': tx.unmatched_at,
                'actor_id': tx.unmatched_by_id,
                'actor_name': tx.unmatched_by.get_full_name() if tx.unmatched_by else None,
                'reason': tx.unmatched_reason,
                'amount': str(tx.amount),
                'direction': tx.direction,
                'narration': tx.narration,
                'bank_account_id': tx.bank_account_id,
                'bank_account_name': bank_account_names.get(tx.bank_account_id),
                'reference_id': str(tx.id),
            })

        # ── Netted resolutions ──────────────────────────────────────────
        netted_qs = ReconciliationException.objects.filter(
            reconciliation__in=scoped_recons, netted_with__isnull=False, resolved=True,
        ).select_related('resolved_by', 'reconciliation')
        if date_from:
            netted_qs = netted_qs.filter(resolved_at__date__gte=date_from)
        if date_to:
            netted_qs = netted_qs.filter(resolved_at__date__lte=date_to)
        for exc in netted_qs:
            events.append({
                'type': 'netted',
                'action_at': exc.resolved_at,
                'actor_id': exc.resolved_by_id,
                'actor_name': exc.resolved_by.get_full_name() if exc.resolved_by else None,
                'reason': exc.resolution_notes,
                'amount': str(exc.bank_amount) if exc.bank_amount is not None else None,
                'direction': exc.direction,
                'narration': exc.bank_narration,
                'bank_account_id': exc.reconciliation.bank_account_id,
                'bank_account_name': bank_account_names.get(exc.reconciliation.bank_account_id),
                'reference_id': exc.id,
                'netted_with_id': exc.netted_with_id,
            })

        # ── Resolve-to-expense (both pending and already auto-resolved) ──
        expense_qs = ReconciliationException.objects.filter(
            reconciliation__in=scoped_recons, pending_bank_payment__isnull=False,
        ).select_related('pending_bank_payment', 'pending_bank_payment__created_by', 'reconciliation')
        if date_from:
            expense_qs = expense_qs.filter(pending_bank_payment__created_at__date__gte=date_from)
        if date_to:
            expense_qs = expense_qs.filter(pending_bank_payment__created_at__date__lte=date_to)
        for exc in expense_qs:
            payment = exc.pending_bank_payment
            events.append({
                'type': 'resolve_to_expense',
                'action_at': payment.created_at,
                'actor_id': payment.created_by_id,
                'actor_name': payment.created_by.get_full_name() if payment.created_by else None,
                'reason': None,
                'amount': str(exc.bank_amount) if exc.bank_amount is not None else None,
                'direction': exc.direction,
                'narration': exc.bank_narration,
                'bank_account_id': exc.reconciliation.bank_account_id,
                'bank_account_name': bank_account_names.get(exc.reconciliation.bank_account_id),
                'reference_id': exc.id,
                'payment_number': payment.payment_number,
                'payment_status': payment.status,
                'exception_resolved': exc.resolved,
            })

        events.sort(key=lambda e: e['action_at'] or tz.now(), reverse=True)

        return Response({'results': events, 'count': len(events)})


class MissingMoneySummaryView(APIView):
    """
    GET /api/banks/reports/missing-money-summary/

    A single "how much is actually missing, and from whom" picture across
    both sides of reconciliation — erp_only (recorded as paid, never hit
    the bank — attributable to the officer who recorded it) and bank_only
    (cash the bank shows with no ERP record — attributable to the bank
    account/branch, since there's no officer to point to). Previously this
    required piecing together counts from DailyReconciliation summaries
    across many individual reconciliations; this aggregates unresolved
    exceptions directly, tenant/branch-scoped the same way every other
    reconciliation report is.

    amount_diff is deliberately excluded — it already has a matched
    counterpart on both sides with a captured (usually small, tolerance-
    bounded) discrepancy; it isn't "missing money" in the same sense.

    Query params (optional): date_from, date_to — ISO dates, applied to
    each exception's created_at (when it was first flagged).
    """
    permission_classes = [permissions.IsAuthenticated]
    permission_module = 'banks'
    permission_page = 'bank-reconciliation-exceptions'

    def get(self, request):
        scoped_recons = DailyReconciliation.objects.for_user(request.user)

        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')

        base_qs = ReconciliationException.objects.filter(
            reconciliation__in=scoped_recons, resolved=False,
        )
        if date_from:
            base_qs = base_qs.filter(created_at__date__gte=date_from)
        if date_to:
            base_qs = base_qs.filter(created_at__date__lte=date_to)

        erp_only_qs = base_qs.filter(exception_type='erp_only')
        bank_only_qs = base_qs.filter(exception_type='bank_only')

        erp_only_totals = erp_only_qs.aggregate(count=Count('id'), amount=Sum('erp_amount'))
        bank_only_totals = bank_only_qs.aggregate(count=Count('id'), amount=Sum('bank_amount'))
        erp_amount = erp_only_totals['amount'] or Decimal('0')
        bank_amount = bank_only_totals['amount'] or Decimal('0')

        by_officer_agg = (
            erp_only_qs.values('officer_id', 'officer__first_name', 'officer__last_name', 'officer__branch__name')
            .annotate(count=Count('id'), amount=Sum('erp_amount'))
            .order_by('-amount')
        )
        by_officer = []
        for row in by_officer_agg:
            if row['officer_id'] is None:
                name = 'Unattributed'
            else:
                name = f"{row['officer__first_name'] or ''} {row['officer__last_name'] or ''}".strip() or 'Unnamed officer'
            by_officer.append({
                'officer_id': row['officer_id'],
                'officer_name': name,
                'branch_name': row['officer__branch__name'],
                'count': row['count'],
                'amount': str(row['amount'] or Decimal('0')),
            })

        by_bank_account_agg = (
            bank_only_qs.values(
                'reconciliation__bank_account_id', 'reconciliation__bank_account__account_name',
            )
            .annotate(count=Count('id'), amount=Sum('bank_amount'))
            .order_by('-amount')
        )
        by_bank_account = [
            {
                'bank_account_id': row['reconciliation__bank_account_id'],
                'bank_account_name': row['reconciliation__bank_account__account_name'],
                'count': row['count'],
                'amount': str(row['amount'] or Decimal('0')),
            }
            for row in by_bank_account_agg
        ]

        return Response({
            'totals': {
                'erp_only': {'count': erp_only_totals['count'], 'amount': str(erp_amount)},
                'bank_only': {'count': bank_only_totals['count'], 'amount': str(bank_amount)},
                'grand_total_amount': str(erp_amount + bank_amount),
            },
            'by_officer': by_officer,
            'by_bank_account': by_bank_account,
        })


class MissingMoneyOfficerExceptionsView(generics.ListAPIView):
    """
    GET /api/banks/reports/missing-money-summary/officer/<officer_id>/

    Drill-down for MissingMoneySummaryView's by_officer rows: every
    unresolved erp_only exception attributed to this officer. Pass
    officer_id='unattributed' for the no-officer bucket.
    """
    serializer_class = ReconciliationExceptionSerializer
    permission_classes = [permissions.IsAuthenticated]
    permission_module = 'banks'
    permission_page = 'bank-reconciliation-exceptions'

    def get_queryset(self):
        qs = ReconciliationException.objects.filter(
            reconciliation__in=DailyReconciliation.objects.for_user(self.request.user),
            exception_type='erp_only', resolved=False,
        ).select_related('officer', 'erp_branch', 'reconciliation')

        officer_id = self.kwargs['officer_id']
        if officer_id == 'unattributed':
            qs = qs.filter(officer__isnull=True)
        else:
            qs = qs.filter(officer_id=officer_id)

        return qs.order_by('-erp_amount')


class MissingMoneyBankAccountExceptionsView(generics.ListAPIView):
    """
    GET /api/banks/reports/missing-money-summary/bank-account/<bank_account_id>/

    Drill-down for MissingMoneySummaryView's by_bank_account rows: every
    unresolved bank_only exception on this bank account.
    """
    serializer_class = ReconciliationExceptionSerializer
    permission_classes = [permissions.IsAuthenticated]
    permission_module = 'banks'
    permission_page = 'bank-reconciliation-exceptions'

    def get_queryset(self):
        return ReconciliationException.objects.filter(
            reconciliation__in=DailyReconciliation.objects.for_user(self.request.user),
            reconciliation__bank_account_id=self.kwargs['bank_account_id'],
            exception_type='bank_only', resolved=False,
        ).select_related('reconciliation').order_by('-bank_amount')


class OfficerReconciliationRiskReportView(APIView):
    """
    GET /api/banks/reports/officer-reconciliation-risk/

    Per-officer accountability signals aggregated across ALL of their
    reconciliation activity — not just the cases that ended up as
    exceptions — so a pattern (chronic late posting, missing references)
    is visible even for items that already matched or were resolved. Two
    sources feed each officer's row:
      - matched ReconciliationBankTransaction rows (matched_erp_officer/
        _had_reference/posting_lag_days, captured at match time)
      - erp_only ReconciliationException rows, regardless of `resolved`
    No opinionated "risk score" — raw metrics only, sorted with the most
    outstanding-attention officers first; the original design decision for
    this feature was that directors judge case-by-case rather than the
    system pre-filtering what's worth showing.

    Branch scoping follows the same convention as analytics/views.py:
    directors/global-scope users see every branch, optionally narrowed via
    the X-Branch-ID header (the frontend's existing branch switcher);
    everyone else is pinned to their own branch.

    Query params (optional): date_from, date_to — ISO dates, applied to
    the bank value_date / reconciliation_date respectively.
    """
    permission_classes = [permissions.IsAuthenticated]
    permission_module = 'banks'
    permission_page = 'bank-reconciliation-exceptions'

    def get(self, request):
        from django.contrib.auth import get_user_model
        User = get_user_model()

        user = request.user
        tenant = getattr(user, 'tenant', None)

        branch = None
        if _is_global_user(user):
            header_val = request.META.get('HTTP_X_BRANCH_ID', '').strip()
            if header_val:
                from branches.models import Branch
                branch = Branch.objects.filter(pk=header_val, is_deleted=False, tenant=tenant).first()
        else:
            branch = getattr(user, 'branch', None)
            if branch is None:
                return Response({'results': []})

        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')

        # Tenant boundary is enforced below via officer.tenant (always
        # explicitly set at user creation), not bank_account.tenant — the
        # latter is populated through TimeStampedModel.save()'s thread-local
        # fallback, the same unreliable mechanism that previously left
        # DailyReconciliation.tenant NULL on some rows (see the backfill
        # migration for that bug). Filtering on it here could silently
        # return an empty report instead of real data.
        matched_qs = ReconciliationBankTransaction.objects.filter(
            matched=True, matched_erp_officer__isnull=False,
        )
        erp_only_qs = ReconciliationException.objects.filter(
            exception_type='erp_only', officer__isnull=False,
        )
        if branch is not None:
            matched_qs = matched_qs.filter(matched_erp_officer__branch=branch)
            erp_only_qs = erp_only_qs.filter(officer__branch=branch)
        if date_from:
            matched_qs = matched_qs.filter(value_date__gte=date_from)
            erp_only_qs = erp_only_qs.filter(reconciliation__reconciliation_date__gte=date_from)
        if date_to:
            matched_qs = matched_qs.filter(value_date__lte=date_to)
            erp_only_qs = erp_only_qs.filter(reconciliation__reconciliation_date__lte=date_to)

        matched_agg = matched_qs.values('matched_erp_officer').annotate(
            matched_count=Count('id'),
            avg_lag_days=Avg('posting_lag_days'),
            late_count=Count('id', filter=Q(posting_lag_days__gt=0)),
            referenced_count=Count('id', filter=Q(matched_erp_had_reference=True)),
        )
        erp_only_agg = erp_only_qs.values('officer').annotate(
            erp_only_count=Count('id'),
            unresolved_erp_only_count=Count('id', filter=Q(resolved=False)),
            high_priority_count=Count('id', filter=Q(is_high_priority=True, resolved=False)),
            erp_only_referenced_count=Count('id', filter=Q(erp_narration__iregex=r'\|\s*Ref:\s*.+')),
        )

        blank_row = {
            'matched_count': 0, 'avg_lag_days': None, 'late_count': 0, 'referenced_count': 0,
            'erp_only_count': 0, 'unresolved_erp_only_count': 0,
            'high_priority_count': 0, 'erp_only_referenced_count': 0,
        }

        rows = {}
        for a in matched_agg:
            row = dict(blank_row)
            row['matched_count'] = a['matched_count']
            row['avg_lag_days'] = round(a['avg_lag_days'], 1) if a['avg_lag_days'] is not None else None
            row['late_count'] = a['late_count']
            row['referenced_count'] = a['referenced_count']
            rows[a['matched_erp_officer']] = row
        for a in erp_only_agg:
            row = rows.setdefault(a['officer'], dict(blank_row))
            row['erp_only_count'] = a['erp_only_count']
            row['unresolved_erp_only_count'] = a['unresolved_erp_only_count']
            row['high_priority_count'] = a['high_priority_count']
            row['erp_only_referenced_count'] = a['erp_only_referenced_count']

        officers_by_id = {
            o.id: o for o in
            User.objects.filter(id__in=rows.keys(), tenant=tenant).select_related('branch')
        }

        results = []
        for officer_id, r in rows.items():
            officer = officers_by_id.get(officer_id)
            if officer is None:
                continue
            total_considered = r['matched_count'] + r['erp_only_count']
            referenced_total = r['referenced_count'] + r['erp_only_referenced_count']
            results.append({
                'officer_id': officer_id,
                'officer_name': (officer.get_full_name() or officer.username),
                'branch_name': officer.branch.name if officer.branch else None,
                'matched_count': r['matched_count'],
                'erp_only_count': r['erp_only_count'],
                'unresolved_erp_only_count': r['unresolved_erp_only_count'],
                'high_priority_count': r['high_priority_count'],
                'total_considered': total_considered,
                'match_rate': round(r['matched_count'] / total_considered, 3) if total_considered else None,
                'reference_compliance_rate': (
                    round(referenced_total / total_considered, 3) if total_considered else None
                ),
                'avg_posting_lag_days': r['avg_lag_days'],
                'late_posting_count': r['late_count'],
            })

        results.sort(key=lambda r: (-r['unresolved_erp_only_count'], -r['high_priority_count']))
        return Response({'results': results})


class PaymentTraceView(APIView):
    """
    GET /api/banks/reconciliations/payment-trace/?q=<ref | amount | text>

    The investigation view for "someone came with evidence": search a
    payment by reference number, exact amount, or free text (transaction
    description / statement-line narration) and get its FULL linkage story
    in one response — which statement line(s) claim it (with narration and
    match confidence), which line(s) USED to claim it before an unmatch
    (with who/when/why), every exception it appears in with resolution
    notes and the netted counterpart's details. A director reading the
    trace can decide which pairing is false and act with the existing
    audited tools (unmatch / unresolve / link), which automatically
    reopens the wrongly-consumed counterpart so it can be sought after.

    Two result sections, because evidence can arrive about either side:
      payments — ERP transactions with at least one leg on a visible
                 bank account's GL
      lines    — statement lines, each with the transaction currently
                 claiming it and its exception trail

    Read-only; branch/tenant scoping via DailyReconciliation.objects
    .for_user() exactly like every other reconciliation endpoint. The
    action buttons this feeds are separately permission-gated.
    """
    permission_classes = [permissions.IsAuthenticated]
    permission_module = 'banks'
    permission_page = 'bank-reconciliation-exceptions'

    MAX_RESULTS = 25

    def get(self, request):
        from transactions.models import Transaction

        q = (request.query_params.get('q') or '').strip()
        if len(q) < 3:
            return Response(
                {'detail': 'Provide at least 3 characters (a reference, an amount, or narration text).'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        scoped_recons = DailyReconciliation.objects.for_user(request.user)
        accounts = {
            r['bank_account_id']: r['bank_account__gl_account_id']
            for r in scoped_recons.values('bank_account_id', 'bank_account__gl_account_id')
        }
        if not accounts:
            return Response({'payments': [], 'lines': []})
        bank_gl_ids = {gl for gl in accounts.values() if gl}

        amount = None
        try:
            amount = Decimal(q.replace(',', ''))
        except Exception:
            pass

        # ---- payments (ERP side) ----
        txn_qs = Transaction.objects.filter(
            entries__account_id__in=bank_gl_ids,
            approved=True, is_deleted=False,
        ).distinct()
        if amount is not None:
            txn_qs = txn_qs.filter(entries__amount=amount)
        else:
            txn_qs = txn_qs.filter(
                Q(reference_number__icontains=q) | Q(description__icontains=q)
            )
        txns = list(
            txn_qs.select_related('created_by')
            .prefetch_related('entries__account')
            .order_by('-date')[:self.MAX_RESULTS]
        )

        # ---- lines (bank side) ----
        line_qs = ReconciliationBankTransaction.objects.filter(
            bank_account_id__in=accounts.keys(),
        )
        if amount is not None:
            line_qs = line_qs.filter(amount=amount)
        else:
            line_qs = line_qs.filter(
                Q(narration__icontains=q) | Q(bank_ref__icontains=q)
            )
        lines = list(
            line_qs.select_related('bank_account', 'unmatched_by')
            .order_by('-value_date')[:self.MAX_RESULTS]
        )

        # Lines pointing at the found payments (current match or historical,
        # pre-unmatch) — matched_erp_payment_id is deliberately preserved by
        # unmatch(), which is exactly what makes this trace possible.
        txn_ids = [t.id for t in txns]
        claim_lines = list(
            ReconciliationBankTransaction.objects.filter(matched_erp_payment_id__in=txn_ids)
            .select_related('bank_account', 'unmatched_by')
        ) if txn_ids else []

        all_lines = {ln.pk: ln for ln in lines}
        for ln in claim_lines:
            all_lines.setdefault(ln.pk, ln)

        # One recon lookup for every (account, date) pair we will reference.
        pairs = {(ln.bank_account_id, ln.value_date) for ln in all_lines.values()}
        recon_map = {}
        if pairs:
            recon_filter = Q()
            for acct, d in pairs:
                recon_filter |= Q(bank_account_id=acct, reconciliation_date=d)
            recon_map = {
                (r.bank_account_id, r.reconciliation_date): r.id
                for r in scoped_recons.filter(recon_filter)
            }

        # Exceptions referencing either side.
        excs = list(
            ReconciliationException.objects.filter(
                Q(loan_payment_id__in=txn_ids)
                | Q(bank_transaction_id__in=[str(pk) for pk in all_lines])
            )
            .filter(reconciliation__in=scoped_recons)
            .select_related('resolved_by', 'netted_with', 'officer')
        ) if (txn_ids or all_lines) else []

        # Partner exceptions may reference transactions we have not loaded.
        partner_txn_ids = {
            e.netted_with.loan_payment_id for e in excs
            if e.netted_with_id and e.netted_with.loan_payment_id
        }
        partner_txn_map = {
            t.pk: t for t in Transaction.objects.filter(pk__in=partner_txn_ids)
        } if partner_txn_ids else {}

        def user_name(u):
            return (u.get_full_name() or u.username) if u else None

        def exc_summary(e):
            partner = None
            if e.netted_with_id:
                p = e.netted_with
                p_txn = partner_txn_map.get(p.loan_payment_id)
                partner = {
                    'id': p.id,
                    'exception_type': p.exception_type,
                    'direction': p.direction,
                    'amount': str(p.resolve_amount) if p.resolve_amount is not None else None,
                    'narration': p.bank_narration or p.erp_narration or '',
                    'transaction_reference': p_txn.reference_number if p_txn else None,
                    'resolved': p.resolved,
                }
            return {
                'id': e.id,
                'reconciliation_id': e.reconciliation_id,
                'exception_type': e.exception_type,
                'direction': e.direction,
                'amount': str(e.resolve_amount) if e.resolve_amount is not None else None,
                'date': str(e.bank_date or e.erp_date or ''),
                'narration': e.bank_narration or e.erp_narration or '',
                'officer_name': user_name(e.officer),
                'resolved': e.resolved,
                'resolved_by': user_name(e.resolved_by),
                'resolved_at': e.resolved_at,
                'resolution_notes': e.resolution_notes or '',
                'netted_with': partner,
            }

        def line_summary(ln):
            return {
                'id': str(ln.pk),
                'reconciliation_id': recon_map.get((ln.bank_account_id, ln.value_date)),
                'bank_account': str(ln.bank_account),
                'value_date': ln.value_date,
                'direction': ln.direction,
                'amount': str(ln.amount),
                'narration': ln.narration or '',
                'matched': ln.matched,
                'match_confidence': ln.match_confidence or '',
                'matched_erp_payment_id': ln.matched_erp_payment_id,
                'matched_at': ln.matched_at,
                'unmatched_by': user_name(ln.unmatched_by),
                'unmatched_at': ln.unmatched_at,
                'unmatched_reason': ln.unmatched_reason or '',
            }

        excs_by_txn = {}
        excs_by_line = {}
        for e in excs:
            if e.loan_payment_id:
                excs_by_txn.setdefault(e.loan_payment_id, []).append(exc_summary(e))
            if e.bank_transaction_id:
                excs_by_line.setdefault(str(e.bank_transaction_id), []).append(exc_summary(e))

        claims_by_txn = {}
        for ln in claim_lines:
            claims_by_txn.setdefault(ln.matched_erp_payment_id, []).append(line_summary(ln))

        claiming_txn_ids = {
            ln.matched_erp_payment_id for ln in lines if ln.matched_erp_payment_id
        } - set(txn_ids)
        claiming_txn_map = {
            t.pk: t for t in Transaction.objects.filter(pk__in=claiming_txn_ids).select_related('created_by')
        } if claiming_txn_ids else {}

        def txn_summary(t):
            return {
                'id': t.id,
                'reference_number': t.reference_number,
                'date': t.date,
                'description': t.description or '',
                'created_by': user_name(t.created_by),
                'is_reversed': t.is_reversed,
                'is_reversal': t.is_reversal,
            }

        payments = []
        for t in txns:
            entry = dict(txn_summary(t))
            entry['legs'] = [
                {
                    'account_code': e.account.code,
                    'account_name': e.account.name,
                    'side': e.side,
                    'amount': str(e.amount),
                }
                for e in t.entries.all()
            ]
            entry['claimed_by_lines'] = claims_by_txn.get(t.id, [])
            entry['exceptions'] = excs_by_txn.get(t.id, [])
            payments.append(entry)

        line_results = []
        for ln in lines:
            entry = line_summary(ln)
            claiming = None
            if ln.matched_erp_payment_id:
                ct = claiming_txn_map.get(ln.matched_erp_payment_id)
                if ct is None:
                    ct = next((t for t in txns if t.id == ln.matched_erp_payment_id), None)
                if ct is not None:
                    claiming = txn_summary(ct)
            entry['claiming_transaction'] = claiming
            entry['exceptions'] = excs_by_line.get(str(ln.pk), [])
            line_results.append(entry)

        return Response({'payments': payments, 'lines': line_results})
