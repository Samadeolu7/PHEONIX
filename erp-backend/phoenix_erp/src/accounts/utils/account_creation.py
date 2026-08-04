"""
Centralized Account Creation Utility  -  FIRS / IFRS 4-digit scheme
====================================================================

Account code rules (updated to follow Nigerian FIRS Chart of Accounts):

  PARENT accounts  -  4-digit header codes that group detail accounts.
                      No transactions are posted directly to parents.
  CHILD  accounts  -  4-digit detail/posting codes.
                      The parent relationship is maintained via ForeignKey,
                      NOT via the dash notation used in the old 3-digit scheme.

Code ranges:
  1000-1999  Assets
  2000-2999  Liabilities
  3000-3999  Equity
  4000-4999  Revenue / Income
  5000-5999  Expenses

Child code generation:
  child_code = int(parent_code) + int(child_suffix)
  e.g.  parent_code='1110', child_suffix='001'  ->  code '1111'
        parent_code='4100', child_suffix='001'  ->  code '4101'

This keeps the public API of get_or_create_child_account() stable; callers
only need to update the parent_code argument to the new 4-digit values.
"""

from decimal import Decimal
from django.core.exceptions import ValidationError
from django.db import transaction
from accounts.models import Account

# Simple in-memory process cache to reduce repeated DB hits for hot system accounts.
# Keyed by (tenant_id, owner_id, branch_id, code)
_ACCOUNT_CACHE: dict = {}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_or_create_child_account(
    parent_code,
    child_suffix,
    name,
    account_type,
    owner,
    branch,
    parent_name=None,
    parent_allow_manual_entries=False,
):
    """
    Get or create a child (detail/posting) account, ensuring the parent exists.

    Parameters
    ----------
    parent_code : str
        4-digit parent account code (e.g. '1110', '4100').
    child_suffix : str
        Numeric offset from parent code (e.g. '001' -> parent + 1).
        child_code = str(int(parent_code) + int(child_suffix))
    name : str
        Display name for the child account.
    account_type : str
        'ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE', 'LOAN', 'SAVINGS'.
    owner : User
        Owner user instance.
    branch : Branch
        Branch instance.
    parent_name : str, optional
        Name to use when the parent account must be auto-created.
    parent_allow_manual_entries : bool
        Whether the auto-created parent allows direct postings (default False).

    Returns
    -------
    Account
        The child account instance, ready for transaction postings.

    Examples
    --------
    # Accounts Receivable - General Debtors (1110 + 001 = 1111)
    ar = get_or_create_child_account(
        parent_code='1110', child_suffix='001',
        name='General Trade Debtors', account_type='ASSET',
        owner=user, branch=branch, parent_name='Trade and Other Receivables',
    )

    # Operating Revenue - General Income (4100 + 001 = 4101)
    rev = get_or_create_child_account(
        parent_code='4100', child_suffix='001',
        name='General Income', account_type='INCOME',
        owner=user, branch=branch, parent_name='Operating Revenue',
    )
    """
    # Validate parent code
    if '-' in str(parent_code):
        raise ValidationError(
            f"Parent code '{parent_code}' must not contain '-'. "
            f"Provide the 4-digit base code only (e.g., '1110')."
        )

    try:
        parent_int = int(parent_code)
    except (TypeError, ValueError):
        raise ValidationError(
            f"Parent code '{parent_code}' must be a 4-digit integer (1000-5999)."
        )

    if parent_int < 1000 or parent_int > 5999:
        raise ValidationError(
            f"Parent code '{parent_code}' must be between 1000 and 5999."
        )

    parent_code = str(parent_int)

    # Validate child suffix
    if not str(child_suffix).isdigit():
        raise ValidationError(
            f"Child suffix '{child_suffix}' must be numeric (e.g., '001')."
        )
    child_int = int(child_suffix)
    if child_int < 1 or child_int > 999:
        raise ValidationError(
            f"Child suffix '{child_suffix}' must be between 1 and 999."
        )

    # Derive child code: parent + suffix
    requested_child_code = str(parent_int + child_int)

    # Cache / tenant helpers
    tenant = getattr(owner, 'tenant', None)
    tenant_id = getattr(tenant, 'id', None) if tenant else None
    owner_id = getattr(owner, 'id', None)
    branch_id = getattr(branch, 'id', None)

    def _cache_get(code):
        return _ACCOUNT_CACHE.get((tenant_id, owner_id, branch_id, code))

    def _cache_set(code, account):
        try:
            _ACCOUNT_CACHE[(tenant_id, owner_id, branch_id, code)] = account
        except Exception:
            pass

    with transaction.atomic():
        # The DB unique constraint is (code, tenant_id, branch_id) — NOT owner.
        # setup_accounts creates chart-of-accounts entries under the canonical
        # system owner, which differs from the API request user.  Filtering by
        # owner therefore misses existing entries and causes duplicate-key errors
        # when get_or_create attempts an INSERT.  We scope lookups to
        # tenant + branch only and put owner only in the creation defaults.
        scope_filter = {}
        if branch_id is not None:
            scope_filter['branch'] = branch
        if tenant_id is not None:
            scope_filter['tenant'] = tenant

        # Fields used when we have to create a new account (audit trail only)
        create_base = dict(scope_filter)
        create_base['owner'] = owner

        # Ensure parent exists
        parent_account = Account.objects.filter(
            **scope_filter, code=parent_code, account_level='PARENT'
        ).first()

        if parent_account and parent_account.account_type != account_type:
            parent_code = _find_nearest_parent_code(owner, branch, parent_code, tenant)
            parent_account = None

        if not parent_account:
            # The intended code may already be taken by a non-PARENT account
            # (e.g. a CHILD account from an unrelated feature, or a manually
            # customised chart of accounts). Blindly calling
            # get_or_create(code=parent_code) below would silently adopt that
            # wrong-level account as the "parent" — its lookup doesn't filter
            # by account_level — which then fails Account.clean()'s "Parent
            # must be a parent-level account" check downstream once we try to
            # attach a child to it. Detect that up front and redirect to a
            # genuinely free code instead of a code that's merely free of
            # PARENT-level accounts.
            existing_at_code = Account.objects.filter(**scope_filter, code=parent_code).first()
            if existing_at_code and existing_at_code.account_level != 'PARENT':
                parent_code = _find_nearest_parent_code(owner, branch, parent_code, tenant)

            cached = _cache_get(parent_code)
            if cached:
                parent_account = cached
            else:
                parent_defaults = {
                    'name': parent_name or f"{name} (Parent)",
                    'account_type': account_type,
                    'account_level': 'PARENT',
                    'allow_manual_entries': parent_allow_manual_entries,
                    'is_system_account': True,
                    'balance': Decimal('0.00'),
                    'owner': owner,
                }
                parent_account, _ = Account.objects.get_or_create(
                    **scope_filter, code=parent_code, defaults=parent_defaults
                )
                _cache_set(parent_code, parent_account)

        # Ensure child exists
        child_account = Account.objects.filter(
            **scope_filter, code=requested_child_code
        ).first()

        if child_account:
            if not child_account.parent or child_account.parent.code != parent_account.code:
                new_code = _find_available_child_code(owner, branch, parent_account.code, tenant)
                child_account = None
                requested_child_code = new_code
            else:
                return child_account

        if not child_account:
            child_code = requested_child_code
            cached_child = _cache_get(child_code)
            if cached_child:
                return cached_child

            child_defaults = {
                'name': name,
                'account_type': account_type,
                'account_level': 'CHILD',
                'parent': parent_account,
                'allow_manual_entries': True,
                'is_system_account': True,
                'balance': Decimal('0.00'),
                'owner': owner,
            }
            child_account, _ = Account.objects.get_or_create(
                **scope_filter, code=child_code, defaults=child_defaults
            )
            if not child_account.parent:
                child_account.parent = parent_account
                child_account.save()
            _cache_set(child_account.code, child_account)

    return child_account


def get_or_create_staff_salary_advance_account(staff, owner, branch):
    """
    Get or create a dedicated GL child account for one staff member's own
    Salary Advance / IOU balance, nested under a single shared "Salary
    Advance" parent account — its own group, deliberately not nested under
    1110 Trade and Other Receivables, since Salary Advance is its own line
    item per the client's chart of accounts request.

    Every staff member gets their own child account so balances are visible
    and manageable individually instead of being pooled into one shared
    "Staff Loan Account" — the previous design.

    setup_accounts.py (create_standard_accounts) is the single canonical
    chart-of-accounts seed for this codebase — the other, historically
    inconsistent seeding scripts that used to exist alongside it
    (initialize_production_erp.py, initialize_erp_system.py,
    seed_account_hierarchy.py, setup_microfinance.py, setup_sample_data.py)
    had zero live callers anywhere and were removed. PREFERRED_PARENT_CODE
    was picked from a gap in setup_accounts.py's own ranges, but it still
    collided in testing with setup_accounts.py's own '1140 Short-term
    Investments' parent (a different tenant/branch may have that code
    occupied by a differently-created account too), so this still looks the
    parent up by NAME as well as level/code and redirects to a genuinely
    free code rather than adopting the wrong account.

    The assigned account is cached on staff.salary_advance_account so it's
    only created once per staff member and reused on every subsequent call
    (payroll deduction, cash disbursement, bulk debit, etc).

    Parameters
    ----------
    staff : hr.models.Staff
    owner : User
    branch : Branch

    Returns
    -------
    Account
        This staff member's own child account, ready for postings.
    """
    if staff.salary_advance_account_id:
        return staff.salary_advance_account

    tenant = getattr(owner, 'tenant', None)
    scope_filter = {}
    if branch is not None:
        scope_filter['branch'] = branch
    if tenant is not None:
        scope_filter['tenant'] = tenant

    PREFERRED_PARENT_CODE = '1160'
    PARENT_NAME = 'Salary Advance'

    with transaction.atomic():
        # Lock (or create) the parent row so concurrent first-time creations
        # for two different staff members can't both compute the same "next
        # free child code" and collide on the unique (code, tenant, branch)
        # constraint.
        #
        # Look this up by NAME/LEVEL (not by PREFERRED_PARENT_CODE) — once a
        # collision has redirected the parent to some other code (e.g. 1159
        # instead of 1160), every subsequent call must still find that SAME
        # parent rather than only checking the preferred code, seeing it's
        # still occupied by the unrelated account, and creating a second,
        # duplicate "Salary Advance" parent.
        parent_account = Account.objects.select_for_update().filter(
            **scope_filter, account_level='PARENT', name=PARENT_NAME,
        ).first()

        if not parent_account:
            existing_at_code = Account.objects.filter(
                **scope_filter, code=PREFERRED_PARENT_CODE
            ).first()
            parent_code = PREFERRED_PARENT_CODE
            if existing_at_code is not None:
                # Something else — right level or wrong, doesn't matter —
                # already occupies this code. Never adopt it.
                parent_code = _find_nearest_parent_code(
                    owner, branch, PREFERRED_PARENT_CODE, tenant
                )
            parent_account = Account.objects.create(
                **scope_filter, code=parent_code,
                name=PARENT_NAME,
                account_type='ASSET',
                account_level='PARENT',
                allow_manual_entries=False,
                is_system_account=True,
                balance=Decimal('0.00'),
                owner=owner,
            )
            parent_account = Account.objects.select_for_update().get(pk=parent_account.pk)

        # Re-check under the lock in case another request just assigned one
        # while we were waiting for it (avoids creating a duplicate child).
        staff.refresh_from_db(fields=['salary_advance_account'])
        if staff.salary_advance_account_id:
            return staff.salary_advance_account

        child_code = _find_available_child_code(owner, branch, parent_account.code, tenant)
        staff_label = staff.staff_id or f'#{staff.pk}'
        child_account = Account.objects.create(
            **scope_filter, code=child_code,
            name=f"Salary Advance – {staff.first_name} {staff.last_name} ({staff_label})",
            account_type='ASSET',
            account_level='CHILD',
            parent=parent_account,
            allow_manual_entries=True,
            is_system_account=True,
            balance=Decimal('0.00'),
            owner=owner,
        )

        staff.salary_advance_account = child_account
        staff.save(update_fields=['salary_advance_account'])

    return child_account


def get_or_create_supplier_payable_account(supplier, owner, branch):
    """
    Get or create a dedicated GL child account for one supplier's own
    Accounts Payable balance, nested under the same shared "Trade and Other
    Payables" parent that get_system_account('accounts_payable', ...) uses.

    Every supplier gets its own child account so invoices, on-account
    advances, and applied payments all post to ONE account per vendor —
    a real subledger, instead of every supplier sharing a single pooled
    "General Trade Creditors" account. Advances and invoices net against
    each other automatically since they share the same account (see
    BankPayment.apply_advance_to_payable, which only updates matching
    metadata and posts no further journal entry).

    The assigned account is cached on supplier.account so it's only
    created once per supplier and reused on every subsequent call.

    Parameters
    ----------
    supplier : procurement.models.Supplier
    owner : User
    branch : Branch

    Returns
    -------
    Account
        This supplier's own child account, ready for postings.
    """
    if supplier.account_id:
        return supplier.account

    tenant = getattr(owner, 'tenant', None)
    scope_filter = {}
    if branch is not None:
        scope_filter['branch'] = branch
    if tenant is not None:
        scope_filter['tenant'] = tenant

    cfg = SYSTEM_ACCOUNTS['accounts_payable']
    PREFERRED_PARENT_CODE = cfg['parent_code']
    PARENT_NAME = cfg['parent_name']

    with transaction.atomic():
        # Lock (or create) the parent row so concurrent first-time creations
        # for two different suppliers can't both compute the same "next free
        # child code" and collide on the unique (code, tenant, branch)
        # constraint. Look this up by NAME/LEVEL (not by PREFERRED_PARENT_CODE)
        # so a prior code collision redirect is still found consistently —
        # same reasoning as get_or_create_staff_salary_advance_account above.
        parent_account = Account.objects.select_for_update().filter(
            **scope_filter, account_level='PARENT', name=PARENT_NAME,
        ).first()

        if not parent_account:
            existing_at_code = Account.objects.filter(
                **scope_filter, code=PREFERRED_PARENT_CODE
            ).first()
            parent_code = PREFERRED_PARENT_CODE
            if existing_at_code is not None:
                parent_code = _find_nearest_parent_code(
                    owner, branch, PREFERRED_PARENT_CODE, tenant
                )
            parent_account = Account.objects.create(
                **scope_filter, code=parent_code,
                name=PARENT_NAME,
                account_type='LIABILITY',
                account_level='PARENT',
                allow_manual_entries=False,
                is_system_account=True,
                balance=Decimal('0.00'),
                owner=owner,
            )
            parent_account = Account.objects.select_for_update().get(pk=parent_account.pk)

        # Re-check under the lock in case another request just assigned one
        # while we were waiting for it (avoids creating a duplicate child).
        supplier.refresh_from_db(fields=['account'])
        if supplier.account_id:
            return supplier.account

        child_code = _find_available_child_code(owner, branch, parent_account.code, tenant)
        child_account = Account.objects.create(
            **scope_filter, code=child_code,
            name=f"Accounts Payable – {supplier.name} ({supplier.supplier_code})",
            account_type='LIABILITY',
            account_level='CHILD',
            parent=parent_account,
            allow_manual_entries=True,
            is_system_account=True,
            balance=Decimal('0.00'),
            owner=owner,
        )

        supplier.account = child_account
        supplier.save(update_fields=['account'])

    return child_account


def get_or_create_system_account(code, name, account_type, owner, branch, account_level='PARENT'):
    """
    Get or create a system account by code.

    For CHILD accounts prefer get_or_create_child_account() which handles
    parent lookup and proper linkage automatically.
    """
    if account_level == 'CHILD' and '-' in str(code):
        raise ValidationError(
            f"Child account code '{code}' uses old dash notation. "
            f"Use get_or_create_child_account() with 4-digit parent/suffix instead."
        )

    tenant = getattr(owner, 'tenant', None)

    if account_level == 'PARENT':
        if '-' in str(code):
            raise ValidationError(f"Parent code '{code}' must not contain '-'.")
        try:
            code_int = int(code)
        except (TypeError, ValueError):
            raise ValidationError(
                f"Parent code '{code}' must be a 4-digit integer (1000-5999)."
            )
        if code_int < 1000 or code_int > 5999:
            raise ValidationError(f"Parent code '{code}' must be between 1000 and 5999.")
        code = str(code_int)

    base_filter = {'code': code, 'owner': owner, 'branch': branch}
    if tenant is not None:
        base_filter['tenant'] = tenant

    account, _ = Account.objects.get_or_create(
        **base_filter,
        defaults={
            'name': name,
            'account_type': account_type,
            'account_level': account_level,
            'allow_manual_entries': True,
            'is_system_account': True,
            'balance': Decimal('0.00'),
        }
    )
    return account


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _find_nearest_parent_code(owner, branch, preferred_code, tenant=None):
    """
    Find the nearest 4-digit parent code within the same 1000-unit section
    band (e.g., 1000-1999 for Assets) that has NO existing account at all.

    NOTE: the scope filter deliberately does NOT restrict to
    account_level='PARENT'. A candidate code with an existing CHILD account
    (but no PARENT) previously passed this check as "free", and the caller
    would then treat that CHILD account as if it were the parent — failing
    Account.clean()'s "Parent must be a parent-level account" validation the
    moment a new child tried to attach to it. Requiring the code to be
    completely unused avoids that class of bug entirely.
    """
    try:
        pref = int(preferred_code)
    except (TypeError, ValueError):
        raise ValidationError(f"Unable to resolve nearest parent for '{preferred_code}'.")

    section = pref // 1000
    low_bound = section * 1000
    high_bound = low_bound + 999

    scope_filter = {}
    if branch is not None:
        scope_filter['branch'] = branch
    if tenant is not None:
        scope_filter['tenant'] = tenant

    for offset in range(1, 500):
        for candidate in (pref - offset, pref + offset):
            if low_bound <= candidate <= high_bound:
                if not Account.objects.filter(**scope_filter, code=str(candidate)).exists():
                    return str(candidate)

    for num in range(low_bound, high_bound + 1):
        if not Account.objects.filter(**scope_filter, code=str(num)).exists():
            return str(num)

    raise ValidationError(f"No available parent codes in section band {low_bound}-{high_bound}.")


def _find_available_child_code(owner, branch, parent_code, tenant=None):
    """
    Find the next available 4-digit child code under *parent_code*,
    searching sequentially from parent_int + 1 up to parent_int + 999.
    """
    scope_filter = {}
    if branch is not None:
        scope_filter['branch'] = branch
    if tenant is not None:
        scope_filter['tenant'] = tenant

    parent_int = int(parent_code)
    for seq in range(1, 1000):
        candidate = str(parent_int + seq)
        if not Account.objects.filter(**scope_filter, code=candidate).exists():
            return candidate

    raise ValidationError(f"No available child codes for parent {parent_code}.")


# ---------------------------------------------------------------------------
# Pre-defined system account map (FIRS 4-digit scheme)
# ---------------------------------------------------------------------------

SYSTEM_ACCOUNTS = {
    # Assets
    'cash': {
        'parent_code': '1100', 'child_suffix': '001',
        'name': 'Cash on Hand', 'account_type': 'ASSET',
        'parent_name': 'Cash and Cash Equivalents',
    },
    'petty_cash': {
        'parent_code': '1100', 'child_suffix': '002',
        'name': 'Petty Cash Fund', 'account_type': 'ASSET',
        'parent_name': 'Cash and Cash Equivalents',
    },
    'bank': {
        'parent_code': '1100', 'child_suffix': '003',
        'name': 'Cash at Bank', 'account_type': 'ASSET',
        'parent_name': 'Cash and Cash Equivalents',
    },
    'accounts_receivable': {
        'parent_code': '1110', 'child_suffix': '001',
        'name': 'General Trade Debtors', 'account_type': 'ASSET',
        'parent_name': 'Trade and Other Receivables',
    },
    'inventory': {
        'parent_code': '1120', 'child_suffix': '001',
        'name': 'Trading Stock / Merchandise', 'account_type': 'ASSET',
        'parent_name': 'Inventories',
    },
    'prepaid_expense': {
        'parent_code': '1130', 'child_suffix': '001',
        'name': 'General Prepaid Expenses', 'account_type': 'ASSET',
        'parent_name': 'Prepayments and Other Current Assets',
    },
    'supplier_advance': {
        'parent_code': '1130', 'child_suffix': '002',
        'name': 'Advances to Suppliers', 'account_type': 'ASSET',
        'parent_name': 'Prepayments and Other Current Assets',
    },
    # Liabilities
    'accounts_payable': {
        'parent_code': '2100', 'child_suffix': '001',
        'name': 'General Trade Creditors', 'account_type': 'LIABILITY',
        'parent_name': 'Trade and Other Payables',
    },
    'vat_payable': {
        'parent_code': '2120', 'child_suffix': '001',
        'name': 'VAT Payable (Output)', 'account_type': 'LIABILITY',
        'parent_name': 'Tax Liabilities',
    },
    'paye_payable': {
        'parent_code': '2120', 'child_suffix': '002',
        'name': 'PAYE Tax Payable', 'account_type': 'LIABILITY',
        'parent_name': 'Tax Liabilities',
    },
    'wht_payable': {
        'parent_code': '2120', 'child_suffix': '003',
        'name': 'Withholding Tax Payable', 'account_type': 'LIABILITY',
        'parent_name': 'Tax Liabilities',
    },
    # Revenue
    'sales_revenue': {
        'parent_code': '4100', 'child_suffix': '001',
        'name': 'Sales of Goods', 'account_type': 'INCOME',
        'parent_name': 'Revenue from Contracts with Customers',
    },
    'service_revenue': {
        'parent_code': '4100', 'child_suffix': '002',
        'name': 'Service Revenue', 'account_type': 'INCOME',
        'parent_name': 'Revenue from Contracts with Customers',
    },
    # Expenses
    'cogs': {
        'parent_code': '5100', 'child_suffix': '001',
        'name': 'Cost of Goods Sold', 'account_type': 'EXPENSE',
        'parent_name': 'Cost of Sales',
    },
    'general_expense': {
        'parent_code': '5300', 'child_suffix': '001',
        'name': 'General Administrative Expenses', 'account_type': 'EXPENSE',
        'parent_name': 'Administrative and General Expenses',
    },
    'bank_charges': {
        'parent_code': '5300', 'child_suffix': '002',
        'name': 'Bank Charges', 'account_type': 'EXPENSE',
        'parent_name': 'Administrative and General Expenses',
    },
    'transfer_shrinkage': {
        'parent_code': '5300', 'child_suffix': '003',
        'name': 'Transfer Shrinkage', 'account_type': 'EXPENSE',
        'parent_name': 'Administrative and General Expenses',
    },
    # Asset disposal gain / loss accounts (FIRS: other income 4200, other expenses 5400)
    'asset_disposal': {
        'parent_code': '1900', 'child_suffix': '001',
        'name': 'Asset Disposal Account', 'account_type': 'ASSET',
        'parent_name': 'Asset Disposal and Clearing',
    },
    'insurance_receivable': {
        'parent_code': '1110', 'child_suffix': '005',
        'name': 'Insurance Claims Receivable', 'account_type': 'ASSET',
        'parent_name': 'Trade and Other Receivables',
    },
    'gain_on_disposal': {
        'parent_code': '4200', 'child_suffix': '001',
        'name': 'Gain on Asset Disposal', 'account_type': 'INCOME',
        'parent_name': 'Other Income',
    },
    'loss_on_disposal': {
        'parent_code': '5400', 'child_suffix': '001',
        'name': 'Loss on Asset Disposal', 'account_type': 'EXPENSE',
        'parent_name': 'Other Expenses',
    },
    'salary_expense': {
        'parent_code': '5200', 'child_suffix': '001',
        'name': 'Salaries and Wages', 'account_type': 'EXPENSE',
        'parent_name': 'Personnel and Employment Costs',
    },
    'pension_expense': {
        'parent_code': '5200', 'child_suffix': '002',
        'name': 'Pension Expense (Employer Contribution)', 'account_type': 'EXPENSE',
        'parent_name': 'Personnel and Employment Costs',
    },
    # Payroll Liabilities (parent 2150 = Payroll Liabilities group)
    #
    # NOTE: this used to be parent_code '2130', which collides with
    # setup_accounts.py's canonical '2130 Accruals and Deferred Income'
    # group (and with a third, unrelated '2130 Taxes Payable' mapping in
    # initialize_erp_system.py). That collision let get_or_create_child_account
    # silently adopt an unrelated existing account as payroll's "parent",
    # sometimes crashing with "Parent must be a parent-level account" and
    # otherwise just posting payroll liabilities into a wrongly-named GL
    # account. '2150' sits in the documented-but-unused 2141-2199 gap between
    # 'Customer Savings Deposits' (2140) and 'Long-term Borrowings' (2200),
    # so it can't collide with either of the other two schemes. Verified no
    # account or transaction anywhere already uses 2130-2135 before this
    # renumbering, so there is no existing data to migrate.
    'salary_payable': {
        'parent_code': '2150', 'child_suffix': '001',
        'name': 'Salaries Payable (Payroll Clearance)', 'account_type': 'LIABILITY',
        'parent_name': 'Payroll Liabilities',
    },
    'employee_pension_payable': {
        'parent_code': '2150', 'child_suffix': '002',
        'name': 'Employee Pension Payable (8%)', 'account_type': 'LIABILITY',
        'parent_name': 'Payroll Liabilities',
    },
    'employer_pension_payable': {
        'parent_code': '2150', 'child_suffix': '003',
        'name': 'Employer Pension Payable (10%)', 'account_type': 'LIABILITY',
        'parent_name': 'Payroll Liabilities',
    },
    'other_payroll_deductions_payable': {
        'parent_code': '2150', 'child_suffix': '004',
        'name': 'Other Payroll Deductions Payable', 'account_type': 'LIABILITY',
        'parent_name': 'Payroll Liabilities',
    },
    'development_levy_payable': {
        'parent_code': '2150', 'child_suffix': '005',
        'name': 'Development Levy Payable', 'account_type': 'LIABILITY',
        'parent_name': 'Payroll Liabilities',
    },
    # NOTE: Staff IOU / Salary Advance is intentionally NOT a SYSTEM_ACCOUNTS
    # entry — each staff member gets their own dedicated child account
    # instead of sharing one pooled account. See
    # get_or_create_staff_salary_advance_account() below.
}


def get_system_account(account_key, owner, branch):
    """
    Retrieve (or auto-create) a predefined system account by logical key.

    Parameters
    ----------
    account_key : str
        A key from SYSTEM_ACCOUNTS (e.g., 'cash', 'cogs', 'accounts_payable').
    owner : User
    branch : Branch

    Returns
    -------
    Account
        Detail (child) account ready for transaction postings.
    """
    if account_key not in SYSTEM_ACCOUNTS:
        available = ', '.join(sorted(SYSTEM_ACCOUNTS.keys()))
        raise ValueError(
            f"Unknown system account key: '{account_key}'. "
            f"Available keys: {available}"
        )

    cfg = SYSTEM_ACCOUNTS[account_key]
    return get_or_create_child_account(
        parent_code=cfg['parent_code'],
        child_suffix=cfg['child_suffix'],
        name=cfg['name'],
        account_type=cfg['account_type'],
        owner=owner,
        branch=branch,
        parent_name=cfg['parent_name'],
    )
