# automations/workflow_steps.py - Add new handler for calculations

from typing import Dict, Any
from decimal import Decimal, ROUND_HALF_UP
import logging
import re
from datetime import datetime

logger = logging.getLogger(__name__)


class CalculationStepHandler:
    """
    Enhanced calculation handler with support for:
    - Formula evaluation
    - String templates
    - Built-in functions
    - Type conversion
    """
    
    def execute(self, step: Dict[str, Any], run, context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute calculation step
        
        Config structure:
        {
            "result_name": "total_with_tax",
            "result_type": "number",  # number, string, date, boolean
            "calculation_type": "formula",  # formula, template, function
            "formula": "amount * 1.1",  # For formula type
            "template": "Transaction of ${amount}",  # For template type
            "function": "uppercase",  # For function type
            "function_args": ["${field}"]  # Arguments for function
        }
        """
        config = step['config']
        
        try:
            result_name = config.get('result_name')
            if not result_name:
                raise ValueError("result_name is required for calculation step")
            
            calc_type = config.get('calculation_type', 'formula')
            
            # Execute based on calculation type
            if calc_type == 'formula':
                result = self._execute_formula(config, context)
            elif calc_type == 'template':
                result = self._execute_template(config, context)
            elif calc_type == 'function':
                result = self._execute_function(config, context)
            else:
                raise ValueError(f"Unknown calculation type: {calc_type}")
            
            # Store result in context with result_name
            context[result_name] = result
            run.update_context(result_name, result)
            
            return {
                'success': True,
                'result_name': result_name,
                'result_value': result,
                'calculation_type': calc_type,
            }
        
        except Exception as e:
            logger.exception(f"Calculation step failed: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def _execute_formula(self, config: Dict[str, Any], context: Dict[str, Any]) -> Any:
        """
        Execute mathematical formula
        
        Supports:
        - Basic math: +, -, *, /, %, **
        - Functions: sum(), avg(), min(), max(), round(), abs()
        - Variables: ${form.amount}, ${step_xyz.value}
        """
        formula = config.get('formula', '')
        if not formula:
            raise ValueError("formula is required for formula calculation")
        
        # Resolve variables in formula
        resolved_formula = self._resolve_variables(formula, context)
        
        # Evaluate safely
        try:
            result = self._safe_eval_formula(resolved_formula)
            
            # Convert to appropriate type
            result_type = config.get('result_type', 'number')
            if result_type == 'number':
                result = Decimal(str(result))
            elif result_type == 'string':
                result = str(result)
            
            return result
        
        except Exception as e:
            raise ValueError(f"Formula evaluation failed: {str(e)}")
    
    def _execute_template(self, config: Dict[str, Any], context: Dict[str, Any]) -> str:
        """
        Execute string template
        
        Example: "Transaction of ${amount} for ${account_name}"
        """
        template = config.get('template', '')
        if not template:
            raise ValueError("template is required for template calculation")
        
        # Resolve variables in template
        result = self._resolve_variables(template, context)
        
        return str(result)
    
    def _execute_function(self, config: Dict[str, Any], context: Dict[str, Any]) -> Any:
        """
        Execute built-in function
        
        Supported functions:
        - uppercase(text)
        - lowercase(text)
        - trim(text)
        - format_currency(amount)
        - format_date(date)
        - round_2(number)
        - concat(str1, str2, ...)
        """
        function_name = config.get('function')
        if not function_name:
            raise ValueError("function is required for function calculation")
        
        # Get function arguments
        args = config.get('function_args', [])
        resolved_args = [self._resolve_variables(arg, context) for arg in args]
        
        # Execute function
        if function_name == 'uppercase':
            return str(resolved_args[0]).upper() if resolved_args else ''
        
        elif function_name == 'lowercase':
            return str(resolved_args[0]).lower() if resolved_args else ''
        
        elif function_name == 'trim':
            return str(resolved_args[0]).strip() if resolved_args else ''
        
        elif function_name == 'format_currency':
            value = Decimal(str(resolved_args[0])) if resolved_args else Decimal('0')
            return f"{value:,.2f}"
        
        elif function_name == 'format_date':
            # Assumes ISO format input
            if not resolved_args:
                return ''
            date_str = str(resolved_args[0])
            try:
                date_obj = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
                return date_obj.strftime('%Y-%m-%d')
            except:
                return date_str
        
        elif function_name == 'round_2':
            value = Decimal(str(resolved_args[0])) if resolved_args else Decimal('0')
            return round(value, 2)
        
        elif function_name == 'concat':
            return ''.join(str(arg) for arg in resolved_args)
        
        else:
            raise ValueError(f"Unknown function: {function_name}")
    
    def _resolve_variables(self, value: Any, context: Dict[str, Any]) -> Any:
        """
        Resolve ${variable} references from context
        
        Supports:
        - ${form.field_name}
        - ${step_xyz.result}
        - ${calc.variable_name}
        """
        if not isinstance(value, str):
            return value
        
        # Find all ${variable} patterns
        pattern = r'\$\{([^}]+)\}'
        
        def replace_var(match):
            var_path = match.group(1)
            var_value = self._get_variable_value(var_path, context)
            
            if var_value is None:
                logger.warning(f"Variable '{var_path}' not found in context")
                return f"[UNDEFINED: {var_path}]"
            
            return str(var_value)
        
        result = re.sub(pattern, replace_var, value)
        
        # Try to convert to number if it looks like one
        try:
            if '.' in result:
                return Decimal(result)
            else:
                return int(result)
        except (ValueError, Exception):
            return result
    
    def _get_variable_value(self, var_path: str, context: Dict[str, Any]) -> Any:
        """
        Navigate context to get variable value
        
        Example: 'form.amount' -> context['form']['amount']
        """
        parts = var_path.split('.')
        result = context
        
        for part in parts:
            if isinstance(result, dict):
                result = result.get(part)
            else:
                result = getattr(result, part, None)
            
            if result is None:
                return None
        
        return result
    
    def _safe_eval_formula(self, formula: str) -> float:
        """
        Safely evaluate mathematical formula
        
        Uses AST parsing to prevent code injection
        Only allows mathematical operations
        """
        import ast
        import operator as op
        
        # Allowed operations
        operators = {
            ast.Add: op.add,
            ast.Sub: op.sub,
            ast.Mult: op.mul,
            ast.Div: op.truediv,
            ast.Mod: op.mod,
            ast.Pow: op.pow,
            ast.USub: op.neg,
        }
        
        # Allowed functions
        functions = {
            'sum': sum,
            'avg': lambda *args: sum(args) / len(args) if args else 0,
            'min': min,
            'max': max,
            'round': round,
            'abs': abs,
        }
        
        def eval_node(node):
            if isinstance(node, ast.Num):
                return node.n
            elif isinstance(node, ast.BinOp):
                left = eval_node(node.left)
                right = eval_node(node.right)
                return operators[type(node.op)](left, right)
            elif isinstance(node, ast.UnaryOp):
                operand = eval_node(node.operand)
                return operators[type(node.op)](operand)
            elif isinstance(node, ast.Call):
                func_name = node.func.id
                if func_name not in functions:
                    raise ValueError(f"Function '{func_name}' not allowed")
                args = [eval_node(arg) for arg in node.args]
                return functions[func_name](*args)
            else:
                raise ValueError(f"Unsupported operation: {type(node).__name__}")
        
        try:
            # Parse formula
            tree = ast.parse(formula, mode='eval')
            result = eval_node(tree.body)
            return Decimal(str(result))
        
        except SyntaxError as e:
            raise ValueError(f"Invalid formula syntax: {str(e)}")
        except Exception as e:
            raise ValueError(f"Formula evaluation error: {str(e)}")
