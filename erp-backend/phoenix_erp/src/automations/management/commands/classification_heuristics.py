# automations/management/commands/classification_heuristics.py
from decimal import Decimal
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)

def classify_transaction(desc, amount, date, all_payments, loan_payments):
    """Classify transaction based on description, amount, and context"""
    if not desc:
        return 'unknown'
        
    desc_lower = desc.lower()
    amount = Decimal(amount) if amount else Decimal('0')
    print(f"Classifying: {desc} {amount}")

    if 'loan disbursement' in desc_lower and amount < 0:
        print(f"Loan disbursement detected: {desc} {amount}")
        return 'loan_disbursement'
    
    # Income payments (fees)
    fee_patterns = [
        'registration fee', 'id fee', 'sms fee', 'loan registration fee',
        'service fee', 'processing fee', 'card fee', 'risk premium',
        'loan service fee', 'loan registration'
    ]
    if any(pattern in desc_lower for pattern in fee_patterns):
        if 'risk premium' in desc_lower:
            return 'risk_premium'
        return 'fee_income'
        
    # Check for combined savings and loan payment
    if desc_lower.startswith('combined savings and loan payment by'):
        client_name = extract_client_name(desc)
        if client_name:
            from .transaction_heuristics import split_combined_payment
            savings_match, loan_match = split_combined_payment(amount, client_name, all_payments)
            if savings_match and loan_match:
                savings_match['matched'] = True
                loan_match['matched'] = True
                return 'combined_payment'
                
    # Savings transactions
    savings_patterns = [
        'savings for ', 'savings payment by ', 'savings payment for ',
        'savings contribution', 'daily contribution', 'monthly savings',
        'savings payment'
    ]
    if any(pattern in desc_lower for pattern in savings_patterns):
        return 'savings_payment'
        
    # Loan-related transactions
    
        
    if 'loan payment' in desc_lower or 'loan repayment' in desc_lower:
        client_name = extract_client_name(desc)
        matching_loan = find_loan_payment_match(amount, date, loan_payments, client_name)
        if matching_loan:
            return 'loan_payment'
            
    # Union contributions
    if ('union contribution' in desc_lower or 
        (desc_lower.startswith('union ') and amount == Decimal('1000.00'))):
        return 'union_contribution'
        
    # Inter-bank transfers
    if desc_lower.startswith('transfer from ') or desc_lower.startswith('transfer to '):
        matching_transfer = find_matching_transfer(amount, date, desc, all_payments)
        if matching_transfer:
            matching_transfer['matched'] = True
            return 'matched_transfer'
            
        if 'cash in hand' in desc_lower:
            return 'cash_transfer'
        if 'union pulse' in desc_lower:
            return 'internal_transfer'
        if amount % 100 == 0 and abs(amount) >= Decimal('10000.00'):
            return 'bank_transfer'
        
    if 'cash transfered' in desc_lower or 'cash transferred' in desc_lower:
        return 'cash_transfer'
        
    # Expense transactions
    if desc_lower.startswith('expense for '):
        return 'expense_payment'
        
    # Capital transactions
    if 'capital to business' in desc_lower:
        return 'capital'
        
    # Try client name matching as fallback
    client_name = extract_client_name(desc)
    if client_name:
        # If large negative amount, likely loan disbursement
        if amount < 0 and abs(amount) >= Decimal('50000.00'):
            return 'loan_disbursement'
        # If medium positive amount, check for loan payment match
        if amount > 0:
            matching_loan = find_loan_payment_match(amount, date, loan_payments, client_name)
            if matching_loan:
                return 'loan_payment'
            elif amount <= Decimal('10000.00'):
                return 'savings_payment'
                
    return 'unknown'

def extract_client_name(description):
    """Extract client name from transaction description"""
    # Implementation from original script
    pass

def find_loan_payment_match(amount, date, loan_payments, client_name=None):
    """Find matching loan payment"""
    # Implementation from original script
    pass

def find_matching_transfer(amount, date, desc, all_payments):
    """Find matching bank transfer"""
    # Implementation from original script
    pass

def names_match(name1, name2, threshold=0.85):
    """Check if two names match using fuzzy matching"""
    # Implementation from original script
    pass