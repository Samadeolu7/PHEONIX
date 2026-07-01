"""Budget ViewSets and API Endpoints"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Sum, Q, Count, F
from django.utils import timezone
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP

from common.views import ScopedModelViewSet
from .models import BudgetPeriod, BudgetLine
from .serializers import (
    BudgetPeriodSerializer,
    BudgetPeriodListSerializer,
    BudgetLineSerializer
)


class BudgetPeriodViewSet(ScopedModelViewSet):
    """
    ViewSet for managing budget periods
    
    list: Get all budget periods
    create: Create new budget period
    retrieve: Get specific budget period with all lines
    update: Update budget period
    destroy: Delete budget period
    
    Custom actions:
    - approve: Approve a budget period
    - variance_report: Get budget vs actual variance report
    """
    
    permission_module = 'budgets'
    permission_page = 'budget-periods'
    queryset = BudgetPeriod.objects.all()
    serializer_class = BudgetPeriodSerializer
    filterset_fields = ['status', 'start_date', 'end_date']
    search_fields = ['name', 'notes']
    ordering_fields = ['start_date', 'end_date', 'created_at']
    ordering = ['-start_date']
    
    def get_serializer_class(self):
        """Use lightweight serializer for list view"""
        if self.action == 'list':
            return BudgetPeriodListSerializer
        return BudgetPeriodSerializer
    
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """
        Approve a budget period
        
        POST /api/budgets/periods/{id}/approve/
        
        Changes status from 'draft' to 'approved' and records approver.
        """
        budget_period = self.get_object()
        
        if budget_period.status != 'draft':
            return Response({
                'success': False,
                'error': f'Cannot approve budget in {budget_period.status} status'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Check if budget has at least one line
        if not budget_period.budget_lines.exists():
            return Response({
                'success': False,
                'error': 'Cannot approve budget with no budget lines'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Approve budget
        budget_period.status = 'approved'
        budget_period.approved_by = request.user
        budget_period.approved_at = timezone.now()
        budget_period.save()
        
        serializer = self.get_serializer(budget_period)
        return Response({
            'success': True,
            'message': f'Budget period "{budget_period.name}" approved',
            'data': serializer.data
        })
    
    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        """
        Activate an approved budget period
        
        POST /api/budgets/periods/{id}/activate/
        """
        budget_period = self.get_object()
        
        if budget_period.status != 'approved':
            return Response({
                'success': False,
                'error': f'Cannot activate budget in {budget_period.status} status. Must be approved first.'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        budget_period.status = 'active'
        budget_period.save()
        
        serializer = self.get_serializer(budget_period)
        return Response({
            'success': True,
            'message': f'Budget period "{budget_period.name}" activated',
            'data': serializer.data
        })
    
    @action(detail=True, methods=['get'])
    def variance_report(self, request, pk=None):
        """
        Get Budget vs Actual variance report
        
        GET /api/budgets/periods/{id}/variance_report/
        
        Query Parameters:
            department_id (int): Filter by department
            account_type (str): Filter by account type (expense, revenue, etc.)
            threshold (decimal): Only show variances >= threshold percent (default: 0)
            group_by (str): 'department', 'account_type', or 'account' (default: 'account')
        
        Returns:
            {
              "success": true,
              "data": {
                "period": {...},
                "summary": {
                  "total_budget": "1000000.00",
                  "total_actual": "850000.00",
                  "total_variance": "150000.00",
                  "variance_percent": 15.0,
                  "utilization_percent": 85.0,
                  "line_count": 50,
                  "over_budget_count": 5,
                  "under_budget_count": 45
                },
                "by_department": [...],
                "by_account_type": [...],
                "lines": [...]
              }
            }
        """
        budget_period = self.get_object()
        
        # Get query parameters
        department_id = request.query_params.get('department_id')
        account_type = request.query_params.get('account_type')
        threshold = Decimal(str(request.query_params.get('threshold', 0)))
        group_by = request.query_params.get('group_by', 'account')
        
        # Get budget lines with filters
        lines = budget_period.budget_lines.select_related(
            'account', 'department'
        )
        
        if department_id:
            lines = lines.filter(department_id=department_id)
        
        if account_type:
            lines = lines.filter(account__type=account_type)
        
        # Calculate variance for each line
        lines_data = []
        total_budget = Decimal('0.00')
        total_actual = Decimal('0.00')
        over_budget_count = 0
        under_budget_count = 0
        
        for line in lines:
            variance_data = line.get_variance()
            
            # Apply threshold filter
            if abs(variance_data['variance_percent']) < threshold:
                continue
            
            total_budget += line.amount
            total_actual += variance_data['actual']
            
            if variance_data['status'] == 'over':
                over_budget_count += 1
            elif variance_data['status'] == 'under':
                under_budget_count += 1
            
            lines_data.append({
                'id': line.id,
                'account_code': line.account.code,
                'account_name': line.account.name,
                'account_type': line.account.type,
                'department': line.department.name if line.department else None,
                'budget': str(line.amount),
                'actual': str(variance_data['actual']),
                'variance': str(variance_data['variance']),
                'variance_percent': variance_data['variance_percent'],
                'utilization_percent': variance_data['utilization_percent'],
                'status': variance_data['status']
            })
        
        # Calculate summary
        total_variance = total_budget - total_actual
        variance_percent = (total_variance / total_budget * 100) if total_budget else 0
        utilization_percent = (total_actual / total_budget * 100) if total_budget else 0
        
        summary = {
            'total_budget': str(total_budget),
            'total_actual': str(total_actual),
            'total_variance': str(total_variance),
            'variance_percent': variance_percent,
            'utilization_percent': utilization_percent,
            'line_count': len(lines_data),
            'over_budget_count': over_budget_count,
            'under_budget_count': under_budget_count,
        }
        
        # Group by department if requested
        by_department = []
        if group_by == 'department' or request.query_params.get('include_department_summary'):
            dept_groups = {}
            for line_data in lines_data:
                dept = line_data['department'] or 'Unassigned'
                if dept not in dept_groups:
                    dept_groups[dept] = {
                        'department': dept,
                        'budget': Decimal('0.00'),
                        'actual': Decimal('0.00'),
                        'line_count': 0
                    }
                dept_groups[dept]['budget'] += Decimal(line_data['budget'])
                dept_groups[dept]['actual'] += Decimal(line_data['actual'])
                dept_groups[dept]['line_count'] += 1
            
            for dept, data in dept_groups.items():
                variance = data['budget'] - data['actual']
                by_department.append({
                    'department': dept,
                    'budget': str(data['budget']),
                    'actual': str(data['actual']),
                    'variance': str(variance),
                    'variance_percent': (variance / data['budget'] * 100) if data['budget'] else Decimal('0'),
                    'utilization_percent': (data['actual'] / data['budget'] * 100) if data['budget'] else Decimal('0'),
                    'line_count': data['line_count']
                })
        
        # Group by account type
        by_account_type = []
        type_groups = {}
        for line_data in lines_data:
            acc_type = line_data['account_type']
            if acc_type not in type_groups:
                type_groups[acc_type] = {
                    'account_type': acc_type,
                    'budget': Decimal('0.00'),
                    'actual': Decimal('0.00'),
                    'line_count': 0
                }
            type_groups[acc_type]['budget'] += Decimal(line_data['budget'])
            type_groups[acc_type]['actual'] += Decimal(line_data['actual'])
            type_groups[acc_type]['line_count'] += 1
        
        for acc_type, data in type_groups.items():
            variance = data['budget'] - data['actual']
            by_account_type.append({
                'account_type': acc_type,
                'budget': str(data['budget']),
                'actual': str(data['actual']),
                'variance': str(variance),
                'variance_percent': (variance / data['budget'] * 100) if data['budget'] else Decimal('0'),
                'utilization_percent': (data['actual'] / data['budget'] * 100) if data['budget'] else Decimal('0'),
                'line_count': data['line_count']
            })
        
        return Response({
            'success': True,
            'data': {
                'period': {
                    'id': budget_period.id,
                    'name': budget_period.name,
                    'start_date': budget_period.start_date,
                    'end_date': budget_period.end_date,
                    'status': budget_period.status
                },
                'summary': summary,
                'by_department': by_department,
                'by_account_type': by_account_type,
                'lines': sorted(lines_data, key=lambda x: abs(x['variance_percent']), reverse=True)
            }
        })


class BudgetLineViewSet(ScopedModelViewSet):
    """
    ViewSet for managing individual budget lines
    
    Typically accessed through BudgetPeriod, but can also be accessed directly.
    """
    
    permission_module = 'budgets'
    permission_page = 'budget-lines'
    queryset = BudgetLine.objects.all()
    serializer_class = BudgetLineSerializer
    filterset_fields = ['budget_period', 'account']
    search_fields = ['account__name', 'account__code', 'notes']
    ordering_fields = ['amount', 'account__code', 'created_at']
    ordering = ['account__code']
