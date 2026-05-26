from decimal import Decimal
from datetime import datetime, timedelta

# Constants for matching
AMOUNT_TOLERANCE = Decimal('5.00')  # Allow up to 5 units difference
TIGHT_SECONDS = 3  # Atomic transaction window
LOOSE_MINUTES = 15  # Fallback window for non-atomic matches

def parse_any_datetime(raw):
    """Parse datetime from various formats."""
    if not raw:
        return datetime.now()
    if isinstance(raw, datetime):
        return raw
    try:
        return datetime.fromisoformat(str(raw).replace('Z', '+00:00'))
    except:
        try:
            return datetime.strptime(str(raw).split('.')[0], '%Y-%m-%d %H:%M:%S')
        except:
            return datetime.now()

def normalize_name(name):
    """Normalize a client name for consistent matching."""
    if not name:
        return ""
    # Convert to lowercase and remove extra spaces
    name = " ".join(str(name).lower().split())
    return name


def names_match(name1, name2, threshold=0.8):
    """Check if two names match, allowing for slight variations."""
    name1 = normalize_name(name1)
    name2 = normalize_name(name2)
    
    if name1 == name2:
        return True
        
    # Split into parts and check if most parts match
    parts1 = set(name1.split())
    parts2 = set(name2.split())
    
    if not parts1 or not parts2:
        return False
        
    common_parts = parts1.intersection(parts2)
    similarity = len(common_parts) / max(len(parts1), len(parts2))
    
    return similarity >= threshold


def parse_date(fields, *keys):
    """Parse date from fields dictionary."""
    raw = None
    for key in keys:
        val = fields.get(key)
        if val:
            raw = val
            break
            
    if not raw:
        return datetime.now().date(), datetime.now()
        
    try:
        dt = datetime.strptime(raw.split('.')[0], '%Y-%m-%d %H:%M:%S')
        return dt.date(), dt
    except:
        return datetime.now().date(), datetime.now()


def to_decimal(val):
    """Convert value to Decimal safely."""
    if val is None or val == '':
        return Decimal('0')
    return Decimal(str(val))


def find_transaction_group(entry, all_entries, max_seconds=3):
    """Find all related entries either by transaction ID or tight time window.
    
    Args:
        entry: The entry to find matches for
        all_entries: List of all entries to search through
        max_seconds: Maximum time difference for time-based matching
        
    Returns:
        (matches, method) where method is either 'tx_id' or 'time'
    """
    # First try transaction ID
    tx_id = entry.get('fields', {}).get('transaction_id')
    if tx_id:
        matches = []
        for e in all_entries:
            if e.get('matched'):
                continue
            if e.get('fields', {}).get('transaction_id') == tx_id:
                matches.append(e)
        if len(matches) > 1:  # Need at least 2 entries to consider it a group
            return matches, 'tx_id'
    
    # Fallback to time-based matching
    matches = []
    entry_dt = parse_any_datetime(entry.get('fields', {}).get('created_at'))
    entry_amount = abs(to_decimal(entry.get('fields', {}).get('amount')))
    
    for e in all_entries:
        if e.get('matched') or e == entry:
            continue
        e_dt = parse_any_datetime(e.get('fields', {}).get('created_at'))
        if abs((entry_dt - e_dt).total_seconds()) <= max_seconds:
            e_amount = abs(to_decimal(e.get('fields', {}).get('amount')))
            if abs(entry_amount - e_amount) < AMOUNT_TOLERANCE:
                matches.append(e)
    
    if matches:
        matches.append(entry)
        return matches, 'time'
        
    return [entry], 'single'

def find_by_transaction_id(transaction_id, all_payments):
    """Find all entries that share the same transaction ID."""
    if not transaction_id or not all_payments:
        return []
    
    matches = []
    for payment in all_payments:
        if payment.get('matched'):
            continue
        p_transaction_id = payment['fields'].get('transaction_id')
        if p_transaction_id and p_transaction_id == transaction_id:
            matches.append(payment)
    
    return matches

def find_matching_transfer(amount, date, desc, all_payments):
    """Find matching transfer entry within time window and with opposite amount."""
    if not amount or not desc or not all_payments:
        return None

    desc = desc.lower()
    amount = to_decimal(amount)

    # First try matching by transaction ID
    transaction_id = None
    for payment in all_payments:
        if not payment.get('matched'):
            p_desc = payment['fields'].get('description', '').lower()
            if ('transfer' in p_desc or 'cash deposit' in p_desc):
                transaction_id = payment['fields'].get('transaction_id')
                if transaction_id:
                    matches = find_by_transaction_id(transaction_id, all_payments)
                    for match in matches:
                        p_amount = to_decimal(match['fields'].get('amount'))
                        if abs(amount + p_amount) < Decimal('0.01'):  # Opposite amounts
                            return match

    # Fallback to time-based matching
    for payment in all_payments:
        if payment.get('matched'):
            continue
            
        p_amount = to_decimal(payment['fields'].get('amount'))
        if abs(amount + p_amount) < Decimal('0.01'):  # Opposite amounts
            p_date, _ = parse_date(payment['fields'], 'payment_date', 'created_at')
            if abs((date - p_date).days) <= 3:  # Within 3 days
                p_desc = payment['fields'].get('description', '').lower()
                if ('transfer' in p_desc or 'cash deposit' in p_desc):
                    return payment
    return None



def find_payment_by_time_and_amount(amount, date, payments, window_minutes=15, transaction_id=None):
    """Find a payment with matching amount within a time window.
    
    First tries matching by transaction ID if provided, then falls back to time-based matching.
    For atomic transactions, they should be within 3 seconds of each other.
    """
    if not amount or not date or not payments:
        return None
    amount = to_decimal(amount)
    
    # First try matching by transaction ID if available
    if transaction_id:
        matches = find_by_transaction_id(transaction_id, payments)
        for payment in matches:
            p_amount = to_decimal(payment['fields'].get('amount'))
            if abs(amount - p_amount) < Decimal('0.01'):
                payment['matched'] = True
                return payment
    
    # Then try a very tight window (3 seconds) for atomic transactions
    for payment in payments:
        if payment.get('matched'):
            continue
        p_amount = to_decimal(payment['fields'].get('amount'))
        if abs(amount - p_amount) < Decimal('0.01'):
            p_date, p_dt = parse_date(payment['fields'], 'payment_date', 'created_at')
            # First try matching by exact timestamps for atomic transactions
            time_diff = abs((date - p_date).total_seconds())
            if time_diff <= 3:  # Within 3 seconds (tightened from 30)
                payment['matched'] = True
                return payment
                
    # If no match found, try the wider window as last resort
    for payment in payments:
        if payment.get('matched'):
            continue
        p_amount = to_decimal(payment['fields'].get('amount'))
        if abs(amount - p_amount) < Decimal('0.01'):
            p_date, p_dt = parse_date(payment['fields'], 'payment_date', 'created_at')
            time_diff = abs((date - p_date).total_seconds()) / 60.0
            if time_diff <= window_minutes:
                payment['matched'] = True
                return payment
    return None

def find_loan_payment_match(amount, date, loan_payments, client_name=None, transaction_id=None):
    """Find matching loan payment using following priority:
    1. Transaction ID match
    2. Time (within 3 seconds) + Amount match
    3. Client name + Amount + Date (within 3 days) match
    """
    if not amount or not date or not loan_payments:
        return None
    amount = abs(to_decimal(amount))
    client_name = normalize_name(client_name) if client_name else None

    # First try transaction ID matching
    if transaction_id:
        matches = find_by_transaction_id(transaction_id, loan_payments)
        for payment in matches:
            p_amount = abs(to_decimal(payment['fields'].get('amount')))
            if abs(amount - p_amount) < Decimal('0.01'):
                payment['matched'] = True
                return payment

    # Then try tight time window matching (3 seconds)
    match = find_payment_by_time_and_amount(amount, date, loan_payments, window_minutes=0.05)
    if match:
        return match

    # Finally try client name matching with longer time window
    for payment in loan_payments:
        if payment.get('matched'):
            continue
        p_amount = abs(to_decimal(payment['fields'].get('amount')))
        if abs(amount - p_amount) < Decimal('0.01'):
            p_date, _ = parse_date(payment['fields'], 'payment_date', 'created_at')
            if abs((date - p_date).days) <= 3:
                if client_name:
                    p_client = payment['fields'].get('client_name', '')
                    p_client = normalize_name(p_client)
                    if not names_match(client_name, p_client):
                        continue
                payment['matched'] = True
                return payment
    return None


def split_combined_payment(amount, client_name, all_payments):
    """Try to split a combined savings and loan payment into its components."""
    if not amount or not client_name:
        return None, None
        
    amount = to_decimal(amount)
    
    # Look for pairs of loan and savings payments that add up to the total
    savings_candidates = []
    loan_candidates = []
    
    for payment in all_payments:
        if payment.get('matched'):
            continue
            
        p_desc = payment['fields'].get('description', '').lower()
        p_amount = to_decimal(payment['fields'].get('amount'))
        
        if p_amount <= 0:
            continue
            
        extracted_name = extract_client_name(p_desc)
        if not extracted_name or not names_match(extracted_name, client_name):
            continue
            
        if 'loan payment' in p_desc:
            loan_candidates.append((p_amount, payment))
        elif 'savings' in p_desc:
            savings_candidates.append((p_amount, payment))
            
    # Try all combinations to find matching total
    for savings_amount, savings_payment in savings_candidates:
        for loan_amount, loan_payment in loan_candidates:
            if abs((savings_amount + loan_amount) - amount) < Decimal('0.01'):
                return (savings_payment, loan_payment)
                
    return None, None

import re

def collapse_spaced_letters(text: str) -> str:
    """
    Fix 'stretched' text like 'S a v i n g s   P a y m e n t   b y   Y e m i  A k i n s a n y a'
    -> 'Savings Payment by Yemi Akinsanya'. Only touches A–Z letters; numbers/punct. are left alone.
    """
    if not text:
        return ""
    s = str(text)

    # Replace every run of 'A z a z ...' (single letters separated by single spaces) with the joined word.
    # Example match: 'S a v i n g s' or 'b y' or 'O l a j u m o k e'
    pattern = re.compile(r'\b(?:[A-Za-z]\s)+(?:[A-Za-z])\b')

    while True:
        new_s = pattern.sub(lambda m: m.group(0).replace(' ', ''), s)
        if new_s == s:
            break
        s = new_s

    # Normalize whitespace
    s = re.sub(r'\s{2,}', ' ', s).strip()
    return s


def extract_client_name(desc):
    """Extract client name from common description patterns."""
    if not desc:
        return None

    # NEW: fix stretched text first
    desc = collapse_spaced_letters(desc).lower()

    patterns = [
        'savings for ', 'savings payment by ', 'savings payment for ',
        'loan payment from ', 'loan disbursement to ',
        'combined savings and loan payment by ',
        'withdrawal by '
    ]

    for pattern in patterns:
        if pattern in desc:
            name = desc.split(pattern)[-1].strip()
            # Clean up common suffixes
            name = name.split(' - ')[0].strip()
            name = name.split(' for ')[0].strip()
            name = name.split(' loan')[0].strip()  # Handle "Name loan payment"
            return name

    # Additional search for client name in other formats
    if 'loan payment' in desc or 'savings payment' in desc or 'withdrawal by' in desc:
        # Try to extract name before "loan payment" or "savings payment"
        parts = desc.split('loan payment')[0].split('savings payment')[0].split('withdrawal by')[-1].strip()
        if parts and len(parts.split()) >= 2:  # At least two words for a name
            return parts

    return None




def classify_transaction_group(entries):
    """
    Classify a group of transactions by analyzing their patterns and relationships.
    Returns the classification and a list of related transactions.
    """
    if not entries:
        return 'unknown', []
        
    # Sort entries by created timestamp
    enriched = []
    for entry in entries:
        if entry.get('matched'):
            continue
        desc = (entry.get('fields', {}).get('description') or '').lower()
        amount = to_decimal(entry.get('fields', {}).get('amount'))
        dt = parse_any_datetime(entry.get('fields', {}).get('created_at'))
        enriched.append((entry, desc, amount, dt))
    
    enriched.sort(key=lambda x: x[3])  # Sort by timestamp
    
    # Look for common patterns in the group
    amounts = [abs(e[2]) for e in enriched]
    descriptions = [e[1] for e in enriched]
    
    # Check for transfers (opposite amounts within tolerance)
    if len(entries) >= 2:
        positive = [(e,a) for e,_,a,_ in enriched if a > 0]
        negative = [(e,abs(a)) for e,_,a,_ in enriched if a < 0]
        
        for p_entry, p_amt in positive:
            for n_entry, n_amt in negative:
                if abs(p_amt - n_amt) <= AMOUNT_TOLERANCE:
                    if any('transfer' in d for d in descriptions):
                        return 'transfer', [p_entry, n_entry]
    
    # Check for combined savings + loan payment
    if len(entries) >= 2:
        savings = []
        loans = []
        
        for entry, desc, amt, _ in enriched:
            if 'savings' in desc or 'contribution' in desc:
                savings.append((entry, abs(amt)))
            elif 'loan payment' in desc or 'loan repayment' in desc:
                loans.append((entry, abs(amt)))
                
        if savings and loans:
            total_savings = sum(a for _, a in savings)
            total_loans = sum(a for _, a in loans)
            
            # Look for matching bank entry
            bank_entries = [(e,a) for e,d,a,_ in enriched 
                          if ('bank' in d or 'cash' in d)]
                          
            if bank_entries:
                bank_total = sum(abs(a) for _,a in bank_entries)
                if abs(bank_total - (total_savings + total_loans)) <= AMOUNT_TOLERANCE:
                    entries = [e for e,_ in savings + loans + bank_entries]
                    return 'combined_payment', entries
    
    # Check for pure loan payment
    loan_patterns = ['loan payment', 'loan repayment']
    if any(any(p in d for p in loan_patterns) for d in descriptions):
        return 'loan_payment', [e for e,d,_,_ in enriched]
    
    loan_disbursement_patterns = ['loan disbursement']
    if any(any(p in d for p in loan_disbursement_patterns) for d in descriptions):
        print(f"Loan disbursement detected: {desc} {amount}")
        return 'loan_disbursement', [e for e,d,_,_ in enriched]
    # Check for pure savings
    savings_patterns = ['savings', 'contribution', 'deposit']
    if any(any(p in d for p in savings_patterns) for d in descriptions):
        return 'savings_payment', [e for e,d,_,_ in enriched]
        
    # Check for fees/income
    fee_patterns = ['registration fee', 'service fee', 'processing fee']
    if any(any(p in d for p in fee_patterns) for d in descriptions):
        return 'fee_payment', [e for e,d,_,_ in enriched]
        
    # Check for expenses
    if any('expense' in d for d in descriptions):
        return 'expense', [e for e,d,_,_ in enriched]
    
    # for liability transactions
    if any('union contribution' in d for d in descriptions):
        return 'liability', [e for e,d,_,_ in enriched]
    
    if any('cash transfered' in d or 'cash transferred' in d for d in descriptions):
        return 'liability', [e for e,d,_,_ in enriched]
    
    if any('control account' in d for d in descriptions):
        return 'control account', [e for e,d,_,_ in enriched]

def classify_transaction(desc, amount, date=None, all_payments=None, loan_payments=None):
    """Legacy wrapper for old classify_transaction interface"""
    if not desc:
        return 'unknown'
        
    # Convert parameters into entry-style dict for group classifier
    entry = {
        'fields': {
            'description': desc,
            'amount': amount,
            'created_at': date
        }
    }
    
    classification, _ = classify_transaction_group([entry])
    return classification