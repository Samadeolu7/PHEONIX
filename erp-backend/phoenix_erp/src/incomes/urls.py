# incomes/urls.py
"""
URL patterns for income management
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    IncomeCategoryViewSet, ServiceItemViewSet, IncomeViewSet, FeeStructureViewSet,
    InvoiceViewSet, FeeEntitlementViewSet, PaymentPlanViewSet,
    PaymentPlanInstallmentViewSet,
    AcademicYearViewSet, AcademicTermViewSet,
    PaymentReversalRequestListView,
)
from .views_setup import FeeStructureSetupView, AccountingConfigSetupView
from .viewsets_discount import (
    DiscountProgramViewSet, DiscountApplicationViewSet, AppliedDiscountViewSet
)
from .views_reports import (
    IncomeByCategoryView,
    IncomeByServiceItemView,
    IncomeByPeriodView,
    IncomeByClientView,
    IncomeCollectionStatusView,
)

app_name = 'incomes'

router = DefaultRouter()
router.register(r'categories', IncomeCategoryViewSet, basename='income-category')
router.register(r'service-items', ServiceItemViewSet, basename='service-item')
router.register(r'incomes', IncomeViewSet, basename='income')
router.register(r'fee-structures', FeeStructureViewSet, basename='fee-structure')
router.register(r'invoices', InvoiceViewSet, basename='invoice')
router.register(r'entitlements', FeeEntitlementViewSet, basename='entitlement')
router.register(r'payment-plans', PaymentPlanViewSet, basename='payment-plan')
router.register(r'installments', PaymentPlanInstallmentViewSet, basename='installment')
router.register(r'academic-years', AcademicYearViewSet, basename='academic-year')
router.register(r'academic-terms', AcademicTermViewSet, basename='academic-term')

# Discount/Scholarship endpoints
router.register(r'discount-programs', DiscountProgramViewSet, basename='discount-program')
router.register(r'discount-applications', DiscountApplicationViewSet, basename='discount-application')
router.register(r'applied-discounts', AppliedDiscountViewSet, basename='applied-discount')

urlpatterns = [
    # Unified setup endpoints (like UnifiedAccountCreationPage)
    path('setup/fee-structure/', FeeStructureSetupView.as_view(), name='setup-fee-structure'),
    path('setup/accounting-config/', AccountingConfigSetupView.as_view(), name='setup-accounting-config'),

    # Payment reversal requests list (used by Approvals page)
    path(
        'payment-reversal-requests/',
        PaymentReversalRequestListView.as_view(),
        name='payment-reversal-requests-list',
    ),

    # Income report endpoints
    path('reports/by-category/',         IncomeByCategoryView.as_view(),       name='income-report-by-category'),
    path('reports/by-service-item/',     IncomeByServiceItemView.as_view(),    name='income-report-by-service-item'),
    path('reports/by-period/',           IncomeByPeriodView.as_view(),         name='income-report-by-period'),
    path('reports/by-client/',           IncomeByClientView.as_view(),         name='income-report-by-client'),
    path('reports/collection-status/',   IncomeCollectionStatusView.as_view(), name='income-report-collection-status'),

    # Standard CRUD endpoints
    path('', include(router.urls)),
]
