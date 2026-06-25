# branches/services.py
"""
Branch config clone service.

Copies all configuration (non-transactional) data from one branch to another
within the same tenant. Runs inside a single atomic transaction so the target
branch is either fully set up or left untouched on failure.

What IS cloned
--------------
Chart of Accounts (GL parent + 4-digit child accounts), account categories,
products & product categories, fees, loan products, savings products,
expense/income categories, inventory categories & items, service items,
asset categories, salary components, leave types, workflow templates,
form schemas, fee structures & components, and all their child/dependent rows.

What is NOT cloned
------------------
- Sub-ledger accounts (PPPP-NNNNN format — per client/loan)
- Transactions, journal entries, transaction entries
- Client accounts (LoanAccount, SavingsAccount)
- Client, staff or user data
- Bank accounts, cashier accounts, petty cash funds
- Fiscal periods, balance sheet snapshots
- Operational records (expenses, income payments, procurement, etc.)
"""

import logging
import re

from django.db import transaction

logger = logging.getLogger(__name__)

_GL_CHILD_PATTERN = re.compile(r'^\d{4}$')

_BASE_SKIP = frozenset({
    'id', 'pk', 'branch', 'owner', 'tenant', 'created_by',
    'created_at', 'updated_at', 'is_deleted',
})


class BranchCloneService:

    def __init__(self, source_branch, target_branch, user):
        self.source = source_branch
        self.target = target_branch
        self.user = user
        self.tenant = getattr(user, 'tenant', None)
        # {ModelClass: {old_pk: new_pk}}
        self.id_map = {}
        self.created = {}
        self.skipped = {}
        self.errors = []

    # ── id_map helpers ────────────────────────────────────────────────────────

    def _register(self, model_cls, old_pk, new_pk):
        self.id_map.setdefault(model_cls, {})[old_pk] = new_pk

    def _remap(self, model_cls, old_id):
        """Return the new instance for a cloned FK, or None."""
        if old_id is None:
            return None
        new_pk = self.id_map.get(model_cls, {}).get(old_id)
        if new_pk is None:
            return None
        try:
            return model_cls.objects.get(pk=new_pk)
        except model_cls.DoesNotExist:
            return None

    # ── Field helpers ─────────────────────────────────────────────────────────

    def _base(self):
        return dict(
            branch=self.target,
            owner=self.user,
            tenant=self.tenant,
            created_by=self.user,
        )

    def _scalars(self, obj, extra_skip=None):
        """
        Return a dict of all concrete scalar (non-FK) field values from obj,
        excluding audit / identity fields.
        """
        skip = set(_BASE_SKIP)
        if extra_skip:
            skip.update(extra_skip)
        return {
            f.name: getattr(obj, f.name)
            for f in obj._meta.fields
            if f.name not in skip and not f.is_relation
        }

    def _inc(self, key):
        self.created[key] = self.created.get(key, 0) + 1

    def _skip(self, key):
        self.skipped[key] = self.skipped.get(key, 0) + 1

    def _find_existing(self, model_cls, **lookup):
        """Return the first non-deleted record matching lookup, or None."""
        try:
            return model_cls.objects.filter(is_deleted=False, **lookup).first()
        except Exception:
            return model_cls.objects.filter(**lookup).first()

    def _upsert(self, model_cls, lookup, create_kwargs, label, old_pk):
        """
        Register and count an existing record, or create + register a new one.
        Returns the (existing or new) instance, or None on error.
        """
        existing = self._find_existing(model_cls, **lookup)
        if existing:
            self._register(model_cls, old_pk, existing.pk)
            self._skip(label)
            return existing
        try:
            obj = model_cls.objects.create(**create_kwargs)
            self._register(model_cls, old_pk, obj.pk)
            self._inc(label)
            return obj
        except Exception as exc:
            self.errors.append(f"{model_cls.__name__} (old_pk={old_pk}): {exc}")
            logger.warning("BranchClone upsert error %s pk=%s: %s", model_cls.__name__, old_pk, exc)
            return None

    # ── Entry point ───────────────────────────────────────────────────────────

    @transaction.atomic
    def clone(self):
        """
        Execute the full clone. Returns a summary dict.
        Raises on hard failures (e.g. DB constraint that wasn't caught).
        """
        # Phase 1 — no inter-model FK deps
        self._clone_account_categories()
        self._clone_product_categories()
        self._clone_fees()
        self._clone_salary_components()
        self._clone_leave_types()
        self._clone_workflow_templates()
        self._clone_form_schemas()

        # Phase 2 — depend on AccountCategory / ProductCategory
        self._clone_accounts()
        self._clone_products()

        # Phase 3 — depend on Account (GL child) / Product
        self._clone_income_categories()
        self._clone_inventory_categories()

        # Phase 4 — depend on previous phases
        self._clone_service_items()
        self._clone_inventory_items()
        self._clone_expense_categories()
        self._clone_asset_categories()
        self._clone_loan_products()
        self._clone_savings_products()
        self._clone_fee_structures()

        # Phase 5 — depend on phase 4
        self._clone_loan_product_fees()
        self._clone_loan_product_savings_requirements()
        self._clone_product_requirements()
        self._clone_fee_structure_components()

        return {
            'source_branch': str(self.source),
            'target_branch': str(self.target),
            'created': self.created,
            'skipped': self.skipped,
            'errors': self.errors,
        }

    # ── Phase 1 ───────────────────────────────────────────────────────────────

    def _clone_account_categories(self):
        from accounts.models import AccountCategory
        label = 'account_categories'
        for obj in AccountCategory.objects.filter(branch=self.source, is_deleted=False):
            self._upsert(
                AccountCategory,
                lookup={'branch': self.target, 'section': obj.section, 'name': obj.name},
                create_kwargs={
                    **self._base(),
                    'section': obj.section,
                    'name': obj.name,
                    'description': obj.description,
                    'is_system_category': obj.is_system_category,
                },
                label=label,
                old_pk=obj.pk,
            )

    def _clone_product_categories(self):
        from products.models import ProductCategory
        label = 'product_categories'
        # NULL parent first so hierarchy can be remapped correctly.
        qs = ProductCategory.objects.filter(
            branch=self.source, is_deleted=False
        ).order_by('parent__id')
        for obj in qs:
            parent = self._remap(ProductCategory, obj.parent_id)
            self._upsert(
                ProductCategory,
                # Unique constraint is (code, industry) — not per-branch.
                lookup={'code': obj.code, 'industry': obj.industry},
                create_kwargs={
                    **self._base(),
                    'code': obj.code,
                    'name': obj.name,
                    'description': obj.description,
                    'industry': obj.industry,
                    'parent': parent,
                    'attributes': obj.attributes,
                },
                label=label,
                old_pk=obj.pk,
            )

    def _clone_fees(self):
        from products.models import Fee
        label = 'fees'
        for obj in Fee.objects.filter(branch=self.source, is_deleted=False):
            self._upsert(
                Fee,
                lookup={'branch': self.target, 'name': obj.name},
                create_kwargs={**self._base(), **self._scalars(obj)},
                label=label,
                old_pk=obj.pk,
            )

    def _clone_salary_components(self):
        from hr.models import SalaryComponent
        label = 'salary_components'
        for obj in SalaryComponent.objects.filter(branch=self.source, is_deleted=False):
            self._upsert(
                SalaryComponent,
                lookup={'branch': self.target, 'name': obj.name},
                create_kwargs={**self._base(), **self._scalars(obj)},
                label=label,
                old_pk=obj.pk,
            )

    def _clone_leave_types(self):
        from hr.models import LeaveType
        label = 'leave_types'
        for obj in LeaveType.objects.filter(branch=self.source, is_deleted=False):
            self._upsert(
                LeaveType,
                lookup={'branch': self.target, 'name': obj.name},
                create_kwargs={**self._base(), **self._scalars(obj)},
                label=label,
                old_pk=obj.pk,
            )

    def _clone_workflow_templates(self):
        from automations.models import WorkflowTemplate
        label = 'workflow_templates'
        for obj in WorkflowTemplate.objects.filter(branch=self.source, is_deleted=False):
            self._upsert(
                WorkflowTemplate,
                lookup={'branch': self.target, 'name': obj.name},
                create_kwargs={**self._base(), **self._scalars(obj)},
                label=label,
                old_pk=obj.pk,
            )

    def _clone_form_schemas(self):
        from automations.models import FormSchema
        label = 'form_schemas'
        for obj in FormSchema.objects.filter(branch=self.source, is_deleted=False):
            self._upsert(
                FormSchema,
                lookup={'branch': self.target, 'name': obj.name},
                create_kwargs={**self._base(), **self._scalars(obj)},
                label=label,
                old_pk=obj.pk,
            )

    # ── Phase 2 ───────────────────────────────────────────────────────────────

    def _clone_accounts(self):
        """
        Clone GL PARENT accounts, then GL CHILD accounts with 4-digit codes.
        Sub-ledger (per-client) accounts in PPPP-NNNNN format are intentionally skipped.
        Balances are NOT copied — cloned accounts start at zero.
        """
        from accounts.models import Account, AccountCategory
        label = 'gl_accounts'

        # 1. PARENT accounts (no parent FK dependency)
        for obj in Account.objects.filter(
            branch=self.source, is_deleted=False, account_level=Account.LEVEL_PARENT
        ).select_related('category'):
            cat = self._remap(AccountCategory, obj.category_id)
            self._upsert(
                Account,
                lookup={'branch': self.target, 'code': obj.code, 'tenant': self.tenant},
                create_kwargs={
                    **self._base(),
                    'code': obj.code,
                    'name': obj.name,
                    'account_level': Account.LEVEL_PARENT,
                    'account_type': obj.account_type,
                    'category': cat,
                    'parent': None,
                    'is_system_account': obj.is_system_account,
                    'allow_manual_entries': obj.allow_manual_entries,
                    'is_cashier_bank': obj.is_cashier_bank,
                    'enable_smart_forms': obj.enable_smart_forms,
                    'default_patterns': obj.default_patterns,
                    # balance / balance_bf intentionally omitted → default 0
                },
                label=label,
                old_pk=obj.pk,
            )

        # 2. GL CHILD accounts with 4-digit codes (not sub-ledger PPPP-NNNNN)
        for obj in Account.objects.filter(
            branch=self.source, is_deleted=False, account_level=Account.LEVEL_CHILD
        ).select_related('parent', 'category'):
            if not _GL_CHILD_PATTERN.match(obj.code):
                continue

            parent = self._remap(Account, obj.parent_id)
            if parent is None:
                self.errors.append(
                    f"GL Account '{obj.code} – {obj.name}': parent not cloned, skipped"
                )
                continue

            cat = self._remap(AccountCategory, obj.category_id)
            self._upsert(
                Account,
                lookup={'branch': self.target, 'code': obj.code, 'tenant': self.tenant},
                create_kwargs={
                    **self._base(),
                    'code': obj.code,
                    'name': obj.name,
                    'account_level': Account.LEVEL_CHILD,
                    'account_type': obj.account_type,
                    'category': cat,
                    'parent': parent,
                    'is_system_account': obj.is_system_account,
                    'allow_manual_entries': obj.allow_manual_entries,
                    'is_cashier_bank': obj.is_cashier_bank,
                    'enable_smart_forms': obj.enable_smart_forms,
                    'default_patterns': obj.default_patterns,
                },
                label=label,
                old_pk=obj.pk,
            )

    def _clone_products(self):
        from products.models import Product
        label = 'products'
        for obj in Product.objects.filter(branch=self.source, is_deleted=False):
            self._upsert(
                Product,
                lookup={'branch': self.target, 'code': obj.code},
                create_kwargs={**self._base(), **self._scalars(obj)},
                label=label,
                old_pk=obj.pk,
            )

    # ── Phase 3 ───────────────────────────────────────────────────────────────

    def _clone_income_categories(self):
        from incomes.models import IncomeCategory
        from accounts.models import Account
        label = 'income_categories'
        # NULL parent_category first for self-referential hierarchy
        qs = IncomeCategory.objects.filter(
            branch=self.source, is_deleted=False
        ).order_by('parent_category__id')
        for obj in qs:
            income_acct = self._remap(Account, obj.income_account_id)
            if income_acct is None:
                self.errors.append(
                    f"IncomeCategory '{obj.name}' (pk={obj.pk}): income_account not cloned, skipped"
                )
                continue
            parent_cat = self._remap(IncomeCategory, obj.parent_category_id)
            self._upsert(
                IncomeCategory,
                lookup={'branch': self.target, 'code': obj.code, 'owner': self.user},
                create_kwargs={
                    **self._base(),
                    'name': obj.name,
                    'code': obj.code,
                    'description': obj.description,
                    'income_account': income_acct,
                    'behavior_config': obj.behavior_config,
                    'parent_category': parent_cat,
                    'is_active': obj.is_active,
                },
                label=label,
                old_pk=obj.pk,
            )

    def _clone_inventory_categories(self):
        from inventory.models import InventoryCategory
        from accounts.models import Account
        label = 'inventory_categories'
        for obj in InventoryCategory.objects.filter(branch=self.source, is_deleted=False):
            inv_acct = self._remap(Account, obj.inventory_account_id)
            cogs_acct = self._remap(Account, obj.cogs_account_id)
            if inv_acct is None or cogs_acct is None:
                self.errors.append(
                    f"InventoryCategory '{obj.name}' (pk={obj.pk}): required GL accounts not cloned, skipped"
                )
                continue
            sales_acct = self._remap(Account, obj.sales_account_id)
            self._upsert(
                InventoryCategory,
                lookup={'branch': self.target, 'code': obj.code},
                create_kwargs={
                    **self._base(),
                    'name': obj.name,
                    'code': obj.code,
                    'description': obj.description,
                    'item_type': getattr(obj, 'item_type', ''),
                    'inventory_account': inv_acct,
                    'cogs_account': cogs_acct,
                    'sales_account': sales_acct,
                },
                label=label,
                old_pk=obj.pk,
            )

    # ── Phase 4 ───────────────────────────────────────────────────────────────

    def _clone_service_items(self):
        from incomes.models import ServiceItem, IncomeCategory
        label = 'service_items'
        for obj in ServiceItem.objects.filter(branch=self.source, is_deleted=False):
            cat = self._remap(IncomeCategory, obj.category_id)
            self._upsert(
                ServiceItem,
                lookup={'branch': self.target, 'code': obj.code},
                create_kwargs={
                    **self._base(),
                    **self._scalars(obj),
                    'category': cat,
                },
                label=label,
                old_pk=obj.pk,
            )

    def _clone_inventory_items(self):
        from inventory.models import InventoryItem, InventoryCategory
        label = 'inventory_items'
        for obj in InventoryItem.objects.filter(branch=self.source, is_deleted=False):
            cat = self._remap(InventoryCategory, obj.category_id)
            if cat is None:
                self.errors.append(
                    f"InventoryItem '{obj.name}' (pk={obj.pk}): category not cloned, skipped"
                )
                continue
            self._upsert(
                InventoryItem,
                lookup={'branch': self.target, 'sku': obj.sku},
                create_kwargs={
                    **self._base(),
                    **self._scalars(obj),
                    'category': cat,
                },
                label=label,
                old_pk=obj.pk,
            )

    def _clone_expense_categories(self):
        from expenses.models import ExpenseCategory
        from accounts.models import Account
        from products.models import Product
        label = 'expense_categories'
        for obj in ExpenseCategory.objects.filter(branch=self.source, is_deleted=False):
            exp_acct = self._remap(Account, obj.expense_account_id)
            if exp_acct is None:
                self.errors.append(
                    f"ExpenseCategory '{obj.name}' (pk={obj.pk}): expense_account not cloned, skipped"
                )
                continue
            product = self._remap(Product, obj.product_id)
            prepaid_acct = self._remap(Account, obj.prepaid_account_id)
            self._upsert(
                ExpenseCategory,
                lookup={'branch': self.target, 'code': obj.code},
                create_kwargs={
                    **self._base(),
                    **self._scalars(obj),
                    'expense_account': exp_acct,
                    'product': product,
                    'prepaid_account': prepaid_acct,
                },
                label=label,
                old_pk=obj.pk,
            )

    def _clone_asset_categories(self):
        from assets.models import AssetCategory
        from accounts.models import Account
        label = 'asset_categories'
        for obj in AssetCategory.objects.filter(branch=self.source, is_deleted=False):
            asset_acct = self._remap(Account, obj.asset_account_id)
            dep_acct = self._remap(Account, obj.depreciation_account_id)
            acc_dep_acct = self._remap(Account, obj.accumulated_depreciation_account_id)
            if not all([asset_acct, dep_acct, acc_dep_acct]):
                self.errors.append(
                    f"AssetCategory '{obj.name}' (pk={obj.pk}): required GL accounts not cloned, skipped"
                )
                continue
            maint_acct = self._remap(Account, obj.maintenance_expense_account_id)
            self._upsert(
                AssetCategory,
                lookup={'branch': self.target, 'code': obj.code},
                create_kwargs={
                    **self._base(),
                    **self._scalars(obj),
                    'asset_account': asset_acct,
                    'depreciation_account': dep_acct,
                    'accumulated_depreciation_account': acc_dep_acct,
                    'maintenance_expense_account': maint_acct,
                },
                label=label,
                old_pk=obj.pk,
            )

    def _clone_loan_products(self):
        from loans.models import LoanProduct
        from products.models import Product
        from accounts.models import Account
        label = 'loan_products'
        for obj in LoanProduct.objects.filter(branch=self.source, is_deleted=False):
            product = self._remap(Product, obj.product_id)
            parent_acct = self._remap(Account, obj.parent_account_id)
            if product is None or parent_acct is None:
                self.errors.append(
                    f"LoanProduct (pk={obj.pk}): product or parent_account not cloned, skipped"
                )
                continue

            # LoanProduct is one-to-one with Product; if the cloned Product
            # already has a LoanProduct, register it and continue.
            existing = LoanProduct.objects.filter(product=product).first()
            if existing:
                self._register(LoanProduct, obj.pk, existing.pk)
                self._skip(label)
                continue

            try:
                new_obj = LoanProduct.objects.create(
                    **self._base(),
                    **self._scalars(obj),
                    product=product,
                    parent_account=parent_acct,
                    disbursement_account=self._remap(Account, obj.disbursement_account_id),
                    interest_income_account=self._remap(Account, obj.interest_income_account_id),
                    fee_income_account=self._remap(Account, obj.fee_income_account_id),
                    penalty_income_account=self._remap(Account, obj.penalty_income_account_id),
                    insurance_income_account=self._remap(Account, obj.insurance_income_account_id),
                )
                self._register(LoanProduct, obj.pk, new_obj.pk)
                self._inc(label)
            except Exception as exc:
                self.errors.append(f"LoanProduct (pk={obj.pk}): {exc}")

    def _clone_savings_products(self):
        from savings.models import SavingsProduct
        from products.models import Product
        from accounts.models import Account
        label = 'savings_products'
        for obj in SavingsProduct.objects.filter(branch=self.source, is_deleted=False):
            product = self._remap(Product, obj.product_id)
            if product is None:
                self.errors.append(f"SavingsProduct (pk={obj.pk}): product not cloned, skipped")
                continue

            existing = SavingsProduct.objects.filter(product=product).first()
            if existing:
                self._register(SavingsProduct, obj.pk, existing.pk)
                self._skip(label)
                continue

            try:
                new_obj = SavingsProduct.objects.create(
                    **self._base(),
                    **self._scalars(obj),
                    product=product,
                    interest_expense_account=self._remap(Account, obj.interest_expense_account_id),
                    penalty_income_account=self._remap(Account, obj.penalty_income_account_id),
                    first_deposit_income_account=self._remap(
                        Account, obj.first_deposit_income_account_id
                    ),
                )
                self._register(SavingsProduct, obj.pk, new_obj.pk)
                self._inc(label)
            except Exception as exc:
                self.errors.append(f"SavingsProduct (pk={obj.pk}): {exc}")

    def _clone_fee_structures(self):
        from incomes.models import FeeStructure, IncomeCategory
        label = 'fee_structures'
        for obj in FeeStructure.objects.filter(branch=self.source, is_deleted=False):
            cat = self._remap(IncomeCategory, obj.category_id)
            if cat is None:
                self.errors.append(
                    f"FeeStructure '{obj.name}' (pk={obj.pk}): category not cloned, skipped"
                )
                continue
            self._upsert(
                FeeStructure,
                lookup={'branch': self.target, 'code': obj.code},
                create_kwargs={
                    **self._base(),
                    **self._scalars(obj, extra_skip={'approval_status', 'approved_at'}),
                    'category': cat,
                    'approval_status': 'draft',   # reset — must be re-approved
                    'approved_by': None,
                    'approved_at': None,
                },
                label=label,
                old_pk=obj.pk,
            )

    # ── Phase 5 ───────────────────────────────────────────────────────────────

    def _clone_loan_product_fees(self):
        from loans.models import LoanProduct, LoanProductFee
        from accounts.models import Account
        from products.models import Product
        label = 'loan_product_fees'
        for obj in LoanProductFee.objects.filter(branch=self.source, is_deleted=False):
            loan_prod = self._remap(LoanProduct, obj.loan_product_id)
            if loan_prod is None:
                continue  # parent not cloned — skip silently
            gl_acct = self._remap(Account, obj.gl_income_account_id)
            if gl_acct is None:
                self.errors.append(
                    f"LoanProductFee '{obj.name}' (pk={obj.pk}): GL account not cloned, skipped"
                )
                continue
            def_sav_prod = self._remap(Product, obj.default_savings_product_id)

            existing = LoanProductFee.objects.filter(
                loan_product=loan_prod, name=obj.name
            ).first()
            if existing:
                self._register(LoanProductFee, obj.pk, existing.pk)
                self._skip(label)
                continue

            try:
                new_obj = LoanProductFee.objects.create(
                    **self._base(),
                    **self._scalars(obj),
                    loan_product=loan_prod,
                    gl_income_account=gl_acct,
                    default_savings_product=def_sav_prod,
                )
                self._register(LoanProductFee, obj.pk, new_obj.pk)
                self._inc(label)
            except Exception as exc:
                self.errors.append(f"LoanProductFee '{obj.name}' (pk={obj.pk}): {exc}")

    def _clone_loan_product_savings_requirements(self):
        from loans.models import LoanProduct, LoanProductSavingsRequirement
        from products.models import Product
        label = 'loan_savings_requirements'
        for obj in LoanProductSavingsRequirement.objects.filter(
            branch=self.source, is_deleted=False
        ):
            loan_prod = self._remap(LoanProduct, obj.loan_product_id)
            sav_prod = self._remap(Product, obj.savings_product_id)
            if loan_prod is None or sav_prod is None:
                continue

            try:
                new_obj = LoanProductSavingsRequirement.objects.create(
                    **self._base(),
                    **self._scalars(obj),
                    loan_product=loan_prod,
                    savings_product=sav_prod,
                )
                self._register(LoanProductSavingsRequirement, obj.pk, new_obj.pk)
                self._inc(label)
            except Exception as exc:
                self.errors.append(f"LoanProductSavingsRequirement (pk={obj.pk}): {exc}")

    def _clone_product_requirements(self):
        from products.models import Product, ProductRequirement
        label = 'product_requirements'
        for obj in ProductRequirement.objects.filter(is_deleted=False, product__branch=self.source):
            product = self._remap(Product, obj.product_id)
            if product is None:
                continue
            try:
                new_obj = ProductRequirement.objects.create(
                    **self._scalars(obj),
                    product=product,
                    owner=self.user,
                    tenant=self.tenant,
                    created_by=self.user,
                )
                self._register(ProductRequirement, obj.pk, new_obj.pk)
                self._inc(label)
            except Exception as exc:
                self.errors.append(f"ProductRequirement '{obj.name}' (pk={obj.pk}): {exc}")

    def _clone_fee_structure_components(self):
        from incomes.models import FeeStructure, FeeStructureComponent, ServiceItem
        from inventory.models import InventoryItem
        label = 'fee_structure_components'
        for obj in FeeStructureComponent.objects.filter(
            branch=self.source, is_deleted=False
        ):
            fee_struct = self._remap(FeeStructure, obj.fee_structure_id)
            if fee_struct is None:
                continue
            service_item = self._remap(ServiceItem, obj.service_item_id)
            inventory_item = self._remap(InventoryItem, obj.inventory_item_id)
            try:
                new_obj = FeeStructureComponent.objects.create(
                    **self._base(),
                    **self._scalars(obj),
                    fee_structure=fee_struct,
                    service_item=service_item,
                    inventory_item=inventory_item,
                )
                self._register(FeeStructureComponent, obj.pk, new_obj.pk)
                self._inc(label)
            except Exception as exc:
                self.errors.append(f"FeeStructureComponent (pk={obj.pk}): {exc}")
