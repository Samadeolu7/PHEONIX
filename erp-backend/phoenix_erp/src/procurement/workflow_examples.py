# procurement/workflow_examples.py
"""
Example procurement workflow templates using the existing WorkflowTemplate system.

These show how to configure procurement workflows WITHOUT creating a separate config system.
Just use the existing WorkflowTemplate, WorkflowBinding, and step handler architecture!
"""

# Example 1: Standard Purchase Requisition Workflow
STANDARD_PR_WORKFLOW = {
    "name": "Standard Purchase Requisition Approval",
    "description": "Standard PR workflow with department manager approval",
    "trigger_type": "event",
    "trigger_config": {
        "event_name": "pr_submitted"
    },
    "workflow_definition": {
        "initial_step": "validate_pr",
        "steps": [
            {
                "id": "validate_pr",
                "type": "validation",
                "name": "Validate PR Data",
                "config": {
                    "rules": [
                        {
                            "field": "estimated_total",
                            "operator": "greater_than",
                            "value": 0,
                            "error_message": "Total amount must be greater than 0"
                        },
                        {
                            "field": "items",
                            "operator": "not_empty",
                            "error_message": "PR must have at least one item"
                        }
                    ]
                },
                "next": "check_amount"
            },
            {
                "id": "check_amount",
                "type": "condition",
                "name": "Check if High Value",
                "config": {
                    "conditions": [
                        {
                            "field": "${form.estimated_total}",
                            "operator": "greater_than",
                            "value": 100000
                        }
                    ]
                },
                "transitions": [
                    {
                        "condition_result": True,
                        "next": "cfo_approval"  # High value - needs CFO
                    },
                    {
                        "condition_result": False,
                        "next": "manager_approval"  # Standard - just manager
                    }
                ]
            },
            {
                "id": "manager_approval",
                "type": "approval",
                "name": "Department Manager Approval",
                "config": {
                    "approvers": {
                        "type": "role",
                        "roles": ["Department Manager"]
                    },
                    "message": "Please approve Purchase Requisition ${context.pr_number} for ${form.estimated_total}",
                    "timeout_hours": 24
                },
                "on_approve": "update_pr_approved",
                "on_reject": "notify_rejection"
            },
            {
                "id": "cfo_approval",
                "type": "approval",
                "name": "CFO Approval (High Value)",
                "config": {
                    "approvers": {
                        "type": "role",
                        "roles": ["CFO", "Finance Manager"]
                    },
                    "message": "High-value PR ${context.pr_number} requires CFO approval: ${form.estimated_total}",
                    "timeout_hours": 48
                },
                "on_approve": "update_pr_approved",
                "on_reject": "notify_rejection"
            },
            {
                "id": "update_pr_approved",
                "type": "update",
                "name": "Mark PR as Approved",
                "config": {
                    "model": "procurement.PurchaseRequisition",
                    "record_id": "${context.pr_id}",
                    "updates": {
                        "status": "approved",
                        "approved_at": "${now}",
                        "approved_by_id": "${approver.id}"
                    }
                },
                "next": "notify_requester"
            },
            {
                "id": "notify_requester",
                "type": "notification",
                "name": "Notify Requester",
                "config": {
                    "type": "email",
                    "recipient": "${context.requested_by_email}",
                    "subject": "PR ${context.pr_number} Approved",
                    "template": "pr_approved"
                },
                "next": None  # End workflow
            },
            {
                "id": "notify_rejection",
                "type": "notification",
                "name": "Notify Rejection",
                "config": {
                    "type": "email",
                    "recipient": "${context.requested_by_email}",
                    "subject": "PR ${context.pr_number} Rejected",
                    "template": "pr_rejected"
                },
                "next": None  # End workflow
            }
        ]
    }
}


# Example 2: Purchase Order with 3-Way Matching
PO_WITH_3WAY_MATCHING_WORKFLOW = {
    "name": "Purchase Order with 3-Way Matching",
    "description": "Full PO lifecycle with GRN and invoice matching",
    "trigger_type": "event",
    "trigger_config": {
        "event_name": "po_created"
    },
    "workflow_definition": {
        "initial_step": "validate_po",
        "steps": [
            {
                "id": "validate_po",
                "type": "validation",
                "name": "Validate PO",
                "config": {
                    "rules": [
                        {"field": "supplier_id", "operator": "not_empty"},
                        {"field": "total_amount", "operator": "greater_than", "value": 0},
                        {"field": "items", "operator": "not_empty"}
                    ]
                },
                "next": "po_approval"
            },
            {
                "id": "po_approval",
                "type": "approval",
                "name": "Purchasing Manager Approval",
                "config": {
                    "approvers": {
                        "type": "role",
                        "roles": ["Purchasing Manager"]
                    },
                    "message": "Approve PO ${context.po_number} to ${form.supplier_name} for ₦${form.total_amount}"
                },
                "on_approve": "send_to_supplier",
                "on_reject": "notify_rejection"
            },
            {
                "id": "send_to_supplier",
                "type": "notification",
                "name": "Send PO to Supplier",
                "config": {
                    "type": "email",
                    "recipient": "${form.supplier_email}",
                    "subject": "Purchase Order ${context.po_number}",
                    "template": "po_to_supplier",
                    "attachments": ["po_pdf"]
                },
                "next": "update_po_sent"
            },
            {
                "id": "update_po_sent",
                "type": "update",
                "name": "Mark PO as Sent",
                "config": {
                    "model": "procurement.PurchaseOrder",
                    "record_id": "${context.po_id}",
                    "updates": {
                        "status": "sent"
                    }
                },
                "next": None  # Wait for GRN to be created manually
            },
            # Note: GRN creation would trigger a separate workflow
            # When invoice arrives, that triggers the matching workflow below
        ]
    }
}


# Example 3: Invoice Matching and Payment Approval
INVOICE_MATCHING_WORKFLOW = {
    "name": "Invoice 3-Way Matching and Payment",
    "description": "Match invoice to PO/GRN and approve payment",
    "trigger_type": "event",
    "trigger_config": {
        "event_name": "invoice_received"
    },
    "workflow_definition": {
        "initial_step": "perform_3way_match",
        "steps": [
            {
                "id": "perform_3way_match",
                "type": "three_way_matching",  # Our new custom step!
                "name": "Match PO → GRN → Invoice",
                "config": {
                    "po_id": "${context.po_id}",
                    "grn_id": "${context.grn_id}",
                    "invoice_amount": "${form.invoice_amount}",
                    "invoice_items": "${form.invoice_items}"
                },
                "on_passed": "auto_approve_payment",
                "on_warning": "finance_review",
                "on_failed": "escalate_to_manager",
                "require_approval_on_mismatch": True
            },
            {
                "id": "auto_approve_payment",
                "type": "update",
                "name": "Auto-Approve Payment",
                "config": {
                    "model": "liabilities.AccountsPayable",
                    "record_id": "${context.ap_id}",
                    "updates": {
                        "status": "approved",
                        "approved_at": "${now}"
                    }
                },
                "next": "schedule_payment"
            },
            {
                "id": "finance_review",
                "type": "approval",
                "name": "Finance Manager Review",
                "config": {
                    "approvers": {
                        "type": "role",
                        "roles": ["Finance Manager"]
                    },
                    "message": "Invoice matching has warnings. Please review:\n${step_perform_3way_match.summary}"
                },
                "on_approve": "schedule_payment",
                "on_reject": "reject_invoice"
            },
            {
                "id": "escalate_to_manager",
                "type": "approval",
                "name": "Senior Manager Approval",
                "config": {
                    "approvers": {
                        "type": "role",
                        "roles": ["Purchasing Manager", "CFO"]
                    },
                    "approval_mode": "parallel",
                    "approval_threshold": {
                        "type": "any"  # Any one can approve
                    },
                    "message": "Invoice matching FAILED. Critical discrepancies found:\n${step_perform_3way_match.summary}"
                },
                "on_approve": "schedule_payment",
                "on_reject": "reject_invoice"
            },
            {
                "id": "schedule_payment",
                "type": "notification",
                "name": "Schedule Payment",
                "config": {
                    "type": "system",
                    "recipient": "payment_team",
                    "message": "Payment approved for invoice ${form.invoice_number}, schedule for ${form.payment_date}"
                },
                "next": None
            },
            {
                "id": "reject_invoice",
                "type": "notification",
                "name": "Reject Invoice",
                "config": {
                    "type": "email",
                    "recipient": "${form.supplier_email}",
                    "subject": "Invoice ${form.invoice_number} Rejected",
                    "message": "Your invoice has been rejected due to matching discrepancies."
                },
                "next": None
            }
        ]
    }
}


# Example 4: Emergency/Direct Purchase Workflow (Skip GRN)
EMERGENCY_PURCHASE_WORKFLOW = {
    "name": "Emergency Direct Purchase",
    "description": "Simplified workflow for urgent purchases - no GRN required",
    "trigger_type": "manual",
    "workflow_definition": {
        "initial_step": "urgent_approval",
        "steps": [
            {
                "id": "urgent_approval",
                "type": "approval",
                "name": "Emergency Purchase Approval",
                "config": {
                    "approvers": {
                        "type": "role",
                        "roles": ["Branch Manager", "Operations Manager"]
                    },
                    "approval_mode": "parallel",
                    "approval_threshold": {
                        "type": "any"  # Any one can approve urgently
                    },
                    "message": "URGENT: Emergency purchase request for ${form.description}"
                },
                "on_approve": "create_direct_po",
                "on_reject": "notify_rejection"
            },
            {
                "id": "create_direct_po",
                "type": "update",
                "name": "Create Direct PO",
                "config": {
                    "model": "procurement.PurchaseOrder",
                    "create": True,
                    "data": {
                        "supplier_id": "${form.supplier_id}",
                        "status": "approved",
                        "requires_approval": False,  # Pre-approved
                        "notes": "Emergency purchase - pre-approved"
                    }
                },
                "next": "send_to_supplier"
            }
        ]
    }
}


# HOW TO USE THESE WORKFLOWS:
"""
1. Create WorkflowTemplate records with these definitions
2. Create WorkflowBindings to link forms to workflows:

   # Standard PR workflow for all purchase requisitions
   WorkflowBinding.objects.create(
       form_schema=pr_form,
       workflow_template=standard_pr_workflow,
       priority=10,
       parameters={}  # No special params needed
   )
   
   # High-value PO workflow for amounts > 100,000
   WorkflowBinding.objects.create(
       form_schema=po_form,
       workflow_template=high_value_po_workflow,
       priority=20,  # Higher priority
       parameters={
           "min_amount": 100000
       }
   )
   
3. Forms automatically trigger the right workflow based on:
   - Binding priority
   - Parameter matching (amount, category, etc.)
   - Conditional logic in workflow steps

NO NEED FOR SEPARATE CONFIG MODELS!
Everything is already supported by the existing system!
"""
