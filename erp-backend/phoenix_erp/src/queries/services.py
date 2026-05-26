import sqlparse
from django.db import connection
from .models import SavedQuery


class QueryValidationError(Exception):
    pass


def validate_query(sql_template, allowed_tables):
    """
    Validate a SQL query against allowed tables
    """
    # Parse SQL to get all table references
    parsed = sqlparse.parse(sql_template)[0]
    tables = []
    
    def extract_tables(token):
        if token.is_group():
            for t in token.tokens:
                extract_tables(t)
        elif token.ttype == sqlparse.tokens.Name:
            tables.append(token.value.lower())
    
    for token in parsed.tokens:
        extract_tables(token)
    
    # Check if all referenced tables are allowed
    allowed = set(t.lower() for t in allowed_tables)
    referenced = set(tables)
    
    unauthorized = referenced - allowed
    if unauthorized:
        raise QueryValidationError(
            f"Query references unauthorized tables: {', '.join(unauthorized)}"
        )
    
    return True


def execute_saved_query(query_id, params=None):
    """
    Execute a saved query with parameters
    """
    params = params or {}
    query = SavedQuery.objects.get(id=query_id)
    
    # Validate query
    validate_query(query.sql_template, query.allowed_tables)
    
    # Replace parameters in query
    sql = query.sql_template
    for key, value in params.items():
        placeholder = f"%({key})s"
        if placeholder not in sql:
            raise QueryValidationError(f"Parameter {key} not found in query template")
    
    # Execute query
    with connection.cursor() as cursor:
        cursor.execute(sql, params)
        columns = [col[0] for col in cursor.description]
        return [
            dict(zip(columns, row))
            for row in cursor.fetchall()
        ]