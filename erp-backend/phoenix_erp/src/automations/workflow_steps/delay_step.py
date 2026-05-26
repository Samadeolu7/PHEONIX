"""
Delay/Wait Step Handler
Pauses workflow execution for a specified duration
"""
from typing import Dict, Any
from datetime import timedelta
from django.utils import timezone
import logging

from .base import BaseStepHandler

logger = logging.getLogger(__name__)


class DelayStepHandler(BaseStepHandler):
    """
    Handle delay/wait steps in workflows
    
    Config:
        - delay_type: 'duration' | 'until' | 'dynamic'
        - duration: number of seconds to wait (for duration type)
        - duration_unit: 'seconds' | 'minutes' | 'hours' | 'days'
        - until_datetime: ISO datetime string (for until type)
        - until_variable: variable name containing datetime (for dynamic type)
    
    Example:
        {
            "type": "delay",
            "config": {
                "delay_type": "duration",
                "duration": 5,
                "duration_unit": "minutes"
            }
        }
    """
    
    def execute(self, step: dict, run, context: dict) -> Dict[str, Any]:
        """Execute delay step"""
        config = step.get('config', {})
        delay_type = config.get('delay_type', 'duration')
        
        try:
            if delay_type == 'duration':
                return self._handle_duration_delay(config, run, context)
            elif delay_type == 'until':
                return self._handle_until_delay(config, run, context)
            elif delay_type == 'dynamic':
                return self._handle_dynamic_delay(config, run, context)
            else:
                raise ValueError(f"Unknown delay_type: {delay_type}")
                
        except Exception as e:
            logger.exception(f"Delay step failed: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def _handle_duration_delay(self, config: dict, run, context: dict) -> Dict[str, Any]:
        """Handle fixed duration delay"""
        duration = config.get('duration', 0)
        unit = config.get('duration_unit', 'seconds')
        
        # Convert to seconds
        multipliers = {
            'seconds': 1,
            'minutes': 60,
            'hours': 3600,
            'days': 86400
        }
        
        total_seconds = duration * multipliers.get(unit, 1)
        
        # Calculate resume time
        resume_at = timezone.now() + timedelta(seconds=total_seconds)
        
        # Store resume time in run context (metadata field doesn't exist)
        run.context['_resume_at'] = resume_at.isoformat()
        run.status = 'waiting'
        run.save()
        
        return {
            'success': True,
            'paused': True,
            'delay_seconds': total_seconds,
            'resume_at': resume_at.isoformat(),
            'message': f"Workflow paused for {duration} {unit}"
        }
    
    def _handle_until_delay(self, config: dict, run, context: dict) -> Dict[str, Any]:
        """Handle delay until specific datetime"""
        until_str = config.get('until_datetime')
        
        if not until_str:
            raise ValueError("until_datetime is required for 'until' delay type")
        
        # Parse datetime
        from dateutil import parser
        resume_at = parser.parse(until_str)
        
        # Check if already past
        if resume_at <= timezone.now():
            return {
                'success': True,
                'paused': False,
                'message': "Specified time already passed, continuing immediately"
            }
        
        # Store resume time
        
        run.context['_resume_at'] = resume_at.isoformat()
        run.status = 'waiting'
        run.save()
        
        return {
            'success': True,
            'paused': True,
            'resume_at': resume_at.isoformat(),
            'message': f"Workflow paused until {resume_at}"
        }
    
    def _handle_dynamic_delay(self, config: dict, run, context: dict) -> Dict[str, Any]:
        """Handle delay based on variable value"""
        var_name = config.get('until_variable')
        
        if not var_name:
            raise ValueError("until_variable is required for 'dynamic' delay type")
        
        # Resolve variable
        resume_at = self.resolve_variable(var_name, context)
        
        if not resume_at:
            raise ValueError(f"Variable {var_name} not found in context")
        
        # Parse if string
        if isinstance(resume_at, str):
            from dateutil import parser
            resume_at = parser.parse(resume_at)
        
        # Check if already past
        if resume_at <= timezone.now():
            return {
                'success': True,
                'paused': False,
                'message': "Specified time already passed, continuing immediately"
            }
        
        # Store resume time
        
        run.context['_resume_at'] = resume_at.isoformat()
        run.status = 'waiting'
        run.save()
        
        return {
            'success': True,
            'paused': True,
            'resume_at': resume_at.isoformat(),
            'message': f"Workflow paused until {resume_at}"
        }
