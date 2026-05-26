# Examples of business function configurations

# Database Operation
db_operation = {
    "name": "get_customer_balance",
    "friendly_name": "Get Customer Balance",
    "function_type": "database",
    "config": {
        "operation": "query",
        "query": """
            SELECT SUM(amount) as balance 
            FROM transactions 
            WHERE customer_id = %(customer_id)s
        """,
        "parameters": {
            "customer_id": "customer_id"
        }
    }
}

# File Operation
file_operation = {
    "name": "save_invoice_pdf",
    "friendly_name": "Save Invoice PDF",
    "function_type": "file",
    "config": {
        "operation": "write",
        "path": "invoices/{year}/{month}/{invoice_number}.pdf"
    }
}

# Email Notification
email_notification = {
    "name": "send_invoice_email",
    "friendly_name": "Send Invoice Email",
    "function_type": "email",
    "config": {
        "subject": "Invoice #{invoice_number}",
        "template": """
            Dear {{customer_name}},
            
            Your invoice #{{invoice_number}} for {{amount}} is ready.
            
            Best regards,
            Your Company
        """,
        "from_email": "invoices@company.com",
        "html": True
    }
}

# SMS Notification
sms_notification = {
    "name": "send_payment_reminder",
    "friendly_name": "Send Payment Reminder",
    "function_type": "sms",
    "config": {
        "provider": "twilio",
        "account_sid": "your_account_sid",
        "auth_token": "your_auth_token",
        "from_number": "+1234567890",
        "message": "Payment reminder: Your invoice #{invoice_number} for {amount} is due on {due_date}"
    }
}

# Webhook
webhook = {
    "name": "notify_shipping_partner",
    "friendly_name": "Notify Shipping Partner",
    "function_type": "webhook",
    "config": {
        "url": "https://api.shipping.com/orders",
        "method": "POST",
        "headers": {
            "Authorization": "Bearer your_token",
            "Content-Type": "application/json"
        }
    }
}

# Calculation
calculation = {
    "name": "calculate_total_with_tax",
    "friendly_name": "Calculate Total with Tax",
    "function_type": "calculation",
    "config": {
        "formula": "subtotal * tax_rate",
        "variables": {
            "subtotal": "amount",
            "tax_rate": "tax_rate"
        }
    }
}

# Data Validation
validation = {
    "name": "validate_invoice_data",
    "friendly_name": "Validate Invoice Data",
    "function_type": "validation",
    "config": {
        "rules": [
            {
                "field": "amount",
                "required": True,
                "type": "number",
                "min": 0
            },
            {
                "field": "invoice_number",
                "required": True,
                "pattern": "^INV-\\d{6}$"
            },
            {
                "field": "customer_id",
                "required": True
            }
        ]
    }
}

# Example workflow that uses multiple functions
invoice_workflow = {
    "name": "invoice_processing",
    "description": "Process and send invoices",
    "steps": [
        {
            "code": "validate",
            "label": "Validate Data",
            "business_function": validation
        },
        {
            "code": "calculate",
            "label": "Calculate Totals",
            "business_function": calculation
        },
        {
            "code": "generate",
            "label": "Generate Invoice",
            "business_function": file_operation
        },
        {
            "code": "notify",
            "label": "Send Notifications",
            "business_function": email_notification
        }
    ],
    "requires_approval": False
}

# Example of a conditional workflow
payment_workflow = {
    "name": "payment_processing",
    "description": "Process payments with different flows based on amount",
    "steps": [
        {
            "code": "validate",
            "label": "Validate Payment",
            "business_function": {
                "name": "validate_payment",
                "function_type": "validation",
                "config": {
                    "rules": [
                        {
                            "field": "amount",
                            "required": True,
                            "type": "number",
                            "min": 0
                        }
                    ]
                }
            }
        },
        {
            "code": "check_amount",
            "label": "Check Amount",
            "business_function": {
                "name": "check_payment_amount",
                "function_type": "condition",
                "config": {
                    "condition": "amount >= 10000",
                    "true_step": "require_approval",
                    "false_step": "process_payment"
                }
            }
        },
        {
            "code": "require_approval",
            "label": "Get Manager Approval",
            "business_function": {
                "name": "manager_approval",
                "function_type": "approval",
                "config": {
                    "requiredRoles": ["manager"],
                    "message": "Please approve payment of {amount}"
                }
            }
        },
        {
            "code": "process_payment",
            "label": "Process Payment",
            "business_function": {
                "name": "bank_transfer",
                "function_type": "api_call",
                "config": {
                    "apiEndpoint": "https://api.bank.com/transfer",
                    "method": "POST"
                }
            }
        },
        {
            "code": "notify",
            "label": "Send Confirmation",
            "business_function": email_notification
        }
    ]
}
