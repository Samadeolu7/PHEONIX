"""
Centralized Account Creation Utility

Ensures all accounts follow proper structure:
- Parent accounts: 3-digit codes (100-599)
- Child accounts: {parent_code}-{suffix} (e.g., 101-001, 501-001)
- Child accounts MUST have a parent
- Enforces proper account hierarchy and validation
"""

from decimal import Decimal
from django.core.exceptions import ValidationError
from django.db import transaction
from accounts.models import Account

# Simple in-memory process cache to reduce repeated DB hits for hot system accounts.
# Keyed by (tenant_id, owner_id, branch_id, code)
_ACCOUNT_CACHE = {}


def get_or_create_child_account(
    parent_code,
    child_suffix,
    name,
    account_type,
    owner,
    branch,
    tenant,
    description=None,
    parent_name=None,
    parent_allow_manual_entries=False
):
    """
    Get or create a child account, ensuring parent exists first.
    
    This is the CORRECT way to create accounts for transactions:
    1. Ensures parent account exists (or creates it)
    2. Creates child account with proper parent reference
    3. Enforces code structure: {parent_code}-{child_suffix}
    
    Args:
        parent_code (str): Parent account code (e.g., '501', '130', '210')
        child_suffix (str): Child suffix (e.g., '001', '002')
        name (str): Child account name
        account_type (str): Account type (ASSET, LIABILITY, EQUITY, INCOME, EXPENSE)
        owner: User instance
        branch: Branch instance
        tenant: Tenant instance
        description (str, optional): Account description
        parent_name (str, optional): Parent account name (created if parent doesn't exist)
        parent_allow_manual_entries (bool): Whether parent allows direct transactions
        
    Returns:
        Account: Child account instance (ready to use in transactions)
        
    Example:
        # Get or create "General Operating Expenses" (501-001)
        account = get_or_create_child_account(
            parent_code='501',
            child_suffix='001',
            name='General Operating Expenses',
            account_type='EXPENSE',
            owner=user,
            branch=branch,
            tenant=tenant,
            parent_name='General Expenses'
        )
    """
    # Validate parent code format (should not have suffix)
    if '-' in parent_code:
        raise ValidationError(
            f"Parent code '{parent_code}' should not contain '-'. "
            f"Use base code only (e.g., '501' not '501-001')"
        )

    # Validate parent code is 3 digits in range 100-599
    try:
        parent_code_int = int(parent_code)
        if parent_code_int < 100 or parent_code_int > 599:
            raise ValidationError(
                f"Parent code '{parent_code}' must be between 100-599"
            )
    except ValueError:
        raise ValidationError(
            f"Parent code '{parent_code}' must be a valid 3-digit number (100-599)"
        )

    # Normalize parent code to 3 digits
    parent_code = str(parent_code_int).zfill(3)

    # Validate child suffix format (should be numeric)
    if not str(child_suffix).isdigit():
        raise ValidationError(
            f"Child suffix '{child_suffix}' must be numeric (e.g., '001', '002')"
        )

    # Normalize suffix to zero-padded 3 digits
    child_suffix = str(child_suffix).zfill(3)

    # Build requested child code
    requested_child_code = f"{parent_code}-{child_suffix}"

    tenant_id = getattr(tenant, 'id', None)
    owner_id = getattr(owner, 'id', None)
    branch_id = getattr(branch, 'id', None)

    def _cache_get(code):
        return _ACCOUNT_CACHE.get((tenant_id, owner_id, branch_id, code))

    def _cache_set(code, account):
        try:
            _ACCOUNT_CACHE[(tenant_id, owner_id, branch_id, code)] = account
        except Exception:
            pass

    # Transactional: ensure parent and child creation is atomic
    with transaction.atomic():
        # Ensure parent exists and does not clash; if clash, find nearest available
        parent_account = Account.objects.filter(
            tenant=tenant,
            owner=owner,
            branch=branch,
            code=parent_code,
            account_level='PARENT'
        ).first()

        if parent_account:
            # If parent exists but has different account_type, treat as clash
            if parent_account.account_type != account_type:
                # Resolve to nearest available parent code
                parent_code = _find_nearest_parent_code(tenant, owner, branch, parent_code)
                parent_account = None

        if not parent_account:
            # If cache has a parent for the new parent_code, return it
            cached = _cache_get(parent_code)
            if cached:
                parent_account = cached
            else:
                parent_account, created = Account.objects.get_or_create(
                    tenant=tenant,
                    owner=owner,
                    branch=branch,
                    code=parent_code,
                    defaults={
                        'name': parent_name or f"{name} (Parent)",
                        'account_type': account_type,
                        'account_level': 'PARENT',
                        'allow_manual_entries': parent_allow_manual_entries,
                        'is_system_account': True,
                        'balance': Decimal('0.00'),
                        'description': description or '',
                    }
                )
                _cache_set(parent_code, parent_account)

        # Now ensure child exists; if requested child code is taken by different parent, find next suffix
        child_account = Account.objects.filter(
            tenant=tenant,
            owner=owner,
            branch=branch,
            code=requested_child_code
        ).first()

        if child_account:
            # If child exists but parent mismatch, allocate a new suffix
            if not child_account.parent or child_account.parent.code != parent_account.code:
                chosen_suffix = _find_available_child_suffix(tenant, owner, branch, parent_account.code)
                child_code = f"{parent_account.code}-{chosen_suffix}"
            else:
                return child_account
        else:
            child_code = requested_child_code

        # If cache has the child, return
        cached_child = _cache_get(child_code)
        if cached_child:
            return cached_child

        # Create the child account with correct parent reference
        child_account, created = Account.objects.get_or_create(
            tenant=tenant,
            owner=owner,
            branch=branch,
            code=child_code,
            defaults={
                'name': name,
                'account_type': account_type,
                'account_level': 'CHILD',
                'parent': parent_account,
                'allow_manual_entries': True,
                'is_system_account': True,
                'balance': Decimal('0.00'),
                'description': description or '',
            }
        )

        # Safety: ensure child.parent is set
        if not child_account.parent:
            child_account.parent = parent_account
            child_account.save()

        _cache_set(child_account.code, child_account)

        return child_account


def _find_nearest_parent_code(tenant, owner, branch, preferred_code):
    """
    If the preferred parent code is taken by a conflicting account_type,
    find the nearest numeric parent code not used for this tenant+owner+branch.
    
    Valid range: 100-599 (3 digits only)
    """
    try:
        pref = int(preferred_code)
    except Exception:
        raise ValidationError(f"Unable to resolve nearest parent for '{preferred_code}'")

    # search radius and bounds (3-digit codes: 100-599)
    max_offset = 100
    low_bound = 100
    high_bound = 599

    for offset in range(1, max_offset + 1):
        # alternate up and down
        for candidate in (pref - offset, pref + offset):
            if candidate < low_bound or candidate > high_bound:
                continue
            candidate_code = str(candidate).zfill(3)
            exists = Account.objects.filter(
                tenant=tenant,
                owner=owner,
                branch=branch,
                code=candidate_code,
                account_level='PARENT'
            ).exists()
            if not exists:
                return candidate_code

    # Fallback: shouldn't reach here with max_offset=100 in range 100-599
    raise ValidationError(
        f"No available parent code found near '{preferred_code}' in range 100-599"
    )


def _find_available_child_suffix(tenant, owner, branch, parent_code):
    """
    Find the first available child suffix (001..999) for a given parent_code.
    """
    for i in range(1, 1000):
        suffix = str(i).zfill(3)
        code = f"{parent_code}-{suffix}"
        if not Account.objects.filter(
            tenant=tenant,
            owner=owner,
            branch=branch,
            code=code
        ).exists():
            return suffix
    raise ValidationError(f"No available child suffix for parent {parent_code}")


def get_or_create_system_account(code, name, account_type, owner, branch, tenant, account_level='PARENT', description=''):
    """
    Get or create a system account (backward compatibility helper).
    
    ⚠️ WARNING: For child accounts, use get_or_create_child_account() instead!
    This function is only for parent accounts or legacy code.
    
    Args:
        code: Account code
        name: Account name
        account_type: Account type
        owner: User instance
        branch: Branch instance
        tenant: Tenant instance
        account_level: PARENT or CHILD (default: PARENT)
        description: Account description
        
    Returns:
        Account instance
    """
    if account_level == 'CHILD' and '-' not in code:
        raise ValidationError(
            f"Child account code '{code}' must include parent reference (e.g., '501-001'). "
            f"Use get_or_create_child_account() for proper child account creation."
        )
    
    account, created = Account.objects.get_or_create(
        code=code,
        owner=owner,
        branch=branch,
        tenant=tenant,
        defaults={
            'name': name,
            'account_type': account_type,
            'account_level': account_level,
            'allow_manual_entries': True,
            'is_system_account': True,
            'balance': Decimal('0.00'),
            'description': description,
        }
    )
    
    return account


# Predefined system accounts for common use cases
SYSTEM_ACCOUNTS = {
    # Expense accounts
    'general_expense': {
        'parent_code': '501',
        'child_suffix': '001',
        'name': 'General Operating Expenses',
        'account_type': 'EXPENSE',
        'parent_name': 'General Expenses'
    },
    
    # Prepaid expense accounts (Asset)
    'prepaid_expense': {
        'parent_code': '130',
        'child_suffix': '001',
        'name': 'General Prepaid Expenses',
        'account_type': 'ASSET',
        'parent_name': 'Prepaid Expenses'
    },
    
    # Payables (Liability)
    'accounts_payable': {
        'parent_code': '210',
        'child_suffix': '001',
        'name': 'General Payables',
        'account_type': 'LIABILITY',
        'parent_name': 'Accounts Payable'
    },
    
    # Cash accounts (Asset)
    'cash': {
        'parent_code': '101',
        'child_suffix': '001',
        'name': 'General Cash',
        'account_type': 'ASSET',
        'parent_name': 'Cash on Hand'
    },
    
    'bank': {
        'parent_code': '102',
        'child_suffix': '001',
        'name': 'General Bank Account',
        'account_type': 'ASSET',
        'parent_name': 'Bank Account'
    },
    
    'petty_cash': {
        'parent_code': '110',
        'child_suffix': '001',
        'name': 'General Petty Cash',
        'account_type': 'ASSET',
        'parent_name': 'Petty Cash'
    },
    
    # Inventory accounts
    'inventory': {
        'parent_code': '120',
        'child_suffix': '001',
        'name': 'General Inventory',
        'account_type': 'ASSET',
        'parent_name': 'Inventory Asset'
    },
    
    # Cost of Goods Sold
    'cogs': {
        'parent_code': '500',
        'child_suffix': '001',
        'name': 'General COGS',
        'account_type': 'EXPENSE',
        'parent_name': 'Cost of Goods Sold'
    },
    
    # Revenue accounts
    'sales_revenue': {
        'parent_code': '400',
        'child_suffix': '001',
        'name': 'General Sales Revenue',
        'account_type': 'INCOME',
        'parent_name': 'Sales Revenue'
    },
}


def get_system_account(account_key, owner, branch, tenant):
    """
    Get a predefined system account by key.
    
    Args:
        account_key (str): Key from SYSTEM_ACCOUNTS dict
        owner: User instance
        branch: Branch instance
        tenant: Tenant instance
        
    Returns:
        Account: Child account ready for transactions
        
    Example:
        expense_account = get_system_account('general_expense', user, branch, tenant)
        cash_account = get_system_account('cash', user, branch, tenant)
    """
    if account_key not in SYSTEM_ACCOUNTS:
        raise ValueError(
            f"Unknown system account key: '{account_key}'. "
            f"Available keys: {', '.join(SYSTEM_ACCOUNTS.keys())}"
        )
    
    config = SYSTEM_ACCOUNTS[account_key]
    
    return get_or_create_child_account(
        parent_code=config['parent_code'],
        child_suffix=config['child_suffix'],
        name=config['name'],
        account_type=config['account_type'],
        owner=owner,
        branch=branch,
        tenant=tenant,
        parent_name=config['parent_name']
    )