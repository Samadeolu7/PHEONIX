# automations/management/commands/account_management.py
from django.db import transaction
from accounts.models import Account, AccountCategory, AccountClassification
from decimal import Decimal
import logging
from django.db import IntegrityError

logger = logging.getLogger(__name__)

class AccountManager:
    """Handles account creation and management for the import"""
    
    def __init__(self, context):
        self.context = context

    def _get_mapped_account(self, key, map_name='accounts'):
        """Resolve an import_map mapping to an Account or DummyAccount.

        If the mapping refers to a non-existent DB pk, the mapping is removed
        and None is returned so callers can continue and try to create the
        account anew.
        """
        mapped = self.context.import_map.get(map_name, {}).get(key)
        if mapped is None:
            return None
        # dry-run placeholder strings should be returned as DummyAccount
        if not getattr(self.context, 'commit', False) and isinstance(mapped, str):
            return self.DummyAccount(mapped)
        try:
            return Account.objects.get(pk=mapped)
        except Account.DoesNotExist:
            logger.warning("import_map[%s][%s] refers to missing Account pk=%s; dropping mapping", map_name, key, mapped)
            try:
                del self.context.import_map.get(map_name, {})[key]
            except Exception:
                pass
            return None

    def _safe_create_account(self, branch, category, name, max_retries=3):
        """Try to create an Account using Account.create_for_category but handle
        IntegrityError and RuntimeError by attempting to find an existing account
        with the same name or by retrying a few times. Returns an Account instance
        or raises the original exception after retries.
        """
        last_exc = None
        for attempt in range(max_retries):
            logger.debug("_safe_create_account attempt %s for branch=%s category=%s name=%s", attempt, getattr(branch, 'pk', branch), getattr(category, 'pk', category), name)
            try:
                acct = Account.create_for_category(branch, category, name,
                                                   owner=getattr(self.context, 'owner', None),
                                                   created_by=getattr(self.context, 'owner', None) if getattr(self.context, 'commit', False) else None)
                return acct
            except IntegrityError as ie:
                logger.warning("IntegrityError creating account %s (attempt=%s): %s", name, attempt, ie)
                last_exc = ie
                # maybe another process created it concurrently; try to look up by name
                try:
                    acct = Account.objects.filter(branch=branch, name__iexact=name).first()
                    if acct:
                        logger.debug("_safe_create_account found existing account by name: %s (%s)", acct.pk, acct.code)
                        return acct
                except Exception:
                    pass
            except RuntimeError as re:
                logger.warning("RuntimeError allocating account %s (attempt=%s): %s", name, attempt, re)
                last_exc = re
                # allocation exhausted; try to find any account in the same category
                try:
                    acct = Account.objects.filter(branch=branch, category=category).first()
                    if acct:
                        logger.debug("_safe_create_account falling back to existing category account: %s (%s)", acct.pk, acct.code)
                        return acct
                except Exception:
                    pass
        # one last attempt to find by name before giving up
        try:
            acct = Account.objects.filter(branch=branch, name__iexact=name).first()
            if acct:
                return acct
        except Exception:
            pass
        # re-raise the most recent exception
        if last_exc:
            raise last_exc
        raise RuntimeError('Failed to create or locate account')
        
    def setup_core_accounts(self):
        """Set up core accounts needed for import"""
        # Create categories
        self.asset_cat, _ = self._branch_category(section=1, name="Assets")
        self.liability_cat, _ = self._branch_category(section=2, name="Liabilities")
        # Equity category (300–399) for Opening Balances
        self.equity_cat, _ = self._branch_category(section=3, name="Equity")
        self.income_cat, _ = self._branch_category(section=4, name="Income")
        self.expense_cat, _ = self._branch_category(section=5, name="Expenses")

        # Create classification
        self.classification, _ = AccountClassification.objects.get_or_create(
            name="Imported",
            branch=self.context.branch,
            defaults={'owner': self.context.owner, 'created_by': self.context.owner}
        )
        
        # Set the classification on the context for use in processors
        self.context.classification = self.classification

        # Create core accounts
        self.create_suspense_account()
        # Opening balances account (equity) used as import counterparty
        self.create_opening_balances_account()
        self.create_cash_account()
        # pooled banks account to receive many legacy bank balances without
        # allocating one asset code per legacy bank
        self.create_banks_pool_account()
        self.create_savings_pool_account()
        self.create_loans_receivable_account()
        self.create_interest_income_account()
        self.create_pooled_income_account()
        self.create_inventory_account()
        self.create_fixed_asset_account()
        # pooled expense account to receive legacy expense mappings when
        # individual expense codes cannot be allocated
        self.create_pooled_expense_account()
        
    def _branch_category(self, section, name, code_prefix=None):
        """Get or create a branch-scoped account category"""
        obj = AccountCategory.objects.filter(section=section, branch=self.context.branch).first()
        if obj:
            return obj, False
            
        return AccountCategory.objects.get_or_create(
            section=section,
            branch=self.context.branch,
            defaults={
                'name': name,
                'code_prefix': code_prefix or name.upper()[:10],
                'owner': self.context.owner,
                'created_by': self.context.owner
            }
        )
        
    def create_suspense_account(self):
        """Create the suspense account"""
        # Allocate a valid numeric code in the liabilities section using helper
        # This ensures the code conforms to model constraints (100-599) and
        # avoids manual collisions from hard-coded values.
        # Dry-run: don't create DB objects; register a placeholder and return DummyAccount
        if not getattr(self.context, 'commit', False):
            key = 'core_suspense'
            self.context.import_map.setdefault('accounts', {})[key] = f"DRY_ACC_SUSPENSE"
            self.context.suspense_acc = self.DummyAccount(self.context.import_map['accounts'][key])
            return

        try:
            # If already mapped, reuse the mapped account
            key = 'core_suspense'
            acct = self._get_mapped_account(key, 'accounts')
            if acct:
                self.context.suspense_acc = acct
                return

            acct = self._safe_create_account(self.context.branch, self.liability_cat, self.context.suspense_name)
            acct.owner = getattr(self.context, 'owner', None)
            acct.created_by = getattr(self.context, 'owner', None)
            acct.classification = getattr(self, 'classification', None) or getattr(self.context, 'classification', None)
            acct.save(update_fields=['owner', 'created_by', 'classification'])
            self.context.suspense_acc = acct
            self.context.import_map.setdefault('accounts', {})[key] = acct.pk
        except (IntegrityError, RuntimeError):
            # Try to recover by fetching any existing account in branch with the same name
            try:
                self.context.suspense_acc = Account.objects.filter(branch=self.context.branch, name=self.context.suspense_name).first()
                if not self.context.suspense_acc:
                    # fallback: take any liability account as suspense
                    self.context.suspense_acc = Account.objects.filter(branch=self.context.branch, category=self.liability_cat).first()
                if self.context.suspense_acc:
                    self.context.import_map.setdefault('accounts', {})[key] = self.context.suspense_acc.pk
            except Exception:
                raise
        
    def create_cash_account(self):
        """Create the cash account"""
        # Allocate next available asset code for cash account
        # Dry-run: register placeholder
        if not getattr(self.context, 'commit', False):
            key = 'core_cash'
            self.context.import_map.setdefault('accounts', {})[key] = f"DRY_ACC_CASH"
            self.context.cash_acc = self.DummyAccount(self.context.import_map['accounts'][key])
            return

        try:
            key = 'core_cash'
            acct = self._get_mapped_account(key, 'accounts')
            if acct:
                self.context.cash_acc = acct
                return

            acct = self._safe_create_account(self.context.branch, self.asset_cat, 'Cash in Hand')
            acct.owner = getattr(self.context, 'owner', None)
            acct.created_by = getattr(self.context, 'owner', None)
            acct.classification = getattr(self, 'classification', None) or getattr(self.context, 'classification', None)
            acct.save(update_fields=['owner', 'created_by', 'classification'])
            self.context.cash_acc = acct
            self.context.import_map.setdefault('accounts', {})[key] = acct.pk
        except (IntegrityError, RuntimeError):
            try:
                self.context.cash_acc = Account.objects.filter(branch=self.context.branch, name='Cash in Hand').first()
                if self.context.cash_acc:
                    self.context.import_map.setdefault('accounts', {})[key] = self.context.cash_acc.pk
            except Account.DoesNotExist:
                raise
        
    def create_savings_pool_account(self):
        """Create the savings pool account"""
        if not getattr(self.context, 'commit', False):
            key = 'core_savings_pool'
            self.context.import_map.setdefault('accounts', {})[key] = f"DRY_ACC_SAVINGS_POOL"
            self.context.savings_pool_acc = self.DummyAccount(self.context.import_map['accounts'][key])
            return

        try:
            key = 'core_savings_pool'
            acct = self._get_mapped_account(key, 'accounts')
            if acct:
                self.context.savings_pool_acc = acct
                return

            acct = self._safe_create_account(self.context.branch, self.liability_cat, 'Client Savings (Pool)')
            acct.owner = getattr(self.context, 'owner', None)
            acct.created_by = getattr(self.context, 'owner', None)
            acct.classification = getattr(self, 'classification', None) or getattr(self.context, 'classification', None)
            acct.save(update_fields=['owner', 'created_by', 'classification'])
            self.context.savings_pool_acc = acct
            self.context.import_map.setdefault('accounts', {})[key] = acct.pk
        except (IntegrityError, RuntimeError):
            try:
                self.context.savings_pool_acc = Account.objects.filter(branch=self.context.branch, name__icontains='Savings').first()
                if self.context.savings_pool_acc:
                    self.context.import_map.setdefault('accounts', {})[key] = self.context.savings_pool_acc.pk
            except Account.DoesNotExist:
                raise
        
    def create_loans_receivable_account(self):
        """Create the loans receivable account"""
        if not getattr(self.context, 'commit', False):
            key = 'core_loans_receivable'
            self.context.import_map.setdefault('accounts', {})[key] = f"DRY_ACC_LOANS_RECEIVABLE"
            self.context.loans_receivable_acc = self.DummyAccount(self.context.import_map['accounts'][key])
            return

        try:
            key = 'core_loans_receivable'
            acct = self._get_mapped_account(key, 'accounts')
            if acct:
                self.context.loans_receivable_acc = acct
                return

            acct = self._safe_create_account(self.context.branch, self.asset_cat, 'Loans Receivable')
            acct.owner = getattr(self.context, 'owner', None)
            acct.created_by = getattr(self.context, 'owner', None)
            acct.classification = getattr(self, 'classification', None) or getattr(self.context, 'classification', None)
            acct.save(update_fields=['owner', 'created_by', 'classification'])
            self.context.loans_receivable_acc = acct
            self.context.import_map.setdefault('accounts', {})[key] = acct.pk
        except (IntegrityError, RuntimeError):
            try:
                self.context.loans_receivable_acc = Account.objects.filter(branch=self.context.branch, name__icontains='Loans Receivable').first()
                if self.context.loans_receivable_acc:
                    self.context.import_map.setdefault('accounts', {})[key] = self.context.loans_receivable_acc.pk
            except Account.DoesNotExist:
                raise
        
    def create_interest_income_account(self):
        """Create the interest income account"""
        if not getattr(self.context, 'commit', False):
            key = 'core_interest_income'
            self.context.import_map.setdefault('accounts', {})[key] = f"DRY_ACC_INTEREST_INCOME"
            self.context.interest_income_acc = self.DummyAccount(self.context.import_map['accounts'][key])
            return

        try:
            key = 'core_interest_income'
            acct = self._get_mapped_account(key, 'accounts')
            if acct:
                self.context.interest_income_acc = acct
                return

            acct = self._safe_create_account(self.context.branch, self.income_cat, 'Interest Income')
            acct.owner = getattr(self.context, 'owner', None)
            acct.created_by = getattr(self.context, 'owner', None)
            acct.classification = getattr(self, 'classification', None) or getattr(self.context, 'classification', None)
            acct.save(update_fields=['owner', 'created_by', 'classification'])
            self.context.interest_income_acc = acct
            self.context.import_map.setdefault('accounts', {})[key] = acct.pk
        except (IntegrityError, RuntimeError):
            try:
                self.context.interest_income_acc = Account.objects.filter(branch=self.context.branch, name__icontains='Interest Income').first()
                if self.context.interest_income_acc:
                    self.context.import_map.setdefault('accounts', {})[key] = self.context.interest_income_acc.pk
            except Account.DoesNotExist:
                raise

    def create_pooled_expense_account(self):
        """Create a pooled expense account to use as a fallback when many expense codes exist."""
        if not getattr(self.context, 'commit', False):
            key = 'core_pooled_expense'
            self.context.import_map.setdefault('accounts', {})[key] = f"DRY_ACC_POOLED_EXPENSE"
            self.context.expense_acc = self.DummyAccount(self.context.import_map['accounts'][key])
            return

        try:
            key = 'core_pooled_expense'
            acct = self._get_mapped_account(key, 'accounts')
            if acct:
                self.context.expense_acc = acct
                return

            acct = self._safe_create_account(self.context.branch, self.expense_cat, 'Expenses (Imported)')
            acct.owner = getattr(self.context, 'owner', None)
            acct.created_by = getattr(self.context, 'owner', None)
            acct.classification = getattr(self, 'classification', None) or getattr(self.context, 'classification', None)
            acct.save(update_fields=['owner', 'created_by', 'classification'])
            self.context.expense_acc = acct
            self.context.import_map.setdefault('accounts', {})[key] = acct.pk
        except IntegrityError:
            try:
                self.context.expense_acc = Account.objects.filter(branch=self.context.branch, name__icontains='Expense').first()
                if self.context.expense_acc:
                    self.context.import_map.setdefault('accounts', {})[key] = self.context.expense_acc.pk
            except Exception:
                raise
        except RuntimeError:
            # If allocation fails, try to find any expense-like account
            self.context.expense_acc = Account.objects.filter(branch=self.context.branch, name__icontains='Expense').first()
            if self.context.expense_acc:
                self.context.import_map.setdefault('accounts', {})[key] = self.context.expense_acc.pk
            else:
                # leave expense_acc as None; callers will raise if they require it
                logger.warning('Could not allocate pooled expense account due to code exhaustion')

    def create_pooled_income_account(self):
        """Create a pooled income account for imported income mappings (4xx)."""
        if not getattr(self.context, 'commit', False):
            key = 'core_pooled_income'
            self.context.import_map.setdefault('accounts', {})[key] = f"DRY_ACC_POOLED_INCOME"
            self.context.income_acc = self.DummyAccount(self.context.import_map['accounts'][key])
            return

        try:
            key = 'core_pooled_income'
            acct = self._get_mapped_account(key, 'accounts')
            if acct:
                self.context.income_acc = acct
                return

            acct = self._safe_create_account(self.context.branch, self.income_cat, 'Income (Imported)')
            acct.owner = getattr(self.context, 'owner', None)
            acct.created_by = getattr(self.context, 'owner', None)
            acct.classification = getattr(self, 'classification', None) or getattr(self.context, 'classification', None)
            acct.save(update_fields=['owner', 'created_by', 'classification'])
            self.context.income_acc = acct
            self.context.import_map.setdefault('accounts', {})[key] = acct.pk
        except IntegrityError:
            try:
                self.context.income_acc = Account.objects.filter(branch=self.context.branch, name__icontains='Income').first()
                if self.context.income_acc:
                    self.context.import_map.setdefault('accounts', {})[key] = self.context.income_acc.pk
            except Exception:
                raise
        except RuntimeError:
            self.context.income_acc = Account.objects.filter(branch=self.context.branch, name__icontains='Income').first()
            if self.context.income_acc:
                self.context.import_map.setdefault('accounts', {})[key] = self.context.income_acc.pk
            else:
                logger.warning('Could not allocate pooled income account due to code exhaustion')
        
    def create_inventory_account(self):
        """Create the inventory account"""
        if not getattr(self.context, 'commit', False):
            key = 'core_inventory'
            self.context.import_map.setdefault('accounts', {})[key] = f"DRY_ACC_INVENTORY"
            self.context.inventory_acc = self.DummyAccount(self.context.import_map['accounts'][key])
            return

        try:
            key = 'core_inventory'
            acct = self._get_mapped_account(key, 'accounts')
            if acct:
                self.context.inventory_acc = acct
                return

            acct = self._safe_create_account(self.context.branch, self.asset_cat, 'Inventory')
            acct.owner = getattr(self.context, 'owner', None)
            acct.created_by = getattr(self.context, 'owner', None)
            acct.classification = getattr(self, 'classification', None) or getattr(self.context, 'classification', None)
            acct.save(update_fields=['owner', 'created_by', 'classification'])
            self.context.inventory_acc = acct
            self.context.import_map.setdefault('accounts', {})[key] = acct.pk
        except (IntegrityError, RuntimeError):
            try:
                self.context.inventory_acc = Account.objects.filter(branch=self.context.branch, name__icontains='Inventory').first()
                if self.context.inventory_acc:
                    self.context.import_map.setdefault('accounts', {})[key] = self.context.inventory_acc.pk
            except Account.DoesNotExist:
                raise
        
    def create_fixed_asset_account(self):
        """Create the fixed asset account"""
        if not getattr(self.context, 'commit', False):
            key = 'core_fixed_asset'
            self.context.import_map.setdefault('accounts', {})[key] = f"DRY_ACC_FIXED_ASSET"
            self.context.fixed_asset_acc = self.DummyAccount(self.context.import_map['accounts'][key])
            return

        try:
            key = 'core_fixed_asset'
            acct = self._get_mapped_account(key, 'accounts')
            if acct:
                self.context.fixed_asset_acc = acct
                return

            acct = self._safe_create_account(self.context.branch, self.asset_cat, 'Fixed Assets')
            acct.owner = getattr(self.context, 'owner', None)
            acct.created_by = getattr(self.context, 'owner', None)
            acct.classification = getattr(self, 'classification', None) or getattr(self.context, 'classification', None)
            acct.save(update_fields=['owner', 'created_by', 'classification'])
            self.context.fixed_asset_acc = acct
            self.context.import_map.setdefault('accounts', {})[key] = acct.pk
        except (IntegrityError, RuntimeError):
            try:
                self.context.fixed_asset_acc = Account.objects.filter(branch=self.context.branch, name__icontains='Fixed').first()
                if self.context.fixed_asset_acc:
                    self.context.import_map.setdefault('accounts', {})[key] = self.context.fixed_asset_acc.pk
            except Account.DoesNotExist:
                raise
    def create_opening_balances_account(self):
        """Create the Opening Balances equity account used as counterparty for imports."""
        if not getattr(self.context, 'commit', False):
            key = 'core_opening_balances'
            self.context.import_map.setdefault('accounts', {})[key] = f"DRY_ACC_OPENING_BALANCES"
            self.context.opening_balances_acc = self.DummyAccount(self.context.import_map['accounts'][key])
            return

        try:
            key = 'core_opening_balances'
            acct = self._get_mapped_account(key, 'accounts')
            if acct:
                self.context.opening_balances_acc = acct
                return

            acct = self._safe_create_account(self.context.branch, self.equity_cat, 'Opening Balances (Imported)')
            acct.owner = getattr(self.context, 'owner', None)
            acct.created_by = getattr(self.context, 'owner', None)
            acct.classification = getattr(self, 'classification', None) or getattr(self.context, 'classification', None)
            acct.save(update_fields=['owner', 'created_by', 'classification'])
            self.context.opening_balances_acc = acct
            self.context.import_map.setdefault('accounts', {})[key] = acct.pk
        except (IntegrityError, RuntimeError):
            try:
                # fallback: find by name or any equity account
                self.context.opening_balances_acc = Account.objects.filter(branch=self.context.branch, name__icontains='Opening Balances').first()
                if not self.context.opening_balances_acc:
                    self.context.opening_balances_acc = Account.objects.filter(branch=self.context.branch, category=self.equity_cat).first()
                if self.context.opening_balances_acc:
                    self.context.import_map.setdefault('accounts', {})[key] = self.context.opening_balances_acc.pk
            except Exception:
                raise

    def create_banks_pool_account(self):
        """Create a pooled banks asset account to avoid per-bank allocations."""
        if not getattr(self.context, 'commit', False):
            key = 'core_banks_pool'
            self.context.import_map.setdefault('accounts', {})[key] = f"DRY_ACC_BANKS_POOL"
            self.context.banks_pool_acc = self.DummyAccount(self.context.import_map['accounts'][key])
            return

        try:
            key = 'core_banks_pool'
            acct = self._get_mapped_account(key, 'accounts')
            if acct:
                self.context.banks_pool_acc = acct
                return

            acct = self._safe_create_account(self.context.branch, self.asset_cat, 'Banks (Imported)')
            acct.owner = getattr(self.context, 'owner', None)
            acct.created_by = getattr(self.context, 'owner', None)
            acct.classification = getattr(self, 'classification', None) or getattr(self.context, 'classification', None)
            acct.save(update_fields=['owner', 'created_by', 'classification'])
            self.context.banks_pool_acc = acct
            self.context.import_map.setdefault('accounts', {})[key] = acct.pk
        except IntegrityError:
            try:
                self.context.banks_pool_acc = Account.objects.filter(branch=self.context.branch, name__icontains='Bank').first()
                if self.context.banks_pool_acc:
                    self.context.import_map.setdefault('accounts', {})[key] = self.context.banks_pool_acc.pk
            except Exception:
                raise
        except RuntimeError:
            # If allocation fails, fall back to cash account or any asset
            acct = getattr(self.context, 'cash_acc', None) or Account.objects.filter(branch=self.context.branch, category=self.asset_cat).first()
            if acct:
                self.context.banks_pool_acc = acct
                self.context.import_map.setdefault('accounts', {})[key] = acct.pk
            else:
                logger.warning('Could not allocate banks pooled account due to code exhaustion')
    
    def get_or_create_bank_account(self, legacy_bank_id, bank_name):
        """Get or create a bank GL account"""
        key = f"bank_{legacy_bank_id}"
        # If we've already mapped this bank, respect the mapping type.
        mapped = self.context.import_map.get('banks', {}).get(key)
        if mapped is not None:
            # In dry-run we store string placeholders like 'DRY_ACC_BANK_1' and should
            # return a DummyAccount rather than trying to fetch a DB object by that
            # (non-numeric) pk which causes ValueError/TypeErrors in Django.
            if not getattr(self.context, 'commit', False) and isinstance(mapped, str):
                return self.DummyAccount(mapped)
            return Account.objects.get(pk=mapped)

        # For dry-run create and return a dummy placeholder id
        if not getattr(self.context, 'commit', False):
            self.context.import_map.setdefault('banks', {})[key] = f"DRY_ACC_BANK_{legacy_bank_id}"
            return self.DummyAccount(self.context.import_map['banks'][key])

        # Commit mode: prefer mapping all banks to the branch-level pooled banks account
        pooled = getattr(self.context, 'banks_pool_acc', None)
        if pooled:
            self.context.import_map.setdefault('banks', {})[key] = pooled.pk
            return pooled

        if key in self.context.import_map.get('banks', {}):
            acct = self._get_mapped_account(key, 'banks')
            if acct:
                return acct

        name = f"Bank - {self.context.norm_str(bank_name) or legacy_bank_id}"
        try:
            acct = self._safe_create_account(self.context.branch, self.asset_cat, name)
            acct.owner = getattr(self.context, 'owner', None)
            acct.created_by = getattr(self.context, 'owner', None)
            acct.classification = getattr(self, 'classification', None) or getattr(self.context, 'classification', None)
            acct.save(update_fields=['owner', 'created_by', 'classification'])
            self.context.import_map.setdefault('banks', {})[key] = acct.pk
            return acct
        except Exception:
            # fallback: try to find by name or reuse any asset account
            acct = Account.objects.filter(branch=self.context.branch, name__icontains='Bank').first()
            if acct:
                self.context.import_map.setdefault('banks', {})[key] = acct.pk
                return acct
            # fallback to cash or any asset
            acct = getattr(self.context, 'cash_acc', None) or Account.objects.filter(branch=self.context.branch, category=self.asset_cat).first()
            if acct:
                self.context.import_map.setdefault('banks', {})[key] = acct.pk
                return acct
            raise
        
    def get_or_create_client_account(self, legacy_client_id, client_name):
        """Get or create a client savings GL account"""
        key = f"client_{legacy_client_id}"
        # Dry-run: map to a dummy id
        if not getattr(self.context, 'commit', False):
            if key in self.context.import_map.get('accounts', {}):
                return self.DummyAccount(self.context.import_map['accounts'][key])
            self.context.import_map.setdefault('accounts', {})[key] = f"DRY_ACC_CLIENT_{legacy_client_id}"
            return self.DummyAccount(self.context.import_map['accounts'][key])

        # Commit: if already mapped, return the mapped account
        if key in self.context.import_map.get('accounts', {}):
            acct = self._get_mapped_account(key, 'accounts')
            if acct:
                return acct

        # Preferred: map clients to the branch-level savings_pool_acc (no per-client codes)
        pooled = getattr(self.context, 'savings_pool_acc', None)
        if pooled:
            self.context.import_map.setdefault('accounts', {})[key] = pooled.pk
            return pooled

        # Try to create the savings pool if it doesn't exist yet
        try:
            self.create_savings_pool_account()
            pooled = getattr(self.context, 'savings_pool_acc', None)
            if pooled:
                self.context.import_map.setdefault('accounts', {})[key] = pooled.pk
                return pooled
        except Exception:
            logger.exception('Failed to create or fetch savings pool account')

        # Fallbacks: find any savings-like account, then cash or suspense
        acct = Account.objects.filter(branch=self.context.branch, name__icontains='Savings').first()
        if acct:
            self.context.import_map.setdefault('accounts', {})[key] = acct.pk
            return acct

        acct = getattr(self.context, 'cash_acc', None) or getattr(self.context, 'suspense_acc', None)
        if acct:
            self.context.import_map.setdefault('accounts', {})[key] = getattr(acct, 'pk', acct)
            return acct

        # Nothing sensible available: raise so caller logs and continues
        raise RuntimeError('No savings pool or fallback account available')
    
    def get_default_product(self, product_type, amount=None):
        """
        Return a Product instance to use as a savings product.

        product_type: 'SAVINGS' currently supported.
        amount: Decimal or numeric, used to match min amounts when available.

        Returns Product instance or None if none found/created.
        """
        if not product_type:
            return None
        product_type = str(product_type).upper()

        # Only support 'SAVINGS' for now
        if product_type != 'SAVINGS':
            return None

        # normalize amount
        try:
            amt = Decimal(amount) if amount is not None else None
        except Exception:
            amt = None

        # import Product model (your app Product model)
        try:
            from savings.models import Product as ProductModel
        except Exception:
            logger.exception("get_default_product: savings.Product model not importable")
            return None

        # First try branch-scoped products with explicit product_type field (if present)
        qs = ProductModel.objects.filter(branch=self.context.branch)
        try:
            # if product_type field exists on model, filter it
            ProductModel._meta.get_field('product_type')
            qs_by_type = qs.filter(product_type='SAVINGS')
            if qs_by_type.exists():
                # Prefer one whose minimum_amount <= amt
                if amt is not None:
                    candidates = qs_by_type.filter(minimum_amount__lte=amt).order_by('-minimum_amount')
                    if candidates.exists():
                        return candidates.first()
                # otherwise return first matching savings product
                return qs_by_type.first()
        except Exception:
            # product_type doesn't exist or filtering failed; continue with other heuristics
            pass

        # Fallback: search by name containing 'savings' (case-insensitive) in branch
        try:
            name_match = qs.filter(name__icontains='savings')
            if name_match.exists():
                # as above, try to choose by minimum_amount if amt provided
                if amt is not None:
                    candidates = name_match.filter(minimum_amount__lte=amt).order_by('-minimum_amount')
                    if candidates.exists():
                        return candidates.first()
                return name_match.first()
        except Exception:
            pass

        # Fallback: any product in branch
        if qs.exists():
            return qs.first()

        # Last resort: try to create a minimal product for savings (best-effort)
        defaults = {}
        md = ProductModel
        field_names = [f.name for f in md._meta.fields]
        if 'name' in field_names:
            defaults['name'] = "Imported Default Savings Product"
        if 'code' in field_names:
            defaults['code'] = "IMP-SAV"
        if 'branch' in field_names:
            defaults['branch'] = self.context.branch
        if 'product_class' in field_names:
            # product_class choices include 'FINANCIAL' — set it if available
            defaults['product_class'] = 'FINANCIAL'
        if 'interest_rate' in field_names:
            defaults['interest_rate'] = Decimal('0.00')
        if 'minimum_amount' in field_names:
            defaults['minimum_amount'] = Decimal('0.00')
        if 'owner' in field_names:
            defaults['owner'] = getattr(self.context, 'owner', None)
        if 'created_by' in field_names:
            defaults['created_by'] = getattr(self.context, 'owner', None)
        # If product_type exists on model, set it explicitly
        if 'product_type' in field_names:
            defaults['product_type'] = 'SAVINGS'

        # Only try create if we have minimal useful defaults
        if defaults.get('name') and defaults.get('branch'):
            try:
                newp = md.objects.create(**defaults)
                logger.warning("Created fallback savings product %s", newp)
                return newp
            except Exception:
                logger.exception("Failed to create fallback savings product with defaults=%s", defaults)

        # no product available
        return None


    class DummyAccount:
        """Dummy account class for dry runs"""
        def __init__(self, pk):
            self.pk = pk

    # ---------------------------
    # Legacy account creation helpers
    # ---------------------------
    def get_or_create_expense_account(self, legacy_id, name):
        key = f"expense_{legacy_id}"
        if key in self.context.import_map.get('accounts', {}):
            mapped = self.context.import_map['accounts'][key]
            if not self.context.commit and isinstance(mapped, str):
                return self.DummyAccount(mapped)
            try:
                return Account.objects.get(pk=mapped)
            except Exception:
                pass

        # If pooled expense account is available, map legacy expenses to it
        pooled = getattr(self.context, 'expense_acc', None)
        if pooled:
            self.context.import_map.setdefault('accounts', {})[key] = pooled.pk
            return pooled

        # allocate a proper expense account code in 5xx range (fallback)
        if not getattr(self.context, 'commit', False):
            self.context.import_map.setdefault('accounts', {})[key] = f"DRY_ACC_EXP_{legacy_id}"
            return self.DummyAccount(self.context.import_map['accounts'][key])

        if key in self.context.import_map.get('accounts', {}):
            return Account.objects.get(pk=self.context.import_map['accounts'][key])

        acct_name = f"Expense - {self.context.norm_str(name) or legacy_id}"
        try:
            acct = self._safe_create_account(self.context.branch, self.expense_cat, acct_name)
            acct.owner = getattr(self.context, 'owner', None)
            acct.created_by = getattr(self.context, 'owner', None)
            acct.classification = getattr(self, 'classification', None) or getattr(self.context, 'classification', None)
            acct.save(update_fields=['owner', 'created_by', 'classification'])
            self.context.import_map.setdefault('accounts', {})[key] = acct.pk
            return acct
        except IntegrityError:
            acct = Account.objects.filter(branch=self.context.branch, name__icontains='Expense').first()
            if acct:
                self.context.import_map.setdefault('accounts', {})[key] = acct.pk
                return acct
            raise
        except RuntimeError as re:
            logger.warning('Expense code allocation failed for legacy expense %s: %s', legacy_id, re)
            acct = Account.objects.filter(branch=self.context.branch, name__icontains='Expense').first()
            if acct:
                self.context.import_map.setdefault('accounts', {})[key] = acct.pk
                return acct
            raise

    def get_or_create_income_account(self, legacy_id, name):
        key = f"income_{legacy_id}"
        if key in self.context.import_map.get('accounts', {}):
            mapped = self.context.import_map['accounts'][key]
            if not self.context.commit and isinstance(mapped, str):
                return self.DummyAccount(mapped)
            try:
                return Account.objects.get(pk=mapped)
            except Exception:
                pass
        # If we have a pooled income account, map legacy income codes to it
        pooled = getattr(self.context, 'income_acc', None) or getattr(self.context, 'interest_income_acc', None)
        if pooled:
            self.context.import_map.setdefault('accounts', {})[key] = pooled.pk
            return pooled

        # allocate a proper income/income account in 4xx range (fallback)
        if not getattr(self.context, 'commit', False):
            self.context.import_map.setdefault('accounts', {})[key] = f"DRY_ACC_INC_{legacy_id}"
            return self.DummyAccount(self.context.import_map['accounts'][key])

        if key in self.context.import_map.get('accounts', {}):
            return Account.objects.get(pk=self.context.import_map['accounts'][key])

        acct_name = f"Income - {self.context.norm_str(name) or legacy_id}"
        try:
            acct = self._safe_create_account(self.context.branch, self.income_cat, acct_name)
            acct.owner = getattr(self.context, 'owner', None)
            acct.created_by = getattr(self.context, 'owner', None)
            acct.classification = getattr(self, 'classification', None) or getattr(self.context, 'classification', None)
            acct.save(update_fields=['owner', 'created_by', 'classification'])
            self.context.import_map.setdefault('accounts', {})[key] = acct.pk
            return acct
        except IntegrityError:
            acct = Account.objects.filter(branch=self.context.branch, name__icontains='Income').first()
            if acct:
                self.context.import_map.setdefault('accounts', {})[key] = acct.pk
                return acct
            raise
        except RuntimeError as re:
            logger.warning('Income code range exhausted for income %s: %s', legacy_id, re)
            acct = Account.objects.filter(branch=self.context.branch, name__icontains='Income').first()
            if acct:
                self.context.import_map.setdefault('accounts', {})[key] = acct.pk
                return acct
            raise

    def get_or_create_liability_account(self, legacy_id, name):
        key = f"liability_{legacy_id}"
        if key in self.context.import_map.get('accounts', {}):
            mapped = self.context.import_map['accounts'][key]
            if not self.context.commit and isinstance(mapped, str):
                return self.DummyAccount(mapped)
            try:
                return Account.objects.get(pk=mapped)
            except Exception:
                pass

        # allocate liability account in 2xx range
        if not getattr(self.context, 'commit', False):
            self.context.import_map.setdefault('accounts', {})[key] = f"DRY_ACC_LIAB_{legacy_id}"
            return self.DummyAccount(self.context.import_map['accounts'][key])

        if key in self.context.import_map.get('accounts', {}):
            return Account.objects.get(pk=self.context.import_map['accounts'][key])

        acct_name = f"Liability - {self.context.norm_str(name) or legacy_id}"
        try:
            acct = self._safe_create_account(self.context.branch, self.liability_cat, acct_name)
            acct.owner = getattr(self.context, 'owner', None)
            acct.created_by = getattr(self.context, 'owner', None)
            acct.classification = getattr(self, 'classification', None) or getattr(self.context, 'classification', None)
            acct.save(update_fields=['owner', 'created_by', 'classification'])
            self.context.import_map.setdefault('accounts', {})[key] = acct.pk
            return acct
        except IntegrityError:
            acct = Account.objects.filter(branch=self.context.branch, name__icontains='Liability').first()
            if acct:
                self.context.import_map.setdefault('accounts', {})[key] = acct.pk
                return acct
            raise

    def get_or_create_loan_account(self, legacy_id, name):
        key = f"loan_{legacy_id}"
        if key in self.context.import_map.get('accounts', {}):
            mapped = self.context.import_map['accounts'][key]
            if not self.context.commit and isinstance(mapped, str):
                return self.DummyAccount(mapped)
            try:
                return Account.objects.get(pk=mapped)
            except Exception:
                pass
        # For dry-run, create a placeholder mapping and return a DummyAccount
        if not getattr(self.context, 'commit', False):
            self.context.import_map.setdefault('accounts', {})[key] = f"DRY_ACC_LOAN_{legacy_id}"
            return self.DummyAccount(self.context.import_map['accounts'][key])


        # Prefer mapping legacy loans to the branch-level Loans Receivable pooled account
        pooled = getattr(self.context, 'loans_receivable_acc', None)
        if pooled:
            self.context.import_map.setdefault('accounts', {})[key] = pooled.pk
            return pooled

        # If pooled account is not available for some reason, fall back to trying
        # to create an individual asset account (best-effort)
        acct_name = f"Loan - {self.context.norm_str(name) or legacy_id}"
        try:
            acct = self._safe_create_account(self.context.branch, self.asset_cat, acct_name)
            acct.owner = getattr(self.context, 'owner', None)
            acct.created_by = getattr(self.context, 'owner', None)
            acct.classification = getattr(self, 'classification', None) or getattr(self.context, 'classification', None)
            acct.parent = self.context.loans_receivable_acc
            acct.save(update_fields=['owner', 'created_by', 'classification', 'parent'])
            self.context.import_map.setdefault('accounts', {})[key] = acct.pk
            return acct
        except IntegrityError:
            acct = Account.objects.filter(branch=self.context.branch, name__icontains='Loan').first()
            if acct:
                self.context.import_map.setdefault('accounts', {})[key] = acct.pk
                return acct
            raise
        except RuntimeError as re:
            logger.warning('Account code allocation failed for loan %s: %s', legacy_id, re)
            # Fallback: any loan-like account, then loans_receivable_acc if present
            acct = Account.objects.filter(branch=self.context.branch, name__icontains='Loan').first()
            if acct:
                self.context.import_map.setdefault('accounts', {})[key] = acct.pk
                return acct
            if getattr(self.context, 'loans_receivable_acc', None):
                self.context.import_map.setdefault('accounts', {})[key] = getattr(self.context, 'loans_receivable_acc').pk
                return getattr(self.context, 'loans_receivable_acc')
            raise

    def create_accounts_for_legacy(self):
        """Scan the import context and create accounts (or dry-run mappings) for common legacy models."""
        by_model = getattr(self.context, 'by_model', {}) or {}
        # ensure import_map structure
        self.context.import_map.setdefault('accounts', {})

        # Banks (bank.Bank) - use existing method
        for k, objs in by_model.items():
            mk = k.lower()
            if mk.startswith('bank.bank'):
                for o in objs:
                    pk = o.get('pk')
                    name = (o.get('fields') or {}).get('name')
                    try:
                        self.get_or_create_bank_account(pk, name)
                    except Exception:
                        logger.exception('bank account creation failed for %s', pk)

            if mk.startswith('savings.savings'):
                for o in objs:
                    pk = o.get('pk')
                    client_name = None
                    try:
                        client_name = (o.get('fields') or {}).get('client')
                    except Exception:
                        client_name = pk
                    try:
                        self.get_or_create_client_account(pk, client_name)
                    except Exception:
                        logger.exception('savings account creation failed for %s', pk)

            if mk.startswith('expenses.expense'):
                for o in objs:
                    pk = o.get('pk')
                    name = (o.get('fields') or {}).get('name')
                    try:
                        self.get_or_create_expense_account(pk, name)
                    except Exception:
                        logger.exception('expense account creation failed for %s', pk)

            if mk.startswith('income.income'):
                for o in objs:
                    pk = o.get('pk')
                    name = (o.get('fields') or {}).get('name')
                    try:
                        self.get_or_create_income_account(pk, name)
                    except Exception:
                        logger.exception('income account creation failed for %s', pk)

            if mk.startswith('liability.liability'):
                for o in objs:
                    pk = o.get('pk')
                    name = (o.get('fields') or {}).get('name')
                    try:
                        self.get_or_create_liability_account(pk, name)
                    except Exception:
                        logger.exception('liability account creation failed for %s', pk)

            if mk.startswith('loan.loan'):
                for o in objs:
                    pk = o.get('pk')
                    client_field = (o.get('fields') or {}).get('client')
                    name = f"Loan-{pk}"
                    try:
                        self.get_or_create_loan_account(pk, name)
                    except Exception:
                        logger.exception('loan account creation failed for %s', pk)

        # write a simple CSV for dry-run review
        try:
            import csv
            out = getattr(self.context, 'accounts_proposed_out', 'accounts_proposed.csv')
            rows = []
            for k, v in (self.context.import_map.get('accounts') or {}).items():
                rows.append({'legacy_key': k, 'mapped': v})
            if rows:
                with open(out, 'w', newline='', encoding='utf-8') as fh:
                    w = csv.DictWriter(fh, fieldnames=['legacy_key', 'mapped'])
                    w.writeheader()
                    w.writerows(rows)
        except Exception:
            logger.exception('failed to write accounts_proposed CSV')

    # ---------------------------
    # Import lifecycle helpers
    # ---------------------------
    def flush_previous_import(self):
        """
        Remove artifacts from a previous run of this import series.
        Dangerous: should only be called when user explicitly requested --flush-db and --commit.
        Strategy: delete Transactions whose series matches the import series code in context.series
        and any Accounts created with classification == this.import classification (Imported).
        """
        if not getattr(self.context, 'commit', False):
            raise RuntimeError("Refusing to flush when not in commit mode.")

        # Delete transactions linked to this import series (best-effort)
        try:
            from transactions.models import Transaction
            series_code = getattr(self.context, 'series', None)
            if series_code and hasattr(series_code, 'code'):
                sc = series_code.code
                txs = Transaction.objects.filter(series__code=sc, owner=self.context.owner, branch=self.context.branch)
                count = txs.count()
                txs.delete()
                logger.warning("Flushed %s transactions for series %s", count, sc)
        except Exception:
            logger.exception('Failed to flush transactions for import series')

        # Delete accounts that were created with our import classification
        try:
            if getattr(self, 'classification', None):
                accs = Account.objects.filter(classification=self.classification, branch=self.context.branch)
                c = accs.count()
                accs.delete()
                logger.warning("Flushed %s accounts with import classification", c)
        except Exception:
            logger.exception('Failed to flush imported accounts')

    def post_opening_balances(self):
        """
        Scan legacy fixtures for balance-bearing models and post opening balance Transactions.
        In dry-run mode, write a CSV `opening_tx_proposed.csv` describing the proposed transactions.
        """
        by_model = getattr(self.context, 'by_model', {}) or {}
        opening_rows = []

        # helper to record or post one opening tx for an account
        def _record_opening(account, amount, desc, legacy_key):
            # amount: Decimal (positive means normal balance direction)
            from decimal import Decimal
            from transactions.models import TransactionEntry

            if amount is None or Decimal(amount) == Decimal('0.00'):
                return

            # For asset/account positive balances: debit the account, credit opening equity (suspense)
            # We'll use suspense_acc as counterparty for simplicity; operator can reclassify later.
            try:
                amt = Decimal(str(amount))
            except Exception:
                return

            entries = []
            # convention: positive amt -> debit account
            if amt >= 0:
                entries.append({'account': account, 'side': TransactionEntry.DEBIT, 'amount': amt})
                entries.append({'account': self.context.suspense_acc, 'side': TransactionEntry.CREDIT, 'amount': amt})
            else:
                a = abs(amt)
                entries.append({'account': account, 'side': TransactionEntry.CREDIT, 'amount': a})
                entries.append({'account': self.context.suspense_acc, 'side': TransactionEntry.DEBIT, 'amount': a})

            desc_short = f"Opening balance import for {legacy_key}: {desc}"[:255]

            if not getattr(self.context, 'commit', False):
                # dry-run: record proposal
                opening_rows.append({'legacy_key': legacy_key, 'account': str(getattr(account, 'pk', account)), 'amount': str(amt), 'description': desc_short})
                return

            # commit mode: create a transaction via context helper
            try:
                # Use Opening Balances equity account as counterparty where applicable.
                # entries already contain account and suspense as counterparty. Replace suspense with opening_balances_acc when available.
                try:
                    ob = getattr(self.context, 'opening_balances_acc', None)
                    if ob:
                        # find the entry that references the suspense account and replace it
                        for e in entries:
                            acc = getattr(e.get('account'), 'pk', e.get('account'))
                            # if it's the suspense_acc, replace with opening balances
                            if getattr(self.context, 'suspense_acc', None) and acc == getattr(self.context.suspense_acc, 'pk', self.context.suspense_acc):
                                e['account'] = ob
                except Exception:
                    # best effort; keep original entries
                    pass

                txobj = self.context.create_transaction(entries=entries, description=desc_short, workflow_reference=f"legacy:opening:{legacy_key}", date=None)
                # register mapping
                try:
                    self.context.register_tx('opening', legacy_key, txobj)
                except Exception:
                    # best effort; continue
                    pass
                opening_rows.append({'legacy_key': legacy_key, 'new_tx_id': getattr(txobj, 'pk', ''), 'account': account.pk, 'amount': str(amt), 'description': desc_short})
            except IntegrityError as ie:
                # Possibly created in a previous partial run: try to fetch existing tx by workflow_reference
                try:
                    from transactions.models import Transaction
                    wf = f"legacy:opening:{legacy_key}"
                    existing = Transaction.objects.filter(owner=self.context.owner, workflow_reference=wf, branch=self.context.branch).first()
                    if existing:
                        try:
                            self.context.register_tx('opening', legacy_key, existing)
                        except Exception:
                            pass
                        opening_rows.append({'legacy_key': legacy_key, 'new_tx_id': getattr(existing, 'pk', ''), 'account': getattr(account, 'pk', account), 'amount': str(amt), 'description': desc_short})
                        logger.warning('Opening transaction for %s already exists (reused)', legacy_key)
                        return
                except Exception:
                    logger.exception('IntegrityError while handling existing opening tx for %s', legacy_key)
                # re-raise if we couldn't recover
                raise
            except Exception:
                logger.exception('Failed to create opening transaction for %s', legacy_key)

        # Scan common legacy models for balances
        for model_key, objs in by_model.items():
            mk = model_key.lower()
            # bank balances
            if mk.startswith('bank.bank'):
                for o in objs:
                    pk = o.get('pk')
                    fields = o.get('fields', {}) or {}
                    bal = fields.get('balance') or fields.get('balance_bf') or 0
                    acct = None
                    try:
                        acct = self.get_or_create_bank_account(pk, fields.get('name'))
                    except Exception:
                        logger.exception('bank account lookup failed for opening balance %s', pk)
                    if acct:
                        _record_opening(acct, bal, f"Bank {fields.get('name')}", f"bank:{pk}")

            # savings (client balances go to client accounts)
            if mk.startswith('savings.savings'):
                for o in objs:
                    pk = o.get('pk')
                    f = o.get('fields', {}) or {}
                    bal = f.get('balance') or f.get('balance_bf') or 0
                    acct = None
                    try:
                        acct = self.get_or_create_client_account(pk, f.get('client'))
                    except Exception:
                        logger.exception('savings account lookup failed for opening balance %s', pk)
                    if acct:
                        _record_opening(acct, bal, f"Savings {f.get('client')}", f"savings:{pk}")

            # loans
            if mk.startswith('loan.loan'):
                for o in objs:
                    pk = o.get('pk')
                    f = o.get('fields', {}) or {}
                    bal = f.get('balance') or f.get('balance_bf') or 0
                    acct = None
                    try:
                        acct = self.get_or_create_loan_account(pk, f.get('client'))
                    except Exception:
                        logger.exception('loan account lookup failed for opening balance %s', pk)
                    if acct:
                        _record_opening(acct, bal, f"Loan {pk}", f"loan:{pk}")

            # expenses/income/liability simple balances (treat as nominal accounts)
            if mk.startswith('expenses.expense'):
                for o in objs:
                    pk = o.get('pk')
                    f = o.get('fields', {}) or {}
                    bal = f.get('balance') or f.get('balance_bf') or 0
                    acct = None
                    try:
                        acct = self.get_or_create_expense_account(pk, f.get('name'))
                    except Exception:
                        logger.exception('expense account lookup failed for opening balance %s', pk)
                    if acct:
                        _record_opening(acct, bal, f"Expense {f.get('name')}", f"expense:{pk}")

            if mk.startswith('income.income'):
                for o in objs:
                    pk = o.get('pk')
                    f = o.get('fields', {}) or {}
                    bal = f.get('balance') or f.get('balance_bf') or 0
                    acct = None
                    try:
                        acct = self.get_or_create_income_account(pk, f.get('name'))
                    except Exception:
                        logger.exception('income account lookup failed for opening balance %s', pk)
                    if acct:
                        _record_opening(acct, bal, f"Income {f.get('name')}", f"income:{pk}")

            if mk.startswith('liability.liability'):
                for o in objs:
                    pk = o.get('pk')
                    f = o.get('fields', {}) or {}
                    bal = f.get('balance') or f.get('balance_bf') or 0
                    acct = None
                    try:
                        acct = self.get_or_create_liability_account(pk, f.get('name'))
                    except Exception:
                        logger.exception('liability account lookup failed for opening balance %s', pk)
                    if acct:
                        _record_opening(acct, bal, f"Liability {f.get('name')}", f"liability:{pk}")

        # Write CSV for dry-run or logging for commit
        try:
            import csv
            out = getattr(self.context, 'opening_tx_proposed_out', 'opening_tx_proposed.csv')
            if opening_rows:
                with open(out, 'w', newline='', encoding='utf-8') as fh:
                    w = csv.DictWriter(fh, fieldnames=list(opening_rows[0].keys()))
                    w.writeheader()
                    w.writerows(opening_rows)
        except Exception:
            logger.exception('failed to write opening_tx_proposed CSV')