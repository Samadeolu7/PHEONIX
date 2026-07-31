# api/views/widget_endpoints.py
"""
API Endpoints for Dashboard Widget Data Sources
Provides real-time data for all school ERP widgets
"""

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from django.db.models import Sum, Count, Q, F
from django.utils import timezone
from datetime import timedelta
from decimal import Decimal, ROUND_HALF_UP

from clients.models import Client
from accounts.models import Account
from transactions.models import Transaction, TransactionEntry
from automations.models import WorkflowRun, WorkflowApproval, FormSubmission
from inventory.models import InventoryItem
from assets.models import FixedAsset


# ============================================================================
# STUDENT & CLIENT WIDGETS
# ============================================================================

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def total_students_count(request):
    """
    GET /api/widgets/students/count/
    Returns total number of active students
    """
    from common.views import resolve_effective_branch
    owner = request.user
    branch = resolve_effective_branch(request)
    
    count = Client.objects.filter(
        owner=owner,
        branch=branch,
        classification__code='STUDENT',
        status='ACTIVE',
        is_deleted=False
    ).count()
    
    return Response({
        'value': count,
        'label': 'Total Students',
        'trend': None,
        'last_updated': timezone.now().isoformat()
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def outstanding_fees_total(request):
    """
    GET /api/widgets/finance/outstanding-fees/
    Returns total outstanding student fees
    """
    from common.views import resolve_effective_branch
    owner = request.user
    branch = resolve_effective_branch(request)
    
    # Sum all student receivable account balances
    total = Account.objects.filter(
        owner=owner,
        branch=branch,
        account_type='RECEIVABLE',
        client__classification__code='STUDENT',
        is_deleted=False
    ).aggregate(
        total=Sum('balance')
    )['total'] or Decimal('0.00')
    
    # Calculate trend (compare with last month)
    last_month = timezone.now() - timedelta(days=30)
    trend_data = calculate_balance_trend(
        owner, branch, 'RECEIVABLE', last_month
    )
    
    return Response({
        'value': total,
        'formatted': f"${total:,.2f}",
        'label': 'Outstanding Fees',
        'trend': trend_data,
        'currency': 'USD',
        'last_updated': timezone.now().isoformat()
    })


# ============================================================================
# FINANCIAL WIDGETS
# ============================================================================

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def monthly_income(request):
    """
    GET /api/widgets/finance/monthly-income/
    Returns income for current month
    """
    from common.views import resolve_effective_branch
    owner = request.user
    branch = resolve_effective_branch(request)
    
    # Get start of current month
    now = timezone.now()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    # Sum all credit entries to income accounts this month
    income = TransactionEntry.objects.filter(
        transaction__owner=owner,
        transaction__branch=branch,
        transaction__date__gte=month_start,
        transaction__status='approved',
        account__account_type='INCOME',
        credit__gt=0
    ).aggregate(
        total=Sum('credit')
    )['total'] or Decimal('0.00')
    
    # Calculate compared to last month
    last_month_start = (month_start - timedelta(days=1)).replace(day=1)
    last_month_income = TransactionEntry.objects.filter(
        transaction__owner=owner,
        transaction__branch=branch,
        transaction__date__gte=last_month_start,
        transaction__date__lt=month_start,
        transaction__status='approved',
        account__account_type='INCOME',
        credit__gt=0
    ).aggregate(
        total=Sum('credit')
    )['total'] or Decimal('0.00')
    
    trend_percent = Decimal('0')
    if last_month_income > 0:
        trend_percent = ((income - last_month_income) / last_month_income * 100).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    
    return Response({
        'value': income,
        'formatted': f"${income:,.2f}",
        'label': 'Income This Month',
        'trend': {
            'direction': 'up' if trend_percent > 0 else 'down',
            'percentage': abs(trend_percent),
            'comparison': 'vs last month'
        },
        'currency': 'USD',
        'period': {
            'start': month_start.isoformat(),
            'end': now.isoformat()
        },
        'last_updated': timezone.now().isoformat()
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def debtor_aging_summary(request):
    """
    GET /api/widgets/finance/debtor-aging/
    Returns aging breakdown of receivables
    """
    from common.views import resolve_effective_branch
    owner = request.user
    branch = resolve_effective_branch(request)
    
    now = timezone.now()
    
    # Get all student accounts with balances
    students_with_balance = Account.objects.filter(
        owner=owner,
        branch=branch,
        account_type='RECEIVABLE',
        client__classification__code='STUDENT',
        balance__gt=0,
        is_deleted=False
    ).select_related('client')
    
    aging_buckets = {
        '1-30': {'count': 0, 'amount': Decimal('0.00')},
        '31-60': {'count': 0, 'amount': Decimal('0.00')},
        '61-90': {'count': 0, 'amount': Decimal('0.00')},
        '90+': {'count': 0, 'amount': Decimal('0.00')}
    }
    
    for account in students_with_balance:
        # Find oldest unpaid invoice
        oldest_invoice = Transaction.objects.filter(
            entries__account=account,
            entries__debit__gt=0,
            status='approved'
        ).exclude(
            # Exclude if fully paid
            id__in=Transaction.objects.filter(
                entries__account=account,
                entries__credit__gte=F('entries__debit')
            ).values_list('id', flat=True)
        ).order_by('date').first()
        
        if oldest_invoice:
            days_overdue = (now.date() - oldest_invoice.date).days
            balance = account.balance
            
            if days_overdue <= 30:
                aging_buckets['1-30']['count'] += 1
                aging_buckets['1-30']['amount'] += balance
            elif days_overdue <= 60:
                aging_buckets['31-60']['count'] += 1
                aging_buckets['31-60']['amount'] += balance
            elif days_overdue <= 90:
                aging_buckets['61-90']['count'] += 1
                aging_buckets['61-90']['amount'] += balance
            else:
                aging_buckets['90+']['count'] += 1
                aging_buckets['90+']['amount'] += balance
    
    # Format for response
    data = []
    for bucket, values in aging_buckets.items():
        data.append({
            'bucket': bucket,
            'days': bucket,
            'count': values['count'],
            'amount': values['amount'],
            'formatted_amount': f"${values['amount']:,.2f}"
        })
    
    total_count = sum(b['count'] for b in data)
    total_amount = sum(b['amount'] for b in data)
    
    return Response({
        'aging_buckets': data,
        'summary': {
            'total_accounts': total_count,
            'total_amount': total_amount,
            'formatted_total': f"${total_amount:,.2f}"
        },
        'last_updated': timezone.now().isoformat()
    })


# ============================================================================
# WORKFLOW WIDGETS
# ============================================================================

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def pending_approvals_count(request):
    """
    GET /api/widgets/workflows/pending-approvals/
    Returns count of pending approvals for current user
    """
    from common.views import resolve_effective_branch
    owner = request.user
    branch = resolve_effective_branch(request)
    user = request.user
    
    # Count approvals pending for user's roles
    user_roles = user.roles.values_list('code', flat=True)
    
    count = WorkflowApproval.objects.filter(
        run__owner=owner,
        run__branch=branch,
        status='pending',
        required_roles__overlap=list(user_roles)
    ).count()
    
    return Response({
        'value': count,
        'label': 'Pending Approvals',
        'link': '/workflows/approvals',
        'last_updated': timezone.now().isoformat()
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def recent_workflow_runs(request):
    """
    GET /api/widgets/workflows/recent-runs/
    Returns recent workflow runs
    """
    from common.views import resolve_effective_branch
    owner = request.user
    branch = resolve_effective_branch(request)
    
    limit = int(request.GET.get('limit', 5))
    
    runs = WorkflowRun.objects.filter(
        owner=owner,
        branch=branch
    ).select_related('template').order_by('-created_at')[:limit]
    
    data = []
    for run in runs:
        data.append({
            'id': run.id,
            'run_reference': run.run_reference,
            'template': {
                'id': run.template.id,
                'name': run.template.name
            },
            'status': run.status,
            'created_at': run.created_at.isoformat(),
            'duration_ms': run.duration_ms,
            'url': f"/workflows/runs/{run.id}"
        })
    
    return Response({
        'runs': data,
        'count': len(data),
        'last_updated': timezone.now().isoformat()
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def failed_workflows_today(request):
    """
    GET /api/widgets/workflows/failed-today/
    Returns count of failed workflows today
    """
    from common.views import resolve_effective_branch
    owner = request.user
    branch = resolve_effective_branch(request)
    
    today = timezone.now().date()
    
    count = WorkflowRun.objects.filter(
        owner=owner,
        branch=branch,
        status='failed',
        created_at__date=today
    ).count()
    
    return Response({
        'value': count,
        'label': 'Failed Workflows Today',
        'severity': 'error' if count > 0 else 'success',
        'link': '/workflows/runs?status=failed',
        'last_updated': timezone.now().isoformat()
    })


# ============================================================================
# INVENTORY WIDGETS
# ============================================================================

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def low_stock_alerts(request):
    """
    GET /api/widgets/inventory/low-stock/
    Returns count of items below reorder point
    """
    from common.views import resolve_effective_branch
    owner = request.user
    branch = resolve_effective_branch(request)
    
    low_stock_items = InventoryItem.objects.filter(
        owner=owner,
        branch=branch,
        quantity_on_hand__lte=F('reorder_point'),
        is_active=True,
        is_deleted=False
    )
    
    count = low_stock_items.count()
    
    # Get details of top 5 critical items
    critical_items = low_stock_items.order_by('quantity_on_hand')[:5]
    
    items_data = []
    for item in critical_items:
        items_data.append({
            'id': item.id,
            'code': item.code,
            'name': item.name,
            'quantity_on_hand': item.quantity_on_hand,
            'reorder_point': item.reorder_point,
            'shortfall': item.reorder_point - item.quantity_on_hand
        })
    
    return Response({
        'value': count,
        'label': 'Low Stock Items',
        'severity': 'warning' if count > 0 else 'success',
        'items': items_data,
        'link': '/inventory/low-stock',
        'last_updated': timezone.now().isoformat()
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def total_stock_value(request):
    """
    GET /api/widgets/inventory/stock-value/
    Returns total value of inventory on hand
    """
    from common.views import resolve_effective_branch
    owner = request.user
    branch = resolve_effective_branch(request)
    
    items = InventoryItem.objects.filter(
        owner=owner,
        branch=branch,
        is_active=True,
        is_deleted=False
    )
    
    total_value = Decimal('0.00')
    for item in items:
        item_value = item.quantity_on_hand * item.cost_price
        total_value += item_value
    
    return Response({
        'value': total_value,
        'formatted': f"${total_value:,.2f}",
        'label': 'Total Stock Value',
        'currency': 'USD',
        'last_updated': timezone.now().isoformat()
    })


# ============================================================================
# ASSET WIDGETS
# ============================================================================

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def total_assets_count(request):
    """
    GET /api/widgets/assets/count/
    Returns total number of active fixed assets
    """
    from common.views import resolve_effective_branch
    owner = request.user
    branch = resolve_effective_branch(request)
    
    count = FixedAsset.objects.filter(
        owner=owner,
        branch=branch,
        status='ACTIVE',
        is_deleted=False
    ).count()
    
    return Response({
        'value': count,
        'label': 'Total Assets',
        'link': '/assets/register',
        'last_updated': timezone.now().isoformat()
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def total_asset_value(request):
    """
    GET /api/widgets/assets/value/
    Returns total value of fixed assets (net book value)
    """
    from common.views import resolve_effective_branch
    owner = request.user
    branch = resolve_effective_branch(request)
    
    assets = FixedAsset.objects.filter(
        owner=owner,
        branch=branch,
        is_deleted=False
    )
    
    total_cost = assets.aggregate(total=Sum('purchase_cost'))['total'] or Decimal('0.00')
    total_depreciation = assets.aggregate(total=Sum('accumulated_depreciation'))['total'] or Decimal('0.00')
    
    net_book_value = total_cost - total_depreciation
    
    return Response({
        'value': net_book_value,
        'formatted': f"${net_book_value:,.2f}",
        'label': 'Total Asset Value (NBV)',
        'breakdown': {
            'cost': total_cost,
            'depreciation': total_depreciation,
            'net_book_value': net_book_value
        },
        'currency': 'USD',
        'last_updated': timezone.now().isoformat()
    })


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def calculate_balance_trend(owner, branch, account_type, comparison_date):
    """
    Calculate trend percentage for account balances
    """
    current_balance = Account.objects.filter(
        owner=owner,
        branch=branch,
        account_type=account_type,
        is_deleted=False
    ).aggregate(total=Sum('balance'))['total'] or Decimal('0.00')
    
    # This is simplified - you'd need historical balance tracking
    # For now, return None
    return None


# ============================================================================
# URL CONFIGURATION
# ============================================================================

"""
Add to your urls.py:

from api.views import widget_endpoints

urlpatterns = [
    # Student widgets
    path('api/widgets/students/count/', 
         widget_endpoints.total_students_count,
         name='widget-students-count'),
    
    # Financial widgets
    path('api/widgets/finance/outstanding-fees/',
         widget_endpoints.outstanding_fees_total,
         name='widget-outstanding-fees'),
    path('api/widgets/finance/monthly-income/',
         widget_endpoints.monthly_income,
         name='widget-monthly-income'),
    path('api/widgets/finance/debtor-aging/',
         widget_endpoints.debtor_aging_summary,
         name='widget-debtor-aging'),
    
    # Workflow widgets
    path('api/widgets/workflows/pending-approvals/',
         widget_endpoints.pending_approvals_count,
         name='widget-pending-approvals'),
    path('api/widgets/workflows/recent-runs/',
         widget_endpoints.recent_workflow_runs,
         name='widget-recent-runs'),
    path('api/widgets/workflows/failed-today/',
         widget_endpoints.failed_workflows_today,
         name='widget-failed-workflows'),
    
    # Inventory widgets
    path('api/widgets/inventory/low-stock/',
         widget_endpoints.low_stock_alerts,
         name='widget-low-stock'),
    path('api/widgets/inventory/stock-value/',
         widget_endpoints.total_stock_value,
         name='widget-stock-value'),
    
    # Asset widgets
    path('api/widgets/assets/count/',
         widget_endpoints.total_assets_count,
         name='widget-assets-count'),
    path('api/widgets/assets/value/',
         widget_endpoints.total_asset_value,
         name='widget-assets-value'),
]
"""