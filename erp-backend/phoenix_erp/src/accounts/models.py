from django.db import models
from django.core.exceptions import ValidationError
from django.db import transaction, IntegrityError
import time
from django.core.validators import RegexValidator
from django.conf import settings
from decimal import Decimal

# Use string references for cross-app relationships to avoid circular imports
from common.base import BranchScopedModel, SoftDeleteModel, TimeStampedModel
from common.managers import OwnerBranchManager
from django.db.models import F, Sum, Q
from django.utils import timezone
class Period(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Represents a fiscal month or year for closing.
    """
    MONTH = 'M'
    YEAR  = 'Y'
    TYPE_CHOICES = [(MONTH, 'Month'), (YEAR, 'Year')]

    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    branch = models.ForeignKey('branches.Branch', on_delete=models.PROTECT)
    period_type = models.CharField(max_length=1, choices=TYPE_CHOICES)
    year = models.PositiveSmallIntegerField()
    month = models.PositiveSmallIntegerField(null=True, blank=True,
                help_text="1–12 for monthly periods; blank for years.")
    is_closed = models.BooleanField(default=False)
    can_reopen = models.BooleanField(default=True,
                help_text="Month end can be reopened if true; years cannot.")

    objects = OwnerBranchManager()

    class Meta:
        unique_together = [
            ('owner','branch','period_type','year','month')
        ]
        ordering = ['-year','-month']

    def __str__(self):
        if self.period_type == self.MONTH:
            return f"{self.branch} • {self.year}-{self.month:02d}"
        return f"{self.branch} • {self.year} (Year)"



class AccountCategory(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Account categories for sub-classification within General Ledger sections.
    
    Hierarchy: General Ledger (section 1-5) → Category → Parent Account → Child Account
    
    Examples:
    - Section 1 (Assets) → "Inventory", "Loans Receivable", "Current Assets"
    - Section 2 (Liabilities) → "Savings Accounts", "Accounts Payable"
    - Section 5 (Expenses) → "Cost of Goods Sold", "Operating Expenses"
    
    System categories (is_system_category=True) are pre-built because ERP models depend on them:
    - Inventory → linked to InventoryItem model
    - Savings Accounts → linked to SavingsAccount model
    - Loans Receivable → linked to LoanAccount model
    """
    SECTION_CHOICES = [
        (1, 'Assets (1000–1999)'),
        (2, 'Liabilities (2000–2999)'),
        (3, 'Equity (3000–3999)'),
        (4, 'Revenue / Income (4000–4999)'),
        (5, 'Expenses (5000–5999)'),
    ]
    
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    branch = models.ForeignKey('branches.Branch', on_delete=models.PROTECT)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        on_delete=models.SET_NULL, 
        null=True, 
        related_name='created_categories'
    )
    
    section = models.PositiveSmallIntegerField(choices=SECTION_CHOICES)
    name = models.CharField(max_length=100)
    code_prefix = models.CharField(max_length=10)
    description = models.TextField(blank=True)
    
    # Mark system-required categories that have models depending on them
    is_system_category = models.BooleanField(
        default=False,
        help_text="True if this category is required by ERP models (Savings, Inventory, Loans, etc.)"
    )
    
    objects = OwnerBranchManager()
    
    class Meta:
        unique_together = [('owner', 'branch', 'section', 'name')]
        ordering = ['section', 'code_prefix']
        verbose_name_plural = 'Account Categories'

    def save(self, *args, **kwargs):
        """Auto-generate code_prefix from section - always keep in sync."""
        self.code_prefix = str(self.section)
        
        # Auto-assign tenant (but allow explicit tenant=None to skip)
        if not self.tenant_id and 'force_insert' not in kwargs:
            from common.managers import get_current_tenant
            tenant = get_current_tenant()
            # Verify tenant exists before using it
            if tenant:
                from users.models import Tenant
                if Tenant.objects.filter(id=tenant.id).exists():
                    self.tenant = tenant
            # Fallback to owner or branch tenant
            if not self.tenant and self.owner and hasattr(self.owner, 'tenant'):
                self.tenant = self.owner.tenant
            if not self.tenant and self.branch and hasattr(self.branch, 'tenant'):
                self.tenant = self.branch.tenant
        
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.code_prefix} – {self.name}"


# Enhanced Account model
class Account(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Enhanced Chart of Accounts with hierarchical support and concurrency control.
    
    Hierarchy Structure:
    - Root/Parent Accounts (e.g., "Total Savings", "Total Loans")
    - Child Accounts (e.g., Individual savings accounts, loan accounts)

    Concurrency is handled via:
    - Database-level SELECT FOR UPDATE on balance updates
    - Optimistic locking with version field
    - Atomic transactions for all balance modifications
    """
    # Account Types
    ASSET = 'ASSET'
    LIABILITY = 'LIABILITY'
    EQUITY = 'EQUITY'
    INCOME = 'INCOME'
    EXPENSE = 'EXPENSE'
    LOAN = 'LOAN'
    SAVINGS = 'SAVINGS'

    TYPE_CHOICES = [
        (ASSET, 'Asset Account'),
        (LIABILITY, 'Liability Account'),
        (EQUITY, 'Equity Account'),
        (INCOME, 'Income Account'),
        (EXPENSE, 'Expense Account'),
        (LOAN, 'Loan Account'),
        (SAVINGS, 'Savings Account'),
    ]

# Account Level
    LEVEL_PARENT = 'PARENT'  # General ledger accounts
    LEVEL_CHILD = 'CHILD'    # Sub-accounts
    
    LEVEL_CHOICES = [
        (LEVEL_PARENT, 'Parent Account (General Ledger)'),
        (LEVEL_CHILD, 'Child Account (Sub-Account)'),
    ]
    
    CREDIT = 'CR'
    DEBIT = 'DR'

    SIDE_CHOICES = [
        (CREDIT,'CREDIT SIDE'),
        (DEBIT, 'DEBIT SIDE')
    ]
    category = models.ForeignKey(
        AccountCategory, 
        on_delete=models.PROTECT, 
        related_name="accounts", 
        null=True, 
        blank=True
    )
    
    code = models.CharField(
        max_length=10,
        validators=[
            RegexValidator(
                r'^\d{4}(-\d{5})?$',
                'Account code must be either a 4-digit GL code (e.g. 1150) or a '
                'sub-ledger code in the format PPPP-NNNNN (e.g. 1150-00001). '
                'GL ranges: 1000–1999 Assets, 2000–2999 Liabilities, '
                '3000–3999 Equity, 4000–4999 Revenue, 5000–5999 Expenses.',
            )
        ],
        # unique=True removed - using conditional unique constraint instead (see Meta.constraints)
        # Sub-ledger child codes use format PPPP-NNNNN (max_length=10 is sufficient: 4+1+5=10)
    )
    
    name = models.CharField(max_length=100)
    
    account_level = models.CharField(
        max_length=10,
        choices=LEVEL_CHOICES,
        default=LEVEL_CHILD,
        help_text="Whether this is a parent (GL) or child account"
    )
    
    # Parent relationship - only for child accounts
    parent = models.ForeignKey(
        "self", 
        null=True, 
        blank=True, 
        on_delete=models.PROTECT, 
        related_name="children",
        help_text="Parent account (for child accounts only)"
    )
    
    # Account type
    account_type = models.CharField(
        max_length=20,
        choices=TYPE_CHOICES,
        default=ASSET,
        help_text="Type of account"
    )
    
    # Financial fields with concurrency control
    balance_bf = models.DecimalField(
        max_digits=18, 
        decimal_places=2, 
        default=Decimal("0.00"),
        help_text="Balance brought forward"
    )
    
    balance = models.DecimalField(
        max_digits=18, 
        decimal_places=2, 
        default=Decimal("0.00"),
        help_text="Current balance (updated atomically)"
    )
    
    # Optimistic locking version field
    version = models.IntegerField(
        default=0,
        help_text="Version number for optimistic locking"
    )
    
    # Metadata
    is_system_account = models.BooleanField(
        default=False,
        help_text="System-managed account (cannot be deleted)"
    )
    
    allow_manual_entries = models.BooleanField(
        default=True,
        help_text="Allow manual transaction entries"
    )
    
    # Cash management flags
    is_cashier_bank = models.BooleanField(
        default=False,
        help_text="Indicates if this is a cashier bank account (intermediate account for approvals). "
                    "Regular cashiers can only transfer to cashier banks, not main banks."
    )
    
    # NEW: Transaction pattern configuration
    enable_smart_forms = models.BooleanField(
        default=True,
        help_text="Enable automatic form/workflow generation for this account"
    )
    
    default_patterns = models.JSONField(
        default=list,
        help_text="Default transaction patterns (created automatically)"
    )
    
    def create_default_patterns(self):
        """
        Create default transaction patterns based on account type.
        Called after account creation.
        """
        if not self.enable_smart_forms:
            return
        
        patterns = []
        
        # For LOAN accounts
        if self.account_type == self.LOAN:
            # Pattern 1: Loan repayment from bank/cash
            patterns.append({
                'name': f'{self.name} - Repayment from Bank',
                'code': 'loan_repayment_bank',
                'this_account_side': 'CR',  # Credit loan (reduces balance)
                'contra_accounts': [
                    {
                        'account_type': 'ASSET',
                        'code_prefix': '1100',  # Cash and Cash Equivalents group
                        'label': 'Payment Source (Cash / Bank)'
                    }
                ],
            })
            
            # Pattern 2: Loan repayment from savings
            patterns.append({
                'name': f'{self.name} - Internal Repayment',
                'code': 'loan_repayment_savings',
                'this_account_side': 'CR',
                'contra_accounts': [
                    {
                        'account_type': 'SAVINGS',
                        'label': 'Savings Account'
                    }
                ],
            })
            
            # Pattern 3: Loan disbursement
            patterns.append({
                'name': f'{self.name} - Disbursement',
                'code': 'loan_disbursement',
                'this_account_side': 'DR',  # Debit loan (increases balance)
                'contra_accounts': [
                    {
                        'account_type': 'ASSET',
                        'code_prefix': '1100',  # Cash and Cash Equivalents group
                        'label': 'Disbursement Account'
                    }
                ],
            })
        
        # For SAVINGS accounts
        elif self.account_type == self.SAVINGS:
            patterns.extend([
                {
                    'name': f'{self.name} - Deposit',
                    'code': 'savings_deposit',
                    'this_account_side': 'CR',
                    'contra_accounts': [
                        {
                            'account_type': 'ASSET',
                            'code_prefix': '1100',  # Cash and Cash Equivalents group
                            'label': 'Deposit Source'
                        }
                    ],
                },
                {
                    'name': f'{self.name} - Withdrawal',
                    'code': 'savings_withdrawal',
                    'this_account_side': 'DR',
                    'contra_accounts': [
                        {
                            'account_type': 'ASSET',
                            'code_prefix': '1100',  # Cash and Cash Equivalents group
                            'label': 'Cash / Bank Account'
                        }
                    ],
                }
            ])
        
        # For INCOME accounts (school fees, etc.)
        elif self.account_type == self.INCOME:
            patterns.append({
                'name': f'{self.name} - Receipt',
                'code': 'income_receipt',
                'this_account_side': 'CR',  # Credit income
                'contra_accounts': [
                    {
                        'account_type': 'ASSET',
                        'code_prefix': '1100',  # Cash and Cash Equivalents group
                        'label': 'Received Into'
                    }
                ],
            })
        
        # Create patterns
        for pattern_data in patterns:
            self._create_pattern(pattern_data)
        
        return patterns
    
    def _create_pattern(self, pattern_data):
        """Create an AccountTransactionPattern from pattern data."""
        from automations.services.form_generation import FormGenerationService
        
        pattern = AccountTransactionPattern.objects.create(
            account=self,
            owner=self.owner,
            branch=self.branch,
            created_by=self.created_by,
            name=pattern_data['name'],
            code=pattern_data['code'],
            this_account_side=pattern_data['this_account_side'],
        )
        
        # Link contra accounts
        for contra_data in pattern_data.get('contra_accounts', []):
            # Find matching accounts
            contra_qs = Account.objects.filter(
                branch=self.branch,
                account_type=contra_data.get('account_type')
            )
            
            if 'code_prefix' in contra_data:
                contra_qs = contra_qs.filter(
                    code__startswith=contra_data['code_prefix']
                )
            
            for contra_account in contra_qs:
                PatternContraAccount.objects.create(
                    pattern=pattern,
                    contra_account=contra_account,
                    form_label=contra_data.get('label', contra_account.name)
                )
        
        # Auto-generate form and workflow
        if pattern.auto_generate_form:
            service = FormGenerationService()
            form_schema = service.generate_form_for_pattern(pattern)
            pattern.generated_form_schema = form_schema
            pattern.save()
        
        if pattern.auto_generate_workflow:
            workflow = service.generate_workflow_for_pattern(pattern)
            pattern.generated_workflow = workflow
            pattern.save()
        
        return pattern
    class Meta:
        indexes = [
            models.Index(fields=['parent', 'account_level']),
            models.Index(fields=['account_type']),
            models.Index(fields=['code']),
        ]
        ordering = ['code']  # Default ordering by account code
        constraints = [
            models.CheckConstraint(
                check=(
                    models.Q(account_level='PARENT', parent__isnull=True) |
                    models.Q(account_level='CHILD', parent__isnull=False)
                ),
                name='parent_child_consistency'
            ),
            # Unique constraint per tenant/branch — the canonical scope for a
            # chart of accounts is (tenant, branch), not (owner, branch).
            # Using owner caused duplicates whenever the signal and the
            # management command resolved to different owner users.
            models.UniqueConstraint(
                fields=['code', 'tenant', 'branch'],
                condition=models.Q(is_deleted=False),
                name='unique_code_per_tenant_branch_when_not_deleted'
            )
        ]
    
    def clean(self):
        """Validate parent-child relationships."""
        if self.account_level == self.LEVEL_PARENT and self.parent:
            raise ValidationError("Parent accounts cannot have a parent")
        
        if self.account_level == self.LEVEL_CHILD and not self.parent:
            raise ValidationError("Child accounts must have a parent")
        
        if self.parent and self.parent.account_level != self.LEVEL_PARENT:
            raise ValidationError("Parent must be a parent-level account")
        
        if self.parent and self.parent.account_type != self.account_type:
            raise ValidationError("Child account type must match parent account type")
    
    @classmethod
    def from_db(cls, db, field_names, values):
        instance = super().from_db(db, field_names, values)
        instance._original_balance = instance.balance
        return instance

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if not hasattr(self, '_original_balance'):
            self._original_balance = self.balance

    def save(self, *args, **kwargs):
        # Ensure tenant is set from owner if missing (helps tests and direct creates)
        try:
            if getattr(self, 'tenant', None) is None and getattr(self, 'owner', None) is not None:
                owner_tenant = getattr(self.owner, 'tenant', None)
                if owner_tenant is not None:
                    self.tenant = owner_tenant
        except Exception:
            pass

        # ACCOUNTING INTEGRITY PROTECTION:
        # Prevent direct balance writes outside of canonical posting mechanisms.
        # Three illegal patterns are blocked:
        #   1. save(update_fields=['balance']) on an existing record
        #   2. Full save() on an existing record where .balance was mutated
        #   3. create() / save() of a NEW record with a non-zero balance
        # The canonical path (TransactionEntry.post → queryset.update(balance=F+delta))
        # bypasses save() entirely and is therefore always allowed.
        import os
        from django.conf import settings as django_settings

        update_fields = kwargs.get('update_fields')
        _original = getattr(self, '_original_balance', Decimal('0'))

        is_balance_change = (
            (update_fields is not None and 'balance' in update_fields and self.pk)
            or (self.pk and update_fields is None and self.balance != _original)
            or (not self.pk and self.balance != Decimal('0'))
        )

        if is_balance_change:
            if not (getattr(django_settings, 'DISABLE_BALANCE_PROTECTION', False) or
                    os.environ.get('DISABLE_BALANCE_PROTECTION') == 'true'):
                import inspect
                frame = inspect.currentframe()
                try:
                    caller_frame = frame.f_back.f_back if frame and frame.f_back else None
                    caller_function = caller_frame.f_code.co_name if caller_frame else 'unknown'
                    caller_class = (
                        caller_frame.f_locals.get('self', None).__class__.__name__
                        if caller_frame and 'self' in caller_frame.f_locals else 'unknown'
                    )

                    allowed_functions = {'post', '_do_update', 'bulk_update', 'refresh_from_db', '_do_insert'}
                    allowed_classes = {'Account', 'TransactionEntry', 'QuerySet'}

                    if caller_function not in allowed_functions and caller_class not in allowed_classes:
                        raise PermissionError(
                            f"Direct balance updates are prohibited. "
                            f"Use TransactionEntry.post() to update account balances. "
                            f"Called from: {caller_class}.{caller_function}"
                        )
                finally:
                    del frame

        self.clean()
        super().save(*args, **kwargs)
        self._original_balance = self.balance
    
    # REMOVED: update_balance() method - SECURITY LEAK
    # All balance updates MUST go through TransactionEntry.post()
    # to maintain double-entry bookkeeping integrity.
    # See ACCOUNTING_INTEGRITY_AUDIT_REPORT.md for details.
    
    def get_hierarchy_path(self):
        """Get full hierarchy path (e.g., 'Assets > Savings > John Doe Savings')."""
        if self.parent:
            return f"{self.parent.get_hierarchy_path()} > {self.name}"
        return self.name
    
    def get_total_children_balance(self):
        """Calculate total balance of all child accounts."""
        if self.account_level == self.LEVEL_CHILD:
            return self.balance
        
        return self.children.aggregate(
            total=Sum('balance')
        )['total'] or Decimal('0.00')
    
    @property
    def can_post_transactions(self):
        """
        Determines if this account can receive direct transaction postings.
        
        Rules:
        - Parent accounts: NO (category/grouping accounts only)
        - Child accounts: YES (if allow_manual_entries is True)
        
        Returns:
            bool: True if account can receive transactions
        """
        if self.account_level == self.LEVEL_PARENT:
            return False
        return self.allow_manual_entries
    
    @property
    def is_category_account(self):
        """Check if this is a category/parent account (no direct transactions)."""
        return self.account_level == self.LEVEL_PARENT

    @property
    def is_entity_subledger(self):
        """
        True for a per-entity sub-ledger account (one loan, savings account,
        cashier till, fixed asset, or supplier) — the same accounts
        entity_subledger_q() excludes from generic account lists by default.
        Lets a picker that searched with include_subledgers=true tell these
        apart from an ordinary child account, so it knows to also surface
        the parent category for context.
        """
        return Account.objects.filter(pk=self.pk).filter(self.entity_subledger_q()).exists()

    @classmethod
    @transaction.atomic
    def create_with_parent(cls, parent_code: str, child_data: dict):
        """
        Create a child (sub-ledger) account under a parent GL account.

        Child codes are generated in the format  PPPP-NNNNN  where PPPP is the
        parent's 4-digit code and NNNNN is a zero-padded sequential number
        (e.g. 1150-00001, 1150-00002, …).  This scheme is unlimited in scale
        (up to 99,999 children per parent) and never collides with other
        parent codes.

        Args:
            parent_code: 4-digit code of the parent GL account (e.g. '1150').
            child_data:  Dict of field values for the new child account.
                         Provide 'code' to override auto-generation.
        Returns:
            The newly created child Account instance.
        """
        # Parent GL codes (e.g. '2140') are unique per (tenant, branch), not
        # globally — every branch gets its own copy of the chart of accounts
        # via BranchCloneService. Once a tenant has more than one branch, an
        # unscoped lookup raises MultipleObjectsReturned. Scope by branch/
        # tenant whenever the caller supplied them on child_data.
        parent_qs = cls.objects.select_for_update().filter(
            code=parent_code,
            account_level=cls.LEVEL_PARENT
        )
        branch = child_data.get('branch')
        if branch is not None:
            parent_qs = parent_qs.filter(branch=branch)
        tenant = child_data.get('tenant')
        if tenant is not None:
            parent_qs = parent_qs.filter(tenant=tenant)
        parent = parent_qs.get()

        # Auto-generate sub-ledger code if not explicitly supplied
        if 'code' not in child_data:
            prefix = f"{parent_code}-"
            # Find the highest existing sequence number for this parent
            existing_seqs = []
            for code in parent.children.filter(
                is_deleted=False
            ).values_list('code', flat=True):
                if code.startswith(prefix):
                    try:
                        existing_seqs.append(int(code[len(prefix):]))
                    except (ValueError, IndexError):
                        pass
            next_seq = (max(existing_seqs) + 1) if existing_seqs else 1
            child_data['code'] = f"{parent_code}-{next_seq:05d}"

        # Inherit required relational fields from parent
        child_data['parent'] = parent
        child_data['account_level'] = cls.LEVEL_CHILD
        child_data['account_type'] = parent.account_type
        child_data['category'] = parent.category
        child_data.setdefault('tenant', parent.tenant)

        return cls.objects.create(**child_data)

    # Maps a short kind name (used by the `include_subledgers` API param) to
    # the Q clause that matches that kind's per-entity sub-ledger accounts.
    _SUBLEDGER_KIND_Q = {
        'loan': lambda: Q(loan_account_detail__isnull=False),
        'savings': lambda: Q(savings_account_detail__isnull=False),
        'cashier': lambda: Q(cashier_accounts__isnull=False),
        'asset': lambda: (
            Q(fixed_asset_detail__isnull=False)
            | Q(fixed_asset_accumulated_depreciation_detail__isnull=False)
        ),
        'supplier': lambda: Q(supplier_detail__isnull=False),
    }

    @classmethod
    def entity_subledger_q(cls, kinds=None):
        """
        Matches Account rows that exist purely to track one specific entity's
        balance (a loan, a savings account, a cashier till, a fixed asset, a
        supplier's payable balance) rather than being a chart-of-accounts
        entry a human would pick from a generic account list — each entity
        model links straight to its own dedicated Account row
        (LoanAccount.account, SavingsAccount.account, CashierAccount.account,
        FixedAsset.account / FixedAsset.accumulated_depreciation_account,
        Supplier.account), so the reverse relation being non-null is the
        reliable signal; the account_type ('LOAN'/'SAVINGS') alone also
        matches the legitimate parent GL headers ("Customer Loan Portfolio"
        etc.), and cashier/asset/supplier sub-ledgers are plain
        ASSET/LIABILITY accounts indistinguishable by type or code format
        from a normal Cash or Trade Creditors account.

        `kinds`: optional iterable restricting the match to specific
        sub-ledger kinds ('loan', 'savings', 'cashier', 'asset', 'supplier').
        Defaults to all of them (the original, full exclusion set).
        """
        selected = kinds if kinds is not None else cls._SUBLEDGER_KIND_Q.keys()
        q = Q(pk__in=[])  # always-false base so an empty `kinds` matches nothing
        for kind in selected:
            q |= cls._SUBLEDGER_KIND_Q[kind]()
        return q

    @classmethod
    def exclude_entity_subledgers(cls, queryset, keep_kinds=None):
        """Drop per-entity sub-ledger accounts (see entity_subledger_q) from a queryset.

        `keep_kinds`: optional iterable of sub-ledger kinds to leave in the
        queryset instead of excluding (e.g. {'cashier'} to hide loan/savings/
        asset/supplier sub-ledgers but keep cashier tills visible).
        """
        if keep_kinds:
            kinds = [k for k in cls._SUBLEDGER_KIND_Q if k not in set(keep_kinds)]
        else:
            kinds = None
        return queryset.exclude(cls.entity_subledger_q(kinds=kinds))

    def __str__(self):
        level_indicator = "📁" if self.account_level == self.LEVEL_PARENT else "📄"
        return f"{level_indicator} {self.code} – {self.name}"

    @classmethod
    def create_for_category(cls, branch, category, name, owner=None, created_by=None):
        # pick next code in 100–199, 200–299, etc.
        # Accept optional owner/created_by to satisfy NOT NULL audit fields when creating in commit mode.
        try:
            p = int(category.code_prefix)
        except Exception:
            p = 1
        lower = p * 1000   # e.g. section 1 (Assets) → 1000
        upper = lower + 999  # → 1999

        create_kwargs = {
            'branch': branch,
            'category': category,
            'name': name,
            'tenant': branch.tenant
        }
        if owner is not None:
            create_kwargs['owner'] = owner
        if created_by is not None:
            create_kwargs['created_by'] = created_by

        last_exc = None
        # Try a few times inside a savepoint so IntegrityError doesn't poison outer transaction
        for attempt in range(5):
            try:
                with transaction.atomic():
                    # Lock the category row to serialize allocations for this category.
                    try:
                        AccountCategory.objects.select_for_update().get(pk=category.pk)
                    except Exception:
                        # best-effort: if category can't be locked, continue — the subsequent
                        # select_for_update on accounts will still help for existing rows.
                        pass

                    # collect existing numeric codes in range for this branch while locked
                    existing_codes_qs = cls.objects.select_for_update().filter(
                        branch=branch, code__gte=str(lower), code__lte=str(upper)
                    ).values_list('code', flat=True)
                    existing_ints = set()
                    for c in existing_codes_qs:
                        try:
                            existing_ints.add(int(c))
                        except Exception:
                            continue

                    # find first free slot (avoid lower which is typically reserved)
                    candidate = None
                    for num in range(lower + 1, upper + 1):
                        if num not in existing_ints:
                            candidate = num
                            break

                    if candidate is None:
                        raise RuntimeError(f"No available account codes in range {lower}–{upper} for category {category}")

                    code = str(candidate)  # already 4 digits in the 1000–5999 range
                    create_kwargs['code'] = code
                    try:
                        return cls.objects.create(**create_kwargs)
                    except IntegrityError as ie:
                        # someone else created the chosen code — mark and retry outer loop
                        last_exc = ie
                        # continue to next attempt (the savepoint rollback keeps outer transaction OK)
                        continue
            except IntegrityError as ie2:
                # savepoint failed — record and retry after a small backoff
                last_exc = ie2
                time.sleep(0.02 * (attempt + 1))
                continue

        # If we're here we failed to allocate after retries
        if last_exc:
            raise RuntimeError(f"Could not allocate account code in category {category} after retries: {last_exc}")
        raise RuntimeError(f"Could not allocate account code in category {category} after retries")



class BalanceSheetSnapshot(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Stores account balances at period closure for fast historical reporting.
    """
    period = models.ForeignKey(Period, on_delete=models.CASCADE, related_name='snapshots')
    account = models.ForeignKey(Account, on_delete=models.CASCADE, related_name='snapshots')
    balance = models.DecimalField(max_digits=18, decimal_places=2)

    objects = OwnerBranchManager()

    class Meta:
        unique_together = [('period', 'account')]
        indexes = [
            models.Index(fields=['period', 'account']),
            models.Index(fields=['owner', 'branch', 'period'])
        ]

    def __str__(self):
        return f"{self.account.code} @ {self.period}"

# accounts/models.py - ENHANCED Account model

# accounts/models.py - Enhanced Pattern System

class AccountTransactionPattern(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Enhanced with validation rules and dynamic field configuration
    """
    account = models.ForeignKey(Account, on_delete=models.CASCADE, related_name='transaction_patterns')
    
    name = models.CharField(max_length=100)
    code = models.SlugField(max_length=50)
    
    this_account_side = models.CharField(max_length=2, choices=Account.SIDE_CHOICES)
    
    # NEW: Validation rules stored as JSON
    validation_rules = models.JSONField(
        default=dict,
        help_text="""
        {
            'amount': {'min': 0, 'max': 1000000, 'required': True},
            'requires_approval_above': 50000,
            'allowed_days': ['monday', 'tuesday', ...],
            'custom_validations': [...]
        }
        """
    )
    
    # NEW: Dynamic field configuration
    additional_fields = models.JSONField(
        default=list,
        help_text="""
        Additional fields beyond standard transaction fields:
        [
            {
                'id': 'loan_purpose',
                'label': 'Loan Purpose',
                'type': 'select',
                'options': ['business', 'education', 'medical'],
                'required': True,
                'visible_when': {'field': 'amount', 'operator': '>', 'value': 10000}
            }
        ]
        """
    )
    
    # NEW: Post-transaction actions
    post_transaction_actions = models.JSONField(
        default=list,
        help_text="""
        Actions to trigger after transaction:
        [
            {'type': 'send_sms', 'template': 'transaction_receipt'},
            {'type': 'update_client_status', 'condition': '...'},
            {'type': 'create_schedule', 'frequency': 'monthly'}
        ]
        """
    )
    
    # NEW: Approval workflow configuration
    approval_config = models.JSONField(
        default=dict,
        help_text="""
        {
            'required': True,
            'rules': [
                {'condition': 'amount > 50000', 'approvers': ['manager']},
                {'condition': 'client.risk_level == "high"', 'approvers': ['manager', 'ceo']}
            ]
        }
        """
    )
    
    # Metadata for conditional logic
    availability_conditions = models.JSONField(
        default=dict,
        help_text="""
        When this pattern is available:
        {
            'account_status': ['active'],
            'client_status': ['active', 'verified'],
            'minimum_balance': 1000,
            'custom_conditions': [...]
        }
        """
    )
    
    # Display configuration
    display_config = models.JSONField(
        default=dict,
        help_text="""
        {
            'icon': 'bank-transfer',
            'color': '#4CAF50',
            'category': 'payments',
            'featured': True,
            'order': 1
        }
        """
    )


class PatternContraAccount(models.Model):
    """
    Enhanced with dynamic filtering and conditional logic
    """
    pattern = models.ForeignKey(AccountTransactionPattern, on_delete=models.CASCADE)
    
    # Can be specific account OR account criteria
    contra_account = models.ForeignKey(
        Account, 
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        help_text="Specific account (if fixed)"
    )
    
    # NEW: Dynamic account selection criteria
    account_selection_criteria = models.JSONField(
        default=dict,
        help_text="""
        Criteria for selecting contra accounts dynamically:
        {
            'account_type': 'ASSET',
            'code_prefix': '101',
            'account_level': 'CHILD',
            'parent_code': '150',
            'status': 'active',
            'custom_filters': {'metadata.branch_type': 'main'}
        }
        """
    )
    
    # NEW: Conditional availability
    availability_condition = models.JSONField(
        default=dict,
        help_text="""
        {
            'field': 'client.account_type',
            'operator': 'in',
            'values': ['premium', 'vip']
        }
        """
    )
    
    # NEW: Default selection logic
    default_selection_rule = models.JSONField(
        default=dict,
        help_text="""
        {
            'type': 'last_used',  // or 'most_frequent', 'balance_based', etc.
            'fallback': 'account_id_123'
        }
        """
    )
    
    # Form presentation
    form_label = models.CharField(max_length=100, blank=True)
    help_text = models.CharField(max_length=255, blank=True)
    display_order = models.IntegerField(default=0)
    
    # NEW: Validation for this specific contra account
    specific_validation = models.JSONField(
        default=dict,
        help_text="Additional validation when this contra account is selected"
    )


