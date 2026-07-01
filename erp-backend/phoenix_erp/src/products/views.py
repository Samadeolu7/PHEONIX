"""
Product Views
REST API endpoints for product management
"""
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Count, Q

from .models import Product
from .serializers import ProductSerializer, ProductListSerializer, ProductSummarySerializer
from common.serializers import IsTenantUser
from common.views import ScopedModelViewSet


class ProductViewSet(ScopedModelViewSet):
    """
    ViewSet for Product CRUD operations
    
    Provides:
    - list: Get all products (filtered by branch access)
    - retrieve: Get single product details
    - create: Create new product (admin only)
    - update/partial_update: Update product (admin only)
    - destroy: Soft delete product (admin only)
    - summary: Get lightweight product list for dropdowns
    - activate/deactivate: Toggle product status
    """
    permission_module = 'products'
    permission_page = 'products'
    queryset = Product.objects.select_related('branch', 'owner', 'created_by')
    serializer_class = ProductSerializer
    permission_classes = [IsAuthenticated, IsTenantUser]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    
    # Filtering
    filterset_fields = {
        'product_class': ['exact', 'in'],
        'product_type': ['exact', 'in'],
        'is_active': ['exact'],
        'branch': ['exact'],
        'branch__id': ['exact', 'in'],
        'interest_rate': ['gte', 'lte'],
        'minimum_amount': ['gte', 'lte'],
    }
    
    # Search
    search_fields = ['name', 'code', 'description']
    
    # Ordering
    ordering_fields = ['name', 'code', 'created_at', 'product_type', 'interest_rate']
    ordering = ['product_type', 'name']
    
    def get_queryset(self):
        """
        Filter products based on user's branch access.
        Branch/tenant scoping is handled by ScopedModelViewSet.get_queryset().
        We only add the account-count annotation on top.
        """
        queryset = super().get_queryset()

        # Annotate with active savings account count for this product
        queryset = queryset.annotate(
            total_accounts=Count('savings_accounts', filter=Q(savings_accounts__status='active'))
        )

        return queryset
    
    def get_serializer_class(self):
        """
        Use different serializers for different actions
        """
        if self.action == 'list':
            return ProductListSerializer
        elif self.action == 'summary':
            return ProductSummarySerializer
        return ProductSerializer
    
    def perform_create(self, serializer):
        """
        Set owner and created_by when creating product
        """
        serializer.save(
            owner=self.request.user,
            created_by=self.request.user
        )
    
    @action(detail=False, methods=['get'])
    def summary(self, request):
        """
        Get lightweight product list for dropdowns
        
        Query params:
        - branch: Filter by branch ID
        - product_type: Filter by type (SAVINGS, LOAN, EXPENSE)
        - is_active: Filter by active status (default: True)
        """
        queryset = self.get_queryset()
        
        # Apply filters from query params
        branch_id = request.query_params.get('branch')
        product_type = request.query_params.get('product_type')
        is_active = request.query_params.get('is_active', 'true').lower() == 'true'
        
        if branch_id:
            queryset = queryset.filter(branch_id=branch_id)
        if product_type:
            queryset = queryset.filter(product_type=product_type)
        
        queryset = queryset.filter(is_active=is_active)
        
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        """
        Activate a product
        Also activates associated scheduled workflows
        """
        product = self.get_object()
        
        if product.is_active:
            return Response(
                {'detail': 'Product is already active'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        product.is_active = True
        product.save()
        
        # Activate associated workflows
        from automations.models import WorkflowTemplate
        WorkflowTemplate.objects.filter(
            category=f"product_{product.code.lower()}"
        ).update(is_active=True)
        
        return Response({
            'detail': f'Product {product.name} activated successfully',
            'is_active': True
        })
    
    @action(detail=True, methods=['post'])
    def deactivate(self, request, pk=None):
        """
        Deactivate a product
        Also deactivates associated scheduled workflows
        """
        product = self.get_object()
        
        if not product.is_active:
            return Response(
                {'detail': 'Product is already inactive'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Check if any accounts are using this product
        active_accounts = product.accounts.filter(is_active=True).count()
        if active_accounts > 0:
            return Response(
                {
                    'detail': f'Cannot deactivate product with {active_accounts} active accounts',
                    'active_accounts': active_accounts
                },
                status=status.HTTP_400_BAD_REQUEST
            )
        
        product.is_active = False
        product.save()
        
        # Deactivate associated workflows
        from automations.models import WorkflowTemplate
        WorkflowTemplate.objects.filter(
            category=f"product_{product.code.lower()}"
        ).update(is_active=False)
        
        return Response({
            'detail': f'Product {product.name} deactivated successfully',
            'is_active': False
        })
    
    @action(detail=True, methods=['get'])
    def accounts(self, request, pk=None):
        """
        Get all accounts using this product
        """
        product = self.get_object()
        accounts = product.accounts.filter(is_active=True).select_related(
            'branch', 'owner', 'liability_account'
        )
        
        # Simple account data
        account_data = [{
            'id': acc.id,
            'name': acc.name,
            'account_number': acc.account_number,
            'balance': acc.balance if acc.balance else 0,
            'created_at': acc.created_at
        } for acc in accounts]
        
        return Response({
            'product': product.name,
            'account_count': len(account_data),
            'accounts': account_data
        })
    
    @action(detail=True, methods=['get'])
    def workflows(self, request, pk=None):
        """
        Get scheduled workflows associated with this product
        """
        product = self.get_object()
        
        from automations.models import WorkflowTemplate
        workflows = WorkflowTemplate.objects.filter(
            category=f"product_{product.code.lower()}"
        ).values(
            'id', 'name', 'description', 'trigger_type',
            'trigger_config', 'is_active', 'workflow_type'
        )
        
        return Response({
            'product': product.name,
            'workflow_count': workflows.count(),
            'workflows': list(workflows)
        })
