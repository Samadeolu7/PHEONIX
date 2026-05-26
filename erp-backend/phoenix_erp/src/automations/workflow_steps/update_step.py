

# automations/workflow_steps/update_step.py
from django.apps import apps
from .base import BaseStepHandler


class UpdateStepHandler(BaseStepHandler):
    """
    Update database records
    
    Config example:
    {
        'entity': 'Client',
        'id': '${form.client_id}',
        'fields': {
            'status': 'active',
            'last_transaction_date': '${form.transaction_date}'
        }
    }
    """
    
    def execute(self, step_config, workflow_run, context):
        config = step_config.get('config', {})
        
        entity = config.get('entity')
        record_id = self._resolve_variable(config.get('id'), context)
        fields = self._resolve_variables(config.get('fields', {}), context)
        
        # Get model
        model = self._get_model(entity)
        
        # Get and update record
        obj = model.objects.get(id=record_id, branch=workflow_run.branch)
        
        for field, value in fields.items():
            setattr(obj, field, value)
        
        obj.save()
        
        return {
            'success': True,
            'updated': True,
            'record_id': record_id,
            'fields_updated': list(fields.keys())
        }
    
    def _get_model(self, model_name: str):
        """Get Django model by name"""
        allowed_models = {
            'Account': 'accounts.Account',
            'Client': 'clients.Client',
            'SavingsAccount': 'savings.SavingsAccount',
            'LoanAccount': 'loans.LoanAccount',
        }
        
        if model_name not in allowed_models:
            raise ValueError(f"Model {model_name} not allowed")
        
        return apps.get_model(allowed_models[model_name])

