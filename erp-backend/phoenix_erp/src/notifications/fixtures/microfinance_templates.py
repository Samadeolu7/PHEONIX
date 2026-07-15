# notifications/fixtures/microfinance_templates.py
"""
Sample notification templates for microfinance operations
Run this as a management command to create initial templates
"""

MICROFINANCE_TEMPLATES = [
    # ============================================
    # TRANSACTION NOTIFICATIONS
    # ============================================
    {
        'code': 'transaction_receipt',
        'name': 'Transaction Receipt',
        'category': 'transactions',
        'description': 'Receipt confirmation for completed transactions',
        'default_priority': 'normal',
        'template_variables': [
            {'name': 'client_name', 'source': 'client.full_name', 'required': True},
            {'name': 'transaction_ref', 'source': 'transaction.reference_number', 'required': True},
            {'name': 'transaction_type', 'source': 'transaction.description', 'required': True},
            {'name': 'amount', 'source': 'transaction.amount', 'format': 'currency', 'required': True},
            {'name': 'balance', 'source': 'account.balance', 'format': 'currency', 'required': True},
            {'name': 'transaction_date', 'source': 'transaction.date', 'format': 'date', 'required': True},
            {'name': 'branch_name', 'source': 'branch.name', 'required': False},
        ],
        'channels': [
            {
                'channel_code': 'sms',
                'subject_template': '',
                'body_template': (
                    'Dear {{client_name}}, your transaction was successful. '
                    'Ref: {{transaction_ref}}, Amount: {{amount}}, '
                    'Balance: {{balance}}. Thank you.'
                ),
            },
            {
                'channel_code': 'email',
                'subject_template': 'Transaction Receipt - {{transaction_ref}}',
                'body_template': (
                    'Dear {{client_name}},\n\n'
                    'Your transaction has been completed successfully.\n\n'
                    'Transaction Details:\n'
                    '- Reference: {{transaction_ref}}\n'
                    '- Type: {{transaction_type}}\n'
                    '- Amount: {{amount}}\n'
                    '- Date: {{transaction_date}}\n'
                    '- Current Balance: {{balance}}\n\n'
                    'Thank you for banking with us.\n\n'
                    'Best regards,\n'
                    '{{branch_name}}'
                ),
                'html_template': (
                    '<html><body>'
                    '<h2>Transaction Receipt</h2>'
                    '<p>Dear {{client_name}},</p>'
                    '<p>Your transaction has been completed successfully.</p>'
                    '<table style="border-collapse:collapse; width:100%;">'
                    '<tr><td style="padding:8px; border:1px solid #ddd;"><strong>Reference:</strong></td>'
                    '<td style="padding:8px; border:1px solid #ddd;">{{transaction_ref}}</td></tr>'
                    '<tr><td style="padding:8px; border:1px solid #ddd;"><strong>Type:</strong></td>'
                    '<td style="padding:8px; border:1px solid #ddd;">{{transaction_type}}</td></tr>'
                    '<tr><td style="padding:8px; border:1px solid #ddd;"><strong>Amount:</strong></td>'
                    '<td style="padding:8px; border:1px solid #ddd;">{{amount}}</td></tr>'
                    '<tr><td style="padding:8px; border:1px solid #ddd;"><strong>Date:</strong></td>'
                    '<td style="padding:8px; border:1px solid #ddd;">{{transaction_date}}</td></tr>'
                    '<tr><td style="padding:8px; border:1px solid #ddd;"><strong>Balance:</strong></td>'
                    '<td style="padding:8px; border:1px solid #ddd;">{{balance}}</td></tr>'
                    '</table>'
                    '<p>Thank you for banking with us.</p>'
                    '<p>Best regards,<br>{{branch_name}}</p>'
                    '</body></html>'
                ),
            },
            {
                'channel_code': 'in_app',
                'subject_template': 'Transaction Completed',
                'body_template': (
                    'Transaction {{transaction_ref}} completed. '
                    'Amount: {{amount}}, Balance: {{balance}}'
                ),
            }
        ],
    },
    
    # ============================================
    # SAVINGS ACCOUNT NOTIFICATIONS
    # ============================================
    {
        'code': 'savings_deposit',
        'name': 'Savings Deposit Notification',
        'category': 'savings',
        'description': 'Notification for savings account deposits',
        'default_priority': 'normal',
        'template_variables': [
            {'name': 'client_name', 'source': 'client.full_name', 'required': True},
            {'name': 'account_number', 'source': 'account.account_number', 'required': True},
            {'name': 'amount', 'source': 'amount', 'format': 'currency', 'required': True},
            {'name': 'balance', 'source': 'balance', 'format': 'currency', 'required': True},
            {'name': 'deposit_date', 'source': 'date', 'format': 'date', 'required': True},
        ],
        'channels': [
            {
                'channel_code': 'sms',
                'subject_template': '',
                'body_template': (
                    'Dear {{client_name}}, {{amount}} has been deposited to your account '
                    '{{account_number}}. New balance: {{balance}}.'
                ),
            },
            {
                'channel_code': 'email',
                'subject_template': 'Deposit Confirmation',
                'body_template': (
                    'Dear {{client_name}},\n\n'
                    'A deposit of {{amount}} has been credited to your savings account.\n\n'
                    'Account: {{account_number}}\n'
                    'New Balance: {{balance}}\n'
                    'Date: {{deposit_date}}\n\n'
                    'Thank you.'
                ),
            },
        ],
    },
    
    {
        'code': 'savings_withdrawal',
        'name': 'Savings Withdrawal Notification',
        'category': 'savings',
        'description': 'Notification for savings account withdrawals',
        'default_priority': 'high',
        'template_variables': [
            {'name': 'client_name', 'source': 'client.full_name', 'required': True},
            {'name': 'account_number', 'source': 'account.account_number', 'required': True},
            {'name': 'amount', 'source': 'amount', 'format': 'currency', 'required': True},
            {'name': 'balance', 'source': 'balance', 'format': 'currency', 'required': True},
            {'name': 'withdrawal_date', 'source': 'date', 'format': 'date', 'required': True},
        ],
        'channels': [
            {
                'channel_code': 'sms',
                'subject_template': '',
                'body_template': (
                    'Dear {{client_name}}, {{amount}} has been withdrawn from account '
                    '{{account_number}}. Balance: {{balance}}.'
                ),
            },
        ],
    },
    
    {
        'code': 'low_balance_alert',
        'name': 'Low Balance Alert',
        'category': 'alerts',
        'description': 'Alert when account balance falls below threshold',
        'default_priority': 'high',
        'send_conditions': {
            'all_of': [
                {'field': 'balance', 'operator': '<', 'value': 1000}
            ]
        },
        'template_variables': [
            {'name': 'client_name', 'source': 'client.full_name', 'required': True},
            {'name': 'account_number', 'source': 'account.account_number', 'required': True},
            {'name': 'balance', 'source': 'balance', 'format': 'currency', 'required': True},
            {'name': 'minimum_balance', 'source': 'minimum_balance', 'format': 'currency', 'required': True},
        ],
        'channels': [
            {
                'channel_code': 'sms',
                'subject_template': '',
                'body_template': (
                    'ALERT: Dear {{client_name}}, your account {{account_number}} balance '
                    '({{balance}}) is below minimum ({{minimum_balance}}). Please deposit.'
                ),
            },
        ],
    },
    
    # ============================================
    # LOAN NOTIFICATIONS
    # ============================================
    {
        'code': 'loan_application_received',
        'name': 'Loan Application Received',
        'category': 'loans',
        'description': 'Confirmation that loan application was received',
        'default_priority': 'normal',
        'template_variables': [
            {'name': 'client_name', 'source': 'client.full_name', 'required': True},
            {'name': 'loan_amount', 'source': 'loan.amount', 'format': 'currency', 'required': True},
            {'name': 'loan_type', 'source': 'loan.product_name', 'required': True},
            {'name': 'application_ref', 'source': 'loan.reference_number', 'required': True},
        ],
        'channels': [
            {
                'channel_code': 'sms',
                'subject_template': '',
                'body_template': (
                    'Dear {{client_name}}, your loan application (Ref: {{application_ref}}) '
                    'for {{loan_amount}} has been received and is under review.'
                ),
            },
            {
                'channel_code': 'email',
                'subject_template': 'Loan Application Received - {{application_ref}}',
                'body_template': (
                    'Dear {{client_name}},\n\n'
                    'Thank you for applying for a loan with us.\n\n'
                    'Application Details:\n'
                    '- Reference: {{application_ref}}\n'
                    '- Loan Type: {{loan_type}}\n'
                    '- Amount Requested: {{loan_amount}}\n\n'
                    'Your application is currently under review. '
                    'We will notify you once a decision has been made.\n\n'
                    'Thank you for your patience.'
                ),
            },
        ],
    },
    
    {
        'code': 'loan_approved',
        'name': 'Loan Approval Notification',
        'category': 'loans',
        'description': 'Notification when loan is approved',
        'default_priority': 'high',
        'template_variables': [
            {'name': 'client_name', 'source': 'client.full_name', 'required': True},
            {'name': 'loan_amount', 'source': 'loan.approved_amount', 'format': 'currency', 'required': True},
            {'name': 'loan_type', 'source': 'loan.product_name', 'required': True},
            {'name': 'interest_rate', 'source': 'loan.interest_rate', 'format': 'percentage', 'required': True},
            {'name': 'repayment_period', 'source': 'loan.repayment_period_months', 'required': True},
            {'name': 'monthly_payment', 'source': 'loan.monthly_payment', 'format': 'currency', 'required': True},
        ],
        'channels': [
            {
                'channel_code': 'sms',
                'subject_template': '',
                'body_template': (
                    'Congratulations {{client_name}}! Your loan of {{loan_amount}} has been approved. '
                    'Monthly payment: {{monthly_payment}} for {{repayment_period}} months. '
                    'Visit branch to complete disbursement.'
                ),
            },
            {
                'channel_code': 'email',
                'subject_template': 'Loan Approved - Congratulations!',
                'body_template': (
                    'Dear {{client_name}},\n\n'
                    'Congratulations! Your loan application has been approved.\n\n'
                    'Loan Details:\n'
                    '- Loan Type: {{loan_type}}\n'
                    '- Approved Amount: {{loan_amount}}\n'
                    '- Interest Rate: {{interest_rate}}\n'
                    '- Repayment Period: {{repayment_period}} months\n'
                    '- Monthly Payment: {{monthly_payment}}\n\n'
                    'Please visit our branch to complete the disbursement process.\n\n'
                    'Congratulations once again!'
                ),
            },
        ],
    },
    
    {
        'code': 'loan_disbursed',
        'name': 'Loan Disbursement Notification',
        'category': 'loans',
        'description': 'Notification when loan is disbursed',
        'default_priority': 'high',
        'template_variables': [
            {'name': 'client_name', 'source': 'client.full_name', 'required': True},
            {'name': 'loan_amount', 'source': 'loan.disbursed_amount', 'format': 'currency', 'required': True},
            {'name': 'disbursement_date', 'source': 'loan.disbursement_date', 'format': 'date', 'required': True},
            {'name': 'first_payment_date', 'source': 'loan.first_payment_date', 'format': 'date', 'required': True},
            {'name': 'monthly_payment', 'source': 'loan.monthly_payment', 'format': 'currency', 'required': True},
        ],
        'channels': [
            {
                'channel_code': 'sms',
                'subject_template': '',
                'body_template': (
                    'Dear {{client_name}}, your loan of {{loan_amount}} has been disbursed. '
                    'First payment of {{monthly_payment}} due on {{first_payment_date}}.'
                ),
            },
        ],
    },
    
    {
        'code': 'loan_payment_reminder',
        'name': 'Loan Payment Reminder',
        'category': 'reminders',
        'description': 'Reminder for upcoming loan payment',
        'default_priority': 'normal',
        'template_variables': [
            {'name': 'client_name', 'source': 'client.full_name', 'required': True},
            {'name': 'payment_amount', 'source': 'payment.amount', 'format': 'currency', 'required': True},
            {'name': 'due_date', 'source': 'payment.due_date', 'format': 'date', 'required': True},
            {'name': 'outstanding_balance', 'source': 'loan.outstanding_balance', 'format': 'currency', 'required': True},
        ],
        'schedule_config': {
            'delay_seconds': 0,
            'business_hours_only': True
        },
        'channels': [
            {
                'channel_code': 'sms',
                'subject_template': '',
                'body_template': (
                    'REMINDER: Dear {{client_name}}, your loan payment of {{payment_amount}} '
                    'is due on {{due_date}}. Outstanding: {{outstanding_balance}}.'
                ),
            },
        ],
    },
    
    {
        'code': 'loan_payment_overdue',
        'name': 'Loan Payment Overdue',
        'category': 'alerts',
        'description': 'Alert for overdue loan payment',
        'default_priority': 'urgent',
        'template_variables': [
            {'name': 'client_name', 'source': 'client.full_name', 'required': True},
            {'name': 'overdue_amount', 'source': 'payment.amount', 'format': 'currency', 'required': True},
            {'name': 'due_date', 'source': 'payment.due_date', 'format': 'date', 'required': True},
            {'name': 'days_overdue', 'source': 'payment.days_overdue', 'required': True},
            {'name': 'penalty_amount', 'source': 'payment.penalty', 'format': 'currency', 'required': False},
        ],
        'channels': [
            {
                'channel_code': 'sms',
                'subject_template': '',
                'body_template': (
                    'URGENT: Dear {{client_name}}, your loan payment of {{overdue_amount}} '
                    'was due on {{due_date}} ({{days_overdue}} days overdue). '
                    'Please pay immediately to avoid penalties.'
                ),
            },
        ],
    },
    
    {
        'code': 'loan_payment_received',
        'name': 'Loan Payment Received',
        'category': 'loans',
        'description': 'Confirmation of loan payment',
        'default_priority': 'normal',
        'template_variables': [
            {'name': 'client_name', 'source': 'client.full_name', 'required': True},
            {'name': 'payment_amount', 'source': 'payment.amount', 'format': 'currency', 'required': True},
            {'name': 'payment_date', 'source': 'payment.date', 'format': 'date', 'required': True},
            {'name': 'outstanding_balance', 'source': 'loan.outstanding_balance', 'format': 'currency', 'required': True},
            {'name': 'next_payment_date', 'source': 'loan.next_payment_date', 'format': 'date', 'required': False},
        ],
        'channels': [
            {
                'channel_code': 'sms',
                'subject_template': '',
                'body_template': (
                    'Dear {{client_name}}, payment of {{payment_amount}} received. '
                    'Outstanding balance: {{outstanding_balance}}. '
                    'Thank you!'
                ),
            },
        ],
    },
    
    {
        'code': 'loan_fully_paid',
        'name': 'Loan Fully Paid',
        'category': 'loans',
        'description': 'Notification when loan is fully paid off',
        'default_priority': 'high',
        'template_variables': [
            {'name': 'client_name', 'source': 'client.full_name', 'required': True},
            {'name': 'loan_amount', 'source': 'loan.original_amount', 'format': 'currency', 'required': True},
            {'name': 'total_paid', 'source': 'loan.total_paid', 'format': 'currency', 'required': True},
            {'name': 'completion_date', 'source': 'loan.completion_date', 'format': 'date', 'required': True},
        ],
        'channels': [
            {
                'channel_code': 'sms',
                'subject_template': '',
                'body_template': (
                    'Congratulations {{client_name}}! You have successfully paid off your loan of '
                    '{{loan_amount}}. Thank you for your commitment!'
                ),
            },
            {
                'channel_code': 'email',
                'subject_template': 'Loan Fully Paid - Congratulations!',
                'body_template': (
                    'Dear {{client_name}},\n\n'
                    'Congratulations! You have successfully completed payment of your loan.\n\n'
                    'Original Loan Amount: {{loan_amount}}\n'
                    'Total Amount Paid: {{total_paid}}\n'
                    'Completion Date: {{completion_date}}\n\n'
                    'Thank you for your commitment and timely payments. '
                    'We look forward to serving you again.\n\n'
                    'Best regards'
                ),
            },
        ],
    },
    
    # ============================================
    # ACCOUNT STATUS NOTIFICATIONS
    # ============================================
    {
        'code': 'account_dormant_warning',
        'name': 'Account Dormancy Warning',
        'category': 'alerts',
        'description': 'Warning that account will become dormant',
        'default_priority': 'normal',
        'template_variables': [
            {'name': 'client_name', 'source': 'client.full_name', 'required': True},
            {'name': 'account_number', 'source': 'account.account_number', 'required': True},
            {'name': 'days_inactive', 'source': 'account.days_inactive', 'required': True},
            {'name': 'balance', 'source': 'account.balance', 'format': 'currency', 'required': True},
        ],
        'channels': [
            {
                'channel_code': 'sms',
                'subject_template': '',
                'body_template': (
                    'Dear {{client_name}}, your account {{account_number}} has been inactive '
                    'for {{days_inactive}} days. Please make a transaction to keep it active.'
                ),
            },
        ],
    },
    
    # ============================================
    # KYC AND VERIFICATION
    # ============================================
    {
        'code': 'kyc_verification_required',
        'name': 'KYC Verification Required',
        'category': 'kyc',
        'description': 'Notification for KYC verification requirement',
        'default_priority': 'high',
        'template_variables': [
            {'name': 'client_name', 'source': 'client.full_name', 'required': True},
            {'name': 'required_documents', 'source': 'documents_list', 'required': True},
            {'name': 'deadline', 'source': 'kyc.deadline', 'format': 'date', 'required': True},
        ],
        'channels': [
            {
                'channel_code': 'sms',
                'subject_template': '',
                'body_template': (
                    'Dear {{client_name}}, please update your KYC documents before {{deadline}}. '
                    'Visit branch with required documents.'
                ),
            },
        ],
    },
    
    {
        'code': 'kyc_verified',
        'name': 'KYC Verification Complete',
        'category': 'kyc',
        'description': 'Confirmation of KYC verification',
        'default_priority': 'normal',
        'template_variables': [
            {'name': 'client_name', 'source': 'client.full_name', 'required': True},
            {'name': 'verification_date', 'source': 'kyc.verification_date', 'format': 'date', 'required': True},
        ],
        'channels': [
            {
                'channel_code': 'sms',
                'subject_template': '',
                'body_template': (
                    'Dear {{client_name}}, your KYC verification is complete. '
                    'All services are now fully available. Thank you!'
                ),
            },
        ],
    },
    
    # ============================================
    # MONTHLY STATEMENTS
    # ============================================
    {
        'code': 'monthly_statement',
        'name': 'Monthly Account Statement',
        'category': 'statements',
        'description': 'Monthly account statement notification',
        'default_priority': 'normal',
        'template_variables': [
            {'name': 'client_name', 'source': 'client.full_name', 'required': True},
            {'name': 'account_number', 'source': 'account.account_number', 'required': True},
            {'name': 'month', 'source': 'statement.month', 'required': True},
            {'name': 'opening_balance', 'source': 'statement.opening_balance', 'format': 'currency', 'required': True},
            {'name': 'closing_balance', 'source': 'statement.closing_balance', 'format': 'currency', 'required': True},
            {'name': 'total_deposits', 'source': 'statement.total_deposits', 'format': 'currency', 'required': True},
            {'name': 'total_withdrawals', 'source': 'statement.total_withdrawals', 'format': 'currency', 'required': True},
        ],
        'channels': [
            {
                'channel_code': 'email',
                'subject_template': 'Monthly Statement - {{month}}',
                'body_template': (
                    'Dear {{client_name}},\n\n'
                    'Your account statement for {{month}}:\n\n'
                    'Account: {{account_number}}\n'
                    'Opening Balance: {{opening_balance}}\n'
                    'Total Deposits: {{total_deposits}}\n'
                    'Total Withdrawals: {{total_withdrawals}}\n'
                    'Closing Balance: {{closing_balance}}\n\n'
                    'Detailed statement is attached.\n\n'
                    'Thank you.'
                ),
            },
        ],
    },

    # ============================================
    # BANK RECONCILIATION ALERTS
    # ============================================
    {
        'code': 'bank_recon_bank_only_exception',
        'name': 'High-Priority Reconciliation Exception',
        'category': 'alerts',
        'description': (
            'Covers both bank_only ("bank has cash the ERP doesn\'t know about") '
            'and erp_only ("recorded as paid but never actually banked") — the two '
            'most serious cash-accountability signatures a reconciliation can '
            'surface. Sent to directors only; branch managers/credit officers are '
            'exactly who this control exists to check, so they are never recipients.'
        ),
        'default_priority': 'urgent',
        'template_variables': [
            {'name': 'bank_account', 'source': 'bank_account', 'required': True},
            {'name': 'exception_type_label', 'source': 'exception.type_label', 'required': True},
            {'name': 'amount', 'source': 'exception.amount', 'format': 'currency', 'required': True},
            {'name': 'narration', 'source': 'exception.narration', 'required': False},
            {'name': 'date', 'source': 'exception.date', 'format': 'date', 'required': True},
            {'name': 'officer', 'source': 'exception.officer', 'required': False},
            # Deliberately NOT sourced from a raw context key also named
            # 'branch' — see banks/tasks.py's _notify_directors_of_
            # high_priority_exception for why that collision breaks
            # rendering (a raw dict silently overwrites the resolved value).
            {'name': 'branch', 'source': 'recon_branch.name', 'required': False},
        ],
        'channels': [
            {
                'channel_code': 'in_app',
                'subject_template': '{{exception_type_label}} — {{bank_account}}',
                'body_template': (
                    '{{exception_type_label}} — {{amount}} on {{date}} in {{bank_account}}'
                    '{% if branch %} ({{branch}}){% endif %}'
                    '{% if officer %}, recorded by {{officer}}{% endif %}. '
                    'Narration: {{narration}}. Review in Bank Reconciliation.'
                ),
            },
            {
                'channel_code': 'email',
                'subject_template': '{{exception_type_label}} — {{bank_account}}',
                'body_template': (
                    '{{exception_type_label}} and needs director review.\n\n'
                    'Account: {{bank_account}}\n'
                    '{% if branch %}Branch: {{branch}}\n{% endif %}'
                    '{% if officer %}Recorded by: {{officer}}\n{% endif %}'
                    'Amount: {{amount}}\n'
                    'Date: {{date}}\n'
                    'Narration: {{narration}}\n\n'
                    'This is one of the two exception types most likely to represent '
                    'cash that was collected but never actually reached the bank — '
                    'please review it in Bank Reconciliation.'
                ),
            },
        ],
    },
]


