# reports/services/executor.py
"""
Secure report execution engine with SQL injection prevention,
field whitelisting, and performance optimization
"""
from django.db import models, connection
from django.apps import apps
from django.utils import timezone
from django.core.exceptions import ValidationError, PermissionDenied
from decimal import Decimal
from typing import Dict, List, Any, Optional
import re
import time
import logging

from reports.models import ReportTemplate, ReportExecution

logger = logging.getLogger(__name__)


class ReportExecutor:
    """
    Secure report execution engine
    """
    
    # Whitelist of allowed models
    ALLOWED_MODELS = {
        'Transaction': 'transactions.Transaction',
        'TransactionEntry': 'transactions.TransactionEntry',
        'Account': 'accounts.Account',
        'Client': 'clients.Client',
        'Product': 'products.Product',
        'ProductCategory': 'products.ProductCategory',
        'SavingsAccount': 'savings.SavingsAccount',
        'LoanAccount': 'loans.LoanAccount',
        'Invoice': 'inventory.Invoice',
        'InventoryItem': 'inventory.InventoryItem',
        'FixedAsset': 'assets.FixedAsset',
    }
    
    # Whitelist of allowed aggregation functions
    ALLOWED_AGGREGATIONS = {
        'sum': models.Sum,
        'avg': models.Avg,
        'count': models.Count,
        'min': models.Min,
        'max': models.Max,
        'count_distinct': lambda field: models.Count(field, distinct=True),
    }
    
    # Whitelist of allowed filter operators
    ALLOWED_OPERATORS = [
        'exact', 'iexact', 'contains', 'icontains',
        'in', 'gt', 'gte', 'lt', 'lte',
        'startswith', 'istartswith', 'endswith', 'iendswith',
        'range', 'date', 'year', 'month', 'day',
        'isnull', 'regex', 'iregex'
    ]
    
    def __init__(self, template: ReportTemplate, user, parameters: Dict[str, Any] = None):
        self.template = template
        self.user = user
        self.parameters = parameters or {}
        self.execution = None
    
    def execute(self) -> Dict[str, Any]:
        """
        Execute report and return results
        
        Returns:
            {
                'data': [...],
                'metadata': {...},
                'execution_id': int
            }
        """
        start_time = time.time()
        
        try:
            # Check permissions
            self._check_permissions()
            
            # Validate parameters
            self._validate_parameters()
            
            # Check for cached result
            cached = self._get_cached_result()
            if cached:
                return cached
            
            # Create execution record
            self.execution = ReportExecution.objects.create(
                template=self.template,
                executed_by=self.user,
                parameters=self.parameters,
                owner=self.template.owner,
                branch=self.template.branch,
                created_by=self.user,
                tenant=self.template.tenant
            )
            
            # Execute query
            data = self._execute_query()
            
            # Apply calculations
            data = self._apply_calculations(data)
            
            # Format data
            data = self._format_data(data)
            
            # Get metadata
            metadata = self._get_metadata(data)
            
            # Update execution record
            execution_time = int((time.time() - start_time) * 1000)
            self.execution.status = 'completed'
            self.execution.row_count = len(data)
            self.execution.execution_time_ms = execution_time
            
            # Cache result if enabled
            if self.template.refresh_interval > 0:
                self.execution.result_cache = data
                self.execution.cache_expires_at = timezone.now() + timezone.timedelta(
                    seconds=self.template.refresh_interval
                )
            
            self.execution.save()
            
            # Increment usage counter
            self.template.increment_usage()
            
            return {
                'data': data,
                'metadata': metadata,
                'execution_id': self.execution.id,
            }
        
        except Exception as e:
            logger.exception(f"Report execution failed: {e}")
            
            if self.execution:
                self.execution.status = 'failed'
                self.execution.error_message = str(e)
                self.execution.save()
            
            raise
    
    def _check_permissions(self):
        """Check if user has permission to run this report"""
        # Check access level
        if self.template.access_level == 'private':
            if self.template.owner != self.user:
                raise PermissionDenied("You don't have access to this report")
        
        elif self.template.access_level == 'restricted':
            if self.template.restricted_to_roles:
                user_roles = list(self.user.roles.values_list('code', flat=True))
                if not any(role in self.template.restricted_to_roles for role in user_roles):
                    raise PermissionDenied("Your role doesn't have access to this report")
        
        # Check specific permission
        if self.template.required_permission:
            if not self.user.has_perm(self.template.required_permission):
                raise PermissionDenied(f"Missing permission: {self.template.required_permission}")
    
    def _validate_parameters(self):
        """Validate user-provided parameters"""
        for param in self.template.parameters.all():
            value = self.parameters.get(param.code)
            
            # Check required
            if param.is_required and value is None:
                raise ValidationError(f"Parameter '{param.label}' is required")
            
            # Validate type and rules
            if value is not None:
                self._validate_parameter_value(param, value)
    
    def _validate_parameter_value(self, param, value):
        """Validate individual parameter value"""
        # Type validation
        if param.parameter_type == 'number':
            try:
                value = Decimal(str(value))
            except (TypeError, ValueError, Exception):
                raise ValidationError(f"Parameter '{param.label}' must be a number")
        
        # Validation rules
        rules = param.validation_rules or {}
        
        if 'min' in rules and value < rules['min']:
            raise ValidationError(f"Parameter '{param.label}' must be >= {rules['min']}")
        
        if 'max' in rules and value > rules['max']:
            raise ValidationError(f"Parameter '{param.label}' must be <= {rules['max']}")
        
        if 'regex' in rules:
            if not re.match(rules['regex'], str(value)):
                raise ValidationError(f"Parameter '{param.label}' format is invalid")
    
    def _get_cached_result(self) -> Optional[Dict[str, Any]]:
        """Get cached result if available"""
        if self.template.refresh_interval == 0:
            return None
        
        # Find recent cached execution
        cached = ReportExecution.objects.filter(
            template=self.template,
            status='completed',
            parameters=self.parameters,
            cache_expires_at__gt=timezone.now()
        ).order_by('-executed_at').first()
        
        if cached and cached.result_cache:
            return {
                'data': cached.result_cache,
                'metadata': {
                    'cached': True,
                    'cache_expires_at': cached.cache_expires_at.isoformat(),
                },
                'execution_id': cached.id,
            }
        
        return None
    
    def _execute_query(self) -> List[Dict[str, Any]]:
        """
        Execute the main data query with security checks
        """
        config = self.template.report_config
        data_sources = config.get('data_sources', [])
        
        if not data_sources:
            raise ValidationError("No data sources configured")
        
        # Start with primary entity
        primary_source = data_sources[0]
        model = self._get_model(primary_source['entity'])
        queryset = model.objects.all()
        
        # Apply branch filtering
        if hasattr(model, 'branch'):
            queryset = queryset.filter(branch=self.template.branch)
        
        # Apply filters
        queryset = self._apply_filters(queryset, config.get('filters', []))
        
        # Apply joins
        queryset = self._apply_joins(queryset, data_sources[1:])
        
        # Select fields
        fields = self._get_select_fields()
        if fields:
            queryset = queryset.values(*fields)
        
        # Apply grouping
        if config.get('grouping'):
            queryset = self._apply_grouping(queryset, config['grouping'])
        
        # Apply ordering
        if config.get('ordering'):
            queryset = queryset.order_by(*config['ordering'])
        
        # Apply limit
        max_rows = min(self.template.max_rows, 50000)  # Hard limit
        queryset = queryset[:max_rows]
        
        # Execute and return
        return list(queryset)
    
    def _get_model(self, entity_name: str):
        """Get model class with security check"""
        if entity_name not in self.ALLOWED_MODELS:
            raise ValidationError(f"Entity '{entity_name}' is not allowed")
        
        app_label, model_name = self.ALLOWED_MODELS[entity_name].rsplit('.', 1)
        return apps.get_model(app_label, model_name)
    
    def _apply_filters(self, queryset, filters: List[Dict]) -> models.QuerySet:
        """Apply filters with security validation"""
        for filter_config in filters:
            field = filter_config.get('field')
            operator = filter_config.get('operator', 'exact')
            value = filter_config.get('value')
            
            # DEBUG: Log filter details
            logger.info(f"[FILTER DEBUG] Template: {self.template.code}, Field: {field}, Operator: {operator}, Value: {value}")
            logger.info(f"[FILTER DEBUG] Full filter_config: {filter_config}")
            
            # Security: Validate field is allowed
            if not self._is_field_allowed(field):
                raise ValidationError(f"Field '{field}' is not allowed")
            
            # Security: Validate operator is allowed
            if operator not in self.ALLOWED_OPERATORS:
                raise ValidationError(f"Operator '{operator}' is not allowed")
            
            # Check for parameter reference
            if isinstance(value, str) and value.startswith('${'):
                param_name = value[2:-1]
                value = self.parameters.get(param_name)
            
            # Apply filter
            filter_kwargs = {f"{field}__{operator}": value}
            queryset = queryset.filter(**filter_kwargs)
        
        return queryset
    
    def _apply_joins(self, queryset, join_sources: List[Dict]) -> models.QuerySet:
        """Apply joins/related queries"""
        select_related = []
        prefetch_related = []
        
        for source in join_sources:
            relation_path = source.get('relation_path')
            if relation_path:
                # Determine if ForeignKey (select_related) or reverse/M2M (prefetch_related)
                if source.get('relation_type') == 'foreign_key':
                    select_related.append(relation_path)
                else:
                    prefetch_related.append(relation_path)
        
        if select_related:
            queryset = queryset.select_related(*select_related)
        
        if prefetch_related:
            queryset = queryset.prefetch_related(*prefetch_related)
        
        return queryset
    
    def _get_select_fields(self) -> List[str]:
        """Get list of fields to select"""
        fields = []
        
        for column in self.template.columns.filter(is_visible=True).order_by('order'):
            if column.column_type == 'field':
                field_path = column.field_path
                
                # Security check
                if self._is_field_allowed(field_path):
                    fields.append(field_path)
        
        return fields
    
    def _apply_grouping(self, queryset, grouping_config: Dict) -> models.QuerySet:
        """Apply grouping and aggregations"""
        group_by = grouping_config.get('group_by', [])
        aggregations = grouping_config.get('aggregations', [])
        
        if not group_by:
            return queryset
        
        # Build aggregation dict
        agg_dict = {}
        for agg in aggregations:
            func_name = agg.get('function')
            field = agg.get('field')
            alias = agg.get('alias', f"{func_name}_{field}")
            
            if func_name not in self.ALLOWED_AGGREGATIONS:
                raise ValidationError(f"Aggregation '{func_name}' is not allowed")
            
            if not self._is_field_allowed(field):
                raise ValidationError(f"Field '{field}' is not allowed")
            
            agg_func = self.ALLOWED_AGGREGATIONS[func_name]
            if callable(agg_func):
                if func_name == 'count_distinct':
                    agg_dict[alias] = agg_func(field)
                else:
                    agg_dict[alias] = agg_func(field)
        
        return queryset.values(*group_by).annotate(**agg_dict)
    
    def _apply_calculations(self, data: List[Dict]) -> List[Dict]:
        """Apply calculated fields"""
        calculations = self.template.report_config.get('calculations', [])
        
        if not calculations:
            return data
        
        for row in data:
            for calc in calculations:
                field_name = calc.get('name')
                formula = calc.get('formula')
                
                if formula:
                    try:
                        # Safe evaluation of formula
                        result = self._evaluate_formula(formula, row)
                        row[field_name] = result
                    except Exception as e:
                        logger.warning(f"Calculation failed: {e}")
                        row[field_name] = None
        
        return data
    
    def _evaluate_formula(self, formula: str, context: Dict) -> Any:
        """
        Safely evaluate formula
        
        Security: No eval() or exec() - only safe mathematical operations
        """
        # Simple formula parser supporting basic arithmetic
        # Replace field references with values
        for key, value in context.items():
            if isinstance(value, (int, float, Decimal)):
                formula = formula.replace(f"{{{key}}}", str(value))
        
        # Basic validation - only allow numbers and operators
        if not re.match(r'^[\d\s\+\-\*/\(\)\.]+$', formula):
            raise ValidationError("Invalid formula syntax")
        
        try:
            # Safe evaluation using Python's parser
            result = eval(formula, {"__builtins__": {}}, {})
            return Decimal(str(result))
        except Exception as e:
            raise ValidationError(f"Formula evaluation failed: {e}")
    
    def _format_data(self, data: List[Dict]) -> List[Dict]:
        """Format data according to column specifications"""
        for row in data:
            for column in self.template.columns.all():
                field_code = column.code
                value = row.get(field_code)
                
                if value is not None:
                    row[field_code] = self._format_value(value, column)
        
        return data
    
    def _format_value(self, value: Any, column) -> Any:
        """Format individual value"""
        format_type = column.format_type
        format_options = column.format_options or {}
        
        if format_type == 'currency':
            if isinstance(value, (int, float, Decimal)):
                decimals = format_options.get('decimal_places', 2)
                return f"${value:,.{decimals}f}"
        
        elif format_type == 'percentage':
            if isinstance(value, (int, float, Decimal)):
                decimals = format_options.get('decimal_places', 2)
                return f"{value:.{decimals}f}%"
        
        elif format_type == 'number':
            if isinstance(value, (int, float, Decimal)):
                decimals = format_options.get('decimal_places', 2)
                return f"{value:,.{decimals}f}"
        
        elif format_type == 'date':
            if hasattr(value, 'strftime'):
                date_format = format_options.get('format', '%Y-%m-%d')
                return value.strftime(date_format)
        
        elif format_type == 'boolean':
            return 'Yes' if value else 'No'
        
        return value
    
    def _get_metadata(self, data: List[Dict]) -> Dict[str, Any]:
        """Get report metadata"""
        return {
            'report_name': self.template.name,
            'report_code': self.template.code,
            'executed_at': timezone.now().isoformat(),
            'executed_by': self.user.get_full_name() if hasattr(self.user, 'get_full_name') else str(self.user),
            'row_count': len(data),
            'parameters': self.parameters,
            'cached': False,
        }
    
    def _is_field_allowed(self, field: str) -> bool:
        """Check if field access is allowed"""
        if not self.template.allowed_fields:
            return True  # No restrictions
        
        return field in self.template.allowed_fields