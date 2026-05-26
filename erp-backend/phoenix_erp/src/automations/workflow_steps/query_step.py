# automations/workflow_steps/query_step.py
from django.apps import apps
from .base import BaseStepHandler


class QueryStepHandler(BaseStepHandler):
    """
    Execute database queries
    
    Config example:
    {
        'entity': 'Account',
        'select': ['id', 'name', 'balance'],
        'where': {
            'account_type': 'SAVINGS',
            'branch_id': '${workflow_run.branch_id}'
        },
        'order_by': '-balance',
        'limit': 10
    }
    """
    
    def execute(self, step_config, workflow_run, context):
        config = step_config.get('config', {})
        
        entity = config.get('entity')
        
        # Better error handling for missing entity
        if not entity:
            return {
                'success': False,
                'error': 'Query step requires an "entity" in config (e.g., entity: "Client")'
            }
        
        select = config.get('select', [])
        where = self._resolve_variables(config.get('where', {}), context)
        order_by = config.get('order_by')
        limit = config.get('limit')
        result_var = config.get('result_name') or config.get('result_variable', 'query_results')
        
        # Get Django model
        try:
            model = self._get_model(entity)
        except ValueError as e:
            return {
                'success': False,
                'error': str(e)
            }
        
        # Build queryset
        queryset = model.objects.filter(**where)
        
        if order_by:
            queryset = queryset.order_by(order_by)
        
        if limit:
            queryset = queryset[:int(limit)]
        
        # Get results
        if select:
            results = list(queryset.values(*select))
        else:
            results = list(queryset.values())
        
        # Serialize datetime/date fields to ISO format strings
        results = self._serialize_results(results)
        
        # Store results in context with result_name
        context[result_var] = results
        workflow_run.update_context(result_var, results)
        
        return {
            'success': True,
            'results': results,
            'count': len(results),
            'result_variable': result_var
        }
    
    def _serialize_results(self, results):
        """Convert datetime/date objects to ISO format strings for JSON serialization"""
        from datetime import datetime, date
        
        serialized = []
        for item in results:
            serialized_item = {}
            for key, value in item.items():
                if isinstance(value, (datetime, date)):
                    serialized_item[key] = value.isoformat()
                else:
                    serialized_item[key] = value
            serialized.append(serialized_item)
        return serialized
    
    def _get_model(self, model_name: str):
        """Get Django model by name (with security)"""
        # Allowed models map
        allowed_models = {
            'Account': 'accounts.Account',
            'Transaction': 'transactions.Transaction',
            'Client': 'clients.Client',
            'User': 'users.User',
            'SavingsAccount': 'savings.SavingsAccount',
            'LoanAccount': 'loans.LoanAccount',
        }
        
        if model_name not in allowed_models:
            raise ValueError(f"Model {model_name} not allowed in workflows")
        
        return apps.get_model(allowed_models[model_name])
