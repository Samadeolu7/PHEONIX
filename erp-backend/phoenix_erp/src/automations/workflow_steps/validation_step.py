"""
Validation Step Handler
Validates data against schemas and rules
"""
from typing import Dict, Any, List
import logging
import re
from decimal import Decimal

from .base import BaseStepHandler

logger = logging.getLogger(__name__)


class ValidationStepHandler(BaseStepHandler):
    """
    Handle validation steps in workflows
    
    Config:
        - validations: list of validation rules
        - fail_on_error: whether to fail workflow on validation error (default: true)
        - collect_all_errors: collect all errors or stop at first (default: true)
    
    Validation rules:
        - field: variable/field name to validate
        - rules: list of validation rule types
        - message: custom error message (optional)
    
    Example:
        {
            "type": "validation",
            "config": {
                "validations": [
                    {
                        "field": "${form.amount}",
                        "rules": ["required", "numeric", {"min": 0}, {"max": 1000000}],
                        "message": "Amount must be between 0 and 1,000,000"
                    },
                    {
                        "field": "${form.email}",
                        "rules": ["required", "email"],
                        "message": "Valid email is required"
                    }
                ],
                "fail_on_error": true,
                "collect_all_errors": true
            }
        }
    """
    
    def execute(self, step: dict, run, context: dict) -> Dict[str, Any]:
        """Execute validation step"""
        config = step.get('config', {})
        
        try:
            validations = config.get('validations', [])
            fail_on_error = config.get('fail_on_error', True)
            collect_all = config.get('collect_all_errors', True)
            
            if not validations:
                raise ValueError("validations list is required")
            
            errors = []
            
            for validation in validations:
                field_ref = validation.get('field')
                # Support both 'rule' (singular) and 'rules' (plural)
                rules = validation.get('rules') or [validation.get('rule')]
                if not rules or rules == [None]:
                    rules = []
                custom_message = validation.get('message')
                
                # Resolve field value
                # Wrap field_ref in ${} if not already wrapped for proper resolution
                if field_ref and not (field_ref.startswith('${') and field_ref.endswith('}')):
                    field_ref_wrapped = f"${{{field_ref}}}"
                else:
                    field_ref_wrapped = field_ref
                field_value = self._resolve_variable(field_ref_wrapped, context)
                
                # Apply rules
                field_errors = self._validate_field(field_value, rules, field_ref)
                
                if field_errors:
                    if custom_message:
                        errors.append({
                            'field': field_ref,
                            'message': custom_message,
                            'details': field_errors
                        })
                    else:
                        errors.extend([{
                            'field': field_ref,
                            'message': err
                        } for err in field_errors])
                    
                    if not collect_all:
                        break
            
            # Determine success
            success = len(errors) == 0
            
            if not success and fail_on_error:
                return {
                    'success': False,
                    'valid': False,
                    'errors': errors,
                    'error': f"Validation failed with {len(errors)} error(s)"
                }
            
            return {
                'success': True,
                'valid': success,
                'errors': errors if errors else None,
                'validated_count': len(validations)
            }
            
        except Exception as e:
            logger.exception(f"Validation step failed: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def _validate_field(self, value: Any, rules: List, field_name: str) -> List[str]:
        """Validate a single field against rules"""
        errors = []
        
        for rule in rules:
            # Handle string rules
            if isinstance(rule, str):
                error = self._apply_string_rule(value, rule, field_name)
                if error:
                    errors.append(error)
            
            # Handle dict rules (with parameters)
            elif isinstance(rule, dict):
                for rule_name, rule_param in rule.items():
                    error = self._apply_param_rule(value, rule_name, rule_param, field_name)
                    if error:
                        errors.append(error)
        
        return errors
    
    def _apply_string_rule(self, value: Any, rule: str, field_name: str) -> str:
        """Apply string-based validation rule"""
        if rule == 'required':
            if value is None or value == '' or (isinstance(value, str) and not value.strip()):
                return f"{field_name} is required"
        
        elif rule == 'numeric':
            try:
                float(value) if value is not None else None
            except (ValueError, TypeError):
                return f"{field_name} must be numeric"
        
        elif rule == 'integer':
            try:
                int(value) if value is not None else None
            except (ValueError, TypeError):
                return f"{field_name} must be an integer"
        
        elif rule == 'email':
            if value and not re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', str(value)):
                return f"{field_name} must be a valid email"
        
        elif rule == 'url':
            if value and not re.match(r'^https?://', str(value)):
                return f"{field_name} must be a valid URL"
        
        elif rule == 'phone':
            if value and not re.match(r'^\+?[\d\s\-()]+$', str(value)):
                return f"{field_name} must be a valid phone number"
        
        elif rule == 'boolean':
            if not isinstance(value, bool):
                return f"{field_name} must be a boolean"
        
        elif rule == 'string':
            if value is not None and not isinstance(value, str):
                return f"{field_name} must be a string"
        
        elif rule == 'list':
            if value is not None and not isinstance(value, (list, tuple)):
                return f"{field_name} must be a list"
        
        elif rule == 'dict':
            if value is not None and not isinstance(value, dict):
                return f"{field_name} must be a dict"
        
        return None
    
    def _apply_param_rule(self, value: Any, rule: str, param: Any, field_name: str) -> str:
        """Apply parameterized validation rule"""
        if rule == 'min':
            try:
                if value is not None and float(value) < float(param):
                    return f"{field_name} must be at least {param}"
            except (ValueError, TypeError):
                pass
        
        elif rule == 'max':
            try:
                if value is not None and float(value) > float(param):
                    return f"{field_name} must be at most {param}"
            except (ValueError, TypeError):
                pass
        
        elif rule == 'min_length':
            if value is not None and len(str(value)) < param:
                return f"{field_name} must be at least {param} characters"
        
        elif rule == 'max_length':
            if value is not None and len(str(value)) > param:
                return f"{field_name} must be at most {param} characters"
        
        elif rule == 'pattern':
            if value and not re.match(param, str(value)):
                return f"{field_name} does not match required pattern"
        
        elif rule == 'in':
            if value not in param:
                return f"{field_name} must be one of: {', '.join(map(str, param))}"
        
        elif rule == 'not_in':
            if value in param:
                return f"{field_name} must not be one of: {', '.join(map(str, param))}"
        
        return None
