"""
Filter and Map Step Handlers
Transform collections using filter and map operations
"""
from typing import Dict, Any, List
import logging

from .base import BaseStepHandler

logger = logging.getLogger(__name__)


class FilterStepHandler(BaseStepHandler):
    """
    Handle filter operations in workflows
    
    Config:
        - collection: variable name or list to filter
        - conditions: list of filter conditions
        - logic: 'AND' | 'OR' (default: 'AND')
        - result_variable: name to store filtered result
    
    Example:
        {
            "type": "filter",
            "config": {
                "collection": "${query_result.items}",
                "conditions": [
                    {"field": "amount", "operator": "gt", "value": 1000},
                    {"field": "status", "operator": "eq", "value": "active"}
                ],
                "logic": "AND",
                "result_variable": "filtered_items"
            }
        }
    """
    
    def execute(self, step: dict, run, context: dict) -> Dict[str, Any]:
        """Execute filter step"""
        config = step.get('config', {})
        
        try:
            # Get collection
            collection_ref = config.get('collection')
            if not collection_ref:
                raise ValueError("collection is required")
            
            collection = self._resolve_variable(collection_ref, context)
            
            if not isinstance(collection, (list, tuple)):
                raise ValueError(f"collection must be a list or tuple, got {type(collection)}")
            
            # Get filter config
            conditions = config.get('conditions', [])
            if not conditions:
                raise ValueError("conditions list is required")
            
            logic = config.get('logic', 'AND').upper()
            result_var = config.get('result_variable', 'filtered_result')
            
            # Filter items
            filtered = []
            for item in collection:
                if self._matches_conditions(item, conditions, logic):
                    filtered.append(item)
            
            # Store result
            context[result_var] = filtered
            run.update_context(result_var, filtered)
            
            return {
                'success': True,
                'original_count': len(collection),
                'filtered_count': len(filtered),
                'result_variable': result_var,
                'items': filtered
            }
            
        except Exception as e:
            logger.exception(f"Filter step failed: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def _matches_conditions(self, item: Any, conditions: List, logic: str) -> bool:
        """Check if item matches filter conditions"""
        results = []
        
        for condition in conditions:
            field = condition.get('field')
            operator = condition.get('operator', 'eq')
            compare_value = condition.get('value')
            
            # Get field value
            if isinstance(item, dict):
                item_value = item.get(field)
            else:
                try:
                    item_value = getattr(item, field)
                except AttributeError:
                    item_value = None
            
            # Apply operator
            match = self._apply_operator(item_value, operator, compare_value)
            results.append(match)
        
        # Apply logic
        if logic == 'AND':
            return all(results)
        elif logic == 'OR':
            return any(results)
        else:
            raise ValueError(f"Unknown logic: {logic}")
    
    def _apply_operator(self, value: Any, operator: str, compare_value: Any) -> bool:
        """Apply comparison operator"""
        try:
            if operator == 'eq':
                return value == compare_value
            elif operator == 'ne':
                return value != compare_value
            elif operator == 'gt':
                return value > compare_value
            elif operator == 'gte':
                return value >= compare_value
            elif operator == 'lt':
                return value < compare_value
            elif operator == 'lte':
                return value <= compare_value
            elif operator == 'in':
                return value in compare_value
            elif operator == 'not_in':
                return value not in compare_value
            elif operator == 'contains':
                return compare_value in str(value)
            elif operator == 'not_contains':
                return compare_value not in str(value)
            elif operator == 'startswith':
                return str(value).startswith(str(compare_value))
            elif operator == 'endswith':
                return str(value).endswith(str(compare_value))
            elif operator == 'is_null':
                return value is None
            elif operator == 'is_not_null':
                return value is not None
            else:
                raise ValueError(f"Unknown operator: {operator}")
        except Exception:
            return False


class MapStepHandler(BaseStepHandler):
    """
    Handle map/transform operations in workflows
    
    Config:
        - collection: variable name or list to map
        - transform: transformation to apply to each item
        - result_variable: name to store mapped result
    
    Example:
        {
            "type": "map",
            "config": {
                "collection": "${query_result.items}",
                "transform": {
                    "id": "${item.id}",
                    "amount_with_tax": "${item.amount * 1.1}",
                    "display_name": "${item.first_name} ${item.last_name}"
                },
                "result_variable": "transformed_items"
            }
        }
    """
    
    def execute(self, step: dict, run, context: dict) -> Dict[str, Any]:
        """Execute map step"""
        config = step.get('config', {})
        
        try:
            # Get collection
            collection_ref = config.get('collection')
            if not collection_ref:
                raise ValueError("collection is required")
            
            collection = self._resolve_variable(collection_ref, context)
            
            if not isinstance(collection, (list, tuple)):
                raise ValueError(f"collection must be a list or tuple, got {type(collection)}")
            
            # Get transform config (support both 'transform' and 'transformations')
            transform = config.get('transform') or config.get('transformations', {})
            if not transform:
                raise ValueError("transform dict is required")
            
            result_var = config.get('result_variable', 'mapped_result')
            
            # Transform items
            transformed = []
            for item in collection:
                # Create item context
                item_context = context.copy()
                item_context['item'] = item
                
                # Apply transformation
                transformed_item = {}
                for key, value_template in transform.items():
                    # Always use _resolve_variable which handles both single vars and templates
                    transformed_item[key] = self._resolve_variable(value_template, item_context)
                
                transformed.append(transformed_item)
            
            # Store result
            context[result_var] = transformed
            run.update_context(result_var, transformed)
            
            return {
                'success': True,
                'item_count': len(transformed),
                'result_variable': result_var,
                'items': transformed
            }
            
        except Exception as e:
            logger.exception(f"Map step failed: {e}")
            return {
                'success': False,
                'error': str(e)
            }
