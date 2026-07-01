# hr/workflow_step_handlers.py
"""
Custom Workflow Step Handlers for HR Module

These handlers integrate with the existing WorkflowExecutor to provide
HR-specific functionality within workflows.
"""

from django.core.exceptions import ValidationError
from decimal import Decimal
from automations.workflow_steps.base import BaseStepHandler


class LeaveValidationStepHandler(BaseStepHandler):
    """
    Validates leave request
    
    Expected context:
        - leave_request_id: ID of leave request
        OR
        - staff_id: Staff ID
        - leave_type_id: Leave type ID
        - start_date: Start date
        - end_date: End date
        - num_days: Number of days
    
    Returns:
        - success: bool
        - is_valid: bool
        - errors: list of errors
        - warnings: list of warnings
        - leave_request_id: int
    """
    
    def execute(self, step, workflow_run, context):
        """Execute leave validation"""
        from hr.models import LeaveRequest
        from hr.services.leave_service import LeaveService
        
        # Get or create leave request
        leave_request_id = context.get('leave_request_id')
        
        if leave_request_id:
            try:
                leave_request = LeaveRequest.objects.get(id=leave_request_id)
            except LeaveRequest.DoesNotExist:
                return {
                    'success': False,
                    'error': f'Leave request {leave_request_id} not found'
                }
        else:
            # Leave request will be created elsewhere
            return {
                'success': True,
                'is_valid': True,
                'next_step': 'submit_leave'
            }
        
        # Validate using service
        service = LeaveService(leave_request)
        validation_result = service.validate_leave_request()
        
        return {
            'success': True,
            'is_valid': validation_result['is_valid'],
            'errors': validation_result['errors'],
            'warnings': validation_result['warnings'],
            'leave_request_id': leave_request.id,
            'num_days': leave_request.num_days,
            'requires_approval': leave_request.leave_type.requires_approval,
            'next_step': 'approval' if validation_result['is_valid'] else 'notify_rejection',
        }


class LeaveApprovalStepHandler(BaseStepHandler):
    """
    Handles leave approval
    
    Expected context:
        - leave_request_id: ID of leave request
        - approved_by_id: User ID of approver
        - notes: Optional approval notes
    
    Returns:
        - success: bool
        - leave_request_status: str
        - approved_at: timestamp
    """
    
    def execute(self, step, workflow_run, context):
        """Execute leave approval"""
        from hr.models import LeaveRequest
        from hr.services.leave_service import LeaveService
        from users.models import User
        
        leave_request_id = context.get('leave_request_id')
        if not leave_request_id:
            return {
                'success': False,
                'error': 'leave_request_id is required'
            }
        
        try:
            leave_request = LeaveRequest.objects.get(id=leave_request_id)
            approver_id = context.get('approved_by_id') or workflow_run.created_by.id
            approver = User.objects.get(id=approver_id)
            
            service = LeaveService(leave_request)
            service.approve_leave_request(
                approved_by=approver,
                notes=context.get('notes')
            )
            
            return {
                'success': True,
                'leave_request_status': leave_request.status,
                'approved_at': leave_request.approved_at.isoformat(),
                'approver_name': f"{approver.first_name} {approver.last_name}",
                'next_step': 'send_notification',
            }
            
        except (LeaveRequest.DoesNotExist, User.DoesNotExist) as e:
            return {
                'success': False,
                'error': str(e)
            }
        except ValidationError as e:
            return {
                'success': False,
                'error': str(e)
            }


class AttendanceTrackingStepHandler(BaseStepHandler):
    """
    Records attendance for staff
    
    Expected context:
        - staff_id: Staff ID
        - date: Attendance date
        - clock_in: Clock in time (optional)
        - clock_out: Clock out time (optional)
        - status: Attendance status
    
    Returns:
        - success: bool
        - attendance_id: int
        - hours_worked: float
        - status: str
    """
    
    def execute(self, step, workflow_run, context):
        """Execute attendance tracking"""
        from hr.models import Attendance, Staff
        from hr.config_models import HRConfig
        from datetime import datetime
        
        staff_id = context.get('staff_id')
        date = context.get('date')
        
        if not staff_id or not date:
            return {
                'success': False,
                'error': 'staff_id and date are required'
            }
        
        try:
            staff = Staff.objects.get(id=staff_id)
            
            # Parse date
            if isinstance(date, str):
                date = datetime.fromisoformat(date).date()
            
            # Get or create attendance record
            attendance, created = Attendance.objects.get_or_create(
                staff=staff,
                date=date,
                branch=staff.branch,
                owner=staff.owner,
                defaults={
                    'status': context.get('status', 'present'),
                }
            )
            
            # Update times if provided
            if context.get('clock_in'):
                clock_in = context.get('clock_in')
                if isinstance(clock_in, str):
                    attendance.clock_in = datetime.fromisoformat(clock_in).time()
                else:
                    attendance.clock_in = clock_in
            
            if context.get('clock_out'):
                clock_out = context.get('clock_out')
                if isinstance(clock_out, str):
                    attendance.clock_out = datetime.fromisoformat(clock_out).time()
                else:
                    attendance.clock_out = clock_out
            
            # Calculate hours
            if attendance.clock_in and attendance.clock_out:
                attendance.hours_worked = attendance.calculate_hours_worked()
                
                # Calculate overtime
                config = HRConfig.objects.get(branch=staff.branch)
                if attendance.hours_worked > config.working_hours_per_day:
                    attendance.overtime_hours = attendance.hours_worked - config.working_hours_per_day
            
            attendance.save()
            
            return {
                'success': True,
                'attendance_id': attendance.id,
                'hours_worked': attendance.hours_worked,
                'overtime_hours': attendance.overtime_hours,
                'status': attendance.status,
                'created': created,
            }
            
        except Staff.DoesNotExist:
            return {
                'success': False,
                'error': f'Staff {staff_id} not found'
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }


class PayrollCalculationStepHandler(BaseStepHandler):
    """
    Calculates payroll for a period
    
    Expected context:
        - payroll_id: Payroll ID
        - staff_list: Optional list of staff IDs to include
    
    Returns:
        - success: bool
        - payslips_created: int
        - total_gross_pay: float
        - total_net_pay: float
    """
    
    def execute(self, step, workflow_run, context):
        """Execute payroll calculation"""
        from hr.models import Payroll, Staff
        from hr.services.payroll_service import PayrollService
        
        payroll_id = context.get('payroll_id')
        if not payroll_id:
            return {
                'success': False,
                'error': 'payroll_id is required'
            }
        
        try:
            payroll = Payroll.objects.get(id=payroll_id)
            
            # Get staff list if provided
            staff_list = None
            if context.get('staff_list'):
                staff_ids = context.get('staff_list')
                staff_list = Staff.objects.filter(id__in=staff_ids)
            
            # Calculate payroll
            service = PayrollService(payroll)
            result = service.calculate_payroll(staff_list=staff_list)
            
            return {
                'success': True,
                'payslips_created': result['payslips_created'],
                'total_gross_pay': result['total_gross_pay'],
                'total_deductions': result['total_deductions'],
                'total_net_pay': result['total_net_pay'],
                'payroll_status': payroll.status,
                'next_step': 'approval',
            }
            
        except Payroll.DoesNotExist:
            return {
                'success': False,
                'error': f'Payroll {payroll_id} not found'
            }
        except ValidationError as e:
            return {
                'success': False,
                'error': str(e)
            }
        except Exception as e:
            return {
                'success': False,
                'error': f'Error calculating payroll: {str(e)}'
            }


class PayslipGenerationStepHandler(BaseStepHandler):
    """
    Generates PDF payslips
    
    Expected context:
        - payroll_id: Payroll ID
        - email_payslips: bool (optional, default False)
    
    Returns:
        - success: bool
        - payslips_generated: int
        - files_generated: list of file paths
    """
    
    def execute(self, step, workflow_run, context):
        """Execute payslip generation"""
        from hr.models import Payroll, Payslip
        from hr.services.payslip_generator import PayslipGenerator
        
        payroll_id = context.get('payroll_id')
        if not payroll_id:
            return {
                'success': False,
                'error': 'payroll_id is required'
            }
        
        try:
            payroll = Payroll.objects.get(id=payroll_id)
            payslips = Payslip.objects.filter(payroll=payroll, is_active=True)
            
            generated_files = []
            emailed_count = 0
            
            for payslip in payslips:
                generator = PayslipGenerator(payslip)
                
                # Generate PDF
                pdf_path = generator.generate_pdf()
                if pdf_path:
                    generated_files.append(pdf_path)
                
                # Email if requested
                if context.get('email_payslips', False):
                    if generator.email_payslip():
                        emailed_count += 1
            
            return {
                'success': True,
                'payslips_generated': len(generated_files),
                'files_generated': generated_files,
                'payslips_emailed': emailed_count,
            }
            
        except Payroll.DoesNotExist:
            return {
                'success': False,
                'error': f'Payroll {payroll_id} not found'
            }
        except Exception as e:
            return {
                'success': False,
                'error': f'Error generating payslips: {str(e)}'
            }


# Register handlers with WorkflowExecutor
def register_hr_workflow_handlers():
    """Register all HR workflow step handlers"""
    from automations.workflow_executor import WorkflowExecutor
    
    executor = WorkflowExecutor()
    executor.step_handlers['leave_validation'] = LeaveValidationStepHandler()
    executor.step_handlers['leave_approval'] = LeaveApprovalStepHandler()
    executor.step_handlers['attendance_tracking'] = AttendanceTrackingStepHandler()
    executor.step_handlers['payroll_calculation'] = PayrollCalculationStepHandler()
    executor.step_handlers['payslip_generation'] = PayslipGenerationStepHandler()
    
    return executor
