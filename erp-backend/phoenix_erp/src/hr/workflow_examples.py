# hr/workflow_examples.py
"""
Example Workflow Templates for HR Module

These templates demonstrate how to configure HR workflows using the existing system.
"""

# Standard Leave Request Workflow
STANDARD_LEAVE_WORKFLOW = {
    "name": "Standard Leave Approval",
    "description": "Standard workflow for leave requests (< max consecutive days)",
    "category": "hr",
    "workflow_definition": {
        "version": "1.0",
        "steps": [
            {
                "id": "validate",
                "type": "leave_validation",
                "name": "Validate Leave Request",
                "config": {
                    "check_balance": True,
                    "check_overlaps": True
                },
                "on_success": "check_validation",
                "on_failure": "notify_rejection"
            },
            {
                "id": "check_validation",
                "type": "conditional",
                "name": "Check Validation Result",
                "condition": "${step.validate.is_valid} == true",
                "on_true": "notify_manager",
                "on_false": "notify_rejection"
            },
            {
                "id": "notify_manager",
                "type": "notification",
                "name": "Notify Manager",
                "config": {
                    "template": "leave_request_pending",
                    "recipients": ["${staff.manager_email}"],
                    "subject": "Leave Request - ${staff.first_name} ${staff.last_name}",
                    "body": "Leave request for ${leave.num_days} days from ${leave.start_date} to ${leave.end_date}"
                },
                "on_success": "manager_approval"
            },
            {
                "id": "manager_approval",
                "type": "approval",
                "name": "Manager Approval",
                "config": {
                    "roles": ["Manager", "Department Head"],
                    "timeout_days": 3,
                    "auto_escalate": True
                },
                "on_approved": "leave_approval",
                "on_rejected": "notify_rejection",
                "on_timeout": "escalate_to_hr"
            },
            {
                "id": "leave_approval",
                "type": "leave_approval",
                "name": "Approve Leave",
                "config": {},
                "on_success": "notify_approval",
                "on_failure": "notify_error"
            },
            {
                "id": "notify_approval",
                "type": "notification",
                "name": "Notify Staff - Approved",
                "config": {
                    "template": "leave_approved",
                    "recipients": ["${staff.email}"],
                    "subject": "Leave Request Approved"
                },
                "on_success": "complete"
            },
            {
                "id": "notify_rejection",
                "type": "notification",
                "name": "Notify Staff - Rejected",
                "config": {
                    "template": "leave_rejected",
                    "recipients": ["${staff.email}"],
                    "subject": "Leave Request Rejected",
                    "body": "${validation.errors}"
                },
                "on_success": "complete"
            },
            {
                "id": "escalate_to_hr",
                "type": "notification",
                "name": "Escalate to HR",
                "config": {
                    "template": "leave_escalation",
                    "recipients": ["hr@company.com"],
                    "subject": "Leave Request Escalation Required"
                },
                "on_success": "hr_approval"
            },
            {
                "id": "hr_approval",
                "type": "approval",
                "name": "HR Approval",
                "config": {
                    "roles": ["HR Manager"],
                    "timeout_days": 2
                },
                "on_approved": "leave_approval",
                "on_rejected": "notify_rejection"
            },
            {
                "id": "notify_error",
                "type": "notification",
                "name": "Notify Error",
                "config": {
                    "template": "system_error",
                    "recipients": ["hr@company.com"],
                    "subject": "Error Processing Leave Request"
                }
            }
        ]
    }
}

# Extended Leave Request Workflow (> max consecutive days)
EXTENDED_LEAVE_WORKFLOW = {
    "name": "Extended Leave Approval",
    "description": "Workflow for extended leave requests requiring additional approval",
    "category": "hr",
    "workflow_definition": {
        "version": "1.0",
        "steps": [
            {
                "id": "validate",
                "type": "leave_validation",
                "name": "Validate Leave Request",
                "on_success": "manager_approval"
            },
            {
                "id": "manager_approval",
                "type": "approval",
                "name": "Department Manager Approval",
                "config": {
                    "roles": ["Manager", "Department Head"],
                    "required": True
                },
                "on_approved": "hr_review",
                "on_rejected": "notify_rejection"
            },
            {
                "id": "hr_review",
                "type": "approval",
                "name": "HR Manager Review",
                "config": {
                    "roles": ["HR Manager"],
                    "required": True
                },
                "on_approved": "director_approval",
                "on_rejected": "notify_rejection"
            },
            {
                "id": "director_approval",
                "type": "approval",
                "name": "Director Approval",
                "config": {
                    "roles": ["Director", "CFO"],
                    "required": True,
                    "comment": "Extended leave requires director approval"
                },
                "on_approved": "leave_approval",
                "on_rejected": "notify_rejection"
            },
            {
                "id": "leave_approval",
                "type": "leave_approval",
                "name": "Approve Leave",
                "on_success": "notify_approval"
            },
            {
                "id": "notify_approval",
                "type": "notification",
                "name": "Notify Approval",
                "config": {
                    "recipients": ["${staff.email}"],
                    "subject": "Extended Leave Request Approved"
                }
            },
            {
                "id": "notify_rejection",
                "type": "notification",
                "name": "Notify Rejection",
                "config": {
                    "recipients": ["${staff.email}"],
                    "subject": "Leave Request Not Approved"
                }
            }
        ]
    }
}

# Payroll Processing Workflow
PAYROLL_PROCESSING_WORKFLOW = {
    "name": "Monthly Payroll Processing",
    "description": "Workflow for processing monthly payroll",
    "category": "hr",
    "workflow_definition": {
        "version": "1.0",
        "steps": [
            {
                "id": "calculate",
                "type": "payroll_calculation",
                "name": "Calculate Payroll",
                "config": {
                    "include_overtime": True,
                    "calculate_tax": True
                },
                "on_success": "review_totals",
                "on_failure": "notify_error"
            },
            {
                "id": "review_totals",
                "type": "conditional",
                "name": "Check Payroll Totals",
                "condition": "${step.calculate.payslips_created} > 0",
                "on_true": "hr_review",
                "on_false": "notify_error"
            },
            {
                "id": "hr_review",
                "type": "approval",
                "name": "HR Manager Review",
                "config": {
                    "roles": ["HR Manager"],
                    "required": True,
                    "display_summary": True
                },
                "on_approved": "finance_approval",
                "on_rejected": "notify_rejected"
            },
            {
                "id": "finance_approval",
                "type": "approval",
                "name": "Finance Manager Approval",
                "config": {
                    "roles": ["Finance Manager", "CFO"],
                    "required": True,
                    "show_totals": True
                },
                "on_approved": "generate_payslips",
                "on_rejected": "notify_rejected"
            },
            {
                "id": "generate_payslips",
                "type": "payslip_generation",
                "name": "Generate Payslips",
                "config": {
                    "generate_pdf": True,
                    "email_payslips": True
                },
                "on_success": "notify_completion",
                "on_failure": "notify_error"
            },
            {
                "id": "notify_completion",
                "type": "notification",
                "name": "Notify Completion",
                "config": {
                    "recipients": ["hr@company.com", "finance@company.com"],
                    "subject": "Payroll Processing Complete",
                    "body": "Generated ${step.generate_payslips.payslips_generated} payslips. Total: ${step.calculate.total_net_pay}"
                },
                "on_success": "complete"
            },
            {
                "id": "notify_rejected",
                "type": "notification",
                "name": "Notify Rejection",
                "config": {
                    "recipients": ["hr@company.com"],
                    "subject": "Payroll Rejected - Review Required"
                }
            },
            {
                "id": "notify_error",
                "type": "notification",
                "name": "Notify Error",
                "config": {
                    "recipients": ["hr@company.com", "it@company.com"],
                    "subject": "Error Processing Payroll"
                }
            }
        ]
    }
}

# Attendance Tracking Workflow
ATTENDANCE_TRACKING_WORKFLOW = {
    "name": "Daily Attendance Tracking",
    "description": "Automated attendance tracking workflow",
    "category": "hr",
    "workflow_definition": {
        "version": "1.0",
        "steps": [
            {
                "id": "record_attendance",
                "type": "attendance_tracking",
                "name": "Record Attendance",
                "config": {
                    "calculate_hours": True,
                    "detect_overtime": True
                },
                "on_success": "check_late_arrival",
                "on_failure": "notify_error"
            },
            {
                "id": "check_late_arrival",
                "type": "conditional",
                "name": "Check if Late",
                "condition": "${step.record_attendance.status} == 'late'",
                "on_true": "notify_late",
                "on_false": "check_overtime"
            },
            {
                "id": "notify_late",
                "type": "notification",
                "name": "Notify Late Arrival",
                "config": {
                    "recipients": ["${staff.manager_email}"],
                    "subject": "Late Arrival - ${staff.first_name}",
                    "body": "Late arrival recorded on ${date}"
                },
                "on_success": "check_overtime"
            },
            {
                "id": "check_overtime",
                "type": "conditional",
                "name": "Check Overtime",
                "condition": "${step.record_attendance.overtime_hours} > 0",
                "on_true": "notify_overtime",
                "on_false": "complete"
            },
            {
                "id": "notify_overtime",
                "type": "notification",
                "name": "Notify Overtime",
                "config": {
                    "recipients": ["hr@company.com"],
                    "subject": "Overtime Recorded - ${staff.first_name}",
                    "body": "Overtime: ${step.record_attendance.overtime_hours} hours"
                },
                "on_success": "complete"
            }
        ]
    }
}

# List of all workflow templates
HR_WORKFLOW_TEMPLATES = [
    STANDARD_LEAVE_WORKFLOW,
    EXTENDED_LEAVE_WORKFLOW,
    PAYROLL_PROCESSING_WORKFLOW,
    ATTENDANCE_TRACKING_WORKFLOW,
]
