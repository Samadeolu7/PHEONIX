# automations/workflow_steps/http_request.py

from typing import Dict, Any
import requests
import logging
import json

logger = logging.getLogger(__name__)


class HttpRequestStepHandler:
    """
    Handles HTTP requests to external APIs
    
    Features:
    - GET, POST, PUT, DELETE requests
    - Headers and authentication
    - Request body (JSON, form data)
    - Response parsing
    - Error handling and retries
    - Timeout configuration
    """
    
    def execute(self, step: Dict[str, Any], run, context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute HTTP request
        
        Config structure:
        {
            "method": "POST",  # GET, POST, PUT, DELETE, PATCH
            "url": "https://api.example.com/endpoint",
            "headers": {
                "Content-Type": "application/json",
                "Authorization": "Bearer ${api_token}"
            },
            "body": {
                "amount": "${form.amount}",
                "description": "${form.description}"
            },
            "body_type": "json",  # json, form, raw
            "timeout": 30,  # seconds
            "max_retries": 3,
            "retry_on_status": [500, 502, 503],
            "expected_status": 200,  # or [200, 201]
            "parse_response": true,  # Parse JSON response
        }
        """
        config = step['config']
        
        # Resolve variables in config
        resolved_config = self._resolve_variables(config, context)
        
        # Validate required fields
        if not resolved_config.get('url'):
            raise ValueError("url is required for HTTP request step")
        
        method = resolved_config.get('method', 'GET').upper()
        url = resolved_config['url']
        headers = resolved_config.get('headers', {})
        body = resolved_config.get('body')
        timeout = resolved_config.get('timeout', 30)
        max_retries = resolved_config.get('max_retries', 3)
        retry_on_status = resolved_config.get('retry_on_status', [500, 502, 503])
        expected_status = resolved_config.get('expected_status', [200, 201])
        parse_response = resolved_config.get('parse_response', True)
        
        # Ensure expected_status is a list
        if not isinstance(expected_status, list):
            expected_status = [expected_status]
        
        # Execute request with retries
        last_error = None
        for attempt in range(max_retries):
            try:
                logger.info(f"HTTP {method} to {url} (attempt {attempt + 1}/{max_retries})")
                
                response = self._make_request(
                    method=method,
                    url=url,
                    headers=headers,
                    body=body,
                    body_type=resolved_config.get('body_type', 'json'),
                    timeout=timeout
                )
                
                # Check status
                if response.status_code in expected_status:
                    # Success
                    result = self._parse_response(response, parse_response)
                    
                    return {
                        'success': True,
                        'status_code': response.status_code,
                        'headers': dict(response.headers),
                        'response': result,
                        'attempts': attempt + 1,
                    }
                
                # Check if should retry
                if response.status_code in retry_on_status and attempt < max_retries - 1:
                    logger.warning(f"HTTP request failed with status {response.status_code}, retrying...")
                    continue
                
                # Non-retryable error
                return {
                    'success': False,
                    'status_code': response.status_code,
                    'error': f"Unexpected status code: {response.status_code}",
                    'response': response.text[:500],  # First 500 chars
                }
            
            except requests.exceptions.RequestException as e:
                last_error = str(e)
                logger.error(f"HTTP request failed: {last_error}")
                
                if attempt < max_retries - 1:
                    continue
        
        # All retries failed
        return {
            'success': False,
            'error': f"HTTP request failed after {max_retries} attempts: {last_error}",
        }
    
    def _resolve_variables(self, config: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        """Resolve ${variable} references in config"""
        import re
        
        def resolve_value(value):
            if isinstance(value, str) and '${' in value:
                # Find all ${variable} patterns
                pattern = r'\$\{([^}]+)\}'
                
                def replace_var(match):
                    var_path = match.group(1)
                    var_value = self._get_variable_value(var_path, context)
                    
                    if var_value is None:
                        logger.warning(f"Variable '{var_path}' not found in context")
                        return match.group(0)  # Keep original
                    
                    return str(var_value)
                
                return re.sub(pattern, replace_var, value)
            
            elif isinstance(value, dict):
                return {k: resolve_value(v) for k, v in value.items()}
            
            elif isinstance(value, list):
                return [resolve_value(item) for item in value]
            
            return value
        
        return {k: resolve_value(v) for k, v in config.items()}
    
    def _get_variable_value(self, var_path: str, context: Dict[str, Any]) -> Any:
        """Get variable value from context"""
        parts = var_path.split('.')
        value = context
        
        for part in parts:
            if isinstance(value, dict):
                value = value.get(part)
            else:
                value = getattr(value, part, None)
            
            if value is None:
                return None
        
        return value
    
    def _make_request(
        self,
        method: str,
        url: str,
        headers: Dict[str, str],
        body: Any,
        body_type: str,
        timeout: int
    ) -> requests.Response:
        """Make HTTP request"""
        kwargs = {
            'url': url,
            'headers': headers,
            'timeout': timeout,
        }
        
        # Add body for methods that support it
        if method in ['POST', 'PUT', 'PATCH'] and body:
            if body_type == 'json':
                kwargs['json'] = body
            elif body_type == 'form':
                kwargs['data'] = body
            elif body_type == 'raw':
                kwargs['data'] = body
                if 'Content-Type' not in headers:
                    headers['Content-Type'] = 'text/plain'
        
        # Make request
        if method == 'GET':
            response = requests.get(**kwargs)
        elif method == 'POST':
            response = requests.post(**kwargs)
        elif method == 'PUT':
            response = requests.put(**kwargs)
        elif method == 'DELETE':
            response = requests.delete(**kwargs)
        elif method == 'PATCH':
            response = requests.patch(**kwargs)
        else:
            raise ValueError(f"Unsupported HTTP method: {method}")
        
        return response
    
    def _parse_response(self, response: requests.Response, parse_json: bool) -> Any:
        """Parse response"""
        if parse_json:
            try:
                return response.json()
            except ValueError:
                # Not JSON, return text
                return response.text
        else:
            return response.text


# Add to automations/workflow_steps/__init__.py
"""
from .approval import ApprovalStepHandler
from .data_transform import DataTransformStepHandler
from .http_request import HttpRequestStepHandler

__all__ = [
    'ApprovalStepHandler',
    'DataTransformStepHandler', 
    'HttpRequestStepHandler',
]
"""


# Update executor.py to include new handlers
"""
# automations/executor.py

class WorkflowExecutor:
    def __init__(self, run: WorkflowRun):
        self.run = run
        self.template = run.template
        self.context = dict(run.context)
        
        # Initialize all step handlers
        self.step_handlers = {
            'transaction': TransactionStepHandler(),
            'notification': NotificationStepHandler(),
            'condition': ConditionStepHandler(),
            'approval': ApprovalStepHandler(),  # NEW
            'sub_workflow': SubWorkflowStepHandler(),
            'http_request': HttpRequestStepHandler(),  # NEW
            'data_transform': DataTransformStepHandler(),  # NEW
            'query': QueryStepHandler(),
            'calculation': CalculationStepHandler(),
            'update': UpdateStepHandler(),
        }
"""