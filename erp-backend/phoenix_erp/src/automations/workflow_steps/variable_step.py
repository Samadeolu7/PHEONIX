"""
Variable Assignment Step Handler
Sets or updates variables in workflow context
"""
from typing import Dict, Any
import logging

from .base import BaseStepHandler

logger = logging.getLogger(__name__)


class VariableStepHandler(BaseStepHandler):
    """
    Handle variable assignment steps in workflows
    
    Config:
        - variables: dict of variable names and their values/expressions
        - mode: 'set' | 'merge' | 'delete'
    
    Example:
        {
            "type": "variable",
            "config": {
                "mode": "set",
                "variables": {
                    "tax_rate": 0.1,
                    "total_with_tax": "${amount} * (1 + ${tax_rate})",
                    "status": "processed"
                }
            }
        }
    """
    
    def execute(self, step: dict, run, context: dict) -> Dict[str, Any]:
        """Execute variable assignment step"""
        config = step.get('config', {})
        
        try:
            mode = config.get('mode', 'set')
            variables = config.get('variables', {})
            
            if not variables:
                raise ValueError("variables dict is required")
            
            if mode == 'set':
                return self._set_variables(variables, run, context)
            elif mode == 'merge':
                return self._merge_variables(variables, run, context)
            elif mode == 'delete':
                return self._delete_variables(variables, run, context)
            else:
                raise ValueError(f"Unknown mode: {mode}")
                
        except Exception as e:
            logger.exception(f"Variable step failed: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def _set_variables(self, variables: dict, run, context: dict) -> Dict[str, Any]:
        """Set variables in context (overwrite if exists)"""
        set_vars = {}
        
        for var_name, var_value in variables.items():
            # Resolve value if it's a string with variables
            if isinstance(var_value, str) and '${' in var_value:
                resolved_value = self._resolve_variable(var_value, context)
            else:
                resolved_value = var_value
            
            # Update context
            context[var_name] = resolved_value
            set_vars[var_name] = resolved_value
            
            # Update run context
            run.update_context(var_name, resolved_value)
        
        return {
            'success': True,
            'variables_set': len(set_vars),
            'variables': set_vars
        }
    
    def _merge_variables(self, variables: dict, run, context: dict) -> Dict[str, Any]:
        """Merge variables into context (only if not exists)"""
        merged_vars = {}
        skipped_vars = []
        
        for var_name, var_value in variables.items():
            if var_name in context:
                skipped_vars.append(var_name)
                continue
            
            # Resolve value
            if isinstance(var_value, str) and '${' in var_value:
                resolved_value = self._resolve_variable(var_value, context)
            else:
                resolved_value = var_value
            
            # Update context
            context[var_name] = resolved_value
            merged_vars[var_name] = resolved_value
            
            # Update run context
            run.update_context(var_name, resolved_value)
        
        return {
            'success': True,
            'variables_merged': len(merged_vars),
            'variables_skipped': len(skipped_vars),
            'merged': merged_vars,
            'skipped': skipped_vars
        }
    
    def _delete_variables(self, variables: dict, run, context: dict) -> Dict[str, Any]:
        """Delete variables from context"""
        deleted_vars = []
        not_found = []
        
        # In delete mode, variables should be a list of names
        var_names = variables if isinstance(variables, list) else list(variables.keys())
        
        for var_name in var_names:
            if var_name in context:
                del context[var_name]
                deleted_vars.append(var_name)
                
                # Update run context
                run_ctx = run.context or {}
                if var_name in run_ctx:
                    del run_ctx[var_name]
                    run.context = run_ctx
                    run.save()
            else:
                not_found.append(var_name)
        
        return {
            'success': True,
            'variables_deleted': len(deleted_vars),
            'deleted': deleted_vars,
            'not_found': not_found
        }
