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
    UnmatchTransactionView,
    RerunReconciliationView,
    ResolveExceptionView,
    SecondResolveExceptionView,
    ResolveExceptionToExpenseView,
    LinkResolveExceptionsView,
    LinkResolveBankChargeView,
    BulkLinkResolveBankChargeView,
    LinkCandidatesView,
    UnresolveExceptionView,
    BulkCleanUpStrandedPairsView,
    OfficerReconciliationRiskReportView,
    ManualOverridesReportView,
    MissingMoneySummaryView,
    MissingMoneyOfficerExceptionsView,
    MissingMoneyBankAccountExceptionsView,
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
        'reconciliations/<int:recon_pk>/transactions/<uuid:tx_id>/unmatch/',
        UnmatchTransactionView.as_view(),
        name='reconciliation-transaction-unmatch',
    ),
    path(
        'reconciliations/<int:recon_pk>/exceptions/<int:exc_pk>/resolve/',
        ResolveExceptionView.as_view(),
        name='reconciliation-exception-resolve',
    ),
    path(
        'reconciliations/<int:recon_pk>/exceptions/<int:exc_pk>/resolve/second/',
        SecondResolveExceptionView.as_view(),
        name='reconciliation-exception-resolve-second',
    ),
    path(
        'reconciliations/<int:recon_pk>/exceptions/<int:exc_pk>/resolve-to-expense/',
        ResolveExceptionToExpenseView.as_view(),
        name='reconciliation-exception-resolve-to-expense',
    ),
    path(
        'exceptions/link-resolve/',
        LinkResolveExceptionsView.as_view(),
        name='reconciliation-exceptions-link-resolve',
    ),
    path(
        'exceptions/link-resolve-bank-charge/',
        LinkResolveBankChargeView.as_view(),
        name='reconciliation-exceptions-link-resolve-bank-charge',
    ),
    path(
        'exceptions/bulk-link-resolve-bank-charge/',
        BulkLinkResolveBankChargeView.as_view(),
        name='reconciliation-exceptions-bulk-link-resolve-bank-charge',
    ),
    path(
        'exceptions/<int:exc_id>/link-candidates/',
        LinkCandidatesView.as_view(),
        name='reconciliation-exception-link-candidates',
    ),
    path(
        'exceptions/<int:exc_id>/unresolve/',
        UnresolveExceptionView.as_view(),
        name='reconciliation-exception-unresolve',
    ),
    path(
        'exceptions/bulk-clean-up-stranded-pairs/',
        BulkCleanUpStrandedPairsView.as_view(),
        name='reconciliation-exceptions-bulk-clean-up-stranded-pairs',
    ),
    path(
        'reports/officer-reconciliation-risk/',
        OfficerReconciliationRiskReportView.as_view(),
        name='officer-reconciliation-risk-report',
    ),
    path(
        'reports/manual-overrides/',
        ManualOverridesReportView.as_view(),
        name='manual-overrides-report',
    ),
    path(
        'reports/missing-money-summary/',
        MissingMoneySummaryView.as_view(),
        name='missing-money-summary',
    ),
    path(
        'reports/missing-money-summary/officer/<str:officer_id>/',
        MissingMoneyOfficerExceptionsView.as_view(),
        name='missing-money-officer-detail',
    ),
    path(
        'reports/missing-money-summary/bank-account/<int:bank_account_id>/',
        MissingMoneyBankAccountExceptionsView.as_view(),
        name='missing-money-bank-account-detail',
    ),
]
