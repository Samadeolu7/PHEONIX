# inventory/views_ledger.py
"""
Inventory Item Lifecycle Ledger

Provides a full audit trail for every inventory item showing:
  - Purchase Receipts (linked to GRN → PO → Supplier)
  - Sales / Material Request issuances (linked to Invoice → MaterialRequest)
  - Transfers, Adjustments, Write-offs
  - Running quantity balance at each step
  - Running weighted-average cost and total inventory value at each step
  - Cost-change events with full accounting impact explanation

Endpoints:
  GET /api/inventory/ledger/{id}/lifecycle/       — full item lifecycle
  GET /api/inventory/ledger/{id}/cost_analysis/  — costing method explanation
  GET /api/inventory/ledger/movements_by_invoice/ — helper by invoice
"""
from decimal import Decimal, ROUND_HALF_UP
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Q
import logging

from common.views import ScopedModelViewSet
from .models import InventoryItem, Invoice, InvoiceItem, StockMovement
from .models_material_request import MaterialRequest

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
IN_MOVEMENT_TYPES  = {'purchase', 'return_in', 'production_in'}
OUT_MOVEMENT_TYPES = {'sale', 'return_out', 'write_off', 'production_out'}
# 'adjustment' and 'transfer' are directional — derived from to/from_location

MOVEMENT_DISPLAY = {
    'purchase':       'Purchase Receipt',
    'sale':           'Sales / Issue',
    'adjustment':     'Stock Adjustment',
    'transfer':       'Stock Transfer',
    'return_in':      'Purchase Return (In)',
    'return_out':     'Sales Return (Out)',
    'write_off':      'Write-Off',
    'production_in':  'Production Receipt',
    'production_out': 'Production Issue',
}

VALUATION_DISPLAY = {
    'average': 'Weighted Average Cost (WAC)',
    'fifo':    'First In First Out (FIFO)',
    'lifo':    'Last In First Out (LIFO)',
}

logger = logging.getLogger(__name__)


class InventoryLedgerViewSet(ScopedModelViewSet):
    """
    ViewSet for Inventory Item Lifecycle Ledger and Cost Analysis.
    """
    permission_module = 'inventory'
    permission_page = 'inventory-items'
    queryset = InventoryItem.objects.all()
    permission_classes = [IsAuthenticated]

    # -----------------------------------------------------------------------
    # Internal helpers
    # -----------------------------------------------------------------------

    @staticmethod
    def _is_in_movement(mv: StockMovement) -> bool:
        """Return True when this movement adds stock (direction = IN)."""
        mt = mv.movement_type
        if mt in IN_MOVEMENT_TYPES:
            return True
        if mt in OUT_MOVEMENT_TYPES:
            return False
        # 'adjustment' or 'transfer': IN when to_location is set
        return mv.to_location_id is not None

    @staticmethod
    def _recalculate_avg(running_qty, running_avg, qty_in, purchase_cost, method):
        """
        Returns (new_qty, new_avg, cost_changed, old_avg) for an IN movement.
        Weighted-average: new_avg = (old_value + receipt_value) / new_qty.
        FIFO/LIFO: new layer cost becomes 'current' cost for display.
        """
        old_avg = running_avg
        new_qty = running_qty + qty_in

        if method == 'average':
            total_val = (running_qty * running_avg) + (qty_in * purchase_cost)
            new_avg   = total_val / new_qty if new_qty else purchase_cost
        else:
            # FIFO/LIFO — just track latest received cost
            new_avg = purchase_cost

        changed = abs(new_avg - old_avg) > Decimal('0.005')
        return new_qty, new_avg, changed, old_avg

    @staticmethod
    def _build_cost_change(old_avg, new_avg, qty_before, method):
        """Return the cost_change annotation block for a purchase receipt."""
        delta      = new_avg - old_avg
        reval      = qty_before * delta
        direction  = 'increase' if delta > 0 else ('decrease' if delta < 0 else 'unchanged')

        if method == 'average':
            note = (
                f"Weighted Average Cost moved {old_avg:,.2f} → {new_avg:,.2f} "
                f"({'+' if delta >= 0 else ''}{delta:,.2f}/unit). "
                f"Existing {qty_before:,.0f} unit(s) implicitly revalued by "
                f"{'+' if reval >= 0 else ''}{reval:,.2f}. "
                "No separate revaluation journal entry is required under WAC — "
                "future COGS will use the new average automatically."
            )
        else:
            note = (
                f"New cost layer at {new_avg:,.2f}/unit received "
                f"(previous layer: {old_avg:,.2f}/unit). "
                "Under FIFO/LIFO, existing inventory layers retain their original cost."
            )

        return {
            'previous_avg_cost':    str(old_avg),
            'new_avg_cost':         str(new_avg),
            'change_per_unit':      str(delta),
            'qty_before_receipt':   str(qty_before),
            'implicit_revaluation': str(reval),
            'direction':            direction,
            'accounting_note':      note,
        }

    @staticmethod
    def _purchase_source(mv: StockMovement):
        """Resolve GRN / PO source for a purchase movement."""
        src_type = (mv.source_document_type or '').upper()
        src_id   = mv.source_document_id or ''
        if not src_id:
            return {
                'type': 'purchase', 'document_number': mv.reference_number,
                'document_id': None, 'purchase_order': None,
            }
        try:
            from procurement.models import GoodsReceivedNote, PurchaseOrderItem

            if src_type == 'GRN':
                grn = GoodsReceivedNote.objects.select_related(
                    'purchase_order__supplier', 'received_by'
                ).get(id=int(src_id))
                po = grn.purchase_order
                return {
                    'type':            'grn',
                    'document_number': grn.grn_number,
                    'document_id':     grn.id,
                    'received_date':   grn.received_date.isoformat(),
                    'received_by':     (grn.received_by.get_full_name() if grn.received_by else None),
                    'purchase_order':  {
                        'id':            po.id,
                        'po_number':     po.po_number,
                        'order_date':    po.order_date.isoformat(),
                        'supplier_id':   po.supplier_id,
                        'supplier_name': po.supplier.name,
                    } if po else None,
                }
            if src_type == 'PO':
                poi = PurchaseOrderItem.objects.select_related(
                    'purchase_order__supplier'
                ).get(id=int(src_id))
                po = poi.purchase_order
                return {
                    'type':            'purchase_order',
                    'document_number': po.po_number,
                    'document_id':     po.id,
                    'purchase_order':  {
                        'id':            po.id,
                        'po_number':     po.po_number,
                        'order_date':    po.order_date.isoformat(),
                        'supplier_id':   po.supplier_id,
                        'supplier_name': po.supplier.name,
                    },
                }
        except Exception as exc:
            logger.debug("Could not load procurement source for movement %s: %s", mv.id, exc)

        return {
            'type':            src_type.lower() or 'purchase',
            'document_number': mv.reference_number,
            'document_id':     None,
            'purchase_order':  None,
        }

    @staticmethod
    def _sale_source(mv: StockMovement):
        """Resolve Invoice and optionally MaterialRequest for a sale movement."""
        try:
            invoice = Invoice.objects.select_related('client').get(
                invoice_number=mv.reference_number
            )
        except Invoice.DoesNotExist:
            return None, None

        inv_block = {
            'invoice_id':     invoice.id,
            'invoice_number': invoice.invoice_number,
            'invoice_date':   invoice.invoice_date.isoformat(),
            'client': {
                'id':        invoice.client.id,
                'name':      invoice.client.get_full_name(),
                'client_id': invoice.client.client_id,
            } if invoice.client else None,
        }

        mr_block = None
        try:
            mr = MaterialRequest.objects.select_related(
                'requested_by', 'service_invoice'
            ).get(inventory_invoice=invoice)
            mr_block = {
                'request_id':             mr.id,
                'request_number':         mr.request_number,
                'request_date':           mr.request_date.isoformat(),
                'requested_by':           mr.requested_by.get_full_name(),
                'purpose':                mr.purpose,
                'service_invoice_number': (
                    mr.service_invoice.invoice_number if mr.service_invoice else None
                ),
            }
        except (MaterialRequest.DoesNotExist, AttributeError):
            pass

        return inv_block, mr_block

    # -----------------------------------------------------------------------
    # Main lifecycle endpoint
    # -----------------------------------------------------------------------

    @action(detail=True, methods=['get'])
    def lifecycle(self, request, pk=None):
        """
        Full lifecycle ledger for an inventory item.

        Query params:
          date_from   YYYY-MM-DD — start of reporting period (optional)
          date_to     YYYY-MM-DD — end of reporting period   (optional)
          location_id int        — restrict to one location  (optional)

        Returns:
          item     — master data + current live stock totals
          period   — requested date range
          summary  — opening/closing quantities and values
          entries  — enriched per-movement rows with cost history
        """
        item        = self.get_object()
        date_from   = request.query_params.get('date_from')
        date_to     = request.query_params.get('date_to')
        location_id = request.query_params.get('location_id')

        # 1. All movements for this item, oldest first
        qs = (
            StockMovement.objects
            .filter(item=item, is_deleted=False)
            .select_related('to_location', 'from_location', 'created_by')
            .order_by('movement_date', 'created_at', 'id')
        )
        if location_id:
            qs = qs.filter(
                Q(to_location_id=location_id) | Q(from_location_id=location_id)
            )

        all_movements = list(qs)

        # 2. Split into before-period and in-period
        before, period = [], []
        for mv in all_movements:
            ds = mv.movement_date.isoformat() if mv.movement_date else ''
            if date_from and ds < date_from:
                before.append(mv)
            elif date_to and ds > date_to:
                pass
            else:
                period.append(mv)

        # 3. Replay "before" to get opening state
        open_qty  = Decimal('0')
        open_avg  = item.cost_price or Decimal('0')
        for mv in before:
            qty    = mv.quantity or Decimal('0')
            cost   = mv.unit_cost or Decimal('0')
            is_in  = self._is_in_movement(mv)
            if is_in and mv.movement_type in ('purchase', 'return_in'):
                _, open_avg, _, _ = self._recalculate_avg(
                    open_qty, open_avg, qty, cost, item.valuation_method
                )
            open_qty = (open_qty + qty) if is_in else max(Decimal('0'), open_qty - qty)

        open_value = open_qty * open_avg

        # 4. Build ledger entries for the period
        run_qty  = open_qty
        run_avg  = open_avg
        entries  = []
        total_in_qty   = Decimal('0')
        total_in_val   = Decimal('0')
        total_out_qty  = Decimal('0')
        total_out_val  = Decimal('0')
        cost_changes   = 0

        for seq, mv in enumerate(period, start=1):
            qty    = mv.quantity or Decimal('0')
            cost   = mv.unit_cost or Decimal('0')
            is_in  = self._is_in_movement(mv)

            cost_changed = False
            cost_change  = None

            if is_in and mv.movement_type in ('purchase', 'return_in'):
                _, new_avg, changed, old_avg = self._recalculate_avg(
                    run_qty, run_avg, qty, cost, item.valuation_method
                )
                if changed:
                    cost_changed = True
                    cost_change  = self._build_cost_change(
                        old_avg, new_avg, run_qty, item.valuation_method
                    )
                    cost_changes += 1
                run_avg = new_avg

            if is_in:
                run_qty       += qty
                total_in_qty  += qty
                total_in_val  += qty * cost
            else:
                run_qty        = max(Decimal('0'), run_qty - qty)
                total_out_qty += qty
                total_out_val += qty * run_avg  # COGS at current avg

            run_value = run_qty * run_avg

            # Source document enrichment
            source_block, inv_block, mr_block = None, None, None
            if mv.movement_type in ('purchase', 'return_in'):
                source_block = self._purchase_source(mv)
            elif mv.movement_type in ('sale', 'return_out'):
                inv_block, mr_block = self._sale_source(mv)

            loc = mv.to_location if is_in else mv.from_location

            entries.append({
                'seq':                   seq,
                'date':                  mv.movement_date.isoformat(),
                'movement_type':         mv.movement_type,
                'movement_type_display': MOVEMENT_DISPLAY.get(mv.movement_type, mv.movement_type),
                'quantity_in':           str(qty) if is_in  else '0',
                'quantity_out':          str(qty) if not is_in else '0',
                'unit_cost':             str(cost),
                'total_cost':            str(mv.total_cost or qty * cost),
                'running_qty':           str(run_qty),
                'running_avg_cost':      str(run_avg),
                'running_value':         str(run_value),
                'cost_changed':          cost_changed,
                'cost_change':           cost_change,
                'source':                source_block,
                'invoice':               inv_block,
                'material_request':      mr_block,
                'location':              {'id': loc.id, 'name': loc.name} if loc else None,
                'reference':             mv.reference_number,
                'notes':                 mv.notes or '',
                'created_by':            (
                    mv.created_by.get_full_name() if mv.created_by else None
                ),
            })

        # 5. Current live totals from InventoryStock
        from django.db.models import Sum
        agg = item.stock_records.aggregate(
            total_qty=Sum('quantity_on_hand'),
            total_val=Sum('total_value'),
        )
        live_qty   = Decimal(str(agg['total_qty'] or 0))
        live_val   = Decimal(str(agg['total_val'] or 0))
        live_avg   = (live_val / live_qty) if live_qty > 0 else item.cost_price

        return Response({
            'item': {
                'id':                       item.id,
                'name':                     item.name,
                'sku':                      item.sku,
                'unit_of_measure':          item.unit_of_measure,
                'valuation_method':         item.valuation_method,
                'valuation_method_display': VALUATION_DISPLAY.get(
                    item.valuation_method, item.valuation_method
                ),
                'current_cost':             str(live_avg),
                'current_quantity':         str(live_qty),
                'current_value':            str(live_val),
                'category_name':            item.category.name if item.category else '',
                'is_active':                item.is_active,
            },
            'period': {'date_from': date_from, 'date_to': date_to},
            'summary': {
                'opening_qty':          str(open_qty),
                'opening_avg_cost':     str(open_avg),
                'opening_value':        str(open_value),
                'total_received_qty':   str(total_in_qty),
                'total_received_value': str(total_in_val),
                'total_issued_qty':     str(total_out_qty),
                'total_issued_value':   str(total_out_val),
                'closing_qty':          str(run_qty),
                'closing_avg_cost':     str(run_avg),
                'closing_value':        str(run_qty * run_avg),
                'cost_change_count':    cost_changes,
            },
            'entries':     entries,
            'entry_count': len(entries),
        })

    # -----------------------------------------------------------------------
    # Cost-method accounting explanation
    # -----------------------------------------------------------------------

    @action(detail=True, methods=['get'])
    def cost_analysis(self, request, pk=None):
        """
        Explains the accounting treatment for cost changes for this item's
        valuation method, with worked hypothetical examples.
        """
        item = self.get_object()

        from django.db.models import Sum
        agg = item.stock_records.aggregate(
            total_qty=Sum('quantity_on_hand'),
            total_val=Sum('total_value'),
        )
        curr_qty = Decimal(str(agg['total_qty'] or 0))
        curr_val = Decimal(str(agg['total_val'] or 0))
        curr_avg = (curr_val / curr_qty) if curr_qty > 0 else item.cost_price

        def example(factor):
            hyp_qty  = Decimal('100')
            hyp_cost = (curr_avg * factor).quantize(Decimal('0.01'))
            _, new_avg, _, _ = self._recalculate_avg(
                curr_qty, curr_avg, hyp_qty, hyp_cost, item.valuation_method
            )
            return {
                'purchase_qty':   hyp_qty,
                'purchase_cost':  hyp_cost,
                'receipt_value':  hyp_qty * hyp_cost,
                'journal_entry': {
                    'debit':  f"Inventory Asset  DR  {hyp_qty * hyp_cost:,.2f}",
                    'credit': f"Accounts Payable CR  {hyp_qty * hyp_cost:,.2f}",
                },
                'new_avg_cost':            new_avg,
                'avg_cost_change':         new_avg - curr_avg,
                'implicit_stock_reval':    curr_qty * (new_avg - curr_avg),
                'future_cogs_per_unit':    new_avg,
                'cogs_change_vs_current':  new_avg - curr_avg,
            }

        EXPLANATIONS = {
            'average': (
                "Weighted Average Cost (WAC)\n\n"
                "When a new Purchase Order is received at a price different from the "
                "current average:\n"
                "  1. Journal Entry: DR Inventory / CR Accounts Payable (at actual purchase price)\n"
                "  2. New WAC = (Existing Value + Receipt Value) ÷ (Existing Qty + Receipt Qty)\n"
                "  3. Existing stock is implicitly revalued — no separate GL entry needed.\n"
                "  4. All future COGS entries use the new WAC until the next cost-changing receipt.\n\n"
                "P&L Impact: Higher purchase cost → higher WAC → higher COGS per unit sold → "
                "lower gross profit.\n"
                "Balance Sheet: Inventory value = On-hand Qty × New WAC."
            ),
            'fifo': (
                "First In First Out (FIFO)\n\n"
                "  1. Each receipt creates an independent cost layer at its actual price.\n"
                "  2. COGS consumes the oldest (cheapest) layer first.\n"
                "  3. A new receipt at a higher price does NOT affect existing layer costs.\n"
                "  4. Journal Entry: DR Inventory / CR AP (at actual purchase price).\n\n"
                "P&L Impact: In a rising cost environment, FIFO produces lower COGS and "
                "higher gross profit. Balance sheet inventory reflects more recent (higher) costs."
            ),
            'lifo': (
                "Last In First Out (LIFO)\n\n"
                "  1. Each receipt creates an independent cost layer.\n"
                "  2. COGS consumes the most recent (usually highest) layer first.\n"
                "  3. Journal Entry: DR Inventory / CR AP (at actual purchase price).\n\n"
                "P&L Impact: In a rising cost environment, LIFO produces the highest COGS "
                "and lowest reported inventory value on the balance sheet.\n"
                "Note: LIFO is not permitted under IFRS."
            ),
        }

        return Response({
            'item': {
                'id':                       item.id,
                'name':                     item.name,
                'sku':                      item.sku,
                'valuation_method':         item.valuation_method,
                'valuation_method_display': VALUATION_DISPLAY.get(
                    item.valuation_method, item.valuation_method
                ),
            },
            'current_position': {
                'quantity_on_hand': curr_qty,
                'average_cost':     curr_avg,
                'total_value':      curr_val,
            },
            'explanation': EXPLANATIONS.get(item.valuation_method, ''),
            'examples': {
                'price_increase_10pct': example(Decimal('1.10')),
                'price_decrease_10pct': example(Decimal('0.90')),
            },
        })

    # -----------------------------------------------------------------------
    # Helper endpoint — movements by invoice
    # -----------------------------------------------------------------------

    @action(detail=False, methods=['get'])
    def movements_by_invoice(self, request):
        """
        All inventory stock movements for a specific inventory invoice.
        Query param: invoice_id (required).
        """
        invoice_id = request.query_params.get('invoice_id')
        if not invoice_id:
            return Response(
                {'error': 'invoice_id parameter is required'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            invoice = Invoice.objects.select_related('client').get(id=invoice_id)
        except Invoice.DoesNotExist:
            return Response({'error': 'Invoice not found'}, status=status.HTTP_404_NOT_FOUND)

        movements_data = []
        for inv_item in InvoiceItem.objects.filter(invoice=invoice).select_related('item'):
            if not inv_item.item:
                continue
            for mv in StockMovement.objects.filter(
                item=inv_item.item,
                movement_type='sale',
                reference_number=invoice.invoice_number,
            ).select_related('from_location', 'to_location', 'created_by'):
                loc = mv.from_location or mv.to_location
                movements_data.append({
                    'item': {
                        'id': inv_item.item.id, 'name': inv_item.item.name,
                        'sku': inv_item.item.sku,
                    },
                    'quantity':      mv.quantity,
                    'unit_cost':     mv.unit_cost,
                    'location':      {'id': loc.id, 'name': loc.name} if loc else None,
                    'movement_date': mv.movement_date.isoformat(),
                    'created_by':    mv.created_by.get_full_name() if mv.created_by else None,
                })

        return Response({
            'invoice': {
                'id':             invoice.id,
                'invoice_number': invoice.invoice_number,
                'invoice_date':   invoice.invoice_date.isoformat(),
                'client': {
                    'id':        invoice.client.id,
                    'name':      invoice.client.get_full_name(),
                    'client_id': invoice.client.client_id,
                } if invoice.client else None,
            },
            'movements': movements_data,
        })
