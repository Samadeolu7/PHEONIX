
from typing import Dict, Any
from decimal import Decimal
from django.db import transaction
from django.utils import timezone

from transactions.models import Transaction, TransactionEntry, TransactionSeries
from accounts.models import Account


class TransactionStepHandler:
    """
    Handles transaction step execution in workflows.
    
    Creates double-entry transactions with proper validation.
    """
    
    def execute(self, step: Dict[str, Any], run, context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute transaction step.
        
        Args:
            step: Step configuration
            run: WorkflowRun instance
            context: Workflow execution context
        
        Returns:
            Dictionary with transaction details
        """
        config = step['config']
        
        # Resolve variables in config
        resolved_config = self._resolve_variables(config, context)
        
        # Create transaction
        with transaction.atomic():
            txn = self._create_transaction(resolved_config, run)
            
            # Post transaction (update account balances)
            txn.post()
        
        return {
            'success': True,
            'transaction_id': txn.id,
            'reference_number': txn.reference_number,
            'amount': str(txn.get_total_amount()),
            'account_balance': str(self._get_account_balance(txn)),
            'date': txn.date.isoformat(),
        }
    
    def _resolve_variables(self, config: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Resolve ${variable} references in configuration.
        
        Example: '${form.amount}' -> '1000.00'
        """
        import re
        
        def resolve_value(value):
            if isinstance(value, str) and '${' in value:
                # Extract variable path
                match = re.search(r'\$\{([^}]+)\}', value)
                if match:
                    var_path = match.group(1)
                    parts = var_path.split('.')
                    
                    # Navigate context
                    result = context
                    for part in parts:
                        if isinstance(result, dict):
                            result = result.get(part)
                        else:
                            result = getattr(result, part, None)
                        
                        if result is None:
                            raise ValueError(f"Variable '{var_path}' not found in context")
                    
                    return result
            
            elif isinstance(value, dict):
                return {k: resolve_value(v) for k, v in value.items()}
            
            elif isinstance(value, list):
                return [resolve_value(item) for item in value]
            
            return value
        
        return {k: resolve_value(v) for k, v in config.items()}
    
    def _create_transaction(self, config: Dict[str, Any], run) -> Transaction:
        """Create transaction with entries and post them atomically"""
        from django.db import transaction as db_transaction
        
        with db_transaction.atomic():
            # Get or create series
            series_code = config.get('series_code', 'TXN')
            series, _ = TransactionSeries.objects.get_or_create(
                code=series_code,
                defaults={
                    'description': f'{series_code} Transaction Series'
                }
            )
            
            # Create transaction
            txn = Transaction.objects.create(
                series=series,
                date=config.get('date', timezone.now().date()),
                description=config.get('description', 'Workflow Transaction'),
                workflow_reference=run.run_reference,
                owner=run.owner,
                branch=run.branch,
                created_by=run.created_by,
                tenant=run.tenant,
            )
            
            # Create entries and collect accounts to lock
            entries = []
            account_ids = []
            for entry_config in config.get('entries', []):
                account = Account.objects.get(id=entry_config['account_id'])
                account_ids.append(account.pk)
                
                entry = TransactionEntry.objects.create(
                    transaction=txn,
                    account=account,
                    side=entry_config['side'],
                    amount=Decimal(str(entry_config['amount']))
                )
                entries.append(entry)
            
            # Validate transaction balance
            txn.full_clean()
            
            # Lock affected accounts and post entries
            Account.objects.select_for_update().filter(pk__in=account_ids)
            for entry in entries:
                entry.post()
        
        return txn
    
    def _get_account_balance(self, txn: Transaction) -> Decimal:
        """Get balance of first account in transaction"""
        first_entry = txn.entries.first()
        if first_entry:
            first_entry.account.refresh_from_db()
            return first_entry.account.balance
        return Decimal('0.00')