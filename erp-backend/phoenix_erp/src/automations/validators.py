from typing import Dict, List, Any
from django.apps import apps
import logging

logger = logging.getLogger(__name__)


class WorkflowValidator:
    """
    Enhanced validator with hierarchical account support.
    """
    
    ALLOWED_MODELS = {
        'Account': 'accounts.Account',
        'Transaction': 'transactions.Transaction',
        'TransactionEntry': 'transactions.TransactionEntry',
        'SavingsAccount': 'accounts.SavingsAccount',
        'LoanAccount': 'loans.LoanAccount',
        'Client': 'clients.Client',
    }
    
    ALLOWED_OPERATORS = ['==', '!=', '>', '>=', '<', '<=', 'in', 'contains', 'starts_with', 'ends_with']
    
    def __init__(self, workflow_def: Dict[str, Any], trigger_type: str, trigger_config: Dict):
        self.workflow_def = workflow_def
        self.trigger_type = trigger_type
        self.trigger_config = trigger_config
        self.errors = []
        self.warnings = []
        self.available_vars = self._get_initial_variables()
    
    def validate(self) -> Dict[str, Any]:
        """
        Run all validations and return results.
        """
        self._validate_structure()
        self._validate_steps()
        self._validate_references()
        self._validate_variables()
        steps = self.workflow_def.get('steps', [])
        if not steps:
            self.errors.append("Workflow must have at least one step")
        
        
        return {
            'valid': len(self.errors) == 0,
            'errors': self.errors,
            'warnings': self.warnings,
            'available_variables': self.available_vars
        }
    
    def _get_initial_variables(self) -> List[str]:
        """Get variables available at workflow start based on trigger."""
        variables = ['run_id', 'run_reference', 'timestamp']
        
        if self.trigger_type == 'event':
            event_name = self.trigger_config.get('event_name')
            if event_name:
                # In production, fetch actual form schema from DB
                # For now, return common form fields
                variables.extend([
                    'form.account_id',
                    'form.amount',
                    'form.user.email',
                    'form.user.name'
                ])
        
        return variables
    
    def _validate_structure(self):
        """Validate basic workflow structure."""
        steps = self.workflow_def.get('steps', [])
        initial_step = self.workflow_def.get('initial_step')
        
        if not steps:
            self.errors.append("Workflow must have at least one step")
        
        if not initial_step:
            self.errors.append("Workflow must define an initial step")
        
        # Check for duplicate step IDs
        step_ids = [s['id'] for s in steps]
        if len(step_ids) != len(set(step_ids)):
            self.errors.append("Duplicate step IDs found")
        
        # Check initial step exists
        if initial_step and initial_step not in step_ids:
            self.errors.append(f"Initial step '{initial_step}' not found in steps")
    
    def _validate_steps(self):
        """Validate each step's configuration."""
        steps = self.workflow_def.get('steps', [])
        
        for i, step in enumerate(steps):
            step_id = step.get('id', f'step_{i}')
            step_type = step.get('type')
            config = step.get('config', {})
            
            if not step_type:
                self.errors.append(f"Step '{step_id}': type is required")
                continue
            
            # Validate by type
            if step_type == 'query':
                self._validate_query_step(step_id, config)
            elif step_type == 'condition':
                self._validate_condition_step(step_id, step)
            elif step_type == 'calculation':
                self._validate_calculation_step(step_id, config)
            elif step_type == 'transaction':
                self._validate_transaction_step(step_id, config)
            elif step_type == 'notification':
                self._validate_notification_step(step_id, config)
            else:
                self.warnings.append(f"Step '{step_id}': unknown type '{step_type}'")
    
    def _validate_query_step(self, step_id: str, config: Dict):
        """Validate query step."""
        entity = config.get('entity')
        
        if not entity:
            self.errors.append(f"Query step '{step_id}': entity is required")
            return
        
        if entity not in self.ALLOWED_MODELS:
            self.errors.append(
                f"Query step '{step_id}': entity '{entity}' is not allowed. "
                f"Allowed: {', '.join(self.ALLOWED_MODELS.keys())}"
            )
            return
        
        # Validate filters
        filters = config.get('filters', [])
        model_class = apps.get_model(self.ALLOWED_MODELS[entity])
        
        for filter_item in filters:
            field = filter_item.get('field')
            operator = filter_item.get('operator')
            
            if not field:
                self.errors.append(f"Query step '{step_id}': filter missing field")
                continue
            
            # Check if field exists on model
            try:
                model_class._meta.get_field(field)
            except Exception:
                self.errors.append(
                    f"Query step '{step_id}': field '{field}' does not exist on {entity}"
                )
            
            if operator and operator not in self.ALLOWED_OPERATORS:
                self.errors.append(
                    f"Query step '{step_id}': operator '{operator}' not allowed"
                )
        
        # Add query result to available variables
        self.available_vars.append(f"step_{step_id}.results")
        self.available_vars.append(f"step_{step_id}.count")
    
    def _validate_condition_step(self, step_id: str, step: Dict):
        """Validate condition step."""
        config = step.get('config', {})
        conditions = config.get('conditions', [])
        
        if not conditions:
            self.errors.append(f"Condition step '{step_id}': at least one condition required")
        
        on_true = step.get('on_true')
        on_false = step.get('on_false')
        
        if not on_true and not on_false:
            self.errors.append(
                f"Condition step '{step_id}': must specify at least one of on_true or on_false"
            )
        
        # Validate condition variables
        for cond in conditions:
            field = cond.get('field')
            if field and not self._is_variable_available(field):
                self.warnings.append(
                    f"Condition step '{step_id}': variable '{field}' may not be available"
                )
    
    def _validate_calculation_step(self, step_id: str, config: Dict):
        """Validate calculation step."""
        formula = config.get('formula')
        result_name = config.get('result_name', 'result')
        
        if not formula:
            self.errors.append(f"Calculation step '{step_id}': formula is required")
        
        # Parse formula to find variables
        if formula:
            import re
            var_pattern = r'\b[a-zA-Z_][a-zA-Z0-9_.]*\b'
            variables = re.findall(var_pattern, formula)
            
            for var in variables:
                if var not in ['min', 'max', 'abs', 'round']:  # Allowed functions
                    if not self._is_variable_available(var):
                        self.warnings.append(
                            f"Calculation step '{step_id}': variable '{var}' may not be available"
                        )
        
        # Add result to available variables
        self.available_vars.append(f"step_{step_id}.{result_name}")
    
    def _validate_transaction_step(self, step_id: str, config: Dict):
        """Validate transaction step."""
        tx_type = config.get('transaction_type')
        account = config.get('account')
        amount = config.get('amount')
        
        if tx_type not in ['debit', 'credit']:
            self.errors.append(
                f"Transaction step '{step_id}': transaction_type must be 'debit' or 'credit'"
            )
        
        if not account:
            self.errors.append(f"Transaction step '{step_id}': account is required")
        
        if not amount:
            self.errors.append(f"Transaction step '{step_id}': amount is required")
        
        # Add transaction result to available variables
        self.available_vars.append(f"step_{step_id}.transaction_id")
        self.available_vars.append(f"step_{step_id}.status")
    
    def _validate_notification_step(self, step_id: str, config: Dict):
        """Validate notification step."""
        notif_type = config.get('type')
        recipient = config.get('recipient')
        message = config.get('message')
        
        if notif_type not in ['email', 'sms', 'in_app']:
            self.errors.append(
                f"Notification step '{step_id}': type must be email, sms, or in_app"
            )
        
        if not recipient:
            self.errors.append(f"Notification step '{step_id}': recipient is required")
        
        if not message:
            self.errors.append(f"Notification step '{step_id}': message is required")
    
    def _validate_references(self):
        """Validate step references (next, on_true, on_false)."""
        steps = self.workflow_def.get('steps', [])
        step_ids = {s['id'] for s in steps}
        
        for step in steps:
            step_id = step['id']
            
            # Check next reference
            next_step = step.get('next')
            if next_step and next_step not in step_ids:
                self.errors.append(
                    f"Step '{step_id}': references non-existent next step '{next_step}'"
                )
            
            # Check condition branches
            on_true = step.get('on_true')
            if on_true and on_true not in step_ids:
                self.errors.append(
                    f"Step '{step_id}': references non-existent on_true step '{on_true}'"
                )
            
            on_false = step.get('on_false')
            if on_false and on_false not in step_ids:
                self.errors.append(
                    f"Step '{step_id}': references non-existent on_false step '{on_false}'"
                )
    
    def _validate_variables(self):
        """Validate variable usage across workflow."""
        # Check for circular references
        steps = self.workflow_def.get('steps', [])
        visited = set()
        
        def check_circular(step_id: str, path: List[str]):
            if step_id in path:
                self.errors.append(
                    f"Circular reference detected: {' -> '.join(path + [step_id])}"
                )
                return
            
            if step_id in visited:
                return
            
            visited.add(step_id)
            step = next((s for s in steps if s['id'] == step_id), None)
            
            if not step:
                return
            
            # Follow next steps
            next_steps = []
            if step.get('next'):
                next_steps.append(step['next'])
            if step.get('on_true'):
                next_steps.append(step['on_true'])
            if step.get('on_false'):
                next_steps.append(step['on_false'])
            
            for next_step in next_steps:
                check_circular(next_step, path + [step_id])
        
        initial = self.workflow_def.get('initial_step')
        if initial:
            check_circular(initial, [])
    
    def _is_variable_available(self, var_path: str) -> bool:
        """Check if a variable is available in current context."""
        return any(var_path.startswith(v) for v in self.available_vars)


