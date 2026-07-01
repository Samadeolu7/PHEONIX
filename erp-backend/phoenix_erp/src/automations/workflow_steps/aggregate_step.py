"""
Aggregate Step Handler
Performs aggregate operations on collections (sum, avg, count, etc.)
"""
from typing import Dict, Any, List
from decimal import Decimal, ROUND_HALF_UP
import logging

from .base import BaseStepHandler

logger = logging.getLogger(__name__)


class AggregateStepHandler(BaseStepHandler):
    """
    Handle aggregate operations in workflows
    
    Config:
        - collection: variable name or list to aggregate
        - operations: list of aggregate operations to perform
        - group_by: field to group by (optional)
    
    Operations:
        - sum: sum of numeric values
        - avg: average of numeric values
        - count: count of items
        - min: minimum value
        - max: maximum value
        - distinct_count: count of distinct values
        - first: first item
        - last: last item
    
    Example:
        {
            "type": "aggregate",
            "config": {
                "collection": "${query_result.items}",
                "operations": [
                    {"type": "sum", "field": "amount", "result_name": "total_amount"},
                    {"type": "avg", "field": "amount", "result_name": "avg_amount"},
                    {"type": "count", "result_name": "item_count"}
                ]
            }
        }
    """
    
    def execute(self, step: dict, run, context: dict) -> Dict[str, Any]:
        """Execute aggregate step"""
        config = step.get('config', {})
        
        try:
            # Get collection
            collection_ref = config.get('collection')
            if not collection_ref:
                raise ValueError("collection is required")
            
            collection = self._resolve_variable(collection_ref, context)
            
            if not isinstance(collection, (list, tuple)):
                raise ValueError(f"collection must be a list or tuple, got {type(collection)}")
            
            # Get operations
            operations = config.get('operations', [])
            if not operations:
                raise ValueError("operations list is required")
            
            # Check for grouping
            group_by = config.get('group_by')
            
            if group_by:
                results = self._aggregate_with_grouping(collection, operations, group_by, context, run)
            else:
                results = self._aggregate_simple(collection, operations, context, run)
            
            return {
                'success': True,
                **results
            }
            
        except Exception as e:
            logger.exception(f"Aggregate step failed: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def _aggregate_simple(self, collection: List, operations: List, context: dict, run) -> Dict[str, Any]:
        """Perform aggregate operations without grouping"""
        results = {}
        
        for op in operations:
            op_type = op.get('type')
            field = op.get('field')
            result_name = op.get('result_name', f"{op_type}_result")
            
            # Extract field values if specified
            if field:
                values = [self._get_field_value(item, field) for item in collection]
                # Filter out None values
                values = [v for v in values if v is not None]
            else:
                values = collection
            
            # Perform operation
            if op_type == 'sum':
                numeric_values = [v for v in values if self._is_numeric(v)]
                # Validate that we have numeric values for sum operation
                if field and not numeric_values and values:
                    raise ValueError(f"Cannot calculate sum for field '{field}': no numeric values found")
                result = sum(Decimal(str(v)) for v in numeric_values)
            
            elif op_type == 'avg':
                numeric_values = [Decimal(str(v)) for v in values if self._is_numeric(v)]
                # Validate that we have numeric values for avg operation
                if field and not numeric_values and values:
                    raise ValueError(f"Cannot calculate average for field '{field}': no numeric values found")
                result = (sum(numeric_values) / Decimal(str(len(numeric_values)))).quantize(Decimal('0.000001'), rounding=ROUND_HALF_UP) if numeric_values else Decimal('0')
            
            elif op_type == 'count':
                result = len(collection)
            
            elif op_type == 'min':
                numeric_values = [v for v in values if self._is_numeric(v)]
                result = min(numeric_values) if numeric_values else None
            
            elif op_type == 'max':
                numeric_values = [v for v in values if self._is_numeric(v)]
                result = max(numeric_values) if numeric_values else None
            
            elif op_type == 'distinct_count':
                result = len(set(values))
            
            elif op_type == 'first':
                result = collection[0] if collection else None
            
            elif op_type == 'last':
                result = collection[-1] if collection else None
            
            else:
                raise ValueError(f"Unknown operation type: {op_type}")
            
            results[result_name] = result
            
            # Store in context
            context[result_name] = result
            run.update_context(result_name, result)
        
        return results
    
    def _aggregate_with_grouping(self, collection: List, operations: List, group_by: str, context: dict, run) -> Dict[str, Any]:
        """Perform aggregate operations with grouping"""
        # Group items
        groups = {}
        for item in collection:
            group_value = self._get_field_value(item, group_by)
            if group_value not in groups:
                groups[group_value] = []
            groups[group_value].append(item)
        
        # Aggregate each group
        grouped_results = {}
        for group_value, group_items in groups.items():
            group_results = self._aggregate_simple(group_items, operations, {}, run)
            grouped_results[str(group_value)] = group_results
        
        # Store in context
        result_name = f"grouped_by_{group_by}"
        context[result_name] = grouped_results
        run.update_context(result_name, grouped_results)
        
        return {
            'grouped_results': grouped_results,
            'group_count': len(groups),
            'group_by': group_by
        }
    
    def _get_field_value(self, item: Any, field: str) -> Any:
        """Extract field value from item (supports dot notation)"""
        if isinstance(item, dict):
            # Support dot notation for nested fields
            parts = field.split('.')
            value = item
            for part in parts:
                if isinstance(value, dict):
                    value = value.get(part)
                else:
                    return None
            return value
        else:
            # For objects, use getattr
            try:
                return getattr(item, field)
            except AttributeError:
                return None
    
    def _is_numeric(self, value: Any) -> bool:
        """Check if value is numeric"""
        try:
            Decimal(str(value))
            return True
        except Exception:
            return False
