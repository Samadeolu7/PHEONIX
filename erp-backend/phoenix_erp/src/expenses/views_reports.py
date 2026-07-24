# expenses/views_reports.py
"""
Fuel & Resource Consumption Report API

Provides analytical endpoints for resource/fuel consumption data:
  - fuel_consumption_report : per-vehicle/beneficiary fuel summary with efficiency & discrepancy flags
"""
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from django.db.models import Sum, Count, Avg, Max, Min, Q, F
from django.utils import timezone
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP

from common.views import resolve_effective_branch

from .models import ResourceConsumption, Resource


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


def _base_consumption_qs(request, resource_type='fuel'):
    """
    Non-cancelled consumptions scoped to the requesting user's branch, or to
    the branch-switcher's X-Branch-ID override for elevated users (falling
    through to tenant-wide when they haven't picked one — "All Branches" mode).
    """
    qs = ResourceConsumption.objects.filter(
        resource__resource_type=resource_type,
    ).exclude(status='cancelled')
    branch = resolve_effective_branch(request)
    if branch:
        qs = qs.filter(branch=branch)
    elif hasattr(request.user, 'tenant') and request.user.tenant:
        qs = qs.filter(tenant=request.user.tenant)
    return qs


def _fmt(value):
    if value is None:
        return Decimal('0')
    return Decimal(str(value)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


# ---------------------------------------------------------------------------
# Fuel Consumption Report
# ---------------------------------------------------------------------------

class FuelConsumptionReportView(APIView):
    """
    GET /api/expenses/reports/fuel-consumption/

    Comprehensive fuel consumption report grouped by beneficiary (vehicle/employee/dept).
    Shows liters consumed, km driven, efficiency (km/L), cost, and discrepancy flags.

    Query params:
      date_from      (YYYY-MM-DD, default: 30 days ago)
      date_to        (YYYY-MM-DD, default: today)
      resource_type  (fuel | electricity | water | …, default: fuel)
      beneficiary_type (asset | employee | department | all, default: all)
      include_draft  (true | false, default: false — only posted/approved records)
      resource_id    (int — filter to a specific resource like FUEL-DIESEL only)
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        today = date.today()
        date_from = _parse_date(
            request.query_params.get('date_from'),
            today - timedelta(days=30),
        )
        date_to = _parse_date(
            request.query_params.get('date_to'),
            today,
        )
        resource_type = request.query_params.get('resource_type', 'fuel')
        beneficiary_type_filter = request.query_params.get('beneficiary_type', 'all')
        include_draft = request.query_params.get('include_draft', 'false').lower() == 'true'
        resource_id = request.query_params.get('resource_id')

        # Base queryset
        qs = _base_consumption_qs(request, resource_type=resource_type).filter(
            consumption_date__range=(date_from, date_to),
        )

        if not include_draft:
            qs = qs.filter(status__in=['approved', 'posted'])

        if beneficiary_type_filter and beneficiary_type_filter != 'all':
            qs = qs.filter(beneficiary_type=beneficiary_type_filter)

        if resource_id:
            qs = qs.filter(resource_id=resource_id)

        # ── Summary totals ─────────────────────────────────────────────────
        totals = qs.aggregate(
            total_quantity=Sum('quantity_consumed'),
            total_cost=Sum('total_cost'),
            total_km=Sum('usage_since_last'),
            total_records=Count('id'),
            irregular_count=Count('id', filter=Q(is_irregular=True)),
        )

        total_qty = _fmt(totals['total_quantity'])
        total_cost = _fmt(totals['total_cost'])
        total_km = _fmt(totals['total_km'])
        avg_efficiency = round(total_km / total_qty, 2) if total_qty > 0 else None

        # ── Per-beneficiary breakdown ───────────────────────────────────────
        by_beneficiary = (
            qs
            .values(
                'beneficiary_type',
                'beneficiary_name',
                'asset__id',
                'asset__asset_number',
                'asset__name',
                'asset__registration_number',
                'asset__make',
                'asset__model',
                'employee__id',
                'employee__first_name',
                'employee__last_name',
                'employee__staff_id',
                'employee__department',
                'resource__id',
                'resource__resource_code',
                'resource__name',
                'resource__unit_of_measure',
            )
            .annotate(
                total_quantity=Sum('quantity_consumed'),
                total_cost=Sum('total_cost'),
                total_km=Sum('usage_since_last'),
                fill_count=Count('id'),
                irregular_count=Count('id', filter=Q(is_irregular=True)),
                last_date=Max('consumption_date'),
                last_reading=Max('current_reading'),
            )
            .order_by('-total_cost')
        )

        rows = []
        for item in by_beneficiary:
            qty = _fmt(item['total_quantity'])
            cost = _fmt(item['total_cost'])
            km = _fmt(item['total_km'])
            efficiency = round(km / qty, 2) if qty > 0 and km > 0 else None

            # Determine display name
            if item['asset__id']:
                display_name = (
                    item['asset__name']
                    or item['beneficiary_name']
                )
                vehicle_info = {
                    'id': item['asset__id'],
                    'asset_number': item['asset__asset_number'],
                    'registration_number': item['asset__registration_number'] or '',
                    'make': item['asset__make'] or '',
                    'model': item['asset__model'] or '',
                }
            elif item['employee__id']:
                display_name = (
                    f"{item['employee__first_name']} {item['employee__last_name']}".strip()
                    or item['beneficiary_name']
                )
                vehicle_info = None
            else:
                display_name = item['beneficiary_name']
                vehicle_info = None

            # Get resource-level efficiency thresholds for discrepancy context
            resource_min_efficiency = None
            resource_max_efficiency = None
            try:
                resource_obj = Resource.objects.get(id=item['resource__id'])
                resource_min_efficiency = _fmt(resource_obj.min_efficiency) if resource_obj.min_efficiency else None
                resource_max_efficiency = _fmt(resource_obj.max_efficiency) if resource_obj.max_efficiency else None
            except Resource.DoesNotExist:
                pass

            # Compute efficiency status
            efficiency_status = 'ok'
            efficiency_note = None
            if efficiency is not None:
                if resource_min_efficiency and efficiency < resource_min_efficiency:
                    efficiency_status = 'low'
                    efficiency_note = f'Below minimum ({resource_min_efficiency} {item["resource__unit_of_measure"]}/km)'
                elif resource_max_efficiency and efficiency > resource_max_efficiency:
                    efficiency_status = 'high'
                    efficiency_note = f'Above maximum ({resource_max_efficiency} {item["resource__unit_of_measure"]}/km)'
            elif km == 0 and qty > 0:
                efficiency_status = 'no_km'
                efficiency_note = 'No distance recorded — efficiency not calculable'

            rows.append({
                'beneficiary_type': item['beneficiary_type'],
                'display_name': display_name,
                'vehicle': vehicle_info,
                'employee_info': {
                    'id': item['employee__id'],
                    'staff_id': item['employee__staff_id'] or '',
                    'department': item['employee__department'] or '',
                } if item['employee__id'] else None,
                'resource': {
                    'id': item['resource__id'],
                    'code': item['resource__resource_code'],
                    'name': item['resource__name'],
                    'unit': item['resource__unit_of_measure'],
                },
                'total_quantity': qty,
                'total_cost': cost,
                'total_km': km,
                'efficiency': efficiency,
                'efficiency_status': efficiency_status,
                'efficiency_note': efficiency_note,
                'fill_count': item['fill_count'],
                'irregular_count': item['irregular_count'],
                'has_irregularities': item['irregular_count'] > 0,
                'last_consumption_date': item['last_date'],
                'last_odometer_reading': _fmt(item['last_reading']) if item['last_reading'] else None,
            })

        # ── Per-resource summary (total by fuel type) ───────────────────────
        by_resource = (
            qs
            .values('resource__resource_code', 'resource__name', 'resource__unit_of_measure')
            .annotate(
                total_quantity=Sum('quantity_consumed'),
                total_cost=Sum('total_cost'),
                total_km=Sum('usage_since_last'),
                records=Count('id'),
            )
            .order_by('-total_cost')
        )
        resource_summary = []
        for r in by_resource:
            qty = _fmt(r['total_quantity'])
            km = _fmt(r['total_km'])
            resource_summary.append({
                'resource_code': r['resource__resource_code'],
                'resource_name': r['resource__name'],
                'unit': r['resource__unit_of_measure'],
                'total_quantity': qty,
                'total_cost': _fmt(r['total_cost']),
                'total_km': km,
                'avg_efficiency': round(km / qty, 2) if qty > 0 and km > 0 else None,
                'records': r['records'],
            })

        # ── Recent irregularities ───────────────────────────────────────────
        irregular_qs = qs.filter(is_irregular=True).select_related(
            'resource', 'asset', 'employee'
        ).order_by('-consumption_date')[:20]

        irregularities = []
        for c in irregular_qs:
            if c.asset_id:
                beneficiary = c.asset.name if c.asset else c.beneficiary_name
            elif c.employee_id:
                emp = c.employee
                beneficiary = f"{emp.first_name} {emp.last_name}".strip() if emp else c.beneficiary_name
            else:
                beneficiary = c.beneficiary_name

            irregularities.append({
                'id': c.id,
                'consumption_number': c.consumption_number,
                'consumption_date': c.consumption_date,
                'beneficiary': beneficiary,
                'resource_name': c.resource.name,
                'quantity_consumed': _fmt(c.quantity_consumed),
                'total_cost': _fmt(c.total_cost),
                'irregularity_type': c.irregularity_type,
                'variance_percentage': _fmt(c.variance_percentage),
                'irregularity_notes': c.irregularity_notes,
                'status': c.status,
            })

        return Response({
            'period': {
                'date_from': date_from,
                'date_to': date_to,
            },
            'resource_type': resource_type,
            'summary': {
                'total_quantity': total_qty,
                'total_cost': total_cost,
                'total_km': total_km,
                'avg_efficiency': avg_efficiency,
                'total_records': totals['total_records'] or 0,
                'irregular_count': totals['irregular_count'] or 0,
                'beneficiary_count': len(rows),
            },
            'by_beneficiary': rows,
            'by_resource': resource_summary,
            'irregularities': irregularities,
        })
