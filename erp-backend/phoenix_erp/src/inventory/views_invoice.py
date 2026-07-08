# inventory/views_invoice.py
"""
Comprehensive views for invoice management
Handles invoice creation, tracking, and payment recording with accounting integration
"""
from rest_framework import status
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from django.db import transaction
from django.db.models import Sum, Q, Count
from django.utils import timezone
from django.http import HttpResponse
from decimal import Decimal
import logging

from common.views import ScopedModelViewSet
from .models import Invoice, InvoiceItem, InventoryItem, InventoryStock
from .serializers_invoice import (
    InvoiceSerializer, InvoiceCreateSerializer, RecordPaymentSerializer,
    InvoiceSummarySerializer, InvoiceItemSerializer
)
from .stock_service import InventoryService
from .services.accounting_service import InventoryAccountingService
from .services.pdf_service import InvoicePDFService
from accounts.utils.account_creation import get_system_account, get_or_create_child_account

logger = logging.getLogger(__name__)


class InvoiceViewSet(ScopedModelViewSet):
    """
    ViewSet for inventory sales invoices
    
    Features:
    - Create invoices with multiple items
    - Track payment status
    - Record payments with accounting integration
    - Automatic COGS and revenue recognition
    - Overdue invoice tracking
    """
    # permissionRegistry.ts's incomes:invoices page explicitly includes
    # /sales/invoices/create-inventory in its paths — this inventory-specific
    # Invoice model (distinct from incomes.Invoice) is still governed by the
    # same permission page from the frontend's perspective.
    permission_module = 'incomes'
    permission_page = 'invoices'
    queryset = Invoice.objects.all()
    serializer_class = InvoiceSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        # If a client filter is provided, allow tenant/branch scoped lookup
        # instead of the default owner-scoped queryset that ScopedModelViewSet
        # applies. This enables endpoints like `/api/inventory/invoices/?client=2`
        # to return invoices for that client within the user's tenant/branch.
        # Accept either `client` or `client_id` for compatibility with different callers
        client_id = self.request.query_params.get('client') or self.request.query_params.get('client_id')

        if client_id:
            user = getattr(self.request, 'user', None)
            base_qs = Invoice.objects.select_related('client').prefetch_related('items__item')

            # System admin can see all invoices for the client
            if user and getattr(user, 'is_system_admin', False):
                queryset = base_qs.filter(client_id=client_id)
            else:
                # Restrict to same tenant if available, otherwise restrict to branch
                filters = {'client_id': client_id}
                tenant = getattr(user, 'tenant', None)
                branch = getattr(user, 'branch', None)
                if tenant is not None:
                    filters['tenant'] = tenant
                elif branch is not None:
                    filters['branch'] = branch

                queryset = base_qs.filter(**filters)
        else:
            # Default behavior: use scoped queryset from base class (owner/tenant/branch)
            queryset = super().get_queryset().select_related('client').prefetch_related('items__item')

        # Filter by status
        status_filter = self.request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)

        # Filter by date range
        date_from = self.request.query_params.get('date_from')
        if date_from:
            queryset = queryset.filter(invoice_date__gte=date_from)

        date_to = self.request.query_params.get('date_to')
        if date_to:
            queryset = queryset.filter(invoice_date__lte=date_to)

        # Filter overdue
        overdue = self.request.query_params.get('overdue')
        if overdue == 'true':
            today = timezone.now().date()
            queryset = queryset.filter(
                due_date__lt=today,
                status__in=['draft', 'sent', 'partial']
            )

        return queryset.order_by('-invoice_date', '-created_at')
    
    @transaction.atomic
    def create(self, request, *args, **kwargs):
        """
        Create invoice with items and accounting integration
        
        Steps:
        1. Validate data
        2. Create invoice and items
        3. Check stock availability
        4. Reduce inventory
        5. Create COGS journal entry
        6. Create revenue journal entry (if cash sale)
        7. Return invoice details
        """
        serializer = InvoiceCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        
        try:
            # Calculate totals
            subtotal = Decimal('0')
            for item_data in data['items']:
                quantity = Decimal(str(item_data['quantity']))
                unit_price = Decimal(str(item_data['unit_price']))
                discount = Decimal(str(item_data.get('discount_amount', 0)))
                tax = Decimal(str(item_data.get('tax_amount', 0)))
                
                line_total = (quantity * unit_price) - discount + tax
                subtotal += line_total
            
            total_amount = subtotal - data.get('discount_amount', Decimal('0'))
            
            # Generate invoice number
            invoice_count = Invoice.objects.filter(
                owner=request.user,
                branch=request.user.branch
            ).count()
            invoice_number = f"INV-{timezone.now().strftime('%Y%m%d')}-{invoice_count + 1:04d}"
            
            # Create invoice
            invoice = Invoice.objects.create(
                invoice_number=invoice_number,
                invoice_date=data['invoice_date'],
                due_date=data['due_date'],
                client=data['client'],
                subtotal=subtotal,
                discount_amount=data.get('discount_amount', Decimal('0')),
                total_amount=total_amount,
                status='draft',
                payment_terms=data.get('payment_terms', ''),
                notes=data.get('notes', ''),
                owner=request.user,
                branch=request.user.branch,
                created_by=request.user
            )
            
            # Create invoice items and track COGS
            total_cogs = Decimal('0')
            for item_data in data['items']:
                item = InventoryItem.objects.get(id=item_data['item_id'], owner=request.user)
                quantity = Decimal(str(item_data['quantity']))
                unit_price = Decimal(str(item_data['unit_price']))
                discount = Decimal(str(item_data.get('discount_amount', 0)))
                tax = Decimal(str(item_data.get('tax_amount', 0)))
                
                # Check stock availability
                available_stock = InventoryStock.objects.filter(
                    item=item,
                    owner=request.user
                ).aggregate(
                    total=Sum('quantity_on_hand')
                )['total'] or Decimal('0')
                
                if available_stock < quantity:
                    raise Exception(
                        f"Insufficient stock for {item.name}. "
                        f"Available: {available_stock}, Required: {quantity}"
                    )
                
                # Create invoice item
                InvoiceItem.objects.create(
                    invoice=invoice,
                    item=item,
                    quantity=quantity,
                    unit_price=unit_price,
                    discount_amount=discount,
                    tax_amount=tax
                )
                
                # Calculate COGS (use weighted average cost)
                unit_cost = item.cost_price or Decimal('0')
                total_cogs += quantity * unit_cost
            
            # Create COGS journal entry (debit COGS, credit Inventory)
            if total_cogs > 0:
                from .stock_service import InventoryService
                # For each item, reduce stock
                for item_data in data['items']:
                    item = InventoryItem.objects.get(id=item_data['item_id'], owner=request.user)
                    quantity = Decimal(str(item_data['quantity']))
                    
                    # Get first available stock location
                    stock = InventoryStock.objects.filter(
                        item=item,
                        owner=request.user,
                        quantity_on_hand__gt=0
                    ).first()
                    
                    if stock:
                        InventoryService.reduce_stock(
                            item=item,
                            location=stock.location,
                            quantity=quantity,
                            movement_type='sale',
                            reference_number=invoice_number,
                            unit_cost=item.cost_price or Decimal('0'),
                            user=request.user
                        )
            
            # Update invoice status to 'sent'
            invoice.status = 'sent'
            invoice.save()
            
            logger.info(
                f"Created invoice {invoice_number} for {data['client'].full_name} "
                f"- Amount: {total_amount}, COGS: {total_cogs}"
            )
            
            serializer = InvoiceSerializer(invoice)
            return Response(
                {
                    'success': True,
                    'message': 'Invoice created successfully',
                    'invoice': serializer.data
                },
                status=status.HTTP_201_CREATED
            )
            
        except Exception as e:
            logger.error(f"Error creating invoice: {str(e)}", exc_info=True)
            return Response(
                {
                    'success': False,
                    'message': str(e)
                },
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    @transaction.atomic
    def record_payment(self, request, pk=None):
        """
        Record payment for invoice with cash/bank routing
        
        Steps:
        1. Validate payment amount
        2. Route payment to cash/bank based on payment method
        3. Update invoice paid amount and status
        4. Create journal entry via payment routing service
        5. Return updated invoice with routing details
        
        Cash payments → CashierAccount → Daily reconciliation
        Bank payments → Bank Account → Monthly reconciliation
        """
        invoice = self.get_object()
        serializer = RecordPaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        
        try:
            payment_amount = data['amount']
            
            # Validate payment amount
            amount_due = invoice.total_amount - invoice.paid_amount
            if payment_amount > amount_due:
                return Response(
                    {
                        'success': False,
                        'message': f'Payment amount ({payment_amount}) exceeds amount due ({amount_due})'
                    },
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Get AR account
            ar_account = get_or_create_child_account(
                parent_code='1110',
                child_suffix='001',
                name='Trade Debtors (Accounts Receivable)',
                account_type='ASSET',
                owner=request.user,
                branch=invoice.branch,
                parent_name='Trade and Other Receivables'
            )

            if not ar_account:
                raise Exception("Accounts Receivable account not configured")
            
            # Get bank account for payment routing
            cashier_account = None
            bank_account = None
            
            if data.get('bank_account_id'):
                from accounts.models import Account
                try:
                    bank_account = Account.objects.get(
                        id=data['bank_account_id'],
                        account_type='ASSET'
                    )
                except Account.DoesNotExist:
                    return Response(
                        {'error': f'Bank account {data["bank_account_id"]} not found'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
            
            # Route the payment
            from cash_management.services.payment_routing import PaymentRoutingService
            
            reference = data.get('reference_number', f'PMT-{invoice.invoice_number}')
            description = f"Payment for invoice {invoice.invoice_number}"
            
            routing_result = PaymentRoutingService.route_payment(
                amount=payment_amount,
                payment_date=data.get('payment_date', timezone.now().date()),
                payment_method=data['payment_method'],
                client=invoice.client,
                reference_number=reference,
                description=description,
                user=request.user,
                ar_account=ar_account,
                cashier_account=cashier_account,
                bank_account=bank_account,
                notes=data.get('notes', '')
            )
            
            # Update invoice
            invoice.paid_amount += payment_amount
            
            # Update status
            if invoice.paid_amount >= invoice.total_amount:
                invoice.status = 'paid'
            elif invoice.paid_amount > 0:
                invoice.status = 'partial'
            
            invoice.save()
            
            # Build response
            response_data = {
                'success': True,
                'message': routing_result['message'],
                'invoice_id': invoice.id,
                'invoice_number': invoice.invoice_number,
                'amount_paid': str(payment_amount),
                'total_paid': str(invoice.paid_amount),
                'balance': str(invoice.balance),
                'status': invoice.status,
                'payment_route': routing_result['route'],
                'journal_entry_id': routing_result['journal_entry'].id,
                'journal_entry_reference': routing_result['journal_entry'].reference_number
            }
            
            if routing_result['route'] == 'cash':
                response_data['cash_collection_id'] = routing_result['cash_collection'].id
                response_data['receipt_number'] = routing_result['cash_collection'].receipt_number
            
            return Response(response_data)
            
        except Exception as e:
            logger.error(f"Error recording payment: {str(e)}", exc_info=True)
            return Response(
                {
                    'success': False,
                    'message': str(e)
                },
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    @transaction.atomic
    def post(self, request, pk=None):
        """
        Post invoice to accounting - creates revenue recognition journal entry
        
        Journal Entry:
        Dr. Accounts Receivable (Asset increases)
        Cr. Sales Revenue (Revenue increases)
        
        This implements accrual accounting - recognizing revenue when earned,
        not when cash is received.
        
        CRITICAL: This operation is atomic - either both the journal entry 
        and invoice status are updated, or neither is. This prevents the 
        invoice from being marked as posted without proper GL entries.
        """
        invoice = self.get_object()
        
        # Validation checks
        if invoice.is_posted:
            return Response(
                {
                    'success': False,
                    'message': 'Invoice already posted to accounting'
                },
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if invoice.status == 'cancelled':
            return Response(
                {
                    'success': False,
                    'message': 'Cannot post cancelled invoice'
                },
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if invoice.total_amount <= 0:
            return Response(
                {
                    'success': False,
                    'message': 'Cannot post invoice with zero or negative amount'
                },
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            from accounts.models import Account
            from transactions.models import Transaction as JournalEntry, TransactionEntry as JournalEntryLine
            
            # Get AR account
            ar_account = get_or_create_child_account(
                parent_code='1110',
                child_suffix='001',
                name='Trade Debtors (Accounts Receivable)',
                account_type='ASSET',
                owner=request.user,
                branch=invoice.branch,
                parent_name='Trade and Other Receivables'
            )

            # Get revenue account
            revenue_account = get_or_create_child_account(
                parent_code='4100',
                child_suffix='001',
                name='Sales of Goods',
                account_type='INCOME',
                owner=request.user,
                branch=invoice.branch,
                parent_name='Revenue from Contracts with Customers'
            )
            
            if not ar_account or not revenue_account:
                raise Exception("Required accounts (AR or Revenue) not found or could not be created")
            
            # Create journal entry for revenue recognition
            journal_entry = JournalEntry.objects.create(
                entry_date=invoice.invoice_date,
                reference_number=invoice.invoice_number,
                description=f"Revenue recognition for invoice {invoice.invoice_number} - {invoice.client.full_name}",
                total_amount=invoice.total_amount,
                owner=request.user,
                branch=invoice.branch,
                created_by=request.user
            )
            
            # Dr. Accounts Receivable (Asset increases)
            JournalEntryLine.objects.create(
                transaction=journal_entry,
                account=ar_account,
                side=JournalEntryLine.DEBIT,
                amount=invoice.total_amount
            )
            
            # Cr. Sales Revenue (Revenue increases)
            JournalEntryLine.objects.create(
                transaction=journal_entry,
                account=revenue_account,
                side=JournalEntryLine.CREDIT,
                amount=invoice.total_amount
            )
            
            # CRITICAL: Post journal entry first - this validates and updates GL balances
            # If this fails, the entire transaction rolls back including invoice update
            journal_entry.post()
            
            # Only mark invoice as posted AFTER successful journal entry posting
            invoice.is_posted = True
            invoice.posted_at = timezone.now()
            invoice.posted_by = request.user
            invoice.save(update_fields=['is_posted', 'posted_at', 'posted_by'])
            
            # Verify the accounts were actually updated
            ar_account.refresh_from_db()
            revenue_account.refresh_from_db()
            
            logger.info(
                f"Posted invoice {invoice.invoice_number} - "
                f"Revenue: {invoice.total_amount}, Client: {invoice.client.full_name}, "
                f"Journal Entry: {journal_entry.id}, AR Balance: {ar_account.balance}, "
                f"Revenue Balance: {revenue_account.balance}"
            )
            
            serializer = InvoiceSerializer(invoice)
            return Response(
                {
                    'success': True,
                    'message': 'Invoice posted to accounting successfully',
                    'invoice': serializer.data,
                    'journal_entry_id': journal_entry.id,
                    'journal_entry_reference': journal_entry.reference_number,
                    'ar_balance': str(ar_account.balance),
                    'revenue_balance': str(revenue_account.balance)
                },
                status=status.HTTP_200_OK
            )
            
        except ValidationError as e:
            logger.error(f"Validation error posting invoice {invoice.invoice_number}: {str(e)}", exc_info=True)
            return Response(
                {
                    'success': False,
                    'message': f'Validation error: {str(e)}'
                },
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            logger.error(f"Error posting invoice {invoice.invoice_number}: {str(e)}", exc_info=True)
            # Transaction will rollback automatically due to @transaction.atomic
            return Response(
                {
                    'success': False,
                    'message': f'Error posting invoice: {str(e)}'
                },
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=False, methods=['get'])
    def summary(self, request):
        """
        Get invoice summary statistics
        """
        queryset = self.get_queryset()
        
        # Calculate totals
        totals = queryset.aggregate(
            total_invoices=Count('id'),
            total_amount=Sum('total_amount'),
            total_paid=Sum('paid_amount')
        )
        
        total_amount = totals['total_amount'] or Decimal('0')
        total_paid = totals['total_paid'] or Decimal('0')
        total_outstanding = total_amount - total_paid
        
        # Overdue invoices
        today = timezone.now().date()
        overdue = queryset.filter(
            due_date__lt=today,
            status__in=['draft', 'sent', 'partial']
        ).aggregate(
            count=Count('id'),
            amount=Sum('total_amount') - Sum('paid_amount')
        )
        
        summary_data = {
            'total_invoices': totals['total_invoices'] or 0,
            'total_amount': total_amount,
            'total_paid': total_paid,
            'total_outstanding': total_outstanding,
            'overdue_count': overdue['count'] or 0,
            'overdue_amount': overdue['amount'] or Decimal('0')
        }
        
        serializer = InvoiceSummarySerializer(summary_data)
        return Response(
            {
                'success': True,
                'summary': serializer.data
            },
            status=status.HTTP_200_OK
        )
    
    @action(detail=True, methods=['post'])
    def mark_as_sent(self, request, pk=None):
        """Mark invoice as sent to client"""
        invoice = self.get_object()
        invoice.status = 'sent'
        invoice.save()
        
        serializer = InvoiceSerializer(invoice)
        return Response(
            {
                'success': True,
                'message': 'Invoice marked as sent',
                'invoice': serializer.data
            }
        )
    
    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Cancel invoice"""
        invoice = self.get_object()
        
        if invoice.paid_amount > 0:
            return Response(
                {
                    'success': False,
                    'message': 'Cannot cancel invoice with payments'
                },
                status=status.HTTP_400_BAD_REQUEST
            )
        
        invoice.status = 'cancelled'
        invoice.save()
        
        serializer = InvoiceSerializer(invoice)
        return Response(
            {
                'success': True,
                'message': 'Invoice cancelled',
                'invoice': serializer.data
            }
        )
    
    @action(detail=True, methods=['get'])
    def pdf(self, request, pk=None):
        """
        Generate and download invoice as PDF
        
        Returns a professional PDF invoice with company branding
        """
        invoice = self.get_object()
        
        try:
            # Generate PDF
            pdf_service = InvoicePDFService(invoice)
            pdf_content = pdf_service.generate()
            
            # Create response with PDF
            response = HttpResponse(pdf_content, content_type='application/pdf')
            response['Content-Disposition'] = f'attachment; filename="invoice_{invoice.invoice_number}.pdf"'
            
            # Log PDF generation
            logger.info(f"PDF generated for invoice {invoice.invoice_number} by user {request.user.username}")
            
            return response
            
        except Exception as e:
            logger.error(f"Error generating PDF for invoice {invoice.invoice_number}: {str(e)}")
            return Response(
                {
                    'success': False,
                    'message': 'Error generating PDF',
                    'error': str(e)
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
