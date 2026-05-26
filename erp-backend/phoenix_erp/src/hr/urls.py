# hr/urls.py
"""
URL routing for HR & Payroll API
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    HRConfigViewSet, StaffViewSet, SalaryComponentViewSet,
    StaffPayInfoViewSet, PayrollScheduleViewSet,
    LeaveTypeViewSet, LeaveBalanceViewSet, LeaveRequestViewSet,
    AttendanceViewSet, PayrollViewSet, PayslipViewSet,
    BonusDeductionRequestViewSet, PensionRemittanceViewSet,
    EmployeeDocumentViewSet, PayComponentRemovalRequestViewSet,
    StaffIOUViewSet, PayrollStatutoryFilingViewSet,
)

app_name = 'hr'

router = DefaultRouter()
router.register(r'config', HRConfigViewSet, basename='hrconfig')
router.register(r'staff', StaffViewSet, basename='staff')
router.register(r'salary-components', SalaryComponentViewSet, basename='salary-component')
router.register(r'staff-pay-info', StaffPayInfoViewSet, basename='staff-pay-info')
router.register(r'bonus-deduction-requests', BonusDeductionRequestViewSet, basename='bonus-deduction-request')
router.register(r'payroll-schedules', PayrollScheduleViewSet, basename='payroll-schedule')
router.register(r'leave-types', LeaveTypeViewSet, basename='leave-type')
router.register(r'leave-balances', LeaveBalanceViewSet, basename='leave-balance')
router.register(r'leave-requests', LeaveRequestViewSet, basename='leave-request')
router.register(r'attendance', AttendanceViewSet, basename='attendance')
router.register(r'payroll', PayrollViewSet, basename='payroll')
router.register(r'payslips', PayslipViewSet, basename='payslip')
router.register(r'pension-remittances', PensionRemittanceViewSet, basename='pension-remittance')
router.register(r'employee-documents', EmployeeDocumentViewSet, basename='employee-document')
router.register(r'pay-component-removals', PayComponentRemovalRequestViewSet, basename='pay-component-removal')
router.register(r'staff-ious', StaffIOUViewSet, basename='staff-iou')
router.register(r'statutory-filings', PayrollStatutoryFilingViewSet, basename='statutory-filing')

urlpatterns = [
    path('', include(router.urls)),
]