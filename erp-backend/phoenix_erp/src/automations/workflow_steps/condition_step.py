# automations/workflow_steps/condition_step.py
from .base import BaseStepHandler
import logging

logger = logging.getLogger(__name__)


class ConditionStepHandler(BaseStepHandler):
    """
    Evaluate conditions and branch workflow
    
    Config example:
    {
        'conditions': [
            {'field': 'form.amount', 'operator': '>', 'value': 1000}
        ],
        'logic': 'AND'  # or 'OR'
    }
    
    Step should have 'on_true' and 'on_false' next steps
    """
    
    def execute(self, step_config, workflow_run, context):
        config = step_config.get('config', {})
        
        try:
            # Support both single condition and conditions array
            conditions = config.get('conditions', [])
            if not conditions:
                # Check for single condition format (field, operator, value in config)
                if 'field' in config and 'operator' in config:
                    conditions = [{
                        'field': config.get('field'),
                        'operator': config.get('operator'),
                        'value': config.get('value')
                    }]
            
            logic = config.get('logic', 'AND').upper()
            
            # Evaluate each condition
            results = []
            for condition in conditions:
                result = self._evaluate_condition(condition, context)
                results.append(result)
            
            # Apply logic
            if logic == 'AND':
                condition_met = all(results)
            elif logic == 'OR':
                condition_met = any(results)
            else:
                condition_met = False
            
            # Determine next step - check both config and step_config for on_true/on_false or if_true/if_false
            if condition_met:
                next_step = config.get('on_true') or config.get('if_true') or \
                           step_config.get('on_true') or step_config.get('if_true')
            else:
                next_step = config.get('on_false') or config.get('if_false') or \
                           step_config.get('on_false') or step_config.get('if_false')
            
            return {
                'success': True,
                'condition_result': condition_met,
                'next_step': next_step
            }
        
        except Exception as e:
            logger.exception(f"Condition step failed: {e}")
            return {
                'success': False,
                'error': str(e)
            }