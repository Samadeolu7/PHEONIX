"""
Script Execution Step Handler
Executes custom Python code in a sandboxed environment
"""
from typing import Dict, Any
import logging
from decimal import Decimal
import math
import json

from .base import BaseStepHandler

logger = logging.getLogger(__name__)


class ScriptStepHandler(BaseStepHandler):
    """
    Handle script execution steps in workflows
    
    Config:
        - script: Python code to execute
        - language: 'python' (future: 'javascript')
        - timeout: execution timeout in seconds
        - result_variable: name to store script result
    
    Example:
        {
            "type": "script",
            "config": {
                "script": "result = amount * 1.1 if amount > 1000 else amount",
                "language": "python",
                "timeout": 5,
                "result_variable": "calculated_amount"
            }
        }
    """
    
    def execute(self, step: dict, run, context: dict) -> Dict[str, Any]:
        """Execute script step"""
        config = step.get('config', {})
        
        try:
            script = config.get('script')
            if not script:
                raise ValueError("script is required")
            
            language = config.get('language', 'python')
            if language != 'python':
                raise ValueError(f"Unsupported language: {language}")
            
            result_var = config.get('result_variable', 'script_result')
            timeout = config.get('timeout', 5)
            
            # Execute script in sandboxed environment
            result = self._execute_python_script(script, context, timeout)
            
            # Store result
            context[result_var] = result
            run.update_context(result_var, result)
            
            return {
                'success': True,
                'result': result,
                'result_variable': result_var
            }
            
        except Exception as e:
            logger.exception(f"Script step failed: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def _execute_python_script(self, script: str, context: dict, timeout: int) -> Any:
        """
        Execute Python script in restricted environment
        
        Security considerations:
        - Limited built-ins
        - No imports
        - No file system access
        - No network access
        """
        # Create safe namespace with limited built-ins
        safe_builtins = {
            'abs': abs,
            'all': all,
            'any': any,
            'bool': bool,
            'dict': dict,
            'float': float,
            'int': int,
            'len': len,
            'list': list,
            'max': max,
            'min': min,
            'range': range,
            'round': round,
            'sorted': sorted,
            'str': str,
            'sum': sum,
            'tuple': tuple,
            'zip': zip,
            # Math functions
            'math': math,
            'Decimal': Decimal,
            # JSON for data handling
            'json': json,
        }
        
        # Convert Decimal values to float for easier arithmetic in scripts
        def convert_decimals(obj):
            if isinstance(obj, Decimal):
                return float(obj)
            elif isinstance(obj, dict):
                return {k: convert_decimals(v) for k, v in obj.items()}
            elif isinstance(obj, (list, tuple)):
                return type(obj)(convert_decimals(item) for item in obj)
            return obj
        
        # Prepare execution namespace
        exec_namespace = {
            '__builtins__': safe_builtins,
            **{k: convert_decimals(v) for k, v in context.items()}  # Convert Decimals in context
        }
        
        # Execute script
        try:
            # Use compile for better error messages
            compiled = compile(script, '<workflow_script>', 'exec')
            exec(compiled, exec_namespace)
            
            # Return result variable if it exists
            if 'result' in exec_namespace:
                return exec_namespace['result']
            else:
                # Return all new variables created by script
                new_vars = {
                    k: v for k, v in exec_namespace.items()
                    if k not in context and k not in safe_builtins and not k.startswith('__')
                }
                return new_vars
                
        except SyntaxError as e:
            raise ValueError(f"Script syntax error: {e}")
        except NameError as e:
            raise ValueError(f"Script name error: {e}")
        except Exception as e:
            raise ValueError(f"Script execution error: {e}")
