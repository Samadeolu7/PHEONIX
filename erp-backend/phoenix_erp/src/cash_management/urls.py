# cash_management/urls.py
"""
URL Configuration for Cash/Bank Treasury Management
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    CashierAccountViewSet,
    CashCollectionViewSet,
    CashReconciliationViewSet,
    CashTransferViewSet,
    BankReconciliationViewSet,
    SummaryViewSet,
    PettyCashFundViewSet,
    PettyCashVoucherViewSet,
    PettyCashReplenishmentViewSet,
    DailyCollectionSheetViewSet,
    CollectionSheetItemViewSet,
)

app_name = 'cash_management'

router = DefaultRouter()
router.register(r'cashier-accounts', CashierAccountViewSet, basename='cashier-account')
router.register(r'cash-collections', CashCollectionViewSet, basename='cash-collection')
router.register(r'cash-reconciliations', CashReconciliationViewSet, basename='cash-reconciliation')
router.register(r'cash-transfers', CashTransferViewSet, basename='cash-transfer')
router.register(r'bank-reconciliations', BankReconciliationViewSet, basename='bank-reconciliation')
router.register(r'summary', SummaryViewSet, basename='summary')
router.register(r'petty-cash-funds', PettyCashFundViewSet, basename='petty-cash-fund')
router.register(r'petty-cash-vouchers', PettyCashVoucherViewSet, basename='petty-cash-voucher')
router.register(r'petty-cash-replenishments', PettyCashReplenishmentViewSet, basename='petty-cash-replenishment')
router.register(r'collection-sheets', DailyCollectionSheetViewSet, basename='collection-sheet')
router.register(r'collection-sheet-items', CollectionSheetItemViewSet, basename='collection-sheet-item')

urlpatterns = [
    path('', include(router.urls)),
]
