"""Services for widget data handling."""
from datetime import datetime
from django.utils import timezone
from django.core.cache import cache
from queries.services import execute_saved_query
from .models import WidgetInstance

class WidgetDataService:
    """Service class to handle widget data generation and caching."""
    
    @staticmethod
    def get_widget_data(instance_id, refresh=False):
        """Get widget data from cache or generate if needed."""
        cache_key = f'widget_data_{instance_id}'
        data = None if refresh else cache.get(cache_key)
        
        if data is None:
            instance = WidgetInstance.objects.get(id=instance_id)
            data = WidgetDataService._generate_widget_data(instance)
            cache_timeout = instance.refresh_interval or instance.definition.refresh_interval
            if cache_timeout:
                cache.set(cache_key, data, timeout=cache_timeout)
        
        return data

    @staticmethod
    def _generate_widget_data(instance):
        """Generate data for a widget instance based on its type and config."""
        try:
            config = {
                **instance.definition.default_config,
                **instance.configuration
            }
            
            # Update last refresh time
            instance.last_refresh = timezone.now()
            instance.save(update_fields=['last_refresh'])

            # Get data based on widget type
            generators = {
                'query': WidgetDataService._generate_query_data,
                'metric': WidgetDataService._generate_metric_data,
                'chart': WidgetDataService._generate_chart_data,
                'table': WidgetDataService._generate_table_data,
            }
            
            generator = generators.get(
                instance.definition.code.split('_')[0], 
                WidgetDataService._generate_default_data
            )
            return generator(config)
            
        except Exception as e:
            return {
                'error': str(e),
                'timestamp': timezone.now().isoformat()
            }

    @staticmethod
    def _generate_query_data(config):
        """Generate data from a saved query."""
        query_id = config.get('query_id')
        parameters = config.get('parameters', {})
        if not query_id:
            raise ValueError("Query widget requires query_id")
        return execute_saved_query(query_id, parameters)

    @staticmethod
    def _generate_metric_data(config):
        """Generate metric data."""
        # TODO: Implement metric data generation
        return {
            'value': 0,
            'trend': 0,
            'timestamp': timezone.now().isoformat()
        }

    @staticmethod
    def _generate_chart_data(config):
        """Generate chart data."""
        # TODO: Implement chart data generation
        return {
            'labels': [],
            'datasets': [],
            'timestamp': timezone.now().isoformat()
        }

    @staticmethod
    def _generate_table_data(config):
        """Generate table data."""
        # TODO: Implement table data generation
        return {
            'columns': [],
            'rows': [],
            'timestamp': timezone.now().isoformat()
        }

    @staticmethod
    def _generate_default_data(config):
        """Generate default data for unknown widget types."""
        return {
            'message': 'Data generation not implemented for this widget type',
            'timestamp': timezone.now().isoformat()
        }
        #     **widget_instance.config
        # }
        
        # # If widget uses a saved query
        # if query_id := config.get('query_id'):
        #     return WidgetDataService._handle_query_data(
        #         query_id,
        #         config.get('query_params', {}),
        #         widget_instance.widget_def.widget_type
        #     )
        
        # # If widget uses static data
        # return config.get('static_data', {})
    
    @staticmethod
    def _handle_query_data(query_id, params, widget_type):
        """
        Execute a saved query and format its results for the widget type
        """
        raw_data = execute_saved_query(query_id, params)
        
        if widget_type == 'kpi':
            return WidgetDataService._format_kpi_data(raw_data)
        elif widget_type in ['line_chart', 'bar_chart']:
            return WidgetDataService._format_chart_data(raw_data)
        elif widget_type == 'table':
            return WidgetDataService._format_table_data(raw_data)
        
        return raw_data
    
    @staticmethod
    def _format_kpi_data(raw_data):
        """Format raw data for KPI widget"""
        if not raw_data:
            return {'value': 0}
        
        row = raw_data[0]
        return {
            'value': next(iter(row.values())),
            'metadata': row
        }
    
    @staticmethod
    def _format_chart_data(raw_data):
        """Format raw data for chart widgets"""
        if not raw_data:
            return {'labels': [], 'datasets': []}
        
        # Assume first column is labels, rest are datasets
        columns = list(raw_data[0].keys())
        labels = [row[columns[0]] for row in raw_data]
        
        datasets = []
        for col in columns[1:]:
            datasets.append({
                'label': col,
                'data': [row[col] for row in raw_data]
            })
        
        return {
            'labels': labels,
            'datasets': datasets
        }
    
    @staticmethod
    def _format_table_data(raw_data):
        """Format raw data for table widget"""
        if not raw_data:
            return {'headers': [], 'rows': []}
        
        return {
            'headers': list(raw_data[0].keys()),
            'rows': [list(row.values()) for row in raw_data]
        }