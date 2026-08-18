"""
Expense API Views

Comprehensive REST API endpoints for expense management including:
- CRUD operations for expenses and categories
- Approval workflow
- Accounting integration
- Reporting and analytics
"""

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.pagination import PageNumberPagination
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters
from django.db.models import Q, Sum, Count
from django.utils import timezone
from django.core.exceptions import ValidationError
from decimal import Decimal, ROUND_HALF_UP

from expenses.models import Expense, ExpenseCategory, PrepaidExpense
from expenses.serializers import (
    ExpenseSerializer,
    ExpenseReadSerializer,
    ExpenseCategorySerializer,
    ExpenseApproveSerializer,
    ExpenseRejectSerializer,
    ExpensePostSerializer,
    PrepaidExpenseSerializer
)
from expenses.services.expense_accounting import (
    ExpenseAccountingService,
    PrepaidExpenseAccountingService
)
from common.views import ScopedModelViewSet, resolve_effective_branch


class ExpenseCategoryViewSet(ScopedModelViewSet):
    """
    ViewSet for expense category management
    
    Endpoints:
    - GET /expense-categories/ - List all categories
    - POST /expense-categories/ - Create new category
    - GET /expense-categories/{id}/ - Get category details
    - PATCH /expense-categories/{id}/ - Update category
    - DELETE /expense-categories/{id}/ - Soft delete category
    """
    
    permission_module = 'expenses'
    permission_page = 'expense-categories'
    queryset = ExpenseCategory.objects.all()
    serializer_class = ExpenseCategorySerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['requires_approval', 'product']
    search_fields = ['name', 'code', 'description']
    ordering_fields = ['name', 'code', 'created_at']
    ordering = ['name']

    @action(detail=True, methods=['get'])
    def budget_status(self, request, pk=None):
        """Get budget utilization status for this category"""
        category = self.get_object()
        if not category.budget_amount:
            return Response({
                'category': category.name,
                'budget_amount': None,
                'message': 'No budget set for this category'
            })

        from django.utils import timezone
        from django.db.models import Sum
        now = timezone.now()

        # Calculate date range based on budget_period
        if category.budget_period == 'monthly':
            period_start = now.replace(day=1).date()
        elif category.budget_period == 'quarterly':
            quarter_month = ((now.month - 1) // 3) * 3 + 1
            period_start = now.replace(month=quarter_month, day=1).date()
        else:  # yearly
            period_start = now.replace(month=1, day=1).date()

        spent_filters = dict(
            category=category,
            date__gte=period_start,
            status__in=['approved', 'posted'],
        )
        branch = resolve_effective_branch(request)
        if branch:
            spent_filters['branch'] = branch
        total_spent = Expense.objects.filter(**spent_filters).aggregate(total=Sum('amount'))['total'] or 0

        from decimal import Decimal
        budget = Decimal(str(category.budget_amount))
        spent = Decimal(str(total_spent))
        remaining = budget - spent
        utilization = (spent / budget * 100) if budget > 0 else 0

        return Response({
            'category': category.name,
            'budget_amount': str(budget),
            'budget_period': category.budget_period,
            'period_start': str(period_start),
            'total_spent': str(spent),
            'remaining': str(remaining),
            'utilization_percent': utilization.quantize(Decimal('0.1'), rounding=ROUND_HALF_UP),
            'is_over_budget': spent > budget,
        })


class ExpenseViewSet(ScopedModelViewSet):
    """
    ViewSet for expense management
    
    Endpoints:
    - GET /expenses/ - List all expenses
    - POST /expenses/ - Create new expense
    - GET /expenses/{id}/ - Get expense details
    - PATCH /expenses/{id}/ - Update expense
    - DELETE /expenses/{id}/ - Soft delete expense
    - POST /expenses/{id}/approve/ - Approve expense
    - POST /expenses/{id}/reject/ - Reject expense
    - POST /expenses/{id}/submit/ - Submit expense for approval
    - POST /expenses/{id}/post/ - Post expense to accounting
    - GET /expenses/summary/ - Get expense statistics
    - GET /expenses/pending_approval/ - Get expenses pending approval
    """
    
    permission_module = 'expenses'
    permission_page = 'expenses'
    queryset = Expense.objects.all()
    permission_classes = [IsAuthenticated]
    pagination_class = PageNumberPagination
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = [
        'status', 'category', 'expense_type', 'payment_method',
        'approved', 'requires_approval', 'is_posted', 'payee_type'
    ]
    search_fields = [
        'reference_number', 'description', 'payee_name',
        'payment_reference', 'origin_reference', 'parent_reference'
    ]
    ordering_fields = ['expense_date', 'created_at', 'total_amount']
    ordering = ['-expense_date']
    
    def get_serializer_class(self):
        """Return appropriate serializer based on action"""
        if self.action == 'retrieve' or self.action == 'list':
            return ExpenseReadSerializer
        elif self.action == 'approve':
            return ExpenseApproveSerializer
        elif self.action == 'reject':
            return ExpenseRejectSerializer
        elif self.action == 'post':
            return ExpensePostSerializer
        return ExpenseSerializer
    
    def get_queryset(self):
        """Get expenses with optional filters"""
        queryset = super().get_queryset()
        queryset = queryset.select_related(
            'category',
            'approved_by',
            'created_by',
            'branch'
        )
        
        # Filter by date range
        start_date = self.request.query_params.get('start_date')
        end_date = self.request.query_params.get('end_date')
        
        if start_date:
            queryset = queryset.filter(expense_date__gte=start_date)
        if end_date:
            queryset = queryset.filter(expense_date__lte=end_date)
        
        # Filter by amount range
        min_amount = self.request.query_params.get('min_amount')
        max_amount = self.request.query_params.get('max_amount')
        
        if min_amount:
            queryset = queryset.filter(total_amount__gte=Decimal(min_amount))
        if max_amount:
            queryset = queryset.filter(total_amount__lte=Decimal(max_amount))
        
        return queryset
    
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """
        Approve an expense
        
        POST /expenses/{id}/approve/
        Body: {"notes": "Approved for payment"}
        """
        expense = self.get_object()
        serializer = self.get_serializer(
            data=request.data,
            context={'expense': expense, 'request': request}
        )
        serializer.is_valid(raise_exception=True)
        
        # Approve expense
        expense.approved = True
        expense.approved_by = request.user
        expense.approved_at = timezone.now()
        expense.status = 'approved'
        
        # Update approval chain
        if not expense.approval_chain:
            expense.approval_chain = []
        expense.approval_chain.append({
            'approver_id': request.user.id,
            'approver_name': request.user.get_full_name(),
            'action': 'approved',
            'timestamp': timezone.now().isoformat(),
            'notes': serializer.validated_data.get('notes', '')
        })
        
        expense.save()
        
        return Response({
            'status': 'approved',
            'approved_by': request.user.get_full_name(),
            'approved_at': expense.approved_at,
            'message': 'Expense approved successfully'
        }, status=status.HTTP_200_OK)
    
    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """
        Reject an expense
        
        POST /expenses/{id}/reject/
        Body: {"reason": "Missing receipt"}
        """
        expense = self.get_object()
        serializer = self.get_serializer(
            data=request.data,
            context={'expense': expense, 'request': request}
        )
        serializer.is_valid(raise_exception=True)
        
        # Reject expense
        expense.status = 'rejected'
        
        # Update approval chain
        if not expense.approval_chain:
            expense.approval_chain = []
        expense.approval_chain.append({
            'approver_id': request.user.id,
            'approver_name': request.user.get_full_name(),
            'action': 'rejected',
            'timestamp': timezone.now().isoformat(),
            'reason': serializer.validated_data['reason']
        })
        
        # Store rejection reason in metadata
        if not expense.metadata:
            expense.metadata = {}
        expense.metadata['rejection_reason'] = serializer.validated_data['reason']
        expense.metadata['rejected_by'] = request.user.get_full_name()
        expense.metadata['rejected_at'] = timezone.now().isoformat()
        
        expense.save()
        
        return Response({
            'status': 'rejected',
            'rejected_by': request.user.get_full_name(),
            'reason': serializer.validated_data['reason'],
            'message': 'Expense rejected'
        }, status=status.HTTP_200_OK)
    
    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        """
        Submit expense for approval
        
        POST /expenses/{id}/submit/
        """
        expense = self.get_object()
        
        if expense.status != 'draft':
            return Response(
                {'error': f'Cannot submit expense with status {expense.status}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        expense.status = 'submitted'
        expense.save()
        
        return Response({
            'status': 'submitted',
            'message': 'Expense submitted for approval'
        }, status=status.HTTP_200_OK)
    
    @action(detail=True, methods=['post'])
    def post(self, request, pk=None):
        """
        Post expense to accounting
        
        POST /expenses/{id}/post/
        Body: {"notes": "Posted to GL"}
        """
        expense = self.get_object()
        serializer = self.get_serializer(
            data=request.data,
            context={'expense': expense, 'request': request}
        )
        serializer.is_valid(raise_exception=True)
        
        try:
            # Use accounting service to post
            service = ExpenseAccountingService(expense)
            journal_entry = service.post_expense(
                posted_by=request.user,
                notes=serializer.validated_data.get('notes')
            )
            
            return Response({
                'status': 'posted',
                'journal_entry_id': journal_entry.id,
                'reference_number': journal_entry.reference_number,
                'posted_at': expense.posted_at,
                'message': 'Expense posted to accounting successfully'
            }, status=status.HTTP_200_OK)
            
        except ValidationError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=False, methods=['get'])
    def summary(self, request):
        """
        Get expense summary statistics
        
        GET /expenses/summary/
        Query params:
        - start_date: Filter from date
        - end_date: Filter to date
        """
        branch = resolve_effective_branch(request)
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        
        summary = ExpenseAccountingService.get_expense_summary(
            branch=branch,
            start_date=start_date,
            end_date=end_date
        )
        
        return Response(summary, status=status.HTTP_200_OK)
    
    @action(detail=False, methods=['get'])
    def pending_approval(self, request):
        """
        Get expenses pending approval
        
        GET /expenses/pending_approval/
        """
        queryset = self.get_queryset().filter(
            requires_approval=True,
            approved=False,
            status='submitted'
        ).order_by('-expense_date')
        
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)


class PrepaidExpenseViewSet(ScopedModelViewSet):
    """
    ViewSet for prepaid expense management
    
    Endpoints:
    - GET /prepaid-expenses/ - List all prepaid expenses
    - POST /prepaid-expenses/ - Create new prepaid expense
    - GET /prepaid-expenses/{id}/ - Get details
    - PATCH /prepaid-expenses/{id}/ - Update
    - DELETE /prepaid-expenses/{id}/ - Delete
    - POST /prepaid-expenses/{id}/amortize/ - Record amortization
    - POST /prepaid-expenses/{id}/post_to_accounts/ - Create GL entry + AP payable for supplier
    """
    
    permission_module = 'expenses'
    permission_page = 'prepaid-vouchers'
    queryset = PrepaidExpense.objects.all()
    serializer_class = PrepaidExpenseSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['category', 'status']
    search_fields = ['reference_number', 'description']
    ordering_fields = ['purchase_date', 'created_at', 'total_amount']
    ordering = ['-purchase_date']
    
    @action(detail=True, methods=['post'])
    def amortize(self, request, pk=None):
        """
        Record amortization for a period
        
        POST /prepaid-expenses/{id}/amortize/
        Body: {
            "amount": "100.00",
            "period_end_date": "2026-01-31",
            "notes": "Monthly amortization"
        }
        """
        prepaid_expense = self.get_object()
        
        amount = request.data.get('amount')
        period_end_date = request.data.get('period_end_date')
        notes = request.data.get('notes', '')
        
        if not amount or not period_end_date:
            return Response(
                {'error': 'amount and period_end_date are required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            amount = Decimal(amount)
            
            # Use accounting service
            service = PrepaidExpenseAccountingService(prepaid_expense)
            journal_entry = service.amortize_period(
                amount=amount,
                period_end_date=period_end_date,
                notes=notes,
                posted_by=request.user,
            )
            
            return Response({
                'status': 'amortized',
                'journal_entry_id': journal_entry.id,
                'amount_amortized': amount,
                'remaining_amount': prepaid_expense.remaining_amount,
                'is_fully_consumed': prepaid_expense.status == 'fully_consumed',
                'message': 'Amortization recorded successfully'
            }, status=status.HTTP_200_OK)
            
        except (ValueError, ValidationError) as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=True, methods=['post'])
    def post_to_accounts(self, request, pk=None):
        """
        Create the initial GL entry for a prepaid expense.

        Two paths:
        1. Supplier-backed: Dr Prepaid / Cr Accounts Payable
           — no extra body fields needed; supplier must already be set.
        2. Cash payment (no supplier): Dr Prepaid / Cr Cash/Bank
           — requires ``payment_account_id`` in the request body pointing
             to the GL account that was credited (cash or bank account).

        POST /prepaid-expenses/{id}/post_to_accounts/
        Body (cash-paid only): { "payment_account_id": 12 }

        Response:
        {
            "success": true,
            "journal_entry_id": 42,
            "amount": "5000.00"
        }
        """
        prepaid_expense = self.get_object()

        if prepaid_expense.is_posted:
            return Response(
                {'error': 'Prepaid expense is already posted to accounting'},
                status=status.HTTP_400_BAD_REQUEST
            )

        service = PrepaidExpenseAccountingService(prepaid_expense)

        try:
            if prepaid_expense.supplier_id:
                # Path 1: supplier-backed — Dr Prepaid / Cr AP
                journal_entry, ap_record = service.create_supplier_payable(posted_by=request.user)
                return Response({
                    'success': True,
                    'message': 'Posted to accounts — AP payable created',
                    'journal_entry_id': journal_entry.id,
                    'accounts_payable_id': ap_record.id,
                    'amount': str(prepaid_expense.total_amount),
                    'supplier': prepaid_expense.supplier.name,
                }, status=status.HTTP_200_OK)

            else:
                # Path 2: cash/bank payment — Dr Prepaid / Cr payment account
                payment_account_id = request.data.get('payment_account_id')
                if not payment_account_id:
                    return Response(
                        {
                            'error': (
                                'This prepaid expense has no supplier. '
                                'Provide payment_account_id (GL account ID) to record '
                                'the cash/bank payment.'
                            )
                        },
                        status=status.HTTP_400_BAD_REQUEST
                    )

                from accounts.models import Account
                try:
                    payment_account = Account.objects.get(
                        id=payment_account_id,
                        branch=request.user.branch
                    )
                except Account.DoesNotExist:
                    return Response(
                        {'error': f'GL account {payment_account_id} not found'},
                        status=status.HTTP_400_BAD_REQUEST
                    )

                journal_entry = service.record_initial_payment(
                    paid_by=request.user,
                    payment_account=payment_account,
                )
                return Response({
                    'success': True,
                    'message': 'Posted to accounts — cash/bank payment recorded',
                    'journal_entry_id': journal_entry.id,
                    'amount': str(prepaid_expense.total_amount),
                }, status=status.HTTP_200_OK)

        except (ValueError, ValidationError) as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )