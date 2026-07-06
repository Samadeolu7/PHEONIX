# analytics/urls.py
from django.urls import path
from .views import (
    MicrofinanceDashboardStatsView,
    SchoolDashboardStatsView,  # backward-compat alias
    LoanRepaymentTrendView,
    ClientGrowthView,
    StaffAttendanceSummaryView,
    StaffPerformanceView,
    CashInflowTrendView,
    LoanPortfolioByProductView,
    PortfolioBreakdownView,
    InterestIncomeByRecognitionModeView,
    ProvisioningComplianceView,
    OfficerScorecardTrendView,
)

app_name = 'analytics'

urlpatterns = [
    # Primary endpoint — used by Phoenix frontend
    path('dashboard-stats/', MicrofinanceDashboardStatsView.as_view(), name='dashboard-stats'),
    # Legacy alias — keep until any old integrations are retired
    path('school-dashboard-stats/', SchoolDashboardStatsView.as_view(), name='school-dashboard-stats'),
    # Chart endpoints
    path('loan-repayment-trend/', LoanRepaymentTrendView.as_view(), name='loan-repayment-trend'),
    path('client-growth/', ClientGrowthView.as_view(), name='client-growth'),
    path('staff-attendance/', StaffAttendanceSummaryView.as_view(), name='staff-attendance'),
    path('staff-performance/', StaffPerformanceView.as_view(), name='staff-performance'),
    path('cash-inflow-trend/', CashInflowTrendView.as_view(), name='cash-inflow-trend'),
    path('loan-portfolio-by-product/', LoanPortfolioByProductView.as_view(), name='loan-portfolio-by-product'),
    # Track 2 — Portfolio & Performance Report
    path('portfolio-performance/breakdown/', PortfolioBreakdownView.as_view(), name='portfolio-performance-breakdown'),
    path('portfolio-performance/interest-income/', InterestIncomeByRecognitionModeView.as_view(), name='portfolio-performance-interest-income'),
    path('portfolio-performance/provisioning/', ProvisioningComplianceView.as_view(), name='portfolio-performance-provisioning'),
    path('portfolio-performance/officer-trend/', OfficerScorecardTrendView.as_view(), name='portfolio-performance-officer-trend'),
]

