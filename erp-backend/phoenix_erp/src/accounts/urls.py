from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    AccountViewSet, AccountCategoryViewSet,
    PeriodViewSet, BalanceSheetSnapshotViewSet
)
from .views_ledger import AccountLedgerViewSet

router = DefaultRouter()
# Register sub-resources first, then the main resource
# This prevents the empty-string route from catching everything
router.register(r'categories', AccountCategoryViewSet, basename='accountcategory')
router.register(r'account-classifications', AccountCategoryViewSet, basename='accountclassification')
router.register(r'periods', PeriodViewSet, basename='period')
router.register(r'balance-snapshots', BalanceSheetSnapshotViewSet, basename='balancesheetsnapshot')
router.register(r'ledger', AccountLedgerViewSet, basename='account-ledger')
router.register(r'', AccountViewSet, basename='account')  # Register last to avoid catching sub-routes

app_name = 'accounts'

urlpatterns = [
    path('', include(router.urls)),
]