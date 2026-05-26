from decimal import Decimal
import logging
from typing import Any, Dict, List, Optional
from django.db import connection
from django.apps import apps
from django.core.exceptions import FieldDoesNotExist

logger = logging.getLogger(__name__)


class QueryEngine:
    """
    Safe query execution engine for workflows.
    Allows workflows to query data dynamically while maintaining security.
    """
    
    # Whitelist of allowed models
    ALLOWED_MODELS = {
        'Account': 'accounts.Account',
        'Transaction': 'transactions.Transaction',
        'User': 'users.User',
        'Product': 'products.Product',
        # Add more as needed
    }
    
    # Whitelist of allowed aggregations
    ALLOWED_AGGREGATIONS = ['sum', 'count', 'avg', 'min', 'max']
    
    @classmethod
    def execute_query(cls, query_config: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute a query based on configuration.
        
        query_config structure:
        {
            "entity": "Account",
            "select": ["id", "balance", "product_type"],
            "where": {"id": "${account_id}", "status": "active"},
            "order_by": "created_at",
            "limit": 10,
            "aggregate": {"balance": "sum"}
        }
        """
        try:
            entity = query_config.get('entity')
            if not entity or entity not in cls.ALLOWED_MODELS:
                raise ValueError(f"Entity '{entity}' not allowed for queries")
            
            # Get the model
            model_path = cls.ALLOWED_MODELS[entity]
            model = apps.get_model(model_path)
            
            # Start with base queryset
            queryset = model.objects.all()
            
            # Apply filters
            where = query_config.get('where', {})
            if where:
                filters = cls._resolve_filters(where, context)
                queryset = queryset.filter(**filters)
            
            # Apply ordering
            order_by = query_config.get('order_by')
            if order_by:
                queryset = queryset.order_by(order_by)
            
            # Apply limit
            limit = query_config.get('limit')
            if limit:
                queryset = queryset[:int(limit)]
            
            # Check if aggregation requested
            aggregate = query_config.get('aggregate')
            if aggregate:
                return cls._execute_aggregation(queryset, aggregate)
            
            # Select specific fields
            select = query_config.get('select', [])
            if select:
                # Validate fields exist
                cls._validate_fields(model, select)
                results = list(queryset.values(*select))
            else:
                # Return all fields
                results = list(queryset.values())
            
            return {
                'success': True,
                'results': results,
                'count': len(results)
            }
            
        except Exception as e:
            logger.exception(f"Query execution failed: {e}")
            return {
                'success': False,
                'error': str(e),
                'results': []
            }
    
    @classmethod
    def _resolve_filters(cls, filters: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Resolve filter values, replacing template variables with context values.
        """
        resolved = {}
        for key, value in filters.items():
            if isinstance(value, str) and value.startswith('${') and value.endswith('}'):
                # Template variable like ${account_id}
                var_name = value[2:-1]
                resolved[key] = cls._get_nested_value(context, var_name)
            else:
                resolved[key] = value
        return resolved
    
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
    
    @classmethod
    def _validate_fields(cls, model, fields: List[str]):
        """Validate that fields exist on the model."""
        for field in fields:
            # Handle related fields like "user__email"
            parts = field.split('__')
            current_model = model
            
            for part in parts[:-1]:
                try:
                    field_obj = current_model._meta.get_field(part)
                    current_model = field_obj.related_model
                except FieldDoesNotExist:
                    raise ValueError(f"Field '{part}' does not exist on {current_model.__name__}")
            
            # Validate final field
            final_field = parts[-1]
            try:
                current_model._meta.get_field(final_field)
            except FieldDoesNotExist:
                raise ValueError(f"Field '{final_field}' does not exist on {current_model.__name__}")
    
    @classmethod
    def _execute_aggregation(cls, queryset, aggregate_config: Dict[str, str]) -> Dict[str, Any]:
        """
        Execute aggregation functions.
        aggregate_config: {"balance": "sum", "id": "count"}
        """
        from django.db.models import Sum, Count, Avg, Min, Max
        
        agg_functions = {
            'sum': Sum,
            'count': Count,
            'avg': Avg,
            'min': Min,
            'max': Max,
        }
        
        aggregations = {}
        for field, func_name in aggregate_config.items():
            if func_name not in cls.ALLOWED_AGGREGATIONS:
                raise ValueError(f"Aggregation '{func_name}' not allowed")
            
            func = agg_functions[func_name]
            agg_key = f"{field}__{func_name}"
            aggregations[agg_key] = func(field)
        
        result = queryset.aggregate(**aggregations)
        
        return {
            'success': True,
            'aggregation': result
        }
