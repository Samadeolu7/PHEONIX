from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Q
from decimal import Decimal

from common.views import ScopedModelViewSet
from .models import (
    CustomerReceivable,
    ReceivableActivityLog,
    CustomerStatement
)
from .serializers import (
    CustomerReceivableSerializer,
    ReceivableActivityLogSerializer,
    CustomerStatementSerializer
)
from .services import ReceivablesService


from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Q
from django.db import transaction
from decimal import Decimal

from common.views import ScopedModelViewSet
from .models import (
    CustomerReceivable,
    ReceivableActivityLog,
    CustomerStatement
)
from .serializers import (
    CustomerReceivableSerializer,
    ReceivableActivityLogSerializer,
    CustomerStatementSerializer
)
from .services import ReceivablesService


class CustomerReceivableViewSet(ScopedModelViewSet):
    '''Customer Receivable viewset'''
    queryset = CustomerReceivable.objects.select_related(
        'client', 'content_type', 'owner', 'branch'
    ).all()
    serializer_class = CustomerReceivableSerializer
    detail_serializer_class = None
    filterset_fields = ['client', 'receivable_type', 'status', 'aging_bucket']
    search_fields = ['reference_number', 'client__name']
    ordering_fields = ['due_date', 'balance', 'days_overdue']
    ordering = ['-due_date']
    permission_module = 'receivables'
    permission_page = 'customer-receivables'
    officer_client_lookup = 'client__assigned_officer'

    @action(detail=True, methods=['post'])
    def record_payment(self, request, pk=None):
        """
        Unified payment recording for any receivable type.
        Delegates to the appropriate backend handler based on receivable_type.

        Expected payload (same as per-type endpoints):
            amount, payment_date, payment_method,
            bank_account_id (optional), reference (optional), notes (optional)
        """
        from incomes.serializers import RecordPaymentSerializer

        receivable = self.get_object()
        serializer = RecordPaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        amount = serializer.validated_data['amount']
        if amount > receivable.balance:
            return Response(
                {'error': f'Payment amount exceeds outstanding balance of {receivable.balance}'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Resolve bank/cash GL account once (shared logic for all types)
        bank_account = None
        bank_account_id = serializer.validated_data.get('bank_account_id')
        payment_method = serializer.validated_data.get('payment_method', 'cash')

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

        try:
            with transaction.atomic():
                source = receivable.content_object
                if source is None:
                    return Response(
                        {'error': 'Receivable has no linked source object'},
                        status=status.HTTP_400_BAD_REQUEST
                    )

                if receivable.receivable_type == 'invoice':
                    from incomes.services.accounting_integration import IncomeAccountingService
                    from incomes.models import Invoice
                    invoice = source
                    if not isinstance(invoice, Invoice):
                        return Response(
                            {'error': 'Receivable source is not an Invoice'},
                            status=status.HTTP_400_BAD_REQUEST
                        )
                    if not invoice.is_posted:
                        return Response(
                            {'error': 'Invoice must be posted before recording payments'},
                            status=status.HTTP_400_BAD_REQUEST
                        )
                    # Build payment via InvoiceViewSet logic (GL entry inline)
                    import uuid
                    from transactions.models import Transaction as JournalEntry, TransactionEntry as JournalEntryLine, TransactionSeries
                    from accounts.utils.account_creation import get_or_create_child_account
                    from django.utils import timezone as tz

                    resolved_account = bank_account or IncomeAccountingService.get_cash_account(
                        owner=invoice.owner,
                        branch=invoice.branch,
                        payment_method=payment_method,
                        income_category=invoice.fee_structure.category if invoice.fee_structure else None,
                        user=request.user
                    )
                    ar_account = get_or_create_child_account(
                        parent_code='1110', child_suffix='001',
                        name='Trade Debtors (Accounts Receivable)', account_type='ASSET',
                        owner=invoice.owner, branch=invoice.branch,
                        parent_name='Trade and Other Receivables'
                    )
                    series, _ = TransactionSeries.objects.get_or_create(
                        code='INV', defaults={'description': 'Invoice Transactions'}
                    )
                    payment_ref = f"{invoice.invoice_number}-PMT-{uuid.uuid4().hex[:8]}"
                    payment_date = serializer.validated_data.get('payment_date') or tz.now().date()
                    journal_entry = JournalEntry.objects.create(
                        series=series, date=payment_date,
                        description=f"Payment for invoice {invoice.invoice_number}",
                        workflow_reference=payment_ref,
                        owner=invoice.owner, branch=invoice.branch, created_by=request.user,
                        tenant=invoice.tenant,
                    )
                    JournalEntryLine.objects.create(
                        transaction=journal_entry, account=resolved_account,
                        side=JournalEntryLine.DEBIT, amount=amount
                    )
                    JournalEntryLine.objects.create(
                        transaction=journal_entry, account=ar_account,
                        side=JournalEntryLine.CREDIT, amount=amount
                    )
                    journal_entry.post()
                    invoice.amount_paid += amount
                    invoice.status = 'paid' if invoice.amount_paid >= (invoice.total_amount or invoice.amount) else 'partial'
                    invoice.save(update_fields=['amount_paid', 'status'])
                    return Response({
                        'success': True, 'receivable_id': receivable.id,
                        'receivable_type': 'invoice',
                        'amount_paid': str(amount), 'journal_entry_id': journal_entry.id,
                        'journal_entry_reference': payment_ref,
                    })

                elif receivable.receivable_type == 'entitlement':
                    from incomes.services.accounting_integration import IncomeAccountingService
                    payment_date = serializer.validated_data.get('payment_date')
                    journal_entry = IncomeAccountingService.record_entitlement_payment(
                        entitlement=source,
                        amount=amount,
                        payment_method=payment_method,
                        bank_account=bank_account,
                        user=request.user,
                        notes=serializer.validated_data.get('notes', '')
                    )
                    source.record_payment(amount, payment_date)
                    return Response({
                        'success': True, 'receivable_id': receivable.id,
                        'receivable_type': 'entitlement',
                        'amount_paid': str(amount), 'journal_entry_id': journal_entry.id,
                    })

                else:
                    return Response(
                        {'error': f'Payment recording via this endpoint is not supported for receivable_type "{receivable.receivable_type}". Use the dedicated payment endpoint.'},
                        status=status.HTTP_400_BAD_REQUEST
                    )

        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f'Error recording receivable payment: {e}', exc_info=True)
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    def list(self, request, *args, **kwargs):
        """Override list to add aging summary metadata"""
        # Get filtered queryset
        queryset = self.filter_queryset(self.get_queryset())
        
        # Calculate aging summary from the current filtered queryset
        aging_summary = {
            'current': Decimal('0.00'),
            '1-30': Decimal('0.00'),
            '31-60': Decimal('0.00'),
            '61-90': Decimal('0.00'),
            '90+': Decimal('0.00'),
            'total': Decimal('0.00'),
        }
        
        for receivable in queryset:
            balance = receivable.balance or Decimal('0.00')
            bucket = receivable.aging_bucket or 'current'
            
            if bucket in aging_summary:
                aging_summary[bucket] += balance
            aging_summary['total'] += balance
        
        # Get paginated response
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            response = self.get_paginated_response(serializer.data)
            # Add metadata with aging summary
            response.data['metadata'] = {
                'aging_summary': {
                    'current': str(aging_summary['current']),
                    '1-30': str(aging_summary['1-30']),
                    '31-60': str(aging_summary['31-60']),
                    '61-90': str(aging_summary['61-90']),
                    '90+': str(aging_summary['90+']),
                    'total': str(aging_summary['total']),
                }
            }
            return response
        
        # Non-paginated response (fallback)
        serializer = self.get_serializer(queryset, many=True)
        return Response({
            'results': serializer.data,
            'metadata': {
                'aging_summary': {
                    'current': str(aging_summary['current']),
                    '1-30': str(aging_summary['1-30']),
                    '31-60': str(aging_summary['31-60']),
                    '61-90': str(aging_summary['61-90']),
                    '90+': str(aging_summary['90+']),
                    'total': str(aging_summary['total']),
                }
            }
        })

    @action(detail=False, methods=['post'])
    def calculate_aging_batch(self, request):
        '''Batch update aging for all receivables'''
        count = ReceivablesService.calculate_aging_for_all()
        return Response({'updated_count': count}, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'])
    def apply_interest_batch(self, request):
        '''Apply overdue interest to all overdue receivables'''
        count = ReceivablesService.apply_overdue_interest_batch()
        return Response({'applied_count': count}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='write_off')
    def write_off(self, request, pk=None):
        """
        Write off an outstanding receivable.

        Sets the receivable status to 'written_off' and records an activity log.
        Requires a reason. Optionally accepts a write_off_amount; if omitted the
        full outstanding balance is written off.

        Body:
          - reason (str, required): explanation for the write-off
          - amount (Decimal, optional): partial write-off amount; defaults to full balance
        """
        try:
            from permissions.services import PermissionResolver
            effective = PermissionResolver.resolve(
                request.user, module='receivables', page='customer-receivables', action='write_off',
            )
            if not effective.can_approve:
                return Response(
                    {'detail': 'You do not have permission to write off receivables.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
        except Exception:
            pass  # Fail-open during rollout

        receivable = self.get_object()

        if receivable.status == 'written_off':
            return Response(
                {'error': 'This receivable has already been written off'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if receivable.status == 'paid':
            return Response(
                {'error': 'Cannot write off a fully paid receivable'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        reason = (request.data.get('reason') or '').strip()
        if not reason:
            return Response(
                {'error': 'A reason is required for write-off'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        balance = receivable.amount - receivable.amount_paid
        write_off_amount = request.data.get('amount')
        if write_off_amount is not None:
            write_off_amount = Decimal(str(write_off_amount))
            if write_off_amount <= 0 or write_off_amount > balance:
                return Response(
                    {'error': f'Write-off amount must be between 0 and {balance}'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            write_off_amount = balance

        with transaction.atomic():
            # Treat write-off as a pseudo-payment so balance recomputes
            receivable.amount_paid = receivable.amount_paid + write_off_amount
            receivable.status = 'written_off' if receivable.amount_paid >= receivable.amount else 'partial'
            receivable.save(update_fields=['amount_paid', 'status'])

            # Log the activity
            ReceivableActivityLog.objects.create(
                receivable=receivable,
                activity_type='write_off',
                description=f'Write-off of {write_off_amount} — {reason}',
                performed_by=request.user,
                owner=request.user,
                branch=getattr(request.user, 'branch', None),
                tenant=getattr(request.user, 'tenant', None),
            )

        serializer = self.get_serializer(receivable)
        return Response({
            'success': True,
            'message': f'Successfully wrote off {write_off_amount}',
            'receivable': serializer.data,
        })

    @action(detail=True, methods=['post'], url_path='apply_credit_note')
    def apply_credit_note(self, request, pk=None):
        """
        Apply a credit note against a receivable to reduce its balance.

        Body:
          - credit_note_id (int, required): ID of the sales credit note
          - amount (Decimal, optional): amount to apply; defaults to credit note remaining or receivable balance (whichever is smaller)
        """
        receivable = self.get_object()

        if receivable.status in ('paid', 'written_off'):
            return Response(
                {'error': 'Cannot apply credit note to a paid or written-off receivable'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        credit_note_id = request.data.get('credit_note_id')
        if not credit_note_id:
            return Response(
                {'error': 'credit_note_id is required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Try to load the credit note from the sales module
        try:
            from sales.models import CreditNote
            credit_note = CreditNote.objects.get(id=credit_note_id)
        except Exception:
            return Response(
                {'error': 'Credit note not found'},
                status=status.HTTP_404_NOT_FOUND,
            )

        balance = receivable.amount - receivable.amount_paid
        cn_remaining = credit_note.remaining_amount if hasattr(credit_note, 'remaining_amount') else Decimal(str(credit_note.total_amount or 0))

        apply_amount = request.data.get('amount')
        if apply_amount is not None:
            apply_amount = Decimal(str(apply_amount))
            if apply_amount <= 0:
                return Response({'error': 'Amount must be positive'}, status=status.HTTP_400_BAD_REQUEST)
            if apply_amount > balance:
                return Response({'error': f'Amount exceeds receivable balance of {balance}'}, status=status.HTTP_400_BAD_REQUEST)
            if apply_amount > cn_remaining:
                return Response({'error': f'Amount exceeds credit note remaining of {cn_remaining}'}, status=status.HTTP_400_BAD_REQUEST)
        else:
            apply_amount = min(balance, cn_remaining)

        if apply_amount <= 0:
            return Response({'error': 'No amount available to apply'}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            receivable.amount_paid = receivable.amount_paid + apply_amount
            receivable.status = 'paid' if receivable.amount_paid >= receivable.amount else 'partial'
            receivable.save(update_fields=['amount_paid', 'status'])

            # Update credit note if it has applied_amount field
            if hasattr(credit_note, 'applied_amount'):
                credit_note.applied_amount = (credit_note.applied_amount or Decimal('0')) + apply_amount
                credit_note.save(update_fields=['applied_amount'])

            ReceivableActivityLog.objects.create(
                receivable=receivable,
                activity_type='credit_note_applied',
                description=f'Credit note #{credit_note_id} applied: {apply_amount}',
                amount=apply_amount,
                performed_by=request.user,
                owner=request.user,
                branch=getattr(request.user, 'branch', None),
                tenant=getattr(request.user, 'tenant', None),
            )

        serializer = self.get_serializer(receivable)
        return Response({
            'success': True,
            'message': f'Credit note applied: {apply_amount}',
            'receivable': serializer.data,
        })

    @action(detail=True, methods=['post'], url_path='issue_refund')
    def issue_refund(self, request, pk=None):
        """
        Issue a refund against a receivable (reverses a prior payment).

        Body:
          - amount (Decimal, required): refund amount
          - reason (str, required): reason for the refund
          - refund_method (str, optional): 'bank_transfer' | 'cash' | 'cheque'
        """
        try:
            from permissions.services import PermissionResolver
            from decimal import Decimal as _Decimal
            effective = PermissionResolver.resolve(
                request.user, module='receivables', page='customer-receivables', action='issue_refund',
            )
            if not effective.can_approve:
                return Response(
                    {'detail': 'You do not have permission to issue refunds.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
            if effective.approval_limit is not None:
                refund_val = request.data.get('amount')
                if refund_val is not None:
                    if _Decimal(str(refund_val)) > _Decimal(str(effective.approval_limit)):
                        return Response(
                            {'detail': f'Refund amount exceeds your approval limit of {effective.approval_limit}.'},
                            status=status.HTTP_403_FORBIDDEN,
                        )
        except Exception:
            pass  # Fail-open during rollout

        receivable = self.get_object()

        if receivable.amount_paid <= 0:
            return Response(
                {'error': 'No payments to refund on this receivable'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        reason = (request.data.get('reason') or '').strip()
        if not reason:
            return Response({'error': 'A reason is required'}, status=status.HTTP_400_BAD_REQUEST)

        refund_amount = request.data.get('amount')
        if refund_amount is None:
            return Response({'error': 'Amount is required'}, status=status.HTTP_400_BAD_REQUEST)
        refund_amount = Decimal(str(refund_amount))

        if refund_amount <= 0:
            return Response({'error': 'Refund amount must be positive'}, status=status.HTTP_400_BAD_REQUEST)
        if refund_amount > receivable.amount_paid:
            return Response(
                {'error': f'Refund amount cannot exceed payments received ({receivable.amount_paid})'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        refund_method = request.data.get('refund_method', 'bank_transfer')

        with transaction.atomic():
            receivable.amount_paid = receivable.amount_paid - refund_amount
            # Recompute status
            if receivable.amount_paid <= 0:
                receivable.status = 'unpaid'
            elif receivable.amount_paid < receivable.amount:
                receivable.status = 'partial'
            else:
                receivable.status = 'paid'
            receivable.save(update_fields=['amount_paid', 'status'])

            ReceivableActivityLog.objects.create(
                receivable=receivable,
                activity_type='refund',
                description=f'Refund of {refund_amount} via {refund_method} — {reason}',
                amount=-refund_amount,
                performed_by=request.user,
                owner=request.user,
                branch=getattr(request.user, 'branch', None),
                tenant=getattr(request.user, 'tenant', None),
            )

        serializer = self.get_serializer(receivable)
        return Response({
            'success': True,
            'message': f'Refund of {refund_amount} issued successfully',
            'receivable': serializer.data,
        })

    @action(detail=False, methods=['get'], url_path='aging_report')
    def aging_report(self, request):
        '''Get aging report for all receivables'''
        from datetime import datetime
        
        # Get query parameters
        as_of_date = request.query_params.get('as_of_date')
        branch_id = request.query_params.get('branch')
        
        # Parse date if provided
        if as_of_date:
            try:
                as_of_date = datetime.strptime(as_of_date, '%Y-%m-%d').date()
            except ValueError:
                return Response(
                    {'error': 'Invalid date format. Use YYYY-MM-DD'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        
        # Get branch if specified
        branch = None
        if branch_id:
            from branches.models import Branch
            try:
                branch = Branch.objects.get(id=branch_id)
            except Branch.DoesNotExist:
                return Response(
                    {'error': f'Branch {branch_id} not found'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        
        # Get aging report
        owner = request.user if hasattr(request.user, 'tenant') else None
        report_data = ReceivablesService.get_aging_report(branch=branch, owner=owner)
        
        # Calculate totals
        totals = {
            'current': sum(item['current'] for item in report_data),
            '1-30': sum(item['1-30'] for item in report_data),
            '31-60': sum(item['31-60'] for item in report_data),
            '61-90': sum(item['61-90'] for item in report_data),
            '90+': sum(item['90+'] for item in report_data),
            'total': sum(item['total'] for item in report_data),
        }
        
        return Response({
            'as_of_date': as_of_date or datetime.now().date(),
            'total_clients': len(report_data),
            'totals': {
                'current': str(totals['current']),
                '1-30': str(totals['1-30']),
                '31-60': str(totals['31-60']),
                '61-90': str(totals['61-90']),
                '90+': str(totals['90+']),
                'total': str(totals['total']),
            },
            'clients': [
                {
                    'client_id': item['client'].id,
                    'client_name': item['client_name'],
                    'current': str(item['current']),
                    '1-30': str(item['1-30']),
                    '31-60': str(item['31-60']),
                    '61-90': str(item['61-90']),
                    '90+': str(item['90+']),
                    'total': str(item['total']),
                }
                for item in report_data
            ]
        }, status=status.HTTP_200_OK)

    def get_serializer_class(self):
        # Use a richer serializer for retrieve/detail
        if self.action in ['retrieve']:
            from .serializers import CustomerReceivableDetailSerializer
            return CustomerReceivableDetailSerializer
        return super().get_serializer_class()


class ReceivableActivityLogViewSet(ScopedModelViewSet):
    '''Activity log viewset (read-only)'''
    permission_module = 'receivables'
    permission_page = 'receivable-activity'
    queryset = ReceivableActivityLog.objects.select_related(
        'receivable', 'performed_by'
    ).all()
    serializer_class = ReceivableActivityLogSerializer
    filterset_fields = ['receivable', 'activity_type']
    ordering = ['-created_at']


class CustomerStatementViewSet(ScopedModelViewSet):
    '''Customer statement viewset'''
    permission_module = 'receivables'
    permission_page = 'customer-statements'
    queryset = CustomerStatement.objects.select_related(
        'client', 'generated_by'
    ).all()
    serializer_class = CustomerStatementSerializer
    filterset_fields = ['client', 'statement_date']
    search_fields = ['statement_number', 'client__name']
    ordering = ['-statement_date']