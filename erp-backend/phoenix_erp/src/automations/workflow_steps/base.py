# automations/workflow_steps/base.py
"""
Base class for all workflow step handlers
Provides common functionality for variable resolution, condition evaluation, etc.
"""
from typing import Dict, Any, List
from abc import ABC, abstractmethod
import re
import operator as op
import logging

logger = logging.getLogger(__name__)


class BaseStepHandler(ABC):
    """
    Abstract base class for all step handlers
    
    All step handlers should inherit from this class and implement the execute method
    """
    
    @abstractmethod
    def execute(
        self,
        step_config: Dict[str, Any],
        workflow_run,
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Execute the step
        
        Args:
            step_config: Step configuration from workflow definition
                {
                    'id': 'step_1',
                    'name': 'Step Name',
                    'type': 'step_type',
                    'config': {...},
                    'next': 'next_step_id',
                    'on_error': 'error_handler_step_id'
                }
            workflow_run: WorkflowRun instance
            context: Current workflow context with all variables
                {
                    'form': {...},  # Form submission data
                    'step_step1': {...},  # Previous step results
                    'client': {...},  # Related objects
                    ...
                }
        
        Returns:
            {
                'success': bool,
                'result': Any,  # Step-specific result
                'error': str (if failed),
                'next_step': str (optional - override default next),
                'paused': bool (optional - for approval steps)
            }
        """
        pass
    
    # ================================================================
    # VARIABLE RESOLUTION
    # ================================================================
    
    def _resolve_variable(self, value: Any, context: Dict) -> Any:
        """
        Resolve variable expressions like ${form.amount} or {{form.amount}}
        
        Supports both syntaxes:
        - ${} syntax: ${form.amount}
        - {{}} syntax: {{form.amount}} (Django/Jinja2 style)
        
        Features:
        - Simple variables: ${form.amount} or {{form.amount}}
        - Nested paths: ${client.full_name} or {{client.full_name}}
        - Step results: ${step_create_transaction.reference_number}
        - Template strings: "Amount: ${form.amount}" or "Amount: {{form.amount}}"
        - Expressions: "${form.amount * 1.1}" (only with ${} syntax)
        
        Args:
            value: Value that may contain variable expressions
            context: Context dictionary with all variables
        
        Returns:
            Resolved value
        """
        if not isinstance(value, str):
            return value
        
        # Normalize {{}} to ${} for consistent processing
        normalized_value = value.replace('{{', '${').replace('}}', '}')
        
        # Simple variable or expression: ${variable_name} or ${expr}
        if normalized_value.startswith('${') and normalized_value.endswith('}') and normalized_value.count('${') == 1:
            content = normalized_value[2:-1]  # Remove ${ and }
            
            # Check if it contains operators (expression)
            if any(op in content for op in ['+', '-', '*', '/', '//', '%', '**']):
                return self._evaluate_expression(content, context)
            
            # Simple variable path
            return self._get_nested_value(context, content)
        
        # Template string with multiple variables: "Hello ${name}!" or "Hello {{name}}!"
        elif '${' in normalized_value:
            return self._resolve_template_string(normalized_value, context)
        
        return value
    
    def _evaluate_expression(self, expression: str, context: Dict) -> Any:
        """
        Safely evaluate a simple mathematical expression
        Replaces variables with their values and evaluates
        
        Example: "item.amount * 1.1" with context={'item': {'amount': 100}} -> 110.0
        """
        # Replace variable references with their values
        import re
        pattern = r'\b([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)\b'
        
        def replace_var(match):
            var_path = match.group(1)
            # Skip if it's a number
            if var_path.replace('.', '').isdigit():
                return var_path
            value = self._get_nested_value(context, var_path)
            if value is None:
                return '0'
            return str(value)
        
        expr_str = re.sub(pattern, replace_var, expression)
        
        # Evaluate safely (only allow basic math operators)
        try:
            # Use eval with restricted builtins for safety
            result = eval(expr_str, {"__builtins__": {}}, {})
            return result
        except Exception as e:
            logger.warning(f"Failed to evaluate expression '{expression}': {e}")
            return None
    
    def _resolve_template_string(self, template: str, context: Dict) -> str:
        """
        Resolve template string with multiple variables
        Example: "Amount: ${form.amount}, Client: ${client.name}"
        """
        pattern = r'\$\{([^}]+)\}'
        matches = re.findall(pattern, template)
        result = template
        
        for match in matches:
            var_value = self._get_nested_value(context, match)
            result = result.replace(f'${{{match}}}', str(var_value))
        
        return result
    
    def _resolve_variables(self, obj: Any, context: Dict) -> Any:
        """
        Recursively resolve variables in dict/list structures
        
        Args:
            obj: Object to resolve (dict, list, or primitive)
            context: Context dictionary
        
        Returns:
            Object with all variables resolved
        """
        if isinstance(obj, dict):
            return {k: self._resolve_variables(v, context) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [self._resolve_variables(item, context) for item in obj]
        else:
            return self._resolve_variable(obj, context)
    
    def _get_nested_value(self, data: Dict, path: str) -> Any:
        """
        Get nested value using dot notation
        
        Examples:
            'form.amount' -> data['form']['amount']
            'client.full_name' -> data['client']['full_name']
            'step_1.result.total' -> data['step_1']['result']['total']
        
        Args:
            data: Data dictionary
            path: Dot-separated path
        
        Returns:
            Value at path, or None if not found
        """
        parts = path.split('.')
        value = data
        
        for part in parts:
            if value is None:
                return None
            
            if isinstance(value, dict):
                value = value.get(part)
            elif hasattr(value, part):
                value = getattr(value, part)
                # Call if it's a method/property
                if callable(value):
                    try:
                        value = value()
                    except TypeError:
                        # If method requires args, skip calling
                        pass
            else:
                logger.warning(f"Could not resolve path part '{part}' in path '{path}'")
                return None
        
        return value
    
    # ================================================================
    # CONDITION EVALUATION
    # ================================================================
    
    def _evaluate_condition(self, condition: Dict, context: Dict) -> bool:
        """
        Evaluate a single condition
        
        Condition format:
        {
            'field': 'form.amount',  # or '${form.amount}'
            'operator': '>',
            'value': 1000
        }
        
        Args:
            condition: Condition dictionary
            context: Context dictionary
        
        Returns:
            True if condition is met, False otherwise
        """
        field_path = condition.get('field')
        operator_str = condition.get('operator')
        expected = condition.get('value')
        
        if not field_path or not operator_str:
            logger.error(f"Invalid condition: {condition}")
            return False
        
        # Get actual value from context
        # Handle both formats: 'amount' and '${amount}'
        if not field_path.startswith('${'):
            field_path = f"${{{field_path}}}"
        actual = self._resolve_variable(field_path, context)
        
        # Resolve expected value (in case it's also a variable)
        if isinstance(expected, str) and expected.startswith('${'):
            expected = self._resolve_variable(expected, context)
        
        # Compare - let exceptions propagate so condition step can catch and return error
        return self._compare(actual, operator_str, expected)
    
    def _evaluate_conditions(
        self,
        conditions: List[Dict],
        logic: str,
        context: Dict
    ) -> bool:
        """
        Evaluate multiple conditions with AND/OR logic
        
        Args:
            conditions: List of condition dictionaries
            logic: 'AND' or 'OR'
            context: Context dictionary
        
        Returns:
            True if conditions are met, False otherwise
        """
        if not conditions:
            return True
        
        results = [self._evaluate_condition(cond, context) for cond in conditions]
        
        if logic.upper() == 'AND':
            return all(results)
        elif logic.upper() == 'OR':
            return any(results)
        else:
            logger.error(f"Unknown logic operator: {logic}")
            return False
    
    def _compare(self, actual: Any, operator_str: str, expected: Any) -> bool:
        """
        Compare two values using operator
        
        Supported operators:
        - ==, !=, eq, ne: Equality
        - >, >=, <, <=, gt, gte, lt, lte: Numeric comparison
        - in, not_in: Membership
        - contains: String contains
        - startswith, endswith: String prefix/suffix
        - is_null, is_not_null: Null checks
        - matches: Regex match
        
        Args:
            actual: Actual value
            operator_str: Operator string
            expected: Expected value
        
        Returns:
            Comparison result
        """
        # Normalize operator aliases
        operator_aliases = {
            'eq': '==',
            'ne': '!=',
            'gt': '>',
            'gte': '>=',
            'ge': '>=',
            'lt': '<',
            'lte': '<=',
            'le': '<=',
        }
        operator_str = operator_aliases.get(operator_str, operator_str)
        
        # Operators map
        ops = {
            '==': op.eq,
            '!=': op.ne,
            '>': op.gt,
            '>=': op.ge,
            '<': op.lt,
            '<=': op.le,
            'in': lambda a, b: a in b,
            'not_in': lambda a, b: a not in b,
            'contains': lambda a, b: b in str(a),
            'startswith': lambda a, b: str(a).startswith(str(b)),
            'endswith': lambda a, b: str(a).endswith(str(b)),
            'is_null': lambda a, b: a is None,
            'is_not_null': lambda a, b: a is not None,
            'is_empty': lambda a, b: not a,
            'is_not_empty': lambda a, b: bool(a),
        }
        
        op_func = ops.get(operator_str)
        if not op_func:
            # Log the error and raise - this will be caught by step handlers
            logger.error(f"Invalid operator: {operator_str}. Valid operators: {', '.join(ops.keys())}")
            raise ValueError(f"Invalid operator: {operator_str}. Valid operators: {', '.join(ops.keys())}")
        
        try:
            # Convert to comparable types for numeric operators
            if operator_str in ['>', '>=', '<', '<=']:
                if actual is not None and expected is not None:
                    from decimal import Decimal
                    try:
                        actual = Decimal(str(actual))
                        expected = Decimal(str(expected))
                    except (ValueError, TypeError):
                        # If conversion fails, compare as strings
                        actual = str(actual)
                        expected = str(expected)
            
            # For is_null/is_not_null, expected value is ignored
            if operator_str in ['is_null', 'is_not_null', 'is_empty', 'is_not_empty']:
                return op_func(actual, None)
            
            return op_func(actual, expected)
        
        except Exception as e:
            logger.exception(f"Error comparing {actual} {operator_str} {expected}")
            return False
    
    # ================================================================
    # HELPER METHODS
    # ================================================================
    
    def _extract_threshold(self, condition_str: str) -> float:
        """
        Extract numeric threshold from condition string
        
        Example: "amount > 50000" -> 50000
        
        Args:
            condition_str: Condition string
        
        Returns:
            Extracted number, or 0 if not found
        """
        import re
        match = re.search(r'[\d.]+', condition_str)
        if match:
            return float(match.group())
        return 0
    
    def _safe_get(self, dictionary: Dict, key: str, default: Any = None) -> Any:
        """
        Safely get value from dictionary
        
        Args:
            dictionary: Dictionary to get from
            key: Key to get
            default: Default value if key not found
        
        Returns:
            Value or default
        """
        try:
            return dictionary.get(key, default)
        except (AttributeError, KeyError):
            return default
    
    def _format_value(self, value: Any, format_type: str = 'text') -> str:
        """
        Format value for display
        
        Args:
            value: Value to format
            format_type: Format type (text, currency, date, datetime, percentage)
        
        Returns:
            Formatted string
        """
        if value is None:
            return ''
        
        if format_type == 'currency':
            from decimal import Decimal
            try:
                val = Decimal(str(value))
                return f"₦{val:,.2f}"
            except:
                return str(value)
        
        elif format_type == 'percentage':
            try:
                val = float(value)
                return f"{val:.2f}%"
            except:
                return str(value)
        
        elif format_type == 'date':
            if hasattr(value, 'strftime'):
                return value.strftime('%d %b %Y')
            return str(value)
        
        elif format_type == 'datetime':
            if hasattr(value, 'strftime'):
                return value.strftime('%d %b %Y %I:%M %p')
            return str(value)
        
        else:  # text
            return str(value)
    
    def _build_error_response(self, error: Exception, step_id: str = None) -> Dict:
        """
        Build standardized error response
        
        Args:
            error: Exception that occurred
            step_id: ID of step that failed
        
        Returns:
            Error response dictionary
        """
        error_msg = str(error)
        
        return {
            'success': False,
            'error': error_msg,
            'error_type': error.__class__.__name__,
            'step_id': step_id
        }
    
    def _build_success_response(self, result: Any, next_step: str = None) -> Dict:
        """
        Build standardized success response
        
        Args:
            result: Result data
            next_step: Optional next step override
        
        Returns:
            Success response dictionary
        """
        response = {
            'success': True,
            'result': result
        }
        
        if next_step:
            response['next_step'] = next_step
        
        return response
    
    # ================================================================
    # VALIDATION HELPERS
    # ================================================================
    
    def _validate_required_fields(
        self,
        config: Dict,
        required_fields: List[str],
        step_name: str = 'Step'
    ) -> List[str]:
        """
        Validate that required fields are present in config
        
        Args:
            config: Configuration dictionary
            required_fields: List of required field names
            step_name: Name of step (for error messages)
        
        Returns:
            List of missing fields (empty if all present)
        """
        missing = []
        for field in required_fields:
            if field not in config or config[field] is None:
                missing.append(field)
        
        if missing:
            logger.error(
                f"{step_name} missing required fields: {', '.join(missing)}"
            )
        
        return missing
    
    def _validate_field_type(
        self,
        value: Any,
        expected_type: type,
        field_name: str
    ) -> bool:
        """
        Validate field type
        
        Args:
            value: Value to validate
            expected_type: Expected type
            field_name: Field name (for error messages)
        
        Returns:
            True if valid, False otherwise
        """
        if not isinstance(value, expected_type):
            logger.error(
                f"Field '{field_name}' expected {expected_type.__name__}, "
                f"got {type(value).__name__}"
            )
            return False
        return True
    
    # ================================================================
    # LOGGING HELPERS
    # ================================================================
    
    def _log_step_start(self, step_config: Dict, workflow_run):
        """Log step execution start"""
        logger.info(
            f"Starting step '{step_config.get('id')}' "
            f"(type: {step_config.get('type')}) "
            f"for workflow {workflow_run.run_reference}"
        )
    
    def _log_step_complete(self, step_config: Dict, workflow_run, result: Dict):
        """Log step execution completion"""
        logger.info(
            f"Completed step '{step_config.get('id')}' "
            f"for workflow {workflow_run.run_reference} "
            f"(success: {result.get('success')})"
        )
    
    def _log_step_error(self, step_config: Dict, workflow_run, error: Exception):
        """Log step execution error"""
        logger.error(
            f"Error in step '{step_config.get('id')}' "
            f"for workflow {workflow_run.run_reference}: {error}",
            exc_info=True
        )


class StepExecutionError(Exception):
    """Custom exception for step execution errors"""
    
    def __init__(self, message: str, step_id: str = None, details: Dict = None):
        super().__init__(message)
        self.step_id = step_id
        self.details = details or {}


class ValidationError(Exception):
    """Custom exception for validation errors"""
    
    def __init__(self, message: str, field: str = None, value: Any = None):
        super().__init__(message)
        self.field = field
        self.value = value