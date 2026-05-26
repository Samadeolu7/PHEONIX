from decimal import Decimal, InvalidOperation
import logging
from typing import Any, Dict
import ast
import operator as op

logger = logging.getLogger(__name__)


class CalculationEngine:
    """
    Safe calculation engine for workflows.
    Supports arithmetic operations with variable substitution.
    """
    
    ALLOWED_OPERATORS = {
        ast.Add: op.add,
        ast.Sub: op.sub,
        ast.Mult: op.mul,
        ast.Div: op.truediv,
        ast.Mod: op.mod,
        ast.Pow: op.pow,
        ast.USub: op.neg,
        ast.UAdd: op.pos,
    }
    
    ALLOWED_FUNCTIONS = {
        'abs': abs,
        'round': round,
        'min': min,
        'max': max,
        'sum': sum,
    }
    
    @classmethod
    def calculate(cls, calculation_config: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute a calculation.
        
        calculation_config structure:
        {
            "formula": "amount * interest_rate / 100",
            "variables": {
                "amount": "account.balance",
                "interest_rate": "product.interest_rate"
            },
            "result_variable": "calculated_interest"
        }
        """
        try:
            formula = calculation_config.get('formula', '')
            variables = calculation_config.get('variables', {})
            result_var = calculation_config.get('result_variable', 'result')
            
            # Resolve variables from context
            resolved_vars = {}
            for var_name, var_path in variables.items():
                value = cls._get_nested_value(context, var_path)
                if value is None:
                    logger.warning(f"Variable '{var_name}' (path: '{var_path}') not found in context")
                    value = 0
                resolved_vars[var_name] = Decimal(str(value))
            
            # Parse and evaluate formula
            result = cls._safe_eval(formula, resolved_vars)
            
            return {
                'success': True,
                result_var: str(result),
                'variables_used': list(resolved_vars.keys())
            }
            
        except Exception as e:
            logger.exception(f"Calculation failed: {e}")
            return {
                'success': False,
                'error': str(e),
                result_var: None
            }
    
    @classmethod
    def _safe_eval(cls, formula: str, variables: Dict[str, Decimal]) -> Decimal:
        """
        Safely evaluate a mathematical formula.
        """
        try:
            tree = ast.parse(formula, mode='eval')
        except SyntaxError as e:
            raise ValueError(f"Invalid formula syntax: {e}")
        
        return cls._eval_node(tree.body, variables)
    
    @classmethod
    def _eval_node(cls, node, variables: Dict[str, Decimal]) -> Decimal:
        """Recursively evaluate AST nodes."""
        if isinstance(node, ast.Constant):
            return Decimal(str(node.value))
        
        elif isinstance(node, ast.Name):
            if node.id not in variables:
                raise ValueError(f"Unknown variable: {node.id}")
            return variables[node.id]
        
        elif isinstance(node, ast.BinOp):
            left = cls._eval_node(node.left, variables)
            right = cls._eval_node(node.right, variables)
            op_func = cls.ALLOWED_OPERATORS.get(type(node.op))
            if not op_func:
                raise ValueError(f"Unsupported operator: {type(node.op).__name__}")
            return Decimal(str(op_func(left, right)))
        
        elif isinstance(node, ast.UnaryOp):
            operand = cls._eval_node(node.operand, variables)
            op_func = cls.ALLOWED_OPERATORS.get(type(node.op))
            if not op_func:
                raise ValueError(f"Unsupported unary operator: {type(node.op).__name__}")
            return Decimal(str(op_func(operand)))
        
        elif isinstance(node, ast.Call):
            if not isinstance(node.func, ast.Name):
                raise ValueError("Only simple function calls allowed")
            
            func_name = node.func.id
            if func_name not in cls.ALLOWED_FUNCTIONS:
                raise ValueError(f"Function not allowed: {func_name}")
            
            args = [cls._eval_node(arg, variables) for arg in node.args]
            return Decimal(str(cls.ALLOWED_FUNCTIONS[func_name](*args)))
        
        else:
            raise ValueError(f"Unsupported expression type: {type(node).__name__}")
    
    @classmethod
    def _get_nested_value(cls, data: Dict, path: str) -> Any:
        """Get value from nested dict using dot notation."""
        parts = path.split('.')
        value = data
        for part in parts:
            if isinstance(value, dict):
                value = value.get(part)
            else:
                return None
        return value
