from django.core.cache import cache
from django.conf import settings
import uuid

def get_widget_data(widget_source, parameters=None):
    """
    Fetch data for a widget based on its data source configuration
    """
    cache_key = f"widget_data:{widget_source.identifier}:{str(parameters)}"
    data = cache.get(cache_key)
    
    if data is None:
        # Execute query based on query_type
        if widget_source.query_type == 'sql':
            data = execute_sql_query(widget_source.query_config['query'], parameters)
        elif widget_source.query_type == 'api':
            data = fetch_api_data(widget_source.query_config['endpoint'], parameters)
        elif widget_source.query_type == 'model':
            data = execute_model_query(widget_source.query_config, parameters)
        
        # Cache the result
        cache.set(cache_key, data, widget_source.cache_duration)
    
    return data

def execute_sql_query(query, parameters=None):
    """
    Execute a SQL query with optional parameters
    """
    from django.db import connection
    
    with connection.cursor() as cursor:
        if parameters:
            cursor.execute(query, parameters)
        else:
            cursor.execute(query)
        
        columns = [col[0] for col in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]

def fetch_api_data(endpoint, parameters=None):
    """
    Fetch data from an external API endpoint
    """
    import requests
    
    response = requests.get(endpoint, params=parameters)
    response.raise_for_status()
    return response.json()

def execute_model_query(config, parameters=None):
    """
    Execute a query on a Django model
    """
    from django.apps import apps
    
    model = apps.get_model(config['app_label'], config['model_name'])
    queryset = model.objects.all()
    
    # Apply filters if specified
    if config.get('filters') and parameters:
        queryset = queryset.filter(**{
            k: parameters[v] for k, v in config['filters'].items()
            if v in parameters
        })
    
    # Apply annotations if specified
    if config.get('annotations'):
        queryset = queryset.annotate(**config['annotations'])
    
    # Apply values if specified
    if config.get('values'):
        queryset = queryset.values(*config['values'])
    
    return list(queryset)

def generate_instance_key():
    """
    Generate a unique instance key for widgets
    """
    return str(uuid.uuid4())