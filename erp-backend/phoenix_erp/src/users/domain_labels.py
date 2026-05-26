# Domain-specific label mappings
"""
This module provides default label mappings for different domain types.
These can be overridden in Tenant.custom_labels for specific customizations.
"""

# Default label mappings by domain type
DOMAIN_LABEL_MAPPINGS = {
    'microfinance': {
        # Entities
        'client': 'Client',
        'clients': 'Clients',
        'client_id': 'Client ID',
        
        # Modules
        'loan': 'Loan',
        'loans': 'Loans',
        'loan_application': 'Loan Application',
        'loan_disbursement': 'Disbursement',
        'loan_repayment': 'Repayment',
        
        'savings': 'Savings Account',
        'savings_plural': 'Savings Accounts',
        'deposit': 'Deposit',
        'withdrawal': 'Withdrawal',
        
        'transaction': 'Transaction',
        'transactions': 'Transactions',
        
        'payment': 'Payment',
        'payments': 'Payments',
        
        'balance': 'Balance',
        'principal': 'Principal',
        'interest': 'Interest',
        'penalty': 'Penalty Fee',
        
        # Relationships
        'guarantor': 'Guarantor',
        'co_borrower': 'Co-borrower',
        'next_of_kin': 'Next of Kin',
        
        # Statuses
        'active': 'Active',
        'inactive': 'Inactive',
        'suspended': 'Suspended',
        'blacklisted': 'Blacklisted',
        
        # Documents
        'id_verification': 'ID Verification',
        'proof_of_income': 'Proof of Income',
        'proof_of_address': 'Proof of Address',
        
        # Actions
        'disburse': 'Disburse',
        'approve': 'Approve',
        'reject': 'Reject',
        
        # Additional terms
        'account': 'Account',
        'statement': 'Account Statement',
        'receipt': 'Payment Receipt',
        'balance_due': 'Balance Due',
        'overdue': 'Overdue',
        'credit': 'Credit',
        'arrears': 'Arrears',
    },
    
    'school': {
        # Entities
        'client': 'Student',
        'clients': 'Students',
        'client_id': 'Student ID',
        
        # Alternative for parents
        'client_alt': 'Parent/Guardian',
        'clients_alt': 'Parents/Guardians',
        
        # Modules
        'loan': 'Payment Plan',
        'loans': 'Payment Plans',
        'loan_application': 'Payment Plan Request',
        'loan_disbursement': 'Fee Invoice',
        'loan_repayment': 'Fee Payment',
        
        # Savings -> School Fund/Escrow (for schools that hold parent deposits or prepayments)
        'savings': 'Prepaid Account',
        'savings_plural': 'Prepaid Accounts',
        'deposit': 'Prepayment',
        'withdrawal': 'Refund',
        
        'transaction': 'Transaction',
        'transactions': 'Transactions',
        
        'payment': 'Fee Payment',
        'payments': 'Fee Payments',
        
        'balance': 'Outstanding Fees',
        'principal': 'Base Fee Amount',
        'interest': 'Late Payment Charge',
        'penalty': 'Additional Charge',
        
        # Relationships
        'guarantor': 'Parent/Guardian',
        'co_borrower': 'Co-Parent/Guardian',
        'next_of_kin': 'Emergency Contact',
        
        # Statuses
        'active': 'Enrolled',
        'inactive': 'Graduated/Left',
        'suspended': 'Suspended',
        'blacklisted': 'Expelled',
        
        # Documents
        'id_verification': 'Birth Certificate',
        'proof_of_income': 'Parent Income Proof',
        'proof_of_address': 'Proof of Residence',
        
        # Actions
        'disburse': 'Issue Invoice',
        'approve': 'Approve Enrollment',
        'reject': 'Decline Enrollment',
        
        # School-specific
        'class': 'Class',
        'grade': 'Grade Level',
        'term': 'Term/Semester',
        'academic_year': 'Academic Year',
        'tuition': 'Tuition Fee',
        'books': 'Book Fee',
        'uniform': 'Uniform Fee',
        'transport': 'Transportation Fee',
        
        # Additional terms
        'account': 'Student Account',
        'statement': 'Fee Statement',
        'receipt': 'Fee Receipt',
        'balance_due': 'Fees Due',
        'overdue': 'Fees Overdue',
        'credit': 'Credit / Overpayment',
        'arrears': 'Unpaid Fees',
    },
    
    'hospital': {
        # Entities
        'client': 'Patient',
        'clients': 'Patients',
        'client_id': 'Patient ID',
        
        # Modules
        'loan': 'Payment Plan',
        'loans': 'Payment Plans',
        'loan_application': 'Payment Plan Application',
        'loan_disbursement': 'Medical Bill',
        'loan_repayment': 'Bill Payment',
        
        'savings': 'Health Savings Account',
        'savings_plural': 'Health Savings Accounts',
        'deposit': 'Deposit',
        'withdrawal': 'Withdrawal',
        
        'transaction': 'Transaction',
        'transactions': 'Transactions',
        
        'payment': 'Payment',
        'payments': 'Payments',
        
        'balance': 'Outstanding Balance',
        'principal': 'Treatment Cost',
        'interest': 'Service Charge',
        'penalty': 'Late Payment Fee',
        
        # Relationships
        'guarantor': 'Guarantor',
        'co_borrower': 'Co-payer',
        'next_of_kin': 'Emergency Contact',
        
        # Statuses
        'active': 'Active Patient',
        'inactive': 'Inactive',
        'suspended': 'Suspended',
        'blacklisted': 'Banned',
        
        # Documents
        'id_verification': 'ID Verification',
        'proof_of_income': 'Insurance Card',
        'proof_of_address': 'Proof of Residence',
        
        # Actions
        'disburse': 'Issue Bill',
        'approve': 'Approve Treatment',
        'reject': 'Decline Treatment',
        
        # Hospital-specific
        'ward': 'Ward',
        'department': 'Department',
        'doctor': 'Doctor',
        'appointment': 'Appointment',
        'prescription': 'Prescription',
        'diagnosis': 'Diagnosis',
        
        # Additional terms
        'account': 'Patient Account',
        'statement': 'Medical Bill Statement',
        'receipt': 'Payment Receipt',
        'balance_due': 'Amount Due',
        'overdue': 'Payment Overdue',
        'credit': 'Credit Balance',
        'arrears': 'Unpaid Bills',
    },
    
    'retail': {
        # Entities
        'client': 'Customer',
        'clients': 'Customers',
        'client_id': 'Customer ID',
        
        # Modules
        'loan': 'Credit Account',
        'loans': 'Credit Accounts',
        'loan_application': 'Credit Application',
        'loan_disbursement': 'Credit Issued',
        'loan_repayment': 'Credit Payment',
        
        'savings': 'Loyalty Account',
        'savings_plural': 'Loyalty Accounts',
        'deposit': 'Points Earned',
        'withdrawal': 'Points Redeemed',
        
        'transaction': 'Transaction',
        'transactions': 'Transactions',
        
        'payment': 'Payment',
        'payments': 'Payments',
        
        'balance': 'Outstanding Balance',
        'principal': 'Purchase Amount',
        'interest': 'Finance Charge',
        'penalty': 'Late Fee',
        
        # Relationships
        'guarantor': 'Guarantor',
        'co_borrower': 'Joint Account Holder',
        'next_of_kin': 'Emergency Contact',
        
        # Statuses
        'active': 'Active Customer',
        'inactive': 'Inactive',
        'suspended': 'Suspended',
        'blacklisted': 'Banned',
        
        # Documents
        'id_verification': 'ID Verification',
        'proof_of_income': 'Credit Reference',
        'proof_of_address': 'Proof of Address',
        
        # Actions
        'disburse': 'Issue Credit',
        'approve': 'Approve Purchase',
        'reject': 'Decline Purchase',
        
        # Retail-specific
        'product': 'Product',
        'inventory': 'Inventory',
        'sale': 'Sale',
        'purchase_order': 'Purchase Order',
        'supplier': 'Supplier',
        
        # Additional terms
        'account': 'Customer Account',
        'statement': 'Account Statement',
        'receipt': 'Purchase Receipt',
        'balance_due': 'Balance Due',
        'overdue': 'Past Due',
        'credit': 'Store Credit',
        'arrears': 'Outstanding Balance',
    },
}


def get_domain_labels(domain_type, custom_labels=None):
    """
    Get the complete label mapping for a domain type.
    
    Args:
        domain_type: One of 'microfinance', 'school', 'hospital', 'retail'
        custom_labels: Optional dict of custom label overrides from Tenant.custom_labels
    
    Returns:
        Dict of label mappings
    """
    # Start with default labels for the domain
    labels = DOMAIN_LABEL_MAPPINGS.get(domain_type, DOMAIN_LABEL_MAPPINGS['microfinance']).copy()
    
    # Apply custom overrides if provided
    if custom_labels:
        # Ensure custom_labels is a dictionary
        if not isinstance(custom_labels, dict):
            # Log warning but continue with default labels
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(
                f"Invalid custom_labels type: {type(custom_labels)}. "
                f"Expected dict, got {type(custom_labels).__name__}. "
                f"Value: {custom_labels!r}"
            )
        else:
            try:
                labels.update(custom_labels)
            except (ValueError, TypeError) as e:
                # Log error but don't crash - return default labels
                import logging
                logger = logging.getLogger(__name__)
                logger.error(
                    f"Failed to update labels with custom_labels: {e}. "
                    f"custom_labels value: {custom_labels!r}"
                )
    
    return labels


def get_label(domain_type, key, custom_labels=None, default=None):
    """
    Get a specific label for a domain type.
    
    Args:
        domain_type: One of 'microfinance', 'school', 'hospital', 'retail'
        key: The label key to look up
        custom_labels: Optional dict of custom label overrides
        default: Default value if key not found
    
    Returns:
        The label string, or the key itself if not found
    """
    labels = get_domain_labels(domain_type, custom_labels)
    return labels.get(key, default or key.replace('_', ' ').title())
