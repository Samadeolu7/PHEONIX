# analytics/urls.py
from django.urls import path
from .views import (
    MicrofinanceDashboardStatsView,
    SchoolDashboardStatsView,  # backward-compat alias
    LoanRepaymentTrendView,
    ClientGrowthView,
    StaffAttendanceSummaryView,
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
]

