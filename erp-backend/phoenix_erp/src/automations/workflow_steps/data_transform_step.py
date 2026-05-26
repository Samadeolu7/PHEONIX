
# automations/workflow_steps/data_transform_step.py
from .base import BaseStepHandler


class DataTransformStepHandler(BaseStepHandler):
    """
    Transform data between steps
    
    Config example:
    {
        'transformations': [
            {
                'source': 'form.amount',
                'target': 'transaction_amount',
                'operation': 'multiply',
                'value': 1.1  # Add 10% fee
            }
        ]
    }
    """
    
    def execute(self, step_config, workflow_run, context):
        config = step_config.get('config', {})
        transformations = config.get('transformations', [])
        
        results = {}
        
        for transform in transformations:
            source_path = transform['source']
            target_name = transform['target']
            operation = transform.get('operation', 'copy')
            
            # Get source value
            source_value = self._get_nested_value(context, source_path)
            
            # Apply transformation
            if operation == 'copy':
                results[target_name] = source_value
            elif operation == 'multiply':
                from decimal import Decimal
                value = Decimal(str(transform['value']))
                results[target_name] = Decimal(str(source_value)) * value
            elif operation == 'add':
                from decimal import Decimal
                value = Decimal(str(transform['value']))
                results[target_name] = Decimal(str(source_value)) + value
            elif operation == 'format':
                format_str = transform['format']
                results[target_name] = format_str.format(source_value)
        
        return {
            'success': True,
            **results
        }

