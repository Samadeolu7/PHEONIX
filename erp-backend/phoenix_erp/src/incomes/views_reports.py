# incomes/views_reports.py
"""
Income Report API Views

Provides analytical endpoints for income data:
  - by_category   : income grouped by IncomeCategory
  - by_item       : income grouped by ServiceItem
  - by_period     : income trend over time (daily/weekly/monthly/quarterly/yearly)
  - by_client     : top clients by revenue with outstanding balances
  - collection_status : payment collection summary (paid/partial/overdue/outstanding)
"""
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from django.db.models import (
    Sum, Count, Q, F, Case, When,
    DecimalField, Value, CharField, FloatField
)
from django.db.models.functions import (
    TruncMonth, TruncQuarter, TruncYear, TruncWeek, TruncDay, Coalesce
)
from django.utils import timezone
from datetime import date, timedelta
from decimal import Decimal

from .models import Invoice, IncomeCategory, ServiceItem, InvoiceItem


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _parse_date(value, fallback):
    if not value:
        return fallback
    try:
        return date.fromisoformat(value)
    except (ValueError, TypeError):
        return fallback


def _base_invoice_qs(request):
    """Return non-cancelled invoices scoped to the requesting user/branch."""
    qs = Invoice.objects.for_user(request.user).exclude(status='cancelled')
    return qs


def _fmt(value):
    """Return a float rounded to 2 d.p., or 0.0 for None."""
    if value is None:
        return 0.0
    return round(float(value), 2)


# ---------------------------------------------------------------------------
# 1. By Category
# ---------------------------------------------------------------------------

class IncomeByCategoryView(APIView):
    """
    GET /api/incomes/reports/by-category/

    Query params:
      date_from   (YYYY-MM-DD)
      date_to     (YYYY-MM-DD)
      include_subcategories  (true/false, default true)
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        today = date.today()
        date_from = _parse_date(request.query_params.get('date_from'), date(today.year, 1, 1))
        date_to   = _parse_date(request.query_params.get('date_to'),   today)

        qs = (
            _base_invoice_qs(request)
            .filter(invoice_date__range=(date_from, date_to))
        )

        # Aggregate at the InvoiceItem level so we can break down by category
        from .models import InvoiceItem
        items_qs = (
            InvoiceItem.objects
            .filter(invoice__in=qs)
            .filter(invoice__invoice_date__range=(date_from, date_to))
            .select_related('service_item__category', 'invoice')
        )

        # Build per-category aggregates
        category_map = {}  # category_id -> dict

        # Pull categories up front
        categories = {
            c.id: c
            for c in IncomeCategory.objects.for_user(request.user)
        }

        for item in items_qs.iterator():
            cat = (
                item.service_item.category
                if item.service_item_id and item.service_item.category_id
                else None
            )
            cat_id = cat.id if cat else 0
            cat_name = cat.name if cat else 'Uncategorised'
            cat_code = cat.code if cat else 'NONE'

            if cat_id not in category_map:
                category_map[cat_id] = {
                    'category_id': cat_id,
                    'category_name': cat_name,
                    'category_code': cat_code,
                    'invoiced': Decimal('0'),
                    'collected': Decimal('0'),
                    'outstanding': Decimal('0'),
                    'invoice_count': 0,
                    'item_count': 0,
                }

            line_total = (item.quantity or Decimal('1')) * (item.unit_price or Decimal('0'))
            category_map[cat_id]['invoiced']    += line_total
            category_map[cat_id]['item_count']  += 1

        # Now aggregate invoice-level payment info per category
        # We do a second pass using invoice totals
        inv_qs = (
            qs.filter(invoice_date__range=(date_from, date_to))
        )

        inv_collected = {}
        inv_total     = {}
        for inv in inv_qs.iterator(chunk_size=500):
            inv_total[inv.id]     = inv.total_amount or Decimal('0')
            inv_collected[inv.id] = inv.amount_paid  or Decimal('0')

        # Map invoices to categories by their first service-item category
        inv_category = {}
        for item in items_qs.iterator():
            if item.invoice_id not in inv_category:
                cat = (
                    item.service_item.category
                    if item.service_item_id and item.service_item.category_id
                    else None
                )
                inv_category[item.invoice_id] = cat.id if cat else 0

        seen_invoices = set()
        for inv_id, cat_id in inv_category.items():
            if inv_id in seen_invoices:
                continue
            seen_invoices.add(inv_id)
            if cat_id in category_map:
                category_map[cat_id]['collected']    += inv_collected.get(inv_id, Decimal('0'))
                category_map[cat_id]['outstanding']  += max(
                    Decimal('0'),
                    inv_total.get(inv_id, Decimal('0')) - inv_collected.get(inv_id, Decimal('0'))
                )
                category_map[cat_id]['invoice_count'] += 1

        rows = sorted(category_map.values(), key=lambda r: r['invoiced'], reverse=True)

        total_invoiced   = sum(r['invoiced']   for r in rows)
        total_collected  = sum(r['collected']  for r in rows)
        total_outstanding= sum(r['outstanding'] for r in rows)

        return Response({
            'date_from': date_from.isoformat(),
            'date_to':   date_to.isoformat(),
            'totals': {
                'invoiced':    _fmt(total_invoiced),
                'collected':   _fmt(total_collected),
                'outstanding': _fmt(total_outstanding),
                'collection_rate': _fmt(
                    (total_collected / total_invoiced * 100) if total_invoiced else 0
                ),
            },
            'rows': [
                {
                    'category_id':    r['category_id'],
                    'category_name':  r['category_name'],
                    'category_code':  r['category_code'],
                    'invoiced':       _fmt(r['invoiced']),
                    'collected':      _fmt(r['collected']),
                    'outstanding':    _fmt(r['outstanding']),
                    'invoice_count':  r['invoice_count'],
                    'item_count':     r['item_count'],
                    'collection_rate': _fmt(
                        (r['collected'] / r['invoiced'] * 100) if r['invoiced'] else 0
                    ),
                }
                for r in rows
            ],
        })


# ---------------------------------------------------------------------------
# 2. By Service Item
# ---------------------------------------------------------------------------

class IncomeByServiceItemView(APIView):
    """
    GET /api/incomes/reports/by-service-item/

    Query params:
      date_from   (YYYY-MM-DD)
      date_to     (YYYY-MM-DD)
      category_id (filter by income category)
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        today     = date.today()
        date_from = _parse_date(request.query_params.get('date_from'), date(today.year, 1, 1))
        date_to   = _parse_date(request.query_params.get('date_to'),   today)
        category_id = request.query_params.get('category_id')

        inv_qs = (
            _base_invoice_qs(request)
            .filter(invoice_date__range=(date_from, date_to))
        )

        items_qs = (
            InvoiceItem.objects
            .filter(invoice__in=inv_qs)
            .filter(service_item__isnull=False)
            .select_related('service_item__category', 'invoice')
        )

        if category_id:
            items_qs = items_qs.filter(service_item__category_id=category_id)

        item_map = {}

        for item in items_qs.iterator():
            si    = item.service_item
            si_id = si.id

            if si_id not in item_map:
                item_map[si_id] = {
                    'service_item_id':   si.id,
                    'service_item_name': si.name,
                    'service_item_code': si.code,
                    'category_name':     si.category.name if si.category_id else '',
                    'category_code':     si.category.code if si.category_id else '',
                    'default_price':     _fmt(si.default_price),
                    'quantity_invoiced': Decimal('0'),
                    'invoiced':          Decimal('0'),
                    'collected':         Decimal('0'),
                    'outstanding':       Decimal('0'),
                    'invoice_count':     0,
                }

            line_total = (item.quantity or Decimal('1')) * (item.unit_price or Decimal('0'))
            item_map[si_id]['quantity_invoiced'] += (item.quantity or Decimal('1'))
            item_map[si_id]['invoiced']          += line_total
            item_map[si_id]['invoice_count']     += 1

            paid_ratio = (
                (item.invoice.amount_paid or Decimal('0')) / item.invoice.total_amount
                if item.invoice.total_amount else Decimal('0')
            )
            item_map[si_id]['collected']   += line_total * paid_ratio
            item_map[si_id]['outstanding'] += line_total * (1 - paid_ratio)

        rows = sorted(item_map.values(), key=lambda r: r['invoiced'], reverse=True)

        total_invoiced    = sum(r['invoiced']   for r in rows)
        total_collected   = sum(r['collected']  for r in rows)
        total_outstanding = sum(r['outstanding'] for r in rows)

        return Response({
            'date_from':  date_from.isoformat(),
            'date_to':    date_to.isoformat(),
            'totals': {
                'invoiced':    _fmt(total_invoiced),
                'collected':   _fmt(total_collected),
                'outstanding': _fmt(total_outstanding),
                'collection_rate': _fmt(
                    (total_collected / total_invoiced * 100) if total_invoiced else 0
                ),
            },
            'rows': [
                {
                    **r,
                    'quantity_invoiced': _fmt(r['quantity_invoiced']),
                    'invoiced':          _fmt(r['invoiced']),
                    'collected':         _fmt(r['collected']),
                    'outstanding':       _fmt(r['outstanding']),
                    'collection_rate':   _fmt(
                        (r['collected'] / r['invoiced'] * 100) if r['invoiced'] else 0
                    ),
                }
                for r in rows
            ],
        })


# ---------------------------------------------------------------------------
# 3. By Period (Trend)
# ---------------------------------------------------------------------------

class IncomeByPeriodView(APIView):
    """
    GET /api/incomes/reports/by-period/

    Query params:
      date_from   (YYYY-MM-DD)
      date_to     (YYYY-MM-DD)
      period      daily | weekly | monthly | quarterly | yearly  (default monthly)
      category_id (optional filter)
    """
    permission_classes = [IsAuthenticated]

    _TRUNC_MAP = {
        'daily':     TruncDay,
        'weekly':    TruncWeek,
        'monthly':   TruncMonth,
        'quarterly': TruncQuarter,
        'yearly':    TruncYear,
    }

    def get(self, request):
        today     = date.today()
        date_from = _parse_date(request.query_params.get('date_from'), date(today.year, 1, 1))
        date_to   = _parse_date(request.query_params.get('date_to'),   today)
        period    = request.query_params.get('period', 'monthly')
        category_id = request.query_params.get('category_id')

        trunc_fn  = self._TRUNC_MAP.get(period, TruncMonth)

        qs = (
            _base_invoice_qs(request)
            .filter(invoice_date__range=(date_from, date_to))
        )

        if category_id:
            qs = qs.filter(items__service_item__category_id=category_id).distinct()

        rows = (
            qs
            .annotate(period_date=trunc_fn('invoice_date'))
            .values('period_date')
            .annotate(
                invoiced=Coalesce(Sum('total_amount'),  Value(0), output_field=DecimalField()),
                collected=Coalesce(Sum('amount_paid'),  Value(0), output_field=DecimalField()),
                invoice_count=Count('id'),
            )
            .order_by('period_date')
        )

        result = []
        for row in rows:
            inv  = row['invoiced']  or Decimal('0')
            coll = row['collected'] or Decimal('0')
            result.append({
                'period_date':    row['period_date'].isoformat()[:10] if row['period_date'] else None,
                'invoiced':       _fmt(inv),
                'collected':      _fmt(coll),
                'outstanding':    _fmt(max(Decimal('0'), inv - coll)),
                'invoice_count':  row['invoice_count'],
                'collection_rate': _fmt((coll / inv * 100) if inv else 0),
            })

        total_invoiced    = sum(Decimal(str(r['invoiced']))   for r in result)
        total_collected   = sum(Decimal(str(r['collected']))  for r in result)
        total_outstanding = sum(Decimal(str(r['outstanding'])) for r in result)

        return Response({
            'date_from':  date_from.isoformat(),
            'date_to':    date_to.isoformat(),
            'period':     period,
            'totals': {
                'invoiced':    _fmt(total_invoiced),
                'collected':   _fmt(total_collected),
                'outstanding': _fmt(total_outstanding),
                'collection_rate': _fmt(
                    (total_collected / total_invoiced * 100) if total_invoiced else 0
                ),
            },
            'rows': result,
        })


# ---------------------------------------------------------------------------
# 4. By Client
# ---------------------------------------------------------------------------

class IncomeByClientView(APIView):
    """
    GET /api/incomes/reports/by-client/

    Query params:
      date_from     (YYYY-MM-DD)
      date_to       (YYYY-MM-DD)
      limit         max rows returned (default 50)
      sort          invoiced | collected | outstanding (default invoiced)
      category_id   optional filter
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        today     = date.today()
        date_from = _parse_date(request.query_params.get('date_from'), date(today.year, 1, 1))
        date_to   = _parse_date(request.query_params.get('date_to'),   today)
        limit     = min(int(request.query_params.get('limit', 50)), 500)
        sort_by   = request.query_params.get('sort', 'invoiced')
        category_id = request.query_params.get('category_id')

        valid_sorts = {'invoiced', 'collected', 'outstanding'}
        if sort_by not in valid_sorts:
            sort_by = 'invoiced'

        qs = (
            _base_invoice_qs(request)
            .filter(invoice_date__range=(date_from, date_to))
            .filter(client__isnull=False)
        )

        if category_id:
            qs = qs.filter(items__service_item__category_id=category_id).distinct()

        rows = (
            qs
            .values('client__id', 'client__first_name', 'client__last_name')
            .annotate(
                invoiced=Coalesce(Sum('total_amount'), Value(0), output_field=DecimalField()),
                collected=Coalesce(Sum('amount_paid'), Value(0), output_field=DecimalField()),
                invoice_count=Count('id'),
            )
            .annotate(
                outstanding=F('invoiced') - F('collected'),
            )
            .order_by(f'-{sort_by}')[:limit]
        )

        result = []
        for row in rows:
            inv  = row['invoiced']  or Decimal('0')
            coll = row['collected'] or Decimal('0')
            outstanding = max(Decimal('0'), inv - coll)
            first = row['client__first_name'] or ''
            last  = row['client__last_name']  or ''
            full_name = f"{first} {last}".strip() or 'Unknown'
            result.append({
                'client_id':       row['client__id'],
                'client_name':     full_name,
                'invoiced':        _fmt(inv),
                'collected':       _fmt(coll),
                'outstanding':     _fmt(outstanding),
                'invoice_count':   row['invoice_count'],
                'collection_rate': _fmt((coll / inv * 100) if inv else 0),
            })

        total_invoiced    = sum(Decimal(str(r['invoiced']))   for r in result)
        total_collected   = sum(Decimal(str(r['collected']))  for r in result)
        total_outstanding = sum(Decimal(str(r['outstanding'])) for r in result)

        return Response({
            'date_from':  date_from.isoformat(),
            'date_to':    date_to.isoformat(),
            'totals': {
                'invoiced':    _fmt(total_invoiced),
                'collected':   _fmt(total_collected),
                'outstanding': _fmt(total_outstanding),
                'collection_rate': _fmt(
                    (total_collected / total_invoiced * 100) if total_invoiced else 0
                ),
            },
            'rows': result,
        })


# ---------------------------------------------------------------------------
# 5. Collection Status (KPI Dashboard)
# ---------------------------------------------------------------------------

class IncomeCollectionStatusView(APIView):
    """
    GET /api/incomes/reports/collection-status/

    Returns headline KPI metrics about invoice payment collection.

    Query params:
      date_from   (YYYY-MM-DD)
      date_to     (YYYY-MM-DD)
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        today     = date.today()
        date_from = _parse_date(request.query_params.get('date_from'), date(today.year, 1, 1))
        date_to   = _parse_date(request.query_params.get('date_to'),   today)

        qs = (
            Invoice.objects.for_user(request.user)
            .filter(invoice_date__range=(date_from, date_to))
        )

        status_agg = (
            qs
            .values('status')
            .annotate(
                count=Count('id'),
                total=Coalesce(Sum('total_amount'), Value(0), output_field=DecimalField()),
                paid=Coalesce(Sum('amount_paid'),   Value(0), output_field=DecimalField()),
            )
        )

        STATUS_LABELS = {
            'draft':     'Draft',
            'sent':      'Sent / Awaiting Payment',
            'partial':   'Partially Paid',
            'paid':      'Fully Paid',
            'overdue':   'Overdue',
            'cancelled': 'Cancelled',
        }

        breakdown = {}
        for row in status_agg:
            s = row['status']
            breakdown[s] = {
                'status':       s,
                'label':        STATUS_LABELS.get(s, s.title()),
                'count':        row['count'],
                'invoiced':     _fmt(row['total']),
                'collected':    _fmt(row['paid']),
                'outstanding':  _fmt(max(Decimal('0'), row['total'] - row['paid'])),
            }

        all_qs = qs.exclude(status='cancelled')
        totals = all_qs.aggregate(
            total_invoiced=Coalesce(Sum('total_amount'), Value(0), output_field=DecimalField()),
            total_collected=Coalesce(Sum('amount_paid'), Value(0), output_field=DecimalField()),
            total_count=Count('id'),
        )

        total_inv  = totals['total_invoiced']  or Decimal('0')
        total_coll = totals['total_collected'] or Decimal('0')
        overdue_count = breakdown.get('overdue', {}).get('count', 0)

        # Days overdue insight: count invoices past due_date and not fully paid
        overdue_invoices = all_qs.filter(
            due_date__lt=today,
            status__in=['sent', 'partial', 'overdue']
        ).aggregate(
            overdue_amount=Coalesce(
                Sum(F('total_amount') - F('amount_paid')),
                Value(0),
                output_field=DecimalField()
            ),
            overdue_count=Count('id'),
        )

        return Response({
            'date_from':  date_from.isoformat(),
            'date_to':    date_to.isoformat(),
            'summary': {
                'total_invoiced':    _fmt(total_inv),
                'total_collected':   _fmt(total_coll),
                'total_outstanding': _fmt(max(Decimal('0'), total_inv - total_coll)),
                'collection_rate':   _fmt((total_coll / total_inv * 100) if total_inv else 0),
                'total_invoices':    totals['total_count'],
                'overdue_amount':    _fmt(overdue_invoices['overdue_amount']),
                'overdue_count':     overdue_invoices['overdue_count'],
            },
            'by_status': list(breakdown.values()),
        })
