# incomes/services/fee_setup_service.py
"""
Unified service for setting up fee structures with automatic GL account creation
Handles parent/child account hierarchy and configuration setup
"""
from django.db import transaction
from django.core.exceptions import ValidationError
from decimal import Decimal
import logging

from accounts.models import Account, AccountCategory
from incomes.models import IncomeCategory, FeeStructure
from incomes.models_config import IncomeAccountingConfig

logger = logging.getLogger(__name__)


class FeeSetupService:
    """
    One-stop service for creating fee structures with all dependencies
    Automatically creates GL accounts if they don't exist
    """
    
    @staticmethod
    @transaction.atomic
    def setup_fee_structure(
        owner,
        branch,
        user,
        fee_data: dict,
        auto_create_accounts: bool = True
    ) -> dict:
        """
        Create complete fee structure with GL accounts
        
        Args:
            owner: Owner instance
            branch: Branch instance (REQUIRED)
            user: User creating the setup
            fee_data: {
                'name': 'Tuition Fees',
                'code': 'TUT',
                'base_amount': 10000.00,
                'income_account': {
                    'create_new': True,  # or False to use existing
                    'account_id': 123,  # if create_new=False
                    'name': 'Tuition Fee Income',
                    'code': '401-001',
                    'parent_code': '401',  # Parent account code
                    'parent_name': 'Total Income',
                    'category_id': 5,  # Or auto-create
                    'category_name': 'Fee Income',
                },
                'payment_terms': {
                    'allows_partial': True,
                    'minimum_percent': 50,
                    'requires_invoice': True
                },
                'fee_components': [...]  # Optional breakdown
            }
            auto_create_accounts: If True, creates missing accounts
            
        Returns:
            {
                'fee_structure': FeeStructure instance,
                'income_category': IncomeCategory instance,
                'income_account': Account instance,
                'parent_account': Account instance (if created),
                'created_accounts': [...],  # List of created accounts
                'accounting_config': IncomeAccountingConfig instance (if created)
            }
        """
        result = {
            'success': True,
            'created_accounts': [],
            'created_categories': [],
            'created_config': False
        }
        
        # Validate required parameters
        if branch is None:
            raise ValueError("branch parameter is required and cannot be None")
        
        # Validate fee data before making any database changes
        is_valid, errors = FeeSetupService.validate_fee_setup_data(fee_data)
        if not is_valid:
            return {
                'success': False,
                'errors': errors,
                'message': 'Validation failed: ' + '; '.join(errors)
            }
        
        # Step 1: Get or create income GL account
        income_account_data = fee_data.get('income_account', {})
        
        if income_account_data.get('create_new', True):
            # Create parent account first if needed
            parent_account = FeeSetupService._get_or_create_parent_account(
                owner=owner,
                branch=branch,
                user=user,
                parent_code=income_account_data.get('parent_code', '400'),
                parent_name=income_account_data.get('parent_name', 'Total Income'),
                account_type='INCOME',
                category_id=income_account_data.get('category_id')
            )
            
            if parent_account.get('created'):
                result['created_accounts'].append(parent_account['account'])
            
            # Create child income account (NO SIGNAL TRIGGER)
            # Auto-generate code if not provided
            fee_code = fee_data.get('code', fee_data['name'][:3].upper())
            income_account = FeeSetupService._create_child_account(
                owner=owner,
                branch=branch,
                user=user,
                parent=parent_account['account'],
                name=income_account_data.get('name', f"{fee_data['name']} Income"),
                code=income_account_data.get('code', f"400-{fee_code}"),
                account_type='INCOME',
                suppress_signals=True  # Don't trigger automatic form/workflow creation
            )
            
            result['created_accounts'].append(income_account)
            result['income_account'] = income_account
        else:
            # Use existing account
            try:
                income_account = Account.objects.get(
                    id=income_account_data['account_id'],
                    owner=owner
                )
                result['income_account'] = income_account
            except Account.DoesNotExist:
                raise ValidationError(
                    f"Income account {income_account_data['account_id']} not found"
                )
        
        # Step 2: Create income category
        # Convert Decimal values to strings for JSON serialization
        payment_terms = fee_data.get('payment_terms', {})
        behavior_config = {k: (str(v) if isinstance(v, Decimal) else v) for k, v in payment_terms.items()}
        
        income_category = IncomeCategory.objects.create(
            name=fee_data['name'],
            code=fee_data.get('code', fee_data['name'][:3].upper()),
            description=fee_data.get('description', ''),
            income_account=income_account,
            behavior_config=behavior_config,
            owner=owner,
            branch=branch,
            created_by=user,
            is_active=True
        )
        
        result['income_category'] = income_category
        
        # Step 3: Create fee structure
        # Convert Decimal values in fee_components for JSON serialization
        fee_components = fee_data.get('fee_components', [])
        if isinstance(fee_components, list):
            fee_components = [
                {k: (str(v) if isinstance(v, Decimal) else v) for k, v in component.items()}
                for component in fee_components
            ]
        
        fee_structure = FeeStructure.objects.create(
            name=fee_data['name'],
            code=fee_data.get('code', fee_data['name'][:3].upper()),
            category=income_category,
            base_amount=Decimal(str(fee_data['base_amount'])),
            description=fee_data.get('description', ''),
            industry_config={'fee_components': fee_components} if fee_components else {},
            effective_from=fee_data.get('effective_from'),
            effective_to=fee_data.get('effective_to'),
            owner=owner,
            branch=branch,
            created_by=user,
            is_active=True
        )
        
        result['fee_structure'] = fee_structure
        
        # Step 4: Ensure accounting configuration exists
        try:
            config = IncomeAccountingConfig.objects.get(owner=owner, branch=branch)
            result['accounting_config'] = config
        except IncomeAccountingConfig.DoesNotExist:
            # Need to create config - but need AR and Cash accounts first
            logger.warning(
                f"No income accounting config found for {owner.username}. "
                "Frontend should prompt user to configure default accounts."
            )
            result['accounting_config'] = None
            result['needs_config'] = True
        
        return result
    
    @staticmethod
    def _get_or_create_parent_account(
        owner, branch, user, parent_code, parent_name, account_type, category_id=None
    ) -> dict:
        """
        Get or create parent account
        Returns: {'account': Account, 'created': bool}
        """
        # Try to find existing parent by code
        try:
            parent = Account.objects.get(
                code=parent_code,
                owner=owner,
                branch=branch,
                account_level=Account.LEVEL_PARENT
            )
            return {'account': parent, 'created': False}
        except Account.DoesNotExist:
            pass
        
        # Get or create category
        if not category_id:
            # Determine section based on account type
            section_map = {
                'ASSET': 1,
                'LIABILITY': 2,
                'EQUITY': 3,
                'INCOME': 4,
                'EXPENSE': 5
            }
            section = section_map.get(account_type, 4)
            
            # Find or create category
            category_name = f"{account_type.title()} Accounts"
            code_prefix = parent_code[:2]
            
            # Try to find existing category, otherwise create
            try:
                category = AccountCategory.objects.get(
                    owner=owner,
                    branch=branch,
                    section=section,
                    code_prefix=code_prefix
                )
            except AccountCategory.DoesNotExist:
                category = AccountCategory.objects.create(
                    owner=owner,
                    branch=branch,
                    created_by=user,
                    section=section,
                    code_prefix=code_prefix,
                    name=category_name
                )
            category_id = category.id
        
        # Create parent account (WITH SIGNALS - it's a parent, needs forms)
        parent = Account.objects.create(
            code=parent_code,
            name=parent_name,
            account_level=Account.LEVEL_PARENT,
            account_type=account_type,
            category_id=category_id,
            balance=Decimal('0.00'),
            balance_bf=Decimal('0.00'),
            allow_manual_entries=False,  # Parent accounts don't have direct entries
            enable_smart_forms=True,  # Enable form generation
            owner=owner,
            branch=branch,
            created_by=user
        )
        
        return {'account': parent, 'created': True}
    
    @staticmethod
    def _create_child_account(
        owner, branch, user, parent, name, code, account_type, suppress_signals=False
    ) -> Account:
        """
        Create child account WITHOUT triggering signals
        """
        # Temporarily disable signals if requested
        from django.db.models.signals import post_save
        from accounts.signals import generate_account_components
        
        if suppress_signals:
            post_save.disconnect(generate_account_components, sender=Account)
        
        try:
            child = Account.objects.create(
                code=code,
                name=name,
                account_level=Account.LEVEL_CHILD,
                account_type=account_type,
                parent=parent,
                category=parent.category,
                balance=Decimal('0.00'),
                balance_bf=Decimal('0.00'),
                allow_manual_entries=True,
                enable_smart_forms=False,  # Child accounts use parent's forms
                owner=owner,
                branch=branch,
                created_by=user
            )
            return child
        finally:
            # Re-enable signals
            if suppress_signals:
                post_save.connect(generate_account_components, sender=Account)
    
    @staticmethod
    @transaction.atomic
    def setup_accounting_config(
        owner,
        branch,
        user,
        cash_account_id: int,
        ar_account_id: int,
        bank_transfer_account_id: int = None,
        mobile_money_account_id: int = None
    ) -> IncomeAccountingConfig:
        """
        Create or update income accounting configuration
        """
        config, created = IncomeAccountingConfig.objects.update_or_create(
            owner=owner,
            branch=branch,
            defaults={
                'default_cash_account_id': cash_account_id,
                'default_ar_account_id': ar_account_id,
                'bank_transfer_account_id': bank_transfer_account_id,
                'mobile_money_account_id': mobile_money_account_id,
                'income_series_code': 'INC',
                'entitlement_series_code': 'ENT',
                'require_bank_account': False,
                'allow_overpayment': False,
                'auto_reconcile': True,
                'created_by': user
            }
        )
        
        return config
    
    @staticmethod
    def validate_fee_setup_data(fee_data: dict) -> tuple[bool, list]:
        """
        Validate fee setup data before processing
        Returns: (is_valid, errors)
        """
        errors = []
        
        # Required fields
        if not fee_data.get('name'):
            errors.append("Fee name is required")
        
        if not fee_data.get('base_amount'):
            errors.append("Base amount is required")
        
        try:
            amount = Decimal(str(fee_data.get('base_amount', 0)))
            if amount <= 0:
                errors.append("Base amount must be positive")
        except (ValueError, TypeError):
            errors.append("Base amount must be a valid number")
        
        # Income account validation
        income_account = fee_data.get('income_account', {})
        if not income_account.get('create_new', True):
            if not income_account.get('account_id'):
                errors.append("Either create new account or provide existing account_id")
        else:
            if not income_account.get('name'):
                errors.append("Income account name is required when creating new account")
            if not income_account.get('code'):
                errors.append("Income account code is required when creating new account")
        
        return (len(errors) == 0, errors)
