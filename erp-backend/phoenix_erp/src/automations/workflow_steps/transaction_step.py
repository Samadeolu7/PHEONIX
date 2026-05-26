# automations/workflow_steps/transaction_step.py - COMPLETELY FIXED

from django.utils import timezone
from django.utils.dateparse import parse_date
from decimal import Decimal
import logging

logger = logging.getLogger(__name__)


class TransactionStepHandler:
    """Handle transaction creation in workflows - FIXED"""
    
    def execute(self, step, run, context):
        """Execute transaction step - FIXED"""
        from transactions.models import Transaction, TransactionSeries, TransactionEntry
        from accounts.models import Account
        
        config = step.get('config', {})
        
        try:
            # 1. RESOLVE VARIABLES IN CONFIG
            resolved_config = self._resolve_variables(config, context)
            
            # 2. GET OR CREATE TRANSACTION SERIES
            series_code = resolved_config.get('series_code', 'TXN')
            series, created = TransactionSeries.objects.get_or_create(
                code=series_code,
                defaults={
                    'description': f'Auto-generated series for {series_code}',
                    'sequence_name': f'seq_ref_{series_code.lower()}'
                }
            )
            
            if created:
                logger.info(f"Auto-created TransactionSeries: {series_code}")
            
            # 3. PARSE TRANSACTION DATE - FIXED
            transaction_date = resolved_config.get('date')
            
            if not transaction_date:
                # Use today if no date provided
                transaction_date = timezone.localdate()
            elif isinstance(transaction_date, str):
                # Parse string date (YYYY-MM-DD format)
                parsed_date = parse_date(transaction_date)
                if parsed_date:
                    transaction_date = parsed_date
                else:
                    logger.warning(
                        f"Invalid date format: {transaction_date}. Using today."
                    )
                    transaction_date = timezone.localdate()
            elif hasattr(transaction_date, 'date'):
                # If it's a datetime, extract date
                transaction_date = transaction_date.date()
            
            # 4. CREATE TRANSACTION
            # Make workflow reference unique per step to allow multiple transactions in same workflow
            # Use hash of step_id to keep within 50-char limit
            import hashlib
            step_id = step.get('id', 'unknown')
            step_hash = hashlib.md5(step_id.encode()).hexdigest()[:8]
            step_workflow_ref = f"{run.run_reference}_{step_hash}"
            
            transaction = Transaction.objects.create(
                series=series,
                date=transaction_date,  # Now guaranteed to be a date object
                description=resolved_config.get('description', 'Workflow transaction'),
                owner=run.owner,
                branch=run.branch,
                created_by=run.created_by,
                workflow_reference=step_workflow_ref
            )
            
            logger.info(
                f"Created transaction: {transaction.reference_number} "
                f"(Date: {transaction_date})"
            )
            
            # 5. CREATE TRANSACTION ENTRIES
            entries_config = resolved_config.get('entries', [])
            
            if not entries_config or len(entries_config) < 2:
                raise ValueError("Transaction requires at least 2 entries")
            
            created_entries = []
            for entry_config in entries_config:
                # Get account
                account_id = entry_config.get('account_id')
                if not account_id:
                    raise ValueError("Entry missing account_id")
                
                try:
                    account = Account.objects.get(id=account_id, branch=run.branch)
                except Account.DoesNotExist:
                    # Provide helpful error message with available account info
                    all_accounts = Account.objects.filter(branch=run.branch).values_list('id', 'code', 'name')
                    account_list = ', '.join([f"{id}:{code}-{name}" for id, code, name in all_accounts[:5]])
                    raise ValueError(
                        f"Account {account_id} not found in branch '{run.branch.name}'. "
                        f"Available accounts: {account_list}{'...' if all_accounts.count() > 5 else ''}"
                    )
                
                # Parse amount
                amount = Decimal(str(entry_config.get('amount', 0)))
                if amount <= 0:
                    raise ValueError(f"Amount must be positive, got {amount}")
                
                # Get side (DR/CR)
                side = entry_config.get('side', 'DR').upper()
                if side not in ['DR', 'CR']:
                    raise ValueError(f"Invalid side: {side}. Must be DR or CR")
                
                # Create entry
                entry = TransactionEntry.objects.create(
                    transaction=transaction,
                    account=account,
                    side=side,
                    amount=amount
                )
                
                created_entries.append(entry)
                logger.info(
                    f"Created entry: {account.code} {side} {amount}"
                )
            
            # 6. VALIDATE TRANSACTION BALANCE
            dr_total = sum(
                e.amount for e in created_entries if e.side == 'DR'
            )
            cr_total = sum(
                e.amount for e in created_entries if e.side == 'CR'
            )
            
            if abs(dr_total - cr_total) > Decimal('0.01'):
                raise ValueError(
                    f"Transaction not balanced: DR={dr_total}, CR={cr_total}"
                )
            
            # 7. POST TRANSACTION
            transaction.post()
            
            logger.info(
                f"Posted transaction: {transaction.reference_number} "
                f"(Balance: {dr_total})"
            )
            
            # 8. RETURN SUCCESS
            return {
                'success': True,
                'transaction_id': transaction.id,
                'reference_number': transaction.reference_number,
                'date': transaction.date.isoformat(),
                'amount': float(dr_total),
                'entries_count': len(created_entries),
                'balanced': True
            }
        
        except Exception as e:
            logger.exception(f"Transaction creation failed: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def _resolve_variables(self, config, context):
        """Resolve ${variable} and {{variable}} references from context - FIXED"""
        import re
        
        def resolve_value(value):
            if isinstance(value, str) and ('${' in value or '{{' in value):
                # Find all variable references (both ${} and {{}})
                def replacer(match):
                    var_path = match.group(1)
                    parts = var_path.split('.')
                    
                    result = context
                    for part in parts:
                        if isinstance(result, dict):
                            result = result.get(part)
                        else:
                            result = getattr(result, part, None)
                        
                        if result is None:
                            logger.warning(
                                f"Variable '{var_path}' not found in context"
                            )
                            return f"[UNDEFINED: {var_path}]"
                    
                    return str(result)
                
                # Replace both ${...} and {{...}} patterns
                value = re.sub(r'\$\{([^}]+)\}', replacer, value)
                value = re.sub(r'\{\{([^}]+)\}\}', replacer, value)
                return value
            
            elif isinstance(value, dict):
                return {k: resolve_value(v) for k, v in value.items()}
            elif isinstance(value, list):
                return [resolve_value(item) for item in value]
            
            return value
        
        return {k: resolve_value(v) for k, v in config.items()}# # automations/workflow_steps/transaction_step.py
# from typing import Dict, Any
# from decimal import Decimal
# from django.db import transaction as db_transaction
# import logging
# from django.utils import timezone
# from .base import BaseStepHandler
# from automations.product_validation import ProductValidator, ProductValidationError, get_product_for_account

# logger = logging.getLogger(__name__)


# class TransactionStepHandler(BaseStepHandler):
#     """
#     Handles transaction creation steps
    
#     Config example:
#     {
#         'transaction_type': 'double_entry',
#         'series_code': 'TXN',
#         'date': '${form.transaction_date}',
#         'description': '${form.description}',
#         'entries': [
#             {
#                 'account_id': '${form.account_id}',
#                 'side': 'DR',
#                 'amount': '${form.amount}'
#             },
#             {
#                 'account_id': '${form.contra_account_id}',
#                 'side': 'CR',
#                 'amount': '${form.amount}'
#             }
#         ]
#     }
#     """
    
#     def execute(
#         self,
#         step_config: Dict[str, Any],
#         workflow_run,
#         context: Dict[str, Any]
#     ) -> Dict[str, Any]:
#         from transactions.models import Transaction, TransactionEntry, TransactionSeries
#         from accounts.models import Account
#         from django.utils.dateparse import parse_date
        
#         config = step_config.get('config', {})
        
#         try:
#             # PRODUCT VALIDATION - Validate before creating transaction
#             validation_result = self._validate_product_rules(config, context, workflow_run)
#             if not validation_result['valid']:
#                 # Check if workflow defines on_validation_error handler
#                 error_step = step_config.get('on_validation_error')
#                 if error_step:
#                     # Route to error handling step
#                     return {
#                         'success': False,
#                         'validation_failed': True,
#                         'validation_result': validation_result,
#                         'next_step': error_step,
#                         'error': validation_result['checks'][-1]['message']
#                     }
#                 else:
#                     # Fail the workflow
#                     raise ProductValidationError(
#                         validation_result['checks'][-1]['message']
#                     )
            
#             # Get series
#             series_code = self._resolve_variable(config.get('series_code', 'TXN'), context)

#             # AFTER (auto-create if missing):
#             series, created = TransactionSeries.objects.get_or_create(
#                 code=series_code,
#                 defaults={
#                     'description': f'Auto-generated series for {series_code}',
#                     'sequence_name': f'seq_ref_{series_code.lower()}'
#                 }
#             )

#             if created:
#                 logger.info(f"Auto-created TransactionSeries: {series_code}")
            
#             # Get date
#             date_value = self._resolve_variable(config.get('date'), context)
#             if isinstance(date_value, str):
#                 date_value = parse_date(date_value)
            
#             # Validate date
#             if not date_value:
#                 raise ValueError(
#                     f"Transaction date is required but not found. "
#                     f"Config keys: {list(config.keys())}, "
#                     f"Context keys: {list(context.keys())}"
#                 )
            
#             # Get description
#             description = self._resolve_variable(config.get('description', 'Transaction'), context)
            
#             # Generate unique workflow reference within 30 char limit
#             # Count existing transactions for this workflow run
#             from transactions.models import Transaction
#             existing_count = Transaction.objects.filter(
#                 owner=workflow_run.owner,
#                 workflow_reference__startswith=workflow_run.run_reference[:25]
#             ).count()
            
#             # Truncate run_reference to 25 chars and add suffix
#             workflow_ref = workflow_run.run_reference[:25]
#             if existing_count > 0:
#                 workflow_ref = f"{workflow_ref}-{existing_count + 1}"
            
#             with db_transaction.atomic():
#                 # Create transaction
#                 txn = Transaction.objects.create(
#                     series=series,
#                     date=date_value,
#                     description=description,
#                     workflow_reference=workflow_ref,
#                     owner=workflow_run.owner,
#                     branch=workflow_run.branch,
#                     created_by=workflow_run.created_by
#                 )
                
#                 # Create entries
#                 entries_config = config.get('entries', [])
#                 total_debit = Decimal('0.00')
#                 total_credit = Decimal('0.00')
                
#                 for entry_config in entries_config:
#                     account_id = self._resolve_variable(entry_config['account_id'], context)
#                     side = entry_config['side']
#                     amount = Decimal(str(self._resolve_variable(entry_config['amount'], context)))
                    
#                     # Get account
#                     account = Account.objects.get(id=account_id, branch=workflow_run.branch)
                    
#                     # Create entry
#                     entry = TransactionEntry.objects.create(
#                         transaction=txn,
#                         account=account,
#                         side=side,
#                         amount=amount
#                     )
                    
#                     if side == 'DR':
#                         total_debit += amount
#                     else:
#                         total_credit += amount
                
#                 # Validate balancing
#                 if total_debit != total_credit:
#                     raise ValueError(f"Transaction doesn't balance: DR={total_debit}, CR={total_credit}")
                
#                 # Post transaction (updates account balances)
#                 for entry in txn.entries.all():
#                     entry.post()
                
#                 # Mark transaction as approved
#                 txn.approved = True
#                 txn.approved_at = timezone.now()
#                 txn.approved_by = workflow_run.created_by
#                 txn.save()
                
#                 # Invalidate product validation cache
#                 self._invalidate_product_cache(config, context, workflow_run)
            
#             return {
#                 'success': True,
#                 'transaction_id': txn.id,
#                 'reference_number': txn.reference_number,
#                 'amount': str(total_debit),
#                 'validation_result': validation_result,
#             }
        
#         except ProductValidationError as e:
#             logger.warning(f"Product validation failed: {str(e)}")
#             return {
#                 'success': False,
#                 'validation_failed': True,
#                 'error': str(e),
#                 'validation_type': e.validation_type
#             }
#         except Exception as e:
#             logger.exception(f"Error creating transaction in workflow step")
#             return {
#                 'success': False,
#                 'error': str(e)
#             }
    
#     def _validate_product_rules(
#         self,
#         config: Dict[str, Any],
#         context: Dict[str, Any],
#         workflow_run
#     ) -> Dict[str, Any]:
#         """
#         Validate transaction against product rules
#         Returns validation result dict
#         """
#         from accounts.models import Account
        
#         # Get the primary account being debited
#         entries_config = config.get('entries', [])
#         if not entries_config:
#             return {'valid': True, 'checks': [], 'warnings': []}
        
#         # Find the debit entry (usually the first one)
#         debit_entry = None
#         for entry_config in entries_config:
#             if entry_config.get('side') == 'DR':
#                 debit_entry = entry_config
#                 break
        
#         if not debit_entry:
#             return {'valid': True, 'checks': [], 'warnings': []}
        
#         try:
#             # Get account
#             account_id = self._resolve_variable(debit_entry['account_id'], context)
#             account = Account.objects.get(id=account_id, branch=workflow_run.branch)
            
#             # Get product for account
#             product = get_product_for_account(account)
#             if not product:
#                 # No product configured - skip validation
#                 return {'valid': True, 'checks': [], 'warnings': [], 'no_product': True}
            
#             # Get amount
#             amount = Decimal(str(self._resolve_variable(debit_entry['amount'], context)))
            
#             # Get expense category if applicable
#             category = None
#             if hasattr(account, 'expense_categories_main'):
#                 categories = account.expense_categories_main.all()
#                 if categories.exists():
#                     category = categories.first()
            
#             # Create validator
#             validator = ProductValidator(
#                 product=product,
#                 account=account,
#                 user=workflow_run.created_by,
#                 category=category
#             )
            
#             # Validate transaction
#             return validator.validate_transaction(amount, transaction_type='debit')
            
#         except Account.DoesNotExist:
#             logger.warning(f"Account {account_id} not found for validation")
#             return {'valid': True, 'checks': [], 'warnings': [], 'account_not_found': True}
#         except Exception as e:
#             logger.error(f"Error during product validation: {str(e)}", exc_info=True)
#             # Don't block transaction on validation errors - log and continue
#             return {'valid': True, 'checks': [], 'warnings': [], 'validation_error': str(e)}
    
#     def _invalidate_product_cache(
#         self,
#         config: Dict[str, Any],
#         context: Dict[str, Any],
#         workflow_run
#     ) -> None:
#         """Invalidate product validation cache after successful transaction"""
#         from accounts.models import Account
        
#         entries_config = config.get('entries', [])
#         for entry_config in entries_config:
#             if entry_config.get('side') == 'DR':
#                 try:
#                     account_id = self._resolve_variable(entry_config['account_id'], context)
#                     account = Account.objects.get(id=account_id, branch=workflow_run.branch)
                    
#                     product = get_product_for_account(account)
#                     if product:
#                         category = None
#                         if hasattr(account, 'expense_categories_main'):
#                             categories = account.expense_categories_main.all()
#                             if categories.exists():
#                                 category = categories.first()
                        
#                         validator = ProductValidator(
#                             product=product,
#                             account=account,
#                             user=workflow_run.created_by,
#                             category=category
#                         )
#                         validator.invalidate_cache()
#                 except Exception as e:
#                     logger.warning(f"Could not invalidate cache: {str(e)}")
        
#     # automations/workflow_steps.py - Add to TransactionStepHandler

#     def _resolve_variables(self, config: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
#         """Enhanced with validation"""
#         import re
        
#         def resolve_value(value):
#             if isinstance(value, str) and '${' in value:
#                 match = re.search(r'\$\{([^}]+)\}', value)
#                 if match:
#                     var_path = match.group(1)
#                     parts = var_path.split('.')
                    
#                     result = context
#                     for part in parts:
#                         if isinstance(result, dict):
#                             result = result.get(part)
#                         else:
#                             result = getattr(result, part, None)
                        
#                         if result is None:
#                             # ADD THIS: Log and provide default instead of crash
#                             logger.warning(f"Variable '{var_path}' not found, using None")
#                             return None  # Or raise with better error
                    
#                     return result
#             elif isinstance(value, dict):
#                 return {k: resolve_value(v) for k, v in value.items()}
#             elif isinstance(value, list):
#                 return [resolve_value(item) for item in value]
            
#             return value
        
#         return {k: resolve_value(v) for k, v in config.items()}
