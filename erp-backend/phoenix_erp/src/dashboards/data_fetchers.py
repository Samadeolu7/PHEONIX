# dashboards/data_fetchers.py
"""
Flexible data fetching system for widgets
Supports API, workflows, queries, calculations, and static data
"""

from typing import Dict, Any
from django.core.cache import cache
from django.apps import apps
from django.db.models import Count, Sum, Avg, Max, Min, Q
import requests
import json
import re
from datetime import datetime, timedelta


class DataSourceFetcher:
    """Main data fetcher that routes to appropriate handler"""
    
    def __init__(self, data_source):
        self.data_source = data_source
        self.config = data_source.source_config
    
    def fetch(self, context: Dict = None) -> Dict[str, Any]:
        """
        Fetch data from the configured source
        
        Args:
            context: Additional context (user, params, etc.)
        
        Returns:
            Dictionary with data and metadata
        """
        context = context or {}
        
        # Check cache first
        if self.data_source.cache_enabled and self.data_source.cache_duration > 0:
            cache_key = self._get_cache_key(context)
            cached_data = cache.get(cache_key)
            if cached_data:
                return cached_data
        
        # Fetch based on source type
        source_type = self.data_source.source_type
        
        handlers = {
            'api': self._fetch_from_api,
            'workflow': self._fetch_from_workflow,
            'query': self._fetch_from_query,
            'calculation': self._fetch_from_calculation,
            'static': self._fetch_static,
        }
        
        handler = handlers.get(source_type)
        if not handler:
            raise ValueError(f"Unknown source type: {source_type}")
        
        try:
            result = handler(context)
            
            # Add metadata
            result['_metadata'] = {
                'source_id': self.data_source.id,
                'source_name': self.data_source.name,
                'source_type': source_type,
                'fetched_at': datetime.now().isoformat(),
                'cached': False
            }
            
            # Cache result
            if self.data_source.cache_enabled and self.data_source.cache_duration > 0:
                cache_key = self._get_cache_key(context)
                cache.set(cache_key, result, self.data_source.cache_duration)
            
            return result
        
        except Exception as e:
            # Return error state
            return {
                'error': True,
                'error_message': str(e),
                'value': None,
                '_metadata': {
                    'source_id': self.data_source.id,
                    'source_name': self.data_source.name,
                    'source_type': source_type,
                    'fetched_at': datetime.now().isoformat(),
                    'cached': False
                }
            }
    
    def _fetch_from_api(self, context: Dict) -> Dict:
        """Fetch data from API endpoint"""
        endpoint = self.config.get('endpoint')
        method = self.config.get('method', 'GET').upper()
        headers = self.config.get('headers', {})
        params = self.config.get('params', {})
        response_path = self.config.get('response_path')  # JSONPath to extract value
        
        # Build full URL
        from django.conf import settings
        base_url = settings.API_BASE_URL if hasattr(settings, 'API_BASE_URL') else ''
        url = f"{base_url}{endpoint}"
        
        # Add auth header if user in context
        if 'user' in context and hasattr(context['user'], 'auth_token'):
            headers['Authorization'] = f"Bearer {context['user'].auth_token}"
        
        # Make request
        if method == 'GET':
            response = requests.get(url, params=params, headers=headers, timeout=10)
        elif method == 'POST':
            response = requests.post(url, json=params, headers=headers, timeout=10)
        else:
            raise ValueError(f"Unsupported HTTP method: {method}")
        
        response.raise_for_status()
        data = response.json()
        
        # Extract value using JSONPath if specified
        if response_path:
            value = self._extract_value_from_path(data, response_path)
        else:
            value = data
        
        return self._normalize_response(value)
    
    def _fetch_from_workflow(self, context: Dict) -> Dict:
        """Execute workflow and get result"""
        from automations.models import WorkflowTemplate, WorkflowRun
        
        workflow_id = self.config.get('workflow_template_id')
        input_params = self.config.get('input_params', {})
        output_field = self.config.get('output_field')
        
        # Get workflow template
        workflow = WorkflowTemplate.objects.get(id=workflow_id)
        
        # Merge input params with context
        merged_params = {**input_params, **context}
        
        # Execute workflow synchronously (or get latest run)
        use_latest = self.config.get('use_latest_run', True)
        
        if use_latest:
            # Get most recent completed run
            latest_run = WorkflowRun.objects.filter(
                template=workflow,
                status='completed'
            ).order_by('-completed_at').first()
            
            if not latest_run:
                raise ValueError(f"No completed runs found for workflow: {workflow.name}")
            
            result_data = latest_run.result or {}
        else:
            # Execute workflow (synchronous - be careful!)
            from automations.workflow_executor import WorkflowExecutor
            
            run = WorkflowRun.objects.create(
                template=workflow,
                context=merged_params,
                owner=context.get('owner'),
                branch=context.get('branch')
            )
            
            executor = WorkflowExecutor(run)
            success = executor.execute()
            
            if not success:
                raise ValueError(f"Workflow execution failed: {run.error_message}")
            
            result_data = run.result or {}
        
        # Extract specific field if specified
        if output_field:
            value = result_data.get(output_field)
        else:
            value = result_data
        
        return self._normalize_response(value)
    
    def _fetch_from_query(self, context: Dict) -> Dict:
        """Execute database query"""
        model_name = self.config.get('model')
        filters = self.config.get('filters', {})
        aggregation = self.config.get('aggregation')
        ordering = self.config.get('ordering')
        limit = self.config.get('limit')
        
        # Get model
        model = apps.get_model(model_name)
        
        # Build queryset
        queryset = model.objects.all()
        
        # Apply filters
        if filters:
            # Support dynamic context variables in filters
            resolved_filters = self._resolve_variables(filters, context)
            queryset = queryset.filter(**self._build_q_filters(resolved_filters))
        
        # Apply aggregation
        if aggregation:
            agg_funcs = {
                'count': Count,
                'sum': Sum,
                'avg': Avg,
                'max': Max,
                'min': Min,
            }
            
            agg_type = aggregation.get('type', 'count')
            agg_field = aggregation.get('field', 'id')
            
            agg_func = agg_funcs.get(agg_type, Count)
            value = queryset.aggregate(result=agg_func(agg_field))['result']
            
            return {
                'value': value,
                'aggregation': agg_type,
                'field': agg_field,
                'filters': filters
            }
        
        # No aggregation - return queryset data
        if ordering:
            queryset = queryset.order_by(ordering)
        
        if limit:
            queryset = queryset[:limit]
        
        # Convert to list of dicts
        data = list(queryset.values())
        
        return {
            'value': len(data),
            'data': data,
            'count': len(data)
        }
    
    def _fetch_from_calculation(self, context: Dict) -> Dict:
        """Perform calculation using other data sources"""
        formula = self.config.get('formula')
        variables = self.config.get('variables', {})
        
        # Fetch all variable values
        values = {}
        for var_name, var_config in variables.items():
            source_identifier = var_config.get('source')
            
            # Get data source
            from dashboards.models import WidgetDataSource
            source = WidgetDataSource.objects.get(identifier=source_identifier)
            
            # Fetch data
            fetcher = DataSourceFetcher(source)
            result = fetcher.fetch(context)
            
            values[var_name] = result.get('value', 0)
        
        # Replace variables in formula
        calculated_formula = formula
        for var_name, var_value in values.items():
            calculated_formula = calculated_formula.replace(
                f"{{{{{var_name}}}}}",
                str(var_value)
            )
        
        # Safely evaluate (using simple arithmetic only)
        try:
            result = eval(calculated_formula, {"__builtins__": {}}, {})
        except Exception as e:
            raise ValueError(f"Calculation error: {e}")
        
        return {
            'value': result,
            'formula': formula,
            'variables': values,
            'calculated_formula': calculated_formula
        }
    
    def _fetch_static(self, context: Dict) -> Dict:
        """Return static data"""
        return {
            'value': self.config.get('value'),
            'last_updated': self.config.get('last_updated'),
            'static': True
        }
    
    def _normalize_response(self, value) -> Dict:
        """Normalize response to standard format"""
        if isinstance(value, dict):
            return value
        
        return {
            'value': value
        }
    
    def _extract_value_from_path(self, data, path):
        """Extract value from nested dictionary using dot notation"""
        keys = path.split('.')
        value = data
        
        for key in keys:
            if isinstance(value, dict):
                value = value.get(key)
            else:
                return None
        
        return value
    
    def _build_q_filters(self, filters: Dict) -> Q:
        """Build Q object from filter dictionary"""
        q = Q()
        for field, value in filters.items():
            q &= Q(**{field: value})
        return q
    
    def _resolve_variables(self, data, context):
        """Resolve {{variable}} placeholders in data"""
        if isinstance(data, dict):
            return {k: self._resolve_variables(v, context) for k, v in data.items()}
        elif isinstance(data, list):
            return [self._resolve_variables(v, context) for v in data]
        elif isinstance(data, str):
            # Replace {{variable}} with context value
            pattern = r'\{\{(\w+(?:\.\w+)*)\}\}'
            
            def replacer(match):
                var_path = match.group(1)
                return str(self._extract_value_from_path(context, var_path) or match.group(0))
            
            return re.sub(pattern, replacer, data)
        else:
            return data
    
    def _get_cache_key(self, context):
        """Generate cache key"""
        context_str = json.dumps(context, sort_keys=True, default=str)
        import hashlib
        context_hash = hashlib.md5(context_str.encode()).hexdigest()
        return f"widget_data_{self.data_source.id}_{context_hash}"


class DataSourceManager:
    """Helper for managing and querying data sources"""
    
    @staticmethod
    def get_by_identifier(identifier: str):
        """Get data source by identifier"""
        from dashboards.models import WidgetDataSource
        return WidgetDataSource.objects.get(identifier=identifier, is_active=True)
    
    @staticmethod
    def search(query: str, category: str = None):
        """Search data sources"""
        from dashboards.models import WidgetDataSource
        
        qs = WidgetDataSource.objects.filter(is_active=True)
        
        if query:
            qs = qs.filter(
                Q(name__icontains=query) |
                Q(description__icontains=query) |
                Q(tags__contains=[query])
            )
        
        if category:
            qs = qs.filter(category=category)
        
        return qs
    
    @staticmethod
    def get_categories():
        """Get all data source categories"""
        from dashboards.models import WidgetDataSource
        return WidgetDataSource.objects.values_list('category', flat=True).distinct()
    
    @staticmethod
    def invalidate_cache(identifier: str):
        """Invalidate cached data for a data source"""
        from dashboards.models import WidgetDataSource
        source = WidgetDataSource.objects.get(identifier=identifier)
        
        # Delete all cache keys for this source
        pattern = f"widget_data_{source.id}_*"
        cache.delete_pattern(pattern)
    
    @staticmethod
    def bulk_invalidate_cache(identifiers: list):
        """Invalidate multiple data sources"""
        for identifier in identifiers:
            DataSourceManager.invalidate_cache(identifier)