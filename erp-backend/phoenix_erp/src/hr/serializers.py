# hr/serializers.py
"""
Serializers for HR & Payroll API
"""
from rest_framework import serializers
from rest_framework.decorators import action
from rest_framework.response import Response
from decimal import Decimal
from django.contrib.auth import get_user_model

from .models import (
    Staff, LeaveType, LeaveBalance, LeaveRequest,
    Attendance, Payroll, Payslip, SalaryComponent, StaffPayInfo, PayrollSchedule,
    BonusDeductionRequest, PensionRemittance, EmployeeDocument,
    PayComponentRemovalRequest, StaffIOU, PayrollStatutoryFiling,
)
from .config_models import HRConfig
from automations.models import WorkflowTemplate, WorkflowRun
from common.serializers import TenantModelSerializer
from common.image_processing import compress_image

User = get_user_model()


class HRConfigSerializer(serializers.ModelSerializer):
    """HR Configuration serializer"""
    default_leave_workflow_name = serializers.CharField(
        source='default_leave_workflow.name',
        read_only=True,
        allow_null=True
    )
    extended_leave_workflow_name = serializers.CharField(
        source='extended_leave_workflow.name',
        read_only=True,
        allow_null=True
    )
    payroll_approval_workflow_name = serializers.CharField(
        source='payroll_approval_workflow.name',
        read_only=True,
        allow_null=True
    )

    class Meta:
        model = HRConfig
        fields = [
            'id', 'branch',
            # Leave settings
            'enable_leave_approval', 'max_consecutive_leave_days',
            'annual_leave_days', 'sick_leave_days',
            # Attendance settings
            'working_hours_per_day', 'late_arrival_grace_minutes',
            'enable_attendance_tracking',
            # Payroll settings
            'payroll_currency', 'payroll_frequency',
            'tax_rate_percentage', 'enable_overtime_calculation',
            'overtime_multiplier',
            # Staff ID settings
            'staff_id_prefix', 'staff_id_padding', 'staff_id_current_number',
            # Pension settings
            'enable_pension', 'employee_pension_rate', 'employer_pension_rate',
            'pension_provider_name',
            # PAYE / Tax settings
            'enable_paye',
            'enable_development_levy', 'development_levy_annual_amount',
            # Workflow references
            'default_leave_workflow', 'default_leave_workflow_name',
            'extended_leave_workflow', 'extended_leave_workflow_name',
            'payroll_approval_workflow', 'payroll_approval_workflow_name',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['staff_id_current_number', 'created_at', 'updated_at']


class StaffSerializer(TenantModelSerializer):
    """Staff serializer"""
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = Staff
        fields = [
            'id', 'user', 'full_name', 'first_name', 'last_name',
            'staff_id', 'department', 'position',
            'email', 'phone', 'photo',
            'pension_number', 'pension_provider',
            # Tax & banking fields (added for payroll import / disbursement)
            'paye_pin', 'bank_name', 'bank_account_number',
            'is_pension_exempt',
            'owner', 'branch', 'created_at', 'updated_at'
        ]
        read_only_fields = ['staff_id', 'created_at', 'updated_at']

    def validate_photo(self, value):
        if value:
            if value.content_type.startswith('image/'):
                value = compress_image(value, max_dimension=1200, quality=82)
        return value

    def get_full_name(self, obj):
        if obj.user:
            return obj.user.get_full_name()
        return f"{obj.first_name} {obj.last_name}" if obj.first_name and obj.last_name else "N/A"


class SalaryComponentSerializer(TenantModelSerializer):
    """Salary component serializer"""
    gl_account_name = serializers.CharField(source='gl_account.name', read_only=True)
    gl_account_code = serializers.CharField(source='gl_account.code', read_only=True)

    class Meta:
        model = SalaryComponent
        fields = [
            'id', 'name', 'component_type',
            'default_amount', 'is_taxable', 'is_pensionable', 'description',
            'gl_account', 'gl_account_name', 'gl_account_code', 'is_advance',
            'owner', 'branch', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']

    def validate(self, data):
        # is_taxable / is_pensionable / is_advance only apply to EARNING components
        # (taxable/pensionable) or DEDUCTION components (is_advance).
        if data.get('component_type') == SalaryComponent.DEDUCTION:
            data['is_taxable'] = False
            data['is_pensionable'] = False
        else:
            # EARNING components cannot be cash advances
            data['is_advance'] = False
        return data


class StaffPayInfoSerializer(TenantModelSerializer):
    """Staff pay info serializer"""
    staff_name = serializers.SerializerMethodField()
    staff_id = serializers.CharField(source='staff.staff_id', read_only=True)
    component_name = serializers.CharField(source='component.name', read_only=True)
    component_type = serializers.CharField(source='component.component_type', read_only=True)
    is_taxable = serializers.BooleanField(source='component.is_taxable', read_only=True)
    is_pensionable = serializers.BooleanField(source='component.is_pensionable', read_only=True)

    class Meta:
        model = StaffPayInfo
        fields = [
            'id', 'staff', 'staff_id', 'staff_name', 'component', 'component_name',
            'component_type', 'is_taxable', 'is_pensionable', 'amount',
            'owner', 'branch', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']
    
    def get_staff_name(self, obj):
        return obj.staff.user.get_full_name() if obj.staff.user else f"{obj.staff.first_name} {obj.staff.last_name}"


class BonusDeductionRequestSerializer(TenantModelSerializer):
    """Bonus/Deduction request serializer for list and detail views"""
    staff_name = serializers.SerializerMethodField()
    staff_id = serializers.CharField(source='staff.staff_id', read_only=True)
    component_name = serializers.CharField(source='component.name', read_only=True)
    component_type = serializers.CharField(source='component.component_type', read_only=True)
    requested_by_name = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()
    is_pending = serializers.BooleanField(read_only=True)
    is_approved = serializers.BooleanField(read_only=True)
    is_rejected = serializers.BooleanField(read_only=True)
    
    class Meta:
        model = BonusDeductionRequest
        fields = [
            'id', 'reference_number', 'staff', 'staff_id', 'staff_name',
            'component', 'component_name', 'component_type',
            'amount', 'reason', 'for_month',
            'status', 'is_pending', 'is_approved', 'is_rejected',
            'requested_by', 'requested_by_name', 'requested_date',
            'approved_by', 'approved_by_name', 'approved_date',
            'rejection_reason', 'applied_in_payroll',
            'owner', 'branch', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'reference_number', 'status', 'requested_by', 'requested_date',
            'approved_by', 'approved_date', 'applied_in_payroll',
            'created_at', 'updated_at'
        ]
    
    def get_staff_name(self, obj):
        return obj.staff.user.get_full_name() if obj.staff.user else f"{obj.staff.first_name} {obj.staff.last_name}"
    
    def get_requested_by_name(self, obj):
        return obj.requested_by.get_full_name() if obj.requested_by else None
    
    def get_approved_by_name(self, obj):
        return obj.approved_by.get_full_name() if obj.approved_by else None


class BonusDeductionRequestCreateSerializer(TenantModelSerializer):
    """Serializer for creating bonus/deduction requests"""
    
    class Meta:
        model = BonusDeductionRequest
        fields = ['staff', 'component', 'amount', 'reason', 'for_month']
    
    def validate_amount(self, value):
        """Ensure amount is positive"""
        if value <= 0:
            raise serializers.ValidationError("Amount must be greater than 0")
        return value
    
    def validate(self, data):
        """Cross-field validation"""
        # Ensure component type matches the typical use case
        component = data.get('component')
        if component and component.component_type not in [SalaryComponent.EARNING, SalaryComponent.DEDUCTION]:
            raise serializers.ValidationError({
                'component': 'Component must be either EARNING (bonus) or DEDUCTION type'
            })
        
        return data
    
    def create(self, validated_data):
        """Auto-generate reference number and set requested_by"""
        request = self.context.get('request')
        
        # Generate reference number
        from django.utils import timezone
        now = timezone.now()
        prefix = 'BDR'
        date_part = now.strftime('%Y%m%d')
        
        # Get last sequence for today
        last_ref = BonusDeductionRequest.objects.filter(
            reference_number__startswith=f'{prefix}-{date_part}'
        ).order_by('-reference_number').first()
        
        if last_ref:
            last_seq = int(last_ref.reference_number.split('-')[-1])
            new_seq = last_seq + 1
        else:
            new_seq = 1
        
        validated_data['reference_number'] = f'{prefix}-{date_part}-{new_seq:04d}'
        validated_data['requested_by'] = request.user
        validated_data['status'] = BonusDeductionRequest.PENDING
        
        return super().create(validated_data)


class BonusDeductionRequestApprovalSerializer(serializers.Serializer):
    """Serializer for approving/rejecting bonus/deduction requests"""
    action = serializers.ChoiceField(choices=['approve', 'reject'], required=True)
    rejection_reason = serializers.CharField(required=False, allow_blank=True)
    
    def validate(self, data):
        """Ensure rejection_reason is provided when rejecting"""
        if data['action'] == 'reject' and not data.get('rejection_reason'):
            raise serializers.ValidationError({
                'rejection_reason': 'Rejection reason is required when rejecting a request'
            })
        return data


class PayComponentRemovalRequestSerializer(TenantModelSerializer):
    """Full read serializer for PayComponentRemovalRequest."""
    staff_pk = serializers.IntegerField(source='staff_pay_info.staff.id', read_only=True)
    staff_id = serializers.CharField(source='staff_pay_info.staff.staff_id', read_only=True)
    staff_name = serializers.SerializerMethodField()
    component_id = serializers.IntegerField(source='staff_pay_info.component.id', read_only=True)
    component_name = serializers.CharField(source='staff_pay_info.component.name', read_only=True)
    component_type = serializers.CharField(source='staff_pay_info.component.component_type', read_only=True)
    current_amount = serializers.DecimalField(
        source='staff_pay_info.amount', max_digits=18, decimal_places=2, read_only=True
    )
    requested_by_name = serializers.SerializerMethodField()
    approved_by_name  = serializers.SerializerMethodField()

    class Meta:
        model = PayComponentRemovalRequest
        fields = [
            'id', 'reference_number',
            'staff_pay_info', 'staff_pk', 'staff_id', 'staff_name',
            'component_id', 'component_name', 'component_type', 'current_amount',
            'reason', 'status',
            'requested_by', 'requested_by_name', 'requested_date',
            'approved_by', 'approved_by_name', 'approved_date',
            'rejection_reason',
            'owner', 'branch', 'created_at', 'updated_at',
        ]
        read_only_fields = ['reference_number', 'status', 'requested_by', 'requested_date',
                            'approved_by', 'approved_date', 'created_at', 'updated_at']

    def get_staff_name(self, obj):
        s = obj.staff_pay_info.staff
        return f"{s.first_name} {s.last_name}".strip() or str(s)

    def get_requested_by_name(self, obj):
        u = obj.requested_by
        return u.get_full_name() or u.username if u else ''

    def get_approved_by_name(self, obj):
        u = obj.approved_by
        return u.get_full_name() or u.username if u else ''


class PayComponentRemovalRequestCreateSerializer(TenantModelSerializer):
    """Serializer for creating a new removal request."""
    class Meta:
        model = PayComponentRemovalRequest
        fields = ['staff_pay_info', 'reason']

    def validate_staff_pay_info(self, value):
        # Block a second pending request for the same assignment
        if PayComponentRemovalRequest.objects.filter(
            staff_pay_info=value,
            status=PayComponentRemovalRequest.PENDING
        ).exists():
            raise serializers.ValidationError(
                'A pending removal request already exists for this component assignment.'
            )
        return value

    def create(self, validated_data):
        request = self.context.get('request')
        from django.utils import timezone
        last = PayComponentRemovalRequest.objects.order_by('-reference_number').first()
        seq = 1
        if last and last.reference_number.startswith('PCR-'):
            try:
                seq = int(last.reference_number.split('-')[1]) + 1
            except (IndexError, ValueError):
                pass
        validated_data['reference_number'] = f'PCR-{seq:04d}'
        validated_data['requested_by'] = request.user
        validated_data['status'] = PayComponentRemovalRequest.PENDING
        return super().create(validated_data)


class PayrollScheduleSerializer(TenantModelSerializer):
    """Payroll schedule serializer"""
    
    class Meta:
        model = PayrollSchedule
        fields = [
            'id', 'name', 'frequency', 'day_of_month', 'day_of_week',
            'next_run',
            'owner', 'branch', 'created_at', 'updated_at'
        ]
        read_only_fields = ['next_run', 'created_at', 'updated_at']


class LeaveTypeSerializer(TenantModelSerializer):
    """Leave type serializer"""
    
    class Meta:
        model = LeaveType
        fields = [
            'id', 'name', 'code', 'is_paid',
            'requires_approval', 'requires_medical_certificate',
            'default_days_per_year', 'allow_carryover',
            'max_carryover_days', 'description',
            'owner', 'branch', 'created_at', 'updated_at'
        ]
        read_only_fields = ['code', 'created_at', 'updated_at']


class LeaveBalanceSerializer(TenantModelSerializer):
    """Leave balance serializer"""
    staff = serializers.SerializerMethodField()
    leave_type = serializers.SerializerMethodField()
    available_days = serializers.DecimalField(
        max_digits=5,
        decimal_places=1,
        read_only=True
    )
    total_days = serializers.SerializerMethodField()
    
    class Meta:
        model = LeaveBalance
        fields = [
            'id', 'staff', 'leave_type',
            'year', 'entitled_days', 'used_days', 'pending_days',
            'carried_over_days', 'available_days', 'total_days',
            'owner', 'branch', 'created_at', 'updated_at'
        ]
        read_only_fields = ['used_days', 'pending_days', 'available_days', 'total_days', 'created_at', 'updated_at']
    
    def get_staff(self, obj):
        """Return staff object with full details"""
        return {
            'id': obj.staff.id,
            'staff_id': obj.staff.staff_id,
            'full_name': obj.staff.user.get_full_name() if obj.staff.user else f"{obj.staff.first_name} {obj.staff.last_name}",
            'employee_number': obj.staff.employee_number if hasattr(obj.staff, 'employee_number') else None,
            'department': obj.staff.department,
            'position': obj.staff.position,
        }
    
    def get_leave_type(self, obj):
        """Return leave type object with full details"""
        return {
            'id': obj.leave_type.id,
            'name': obj.leave_type.name,
            'code': obj.leave_type.code,
        }
    
    def get_total_days(self, obj):
        """Total days = entitled_days + carried_over_days"""
        return obj.entitled_days + obj.carried_over_days


class LeaveRequestSerializer(TenantModelSerializer):
    """Leave request serializer"""
    staff_id = serializers.CharField(source='staff.staff_id', read_only=True)
    staff_name = serializers.SerializerMethodField()
    leave_type_name = serializers.CharField(source='leave_type.name', read_only=True)
    relief_officer_name = serializers.SerializerMethodField()
    workflow_status = serializers.CharField(
        source='workflow_run.status',
        read_only=True,
        allow_null=True
    )
    
    class Meta:
        model = LeaveRequest
        fields = [
            'id', 'reference_number', 'staff', 'staff_id', 'staff_name',
            'leave_type', 'leave_type_name', 'start_date', 'end_date',
            'num_days', 'reason', 'medical_certificate', 'relief_officer',
            'relief_officer_name', 'status', 'rejection_reason',
            'workflow_run', 'workflow_status', 'approval_chain',
            'owner', 'branch', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'reference_number', 'num_days', 'status',
            'workflow_run', 'approval_chain',
            'created_at', 'updated_at'
        ]
    
    def get_staff_name(self, obj):
        return obj.staff.user.get_full_name() if obj.staff.user else f"{obj.staff.first_name} {obj.staff.last_name}"
    
    def get_relief_officer_name(self, obj):
        if not obj.relief_officer:
            return None
        return obj.relief_officer.user.get_full_name() if obj.relief_officer.user else f"{obj.relief_officer.first_name} {obj.relief_officer.last_name}"
    
    def validate(self, data):
        """Validate leave request"""
        if data.get('start_date') and data.get('end_date'):
            if data['end_date'] < data['start_date']:
                raise serializers.ValidationError({
                    'end_date': 'End date must be after start date'
                })
        
        # CRITICAL: Validate leave balance exists before allowing leave request creation
        if data.get('start_date') and data.get('staff') and data.get('leave_type'):
            from hr.models import LeaveBalance
            
            year = data['start_date'].year
            balance_exists = LeaveBalance.objects.filter(
                staff=data['staff'],
                leave_type=data['leave_type'],
                year=year,
                is_deleted=False
            ).exists()
            
            if not balance_exists:
                staff = data['staff']
                leave_type = data['leave_type']
                error_message = (
                    f"Cannot create leave request: No leave balance found for "
                    f"{staff.first_name} {staff.last_name} for {leave_type.name} in {year}. "
                    f"Leave balances must be initialized before requesting leave. Contact HR administrator."
                )
                raise serializers.ValidationError({
                    'staff': error_message
                })
        
        return data
    
    def create(self, validated_data):
        """Create leave request and calculate num_days"""
        from hr.models import LeaveRequest
        from datetime import timedelta
        
        # Calculate num_days before creating the object
        if 'start_date' in validated_data and 'end_date' in validated_data:
            start_date = validated_data['start_date']
            end_date = validated_data['end_date']
            delta = end_date - start_date
            days = 0
            
            for i in range(delta.days + 1):
                day = start_date + timedelta(days=i)
                # Skip weekends (Saturday=5, Sunday=6)
                if day.weekday() < 5:
                    days += 1
            
            validated_data['num_days'] = days
        
        return super().create(validated_data)


class AttendanceSerializer(TenantModelSerializer):
    """Attendance serializer"""
    staff_id = serializers.CharField(source='staff.staff_id', read_only=True)
    staff_name = serializers.SerializerMethodField()
    hours_worked = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        read_only=True
    )
    overtime_hours = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        read_only=True
    )
    
    class Meta:
        model = Attendance
        fields = [
            'id', 'staff', 'staff_id', 'staff_name', 'date',
            'clock_in', 'clock_out', 'status',
            'hours_worked', 'overtime_hours',
            'leave_request', 'notes',
            'owner', 'branch', 'created_at', 'updated_at'
        ]
        read_only_fields = ['hours_worked', 'overtime_hours', 'created_at', 'updated_at']
    
    def get_staff_name(self, obj):
        return obj.staff.user.get_full_name() if obj.staff.user else f"{obj.staff.first_name} {obj.staff.last_name}"
    
    def validate(self, data):
        """Validate attendance"""
        if data.get('clock_out') and data.get('clock_in'):
            if data['clock_out'] <= data['clock_in']:
                raise serializers.ValidationError({
                    'clock_out': 'Clock out time must be after clock in time'
                })
        return data


class PayslipSerializer(TenantModelSerializer):
    """Payslip serializer (for list and detail views)"""
    staff_name = serializers.SerializerMethodField()
    staff_id   = serializers.CharField(source='staff.staff_id', read_only=True)
    payroll_reference = serializers.CharField(source='payroll.reference_number', read_only=True)
    period_label = serializers.SerializerMethodField()
    # Computed display helpers
    taxable_income_display  = serializers.DecimalField(
        source='taxable_income', max_digits=18, decimal_places=2, read_only=True
    )
    annual_taxable_display  = serializers.DecimalField(
        source='annual_taxable_income', max_digits=18, decimal_places=2, read_only=True
    )
    iou_monthly_deduction = serializers.SerializerMethodField()
    iou_total_outstanding = serializers.SerializerMethodField()
    iou_balance_after_this_period = serializers.SerializerMethodField()
    other_deductions_total = serializers.SerializerMethodField()
    staff_iou_details = serializers.SerializerMethodField()

    class Meta:
        model = Payslip
        fields = [
            'id', 'payslip_number', 'payroll', 'payroll_reference',
            'staff', 'staff_name', 'staff_id', 'period_label',
            'basic_salary', 'overtime_pay', 'allowances', 'bonuses',
            'gross_pay',
            # PAYE audit
            'taxable_income', 'taxable_income_display',
            'annual_taxable_income', 'annual_taxable_display',
            'paye_breakdown',
            'tax',
            # Pension
            'employee_pension', 'employer_pension',
            # Other deductions
            'deductions', 'total_deductions',
            'iou_monthly_deduction', 'iou_total_outstanding',
            'iou_balance_after_this_period',
            'other_deductions_total', 'staff_iou_details',
            'net_pay',
            # Attendance
            'days_worked', 'days_absent', 'days_on_leave', 'overtime_hours',
            # File / email
            'pdf_file', 'emailed_at',
            'owner', 'branch', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'payslip_number', 'gross_pay', 'total_deductions', 'net_pay',
            'taxable_income', 'annual_taxable_income', 'paye_breakdown',
            'employee_pension', 'employer_pension',
            'pdf_file', 'emailed_at', 'created_at', 'updated_at'
        ]

    def get_staff_name(self, obj):
        return (
            obj.staff.user.get_full_name()
            if obj.staff.user
            else f"{obj.staff.first_name} {obj.staff.last_name}"
        )

    def get_period_label(self, obj):
        """Human-readable pay period label for display on payslip."""
        ps = obj.payroll.period_start
        return ps.strftime('%B %Y') if ps else ''

    def _get_relevant_ious(self, obj):
        """IOUs active for this staff as of the payslip payroll month."""
        cache_key = '_serializer_cached_ious'
        if hasattr(obj, cache_key):
            return getattr(obj, cache_key)

        payroll_month = obj.payroll.period_start.replace(day=1)
        ious = list(
            StaffIOU.objects.filter(
                staff=obj.staff,
                status=StaffIOU.ACTIVE,
                start_month__lte=payroll_month,
                is_deleted=False,
            ).order_by('start_month', 'created_at')
        )
        setattr(obj, cache_key, ious)
        return ious

    def get_iou_monthly_deduction(self, obj):
        return Decimal(str((obj.deductions or {}).get('Staff IOU', 0)))

    def get_iou_total_outstanding(self, obj):
        ious = self._get_relevant_ious(obj)
        return sum((iou.balance_remaining for iou in ious), Decimal('0.00'))

    def get_iou_balance_after_this_period(self, obj):
        """Outstanding IOU balance projected after this payslip's deduction is applied."""
        iou_monthly = Decimal(str((obj.deductions or {}).get('Staff IOU', 0)))
        ious = self._get_relevant_ious(obj)
        total_outstanding = sum((iou.balance_remaining for iou in ious), Decimal('0.00'))
        return max(Decimal('0.00'), total_outstanding - iou_monthly)

    def get_other_deductions_total(self, obj):
        deductions = obj.deductions or {}
        total = Decimal('0.00')
        for key, value in deductions.items():
            if key == 'Staff IOU':
                continue
            total += Decimal(str(value or 0))
        return total

    def get_staff_iou_details(self, obj):
        ious = self._get_relevant_ious(obj)
        details = []
        for iou in ious:
            installment = min(iou.monthly_installment, iou.balance_remaining)
            details.append({
                'reference_number':        iou.reference_number,
                'monthly_installment':     iou.monthly_installment,
                'balance_remaining':       iou.balance_remaining,
                'balance_after_this_period': max(Decimal('0.00'), iou.balance_remaining - installment),
                'start_month':             iou.start_month,
            })
        return details


class PayrollSerializer(TenantModelSerializer):
    """Payroll serializer (list view)"""
    payslips_count = serializers.SerializerMethodField()
    total_staff_iou_deductions = serializers.SerializerMethodField()
    total_other_deductions = serializers.SerializerMethodField()
    workflow_status = serializers.CharField(
        source='workflow_run.status',
        read_only=True,
        allow_null=True
    )
    first_approver_name = serializers.CharField(
        source='first_approver.get_full_name',
        read_only=True,
        allow_null=True
    )
    second_approver_name = serializers.CharField(
        source='second_approver.get_full_name',
        read_only=True,
        allow_null=True
    )
    
    class Meta:
        model = Payroll
        fields = [
            'id', 'reference_number', 'period_start', 'period_end',
            'pay_date', 'status', 'total_gross_pay', 'total_deductions',
            'total_net_pay',
            'total_employee_pension', 'total_employer_pension',
            'total_staff_iou_deductions', 'total_other_deductions',
            'payslips_count', 'workflow_run',
            'workflow_status', 'notes',
            'first_approved_at', 'first_approver', 'first_approver_name',
            'second_approved_at', 'second_approver', 'second_approver_name',
            'approved_at', 'approved_by',
            'owner', 'branch', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'reference_number', 'total_gross_pay', 'total_deductions',
            'total_net_pay', 'total_employee_pension', 'total_employer_pension',
            'total_staff_iou_deductions', 'total_other_deductions',
            'workflow_run',
            'first_approved_at', 'first_approver', 'first_approver_name',
            'second_approved_at', 'second_approver', 'second_approver_name',
            'approved_at', 'approved_by',
            'created_at', 'updated_at'
        ]
    
    def get_payslips_count(self, obj):
        return obj.payslips.count()

    def _get_deduction_totals(self, obj):
        """Aggregate IOU vs other deductions across all payslips.

        Uses prefetched payslips when available to avoid extra DB queries.
        Results are cached on the instance so get_total_staff_iou_deductions
        and get_total_other_deductions don't each trigger a separate iteration.
        """
        cache_key = '_deduction_totals_cache'
        if hasattr(obj, cache_key):
            return getattr(obj, cache_key)

        total_iou = Decimal('0.00')
        total_other = Decimal('0.00')

        # Use the prefetched queryset (populated by PayrollViewSet.get_queryset)
        # rather than .filter() which bypasses Django's prefetch cache.
        for slip in obj.payslips.all():
            if getattr(slip, 'is_deleted', False):
                continue
            deductions = slip.deductions or {}
            total_iou += Decimal(str(deductions.get('Staff IOU', 0) or 0))
            for name, amount in deductions.items():
                if name == 'Staff IOU':
                    continue
                total_other += Decimal(str(amount or 0))

        result = (total_iou, total_other)
        setattr(obj, cache_key, result)
        return result

    def get_total_staff_iou_deductions(self, obj):
        total_iou, _ = self._get_deduction_totals(obj)
        return total_iou

    def get_total_other_deductions(self, obj):
        _, total_other = self._get_deduction_totals(obj)
        return total_other


class PayrollDetailSerializer(PayrollSerializer):
    """Payroll serializer (detail view with payslips)"""
    payslips = PayslipSerializer(many=True, read_only=True)

    class Meta(PayrollSerializer.Meta):
        fields = PayrollSerializer.Meta.fields + ['payslips']


class PensionRemittanceSerializer(TenantModelSerializer):
    """Pension remittance serializer"""
    remitted_by_name = serializers.SerializerMethodField()
    payroll_references = serializers.SerializerMethodField()

    class Meta:
        model = PensionRemittance
        fields = [
            'id', 'reference_number',
            'period_start', 'period_end', 'remittance_date',
            'total_employee_pension', 'total_employer_pension', 'total_amount',
            'pension_provider', 'status',
            'payrolls', 'payroll_references',
            'payment_account', 'journal_entry',
            'remitted_by', 'remitted_by_name',
            'notes',
            'owner', 'branch', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'reference_number', 'total_amount',
            'journal_entry', 'remitted_by', 'remitted_by_name',
            'created_at', 'updated_at'
        ]

    def get_remitted_by_name(self, obj):
        return obj.remitted_by.get_full_name() if obj.remitted_by else None

    def get_payroll_references(self, obj):
        return list(obj.payrolls.values_list('reference_number', flat=True))

    def validate(self, data):
        """Auto-compute total_amount from employee + employer pension"""
        emp = data.get('total_employee_pension') or getattr(self.instance, 'total_employee_pension', 0)
        empr = data.get('total_employer_pension') or getattr(self.instance, 'total_employer_pension', 0)
        from decimal import Decimal
        data['total_amount'] = Decimal(str(emp)) + Decimal(str(empr))
        return data


class EmployeeDocumentSerializer(TenantModelSerializer):
    """Employee document serializer for file uploads and management"""
    staff_name = serializers.SerializerMethodField()
    staff_id = serializers.CharField(source='staff.staff_id', read_only=True)
    uploaded_by_name = serializers.SerializerMethodField()
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    is_expired = serializers.SerializerMethodField()

    class Meta:
        model = EmployeeDocument
        fields = [
            'id', 'staff', 'staff_id', 'staff_name', 'title', 'category', 'category_display',
            'file', 'description', 'expiry_date', 'is_expired',
            'uploaded_by', 'uploaded_by_name',
            'owner', 'branch', 'created_at', 'updated_at'
        ]
        read_only_fields = ['uploaded_by', 'created_at', 'updated_at']

    def get_staff_name(self, obj):
        if obj.staff.user:
            return obj.staff.user.get_full_name()
        return f"{obj.staff.first_name} {obj.staff.last_name}"

    def get_uploaded_by_name(self, obj):
        return obj.uploaded_by.get_full_name() if obj.uploaded_by else None

    def get_is_expired(self, obj):
        if not obj.expiry_date:
            return False
        from django.utils import timezone
        return obj.expiry_date < timezone.now().date()


# ── Staff IOU Serializers ────────────────────────────────────────────────────

class StaffIOUSerializer(TenantModelSerializer):
    """Read serializer for Staff IOU — list and detail views."""
    staff_name = serializers.SerializerMethodField()
    staff_id_code = serializers.CharField(source='staff.staff_id', read_only=True)
    created_by_name = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    installments_paid = serializers.SerializerMethodField()

    class Meta:
        model = StaffIOU
        fields = [
            'id', 'reference_number', 'staff', 'staff_id_code', 'staff_name',
            'total_amount', 'monthly_installment', 'balance_remaining',
            'start_month', 'reason', 'notes',
            'status', 'status_display', 'cash_disbursed',
            'deduction_type', 'cashier_reconciliation',
            'created_by', 'created_by_name',
            'approved_by', 'approved_by_name', 'approved_at',
            'disbursement_journal',
            'owner', 'branch', 'created_at', 'updated_at',
            'installments_paid',
        ]
        read_only_fields = [
            'reference_number', 'balance_remaining', 'status', 'cash_disbursed',
            'created_by', 'approved_by', 'approved_at',
            'disbursement_journal', 'created_at', 'updated_at',
        ]

    def get_staff_name(self, obj):
        if obj.staff.user:
            return obj.staff.user.get_full_name()
        return f"{obj.staff.first_name} {obj.staff.last_name}"

    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() if obj.created_by else None

    def get_approved_by_name(self, obj):
        return obj.approved_by.get_full_name() if obj.approved_by else None

    def get_installments_paid(self, obj):
        """Number of monthly installments already recovered."""
        from decimal import Decimal
        repaid = obj.total_amount - obj.balance_remaining
        if obj.monthly_installment and obj.monthly_installment > 0:
            return int(repaid / obj.monthly_installment)
        return 0


class StaffIOUCreateSerializer(TenantModelSerializer):
    """Write serializer for creating a new Staff IOU."""

    class Meta:
        model = StaffIOU
        fields = [
            'staff', 'total_amount', 'monthly_installment',
            'start_month', 'reason', 'notes',
            'deduction_type', 'cashier_reconciliation',
        ]

    def validate_total_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Total amount must be greater than zero.")
        return value

    def validate_monthly_installment(self, value):
        if value <= 0:
            raise serializers.ValidationError("Monthly installment must be greater than zero.")
        return value

    def validate(self, data):
        if data.get('monthly_installment') and data.get('total_amount'):
            if data['monthly_installment'] > data['total_amount']:
                raise serializers.ValidationError(
                    "Monthly installment cannot exceed total IOU amount."
                )
        return data


class PayrollStatutoryFilingSerializer(TenantModelSerializer):
    """Serializer for NHF/NSITF statutory filing records."""
    filing_type_display = serializers.CharField(source='get_filing_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    submitted_by_name = serializers.CharField(
        source='submitted_by.get_full_name', read_only=True, default=None
    )

    class Meta:
        model = PayrollStatutoryFiling
        fields = [
            'id', 'reference_number',
            'filing_type', 'filing_type_display',
            'period_start', 'period_end',
            'filing_date', 'remittance_date',
            'total_amount',
            'payrolls',
            'status', 'status_display',
            'agency_reference',
            # Java App 2 integration
            'last_submission_payload', 'last_submission_response', 'last_submitted_at',
            'submitted_by', 'submitted_by_name',
            'notes',
            'owner', 'branch', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'reference_number',
            'filing_type_display', 'status_display', 'submitted_by_name',
            'last_submission_payload', 'last_submission_response', 'last_submitted_at',
            'owner', 'branch', 'created_at', 'updated_at',
        ]
        extra_kwargs = {
            'filing_type': {'required': True},
            'period_start': {'required': True},
            'period_end': {'required': True},
            'total_amount': {'required': True},
        }


class PayrollStatutoryFilingListSerializer(TenantModelSerializer):
    """Lightweight list serializer."""
    filing_type_display = serializers.CharField(source='get_filing_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = PayrollStatutoryFiling
        fields = [
            'id', 'reference_number', 'filing_type', 'filing_type_display',
            'period_start', 'period_end', 'total_amount',
            'status', 'status_display', 'agency_reference',
            'remittance_date', 'created_at',
        ]
        read_only_fields = fields
