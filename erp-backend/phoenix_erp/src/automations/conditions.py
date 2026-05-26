import logging
from typing import Any, Dict, Optional
import operator
from decimal import Decimal, InvalidOperation
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


class ConditionEvaluator:
    """
    Evaluates complex conditional logic for workflow branching.
    """
    
    OPERATORS = {
        'equals': operator.eq,
        'not_equals': operator.ne,
        'greater_than': operator.gt,
        'greater_than_or_equal': operator.ge,
        'less_than': operator.lt,
        'less_than_or_equal': operator.le,
        'in': lambda a, b: a in b,
        'not_in': lambda a, b: a not in b,
        'contains': lambda a, b: b in str(a),
        'starts_with': lambda a, b: str(a).startswith(str(b)),
        'ends_with': lambda a, b: str(a).endswith(str(b)),
        'is_null': lambda a, b: a is None,
        'is_not_null': lambda a, b: a is not None,
    }
    
    @classmethod
    def evaluate(cls, condition_config: Dict[str, Any], context: Dict[str, Any]) -> bool:
        """
        Evaluate a condition configuration against context.
        
        condition_config structure:
        {
            "logic": "AND",  # or "OR"
            "conditions": [
                {
                    "field": "days_since_last_withdrawal",
                    "operator": "greater_than",
                    "value": 90,
                    "data_source": "query_result"
                }
            ]
        }
        """
        try:
            logic = condition_config.get('logic', 'AND').upper()
            conditions = condition_config.get('conditions', [])
            
            if not conditions:
                return True
            
            results = []
            for cond in conditions:
                result = cls._evaluate_single_condition(cond, context)
                results.append(result)
            
            if logic == 'AND':
                return all(results)
            elif logic == 'OR':
                return any(results)
            else:
                raise ValueError(f"Unknown logic operator: {logic}")
                
        except Exception as e:
            logger.exception(f"Condition evaluation failed: {e}")
            return False
    
    @classmethod
    def _evaluate_single_condition(cls, condition: Dict[str, Any], context: Dict[str, Any]) -> bool:
        """Evaluate a single condition."""
        field = condition.get('field')
        operator_name = condition.get('operator')
        expected_value = condition.get('value')
        data_source = condition.get('data_source', 'context')
        
        # Get actual value from context
        if data_source and data_source != 'context':
            # Look in specific data source (e.g., query results)
            actual_value = cls._get_nested_value(context, f"{data_source}.{field}")
        else:
            actual_value = cls._get_nested_value(context, field)
        
        # Get operator function
        op_func = cls.OPERATORS.get(operator_name)
        if not op_func:
            raise ValueError(f"Unknown operator: {operator_name}")
        
        # Type coercion for numeric comparisons
        if operator_name in ['greater_than', 'greater_than_or_equal', 'less_than', 'less_than_or_equal']:
            try:
                actual_value = Decimal(str(actual_value)) if actual_value is not None else None
                expected_value = Decimal(str(expected_value))
            except (ValueError, TypeError, InvalidOperation):
                pass
        
        return op_func(actual_value, expected_value)
    
    @classmethod
    def _get_nested_value(cls, data: Dict, path: str) -> Any:
        """Get value from nested dict using dot notation."""
        parts = path.split('.')
        value = data
        for part in parts:
            if isinstance(value, dict):
                value = value.get(part)
            elif isinstance(value, list) and part.isdigit():
                try:
                    value = value[int(part)]
                except IndexError:
                    return None
            else:
                return None
        return value
