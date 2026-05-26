"""
internal_api/urls.py
====================
URL routes for all internal Java microservice endpoints.
Mounted at /api/internal/ in phoenix/urls.py.
"""
from django.urls import path
from . import views

app_name = 'internal_api'

urlpatterns = [
    # ------------------------------------------------------------------
    # App 1 – Loan Portfolio Batch Processor
    # ------------------------------------------------------------------
    path(
        'loans/batch-pending/',
        views.LoanBatchPendingView.as_view(),
        name='loan-batch-pending',
    ),
    path(
        'loans/<int:pk>/batch-complete/',
        views.LoanBatchCompleteView.as_view(),
        name='loan-batch-complete',
    ),
    path(
        'loans/batch-reset/',
        views.LoanBatchResetView.as_view(),
        name='loan-batch-reset',
    ),

    # App 1 – primary write-back endpoints (called by LoanItemWriter &
    # LoanBatchListener in the Spring Batch job)
    path(
        'batch/loan-accrual/bulk/',
        views.BulkLoanAccrualView.as_view(),
        name='batch-loan-accrual-bulk',
    ),
    path(
        'batch/run-summary/',
        views.BatchRunSummaryView.as_view(),
        name='batch-run-summary',
    ),

    # ------------------------------------------------------------------
    # App 2 – Statutory Compliance Service (NHF / NSITF)
    # ------------------------------------------------------------------
    path(
        'hr/statutory-filings/',
        views.StatutoryFilingListView.as_view(),
        name='statutory-filing-list',
    ),
    path(
        'hr/statutory-filings/<int:pk>/',
        views.StatutoryFilingUpdateView.as_view(),
        name='statutory-filing-update',
    ),

    # ------------------------------------------------------------------
    # App 3 – Bank Feed Reconciliation Service
    # ------------------------------------------------------------------
    path(
        'banks/feed-consents/',
        views.BankFeedConsentListView.as_view(),
        name='feed-consent-list',
    ),
    path(
        'banks/feed-consents/<int:pk>/sync/',
        views.BankFeedConsentSyncView.as_view(),
        name='feed-consent-sync',
    ),
]
