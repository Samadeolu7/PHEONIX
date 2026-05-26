# automations/product_validation.py
"""
Product validation service for workflow steps
Validates transactions against product configuration rules
"""
from typing import Dict, Any, Optional
from decimal import Decimal
from django.core.exceptions import ValidationError
from django.utils import timezone
from django.core.cache import cache
from django.db.models import Sum, Q
import logging

logger = logging.getLogger(__name__)


class ProductValidationError(ValidationError):
    """Custom exception for product validation failures"""
    def __init__(self, message, code='product_validation_error', validation_type='limit'):
        self.validation_type = validation_type
        super().__init__(message, code=code)


class ProductValidator:
    """
    Validates transactions against product configuration
    Uses Redis cache for transaction limit tracking
    """
    
    CACHE_PREFIX = 'product_validation'
    CACHE_TTL = 86400  # 24 hours
    
    def __init__(self, product, account=None, user=None, category=None):
        """
        Initialize validator with product and context
        
        Args:
            product: Product instance
            account: Account instance (optional)
            user: User instance (optional)
            category: Category instance (for expense validation)
        """
        self.product = product
        self.account = account
        self.user = user
        self.category = category
    
    def validate_transaction(self, amount: Decimal, transaction_type: str = 'debit') -> Dict[str, Any]:
        """
        Validate transaction against all product rules
        
        Args:
            amount: Transaction amount
            transaction_type: 'debit' or 'credit'
        
        Returns:
            Dict with validation results
        
        Raises:
            ProductValidationError: If validation fails
        """
        results = {
            'valid': True,
            'checks': [],
            'warnings': [],
        }
        
        try:
            # Check min/max transaction amounts
            self._check_transaction_amount_limits(amount, results)
            
            # Check daily transaction limits
            self._check_daily_limit(amount, results)
            
            # Check monthly transaction limits
            self._check_monthly_limit(amount, results)
            
            # Check account balance requirements (for savings/loans)
            if self.account:
                self._check_balance_requirements(amount, transaction_type, results)
            
            # Check custom validation rules
            self._check_custom_rules(amount, results)
            
            # If any check failed, raise error
            if not results['valid']:
                raise ProductValidationError(
                    f"Transaction validation failed: {results['checks'][-1]['message']}",
                    validation_type=results['checks'][-1]['type']
                )
            
            return results
            
        except ProductValidationError:
            raise
        except Exception as e:
            logger.error(f"Product validation error: {str(e)}", exc_info=True)
            raise ProductValidationError(f"Validation error: {str(e)}")
    
    def _check_transaction_amount_limits(self, amount: Decimal, results: Dict):
        """Check if transaction amount is within product limits"""
        # Check minimum
        if self.product.min_transaction_amount and amount < self.product.min_transaction_amount:
            results['valid'] = False
            results['checks'].append({
                'type': 'min_amount',
                'passed': False,
                'message': f"Amount {amount} is below minimum {self.product.min_transaction_amount}",
                'limit': str(self.product.min_transaction_amount),
                'actual': str(amount)
            })
            return
        
        # Check maximum
        if self.product.max_transaction_amount and amount > self.product.max_transaction_amount:
            results['valid'] = False
            results['checks'].append({
                'type': 'max_amount',
                'passed': False,
                'message': f"Amount {amount} exceeds maximum {self.product.max_transaction_amount}",
                'limit': str(self.product.max_transaction_amount),
                'actual': str(amount)
            })
            return
        
        results['checks'].append({
            'type': 'amount_limits',
            'passed': True,
            'message': 'Transaction amount within limits'
        })
    
    def _check_daily_limit(self, amount: Decimal, results: Dict):
        """Check if transaction would exceed daily limit"""
        if not self.product.daily_transaction_limit:
            return
        
        # Get today's total from cache/database
        today_total = self._get_daily_total()
        new_total = today_total + amount
        
        if new_total > self.product.daily_transaction_limit:
            results['valid'] = False
            results['checks'].append({
                'type': 'daily_limit',
                'passed': False,
                'message': f"Daily limit exceeded. Current: {today_total}, Limit: {self.product.daily_transaction_limit}",
                'limit': str(self.product.daily_transaction_limit),
                'current': str(today_total),
                'attempted': str(amount),
                'would_be': str(new_total)
            })
            return
        
        results['checks'].append({
            'type': 'daily_limit',
            'passed': True,
            'message': f'Within daily limit ({new_total}/{self.product.daily_transaction_limit})',
            'current': str(today_total),
            'limit': str(self.product.daily_transaction_limit)
        })
    
    def _check_monthly_limit(self, amount: Decimal, results: Dict):
        """Check if transaction would exceed monthly limit"""
        if not self.product.monthly_transaction_limit:
            return
        
        # Get this month's total from cache/database
        month_total = self._get_monthly_total()
        new_total = month_total + amount
        
        if new_total > self.product.monthly_transaction_limit:
            results['valid'] = False
            results['checks'].append({
                'type': 'monthly_limit',
                'passed': False,
                'message': f"Monthly limit exceeded. Current: {month_total}, Limit: {self.product.monthly_transaction_limit}",
                'limit': str(self.product.monthly_transaction_limit),
                'current': str(month_total),
                'attempted': str(amount),
                'would_be': str(new_total)
            })
            return
        
        results['checks'].append({
            'type': 'monthly_limit',
            'passed': True,
            'message': f'Within monthly limit ({new_total}/{self.product.monthly_transaction_limit})',
            'current': str(month_total),
            'limit': str(self.product.monthly_transaction_limit)
        })
    
    def _check_balance_requirements(self, amount: Decimal, transaction_type: str, results: Dict):
        """Check balance requirements for savings accounts"""
        if not hasattr(self.account, 'savings_account_detail'):
            return
        
        savings = self.account.savings_account_detail
        current_balance = self.account.balance or Decimal('0')
        
        # Calculate new balance
        if transaction_type == 'debit':
            new_balance = current_balance - amount
        else:
            new_balance = current_balance + amount
        
        # Check minimum balance
        if new_balance < savings.minimum_balance:
            # Check if overdraft is allowed
            if savings.allow_overdraft:
                if abs(new_balance) > savings.overdraft_limit:
                    results['valid'] = False
                    results['checks'].append({
                        'type': 'overdraft_limit',
                        'passed': False,
                        'message': f"Overdraft limit exceeded. Limit: {savings.overdraft_limit}",
                        'limit': str(savings.overdraft_limit),
                        'would_be': str(abs(new_balance))
                    })
                    return
                else:
                    results['warnings'].append({
                        'type': 'overdraft_used',
                        'message': f'Transaction will use overdraft facility ({new_balance})'
                    })
            else:
                results['valid'] = False
                results['checks'].append({
                    'type': 'minimum_balance',
                    'passed': False,
                    'message': f"Insufficient balance. Minimum: {savings.minimum_balance}, Would be: {new_balance}",
                    'minimum': str(savings.minimum_balance),
                    'current': str(current_balance),
                    'would_be': str(new_balance)
                })
                return
        
        # Check maximum balance
        if self.product.maximum_amount and new_balance > self.product.maximum_amount:
            results['valid'] = False
            results['checks'].append({
                'type': 'maximum_balance',
                'passed': False,
                'message': f"Maximum balance exceeded. Maximum: {self.product.maximum_amount}",
                'maximum': str(self.product.maximum_amount),
                'would_be': str(new_balance)
            })
            return
        
        results['checks'].append({
            'type': 'balance_requirements',
            'passed': True,
            'message': 'Balance requirements satisfied',
            'current': str(current_balance),
            'new': str(new_balance)
        })
    
    def _check_custom_rules(self, amount: Decimal, results: Dict):
        """Check custom validation rules from product configuration"""
        validation_rules = self.product.validation_rules
        
        if not validation_rules:
            return
        
        # Example custom rules (can be extended):
        # - withdrawal_frequency_limit
        # - minimum_time_between_transactions
        # - specific_day_restrictions
        # etc.
        
        # This is extensible - add custom rule checks here
        pass
    
    def _get_daily_total(self) -> Decimal:
        """Get today's transaction total (from cache or database)"""
        today = timezone.now().date()
        cache_key = self._get_cache_key('daily', today)
        
        # Try cache first
        cached_total = cache.get(cache_key)
        if cached_total is not None:
            return Decimal(str(cached_total))
        
        # Query database
        total = self._query_transaction_total('daily')
        
        # Cache result
        cache.set(cache_key, str(total), self.CACHE_TTL)
        
        return total
    
    def _get_monthly_total(self) -> Decimal:
        """Get this month's transaction total (from cache or database)"""
        today = timezone.now().date()
        month_key = f"{today.year}-{today.month:02d}"
        cache_key = self._get_cache_key('monthly', month_key)
        
        # Try cache first
        cached_total = cache.get(cache_key)
        if cached_total is not None:
            return Decimal(str(cached_total))
        
        # Query database
        total = self._query_transaction_total('monthly')
        
        # Cache result (cache longer for monthly)
        cache.set(cache_key, str(total), self.CACHE_TTL * 7)
        
        return total
    
    def _query_transaction_total(self, period: str) -> Decimal:
        """Query database for transaction total"""
        from transactions.models import TransactionEntry
        
        today = timezone.now().date()
        
        # Build query based on validation scope
        query = Q()
        
        if self.product.validation_scope == 'category' and self.category:
            # Sum all transactions for this category
            query &= Q(account__expense_categories_main=self.category)
        elif self.product.validation_scope == 'account' and self.account:
            # Sum transactions for this specific account
            query &= Q(account=self.account)
        elif self.product.validation_scope == 'user' and self.user:
            # Sum transactions for this user
            query &= Q(transaction__created_by=self.user)
        else:
            # Default to account if available
            if self.account:
                query &= Q(account=self.account)
        
        # Add time period filter
        if period == 'daily':
            query &= Q(transaction__date=today)
        elif period == 'monthly':
            query &= Q(
                transaction__date__year=today.year,
                transaction__date__month=today.month
            )
        
        # Sum debit amounts
        total = TransactionEntry.objects.filter(query).filter(
            side='DR'
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0')
        
        return total
    
    def _get_cache_key(self, period: str, identifier) -> str:
        """Generate cache key for transaction totals"""
        scope = self.product.validation_scope
        
        if scope == 'category' and self.category:
            scope_id = f"cat_{self.category.id}"
        elif scope == 'account' and self.account:
            scope_id = f"acc_{self.account.id}"
        elif scope == 'user' and self.user:
            scope_id = f"usr_{self.user.id}"
        else:
            scope_id = "unknown"
        
        return f"{self.CACHE_PREFIX}:{self.product.id}:{scope}:{scope_id}:{period}:{identifier}"
    
    def invalidate_cache(self):
        """Invalidate cached transaction totals (call after successful transaction)"""
        today = timezone.now().date()
        month_key = f"{today.year}-{today.month:02d}"
        
        cache.delete(self._get_cache_key('daily', today))
        cache.delete(self._get_cache_key('monthly', month_key))


def get_product_for_account(account) -> Optional[Any]:
    """
    Get product configuration for an account
    
    Returns Product instance or None
    """
    # Check if account has savings product
    if hasattr(account, 'savings_account_detail'):
        return account.savings_account_detail.product
    
    # Check if account has loan product
    if hasattr(account, 'loan_account'):
        loan_account = account.loan_account
        if hasattr(loan_account, 'product'):
            return loan_account.product.product if hasattr(loan_account.product, 'product') else None
    
    # Check if expense account linked to category with product
    expense_categories = account.expense_categories_main.all()
    for category in expense_categories:
        if hasattr(category, 'product') and category.product:
            return category.product
    
    return None
