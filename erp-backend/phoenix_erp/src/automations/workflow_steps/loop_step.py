"""
Loop/Iteration Step Handler
Iterates over collections and executes sub-steps
"""
from typing import Dict, Any, List
import logging

from .base import BaseStepHandler

logger = logging.getLogger(__name__)


class LoopStepHandler(BaseStepHandler):
    """
    Handle loop/iteration steps in workflows
    
    Config:
        - collection: variable name or list to iterate over
        - item_variable: name to use for current item in context
        - index_variable: name to use for current index (optional)
        - max_iterations: maximum number of iterations (safety limit)
        - steps: list of steps to execute for each item
        - break_on_error: whether to stop loop on error (default: false)
    
    Example:
        {
            "type": "loop",
            "config": {
                "collection": "${query_result.items}",
                "item_variable": "current_item",
                "index_variable": "index",
                "max_iterations": 100,
                "steps": [
                    {
                        "type": "calculation",
                        "config": {
                            "formula": "${current_item.amount} * 1.1",
                            "result_name": "adjusted_amount"
                        }
                    }
                ]
            }
        }
    """
    
    def execute(self, step: dict, run, context: dict) -> Dict[str, Any]:
        """Execute loop step"""
        config = step.get('config', {})
        
        try:
            # Get collection
            collection_ref = config.get('collection')
            if not collection_ref:
                raise ValueError("collection is required")
            
            collection = self._resolve_variable(collection_ref, context)
            
            if not isinstance(collection, (list, tuple)):
                raise ValueError(f"collection must be a list or tuple, got {type(collection)}")
            
            # Get config
            item_var = config.get('item_variable', 'item')
            index_var = config.get('index_variable', 'index')
            max_iterations = config.get('max_iterations', 1000)
            steps = config.get('steps', [])
            break_on_error = config.get('break_on_error', False)
            result_name = config.get('result_name')
            
            # Validate
            if len(collection) > max_iterations:
                raise ValueError(f"Collection size ({len(collection)}) exceeds max_iterations ({max_iterations})")
            
            if not steps:
                raise ValueError("steps array is required and must not be empty")
            
            # Execute loop
            results = []
            errors = []
            
            for idx, item in enumerate(collection):
                # Create iteration context
                iteration_context = context.copy()
                iteration_context[item_var] = item
                iteration_context[index_var] = idx
                
                iteration_result = {
                    'index': idx,
                    'item': item,
                    'steps': [],
                    'success': True
                }
                
                # Execute steps for this iteration
                step_idx = 0
                while step_idx < len(steps):
                    sub_step = steps[step_idx]
                    try:
                        step_result = self._execute_sub_step(
                            sub_step, 
                            run, 
                            iteration_context
                        )
                        iteration_result['steps'].append(step_result)
                        
                        # Update iteration context with step results
                        # Store result_name values directly in iteration context
                        if step_result.get('success'):
                            step_config = sub_step.get('config', {})
                            result_name_key = step_config.get('result_name')
                            
                            if result_name_key and result_name_key in iteration_context:
                                # Result was already stored in context by the handler
                                pass
                            elif 'result' in step_result:
                                # Fallback: store result directly
                                step_id = sub_step.get('id', f"step_{len(iteration_result['steps'])}")
                                iteration_context[step_id] = step_result['result']
                        
                        # Handle conditional branching within loop
                        if 'next_step' in step_result:
                            # Condition returned next_step - find it in steps array
                            next_step_id = step_result['next_step']
                            if next_step_id:
                                # Find the step with this ID
                                next_idx = None
                                for i, s in enumerate(steps):
                                    if s.get('id') == next_step_id:
                                        next_idx = i
                                        break
                                
                                if next_idx is not None:
                                    step_idx = next_idx
                                    continue
                                else:
                                    # Next step not found in loop steps, end iteration
                                    break
                            else:
                                # No next step, end iteration
                                break
                        elif 'next' in sub_step:
                            # Regular next field - find the step
                            next_step_id = sub_step['next']
                            next_idx = None
                            for i, s in enumerate(steps):
                                if s.get('id') == next_step_id:
                                    next_idx = i
                                    break
                            
                            if next_idx is not None:
                                step_idx = next_idx
                                continue
                            else:
                                # Next step not found, end iteration
                                break
                        else:
                            # No next field, continue to next step in sequence
                            step_idx += 1
                        
                    except Exception as e:
                        logger.error(f"Error in loop iteration {idx}, step {sub_step.get('id')}: {e}")
                        
                        iteration_result['success'] = False
                        iteration_result['error'] = str(e)
                        errors.append({
                            'index': idx,
                            'step': sub_step.get('id'),
                            'error': str(e)
                        })
                        
                        if break_on_error:
                            break
                        else:
                            step_idx += 1
                
                results.append(iteration_result)
                
                # Store the final iteration context for later extraction
                iteration_result['final_context'] = iteration_context.copy()
                
                # Break outer loop if needed
                if break_on_error and not iteration_result['success']:
                    break
            
            # Calculate statistics
            successful = sum(1 for r in results if r['success'])
            failed = len(results) - successful
            
            # Extract processed items from iteration contexts
            # Each iteration has its final_context with all calculated values
            processed_items = []
            for result in results:
                final_ctx = result.get('final_context', {})
                original_item = result.get('item', {})
                
                # Start with original item data if it's a dict
                item_data = original_item.copy() if isinstance(original_item, dict) else {'value': original_item}
                
                # Extract all calculated/result values from the iteration steps
                # Look for result_name keys that were stored during step execution
                for step_info in result.get('steps', []):
                    if step_info.get('success') and 'result_name' in step_info:
                        result_key = step_info['result_name']
                        if result_key in final_ctx:
                            item_data[result_key] = final_ctx[result_key]
                
                # Also check for common calculated fields directly in context
                calculated_fields = [
                    'item_subtotal', 'item_discounted', 'item_tax', 'item_total',
                    'discount_amount', 'tax_amount', 'total_amount'
                ]
                for field in calculated_fields:
                    if field in final_ctx:
                        item_data[field] = final_ctx[field]
                
                processed_items.append(item_data)
            
            # Store results in context with result_name if provided
            if result_name:
                context[result_name] = processed_items
                run.update_context(result_name, processed_items)
            
            return {
                'success': True,
                'iterations': len(results),
                'successful': successful,
                'failed': failed,
                'results': results,
                'processed_items': processed_items,
                'errors': errors if errors else None
            }
            
        except Exception as e:
            logger.exception(f"Loop step failed: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def _execute_sub_step(self, step: dict, run, context: dict) -> Dict[str, Any]:
        """Execute a single step within the loop"""
        step_type = step.get('type')
        
        # Import step handlers dynamically to avoid circular imports
        from . import (
            CalculationStepHandler,
            ConditionStepHandler,
            QueryStepHandler,
            UpdateStepHandler,
            NotificationStepHandler,
            DataTransformStepHandler,
            VariableStepHandler
        )
        
        handlers = {
            'calculation': CalculationStepHandler(),
            'condition': ConditionStepHandler(),
            'query': QueryStepHandler(),
            'update': UpdateStepHandler(),
            'notification': NotificationStepHandler(),
            'data_transform': DataTransformStepHandler(),
            'variable': VariableStepHandler(),
            'set_variable': VariableStepHandler(),
        }
        
        handler = handlers.get(step_type)
        if not handler:
            raise ValueError(f"Unsupported step type in loop: {step_type}")
        
        return handler.execute(step, run, context)
