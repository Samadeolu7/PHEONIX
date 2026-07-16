# banks/urls.py
"""
URL configuration for Bank Management
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    BankViewSet,
    BankAccountViewSet,
    BankTransferViewSet,
    BankPaymentViewSet,
    StatementUploadView,
    DailyReconciliationListView,
    DailyReconciliationDetailView,
    MatchedTransactionsView,
    RerunReconciliationView,
    ResolveExceptionView,
    OfficerReconciliationRiskReportView,
)

router = DefaultRouter()
router.register(r'banks', BankViewSet, basename='bank')
router.register(r'bank-accounts', BankAccountViewSet, basename='bank-account')
router.register(r'bank-transfers', BankTransferViewSet, basename='bank-transfer')
router.register(r'bank-payments', BankPaymentViewSet, basename='bank-payment')

urlpatterns = [
    path('', include(router.urls)),

    # ── Daily Reconciliation (Bank-Recon integration) ──────────────────────
    path(
        'reconciliations/upload/',
        StatementUploadView.as_view(),
        name='reconciliation-upload',
    ),
    path(
        'reconciliations/',
        DailyReconciliationListView.as_view(),
        name='reconciliation-list',
    ),
    path(
        'reconciliations/<int:pk>/',
        DailyReconciliationDetailView.as_view(),
        name='reconciliation-detail',
    ),
    path(
        'reconciliations/<int:pk>/rerun/',
        RerunReconciliationView.as_view(),
        name='reconciliation-rerun',
    ),
    path(
        'reconciliations/<int:recon_pk>/transactions/',
        MatchedTransactionsView.as_view(),
        name='reconciliation-transactions',
    ),
    path(
        'reconciliations/<int:recon_pk>/exceptions/<int:exc_pk>/resolve/',
        ResolveExceptionView.as_view(),
        name='reconciliation-exception-resolve',
    ),
    path(
        'reports/officer-reconciliation-risk/',
        OfficerReconciliationRiskReportView.as_view(),
        name='officer-reconciliation-risk-report',
    ),
]
