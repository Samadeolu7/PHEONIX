from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.shortcuts import get_object_or_404
from django.utils import timezone
from common.views import ScopedModelViewSet
from common.serializers import IsTenantUser

from .models import Dashboard, Widget, WidgetDataSource, DashboardTemplate
from .serializers import (
    DashboardSerializer, WidgetSerializer, 
    WidgetDataSourceSerializer, DashboardThemeSerializer
)
from .utils import get_widget_data


class DashboardViewSet(ScopedModelViewSet):
    permission_module = 'dashboards'
    permission_page = 'dashboards'
    serializer_class = DashboardSerializer
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get_queryset(self):
        """Return all active dashboards"""
        return Dashboard.objects.filter(is_active=True).prefetch_related('widgets')

    def get_serializer_class(self):
        """Use different serializer for create action"""
        return DashboardSerializer

    def get_object(self):
        """Support lookup by both numeric pk and slug.

        The DRF router registers the URL as /dashboards/{pk}/ but we also want
        /dashboards/some-slug/ to work transparently so the frontend can use either
        the integer ID or the human-readable slug in the URL.
        """
        queryset = self.filter_queryset(self.get_queryset())
        lookup_value = self.kwargs.get(self.lookup_field)

        if lookup_value is not None and not str(lookup_value).lstrip('-').isdigit():
            # Non-numeric → treat as slug
            obj = get_object_or_404(queryset, slug=lookup_value)
        else:
            obj = get_object_or_404(queryset, pk=lookup_value)

        self.check_object_permissions(self.request, obj)
        return obj

    def retrieve(self, request, *args, **kwargs):
        """Get a single dashboard by ID"""
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return Response({"data": serializer.data})

    def create(self, request, *args, **kwargs):
        """Create a new dashboard"""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return Response({"data": serializer.data}, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        """Update an existing dashboard"""
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response({"data": serializer.data})

    @action(detail=False, methods=['get'])
    def default(self, request):
        """Get the calling user's default dashboard (scoped by owner)"""
        qs = Dashboard.objects.filter(is_active=True).prefetch_related('widgets')

        dashboard = None
        if request.user and request.user.is_authenticated:
            # User-specific default first
            dashboard = qs.filter(owner=request.user, is_default=True).first()
            if not dashboard:
                # Any dashboard owned by this user
                dashboard = qs.filter(owner=request.user).order_by('-updated_at').first()

        if not dashboard:
            # Global fallback — any dashboard marked is_default
            dashboard = qs.filter(is_default=True).first()

        if not dashboard:
            dashboard = qs.order_by('-updated_at').first()

        if not dashboard:
            return Response(
                {"error": "No dashboards found. Please create a dashboard first."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = self.get_serializer(dashboard)
        return Response({"data": serializer.data})

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated])
    def set_default(self, request, pk=None):
        """Mark this dashboard as the current user's default (clears any previous default)"""
        dashboard = self.get_object()
        # Clear existing default for this user
        Dashboard.objects.filter(owner=request.user, is_default=True).update(is_default=False)
        dashboard.is_default = True
        dashboard.save(update_fields=['is_default', 'updated_at'])
        # Also update the user FK so the next JWT login redirects here
        request.user.assigned_dashboard = dashboard
        request.user.save(update_fields=['assigned_dashboard'])
        return Response({
            "message": "Default dashboard updated.",
            "data": {"id": dashboard.id, "slug": dashboard.slug, "name": dashboard.name},
        })

    @action(detail=False, methods=['post'], permission_classes=[IsAuthenticated])
    def clear_default(self, request):
        """Remove the default-dashboard flag from all dashboards owned by this user"""
        updated = Dashboard.objects.filter(owner=request.user, is_default=True).update(is_default=False)
        # Clear the user FK so login no longer redirects to a specific dashboard
        request.user.assigned_dashboard = None
        request.user.save(update_fields=['assigned_dashboard'])
        return Response({"message": f"Default dashboard cleared ({updated} record(s) updated)."}
        )
    @action(detail=True, methods=['patch'])
    def layout(self, request, pk=None):
        """Update dashboard layout (all widgets at once)"""
        dashboard = self.get_object()
        widgets_data = request.data.get('widgets', [])

        updated_count = 0
        for widget_data in widgets_data:
            try:
                widget = Widget.objects.get(
                    dashboard=dashboard,
                    instance_key=widget_data.get('instanceKey')
                )
                layout_data = widget_data.get('layout', {})
                widget.update_layout(layout_data)
                widget.save()
                updated_count += 1
            except Widget.DoesNotExist:
                continue

        serializer = self.get_serializer(dashboard)
        return Response({
            'data': serializer.data,
            'message': f'Layout updated successfully. {updated_count} widgets updated.'
        })

    @action(detail=True, methods=['post'])
    def widgets(self, request, pk=None):
        """Add a widget to the dashboard"""
        dashboard = self.get_object()
        
        widget_data = {
            'dashboard': dashboard.id,
            'widget_type': request.data.get('widgetType'),
            'instance_key': request.data.get('instanceKey'),
            'config': request.data.get('config', {}),
        }
        
        layout_data = request.data.get('layout', {})
        
        serializer = WidgetSerializer(data=widget_data, context={'request': request})
        serializer.initial_data['layout'] = layout_data
        
        if serializer.is_valid():
            serializer.save()
            dashboard_serializer = self.get_serializer(dashboard)
            return Response({
                'data': dashboard_serializer.data,
                'message': 'Widget added successfully'
            }, status=status.HTTP_201_CREATED)
        
        return Response({
            'error': serializer.errors
        }, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['patch'], url_path='widgets/(?P<widget_id>[^/.]+)')
    def update_widget(self, request, slug=None, widget_id=None):
        """Update a specific widget"""
        dashboard = self.get_object()
        
        try:
            widget = Widget.objects.get(dashboard=dashboard, id=widget_id)
        except Widget.DoesNotExist:
            return Response({
                'error': 'Widget not found'
            }, status=status.HTTP_404_NOT_FOUND)
        
        serializer = WidgetSerializer(
            widget, 
            data=request.data, 
            partial=True,
            context={'request': request}
        )
        
        if serializer.is_valid():
            serializer.save()
            dashboard_serializer = self.get_serializer(dashboard)
            return Response({
                'data': dashboard_serializer.data,
                'message': 'Widget updated successfully'
            })
        
        return Response({
            'error': serializer.errors
        }, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['delete'], url_path='widgets/(?P<widget_id>[^/.]+)')
    def remove_widget(self, request, slug=None, widget_id=None):
        """Remove a widget from the dashboard"""
        dashboard = self.get_object()
        
        try:
            widget = Widget.objects.get(dashboard=dashboard, id=widget_id)
            widget.delete()
            
            dashboard_serializer = self.get_serializer(dashboard)
            return Response({
                'data': dashboard_serializer.data,
                'message': 'Widget removed successfully'
            })
        except Widget.DoesNotExist:
            return Response({
                'error': 'Widget not found'
            }, status=status.HTTP_404_NOT_FOUND)
    
    @action(detail=False, methods=['get'])
    def dashboards(self, request):
        """List all dashboards"""
        queryset = self.get_queryset()
        serializer = self.get_serializer(queryset, many=True)
        return Response({"data": serializer.data})


# ── Widget data helpers ───────────────────────────────────────────────────────

def _extract_config_data(wt, config):
    """
    Extract typed data from a widget's config, returning a properly-structured
    payload for the frontend. Never returns a raw config dict for chart types
    because the frontend cannot render an object that has no 'data' array.
    """
    def _nonnull(**kw):
        return {k: v for k, v in kw.items() if v is not None}

    if wt == 'kpi':
        result = _nonnull(
            value=config.get('value'),
            formatted=config.get('formatted'),
            trend=config.get('trend'),
        )
        return result if result else {'value': 0, 'formatted': '0', 'trend': None}

    if wt in ('bar_chart', 'line_chart', 'area_chart', 'chart'):
        arr = config.get('data') or []
        # Always return the correct structure — never the raw config dict
        return {
            'data': arr,
            'x_axis': config.get('x_axis', 'name'),
            'y_axis': config.get('y_axis', 'value'),
        }

    if wt == 'pie_chart':
        return {'data': config.get('data') or []}

    if wt == 'donut_chart':
        return {'data': config.get('data') or []}

    if wt == 'table':
        arr = config.get('data') or []
        return {'data': arr, 'columns': config.get('columns') or []}

    if wt == 'stat_grid':
        return {'stats': config.get('stats') or []}

    if wt == 'progress':
        value = config.get('value')
        return {'value': value if value is not None else 0, 'target': config.get('target', 100)}

    if wt == 'list':
        items = config.get('items') or config.get('data') or []
        return {'data': items}

    return config


def _fetch_live_widget_data(widget, request):
    """
    Query real DB models to return live data for a widget.
    Uses the widget title / config['metric'] as a hint when no explicit data
    source is configured.  All model imports are wrapped in try/except so
    missing apps degrade gracefully.
    Returns a data dict on success, None if nothing could be found.

    KEY NOTES on Transaction / Account schema:
    - Transaction has NO 'amount' field — amounts live on TransactionEntry (FK 'entries')
    - Transaction.date is a DateField (not created_at)
    - Transaction status is derived: approved → 'Approved', is_reversed → 'Reversed', else 'Pending'
    - TransactionEntry has NO owner/branch — scope via transaction__owner / transaction__branch
    - Account.account_type choices: 'ASSET','LIABILITY','EQUITY','INCOME','EXPENSE','LOAN','SAVINGS'
    - Income entries are CREDIT side (CR); Expense entries are DEBIT side (DR)
    """
    from django.db.models import Sum, Count, Q as DQ
    from django.db.models.functions import TruncMonth
    from datetime import timedelta
    from decimal import Decimal

    config  = widget.config or {}
    wt      = widget.widget_type
    title   = (widget.title or '').lower()
    owner   = getattr(request.user, 'account_owner', None)
    branch  = getattr(request.user, 'current_branch', None)

    def _base(extra=None):
        """Filter dict for models that have direct owner/branch fields (Transaction, etc.)."""
        q = {}
        if owner:  q['owner']  = owner
        if branch: q['branch'] = branch
        if extra:  q.update(extra)
        return q

    def _entry_base(extra=None):
        """Filter dict for TransactionEntry — scoped via the parent Transaction FK."""
        q = {}
        if owner:  q['transaction__owner']  = owner
        if branch: q['transaction__branch'] = branch
        if extra:  q.update(extra)
        return q

    # ── KPI ────────────────────────────────────────────────────────────────────
    if wt == 'kpi':
        metric = config.get('metric', '').lower()
        hint   = metric or title

        # ── Income report KPIs (explicit metric prefix) ──────────────────────
        if metric.startswith('income_'):
            try:
                from incomes.models import Invoice
                from django.db.models import Sum as _Sum, Count as _Count
                now = timezone.now()
                year_start = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0).date()
                inv_qs = Invoice.objects.for_user(request.user).filter(
                    invoice_date__gte=year_start,
                ).exclude(status='cancelled')
                totals = inv_qs.aggregate(
                    total_invoiced=_Sum('total_amount'),
                    total_collected=_Sum('amount_paid'),
                )
                inv = float(totals['total_invoiced'] or 0)
                col = float(totals['total_collected'] or 0)
                out = max(0.0, inv - col)
                rate = round(col / inv * 100, 1) if inv else 0.0

                if metric == 'income_invoiced':
                    return {'value': inv, 'formatted': f'\u20a6{inv:,.0f}', 'trend': None}
                elif metric == 'income_collected':
                    return {'value': col, 'formatted': f'\u20a6{col:,.0f}', 'trend': None}
                elif metric == 'income_outstanding':
                    return {'value': out, 'formatted': f'\u20a6{out:,.0f}', 'trend': None}
                elif metric == 'income_collection_rate':
                    return {'value': rate, 'formatted': f'{rate:.1f}%', 'trend': None}
            except Exception:
                pass

        # Pending expenses (awaiting approval)
        if metric == 'pending_expenses' or (metric == 'approved_today') or ('expense' in hint and 'pending' in hint):
            try:
                from expenses.models import Expense
                count = Expense.objects.filter(**_base({'status': 'submitted', 'is_deleted': False})).count()
                return {'value': count, 'formatted': f'{count:,}', 'trend': None}
            except Exception:
                pass

        # Pending procurement (requisitions + purchase orders awaiting approval)
        if metric == 'pending_procurement' or (metric == 'rejected_today') or ('procurement' in hint and 'pending' in hint):
            try:
                from procurement.models import PurchaseRequisition, PurchaseOrder
                count = 0
                count += PurchaseRequisition.objects.filter(**_base({'status': 'submitted', 'is_deleted': False})).count()
                count += PurchaseOrder.objects.filter(**_base({'status': 'submitted', 'is_deleted': False})).count()
                return {'value': count, 'formatted': f'{count:,}', 'trend': None}
            except Exception:
                pass

        # Outstanding receivables
        if metric == 'outstanding_receivables' or any(w in hint for w in ['receivable', 'outstanding']):
            try:
                from incomes.models import Invoice
                from django.db.models import Sum as _Sum, F as _F
                qs = Invoice.objects.for_user(request.user).filter(
                    status__in=['sent', 'partially_paid', 'overdue']
                )
                agg = qs.aggregate(
                    inv=_Sum('total_amount'),
                    paid=_Sum('amount_paid'),
                )
                out = max(0.0, float(agg['inv'] or 0) - float(agg['paid'] or 0))
                return {'value': out, 'formatted': f'\u20a6{out:,.0f}', 'trend': None}
            except Exception:
                pass

        # Total staff / headcount
        if metric in ('total_staff', 'staff_count') or any(w in hint for w in ['staff', 'headcount', 'employee']):
            try:
                from hr.models import Staff
                count = Staff.objects.filter(**_base({'is_deleted': False})).count()
                return {'value': count, 'formatted': f'{count:,}', 'trend': None}
            except Exception:
                pass

        # Student / client count
        if any(w in hint for w in ['student', 'client', 'enrollment', 'learner', 'pupil']):
            try:
                from clients.models import Client
                count = Client.objects.filter(**_base({'is_deleted': False})).count()
                return {'value': count, 'formatted': f'{count:,}', 'trend': None}
            except Exception:
                pass

        # Pending approvals — sum across all modules
        if metric == 'pending_approvals' or 'pending approvals' in hint or 'total pending' in hint:
            try:
                count = 0
                try:
                    from expenses.models import Expense
                    count += Expense.objects.filter(**_base({'status': 'submitted', 'is_deleted': False})).count()
                except Exception: pass
                try:
                    from expenses.models import ResourceConsumption
                    count += ResourceConsumption.objects.filter(**_base({'is_deleted': False})).filter(
                        status__in=['submitted', 'flagged']).count()
                except Exception: pass
                try:
                    from banks.models import BankTransfer, BankPayment
                    count += BankTransfer.objects.filter(**_base({'status': 'pending', 'is_deleted': False})).count()
                    count += BankPayment.objects.filter(**_base({'status': 'pending', 'is_deleted': False})).count()
                except Exception: pass
                try:
                    from cash_management.models import PettyCashVoucher, PettyCashReplenishment
                    count += PettyCashVoucher.objects.filter(**_base({'status': 'pending', 'is_deleted': False})).count()
                    count += PettyCashReplenishment.objects.filter(**_base({'status': 'submitted', 'is_deleted': False})).count()
                except Exception: pass
                try:
                    from procurement.models import PurchaseRequisition, PurchaseOrder
                    count += PurchaseRequisition.objects.filter(**_base({'status': 'submitted', 'is_deleted': False})).count()
                    count += PurchaseOrder.objects.filter(**_base({'status': 'submitted', 'is_deleted': False})).count()
                except Exception: pass
                try:
                    from hr.models import LeaveRequest, BonusDeductionRequest, Payroll
                    count += LeaveRequest.objects.filter(**_base({'status': 'submitted', 'is_deleted': False})).count()
                    count += BonusDeductionRequest.objects.filter(**_base({'status': 'PENDING', 'is_deleted': False})).count()
                    count += Payroll.objects.filter(**_base({'status': 'calculated', 'is_deleted': False})).count()
                except Exception: pass
                try:
                    from inventory.models import MaterialRequest, StockAdjustmentRequest
                    count += MaterialRequest.objects.filter(**_base({'status': 'submitted', 'is_deleted': False})).count()
                    count += StockAdjustmentRequest.objects.filter(**_base({'status': 'pending', 'is_deleted': False})).count()
                except Exception: pass
                return {'value': count, 'formatted': f'{count:,}', 'trend': None}
            except Exception:
                pass

        # Revenue / income / fees  (Income accounts increase on CREDIT side)
        if metric in ('revenue_mtd', 'income_mtd') or any(w in hint for w in ['revenue', 'income', 'fee', 'earning', 'collection', 'receipt']):
            try:
                from transactions.models import TransactionEntry
                now = timezone.now()
                month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).date()
                q = _entry_base({
                    'transaction__date__gte': month_start,
                    'transaction__is_deleted': False,
                    'account__account_type': 'INCOME',
                    'side': 'CR',
                })
                total = TransactionEntry.objects.filter(**q).aggregate(total=Sum('amount'))['total'] or Decimal('0')
                return {'value': float(total), 'formatted': f'\u20a6{float(total):,.0f}', 'trend': None}
            except Exception:
                pass

        # Expenses  (Expense accounts increase on DEBIT side)
        if metric == 'expenses_mtd' or any(w in hint for w in ['expense', 'cost', 'spend', 'expenditure']):
            try:
                from transactions.models import TransactionEntry
                now = timezone.now()
                month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).date()
                q = _entry_base({
                    'transaction__date__gte': month_start,
                    'transaction__is_deleted': False,
                    'account__account_type': 'EXPENSE',
                    'side': 'DR',
                })
                total = TransactionEntry.objects.filter(**q).aggregate(total=Sum('amount'))['total'] or Decimal('0')
                return {'value': float(total), 'formatted': f'\u20a6{float(total):,.0f}', 'trend': None}
            except Exception:
                pass

        # Fixed asset count
        if any(w in hint for w in ['asset', 'equipment', 'property', 'fixed']):
            try:
                from assets.models import FixedAsset
                count = FixedAsset.objects.filter(**_base({'is_deleted': False})).count()
                return {'value': count, 'formatted': f'{count:,}', 'trend': None}
            except Exception:
                pass

        # Inventory / stock
        if any(w in hint for w in ['stock', 'inventory', 'item', 'product', 'warehouse']):
            try:
                from inventory.models import InventoryItem
                count = InventoryItem.objects.filter(**_base({'is_deleted': False})).count()
                return {'value': count, 'formatted': f'{count:,}', 'trend': None}
            except Exception:
                pass

        # Generic fallback: approved transactions this month
        try:
            from transactions.models import Transaction
            now = timezone.now()
            month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).date()
            count = Transaction.objects.filter(**_base({'date__gte': month_start, 'is_deleted': False})).count()
            return {'value': count, 'formatted': f'{count:,}', 'trend': None}
        except Exception:
            pass

    # ── Bar / Line / Area charts ───────────────────────────────────────────────
    elif wt in ('bar_chart', 'line_chart', 'area_chart', 'chart'):
        metric = config.get('metric', '').lower()
        hint   = metric or title

        # ── Approvals / submissions trend (expense submissions by month) ────────
        if metric == 'approvals_trend' or any(w in hint for w in ['approval', 'approvals over time', 'submissions']):
            try:
                from expenses.models import Expense
                from django.db.models.functions import TruncMonth
                now = timezone.now()
                six_months_ago = (now - timedelta(days=180)).date()
                monthly = (
                    Expense.objects.filter(**_base({'is_deleted': False}))
                    .filter(created_at__date__gte=six_months_ago)
                    .exclude(status='draft')
                    .annotate(month=TruncMonth('created_at'))
                    .values('month')
                    .annotate(value=Count('id'))
                    .order_by('month')
                )
                arr = [{'name': m['month'].strftime('%b %Y'), 'value': m['value']} for m in monthly]
                if arr:
                    return {'data': arr, 'x_axis': 'name', 'y_axis': 'value'}
            except Exception:
                pass

        # ── Income trend (explicit metric OR title hints like "Revenue Trend") ──
        _income_trend_triggers = ['income_trend', 'revenue trend', 'income trend', 'sales trend']
        if metric == 'income_trend' or any(h in hint for h in _income_trend_triggers):
            try:
                from incomes.models import Invoice
                from django.db.models import Sum as _Sum
                from django.db.models.functions import TruncMonth
                now = timezone.now()
                year_start = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0).date()
                twelve_months_ago = (now - timedelta(days=365)).date()
                base_inv_qs = (
                    Invoice.objects.for_user(request.user)
                    .exclude(status='cancelled')
                )
                # Try YTD first; fall back to rolling 12-month window if empty
                for date_from in (year_start, twelve_months_ago):
                    monthly = (
                        base_inv_qs
                        .filter(invoice_date__gte=date_from)
                        .annotate(month=TruncMonth('invoice_date'))
                        .values('month')
                        .annotate(value=_Sum('total_amount'))
                        .order_by('month')
                    )
                    arr = [
                        {'name': m['month'].strftime('%b %Y'), 'value': float(m['value'] or 0)}
                        for m in monthly
                    ]
                    if arr:
                        return {'data': arr, 'x_axis': 'name', 'y_axis': 'value'}
            except Exception:
                pass

        # ── Procurement spend by month ────────────────────────────────────────
        if metric == 'procurement_spend' or 'procurement spend' in hint:
            try:
                from procurement.models import PurchaseOrder
                from django.db.models import Sum as _Sum
                from django.db.models.functions import TruncMonth
                now = timezone.now()
                six_months_ago = (now - timedelta(days=180)).date()
                monthly = (
                    PurchaseOrder.objects.filter(
                        **_base({'is_deleted': False})
                    )
                    .filter(order_date__gte=six_months_ago)
                    .exclude(status__in=['cancelled', 'draft'])
                    .annotate(month=TruncMonth('order_date'))
                    .values('month')
                    .annotate(value=_Sum('total_amount'))
                    .order_by('month')
                )
                arr = [
                    {'name': m['month'].strftime('%b %Y'), 'value': float(m['value'] or 0)}
                    for m in monthly
                ]
                if arr:
                    return {'data': arr, 'x_axis': 'name', 'y_axis': 'value'}
            except Exception:
                pass

        # Decide account type from hint
        if any(w in hint for w in ['expense', 'cost', 'spend']):
            acct_type, entry_side = 'EXPENSE', 'DR'
        else:
            acct_type, entry_side = 'INCOME', 'CR'

        try:
            from transactions.models import TransactionEntry
            now = timezone.now()
            six_months_ago = (now - timedelta(days=180)).date()
            q = _entry_base({
                'transaction__date__gte': six_months_ago,
                'transaction__is_deleted': False,
                'account__account_type': acct_type,
                'side': entry_side,
            })
            monthly = (
                TransactionEntry.objects.filter(**q)
                .annotate(month=TruncMonth('transaction__date'))
                .values('month')
                .annotate(value=Sum('amount'))
                .order_by('month')
            )
            arr = [
                {'name': m['month'].strftime('%b %Y'), 'value': float(m['value'] or 0)}
                for m in monthly
            ]
            if arr:
                return {
                    'data': arr,
                    'x_axis': config.get('x_axis', 'name'),
                    'y_axis': config.get('y_axis', 'value'),
                }
        except Exception:
            pass

        # Fallback: monthly transaction count (always shows something)
        try:
            from transactions.models import Transaction
            now = timezone.now()
            six_months_ago = (now - timedelta(days=180)).date()
            monthly = (
                Transaction.objects.filter(**_base({'date__gte': six_months_ago, 'is_deleted': False}))
                .annotate(month=TruncMonth('date'))
                .values('month')
                .annotate(value=Count('id'))
                .order_by('month')
            )
            arr = [{'name': m['month'].strftime('%b %Y'), 'value': m['value']} for m in monthly]
            if arr:
                return {
                    'data': arr,
                    'x_axis': config.get('x_axis', 'name'),
                    'y_axis': config.get('y_axis', 'value'),
                }
        except Exception:
            pass

    # ── Pie / Donut charts ─────────────────────────────────────────────────────
    elif wt in ('pie_chart', 'donut_chart'):
        try:
            from transactions.models import TransactionEntry
            now = timezone.now()
            six_months_ago = (now - timedelta(days=180)).date()
            q = _entry_base({
                'transaction__date__gte': six_months_ago,
                'transaction__is_deleted': False,
                'account__account_type': 'EXPENSE',
                'side': 'DR',
            })
            by_account = (
                TransactionEntry.objects.filter(**q)
                .values('account__name')
                .annotate(value=Sum('amount'))
                .order_by('-value')[:8]
            )
            arr = [{'name': r['account__name'], 'value': float(r['value'] or 0)} for r in by_account]
            if arr:
                return {'data': arr}
        except Exception:
            pass

    # ── Table ──────────────────────────────────────────────────────────────────
    elif wt == 'table':
        metric = config.get('metric', '').lower()
        hint   = metric or title

        # ── Income by category table ─────────────────────────────────────────
        if metric == 'income_by_category':
            try:
                from incomes.models import Invoice, InvoiceItem
                from django.db.models import Sum as _Sum, Count as _Count, F as _F
                now = timezone.now()
                year_start = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0).date()
                twelve_months_ago = (now - timedelta(days=365)).date()
                columns = [
                    {'field': 'category', 'label': 'Category'},
                    {'field': 'invoiced',  'label': 'Invoiced (₦)'},
                    {'field': 'invoices',  'label': '# Invoices'},
                ]
                # Try YTD first; fall back to rolling 12 months
                for date_from in (year_start, twelve_months_ago):
                    inv_qs = Invoice.objects.for_user(request.user).filter(
                        invoice_date__gte=date_from,
                    ).exclude(status='cancelled')
                    rows_qs = (
                        InvoiceItem.objects.filter(invoice__in=inv_qs)
                        .values('service_item__category__name')
                        .annotate(
                            invoiced=_Sum(_F('quantity') * _F('unit_price')),
                            count=_Count('invoice_id', distinct=True),
                        )
                        .order_by('-invoiced')[:10]
                    )
                    rows = [
                        {
                            'category': r['service_item__category__name'] or 'Uncategorised',
                            'invoiced': float(r['invoiced'] or 0),
                            'invoices': r['count'],
                        }
                        for r in rows_qs
                    ]
                    if rows:
                        return {'data': rows, 'columns': columns}
            except Exception:
                pass

        # ── Open purchase orders ──────────────────────────────────────────────
        if metric == 'open_purchase_orders' or any(w in hint for w in ['purchase order', 'open order']):
            try:
                from procurement.models import PurchaseOrder
                orders = (
                    PurchaseOrder.objects.filter(**_base({'is_deleted': False}))
                    .exclude(status__in=['cancelled', 'received'])
                    .order_by('-order_date')[:15]
                )
                rows = [
                    {
                        'po_number': o.po_number,
                        'supplier': str(o.supplier),
                        'order_date': o.order_date.strftime('%Y-%m-%d'),
                        'total_amount': float(o.total_amount),
                        'status': o.get_status_display(),
                    }
                    for o in orders
                ]
                if rows:
                    columns = config.get('columns') or [
                        {'field': 'po_number',    'label': 'PO #'},
                        {'field': 'supplier',     'label': 'Supplier'},
                        {'field': 'order_date',   'label': 'Date'},
                        {'field': 'total_amount', 'label': 'Amount (₦)'},
                        {'field': 'status',       'label': 'Status'},
                    ]
                    return {'data': rows, 'columns': columns}
            except Exception:
                pass

        try:
            from transactions.models import Transaction
            # Annotate each row with its total debit amount (avoids N+1 queries)
            recent = (
                Transaction.objects.filter(**_base({'is_deleted': False}))
                .annotate(total_amount=Sum('entries__amount', filter=DQ(entries__side='DR')))
                .order_by('-date')[:10]
            )
            rows = []
            for t in recent:
                if t.is_reversed:
                    status = 'Reversed'
                elif t.approved:
                    status = 'Approved'
                else:
                    status = 'Pending'
                rows.append({
                    'id': t.id,
                    'date': t.date.strftime('%Y-%m-%d'),
                    'reference': t.reference_number,
                    'description': t.description or '',
                    'amount': float(t.total_amount or 0),
                    'status': status,
                })
            if rows:
                columns = config.get('columns') or [
                    {'field': 'date',        'label': 'Date'},
                    {'field': 'reference',   'label': 'Reference'},
                    {'field': 'description', 'label': 'Description'},
                    {'field': 'amount',      'label': 'Amount'},
                    {'field': 'status',      'label': 'Status'},
                ]
                return {'data': rows, 'columns': columns}
        except Exception:
            pass

    # ── List ───────────────────────────────────────────────────────────────────
    elif wt == 'list':
        metric = config.get('metric', '').lower()
        hint   = metric or title

        # ── Stock movements ────────────────────────────────────────────────────
        if metric == 'stock_movements' or any(w in hint for w in ['stock movement', 'movement', 'stock']):
            try:
                from inventory.models import StockMovement
                recent = (
                    StockMovement.objects.filter(**_base({'is_deleted': False}))
                    .order_by('-movement_date', '-created_at')[:10]
                )
                arr = [
                    {
                        'name': f"{m.movement_type.replace('_', ' ').title()}: {m.item.sku}",
                        'description': f"Qty: {m.quantity} | {m.movement_date.strftime('%b %d')}",
                        'icon': 'arrow-right-left',
                    }
                    for m in recent
                ]
                if arr:
                    return {'data': arr}
            except Exception:
                pass

        # Fallback: pending expense claims as list items
        try:
            from expenses.models import Expense
            items_qs = Expense.objects.filter(
                **_base({'status': 'submitted', 'is_deleted': False})
            ).order_by('-created_at')[:8]
            arr = [
                {
                    'name': e.description or f'Expense #{e.id}',
                    'description': f"{e.expense_type or ''} \u2014 \u20a6{float(e.amount or 0):,.0f}".strip(' \u2014'),
                    'icon': 'receipt',
                }
                for e in items_qs
            ]
            if arr:
                return {'data': arr}
        except Exception:
            pass

        # Fallback: recent transactions as list items
        try:
            from transactions.models import Transaction
            recent = Transaction.objects.filter(**_base({'is_deleted': False})).order_by('-date')[:8]
            arr = [
                {'name': t.reference_number, 'description': t.description or '', 'icon': 'file'}
                for t in recent
            ]
            if arr:
                return {'data': arr}
        except Exception:
            pass

    # ── Stat grid ──────────────────────────────────────────────────────────────
    elif wt == 'stat_grid':
        metric = config.get('metric', '').lower()
        hint   = metric or title

        # ── Fuel summary metric ────────────────────────────────────────────────
        if metric == 'fuel_summary':
            try:
                from expenses.models import ResourceConsumption
                from django.db.models import Sum as _Sum, Count as _Count, Q as _Q
                now = timezone.now()
                thirty_days_ago = (now - timedelta(days=30)).date()
                qs = ResourceConsumption.objects.filter(
                    branch=request.user.branch,
                    resource__resource_type='fuel',
                    consumption_date__gte=thirty_days_ago,
                    status__in=['approved', 'posted'],
                )
                totals = qs.aggregate(
                    total_litres=_Sum('quantity_consumed'),
                    total_cost=_Sum('total_cost'),
                    flagged=_Count('id', filter=_Q(is_irregular=True)),
                )
                stats = [
                    {'label': 'Litres (30 days)', 'value': f"{float(totals['total_litres'] or 0):,.0f} L"},
                    {'label': 'Fuel Cost (30 days)', 'value': f"\u20a6{float(totals['total_cost'] or 0):,.0f}"},
                    {'label': 'Flagged Items', 'value': str(totals['flagged'] or 0)},
                ]
                return {'stats': stats}
            except Exception:
                pass

        # ── Approval stats (pending breakdown by module) ──────────────────────
        if metric == 'approval_stats' or 'approval' in hint:
            try:
                exp_pend = proc_pend = hr_pend = bank_pend = 0
                try:
                    from expenses.models import Expense, ResourceConsumption
                    exp_pend += Expense.objects.filter(**_base({'status': 'submitted', 'is_deleted': False})).count()
                    exp_pend += ResourceConsumption.objects.filter(**_base({'is_deleted': False})).filter(
                        status__in=['submitted', 'flagged']).count()
                except Exception: pass
                try:
                    from procurement.models import PurchaseRequisition, PurchaseOrder
                    proc_pend += PurchaseRequisition.objects.filter(**_base({'status': 'submitted', 'is_deleted': False})).count()
                    proc_pend += PurchaseOrder.objects.filter(**_base({'status': 'submitted', 'is_deleted': False})).count()
                except Exception: pass
                try:
                    from hr.models import LeaveRequest, BonusDeductionRequest, Payroll
                    hr_pend += LeaveRequest.objects.filter(**_base({'status': 'submitted', 'is_deleted': False})).count()
                    hr_pend += BonusDeductionRequest.objects.filter(**_base({'status': 'PENDING', 'is_deleted': False})).count()
                    hr_pend += Payroll.objects.filter(**_base({'status': 'calculated', 'is_deleted': False})).count()
                except Exception: pass
                try:
                    from banks.models import BankTransfer, BankPayment
                    bank_pend += BankTransfer.objects.filter(**_base({'status': 'pending', 'is_deleted': False})).count()
                    bank_pend += BankPayment.objects.filter(**_base({'status': 'pending', 'is_deleted': False})).count()
                except Exception: pass
                total = exp_pend + proc_pend + hr_pend + bank_pend
                stats = [
                    {'label': 'Total Pending',  'value': f'{total:,}'},
                    {'label': 'Expenses',        'value': f'{exp_pend:,}'},
                    {'label': 'Procurement',     'value': f'{proc_pend:,}'},
                    {'label': 'HR',              'value': f'{hr_pend:,}'},
                ]
                return {'stats': stats}
            except Exception:
                pass

        # ── Operations stats ───────────────────────────────────────────────────
        if metric == 'operations_stats':
            try:
                from hr.models import Staff
                from procurement.models import PurchaseOrder
                from inventory.models import InventoryItem
                staff  = Staff.objects.filter(**_base({'is_deleted': False})).count()
                orders = (
                    PurchaseOrder.objects.filter(**_base({'is_deleted': False}))
                    .exclude(status__in=['cancelled', 'received']).count()
                )
                stock  = InventoryItem.objects.filter(**_base({'is_deleted': False})).count()
                grns   = (
                    PurchaseOrder.objects.filter(**_base({'is_deleted': False, 'status': 'partially_received'})).count()
                )
                stats = [
                    {'label': 'Total Staff',   'value': f'{staff:,}'},
                    {'label': 'Open Orders',   'value': f'{orders:,}'},
                    {'label': 'Stock Items',   'value': f'{stock:,}'},
                    {'label': 'Pending GRNs',  'value': f'{grns:,}'},
                ]
                return {'stats': stats}
            except Exception:
                pass

        stats = []
        try:
            from clients.models import Client
            c = Client.objects.filter(**_base({'is_deleted': False})).count()
            stats.append({'label': 'Total Clients', 'value': f'{c:,}'})
        except Exception:
            pass
        try:
            pend = 0
            try:
                from expenses.models import Expense
                pend += Expense.objects.filter(**_base({'status': 'submitted', 'is_deleted': False})).count()
            except Exception: pass
            try:
                from procurement.models import PurchaseRequisition
                pend += PurchaseRequisition.objects.filter(**_base({'status': 'submitted', 'is_deleted': False})).count()
            except Exception: pass
            try:
                from hr.models import LeaveRequest
                pend += LeaveRequest.objects.filter(**_base({'status': 'submitted', 'is_deleted': False})).count()
            except Exception: pass
            if pend > 0:
                stats.append({'label': 'Pending Approvals', 'value': f'{pend:,}'})
        except Exception:
            pass
        try:
            from transactions.models import Transaction
            now = timezone.now()
            month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).date()
            c = Transaction.objects.filter(
                **_base({'is_deleted': False, 'date__gte': month_start, 'approved': True})
            ).count()
            stats.append({'label': 'Approved This Month', 'value': f'{c:,}'})
        except Exception:
            pass
        if stats:
            return {'stats': stats}

    # ── Progress ───────────────────────────────────────────────────────────────
    elif wt == 'progress':
        metric = config.get('metric', '').lower()
        hint   = metric or title

        # ── Procurement target ─────────────────────────────────────────────────
        if metric == 'procurement_target' or 'procurement' in hint:
            try:
                from procurement.models import PurchaseOrder
                now = timezone.now()
                month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).date()
                orders   = PurchaseOrder.objects.filter(**_base({'order_date__gte': month_start, 'is_deleted': False}))
                total    = orders.count()
                received = orders.filter(status__in=['received', 'partially_received']).count()
                pct      = int(received / total * 100) if total > 0 else 0
                return {
                    'value': pct,
                    'target': 100,
                    'label': f'{received} of {total} orders fulfilled this month',
                }
            except Exception:
                pass

        # ── Expense approval rate ──────────────────────────────────────────────
        if metric in ('approval_rate', 'monthly_approval_rate') or 'approval' in hint:
            try:
                from expenses.models import Expense
                now = timezone.now()
                month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).date()
                qs       = Expense.objects.filter(**_base({'is_deleted': False})).filter(
                    created_at__date__gte=month_start).exclude(status='draft')
                total    = qs.count()
                approved = qs.filter(status='approved').count()
                pct      = int(approved / total * 100) if total > 0 else 0
                return {
                    'value': pct,
                    'target': 100,
                    'label': f'{approved} of {total} expenses approved this month',
                }
            except Exception:
                pass

        try:
            from transactions.models import Transaction
            now = timezone.now()
            month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).date()
            total    = Transaction.objects.filter(**_base({'is_deleted': False, 'date__gte': month_start})).count()
            approved = Transaction.objects.filter(**_base({'is_deleted': False, 'date__gte': month_start, 'approved': True})).count()
            pct = int((approved / total * 100)) if total > 0 else 0
            return {
                'value': pct,
                'target': 100,
                'label': f'{approved} of {total} approved this month',
            }
        except Exception:
            pass

    return None


class WidgetViewSet(ScopedModelViewSet):
    permission_module = 'dashboards'
    permission_page = 'widgets'
    queryset = Widget.objects.all()
    serializer_class = WidgetSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Widget.objects.all()

    @action(detail=True, methods=['get'])
    def data(self, request, pk=None):
        """Get data for a specific widget.

        Priority chain:
          1. Widget.data_source FK  (WidgetDataSource model)
          2. config['dataSource'] identifier  →  WidgetDataSource lookup
          3. Live DB query  (_fetch_live_widget_data)
          4. Embedded static data from config  (_extract_config_data)
        """
        widget = self.get_object()
        config = widget.config or {}
        parameters = request.query_params.dict()

        # 1. FK data source
        if widget.data_source_id:
            try:
                data = get_widget_data(widget.data_source, parameters)
                return Response({"data": data})
            except Exception:
                pass

        # 2. config['dataSource'] identifier
        data_source_identifier = config.get('dataSource')
        if data_source_identifier:
            try:
                data_source = WidgetDataSource.objects.get(
                    identifier=data_source_identifier, is_active=True
                )
                data = get_widget_data(data_source, parameters)
                return Response({"data": data})
            except WidgetDataSource.DoesNotExist:
                pass

        # 3. Live data from real DB queries
        try:
            live = _fetch_live_widget_data(widget, request)
            if live:
                return Response({"data": live})
        except Exception:
            pass

        # 4. Embedded static / config data (nulls stripped; full config as last resort)
        return Response({"data": _extract_config_data(widget.widget_type, config)})


class WidgetDataSourceViewSet(ScopedModelViewSet):
    permission_module = 'dashboards'
    permission_page = 'widget-data-sources'
    queryset = WidgetDataSource.objects.filter(is_active=True)
    serializer_class = WidgetDataSourceSerializer
    permission_classes = [AllowAny]  # No auth required for testing


class DashboardTemplateViewSet(ScopedModelViewSet):
    permission_module = 'dashboards'
    permission_page = 'dashboard-templates'
    queryset = DashboardTemplate.objects.filter(is_active=True)
    serializer_class = DashboardThemeSerializer
    permission_classes = [AllowAny]  # No auth required for testing

    @action(detail=True, methods=['post'])
    def apply(self, request, pk=None):
        """Create a new dashboard from this template"""
        template = self.get_object()
        
        dashboard_name = request.data.get('name', template.name)
        
        # Create dashboard from template
        dashboard = Dashboard.objects.create(
            name=dashboard_name,
            description=template.description,
            is_default=False
        )

        # Create widgets from template config
        for widget_config in template.template_config.get('widgets', []):
            layout_data = widget_config.pop('layout', {})
            Widget.objects.create(
                dashboard=dashboard,
                widget_type=widget_config.get('widgetType'),
                instance_key=widget_config.get('instanceKey'),
                config=widget_config.get('config', {}),
                layout_x=layout_data.get('x', 0),
                layout_y=layout_data.get('y', 0),
                layout_w=layout_data.get('w', 4),
                layout_h=layout_data.get('h', 4),
                layout_min_w=layout_data.get('minW'),
                layout_min_h=layout_data.get('minH'),
                layout_max_w=layout_data.get('maxW'),
                layout_max_h=layout_data.get('maxH'),
            )

        serializer = DashboardSerializer(dashboard)
        return Response({
            'data': serializer.data,
            'message': 'Dashboard created from template'
        }, status=status.HTTP_201_CREATED)