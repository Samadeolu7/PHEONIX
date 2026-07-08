# clients/views_statement.py
"""
Statement of Account Views
Provides detailed statement of accounts for clients showing:
- All invoices (service and inventory)
- Payment history
- Balance due
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Q, Sum, F, Case, When, DecimalField
from django.utils import timezone
from decimal import Decimal

from common.views import ScopedModelViewSet
from common.managers import _thread_locals as _mgr_locals
from .models import Client
from incomes.models import Invoice as ServiceInvoice
from inventory.models import Invoice as InventoryInvoice
from transactions.models import Transaction


def _clear_tenant_for_query(model_manager, client, extra_filters=None, **order_by_args):
    """
    Execute a queryset on model_manager filtered by client, bypassing the
    OwnerBranchManager automatic tenant thread-local filter.

    Why: invoices (and transactions) created before the tenant-resolution fix
    were saved with tenant=NULL.  The OwnerBranchManager adds
      AND tenant_id = <thread_local>
    to every query, which hides NULL-tenant records.  Clearing the thread-local
    for the duration of .filter() removes that auto-filter while keeping our
    explicit client=client scope (the client itself is already tenant-verified
    via self.get_object()).
    """
    saved = getattr(_mgr_locals, 'tenant', None)
    _mgr_locals.tenant = None
    try:
        qs = model_manager.filter(client=client, is_deleted=False)
        if extra_filters:
            qs = qs.filter(**extra_filters)
    finally:
        _mgr_locals.tenant = saved
    return qs


def _get_payment_transactions(invoice_ref_fragment):
    """
    Return Transaction PAYMENT objects whose workflow_reference contains both
    the invoice number fragment AND the '-PMT-' marker that the import pipeline
    appends to payment JEs (e.g. 'FEE-S245-20250915-PMT-FCC91A7C').

    Without the '-PMT-' requirement the invoice-posting JE (which carries the
    bare invoice number as its workflow_reference, e.g. 'FEE-S245-20250915')
    would also be returned, doubling the credit side of the ledger.

    Bypasses the OwnerBranchManager automatic tenant thread-local filter so
    that invoices created before the tenant-resolution fix (tenant=NULL) are
    still found.
    """
    saved = getattr(_mgr_locals, 'tenant', None)
    _mgr_locals.tenant = None
    try:
        qs = Transaction.objects.filter(
            workflow_reference__icontains=invoice_ref_fragment,
            is_deleted=False,
            approved=True,
        ).filter(
            workflow_reference__icontains='-PMT-'
        ).select_related('created_by', 'approved_by')
    finally:
        _mgr_locals.tenant = saved
    return qs


class ClientStatementViewSet(ScopedModelViewSet):
    """
    ViewSet for Client Statement of Account

    Provides comprehensive financial statement for clients showing:
    - All service invoices
    - All inventory invoices
    - Payment history
    - Outstanding balances
    """
    permission_module = 'clients'
    permission_page = 'clients'
    queryset = Client.objects.all()
    permission_classes = [IsAuthenticated]
    officer_client_lookup = 'assigned_officer'

    @action(detail=True, methods=['get'])
    def statement_of_account(self, request, pk=None):
        """
        Get comprehensive statement of account for a client

        Query Parameters:
        - date_from: Start date (YYYY-MM-DD)
        - date_to: End date (YYYY-MM-DD)
        - include_paid: Include fully paid invoices (default: true)
        - invoice_type: Filter by invoice type ('service', 'inventory', or 'all')
        """
        client = self.get_object()

        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        include_paid = request.query_params.get('include_paid', 'true').lower() == 'true'
        invoice_type = request.query_params.get('invoice_type', 'all')

        statement_items = []

        #  Service invoices 
        if invoice_type in ['all', 'service']:
            service_invoices = _clear_tenant_for_query(
                ServiceInvoice.objects, client
            ).select_related('owner')

            if date_from:
                service_invoices = service_invoices.filter(invoice_date__gte=date_from)
            if date_to:
                service_invoices = service_invoices.filter(invoice_date__lte=date_to)
            if not include_paid:
                service_invoices = service_invoices.exclude(status='paid')

            service_invoices = service_invoices.order_by('invoice_date', 'created_at')

            for invoice in service_invoices:
                statement_items.append({
                    'type': 'service_invoice',
                    'invoice_id': invoice.id,
                    'invoice_number': invoice.invoice_number,
                    'invoice_date': invoice.invoice_date.isoformat(),
                    'due_date': invoice.due_date.isoformat() if invoice.due_date else None,
                    'description': invoice.description or 'Service Invoice',
                    'amount': float(invoice.total_amount),
                    'amount_paid': float(invoice.amount_paid),
                    'balance': float(invoice.balance),
                    'status': invoice.status,
                    'status_display': invoice.get_status_display(),
                    'is_overdue': invoice.is_overdue if hasattr(invoice, 'is_overdue') else False,
                    'payments': [],
                    'created_by': invoice.owner.get_full_name() if invoice.owner else None,
                })

        #  Inventory invoices 
        if invoice_type in ['all', 'inventory']:
            inventory_invoices = _clear_tenant_for_query(
                InventoryInvoice.objects, client
            ).select_related('owner')

            if date_from:
                inventory_invoices = inventory_invoices.filter(invoice_date__gte=date_from)
            if date_to:
                inventory_invoices = inventory_invoices.filter(invoice_date__lte=date_to)
            if not include_paid:
                inventory_invoices = inventory_invoices.exclude(status='paid')

            inventory_invoices = inventory_invoices.order_by('invoice_date', 'created_at')

            for invoice in inventory_invoices:
                material_request_info = None
                from inventory.models_material_request import MaterialRequest
                material_requests = MaterialRequest.objects.filter(
                    inventory_invoice=invoice
                ).select_related('requested_by')

                if material_requests.exists():
                    mr = material_requests.first()
                    material_request_info = {
                        'request_number': mr.request_number,
                        'request_date': mr.request_date.isoformat(),
                        'requested_by': mr.requested_by.get_full_name(),
                        'purpose': mr.purpose,
                    }

                statement_items.append({
                    'type': 'inventory_invoice',
                    'invoice_id': invoice.id,
                    'invoice_number': invoice.invoice_number,
                    'invoice_date': invoice.invoice_date.isoformat(),
                    'due_date': invoice.due_date.isoformat(),
                    'description': invoice.notes or 'Inventory Invoice',
                    'amount': float(invoice.total_amount),
                    'amount_paid': float(invoice.amount_paid),
                    'balance': float(invoice.balance),
                    'status': invoice.status,
                    'status_display': invoice.get_status_display(),
                    'payments': [],
                    'material_request': material_request_info,
                    'created_by': invoice.owner.get_full_name() if invoice.owner else None,
                })

        #  Sort + totals 
        statement_items.sort(key=lambda x: x['invoice_date'])

        total_invoiced = sum(item['amount'] for item in statement_items)
        total_paid = sum(item['amount_paid'] for item in statement_items)
        total_balance = sum(item['balance'] for item in statement_items)
        pending_count = sum(1 for item in statement_items if item['status'] in ['draft', 'sent'])
        partial_count = sum(1 for item in statement_items if item['status'] == 'partial')
        paid_count = sum(1 for item in statement_items if item['status'] == 'paid')
        overdue_count = sum(1 for item in statement_items if item.get('is_overdue', False))

        return Response({
            'client': {
                'id': client.id,
                'client_id': client.client_id,
                'name': client.full_name,
                'email': client.email,
                'phone': client.phone_primary,
                'status': client.status,
            },
            'period': {'date_from': date_from, 'date_to': date_to},
            'summary': {
                'total_invoiced': total_invoiced,
                'total_paid': total_paid,
                'total_balance': total_balance,
                'invoice_count': len(statement_items),
                'pending_count': pending_count,
                'partial_count': partial_count,
                'paid_count': paid_count,
                'overdue_count': overdue_count,
            },
            'statement_items': statement_items,
        })

    @action(detail=True, methods=['get'])
    def payment_history(self, request, pk=None):
        """Get payment history for a client"""
        client = self.get_object()
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        payments = []
        total_amount = Decimal('0.00')
        return Response({
            'client': {'id': client.id, 'name': client.full_name},
            'period': {'date_from': date_from, 'date_to': date_to},
            'total_amount': float(total_amount),
            'payment_count': len(payments),
            'payments': payments,
        })

    @action(detail=True, methods=['get'])
    def outstanding_invoices(self, request, pk=None):
        """Get all outstanding (unpaid/partially paid) invoices for a client"""
        client = self.get_object()
        outstanding_items = []

        #  Service invoices 
        service_invoices = (
            _clear_tenant_for_query(ServiceInvoice.objects, client)
            .exclude(status__in=['paid', 'cancelled'])
            .order_by('due_date')
        )
        for invoice in service_invoices:
            outstanding_items.append({
                'type': 'service_invoice',
                'invoice_id': invoice.id,
                'invoice_number': invoice.invoice_number,
                'invoice_date': invoice.invoice_date.isoformat(),
                'due_date': invoice.due_date.isoformat() if invoice.due_date else None,
                'amount': float(invoice.total_amount),
                'amount_paid': float(invoice.amount_paid),
                'balance': float(invoice.balance),
                'status': invoice.status,
                'days_overdue': (
                    (timezone.now().date() - invoice.due_date).days
                    if invoice.due_date and invoice.due_date < timezone.now().date() else 0
                ),
            })

        #  Inventory invoices 
        inventory_invoices = (
            _clear_tenant_for_query(InventoryInvoice.objects, client)
            .exclude(status__in=['paid', 'cancelled'])
            .order_by('due_date')
        )
        for invoice in inventory_invoices:
            outstanding_items.append({
                'type': 'inventory_invoice',
                'invoice_id': invoice.id,
                'invoice_number': invoice.invoice_number,
                'invoice_date': invoice.invoice_date.isoformat(),
                'due_date': invoice.due_date.isoformat(),
                'amount': float(invoice.total_amount),
                'amount_paid': float(invoice.amount_paid),
                'balance': float(invoice.balance),
                'status': invoice.status,
                'days_overdue': (
                    (timezone.now().date() - invoice.due_date).days
                    if invoice.due_date < timezone.now().date() else 0
                ),
            })

        outstanding_items.sort(key=lambda x: x.get('due_date') or '9999-12-31')
        total_outstanding = sum(item['balance'] for item in outstanding_items)

        return Response({
            'client': {'id': client.id, 'name': client.full_name},
            'total_outstanding': total_outstanding,
            'invoice_count': len(outstanding_items),
            'outstanding_invoices': outstanding_items,
        })

    @action(detail=True, methods=['get'])
    def account_ledger(self, request, pk=None):
        """
        Get client account ledger showing all transactions (invoices and payments)
        with a running balance.

        Query Parameters:
        - date_from: Start date (YYYY-MM-DD)
        - date_to: End date (YYYY-MM-DD)
        """
        client = self.get_object()
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')

        ledger_entries = []

        #  Service invoices 
        service_invoices = _clear_tenant_for_query(
            ServiceInvoice.objects, client
        ).select_related('owner', 'journal_entry', 'created_by', 'posted_by')

        if date_from:
            service_invoices = service_invoices.filter(invoice_date__gte=date_from)
        if date_to:
            service_invoices = service_invoices.filter(invoice_date__lte=date_to)

        for invoice in service_invoices:
            invoice_amount = invoice.total_amount or invoice.amount or Decimal('0.00')
            ledger_entries.append({
                'date': invoice.invoice_date.isoformat(),
                'transaction_type': 'invoice',
                'invoice_type': 'service',
                'reference': invoice.invoice_number,
                'description': invoice.description or 'Service Invoice',
                'debit': float(invoice_amount),
                'credit': 0.0,
                'invoice_id': invoice.id,
                'journal_entry_reference': (
                    invoice.journal_entry.reference_number
                    if invoice.journal_entry else None
                ),
                'status': invoice.status,
                'details': {
                    'created_by': invoice.created_by.get_full_name() if invoice.created_by else None,
                    'created_at': invoice.created_at.isoformat() if invoice.created_at else None,
                    'is_posted': invoice.is_posted,
                    'posted_by': invoice.posted_by.get_full_name() if invoice.posted_by else None,
                    'posted_at': invoice.posted_at.isoformat() if invoice.posted_at else None,
                    'due_date': invoice.due_date.isoformat() if invoice.due_date else None,
                    'subtotal': float(invoice.subtotal) if invoice.subtotal else 0.0,
                    'discount_amount': float(invoice.discount_amount) if invoice.discount_amount else 0.0,
                    'tax_amount': float(invoice.tax_amount) if invoice.tax_amount else 0.0,
                    'amount_paid': float(invoice.amount_paid),
                    'balance': float(invoice.balance),
                    'notes': invoice.notes or '',
                },
            })

        #  Inventory invoices 
        inventory_invoices = _clear_tenant_for_query(
            InventoryInvoice.objects, client
        ).select_related('owner', 'created_by', 'posted_by')

        if date_from:
            inventory_invoices = inventory_invoices.filter(invoice_date__gte=date_from)
        if date_to:
            inventory_invoices = inventory_invoices.filter(invoice_date__lte=date_to)

        for invoice in inventory_invoices:
            invoice_amount = (
                invoice.total_amount
                or (invoice.amount if hasattr(invoice, 'amount') else Decimal('0.00'))
            )
            ledger_entries.append({
                'date': invoice.invoice_date.isoformat(),
                'transaction_type': 'invoice',
                'invoice_type': 'inventory',
                'reference': invoice.invoice_number,
                'description': invoice.notes or 'Inventory Invoice',
                'debit': float(invoice_amount),
                'credit': 0.0,
                'invoice_id': invoice.id,
                'journal_entry_reference': None,
                'status': invoice.status,
                'details': {
                    'created_by': invoice.created_by.get_full_name() if invoice.created_by else None,
                    'created_at': invoice.created_at.isoformat() if invoice.created_at else None,
                    'is_posted': invoice.is_posted,
                    'posted_by': invoice.posted_by.get_full_name() if invoice.posted_by else None,
                    'posted_at': invoice.posted_at.isoformat() if invoice.posted_at else None,
                    'due_date': invoice.due_date.isoformat() if invoice.due_date else None,
                    'subtotal': float(invoice.subtotal) if hasattr(invoice, 'subtotal') and invoice.subtotal else 0.0,
                    'discount': float(invoice.discount) if hasattr(invoice, 'discount') and invoice.discount else 0.0,
                    'tax_amount': float(invoice.tax_amount) if hasattr(invoice, 'tax_amount') and invoice.tax_amount else 0.0,
                    'amount_paid': float(invoice.amount_paid),
                    'balance': float(invoice.balance),
                    'notes': invoice.notes or '',
                },
            })

        #  Payment journal entries 
        # Payments are Transactions whose workflow_reference contains the
        # invoice number of one of this client's invoices.
        service_invoice_numbers = list(
            service_invoices.values_list('invoice_number', flat=True)
        )
        inventory_invoice_numbers = list(
            inventory_invoices.values_list('invoice_number', flat=True)
        )
        all_invoice_numbers = service_invoice_numbers + inventory_invoice_numbers

        for invoice_num in all_invoice_numbers:
            for payment in _get_payment_transactions(invoice_num):
                workflow_ref = payment.workflow_reference or ''

                if date_from:
                    try:
                        from datetime import date as _date
                        pdate = payment.date if hasattr(payment, 'date') else payment.created_at.date()
                        if pdate < _date.fromisoformat(date_from):
                            continue
                    except Exception:
                        pass
                if date_to:
                    try:
                        from datetime import date as _date
                        pdate = payment.date if hasattr(payment, 'date') else payment.created_at.date()
                        if pdate > _date.fromisoformat(date_to):
                            continue
                    except Exception:
                        pass

                payment_amount = Decimal('0.00')
                entries_detail = []
                for entry in payment.entries.all():
                    entries_detail.append({
                        'account_code': entry.account.code if entry.account else '',
                        'account_name': entry.account.name if entry.account else '',
                        'side': entry.side,
                        'amount': float(entry.amount),
                    })
                    if entry.side in ('CR', 'CREDIT'):
                        payment_amount += entry.amount

                payment_date = (
                    payment.date.isoformat()
                    if hasattr(payment, 'date')
                    else payment.created_at.date().isoformat()
                )

                # A reversal of a payment INCREASES the customer's outstanding
                # balance (Dr: AR, Cr: Bank).  Show it in the DEBIT column so
                # the running balance goes up, not down.
                is_reversal = getattr(payment, 'is_reversal', False)
                ledger_entries.append({
                    'date': payment_date,
                    'transaction_type': 'payment_reversal' if is_reversal else 'payment',
                    'reference': payment.reference_number,
                    'description': payment.description or ('Payment Reversal' if is_reversal else 'Payment'),
                    'debit': float(payment_amount) if is_reversal else 0.0,
                    'credit': 0.0 if is_reversal else float(payment_amount),
                    'journal_entry_id': payment.id,
                    'journal_entry_reference': payment.reference_number,
                    'related_invoice': invoice_num,
                    'details': {
                        'created_by': payment.created_by.get_full_name() if payment.created_by else None,
                        'created_at': payment.created_at.isoformat() if payment.created_at else None,
                        'approved': payment.approved,
                        'approved_by': payment.approved_by.get_full_name() if payment.approved_by else None,
                        'approved_at': payment.approved_at.isoformat() if payment.approved_at else None,
                        'workflow_reference': workflow_ref,
                        'is_reversed': payment.is_reversed,
                        'is_reversal': is_reversal,
                        'entries': entries_detail,
                    },
                })

        #  Sort + running balance 
        ledger_entries.sort(key=lambda x: (x['date'], x['transaction_type'] == 'payment'))

        running_balance = Decimal('0.00')
        for entry in ledger_entries:
            running_balance += Decimal(str(entry['debit'])) - Decimal(str(entry['credit']))
            entry['balance'] = float(running_balance)

        total_debits = sum(Decimal(str(e['debit'])) for e in ledger_entries)
        total_credits = sum(Decimal(str(e['credit'])) for e in ledger_entries)

        return Response({
            'client': {
                'id': client.id,
                'client_id': client.client_id,
                'name': client.full_name,
                'email': client.email,
                'phone': client.phone_primary,
                'status': client.status,
            },
            'period': {'date_from': date_from, 'date_to': date_to},
            'summary': {
                'total_invoiced': float(total_debits),
                'total_paid': float(total_credits),
                'current_balance': float(running_balance),
                'transaction_count': len(ledger_entries),
            },
            'ledger_entries': ledger_entries,
        })
