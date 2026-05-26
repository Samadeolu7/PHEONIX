"""
URL Configuration for Expenses App API
"""
from rest_framework.routers import DefaultRouter
from django.urls import path, include

from .views_comprehensive import (
    ExpenseViewSet,
    ExpenseCategoryViewSet,
    PrepaidExpenseViewSet
)
from .views import (
    ResourceConsumptionViewSet,
    ResourceViewSet,
    PrepaidVoucherViewSet
)
from .views_reports import FuelConsumptionReportView

# Create a router and register viewsets
router = DefaultRouter()
router.register(r'categories', ExpenseCategoryViewSet, basename='expense-category')
router.register(r'prepaid', PrepaidExpenseViewSet, basename='prepaid-expense')
router.register(r'resources', ResourceViewSet, basename='resource')
router.register(r'vouchers', PrepaidVoucherViewSet, basename='prepaid-voucher')
router.register(r'resource-consumptions', ResourceConsumptionViewSet, basename='resourceconsumption')
router.register(r'', ExpenseViewSet, basename='expense')  # Register at root so /api/expenses/ works

# Define URL patterns
urlpatterns = [
    path('reports/fuel-consumption/', FuelConsumptionReportView.as_view(), name='fuel-consumption-report'),
    path('', include(router.urls)),
]
