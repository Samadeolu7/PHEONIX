# hr/views.py
"""
API views for HR & Payroll management
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import NotFound
from django.db import transaction
from django.utils import timezone
from django.http import FileResponse, HttpResponse
from decimal import Decimal
import logging

from drf_spectacular.utils import extend_schema, OpenApiParameter, OpenApiExample
from drf_spectacular.types import OpenApiTypes

from common.views import ScopedModelViewSet
from common.approval_permissions import IsApprover
from automations.models import WorkflowTemplate, WorkflowRun
from .models import (
    Staff, SalaryComponent, StaffPayInfo, PayrollSchedule,
    LeaveType, LeaveBalance, LeaveRequest,
    Attendance, Payroll, Payslip, BonusDeductionRequest, PensionRemittance,
    EmployeeDocument, PayComponentRemovalRequest, StaffIOU, PayrollStatutoryFiling,
)
from .config_models import HRConfig
from .serializers import (
    HRConfigSerializer, StaffSerializer, SalaryComponentSerializer,
    StaffPayInfoSerializer, PayrollScheduleSerializer,
    LeaveTypeSerializer, LeaveBalanceSerializer, LeaveRequestSerializer,
    AttendanceSerializer, PayrollSerializer, PayrollDetailSerializer,
    PayslipSerializer, BonusDeductionRequestSerializer,
    BonusDeductionRequestCreateSerializer, BonusDeductionRequestApprovalSerializer,
    PensionRemittanceSerializer, EmployeeDocumentSerializer,
    PayComponentRemovalRequestSerializer, PayComponentRemovalRequestCreateSerializer,
    StaffIOUSerializer, StaffIOUCreateSerializer,
    PayrollStatutoryFilingSerializer, PayrollStatutoryFilingListSerializer,
)
from .services.payroll_service import PayrollService
from .services.leave_service import LeaveService
from .services.payslip_generator import PayslipGenerator
from reports.pdf_generators.payslip import PayslipPDFGenerator
from .services.staff_import import StaffImportService
from .services.staff_export import StaffPayrollExportService

logger = logging.getLogger(__name__)


class HRConfigViewSet(viewsets.ModelViewSet):
    """API endpoint for HR configuration"""
    permission_module = 'hr'
    permission_page = 'hr-config'
    serializer_class = HRConfigSerializer
    permission_classes = [IsAuthenticated]
    queryset = HRConfig.objects.none()  # For schema generation
    
    def get_queryset(self):
        # Protect against schema generation with AnonymousUser
        if getattr(self, 'swagger_fake_view', False):
            return HRConfig.objects.none()
        
        return HRConfig.objects.filter(
            owner=self.request.user,
            branch=self.request.user.branch
        )
    
    @action(detail=False, methods=['get'])
    def for_branch(self, request):
        """Get config for current branch"""
        config = HRConfig.get_for_branch(request.user.branch)
        return Response(self.get_serializer(config).data)
    
    @action(detail=False, methods=['get'])
    def available_workflows(self, request):
        """Get available workflow templates"""
        workflows = WorkflowTemplate.objects.filter(
            owner=request.user,
            branch=request.user.branch,
            is_active=True
        )
        return Response({
            'workflows': [
                {
                    'id': w.id,
                    'name': w.name,
                    'run_sequence': w.run_sequence,
                    'description': w.description
                }
                for w in workflows
            ]
        })


class StaffViewSet(ScopedModelViewSet):
    """API endpoint for staff management"""
    permission_module = 'hr'
    permission_page = 'staff'
    queryset = Staff.objects.all()
    serializer_class = StaffSerializer

    def get_object(self):
        """Resolve staff by numeric PK or branch-scoped staff_id in route URLs."""
        queryset = self.filter_queryset(self.get_queryset())
        lookup_url_kwarg = self.lookup_url_kwarg or self.lookup_field
        lookup_value = self.kwargs.get(lookup_url_kwarg)

        if lookup_value is None:
            return super().get_object()

        lookup_str = str(lookup_value)
        if lookup_str.isdigit():
            staff_obj = queryset.filter(pk=int(lookup_str)).first() or queryset.filter(staff_id=lookup_str).first()
        else:
            staff_obj = queryset.filter(staff_id=lookup_str).first()

        if staff_obj is None:
            raise NotFound('Staff not found.')

        self.check_object_permissions(self.request, staff_obj)
        return staff_obj
    
    @action(detail=True, methods=['get'])
    def leave_balances(self, request, pk=None):
        """Get leave balances for staff"""
        staff = self.get_object()
        year = request.query_params.get('year', timezone.now().year)
        
        balances = LeaveBalance.objects.filter(
            staff=staff,
            year=year
        )
        
        serializer = LeaveBalanceSerializer(balances, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'])
    def attendance_summary(self, request, pk=None):
        """Get attendance summary for staff"""
        staff = self.get_object()
        year = int(request.query_params.get('year', timezone.now().year))
        month = request.query_params.get('month')
        
        attendance = Attendance.objects.filter(
            staff=staff,
            date__year=year
        )
        
        if month:
            attendance = attendance.filter(date__month=int(month))
        
        summary = {
            'total_days': attendance.count(),
            'present': attendance.filter(status='present').count(),
            'absent': attendance.filter(status='absent').count(),
            'late': attendance.filter(status='late').count(),
            'on_leave': attendance.filter(status='on_leave').count(),
            'total_hours_worked': sum(
                a.hours_worked or 0 for a in attendance
            ),
            'total_overtime_hours': sum(
                a.overtime_hours or 0 for a in attendance
            )
        }
        
        return Response(summary)

    @action(detail=True, methods=['get'], url_path='salary-components')
    def salary_components(self, request, pk=None):
        """Get all salary components assigned to a staff member"""
        staff = self.get_object()
        pay_infos = StaffPayInfo.objects.filter(staff=staff).select_related('component')
        serializer = StaffPayInfoSerializer(pay_infos, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['post'], url_path='import')
    def import_staff(self, request):
        """
        Bulk-import staff from a payroll Excel spreadsheet (.xlsx).

        The spreadsheet should contain:
          - A header row with at minimum a 'Name' column.
          - Columns for earnings: Basic, Housing, Transport, Entertainment,
            Utility, Lunch, Leave Allow.
          - Columns for deductions: PAYE Deduct, Loan Deductions,
            Pension Deductions, Dev. Levy & Other.
          - Optional info: PAYE PIN, PENSION (PEN number), PFA, Bank,
            Account Number.

        Any rows above the header row (title / blank rows) are automatically
        skipped.  The percentage row immediately after the header (e.g. 16%,
        10%…) is also skipped.

        Returns a JSON summary with created / updated / error counts plus
        per-row details.
        """
        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response(
                {'detail': 'No file provided. Upload an .xlsx file using the "file" field.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        allowed_extensions = ('.xlsx', '.xls')
        filename = getattr(file_obj, 'name', '')
        if not any(filename.lower().endswith(ext) for ext in allowed_extensions):
            return Response(
                {'detail': 'Unsupported file type. Please upload an .xlsx or .xls file.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            service = StaffImportService(
                owner=request.user,
                branch=request.user.branch,
                tenant=getattr(request.user, 'tenant', None),
            )
            result = service.import_from_file(file_obj)
        except (ValueError, RuntimeError) as exc:
            return Response(
                {'detail': str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception as exc:
            logger.exception("Unexpected error during staff import: %s", exc)
            return Response(
                {'detail': 'An unexpected error occurred during import. Check server logs.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        response_data = {
            'summary': {
                'total_rows':   result.total_rows,
                'created':      result.created,
                'updated':      result.updated,
                'skipped':      result.skipped,
                'errors':       result.errors,
                'success':      result.success,
            },
            'rows': [
                {
                    'row':      r.row_number,
                    'name':     r.name,
                    'status':   r.status,
                    'message':  r.message,
                    'staff_id': r.staff_id,
                }
                for r in result.rows
            ],
        }

        http_status = (
            status.HTTP_200_OK if result.success
            else status.HTTP_207_MULTI_STATUS
        )
        return Response(response_data, status=http_status)

    @action(detail=False, methods=['get'], url_path='export-payroll')
    def export_payroll(self, request):
        """
        Download all staff salary data as an Excel (.xlsx) file in the same
        format as the payroll upload template.

        Optional query params:
          ?period=MARCH 2026   – overrides the period label in the heading row
        """
        period = request.query_params.get('period', '')
        queryset = self.get_queryset().prefetch_related('pay_info__component')

        try:
            service = StaffPayrollExportService(
                staff_queryset=queryset,
                period_label=period,
            )
            buffer = service.generate()
        except RuntimeError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        period_slug = (period or service.period_label).replace(' ', '_')
        filename = f'payroll_{period_slug}.xlsx'

        response = HttpResponse(
            buffer.read(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response

    @action(detail=False, methods=['get'], url_path='my-profile')
    def my_profile(self, request):
        """Return the Staff record linked to the currently authenticated user."""
        try:
            staff = Staff.objects.get(user=request.user)
        except Staff.DoesNotExist:
            return Response(
                {'error': 'No staff profile is linked to your account.'},
                status=status.HTTP_404_NOT_FOUND
            )
        serializer = self.get_serializer(staff)
        return Response(serializer.data)


class SalaryComponentViewSet(ScopedModelViewSet):
    """API endpoint for salary components"""
    permission_module = 'hr'
    permission_page = 'salary-components'
    queryset = SalaryComponent.objects.all()
    serializer_class = SalaryComponentSerializer


class StaffPayInfoViewSet(ScopedModelViewSet):
    """API endpoint for staff pay information"""
    permission_module = 'hr'
    permission_page = 'staff-pay-info'
    queryset = StaffPayInfo.objects.all()
    serializer_class = StaffPayInfoSerializer
    
    def get_queryset(self):
        queryset = super().get_queryset()
        staff_id = self.request.query_params.get('staff')
        if staff_id:
            if str(staff_id).isdigit():
                queryset = queryset.filter(staff_id=int(staff_id))
            else:
                queryset = queryset.filter(staff__staff_id=staff_id)
        return queryset


class BonusDeductionRequestViewSet(ScopedModelViewSet):
    """API endpoint for bonus/deduction requests"""
    permission_module = 'hr'
    permission_page = 'bonus-deductions'
    queryset = BonusDeductionRequest.objects.all()
    serializer_class = BonusDeductionRequestSerializer

    def get_permissions(self):
        if self.action in ('approve', 'reject'):
            return [IsAuthenticated(), IsApprover()]
        return super().get_permissions()

    def get_serializer_class(self):
        """Use different serializers for different actions"""
        if self.action == 'create':
            return BonusDeductionRequestCreateSerializer
        elif self.action in ['approve', 'reject']:
            return BonusDeductionRequestApprovalSerializer
        return BonusDeductionRequestSerializer
    
    def get_queryset(self):
        """Filter by query parameters"""
        queryset = super().get_queryset()
        
        # Filter by staff
        staff_id = self.request.query_params.get('staff')
        if staff_id:
            if str(staff_id).isdigit():
                queryset = queryset.filter(staff_id=int(staff_id))
            else:
                queryset = queryset.filter(staff__staff_id=staff_id)
        
        # Filter by status
        status = self.request.query_params.get('status')
        if status:
            queryset = queryset.filter(status=status)
        
        # Filter by month
        for_month = self.request.query_params.get('for_month')
        if for_month:
            queryset = queryset.filter(for_month=for_month)
        
        # Filter by component type (EARNING vs DEDUCTION)
        component_type = self.request.query_params.get('component_type')
        if component_type:
            queryset = queryset.filter(component__component_type=component_type)
        
        # Show only pending for approval view
        pending_only = self.request.query_params.get('pending_only')
        if pending_only == 'true':
            queryset = queryset.filter(status=BonusDeductionRequest.PENDING)
        
        return queryset.select_related('staff', 'component', 'requested_by', 'approved_by')
    
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve a bonus/deduction request"""
        from django.utils import timezone
        from hr.services.bonus_deduction_accounting import post_deduction_advance_journal

        bonus_request = self.get_object()

        # Check if already processed
        if bonus_request.status != BonusDeductionRequest.PENDING:
            return Response(
                {'error': f'Request is already {bonus_request.status.lower()}'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Update status
        bonus_request.status = BonusDeductionRequest.APPROVED
        bonus_request.approved_by = request.user
        bonus_request.approved_date = timezone.now()
        bonus_request.save()

        # Post advance journal for DEDUCTION components that have a GL account mapped
        # AND are flagged as cash advances (is_advance=True).
        # Dr: component.gl_account (Staff IOU)  /  Cr: Bank/Cash
        if (
            bonus_request.component.component_type == 'DEDUCTION'
            and bonus_request.component.gl_account_id
            and bonus_request.component.is_advance
        ):
            try:
                post_deduction_advance_journal(bonus_request, approved_by=request.user)
            except Exception as exc:
                # Journal failure should not block the approval; log and surface as a warning
                import logging
                logging.getLogger(__name__).warning(
                    "Could not post advance journal for BonusDeductionRequest %s: %s",
                    bonus_request.pk, exc
                )

        # Use the main serializer to return the updated instance
        serializer = BonusDeductionRequestSerializer(bonus_request)
        return Response({
            'message': 'Bonus/deduction request approved successfully',
            'data': serializer.data
        })

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """Reject a bonus/deduction request"""
        from django.utils import timezone

        bonus_request = self.get_object()

        
        # Check if already processed
        if bonus_request.status != BonusDeductionRequest.PENDING:
            return Response(
                {'error': f'Request is already {bonus_request.status.lower()}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Validate rejection reason
        serializer = BonusDeductionRequestApprovalSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        # Update status
        bonus_request.status = BonusDeductionRequest.REJECTED
        bonus_request.approved_by = request.user
        bonus_request.approved_date = timezone.now()
        bonus_request.rejection_reason = serializer.validated_data.get('rejection_reason', '')
        bonus_request.save()
        
        # Use the main serializer to return the updated instance
        response_serializer = BonusDeductionRequestSerializer(bonus_request)
        return Response({
            'message': 'Bonus/deduction request rejected',
            'data': response_serializer.data
        })
    
    @action(detail=False, methods=['get'])
    def pending_count(self, request):
        """Get count of pending requests"""
        count = self.get_queryset().filter(status=BonusDeductionRequest.PENDING).count()
        return Response({'count': count})
    
    @action(detail=False, methods=['get'])
    def my_requests(self, request):
        """Get requests created by current user"""
        queryset = self.get_queryset().filter(requested_by=request.user)
        
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)


class PayrollScheduleViewSet(ScopedModelViewSet):
    """API endpoint for payroll schedules"""
    permission_module = 'hr'
    permission_page = 'payroll-schedules'
    queryset = PayrollSchedule.objects.all()
    serializer_class = PayrollScheduleSerializer


class LeaveTypeViewSet(ScopedModelViewSet):
    """API endpoint for leave types"""
    permission_module = 'hr'
    permission_page = 'leave-types'
    queryset = LeaveType.objects.all()
    serializer_class = LeaveTypeSerializer
    
    def perform_create(self, serializer):
        """Create leave type with auto-generated code"""
        from django.db import IntegrityError
        from rest_framework.exceptions import ValidationError
        import re
        
        # Generate code from name
        name = serializer.validated_data.get('name', '')
        base_code = re.sub(r'[^A-Z]', '', name.upper())[:4]  # Take first 4 uppercase letters
        
        if not base_code:
            # If no uppercase letters, use first 4 characters
            base_code = re.sub(r'[^A-Za-z0-9]', '', name)[:4].upper()
        
        if not base_code:
            base_code = 'LVE'  # Default fallback
        
        # Try to find unique code
        max_attempts = 100
        code = base_code
        
        for attempt in range(max_attempts):
            if attempt > 0:
                code = f"{base_code}{attempt}"
            
            # Check if code exists for this branch
            if not LeaveType.objects.filter(
                code=code,
                branch=self.request.user.branch
            ).exists():
                try:
                    serializer.save(
                        code=code,
                        owner=self.request.user,
                        branch=self.request.user.branch
                    )
                    return
                except IntegrityError as e:
                    if 'code' in str(e) and attempt < max_attempts - 1:
                        continue
                    raise ValidationError({
                        'code': 'Failed to generate unique code. Please try again.'
                    })
        
        raise ValidationError({
            'code': 'Unable to generate unique code after multiple attempts.'
        })


class LeaveBalanceViewSet(ScopedModelViewSet):
    """API endpoint for leave balances"""
    permission_module = 'hr'
    permission_page = 'leave-balances'
    queryset = LeaveBalance.objects.select_related('staff', 'staff__user', 'leave_type').all()
    serializer_class = LeaveBalanceSerializer
    filterset_fields = ['staff', 'leave_type', 'year']
    ordering_fields = ['year', 'staff__first_name', 'leave_type__name']
    ordering = ['-year', 'staff__first_name']
    
    def get_queryset(self):
        queryset = super().get_queryset()
        staff_id = self.request.query_params.get('staff')
        year = self.request.query_params.get('year')
        leave_type_id = self.request.query_params.get('leave_type')
        
        if staff_id:
            if str(staff_id).isdigit():
                queryset = queryset.filter(staff_id=int(staff_id))
            else:
                queryset = queryset.filter(staff__staff_id=staff_id)
        if year:
            queryset = queryset.filter(year=int(year))
        if leave_type_id:
            queryset = queryset.filter(leave_type_id=leave_type_id)
        
        # Ensure we always return the most recent data
        return queryset.order_by('-year', 'staff__first_name', 'leave_type__name')
    
    @action(detail=False, methods=['post'])
    def initialize_for_year(self, request):
        """Initialize leave balances for all staff for a given year"""
        from hr.models import LeaveType
        from hr.signals import create_default_leave_types
        
        year = request.data.get('year', timezone.now().year)
        staff_list = request.data.get('staff_ids', [])
        
        # Check if leave types exist first
        leave_types = LeaveType.objects.filter(
            branch=request.user.branch,
            is_deleted=False
        )
        leave_types_count = leave_types.count()
        
        if leave_types_count == 0:
            # Auto-create default leave types
            try:
                created_types = create_default_leave_types(
                    branch=request.user.branch,
                    owner=request.user,
                    tenant=getattr(request.user, 'tenant', None)
                )
                leave_types_count = len(created_types)
                
                if leave_types_count == 0:
                    return Response(
                        {'error': 'Failed to create default leave types. Please create leave types manually.'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
            except Exception as e:
                return Response(
                    {'error': f'Failed to create default leave types: {str(e)}'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        
        # Get staff list - use scoped queryset to respect tenant/branch
        if not staff_list:
            staff_queryset = Staff.objects.filter(
                branch=request.user.branch,
                is_deleted=False
            )
        else:
            staff_queryset = Staff.objects.filter(
                id__in=staff_list,
                branch=request.user.branch,
                is_deleted=False
            )
        
        staff_count = staff_queryset.count()
        
        if staff_count == 0:
            return Response(
                {'error': 'No staff found to initialize leave balances for.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        created_count = 0
        total_balances = 0
        errors = []
        
        for staff in staff_queryset:
            try:
                balances = LeaveService.initialize_leave_balances(staff, year)
                if balances:
                    created_count += 1
                    total_balances += len(balances)
            except Exception as e:
                # Log error but continue processing
                error_msg = f"Error initializing balances for {staff.first_name} {staff.last_name}: {str(e)}"
                print(error_msg)
                errors.append(error_msg)
                continue
        
        response_data = {
            'message': f'Initialized leave balances for {created_count} out of {staff_count} staff members',
            'year': year,
            'total_balances_created': total_balances,
            'leave_types_available': leave_types_count,
            'staff_processed': created_count,
            'staff_total': staff_count,
        }
        
        if errors:
            response_data['errors'] = errors[:5]  # Return first 5 errors
            response_data['error_count'] = len(errors)
        
        return Response(response_data)
    
    @action(detail=False, methods=['get'])
    def audit_integrity(self, request):
        """Audit leave balance data integrity - find orphaned leave requests"""
        from collections import defaultdict
        
        # Get all leave requests for this branch
        leave_requests = LeaveRequest.objects.filter(
            branch=request.user.branch,
            is_deleted=False
        ).select_related('staff', 'leave_type')
        
        orphaned_requests = []
        insufficient_balance = []
        
        for lr in leave_requests:
            year = lr.start_date.year
            
            # Check if balance exists
            balance = LeaveBalance.objects.filter(
                staff=lr.staff,
                leave_type=lr.leave_type,
                year=year,
                is_deleted=False
            ).first()
            
            if not balance:
                orphaned_requests.append({
                    'id': lr.id,
                    'reference_number': lr.reference_number,
                    'staff': {
                        'id': lr.staff.id,
                        'name': f"{lr.staff.first_name} {lr.staff.last_name}"
                    },
                    'leave_type': {
                        'id': lr.leave_type.id,
                        'name': lr.leave_type.name
                    },
                    'start_date': lr.start_date.isoformat(),
                    'end_date': lr.end_date.isoformat(),
                    'num_days': float(lr.num_days),
                    'status': lr.status,
                    'year': year
                })
            elif not balance.has_sufficient_balance(lr.num_days):
                insufficient_balance.append({
                    'id': lr.id,
                    'reference_number': lr.reference_number,
                    'staff': {
                        'id': lr.staff.id,
                        'name': f"{lr.staff.first_name} {lr.staff.last_name}"
                    },
                    'requested': float(lr.num_days),
                    'available': float(balance.available_days)
                })
        
        # Group orphaned by staff
        by_staff = defaultdict(list)
        for item in orphaned_requests:
            by_staff[item['staff']['id']].append(item)
        
        return Response({
            'total_requests': leave_requests.count(),
            'orphaned_count': len(orphaned_requests),
            'insufficient_balance_count': len(insufficient_balance),
            'orphaned_requests': orphaned_requests,
            'insufficient_balance': insufficient_balance,
            'by_staff': {
                staff_id: {
                    'staff_name': items[0]['staff']['name'],
                    'request_count': len(items),
                    'requests': items
                }
                for staff_id, items in by_staff.items()
            },
            'severity': 'critical' if orphaned_requests else 'ok',
            'message': f"Found {len(orphaned_requests)} orphaned leave requests without balances" if orphaned_requests 
                      else "All leave requests have corresponding balances"
        })

    @action(detail=False, methods=['get'], url_path='my-balances')
    def my_balances(self, request):
        """Return leave balances for the authenticated user's staff profile."""
        try:
            staff = Staff.objects.get(user=request.user)
        except Staff.DoesNotExist:
            return Response(
                {'error': 'No staff profile linked to your account.'},
                status=status.HTTP_404_NOT_FOUND
            )
        year = request.query_params.get('year', timezone.now().year)
        balances = self.get_queryset().filter(staff=staff, year=year)
        serializer = self.get_serializer(balances, many=True)
        return Response(serializer.data)


class LeaveRequestViewSet(ScopedModelViewSet):
    """API endpoint for leave requests"""
    permission_module = 'hr'
    permission_page = 'leave-requests'
    queryset = LeaveRequest.objects.all()
    serializer_class = LeaveRequestSerializer

    def get_permissions(self):
        if self.action in ('approve', 'reject'):
            return [IsAuthenticated(), IsApprover()]
        return super().get_permissions()

    def get_queryset(self):
        queryset = super().get_queryset()
        staff_id = self.request.query_params.get('staff')
        status_filter = self.request.query_params.get('status')
        
        if staff_id:
            if str(staff_id).isdigit():
                queryset = queryset.filter(staff_id=int(staff_id))
            else:
                queryset = queryset.filter(staff__staff_id=staff_id)
        if status_filter:
            queryset = queryset.filter(status=status_filter)

        # Date-range filtering for calendar views
        start_date = self.request.query_params.get('start_date')
        end_date = self.request.query_params.get('end_date')
        if start_date:
            queryset = queryset.filter(end_date__gte=start_date)
        if end_date:
            queryset = queryset.filter(start_date__lte=end_date)

        department = self.request.query_params.get('department')
        if department:
            queryset = queryset.filter(staff__department_id=department)

        leave_type = self.request.query_params.get('leave_type')
        if leave_type:
            queryset = queryset.filter(leave_type_id=leave_type)
        
        return queryset.order_by('-created_at')

    @action(detail=False, methods=['get'])
    def calendar(self, request):
        """Return leave requests for a date range, unpaginated, for calendar rendering."""
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')

        if not start_date or not end_date:
            return Response(
                {'error': 'start_date and end_date query params are required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        queryset = self.get_queryset().filter(
            end_date__gte=start_date,
            start_date__lte=end_date,
            status__in=['approved', 'taken', 'submitted']
        ).select_related('staff', 'leave_type')

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)
    
    def perform_create(self, serializer):
        """Auto-generate reference number and register it in tracking system"""
        from common.services.reference_service import ReferenceService
        
        # Get tenant from user
        user = self.request.user
        tenant = getattr(user, 'tenant', user)
        
        # Generate unique reference_number
        reference_number = ReferenceService.generate_reference(
            module='hr',
            model_name='leave_request',
            tenant=tenant,
            branch=user.branch
        )
        
        # Save the leave request
        leave_request = serializer.save(
            reference_number=reference_number,
            owner=user,
            branch=user.branch,
            tenant=tenant
        )
        
        # CRITICAL: Register the reference number in tracking table
        # Without this, the next leave request will get the same number!
        ReferenceService.register_reference(
            reference_number=reference_number,
            module='hr',
            model_name='leave_request',
            object_id=leave_request.id,
            tenant=tenant,
            branch=user.branch,
            created_by=user,
            status=leave_request.status,
            amount=0.0,  # Leave requests don't have amounts
            metadata={
                'staff_id': leave_request.staff_id,
                'leave_type_code': leave_request.leave_type.code if leave_request.leave_type else None,
                'start_date': leave_request.start_date.isoformat() if leave_request.start_date else None,
                'end_date': leave_request.end_date.isoformat() if leave_request.end_date else None,
                'num_days': str(leave_request.num_days) if leave_request.num_days else None
            }
        )
    
    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        """Submit leave request for approval"""
        leave_request = self.get_object()
        
        if leave_request.status != 'draft':
            return Response(
                {'error': 'Only draft leave requests can be submitted'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            service = LeaveService(leave_request)
            service.submit_leave_request()
            
            return Response(self.get_serializer(leave_request).data)
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve leave request"""
        leave_request = self.get_object()
        
        if leave_request.status != 'submitted':
            return Response(
                {'error': 'Only submitted leave requests can be approved'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        notes = request.data.get('notes', '')
        
        try:
            service = LeaveService(leave_request)
            service.approve_leave_request(
                approved_by=request.user,
                notes=notes
            )
            
            return Response(self.get_serializer(leave_request).data)
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """Reject leave request"""
        leave_request = self.get_object()
        
        if leave_request.status not in ['submitted', 'draft']:
            return Response(
                {'error': 'Cannot reject this leave request'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        reason = request.data.get('reason', '')
        if not reason:
            return Response(
                {'error': 'Rejection reason is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            service = LeaveService(leave_request)
            service.reject_leave_request(
                rejected_by=request.user,
                reason=reason
            )
            
            return Response(self.get_serializer(leave_request).data)
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Cancel leave request"""
        leave_request = self.get_object()
        
        if leave_request.status in ['cancelled', 'taken']:
            return Response(
                {'error': 'Cannot cancel this leave request'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        leave_request.status = 'cancelled'
        leave_request.save()
        
        return Response(self.get_serializer(leave_request).data)

    @action(detail=False, methods=['get'], url_path='my-leave-requests')
    def my_leave_requests(self, request):
        """Return leave requests for the authenticated user's staff profile."""
        try:
            staff = Staff.objects.get(user=request.user)
        except Staff.DoesNotExist:
            return Response(
                {'error': 'No staff profile linked to your account.'},
                status=status.HTTP_404_NOT_FOUND
            )
        leaves = self.get_queryset().filter(staff=staff).order_by('-created_at')
        serializer = self.get_serializer(leaves, many=True)
        return Response(serializer.data)


class AttendanceViewSet(ScopedModelViewSet):
    """API endpoint for attendance records"""
    permission_module = 'hr'
    permission_page = 'attendance'
    queryset = Attendance.objects.all()
    serializer_class = AttendanceSerializer
    
    def get_queryset(self):
        queryset = super().get_queryset()
        staff_id = self.request.query_params.get('staff')
        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')
        
        if staff_id:
            if str(staff_id).isdigit():
                queryset = queryset.filter(staff_id=int(staff_id))
            else:
                queryset = queryset.filter(staff__staff_id=staff_id)
        if date_from:
            queryset = queryset.filter(date__gte=date_from)
        if date_to:
            queryset = queryset.filter(date__lte=date_to)
        
        return queryset.order_by('-date')
    
    def create(self, request, *args, **kwargs):
        """Create or update attendance record (upsert behavior)"""
        staff_id = request.data.get('staff')
        date = request.data.get('date')
        
        if not staff_id or not date:
            return super().create(request, *args, **kwargs)
        
        # Check if record exists
        try:
            attendance = Attendance.objects.get(
                staff_id=staff_id,
                date=date,
                owner=request.user,
                branch=request.user.branch
            )
            # Update existing record
            serializer = self.get_serializer(attendance, data=request.data, partial=False)
            serializer.is_valid(raise_exception=True)
            self.perform_update(serializer)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Attendance.DoesNotExist:
            # Create new record
            return super().create(request, *args, **kwargs)
    
    @action(detail=False, methods=['post'])
    def clock_in(self, request):
        """Clock in for attendance with GPS validation"""
        from hr.utils import validate_attendance_location
        
        staff_id = request.data.get('staff')
        date = request.data.get('date', timezone.now().date())
        latitude = request.data.get('latitude')
        longitude = request.data.get('longitude')
        
        if not staff_id:
            return Response(
                {'error': 'Staff ID is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Validate GPS location if branch has coordinates configured
        branch = request.user.branch
        is_valid, distance, message = validate_attendance_location(
            branch, latitude, longitude
        )
        
        if not is_valid:
            return Response(
                {
                    'error': message,
                    'distance': f"{distance:.2f}" if distance else None,
                    'requires_gps': True
                },
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Check if already clocked in today
        existing = Attendance.objects.filter(
            staff_id=staff_id,
            date=date,
            owner=request.user,
            branch=request.user.branch
        ).first()
        
        if existing:
            if existing.clock_in:
                return Response(
                    {'error': 'Already clocked in today'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            existing.clock_in = timezone.now().time()
            existing.status = 'present'
            existing.save()
            return Response(self.get_serializer(existing).data)
        
        # Create new attendance record
        attendance = Attendance.objects.create(
            tenant=getattr(request.user, 'tenant', None),
            staff_id=staff_id,
            date=date,
            clock_in=timezone.now().time(),
            status='present',
            owner=request.user,
            branch=request.user.branch
        )
        
        return Response(
            self.get_serializer(attendance).data,
            status=status.HTTP_201_CREATED
        )
    
    @action(detail=False, methods=['post'])
    def clock_out(self, request):
        """Clock out for attendance with GPS validation"""
        from hr.utils import validate_attendance_location
        
        staff_id = request.data.get('staff')
        date = request.data.get('date', timezone.now().date())
        latitude = request.data.get('latitude')
        longitude = request.data.get('longitude')
        
        if not staff_id:
            return Response(
                {'error': 'Staff ID is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Validate GPS location if branch has coordinates configured
        branch = request.user.branch
        is_valid, distance, message = validate_attendance_location(
            branch, latitude, longitude
        )
        
        if not is_valid:
            return Response(
                {
                    'error': message,
                    'distance': f"{distance:.2f}" if distance else None,
                    'requires_gps': True
                },
                status=status.HTTP_400_BAD_REQUEST
            )
        
        attendance = Attendance.objects.filter(
            staff_id=staff_id,
            date=date,
            owner=request.user,
            branch=request.user.branch
        ).first()
        
        if not attendance:
            return Response(
                {'error': 'No clock-in record found for today'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        if not attendance.clock_in:
            return Response(
                {'error': 'Must clock in first'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if attendance.clock_out:
            return Response(
                {'error': 'Already clocked out'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        attendance.clock_out = timezone.now().time()
        attendance.save()
        
        return Response(self.get_serializer(attendance).data)

    @action(detail=False, methods=['get'], url_path='my-attendance')
    def my_attendance(self, request):
        """Return attendance records for the authenticated user's staff profile."""
        try:
            staff = Staff.objects.get(user=request.user)
        except Staff.DoesNotExist:
            return Response(
                {'error': 'No staff profile linked to your account.'},
                status=status.HTTP_404_NOT_FOUND
            )
        records = self.get_queryset().filter(staff=staff).order_by('-date')[:60]
        serializer = self.get_serializer(records, many=True)
        return Response(serializer.data)


class PayrollViewSet(ScopedModelViewSet):
    """API endpoint for payroll management"""
    permission_module = 'hr'
    permission_page = 'payroll'
    queryset = Payroll.objects.all()

    def get_permissions(self):
        if self.action in ('approve',):
            return [IsAuthenticated(), IsApprover()]
        return super().get_permissions()

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return PayrollDetailSerializer
        return PayrollSerializer
    
    def get_queryset(self):
        queryset = super().get_queryset().prefetch_related('payslips')
        status_filter = self.request.query_params.get('status')

        if status_filter:
            queryset = queryset.filter(status=status_filter)

        return queryset.order_by('-created_at')
    
    def perform_create(self, serializer):
        """Auto-generate reference number and register it in tracking system"""
        from common.services.reference_service import ReferenceService
        
        # Get tenant from user
        user = self.request.user
        tenant = getattr(user, 'tenant', user)
        
        # Generate unique reference_number
        reference_number = ReferenceService.generate_reference(
            module='hr',
            model_name='payroll',
            tenant=tenant,
            branch=user.branch
        )
        
        # Save the payroll
        payroll = serializer.save(
            reference_number=reference_number,
            owner=user,
            branch=user.branch,
            tenant=tenant
        )
        
        # CRITICAL: Register the reference number in tracking table
        # Without this, the next payroll will get the same number!
        ReferenceService.register_reference(
            reference_number=reference_number,
            module='hr',
            model_name='payroll',
            object_id=payroll.id,
            tenant=tenant,
            branch=user.branch,
            created_by=user,
            status=payroll.status,
            amount=float(payroll.total_net_pay) if payroll.total_net_pay else 0.0,
            metadata={
                'period_start': payroll.period_start.isoformat() if payroll.period_start else None,
                'period_end': payroll.period_end.isoformat() if payroll.period_end else None,
                'pay_date': payroll.pay_date.isoformat() if payroll.pay_date else None,
                'total_gross_pay': str(payroll.total_gross_pay) if payroll.total_gross_pay else '0',
                'total_deductions': str(payroll.total_deductions) if payroll.total_deductions else '0'
            }
        )
    
    @action(detail=True, methods=['post'])
    def calculate(self, request, pk=None):
        """Calculate payroll for the period"""
        payroll = self.get_object()
        
        if payroll.status != 'draft':
            return Response(
                {'error': 'Only draft payroll can be calculated'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        staff_ids = request.data.get('staff_ids', [])
        
        try:
            service = PayrollService(payroll)
            service.calculate_payroll(
                staff_list=staff_ids if staff_ids else None
            )
            
            payroll.refresh_from_db()
            return Response(
                PayrollDetailSerializer(payroll).data
            )
        except Exception as e:
            logger.error(f"Payroll calculation failed: {str(e)}")
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=True, methods=['post'])
    def recalculate(self, request, pk=None):
        """
        Recalculate a payroll that is still in draft or calculated status.

        Deletes all existing payslips for this payroll run, un-marks any
        BonusDeductionRequests that were applied in this run, resets payroll
        totals to zero, and runs a fresh calculation.

        This is the correct fix when the payroll was calculated before new data
        (e.g. Staff IOUs, bonus/deduction requests) was added.

        Optional body param:
          staff_ids  — list of staff IDs to recalculate (defaults to all staff)
        """
        from django.utils import timezone as tz
        from hr.models import Payslip, BonusDeductionRequest
        from decimal import Decimal

        payroll = self.get_object()
        if payroll.status not in ('draft', 'calculated'):
            return Response(
                {'error': f'Can only recalculate draft or calculated payrolls. Current status: {payroll.status}.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        staff_ids = request.data.get('staff_ids', [])
        ref = payroll.reference_number
        logger.info("[recalculate] %s — starting (staff_ids=%s)", ref, staff_ids or 'all')

        # Step 1: Un-apply BonusDeductionRequests linked to this payroll
        unapplied = BonusDeductionRequest.objects.filter(applied_in_payroll=payroll).update(
            applied_in_payroll=None
        )
        logger.info("[recalculate] %s — un-applied %d bonus/deduction request(s)", ref, unapplied)

        # Step 2: Hard-delete ALL payslips (including previously soft-deleted ones
        # from failed recalculate attempts).  MUST use all_objects — the default
        # manager filters is_deleted=True rows, which would leave soft-deleted rows
        # in place and cause IntegrityError on create (→ TransactionManagementError).
        deleted_count, _ = Payslip.all_objects.filter(payroll=payroll).hard_delete()
        logger.info("[recalculate] %s — hard-deleted %d payslip row(s)", ref, deleted_count)

        # Step 3: Reset payroll totals and status to draft
        payroll.total_gross_pay        = Decimal('0.00')
        payroll.total_deductions       = Decimal('0.00')
        payroll.total_net_pay          = Decimal('0.00')
        payroll.total_employee_pension = Decimal('0.00')
        payroll.total_employer_pension = Decimal('0.00')
        payroll.status = 'draft'
        payroll.save()
        logger.info("[recalculate] %s — payroll reset to draft", ref)

        # Step 4: Run fresh calculation
        try:
            service = PayrollService(payroll)
            summary = service.calculate_payroll(
                staff_list=staff_ids if staff_ids else None
            )
            logger.info(
                "[recalculate] %s — done: %d payslip(s) created, gross=%.2f, net=%.2f",
                ref,
                summary.get('payslips_created', 0),
                summary.get('total_gross_pay', 0),
                summary.get('total_net_pay', 0),
            )
            payroll.refresh_from_db()
            return Response(PayrollDetailSerializer(payroll).data)
        except Exception as e:
            logger.error(
                "[recalculate] %s — FAILED: %s",
                ref, str(e),
                exc_info=True,   # <-- full traceback with file + line number
            )
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

    @extend_schema(
        summary="Approve calculated payroll",
        description="Approve a calculated payroll. Records the approver, posts liability journal entries, and changes status to 'approved'.",
        responses={
            200: {
                'type': 'object',
                'properties': {
                    'message': {'type': 'string'},
                    'approval_level': {'type': 'string'},
                    'payroll': {'type': 'object'},
                    'liability_entry': {'type': 'string'}
                }
            }
        }
    )
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve calculated payroll"""
        payroll = self.get_object()

        if payroll.status != 'calculated':
            return Response(
                {'error': 'Only calculated payroll can be approved'},
                status=status.HTTP_400_BAD_REQUEST
            )

        from django.utils import timezone

        # Record the approver and delegate status + accounting to the service
        payroll.first_approver = request.user
        payroll.first_approved_at = timezone.now()
        payroll.approved_at = timezone.now()
        payroll.approved_by = request.user
        payroll.save()

        try:
            from hr.services.payroll_service import PayrollService
            service = PayrollService(payroll)
            service.approve_payroll(approved_by=request.user)
            payroll.refresh_from_db()
            liability_entry = payroll.liabilities_journal_entry
            logger.info(
                f"Payroll {payroll.reference_number} approved. "
                f"Liability JE: {liability_entry.reference_number if liability_entry else 'N/A'}"
            )
        except Exception as e:
            logger.error(f"Failed to approve payroll {payroll.reference_number}: {str(e)}")
            # Roll back approver fields
            payroll.first_approver = None
            payroll.first_approved_at = None
            payroll.approved_at = None
            payroll.approved_by = None
            payroll.save()
            return Response(
                {'error': f'Failed to create accounting entry: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        return Response({
            'message': 'Payroll approved and moved to liabilities.',
            'approval_level': 'first',
            'payroll': self.get_serializer(payroll).data,
            'liability_entry': liability_entry.reference_number if liability_entry else None,
        })
    
    @extend_schema(
        summary="Process payroll payment",
        description="Process approved payroll by creating accounting journal entries and marking as paid. "
                    "This creates salary expense, tax payable, and cash/bank entries.",
        request={
            'application/json': {
                'type': 'object',
                'properties': {
                    'payment_account_id': {
                        'type': 'integer',
                        'description': 'ID of the bank/cash account to use for payment (optional)'
                    }
                }
            }
        },
        responses={
            200: {
                'type': 'object',
                'properties': {
                    'payroll': {'type': 'object'},
                    'journal_entry': {'type': 'string'},
                    'message': {'type': 'string'}
                }
            }
        }
    )
    @action(detail=True, methods=['post'])
    def process(self, request, pk=None):
        """Process approved payroll (mark as paid) with accounting entries"""
        payroll = self.get_object()
        
        if payroll.status != 'approved':
            return Response(
                {'error': 'Only approved payroll can be processed'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get optional payment account from request
        payment_account_id = request.data.get('payment_account_id')
        payment_account = None
        
        if payment_account_id:
            try:
                from accounts.models import Account
                payment_account = Account.objects.get(
                    id=payment_account_id,
                    branch=request.user.branch
                )
            except Account.DoesNotExist:
                return Response(
                    {'error': 'Invalid payment account'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        
        try:
            service = PayrollService(payroll)
            payroll, journal_entry = service.mark_as_paid(
                processed_by=request.user,
                payment_account=payment_account
            )
            
            return Response({
                'payroll': self.get_serializer(payroll).data,
                'journal_entry': journal_entry.reference_number if journal_entry else None,
                'message': 'Payroll processed successfully with accounting entries'
            })
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @extend_schema(
        summary="Mark payroll as paid",
        description="Mark approved payroll as paid by creating accounting journal entries. "
                    "This is an alias for the process endpoint.",
        request={
            'application/json': {
                'type': 'object',
                'properties': {
                    'payment_account_id': {
                        'type': 'integer',
                        'description': 'ID of the bank/cash account to use for payment (optional)'
                    }
                }
            }
        },
        responses={
            200: {
                'type': 'object',
                'properties': {
                    'payroll': {'type': 'object'},
                    'journal_entry': {'type': 'string'},
                    'message': {'type': 'string'}
                }
            }
        }
    )
    @action(detail=True, methods=['post'])
    def mark_paid(self, request, pk=None):
        """Mark payroll as paid with accounting entries (alias for process)"""
        payroll = self.get_object()
        
        if payroll.status != 'approved':
            return Response(
                {'error': 'Only approved payroll can be marked as paid'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get optional payment account from request
        payment_account_id = request.data.get('payment_account_id')
        payment_account = None
        
        if payment_account_id:
            try:
                from accounts.models import Account
                payment_account = Account.objects.get(
                    id=payment_account_id,
                    branch=request.user.branch
                )
            except Account.DoesNotExist:
                return Response(
                    {'error': 'Invalid payment account'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        
        try:
            service = PayrollService(payroll)
            payroll, journal_entry = service.mark_as_paid(
                processed_by=request.user,
                payment_account=payment_account
            )
            
            return Response({
                'payroll': self.get_serializer(payroll).data,
                'journal_entry': journal_entry.reference_number if journal_entry else None,
                'message': 'Payroll marked as paid with accounting entries'
            })
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def generate_payslips(self, request, pk=None):
        """Generate PDF payslips for all staff"""
        payroll = self.get_object()
        
        if payroll.status not in ['approved', 'paid']:
            return Response(
                {'error': 'Payroll must be approved before generating payslips'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            service = PayrollService(payroll)
            generated_count = service.generate_payslips_pdf()
            
            return Response({
                'message': f'Generated {generated_count} payslips',
                'payroll': self.get_serializer(payroll).data
            })
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @extend_schema(
        summary="Download bank transfer file",
        description=(
            "Generate a CSV file for bulk bank transfers based on the payslips "
            "in this payroll run. Each row contains employee name, bank, account number, "
            "and net pay amount. Only available for approved or paid payroll."
        ),
        responses={
            200: {
                'type': 'string',
                'format': 'binary',
                'description': 'CSV file download'
            }
        }
    )
    @action(detail=True, methods=['get'], url_path='download_bank_file')
    def download_bank_file(self, request, pk=None):
        """Generate a bank transfer CSV file from payslips."""
        import csv

        payroll = self.get_object()

        if payroll.status not in ('approved', 'paid'):
            return Response(
                {'error': 'Payroll must be approved or paid to generate bank file'},
                status=status.HTTP_400_BAD_REQUEST
            )

        payslips = (
            payroll.payslips
            .select_related('staff')
            .filter(net_pay__gt=0)
            .order_by('staff__first_name', 'staff__last_name')
        )

        response = HttpResponse(content_type='text/csv')
        filename = f"bank_transfer_{payroll.payroll_number}.csv"
        response['Content-Disposition'] = f'attachment; filename="{filename}"'

        writer = csv.writer(response)
        writer.writerow([
            'S/N',
            'Staff ID',
            'Employee Name',
            'Bank Name',
            'Account Number',
            'Gross Pay',
            'PAYE Tax',
            'Employee Pension',
            'Staff IOU Deduction',
            'Other Deductions',
            'Total Deductions',
            'Net Pay',
            'Narration',
        ])

        total_gross = Decimal('0.00')
        total_net = Decimal('0.00')
        total_paye = Decimal('0.00')
        total_pension = Decimal('0.00')
        total_iou = Decimal('0.00')
        total_other = Decimal('0.00')
        total_deductions = Decimal('0.00')

        for idx, slip in enumerate(payslips, start=1):
            staff = slip.staff
            full_name = f"{staff.first_name} {staff.last_name}".strip()
            narration = f"Salary {payroll.period_start.strftime('%b %Y')} - {full_name}"
            deductions = slip.deductions or {}
            iou_deduction = Decimal(str(deductions.get('Staff IOU', 0) or 0))
            other_ded = sum(
                Decimal(str(v or 0))
                for k, v in deductions.items()
                if k != 'Staff IOU'
            )
            writer.writerow([
                idx,
                staff.staff_id,
                full_name,
                staff.bank_name or '',
                staff.bank_account_number or '',
                str(slip.gross_pay),
                str(slip.tax),
                str(slip.employee_pension),
                str(iou_deduction),
                str(other_ded),
                str(slip.total_deductions),
                str(slip.net_pay),
                narration,
            ])
            total_gross      += slip.gross_pay
            total_net        += slip.net_pay
            total_paye       += slip.tax
            total_pension    += slip.employee_pension
            total_iou        += iou_deduction
            total_other      += other_ded
            total_deductions += slip.total_deductions

        # Summary row
        writer.writerow([])
        writer.writerow([
            '', '', '', '', 'TOTAL',
            str(total_gross),
            str(total_paye),
            str(total_pension),
            str(total_iou),
            str(total_other),
            str(total_deductions),
            str(total_net),
            '',
        ])

        return response

    @extend_schema(
        summary="Get personnel changes report",
        description="Get consolidated report of personnel changes for a payroll period. "
                    "Shows new hires, terminations, leave taken, and overtime hours.",
        parameters=[
            {
                'name': 'period_start',
                'in': 'query',
                'required': True,
                'schema': {'type': 'string', 'format': 'date'},
                'description': 'Start date of payroll period (YYYY-MM-DD)'
            },
            {
                'name': 'period_end',
                'in': 'query',
                'required': True,
                'schema': {'type': 'string', 'format': 'date'},
                'description': 'End date of payroll period (YYYY-MM-DD)'
            }
        ],
        responses={
            200: {
                'type': 'object',
                'properties': {
                    'period_start': {'type': 'string'},
                    'period_end': {'type': 'string'},
                    'new_hires': {'type': 'array'},
                    'terminations': {'type': 'array'},
                    'leave_taken': {'type': 'array'},
                    'overtime': {'type': 'array'},
                    'summary': {'type': 'object'}
                }
            }
        }
    )
    @action(detail=False, methods=['get'])
    def personnel_changes_report(self, request):
        """Get personnel changes report for a period"""
        from datetime import datetime
        from django.db.models import Sum, Q
        
        period_start = request.query_params.get('period_start')
        period_end = request.query_params.get('period_end')
        
        if not period_start or not period_end:
            return Response(
                {'error': 'Both period_start and period_end are required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            period_start_date = datetime.strptime(period_start, '%Y-%m-%d').date()
            period_end_date = datetime.strptime(period_end, '%Y-%m-%d').date()
        except ValueError:
            return Response(
                {'error': 'Invalid date format. Use YYYY-MM-DD'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        branch = request.user.branch
        
        # New hires - staff created during period
        new_hires = Staff.objects.filter(
            branch=branch,
            created_at__gte=period_start_date,
            created_at__lte=period_end_date,
            is_deleted=False
        ).values(
            'id', 'first_name', 'last_name', 'position', 
            'department', 'created_at'
        )
        
        # Terminations - staff soft-deleted during period
        terminations = Staff.objects.filter(
            branch=branch,
            is_deleted=True,
            updated_at__gte=period_start_date,
            updated_at__lte=period_end_date
        ).values(
            'id', 'first_name', 'last_name', 'position', 
            'department', 'updated_at'
        )
        
        # Leave taken - approved leave requests during period
        leave_requests = LeaveRequest.objects.filter(
            branch=branch,
            status='approved',
            start_date__lte=period_end_date,
            end_date__gte=period_start_date
        ).select_related('staff', 'leave_type').values(
            'id', 'staff__first_name', 'staff__last_name',
            'leave_type__name', 'start_date', 'end_date', 'num_days'
        )
        
        # Overtime - attendance with overtime hours during period
        overtime_records = Attendance.objects.filter(
            branch=branch,
            date__gte=period_start_date,
            date__lte=period_end_date,
            overtime_hours__gt=0
        ).select_related('staff').values(
            'staff__id', 'staff__first_name', 'staff__last_name'
        ).annotate(
            total_overtime_hours=Sum('overtime_hours')
        )
        
        # Summary statistics
        total_leave_days = sum(lr['num_days'] for lr in leave_requests)
        total_overtime_hours = sum(
            float(ot['total_overtime_hours'] or 0) 
            for ot in overtime_records
        )
        
        return Response({
            'period_start': period_start,
            'period_end': period_end,
            'new_hires': list(new_hires),
            'terminations': list(terminations),
            'leave_taken': list(leave_requests),
            'overtime': list(overtime_records),
            'summary': {
                'new_hires_count': len(new_hires),
                'terminations_count': len(terminations),
                'leave_requests_count': len(leave_requests),
                'total_leave_days': total_leave_days,
                'overtime_staff_count': len(overtime_records),
                'total_overtime_hours': total_overtime_hours
            }
        })


class PayslipViewSet(ScopedModelViewSet):
    """API endpoint for payslips"""
    permission_module = 'hr'
    permission_page = 'payslips'
    queryset = Payslip.objects.all()
    serializer_class = PayslipSerializer
    
    def get_queryset(self):
        queryset = super().get_queryset()
        staff_id = self.request.query_params.get('staff')
        payroll_id = self.request.query_params.get('payroll')
        
        if staff_id:
            if str(staff_id).isdigit():
                queryset = queryset.filter(staff_id=int(staff_id))
            else:
                queryset = queryset.filter(staff__staff_id=staff_id)
        if payroll_id:
            queryset = queryset.filter(payroll_id=payroll_id)
        
        return queryset.order_by('-created_at')
    
    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        """Download payslip PDF"""
        payslip = self.get_object()

        try:
            # Use the professional WeasyPrint-based generator
            generator = PayslipPDFGenerator(payslip, request.user)
            pdf_buffer = generator.generate_pdf()
            from django.http import HttpResponse
            response = HttpResponse(
                pdf_buffer.getvalue() if hasattr(pdf_buffer, 'getvalue') else pdf_buffer.read(),
                content_type='application/pdf',
            )
            filename = f'payslip_{payslip.payslip_number}.pdf'
            response['Content-Disposition'] = f'attachment; filename="{filename}"'
            return response
        except Exception as e:
            import traceback
            return Response(
                {'error': f'Failed to generate PDF: {str(e)}', 'detail': traceback.format_exc()},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=True, methods=['post'])
    def email(self, request, pk=None):
        """Email payslip to staff"""
        payslip = self.get_object()
        recipient_email = request.data.get('email')
        
        if not recipient_email:
            # Use staff email
            recipient_email = payslip.staff.email
        
        if not recipient_email:
            return Response(
                {'error': 'No email address provided'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            generator = PayslipGenerator(payslip)
            generator.email_payslip(recipient_email)
            
            payslip.refresh_from_db()
            return Response({
                'message': f'Payslip emailed to {recipient_email}',
                'payslip': self.get_serializer(payslip).data
            })
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=False, methods=['get'], url_path='my-payslips')
    def my_payslips(self, request):
        """Return payslips belonging to the authenticated user's staff profile."""
        try:
            staff = Staff.objects.get(user=request.user)
        except Staff.DoesNotExist:
            return Response(
                {'error': 'No staff profile linked to your account.'},
                status=status.HTTP_404_NOT_FOUND
            )
        payslips = self.get_queryset().filter(staff=staff).order_by('-created_at')
        serializer = self.get_serializer(payslips, many=True)
        return Response(serializer.data)


class PensionRemittanceViewSet(ScopedModelViewSet):
    """
    API endpoint for managing and processing pension remittances.

    Workflow:
      1. POST /pension-remittances/            - Create a draft remittance
      2. POST /pension-remittances/{id}/remit/ - Process (post GL entry; mark remitted)
    """
    permission_module = 'hr'
    permission_page = 'pension-remittances'
    queryset = PensionRemittance.objects.all()
    serializer_class = PensionRemittanceSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
        return qs.order_by('-remittance_date')

    def perform_create(self, serializer):
        """Auto-generate reference number on creation"""
        from common.services.reference_service import ReferenceService
        user = self.request.user
        tenant = getattr(user, 'tenant', user)

        reference_number = ReferenceService.generate_reference(
            module='hr',
            model_name='pension_remittance',
            tenant=tenant,
            branch=user.branch
        )
        remittance = serializer.save(
            reference_number=reference_number,
            owner=user,
            branch=user.branch,
            tenant=tenant,
            status='draft'
        )
        try:
            ReferenceService.register_reference(
                reference_number=reference_number,
                module='hr',
                model_name='pension_remittance',
                object_id=remittance.id,
                tenant=tenant,
                branch=user.branch,
                created_by=user,
                status='draft',
                amount=float(remittance.total_amount) if remittance.total_amount else 0.0,
            )
        except Exception:
            pass

    @action(detail=True, methods=['post'])
    def remit(self, request, pk=None):
        """
        Remit pension to the fund:
          DR Employee Pension Contribution Payable
          DR Employer Pension Contribution Payable
          CR Cash / Bank
        """
        remittance = self.get_object()

        if remittance.status != 'draft':
            return Response(
                {'error': 'Only draft remittances can be processed'},
                status=status.HTTP_400_BAD_REQUEST
            )

        payment_account_id = request.data.get('payment_account_id')
        if not payment_account_id:
            return Response(
                {'error': 'payment_account_id is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            from accounts.models import Account
            payment_account = Account.objects.get(
                id=payment_account_id,
                branch=request.user.branch
            )
        except Account.DoesNotExist:
            return Response(
                {'error': 'Payment account not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        first_payroll = remittance.payrolls.first()
        if not first_payroll:
            return Response(
                {'error': 'No payrolls linked to this remittance'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            from hr.services.payroll_accounting import PayrollAccountingService
            accounting = PayrollAccountingService(first_payroll)
            journal_entry = accounting.create_pension_remittance_entry(
                remittance=remittance,
                payment_account=payment_account,
                remitted_by=request.user
            )
            remittance.refresh_from_db()
            return Response({
                'message': 'Pension remitted successfully',
                'journal_entry': journal_entry.reference_number,
                'remittance': self.get_serializer(remittance).data
            })
        except Exception as exc:
            logger.error(f"Pension remittance failed: {exc}", exc_info=True)
            return Response(
                {'error': str(exc)},
                status=status.HTTP_400_BAD_REQUEST
            )


class EmployeeDocumentViewSet(ScopedModelViewSet):
    """
    API endpoint for managing employee documents (contracts, IDs, certificates, etc.).

    Supports:
      - List all documents (filterable by staff, category)
      - Upload new document (multipart/form-data)
      - Retrieve / Delete individual documents
    """
    permission_module = 'hr'
    permission_page = 'employee-documents'
    queryset = EmployeeDocument.objects.select_related('staff', 'uploaded_by').all()
    serializer_class = EmployeeDocumentSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        # Filter by staff
        staff_id = self.request.query_params.get('staff')
        if staff_id:
            if str(staff_id).isdigit():
                qs = qs.filter(staff_id=int(staff_id))
            else:
                qs = qs.filter(staff__staff_id=staff_id)
        # Filter by category
        category = self.request.query_params.get('category')
        if category:
            qs = qs.filter(category=category)
        # Filter expired documents
        expired = self.request.query_params.get('expired')
        if expired == 'true':
            from django.utils import timezone
            qs = qs.filter(expiry_date__lt=timezone.now().date())
        elif expired == 'false':
            from django.utils import timezone
            from django.db.models import Q
            qs = qs.filter(
                Q(expiry_date__gte=timezone.now().date()) |
                Q(expiry_date__isnull=True)
            )
        return qs.order_by('-created_at')

    def perform_create(self, serializer):
        serializer.save(
            uploaded_by=self.request.user,
            owner=self.request.user,
            branch=self.request.user.branch,
        )

    @action(detail=False, methods=['get'])
    def expiring_soon(self, request):
        """Get documents expiring within the next 30 days"""
        from django.utils import timezone
        from datetime import timedelta
        today = timezone.now().date()
        threshold = today + timedelta(days=30)
        qs = self.get_queryset().filter(
            expiry_date__isnull=False,
            expiry_date__gte=today,
            expiry_date__lte=threshold
        )
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def categories(self, request):
        """Return available document categories"""
        return Response([
            {'value': choice[0], 'label': choice[1]}
            for choice in EmployeeDocument.CATEGORY_CHOICES
        ])


class PayComponentRemovalRequestViewSet(ScopedModelViewSet):
    """
    CRUD + approval workflow for pay-component removal requests.
    Endpoints:
      POST   /hr/pay-component-removals/          — submit a request
      GET    /hr/pay-component-removals/           — list (with ?status=PENDING filter)
      GET    /hr/pay-component-removals/{id}/      — detail
      POST   /hr/pay-component-removals/{id}/approve/ — approve (removes StaffPayInfo)
      POST   /hr/pay-component-removals/{id}/reject/  — reject with reason
      GET    /hr/pay-component-removals/pending_count/ — count of pending requests
    """
    permission_module = 'hr'
    permission_page = 'pay-component-removals'
    queryset = PayComponentRemovalRequest.objects.select_related(
        'staff_pay_info__staff', 'staff_pay_info__component',
        'requested_by', 'approved_by'
    ).all()
    serializer_class = PayComponentRemovalRequestSerializer

    def get_serializer_class(self):
        if self.action == 'create':
            return PayComponentRemovalRequestCreateSerializer
        return PayComponentRemovalRequestSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
        staff_id = self.request.query_params.get('staff')
        if staff_id:
            if str(staff_id).isdigit():
                qs = qs.filter(staff_pay_info__staff_id=int(staff_id))
            else:
                qs = qs.filter(staff_pay_info__staff__staff_id=staff_id)
        return qs

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve the removal request — deletes the StaffPayInfo record."""
        from django.utils import timezone

        removal = self.get_object()
        if removal.status != PayComponentRemovalRequest.PENDING:
            return Response(
                {'error': f'Request is already {removal.status.lower()}'},
                status=status.HTTP_400_BAD_REQUEST
            )

        pay_info = removal.staff_pay_info

        # Mark approved
        removal.status = PayComponentRemovalRequest.APPROVED
        removal.approved_by = request.user
        removal.approved_date = timezone.now()
        removal.save()

        # Delete (or soft-delete) the StaffPayInfo record
        pay_info.delete()

        serializer = PayComponentRemovalRequestSerializer(removal)
        return Response({
            'message': 'Removal request approved. Component has been removed from staff profile.',
            'data': serializer.data
        })

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """Reject the removal request with a mandatory reason."""
        from django.utils import timezone

        removal = self.get_object()
        if removal.status != PayComponentRemovalRequest.PENDING:
            return Response(
                {'error': f'Request is already {removal.status.lower()}'},
                status=status.HTTP_400_BAD_REQUEST
            )

        rejection_reason = request.data.get('rejection_reason', '').strip()
        if not rejection_reason:
            return Response(
                {'error': 'rejection_reason is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        removal.status = PayComponentRemovalRequest.REJECTED
        removal.approved_by = request.user
        removal.approved_date = timezone.now()
        removal.rejection_reason = rejection_reason
        removal.save()

        serializer = PayComponentRemovalRequestSerializer(removal)
        return Response({
            'message': 'Removal request rejected.',
            'data': serializer.data
        })

    @action(detail=False, methods=['get'])
    def pending_count(self, request):
        """Return count of pending removal requests (for badge display)."""
        count = self.get_queryset().filter(
            status=PayComponentRemovalRequest.PENDING
        ).count()
        return Response({'count': count})


# ── Staff IOU ViewSet ────────────────────────────────────────────────────────

class StaffIOUViewSet(ScopedModelViewSet):
    """
    CRUD + approve / cancel / disburse / adjust_balance endpoints for Staff IOU records.

    Lifecycle:
      PENDING  → APPROVED  (via approve action)
      APPROVED → ACTIVE    (via disburse action — payroll-only or cash)
      Any live status → CANCELLED (via cancel)
      ACTIVE   → COMPLETED (automatic when balance reaches zero)

    Endpoints:
      POST   /hr/staff-ious/                           — create (status=PENDING)
      GET    /hr/staff-ious/                           — list (?status=PENDING|APPROVED|ACTIVE|…)
      GET    /hr/staff-ious/{id}/                      — detail
      PATCH  /hr/staff-ious/{id}/                      — edit reason/notes (PENDING/APPROVED/ACTIVE)
      POST   /hr/staff-ious/{id}/approve/              — approve (PENDING→APPROVED)          [approver]
      POST   /hr/staff-ious/{id}/disburse/             — decide & activate (APPROVED→ACTIVE)  [approver]
      POST   /hr/staff-ious/{id}/cancel/               — cancel (PENDING/APPROVED/ACTIVE→CANCELLED)
      POST   /hr/staff-ious/{id}/adjust_balance/       — correct total after confirmation     [approver]
    """
    permission_module = 'hr'
    permission_page = 'staff-ious'
    queryset = StaffIOU.objects.select_related(
        'staff', 'created_by', 'approved_by', 'disbursement_journal'
    ).all()
    serializer_class = StaffIOUSerializer

    def get_permissions(self):
        if self.action in ('approve', 'disburse', 'adjust_balance'):
            return [IsAuthenticated(), IsApprover()]
        return super().get_permissions()

    def get_serializer_class(self):
        if self.action == 'create':
            return StaffIOUCreateSerializer
        return StaffIOUSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter.upper())
        staff_id = self.request.query_params.get('staff')
        if staff_id:
            if str(staff_id).isdigit():
                qs = qs.filter(staff__id=int(staff_id))
            else:
                qs = qs.filter(staff__staff_id=staff_id)
        return qs.order_by('-created_at')

    def perform_create(self, serializer):
        serializer.save(
            created_by=self.request.user,
            balance_remaining=serializer.validated_data['total_amount'],
            status=StaffIOU.PENDING,
        )

    @action(detail=False, methods=['post'], url_path='from-reconciliation')
    def from_reconciliation(self, request):
        """
        Create a salary-deduction StaffIOU directly from a CashReconciliation shortfall.

        Body:
          reconciliation_id  (int, required) — CashReconciliation with status 'variance' and negative variance
          monthly_installment (Decimal, optional) — defaults to full shortfall in one deduction
          start_month        (str YYYY-MM-DD, optional) — defaults to next month's 1st

        The cashier on the CashierAccount must have a linked Staff profile (user → staff_profile).
        The IOU is created with status=PENDING and deduction_type='reconciliation'.
        It still goes through the normal approve → disburse lifecycle so a director can review it.
        """
        from decimal import Decimal
        from datetime import date
        from dateutil.relativedelta import relativedelta
        from cash_management.models import CashReconciliation

        reconciliation_id = request.data.get('reconciliation_id')
        if not reconciliation_id:
            return Response({'detail': 'reconciliation_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            recon = CashReconciliation.objects.select_related(
                'cashier_account__cashier__staff_profile'
            ).get(pk=reconciliation_id)
        except CashReconciliation.DoesNotExist:
            return Response({'detail': 'Reconciliation not found.'}, status=status.HTTP_404_NOT_FOUND)

        if recon.status != 'variance':
            return Response(
                {'detail': 'Only reconciliations with a variance can generate a deduction.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        shortfall = abs(recon.variance)
        if shortfall <= 0:
            return Response({'detail': 'No shortfall to deduct (variance is positive).'}, status=status.HTTP_400_BAD_REQUEST)

        # Resolve the cashier user → staff profile
        cashier_user = getattr(recon.cashier_account, 'cashier', None)
        if not cashier_user:
            return Response({'detail': 'Cashier account has no linked user.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            staff = cashier_user.staff_profile
        except Exception:
            return Response(
                {'detail': f'User {cashier_user.get_full_name() or cashier_user.username} has no Staff profile. '
                           'Link them to a staff record first.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        monthly_installment = Decimal(str(request.data.get('monthly_installment', shortfall)))
        if monthly_installment <= 0:
            return Response({'detail': 'monthly_installment must be positive.'}, status=status.HTTP_400_BAD_REQUEST)

        # Default start_month = 1st of next month
        if request.data.get('start_month'):
            try:
                start_month = date.fromisoformat(request.data['start_month'])
            except (ValueError, TypeError):
                return Response({'detail': 'start_month must be YYYY-MM-DD.'}, status=status.HTTP_400_BAD_REQUEST)
        else:
            today = date.today()
            start_month = (today + relativedelta(months=1)).replace(day=1)

        reason = (
            f"Cashier reconciliation shortfall on {recon.reconciliation_date} "
            f"(Recon #{recon.id}). Variance: ₦{shortfall}."
        )

        iou = StaffIOU.objects.create(
            staff=staff,
            total_amount=shortfall,
            monthly_installment=monthly_installment,
            balance_remaining=shortfall,
            start_month=start_month,
            reason=reason,
            notes=request.data.get('notes', ''),
            status=StaffIOU.PENDING,
            cash_disbursed=False,
            deduction_type=StaffIOU.DEDUCTION_RECONCILIATION,
            cashier_reconciliation=recon,
            created_by=request.user,
            branch=staff.branch,
            owner=staff.owner,
        )

        from hr.serializers import StaffIOUSerializer
        return Response(StaffIOUSerializer(iou, context={'request': request}).data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        """Restrict PATCH/PUT to safe fields only — cannot alter financial figures."""
        instance = self.get_object()
        if instance.status not in (StaffIOU.PENDING, StaffIOU.APPROVED, StaffIOU.ACTIVE):
            return Response(
                {'error': 'Only PENDING, APPROVED, or ACTIVE IOUs can be edited.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        SAFE_FIELDS = {'reason', 'notes'}
        disallowed = set(request.data.keys()) - SAFE_FIELDS
        if disallowed:
            return Response(
                {'error': f"Fields {sorted(disallowed)} cannot be updated after creation."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().update(request, *args, **kwargs)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Cancel a PENDING, APPROVED, or ACTIVE IOU."""
        iou = self.get_object()
        if iou.status not in (StaffIOU.PENDING, StaffIOU.APPROVED, StaffIOU.ACTIVE):
            return Response(
                {'error': f'Cannot cancel an IOU that is already {iou.get_status_display().lower()}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        iou.status = StaffIOU.CANCELLED
        iou.save(update_fields=['status'])
        return Response({'message': 'IOU cancelled.', 'data': StaffIOUSerializer(iou).data})

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """
        Approve a PENDING IOU — records the approver and immediately activates it
        for payroll deduction (status → ACTIVE, cash_disbursed=False).
        If cash was actually disbursed, call /disburse/ with type='cash' afterwards
        to post the GL entry and set cash_disbursed=True.
        """
        iou = self.get_object()
        if iou.status != StaffIOU.PENDING:
            return Response(
                {'error': f'Only PENDING IOUs can be approved. This IOU is {iou.get_status_display().lower()}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        iou.status = StaffIOU.ACTIVE
        iou.cash_disbursed = False
        iou.approved_by = request.user
        iou.approved_at = timezone.now()
        iou.save(update_fields=['status', 'cash_disbursed', 'approved_by', 'approved_at'])
        return Response({
            'message': 'IOU approved and activated for payroll deduction. If cash was physically disbursed, use /disburse/ to record the GL entry.',
            'data': StaffIOUSerializer(iou).data,
        })

    @action(detail=True, methods=['post'])
    def disburse(self, request, pk=None):
        """
        Activate an APPROVED IOU and record how it was funded.

        Two disbursement types are supported:

        1. type='payroll_only'  (default)
               No cash was given to the employee.
               The IOU is simply activated; payroll will automatically deduct
               monthly instalments and post:
                   Dr  Payroll Clearance (Salaries Payable)
                   Cr  Staff Loan Account
               No GL entry is created here.

        2. type='cash'
               Cash was physically given to the employee from a bank account
               or petty cash.  The source account MUST be supplied via
               credit_account_id.  GL posted now:
                   Dr  Staff Loan Account          [total IOU amount]
                   Cr  <bank / petty cash account> [total IOU amount]
               Payroll will still deduct and post the recovery entry each month.

        Body params:
          type                (str, required)  — 'payroll_only' | 'cash'
          credit_account_id   (int, required if type='cash') — bank/petty cash account
          description_override (str, optional) — custom JE description (cash only)
        """
        from accounts.utils.account_creation import get_system_account
        from accounts.models import Account
        from transactions.models import (
            Transaction as JournalEntry,
            TransactionEntry as JournalEntryLine,
            TransactionSeries,
        )

        iou = self.get_object()
        if iou.status not in (StaffIOU.APPROVED, StaffIOU.ACTIVE):
            return Response(
                {'error': f'Only APPROVED or ACTIVE IOUs can be updated via disburse. This IOU is {iou.get_status_display().lower()}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        disbursement_type = (request.data.get('type') or 'payroll_only').strip().lower()
        if disbursement_type not in ('payroll_only', 'cash'):
            return Response(
                {'error': "type must be 'payroll_only' or 'cash'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        branch = iou.staff.branch
        owner  = iou.staff.owner

        if disbursement_type == 'payroll_only':
            # ── No cash left the organisation ─────────────────────────────
            # Ensure the IOU is active (may already be ACTIVE from approve step).
            with transaction.atomic():
                iou.status = StaffIOU.ACTIVE
                iou.cash_disbursed = False
                iou.save(update_fields=['status', 'cash_disbursed'])

            return Response({
                'message': (
                    'IOU confirmed as payroll-deduction only. '
                    'Monthly instalments will be deducted automatically from salary.'
                ),
                'data': StaffIOUSerializer(iou).data,
            })

        # ── Cash disbursement ──────────────────────────────────────────────
        #     Dr  Staff Loan Account          (asset — employee owes the company)
        #     Cr  Bank / Petty Cash Account   (cash leaves the organisation)
        credit_account_id = request.data.get('credit_account_id')
        if not credit_account_id:
            return Response(
                {'error': 'credit_account_id is required when type is "cash".'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            cash_account = Account.objects.get(
                pk=int(credit_account_id), owner=owner, branch=branch
            )
        except (Account.DoesNotExist, ValueError, TypeError):
            return Response(
                {'error': 'credit_account_id does not match a valid account for this branch.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        loan_account = get_system_account('staff_iou', owner, branch)

        description = request.data.get('description_override', '').strip() or (
            f"Staff Loan Disbursement – {iou.staff.first_name} {iou.staff.last_name} "
            f"(Ref: {iou.reference_number}) via {cash_account.name}"
        )

        series, _ = TransactionSeries.objects.get_or_create(
            code='IOUDIS',
            defaults={'description': 'Staff IOU Cash Disbursement'},
        )

        with transaction.atomic():
            je = JournalEntry.objects.create(
                tenant=iou.staff.tenant,
                series=series,
                date=timezone.now().date(),
                description=description,
                workflow_reference=f"{iou.reference_number}-DIS",
                branch=branch,
                owner=owner,
            )
            # Dr Staff Loan Account (receivable increases — employee owes company)
            JournalEntryLine.objects.create(
                transaction=je, account=loan_account,
                side=JournalEntryLine.DEBIT, amount=iou.total_amount,
            )
            # Cr Cash / Bank (money leaves the company)
            JournalEntryLine.objects.create(
                transaction=je, account=cash_account,
                side=JournalEntryLine.CREDIT, amount=iou.total_amount,
            )
            je.post()

            iou.status = StaffIOU.ACTIVE
            iou.cash_disbursed = True
            iou.disbursement_journal = je
            iou.save(update_fields=['status', 'cash_disbursed', 'disbursement_journal'])

        return Response({
            'message': f'Cash disbursement recorded. GL entry posted (Dr Staff Loan Account / Cr {cash_account.name}).',
            'journal_entry_id': je.id,
            'cash_account': cash_account.name,
            'data': StaffIOUSerializer(iou).data,
        })

    @action(detail=True, methods=['post'])
    def adjust_balance(self, request, pk=None):
        """
        Adjust the total_amount (and recalculate balance_remaining) of an IOU
        to reflect the confirmed cost after an initial arbitrary estimate.

        Allowed statuses: PENDING, APPROVED, ACTIVE.
        Required payload:
          new_total_amount  — the confirmed corrected total (must be > 0)
          reason            — explanation of the adjustment (required)

        Calculates:
          already_repaid       = total_amount - balance_remaining
          new_balance_remaining = max(0, new_total_amount - already_repaid)

        If new_balance_remaining reaches 0 the IOU is automatically COMPLETED.
        The adjustment is appended to the IOU notes for a full audit trail.
        """
        iou = self.get_object()
        if iou.status not in (StaffIOU.PENDING, StaffIOU.APPROVED, StaffIOU.ACTIVE):
            return Response(
                {'error': f'Cannot adjust a {iou.get_status_display().lower()} IOU.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        raw_new_total = request.data.get('new_total_amount')
        reason = (request.data.get('reason') or '').strip()

        if raw_new_total is None:
            return Response({'error': 'new_total_amount is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if not reason:
            return Response({'error': 'reason is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            new_total = Decimal(str(raw_new_total))
        except Exception:
            return Response({'error': 'new_total_amount must be a valid number.'}, status=status.HTTP_400_BAD_REQUEST)

        if new_total <= 0:
            return Response({'error': 'new_total_amount must be greater than zero.'}, status=status.HTTP_400_BAD_REQUEST)

        already_repaid = iou.total_amount - iou.balance_remaining
        new_balance = max(Decimal('0.00'), new_total - already_repaid)

        old_total = iou.total_amount
        iou.total_amount = new_total
        iou.balance_remaining = new_balance
        if new_balance <= Decimal('0.00'):
            iou.status = StaffIOU.COMPLETED

        adjustment_note = (
            f"[Balance Adjustment {timezone.now().strftime('%Y-%m-%d %H:%M')} "
            f"by {request.user.get_full_name() or request.user.username}] "
            f"Total adjusted from ₦{old_total:,.2f} → ₦{new_total:,.2f}. Reason: {reason}"
        )
        iou.notes = (iou.notes + '\n\n' + adjustment_note).strip() if iou.notes else adjustment_note

        iou.save(update_fields=['total_amount', 'balance_remaining', 'status', 'notes'])
        return Response({
            'message': f'IOU balance adjusted from ₦{old_total:,.2f} to ₦{new_total:,.2f}.',
            'already_repaid': str(already_repaid),
            'new_balance_remaining': str(new_balance),
            'data': StaffIOUSerializer(iou).data,
        })

    @action(detail=False, methods=['post'], url_path='bulk-debit')
    def bulk_debit(self, request):
        """
        Create multiple Staff IOUs in one operation and post a single
        balanced journal entry.

        This is the cost-displacement flow — e.g. an asset disposal loss
        shared across several staff members:

            Dr  Staff IOU Receivable  [amount for Staff A]
            Dr  Staff IOU Receivable  [amount for Staff B]
            …
            Cr  Asset Disposal / Cash / any account  [total]

        Each staff entry produces its own IOU record (with its own monthly
        installment schedule) but all share a single disbursement journal.

        Request body:
        {
            "credit_account_id": 123,          # required
            "description": "...",              # optional
            "date": "2026-04-30",              # optional, defaults to today
            "entries": [
                {
                    "staff": <staff pk>,
                    "amount": 50000,
                    "monthly_installment": 5000,
                    "start_month": "2026-05-01",
                    "reason": "Asset disposal cost recovery",
                    "notes": ""                # optional
                },
                ...
            ]
        }
        """
        from accounts.utils.account_creation import get_system_account
        from accounts.models import Account
        from transactions.models import (
            Transaction as JournalEntry,
            TransactionEntry as JournalEntryLine,
            TransactionSeries,
        )
        from datetime import datetime as _dt

        owner  = request.user
        branch = getattr(request.user, 'branch', None)
        tenant = getattr(request.user, 'tenant', None)

        # ── Validate top-level fields ────────────────────────────────────────
        entries_data    = request.data.get('entries', [])
        credit_acct_id  = request.data.get('credit_account_id')
        description_raw = (request.data.get('description') or '').strip()
        date_raw        = request.data.get('date')

        if not entries_data:
            return Response(
                {'error': 'entries list is required and must not be empty.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not credit_acct_id:
            return Response(
                {'error': 'credit_account_id is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            credit_account = Account.objects.get(
                pk=int(credit_acct_id), owner=owner, branch=branch
            )
        except (Account.DoesNotExist, ValueError, TypeError):
            return Response(
                {'error': 'credit_account_id does not match a valid account for this branch.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        je_date = timezone.now().date()
        if date_raw:
            try:
                je_date = _dt.strptime(date_raw, '%Y-%m-%d').date()
            except ValueError:
                return Response(
                    {'error': 'date must be in YYYY-MM-DD format.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        # ── Validate individual entries ──────────────────────────────────────
        validated = []
        for i, entry in enumerate(entries_data):
            prefix = f'Entry {i + 1}'
            staff_pk      = entry.get('staff')
            raw_amount    = entry.get('amount')
            raw_install   = entry.get('monthly_installment')
            start_month   = entry.get('start_month', '')
            reason        = (entry.get('reason') or '').strip()
            notes         = (entry.get('notes') or '').strip()

            if not all([staff_pk, raw_amount, raw_install, start_month, reason]):
                return Response(
                    {'error': f'{prefix}: staff, amount, monthly_installment, start_month, and reason are required.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            try:
                from .models import Staff as _Staff
                staff_obj = _Staff.objects.get(pk=int(staff_pk), owner=owner, branch=branch)
            except (_Staff.DoesNotExist, ValueError, TypeError):
                return Response(
                    {'error': f'{prefix}: staff not found or not in this branch.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            try:
                amount      = Decimal(str(raw_amount))
                installment = Decimal(str(raw_install))
            except Exception:
                return Response(
                    {'error': f'{prefix}: amount and monthly_installment must be numeric.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if amount <= 0:
                return Response(
                    {'error': f'{prefix}: amount must be greater than 0.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if installment <= 0 or installment > amount:
                return Response(
                    {'error': f'{prefix}: monthly_installment must be > 0 and ≤ amount.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            validated.append({
                'staff':       staff_obj,
                'amount':      amount,
                'installment': installment,
                'start_month': start_month,
                'reason':      reason,
                'notes':       notes,
            })

        # Guard against duplicate staff entries
        seen_staff_ids = [e['staff'].pk for e in validated]
        if len(seen_staff_ids) != len(set(seen_staff_ids)):
            return Response(
                {'error': 'Duplicate staff entries detected. Each staff member may appear only once per bulk submission.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        total_amount = sum(e['amount'] for e in validated)

        # Resolve tenant reliably from the first staff object (always set)
        tenant = validated[0]['staff'].tenant if not tenant else tenant

        description = description_raw or (
            f"Bulk Staff IOU – {credit_account.name} – "
            f"{len(validated)} staff (total ₦{total_amount:,.2f})"
        )

        iou_account = get_system_account('staff_iou', owner, branch)
        series, _   = TransactionSeries.objects.get_or_create(
            code='IOUDIS',
            defaults={'description': 'Staff IOU Disbursement'},
        )

        batch_ref = f"BULK-IOU-{timezone.now().strftime('%Y%m%d%H%M%S')}"

        # ── Atomic: create all IOUs + single JE ─────────────────────────────
        created_ious = []
        with transaction.atomic():
            je = JournalEntry.objects.create(
                tenant=tenant,
                series=series,
                date=je_date,
                description=description,
                branch=branch,
                owner=owner,
                workflow_reference=batch_ref,
            )

            for entry in validated:
                iou = StaffIOU(
                    staff=entry['staff'],
                    total_amount=entry['amount'],
                    monthly_installment=entry['installment'],
                    start_month=entry['start_month'],
                    reason=entry['reason'],
                    notes=entry['notes'],
                    status=StaffIOU.ACTIVE,
                    created_by=request.user,
                    approved_by=request.user,
                    approved_at=timezone.now(),
                    disbursement_journal=je,
                    owner=owner,
                    branch=branch,
                    tenant=tenant,
                )
                iou.save()   # triggers auto reference_number + balance_remaining init

                JournalEntryLine.objects.create(
                    transaction=je,
                    account=iou_account,
                    side=JournalEntryLine.DEBIT,
                    amount=entry['amount'],
                )
                created_ious.append(iou)

            # Single credit leg
            JournalEntryLine.objects.create(
                transaction=je,
                account=credit_account,
                side=JournalEntryLine.CREDIT,
                amount=total_amount,
            )
            je.post()

        return Response(
            {
                'message': f'{len(created_ious)} IOU(s) created and GL entry posted.',
                'journal_entry_id': je.id,
                'total_amount': str(total_amount),
                'credit_account': credit_account.name,
                'ious': StaffIOUSerializer(created_ious, many=True).data,
            },
            status=status.HTTP_201_CREATED,
        )


class PayrollStatutoryFilingViewSet(ScopedModelViewSet):
    """
    Manage NHF and NSITF statutory filing records.
    Java App 2 (StatutoryComplianceService) writes submission payloads and
    responses back to these records via the internal API.

    Query params:
      - filing_type: nhf / nsitf
      - status: draft / submitted / remitted / rejected / cancelled
    """
    permission_module = 'hr'
    permission_page = 'statutory-filings'
    # Inherits [IsAuthenticated, IsTenantUser] from ScopedModelViewSet
    queryset = PayrollStatutoryFiling.objects.all()

    def get_serializer_class(self):
        if self.action == 'list':
            return PayrollStatutoryFilingListSerializer
        return PayrollStatutoryFilingSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        filing_type = self.request.query_params.get('filing_type')
        if filing_type:
            qs = qs.filter(filing_type=filing_type)
        filing_status = self.request.query_params.get('status')
        if filing_status:
            qs = qs.filter(status=filing_status)
        return qs

    @action(detail=True, methods=['post'])
    def mark_remitted(self, request, pk=None):
        """Mark a filing as remitted (payment confirmed)."""
        filing = self.get_object()
        if filing.status not in ('draft', 'submitted'):
            from rest_framework.response import Response as R
            from rest_framework import status as st
            return R({'detail': 'Filing must be draft or submitted to mark as remitted.'}, status=st.HTTP_400_BAD_REQUEST)
        agency_ref = request.data.get('agency_reference', '')
        remittance_date = request.data.get('remittance_date')
        filing.status = 'remitted'
        filing.agency_reference = agency_ref or filing.agency_reference
        if remittance_date:
            filing.remittance_date = remittance_date
        filing.submitted_by = request.user
        filing.save(update_fields=['status', 'agency_reference', 'remittance_date', 'submitted_by', 'updated_at'])
        return Response(PayrollStatutoryFilingSerializer(filing, context={'request': request}).data)
