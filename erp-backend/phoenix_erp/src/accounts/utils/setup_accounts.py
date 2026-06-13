"""
Standard Chart of Accounts Setup Utility  -  FIRS / IFRS 4-digit Scheme
========================================================================

Nigerian FIRS-compliant Chart of Accounts using 4-digit codes.

Structure
---------
  PARENT accounts  =  Control / header accounts (no direct postings)
  CHILD  accounts  =  Detail / posting accounts

Code ranges:
  1000-1999  Assets
    1100     Cash and Cash Equivalents         (current)
    1110     Trade and Other Receivables       (current)
    1120     Inventories                       (current)
    1130     Prepayments and Other Current     (current)
    1140     Short-term Investments            (current)
    1150     Customer Loan Portfolio           (LOAN - microfinance/SACCO)
    1200     Property, Plant and Equipment     (non-current)
    1210     Accumulated Depreciation          (non-current contra-asset)
    1220     Intangible Assets                 (non-current)
    1230     Long-term Investments             (non-current)

  2000-2999  Liabilities
    2100     Trade and Other Payables          (current)
    2110     Short-term Borrowings             (current)
    2120     Tax Liabilities                   (current - FIRS specific)
    2130     Accruals and Deferred Income      (current)
    2140     Customer Savings Deposits         (SAVINGS - microfinance/SACCO)
    2200     Long-term Borrowings              (non-current)
    2210     Deferred Tax Liabilities          (non-current)

  3000-3999  Equity
    3100     Share Capital and Premium
    3200     Retained Earnings
    3300     Other Reserves

  4000-4999  Revenue / Income
    4100     Revenue from Contracts with Customers  (IFRS 15)
    4200     Other Operating Income
    4900     Revenue Deductions (contra-revenue)

  5000-5999  Expenses
    5100     Cost of Sales
    5200     Personnel and Employment Costs
    5300     Administrative and General Expenses
    5400     Selling and Distribution Expenses
    5500     Finance Costs
    5600     Depreciation and Amortisation
    5700     Tax Expense

Reusable by:
- Management commands (setup_chart_of_accounts)
- Signals (auto-setup for new tenants)
- Admin endpoints
- Tests
"""

from django.db import transaction
from decimal import Decimal
from accounts.models import Account
from users.models import User, Tenant
from branches.models import Branch
import logging

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Full FIRS / IFRS Chart of Accounts (4-digit codes, 2-level hierarchy)
# ---------------------------------------------------------------------------
#
# Tuple format:
#   (code, name, account_type, account_level, allow_manual_entries, parent_code)
#
# account_type choices:  ASSET | LIABILITY | EQUITY | INCOME | EXPENSE | LOAN | SAVINGS
# account_level choices: PARENT | CHILD
# parent_code:           None for PARENT rows; 4-digit code string for CHILD rows
#
STANDARD_ACCOUNTS = [

    # =========================================================================
    # ASSETS  1000 - 1999
    # =========================================================================

    # --- Current Assets: Cash and Cash Equivalents ---------------------------
    ('1100', 'Cash and Cash Equivalents',               'ASSET', 'PARENT', False, None),
    ('1101', 'Cash on Hand',                            'ASSET', 'CHILD',  True,  '1100'),
    ('1102', 'Petty Cash Fund',                         'ASSET', 'CHILD',  True,  '1100'),
    ('1103', 'Cash at Bank \u2013 Main Account',              'ASSET', 'CHILD',  True,  '1100'),

    # --- Current Assets: Trade and Other Receivables -------------------------
    ('1110', 'Trade and Other Receivables',             'ASSET', 'PARENT', False, None),
    ('1111', 'Trade Debtors (Accounts Receivable)',     'ASSET', 'CHILD',  True,  '1110'),
    ('1112', 'Staff Advances and Loans',                'ASSET', 'CHILD',  True,  '1110'),
    ('1113', 'Other Receivables',                       'ASSET', 'CHILD',  True,  '1110'),

    # --- Current Assets: Inventories -----------------------------------------
    ('1120', 'Inventories',                             'ASSET', 'PARENT', False, None),
    ('1121', 'Raw Materials and Components',            'ASSET', 'CHILD',  True,  '1120'),
    ('1122', 'Work-in-Progress',                        'ASSET', 'CHILD',  True,  '1120'),
    ('1123', 'Finished Goods',                          'ASSET', 'CHILD',  True,  '1120'),
    ('1124', 'Trading Stock / Merchandise',             'ASSET', 'CHILD',  True,  '1120'),

    # --- Current Assets: Prepayments -----------------------------------------
    ('1130', 'Prepayments and Other Current Assets',   'ASSET', 'PARENT', False, None),
    ('1131', 'Prepaid Expenses',                        'ASSET', 'CHILD',  True,  '1130'),
    ('1132', 'Advance Payments to Suppliers',           'ASSET', 'CHILD',  True,  '1130'),

    # --- Current Assets: Short-term Investments ------------------------------
    ('1140', 'Short-term Investments',                  'ASSET', 'PARENT', False, None),
    ('1141', 'Treasury Bills and Bonds (< 1 year)',     'ASSET', 'CHILD',  True,  '1140'),
    ('1142', 'Fixed Deposits (< 1 year)',               'ASSET', 'CHILD',  True,  '1140'),

    # --- Special: Customer Loan Portfolio (microfinance / SACCO) -------------
    ('1150', 'Customer Loan Portfolio',                 'LOAN',  'PARENT', False, None),
    # Individual loan accounts are created dynamically as CHILD under 1150

    # --- Non-Current Assets: Property, Plant and Equipment -------------------
    ('1200', 'Property, Plant and Equipment',          'ASSET', 'PARENT', False, None),
    ('1201', 'Land and Buildings',                      'ASSET', 'CHILD',  True,  '1200'),
    ('1202', 'Plant and Machinery',                     'ASSET', 'CHILD',  True,  '1200'),
    ('1203', 'Motor Vehicles',                          'ASSET', 'CHILD',  True,  '1200'),
    ('1204', 'Furniture, Fixtures and Fittings',        'ASSET', 'CHILD',  True,  '1200'),
    ('1205', 'Office and Computer Equipment',           'ASSET', 'CHILD',  True,  '1200'),

    # --- Non-Current Assets: Accumulated Depreciation (contra-asset) ---------
    ('1210', 'Accumulated Depreciation',               'ASSET', 'PARENT', False, None),
    ('1211', 'Accum. Depr. \u2013 Buildings',                'ASSET', 'CHILD',  True,  '1210'),
    ('1212', 'Accum. Depr. \u2013 Plant and Machinery',      'ASSET', 'CHILD',  True,  '1210'),
    ('1213', 'Accum. Depr. \u2013 Motor Vehicles',           'ASSET', 'CHILD',  True,  '1210'),
    ('1214', 'Accum. Depr. \u2013 Furniture and Fittings',   'ASSET', 'CHILD',  True,  '1210'),
    ('1215', 'Accum. Depr. \u2013 Office Equipment',         'ASSET', 'CHILD',  True,  '1210'),

    # --- Non-Current Assets: Intangibles -------------------------------------
    ('1220', 'Intangible Assets',                      'ASSET', 'PARENT', False, None),
    ('1221', 'Goodwill',                                'ASSET', 'CHILD',  True,  '1220'),
    ('1222', 'Computer Software and Licences',          'ASSET', 'CHILD',  True,  '1220'),
    ('1223', 'Trademarks and Patents',                  'ASSET', 'CHILD',  True,  '1220'),

    # --- Non-Current Assets: Long-term Investments ---------------------------
    ('1230', 'Long-term Investments',                  'ASSET', 'PARENT', False, None),
    ('1231', 'Investment in Subsidiaries',              'ASSET', 'CHILD',  True,  '1230'),
    ('1232', 'Investment in Associates',                'ASSET', 'CHILD',  True,  '1230'),
    ('1233', 'Other Long-term Investments',             'ASSET', 'CHILD',  True,  '1230'),

    # =========================================================================
    # LIABILITIES  2000 - 2999
    # =========================================================================

    # --- Current Liabilities: Trade and Other Payables -----------------------
    ('2100', 'Trade and Other Payables',               'LIABILITY', 'PARENT', False, None),
    ('2101', 'Trade Creditors (Accounts Payable)',      'LIABILITY', 'CHILD',  True,  '2100'),
    ('2102', 'Accrued Expenses',                        'LIABILITY', 'CHILD',  True,  '2100'),
    ('2103', 'Salaries and Wages Payable',              'LIABILITY', 'CHILD',  True,  '2100'),
    ('2104', 'Directors\u2019 Remuneration Payable',         'LIABILITY', 'CHILD',  True,  '2100'),
    ('2105', 'Dividend Payable',                        'LIABILITY', 'CHILD',  True,  '2100'),
    ('2106', 'Advance Receipts from Customers',         'LIABILITY', 'CHILD',  True,  '2100'),

    # --- Current Liabilities: Short-term Borrowings --------------------------
    ('2110', 'Short-term Borrowings and Overdrafts',   'LIABILITY', 'PARENT', False, None),
    ('2111', 'Bank Overdraft',                          'LIABILITY', 'CHILD',  True,  '2110'),
    ('2112', 'Short-term Loans Payable',                'LIABILITY', 'CHILD',  True,  '2110'),

    # --- Current Liabilities: Tax Liabilities (FIRS-specific) ----------------
    ('2120', 'Tax Liabilities',                        'LIABILITY', 'PARENT', False, None),
    ('2121', 'VAT Payable (Output VAT)',                'LIABILITY', 'CHILD',  True,  '2120'),
    ('2122', 'PAYE Tax Payable',                        'LIABILITY', 'CHILD',  True,  '2120'),
    ('2123', 'Withholding Tax (WHT) Payable',           'LIABILITY', 'CHILD',  True,  '2120'),
    ('2124', 'Company Income Tax (CIT) Payable',        'LIABILITY', 'CHILD',  True,  '2120'),
    ('2125', 'Education Tax (EDT) Payable',             'LIABILITY', 'CHILD',  True,  '2120'),
    ('2126', 'NSITF Contribution Payable',              'LIABILITY', 'CHILD',  True,  '2120'),
    ('2127', 'NHF Contribution Payable',                'LIABILITY', 'CHILD',  True,  '2120'),
    ('2128', 'Pension Fund (PFA) Payable',              'LIABILITY', 'CHILD',  True,  '2120'),

    # --- Current Liabilities: Accruals and Deferred Income -------------------
    ('2130', 'Accruals and Deferred Income',           'LIABILITY', 'PARENT', False, None),
    ('2131', 'Accrued Interest Payable',                'LIABILITY', 'CHILD',  True,  '2130'),
    ('2132', 'Deferred Revenue / Unearned Income',      'LIABILITY', 'CHILD',  True,  '2130'),

    # --- Special: Customer Savings Deposits (microfinance / SACCO) -----------
    ('2140', 'Customer Savings and Deposits',          'SAVINGS', 'PARENT', False, None),
    # Individual savings accounts are created dynamically as CHILD under 2140

    # --- Non-Current Liabilities: Long-term Borrowings -----------------------
    ('2200', 'Long-term Borrowings',                   'LIABILITY', 'PARENT', False, None),
    ('2201', 'Long-term Bank Loans',                    'LIABILITY', 'CHILD',  True,  '2200'),
    ('2202', 'Bonds and Debentures Payable',            'LIABILITY', 'CHILD',  True,  '2200'),
    ('2203', 'Finance Lease Obligations',               'LIABILITY', 'CHILD',  True,  '2200'),

    # --- Non-Current Liabilities: Deferred Tax --------------------------------
    ('2210', 'Deferred Tax Liabilities',               'LIABILITY', 'PARENT', False, None),
    ('2211', 'Deferred Tax Liability',                  'LIABILITY', 'CHILD',  True,  '2210'),

    # =========================================================================
    # EQUITY  3000 - 3999
    # =========================================================================

    ('3100', 'Share Capital and Premium',              'EQUITY', 'PARENT', False, None),
    ('3101', 'Authorised and Issued Share Capital',     'EQUITY', 'CHILD',  True,  '3100'),
    ('3102', 'Share Premium',                           'EQUITY', 'CHILD',  True,  '3100'),

    ('3200', 'Retained Earnings',                      'EQUITY', 'PARENT', False, None),
    ('3201', 'Opening Retained Earnings',               'EQUITY', 'CHILD',  True,  '3200'),
    ('3202', 'Current Year Profit or Loss',             'EQUITY', 'CHILD',  False, '3200'),

    ('3300', 'Other Reserves',                         'EQUITY', 'PARENT', False, None),
    ('3301', 'Statutory Reserve',                       'EQUITY', 'CHILD',  True,  '3300'),
    ('3302', 'General Reserve',                         'EQUITY', 'CHILD',  True,  '3300'),
    ('3303', 'Other Comprehensive Income',              'EQUITY', 'CHILD',  True,  '3300'),

    # =========================================================================
    # REVENUE / INCOME  4000 - 4999
    # =========================================================================

    # --- Revenue from Contracts (IFRS 15) ------------------------------------
    ('4100', 'Revenue',  'INCOME', 'PARENT', False, None),
    ('4101', 'Revenue -Uniform',                          'INCOME', 'CHILD',  True,  '4100'),
    ('4102', 'Revenue - Textbook',                         'INCOME', 'CHILD',  True,  '4100'),
    ('4103', 'Revenue - Launch',                          'INCOME', 'CHILD',  True,  '4100'),
    ('4104', 'School Fees and Tuition Income',          'INCOME', 'CHILD',  True,  '4100'),
    # School-specific revenue sub-accounts (FIRS-compliant) ──────────────────
    ('4106', 'Extracurricular Activities Income',       'INCOME', 'CHILD',  True,  '4100'),
    ('4108', 'Library and Technology Fees Income',      'INCOME', 'CHILD',  True,  '4100'),
    ('4109', 'Development and Maintenance Levy',        'INCOME', 'CHILD',  True,  '4100'),
    ('4110', 'Medical and Welfare Levy',                'INCOME', 'CHILD',  True,  '4100'),
    ('4111', 'Special Events and Functions Income',     'INCOME', 'CHILD',  True,  '4100'),
    ('4112', 'Coding and Technology Classes Income',    'INCOME', 'CHILD',  True,  '4100'),
    ('4113', 'Transportation and School Bus Fees',      'INCOME', 'CHILD',  True,  '4100'),
    ('4114', 'Parent-Teacher Association Levy',         'INCOME', 'CHILD',  True,  '4100'),
    ('4115', 'Practical and Laboratory Fees',           'INCOME', 'CHILD',  True,  '4100'),
    ('4116', 'BECE and NECO Examination Fees',          'INCOME', 'CHILD',  True,  '4100'),

    # --- Other Operating Income ----------------------------------------------
    ('4200', 'Other Operating Income',                 'INCOME', 'PARENT', False, None),
    ('4203', 'Gain on Disposal of Assets',              'INCOME', 'CHILD',  True,  '4200'),
    ('4209', 'Miscellaneous Income',                    'INCOME', 'CHILD',  True,  '4200'),

    # --- Revenue Deductions (contra-revenue) ---------------------------------
    ('4900', 'Revenue Deductions',                     'INCOME', 'PARENT', False, None),
    ('4901', 'Sales Returns and Allowances',            'INCOME', 'CHILD',  True,  '4900'),
    ('4902', 'Trade Discounts Granted',                 'INCOME', 'CHILD',  True,  '4900'),

    # =========================================================================
    # EXPENSES  5000 - 5999
    # =========================================================================

    # --- Cost of Sales -------------------------------------------------------
    ('5100', 'Cost of Sales',                          'EXPENSE', 'PARENT', False, None),
    ('5101', 'Cost of Sales - Uniform',                      'EXPENSE', 'CHILD',  True,  '5100'),
    ('5102', 'Cost of Sales - Textbook',                      'EXPENSE', 'CHILD',  True,  '5100'),
    ('5103', 'Cost of Sales - Launch',                      'EXPENSE', 'CHILD',  True,  '5100'),
    ('5104', 'Cost of Sales - Special Events',                      'EXPENSE', 'CHILD',  True,  '5100'),
    ('5105', 'Cost of Sales - Transportation',                      'EXPENSE', 'CHILD',  True,  '5100'),


    # --- Administrative and General Expenses ---------------------------------
    ('5300', 'Administrative and General Expenses',    'EXPENSE', 'PARENT', False, None),
    ('5301', 'Salary and Wages',                        'EXPENSE', 'CHILD',  True,  '5300'),
    ('5302', 'Bank Charges',                            'EXPENSE', 'CHILD',  True,  '5300'),
    ('5303', 'Computer Expenses',                       'EXPENSE', 'CHILD',  True,  '5300'),
    ('5304', 'Depreciation',                            'EXPENSE', 'CHILD',  True,  '5300'),
    ('5305', 'Employee Costs',                          'EXPENSE', 'CHILD',  True,  '5300'),
    ('5306', 'Cleaning Expenses',                       'EXPENSE', 'CHILD',  True,  '5300'),
    ('5307', 'Audit Fee',                               'EXPENSE', 'CHILD',  True,  '5300'),
    ('5308', 'Office Expenses',                         'EXPENSE', 'CHILD',  True,  '5300'),
    ('5309', 'Insurance Expenses',                      'EXPENSE', 'CHILD',  True,  '5300'),
    ('5310', 'Electricity and Energy',                  'EXPENSE', 'CHILD',  True,  '5300'),
    ('5311', 'Telephone Expenses',                      'EXPENSE', 'CHILD',  True,  '5300'),
    ('5312', 'Medical Expenses',                        'EXPENSE', 'CHILD',  True,  '5300'),
    ('5313', 'Entertainment Expenses',                  'EXPENSE', 'CHILD',  True,  '5300'),
    ('5314', 'Transport Expenses',                      'EXPENSE', 'CHILD',  True,  '5300'),
    ('5315', 'Fuel Expenses',                           'EXPENSE', 'CHILD',  True,  '5300'),
    ('5316', 'Repair - Generator',                      'EXPENSE', 'CHILD',  True,  '5300'),
    ('5317', 'Repair - Motor Vehicle',                  'EXPENSE', 'CHILD',  True,  '5300'),
    ('5318', 'Water Expenses',                          'EXPENSE', 'CHILD',  True,  '5300'),
    ('5319', 'Interest',                                'EXPENSE', 'CHILD',  True,  '5300'),
    ('5320', 'Office Supply',                           'EXPENSE', 'CHILD',  True,  '5300'),


    # --- Finance Costs -------------------------------------------------------
    ('5500', 'Finance Costs',                          'EXPENSE', 'PARENT', False, None),
    ('5502', 'Bank Charges and Fees',                   'EXPENSE', 'CHILD',  True,  '5500'),

    # --- Depreciation and Amortisation ---------------------------------------
    ('5600', 'Depreciation and Amortisation',          'EXPENSE', 'PARENT', False, None),
    ('5601', 'Depreciation of Property, Plant and Equipment', 'EXPENSE', 'CHILD', True, '5600'),
    ('5602', 'Amortisation of Intangible Assets',       'EXPENSE', 'CHILD',  True,  '5600'),

    # --- Tax Expense (FIRS-specific) -----------------------------------------
    ('5700', 'Tax Expense',                            'EXPENSE', 'PARENT', False, None),
    ('5701', 'Company Income Tax (CIT)',                'EXPENSE', 'CHILD',  True,  '5700'),
    ('5702', 'Education Tax (EDT)',                     'EXPENSE', 'CHILD',  True,  '5700'),
]


def create_standard_accounts(tenant, force=False, owner=None, branch=None):
    """
    Create FIRS/IFRS-compliant standard chart of accounts for a specific tenant.

    Idempotent: safe to call multiple times.  Existing non-deleted accounts are
    skipped (with ownership normalised).  Soft-deleted tombstones are hard-deleted
    and their code is reused.  Duplicate active records (same code for the same
    tenant+branch created under different owners) are collapsed to the oldest one.

    Use force=True to hard-delete and recreate every account from scratch.

    owner / branch may be passed explicitly (e.g. when called from an API view
    where the scoped User/Branch managers may not return the expected rows).
    When omitted the function resolves them via the canonical ordering used by
    the management command.

    Returns:
        tuple: (created_count, skipped_count)
    """
    from common.managers import _thread_locals

    # Resolve owner: prefer the explicitly supplied value so that API callers
    # can pass request.user directly and bypass the scoped manager.
    if owner is None:
        owner = User.objects.filter(tenant=tenant).order_by('id').first()
    if not owner:
        owner = User.objects.create(username=f"system_{tenant.id}", tenant=tenant)

    # Same for branch.
    if branch is None:
        branch = Branch.objects.filter(tenant=tenant).order_by('id').first()
    if not branch:
        branch = Branch.objects.create(tenant=tenant, name='Main')

    created_count = 0
    skipped_count = 0

    def _hard_delete(acct):
        """Physically remove a single account record."""
        Account.all_objects.filter(pk=acct.pk).hard_delete()

    def _find_nearest_parent_code(preferred_code):
        """Find nearest available 4-digit parent code if preferred is taken."""
        try:
            pref = int(preferred_code)
        except Exception:
            return preferred_code
        section = pref // 1000
        low_bound = section * 1000
        high_bound = low_bound + 999
        for offset in range(1, 500):
            for candidate in (pref - offset, pref + offset):
                if low_bound <= candidate <= high_bound:
                    candidate_code = str(candidate)
                    if not Account.all_objects.filter(
                        tenant=tenant, branch=branch,
                        code=candidate_code, account_level='PARENT',
                        is_deleted=False,
                    ).exists():
                        return candidate_code
        return preferred_code

    def _find_available_child_code(preferred_code):
        """
        Find next available 4-digit child code when the preferred code is already
        taken by an account under a *different* parent.  Stays within the same
        100-unit sub-group (e.g. 2120-2199 for 2120-children).
        """
        try:
            pref = int(preferred_code)
        except Exception:
            return preferred_code
        parent_int = pref - (pref % 100)
        for seq in range(1, 100):
            candidate = str(parent_int + seq)
            if not Account.all_objects.filter(
                tenant=tenant, branch=branch, code=candidate, is_deleted=False,
            ).exists():
                return candidate
        return preferred_code

    # Suppress generate_account_components signal during bulk setup.  These are
    # structural chart-of-accounts entries; individual workflow/form generation
    # would produce hundreds of duplicate WorkflowTemplates.
    _thread_locals.skip_account_components = True
    try:
        with transaction.atomic():
            for account_data in STANDARD_ACCOUNTS:
                code, name, account_type, account_level, allow_manual, parent_code = account_data

                # Fetch ALL rows (including soft-deleted) for this tenant+branch+code.
                # Order: non-deleted first, then by id, so the oldest active record
                # is treated as the canonical one.
                all_rows = list(
                    Account.all_objects.filter(
                        tenant=tenant, branch=branch, code=code
                    ).order_by('is_deleted', 'id')
                )
                active_rows = [r for r in all_rows if not r.is_deleted]
                deleted_rows = [r for r in all_rows if r.is_deleted]

                # Always hard-delete soft-deleted tombstones to keep the DB clean.
                for dead in deleted_rows:
                    _hard_delete(dead)

                if active_rows:
                    # Collapse any duplicate active accounts down to the first one.
                    for dup in active_rows[1:]:
                        _hard_delete(dup)

                    canonical = active_rows[0]

                    if not force:
                        # Normalise owner to the canonical user (fixes cross-owner
                        # duplicates created by signal vs. management command).
                        if canonical.owner_id != owner.pk:
                            canonical.owner = owner
                            canonical.save(update_fields=['owner', 'updated_at'])
                        skipped_count += 1
                        continue
                    else:
                        _hard_delete(canonical)
                        # Fall through to create a fresh record below.

                # ----- No active account with this code exists: create it -----
                if account_level == "PARENT":
                    # Widen the conflict check to ANY existing account at this code
                    # (could be a CHILD placed here by a bulk import).
                    conflict = Account.all_objects.filter(
                        tenant=tenant, branch=branch,
                        code=code, is_deleted=False,
                    ).exclude(account_level="PARENT", account_type=account_type).first()
                    if conflict:
                        code = _find_nearest_parent_code(code)

                    _, was_created = Account.objects.get_or_create(
                        tenant=tenant, branch=branch, code=code,
                        defaults=dict(
                            owner=owner,
                            name=name,
                            account_type=account_type,
                            account_level="PARENT",
                            allow_manual_entries=allow_manual,
                            is_system_account=True,
                            balance=Decimal("0.00"),
                        ),
                    )
                    if was_created:
                        created_count += 1
                    else:
                        skipped_count += 1

                else:  # CHILD
                    parent_account = Account.all_objects.filter(
                        tenant=tenant, branch=branch,
                        code=parent_code, account_level="PARENT", is_deleted=False,
                    ).first()

                    if not parent_account:
                        parent_row = next(
                            (r for r in STANDARD_ACCOUNTS if r[0] == parent_code and r[3] == "PARENT"),
                            None
                        )
                        parent_name_fallback = parent_row[1] if parent_row else name
                        parent_account, _ = Account.objects.get_or_create(
                            tenant=tenant, branch=branch, code=parent_code,
                            defaults=dict(
                                owner=owner,
                                name=parent_name_fallback,
                                account_type=account_type,
                                account_level="PARENT",
                                allow_manual_entries=False,
                                is_system_account=True,
                                balance=Decimal("0.00"),
                            ),
                        )

                    child_conflict = Account.all_objects.filter(
                        tenant=tenant, branch=branch, code=code, is_deleted=False,
                    ).exclude(parent=parent_account).first()
                    if child_conflict:
                        code = _find_available_child_code(code)

                    _, was_created = Account.objects.get_or_create(
                        tenant=tenant, branch=branch, code=code,
                        defaults=dict(
                            owner=owner,
                            name=name,
                            account_type=account_type,
                            account_level="CHILD",
                            parent=parent_account,
                            allow_manual_entries=allow_manual,
                            is_system_account=True,
                            balance=Decimal("0.00"),
                        ),
                    )
                    if was_created:
                        created_count += 1
                    else:
                        skipped_count += 1
    finally:
        _thread_locals.skip_account_components = False

    return created_count, skipped_count


def create_parent_accounts_only(tenant, force=False):
    """
    Create **only** the PARENT-level accounts for a tenant.

    Use this when you want the structural chart-of-accounts skeleton in place
    immediately (e.g. on tenant registration) without the full set of standard
    child accounts.  Children can be added on demand via
    ``get_or_create_child_account()`` as the business performs its first
    transactions.

    Parent accounts serve exclusively as summary / control headers.  They
    receive no direct postings; their balances are always the rolled-up total
    of their children.  Because FIRS/IFRS parent groupings are constant across
    all businesses, this function is safe to call on every new tenant.

    Args:
        tenant: Tenant instance.
        force (bool): If True, delete and recreate parent accounts even if
                      they already exist.

    Returns:
        tuple: (created_count, skipped_count)
    """
    from accounts.models import Account
    from users.models import User
    from branches.models import Branch

    parent_rows = [row for row in STANDARD_ACCOUNTS if row[3] == 'PARENT']

    # Deterministic owner: always the earliest-created user for this tenant.
    owner = User.objects.filter(tenant=tenant).order_by('id').first()
    if not owner:
        owner = getattr(tenant, 'owner', None)
    if not owner:
        logger.warning(
            "create_parent_accounts_only: no user found for tenant '%s' — skipping.",
            getattr(tenant, 'name', tenant.pk),
        )
        return 0, 0

    branch = Branch.objects.filter(tenant=tenant).order_by('id').first()
    if not branch:
        branch = Branch.objects.create(tenant=tenant, name='Main Branch')

    created_count = 0
    skipped_count = 0

    from common.managers import _thread_locals
    _thread_locals.skip_account_components = True
    try:
        with transaction.atomic():
            for code, name, account_type, account_level, allow_manual, _parent_code in parent_rows:
                # Check all rows including soft-deleted so we never accumulate tombstones.
                all_rows = list(
                    Account.all_objects.filter(
                        tenant=tenant, branch=branch, code=code
                    ).order_by('is_deleted', 'id')
                )
                active_rows = [r for r in all_rows if not r.is_deleted]
                deleted_rows = [r for r in all_rows if r.is_deleted]

                for dead in deleted_rows:
                    Account.all_objects.filter(pk=dead.pk).hard_delete()

                if active_rows:
                    for dup in active_rows[1:]:
                        Account.all_objects.filter(pk=dup.pk).hard_delete()
                    canonical = active_rows[0]
                    if not force:
                        if canonical.owner_id != owner.pk:
                            canonical.owner = owner
                            canonical.save(update_fields=['owner', 'updated_at'])
                        skipped_count += 1
                        continue
                    else:
                        Account.all_objects.filter(pk=canonical.pk).hard_delete()

                Account.objects.create(
                    tenant=tenant, owner=owner, branch=branch, code=code,
                    name=name, account_type=account_type,
                    account_level='PARENT',
                    allow_manual_entries=False,
                    is_system_account=True,
                    balance=Decimal('0.00'),
                )
                created_count += 1
    finally:
        _thread_locals.skip_account_components = False

    return created_count, skipped_count
