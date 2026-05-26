from django.contrib import admin

from .models import (
	Staff, SalaryComponent, StaffPayInfo, PayrollSchedule,
	LeaveType, LeaveBalance, LeaveRequest, Attendance,
	Payroll, Payslip, StaffIOU
)


@admin.register(Staff)
class StaffAdmin(admin.ModelAdmin):
	list_display = ('staff_id', 'first_name', 'last_name', 'email', 'phone', 'position', 'department')
	search_fields = ('first_name', 'last_name', 'email', 'phone', 'position', 'department', 'staff_id')


@admin.register(SalaryComponent)
class SalaryComponentAdmin(admin.ModelAdmin):
	list_display = ('id', 'name', 'component_type', 'default_amount')
	search_fields = ('name',)


@admin.register(StaffPayInfo)
class StaffPayInfoAdmin(admin.ModelAdmin):
	list_display = ('id', 'staff', 'component', 'amount')
	search_fields = ('staff__first_name', 'staff__last_name', 'component__name')


@admin.register(PayrollSchedule)
class PayrollScheduleAdmin(admin.ModelAdmin):
	list_display = ('id', 'name', 'frequency', 'next_run')
	search_fields = ('name',)


@admin.register(LeaveType)
class LeaveTypeAdmin(admin.ModelAdmin):
	list_display = ('id', 'code', 'name', 'is_paid')
	search_fields = ('code', 'name')


@admin.register(LeaveBalance)
class LeaveBalanceAdmin(admin.ModelAdmin):
	list_display = ('id', 'staff', 'leave_type', 'year', 'entitled_days', 'used_days')
	search_fields = ('staff__first_name', 'staff__last_name')


@admin.register(LeaveRequest)
class LeaveRequestAdmin(admin.ModelAdmin):
	list_display = ('id', 'reference_number', 'staff', 'leave_type', 'start_date', 'end_date', 'status')
	search_fields = ('reference_number', 'staff__first_name', 'staff__last_name')
	list_filter = ('status', 'leave_type')


@admin.register(Attendance)
class AttendanceAdmin(admin.ModelAdmin):
	list_display = ('id', 'staff', 'date', 'status', 'hours_worked', 'overtime_hours')
	search_fields = ('staff__first_name', 'staff__last_name')
	list_filter = ('status',)


@admin.register(Payroll)
class PayrollAdmin(admin.ModelAdmin):
	list_display = ('id', 'reference_number', 'period_start', 'period_end', 'pay_date', 'status')
	search_fields = ('reference_number',)
	list_filter = ('status',)


@admin.register(Payslip)
class PayslipAdmin(admin.ModelAdmin):
	list_display = ('id', 'payslip_number', 'payroll', 'staff', 'net_pay')
	search_fields = ('payslip_number', 'staff__first_name', 'staff__last_name')


@admin.register(StaffIOU)
class StaffIOUAdmin(admin.ModelAdmin):
	list_display = ('reference_number', 'staff', 'total_amount', 'balance_remaining', 'monthly_installment', 'start_month', 'status')
	list_filter = ('status',)
	search_fields = ('reference_number', 'staff__first_name', 'staff__last_name', 'staff__staff_id')
	readonly_fields = ('reference_number', 'balance_remaining', 'created_at', 'updated_at', 'disbursement_journal')
