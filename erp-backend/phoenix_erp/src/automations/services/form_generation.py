# automations/services/form_generation.py
"""
Complete form and workflow generation service
"""
from typing import List, Dict, Any
import json
import logging

from accounts.models import AccountTransactionPattern, Account
from automations.models import FormSchema, WorkflowTemplate
from clients.models import Client

logger = logging.getLogger(__name__)


class FormGenerationService:
    """
    Generates forms and workflows from AccountTransactionPatterns
    This is the KEY service that makes the system flexible
    """
    
    def generate_form_for_pattern(
        self,
        pattern: AccountTransactionPattern
    ) -> FormSchema:
        """
        Generate comprehensive form schema from pattern
        
        Returns:
            Created FormSchema instance
        """
        fields = []
        
        # 1. Standard transaction fields
        fields.extend(self._generate_standard_fields(pattern))
        
        # 2. Client selection (if applicable)
        if self._requires_client_selection(pattern):
            fields.insert(1, self._generate_client_field(pattern))
        
        # 3. Contra account selection fields
        fields.extend(self._generate_contra_account_fields(pattern))
        
        # 4. Additional custom fields from pattern
        if pattern.additional_fields:
            fields.extend(pattern.additional_fields)
        
        # 5. Conditional fields (approval reasons, etc.)
        fields.extend(self._generate_conditional_fields(pattern))
        
        # 6. Description field (always at the end)
        fields.append({
            'id': 'description',
            'label': 'Description',
            'type': 'textarea',
            'required': False,
            'placeholder': f'Optional description for {pattern.name}',
            'rows': 3
        })
        
        # Create form schema
        form_schema = FormSchema.objects.create(
            owner=pattern.owner,
            branch=pattern.branch,
            created_by=pattern.created_by,
            tenant=pattern.tenant,
            name=pattern.name,
            description=f'Auto-generated form for {pattern.name}',
            trigger_event_name=f'transaction.{pattern.code}',
            schema={
                'fields': fields,
                'validation_rules': pattern.validation_rules,
                'layout': self._generate_smart_layout(fields),
                'conditional_logic': self._extract_conditional_logic(pattern),
                'display_config': pattern.display_config or {}
            }
        )
        
        logger.info(f"Generated form schema for pattern {pattern.code}: {form_schema.id}")
        
        return form_schema
    
    def _generate_standard_fields(self, pattern: AccountTransactionPattern) -> List[Dict]:
        """Generate standard transaction fields"""
        return [
            {
                'id': 'transaction_date',
                'label': 'Transaction Date',
                'type': 'date',
                'defaultValue': 'today',
                'required': True,
                'validation': {
                    'required': True,
                    'max': 'today',  # Can't be future date
                    'message': 'Transaction date is required and cannot be in the future'
                }
            },
            {
                'id': 'amount',
                'label': 'Amount',
                'type': 'money',
                'required': True,
                'validation': pattern.validation_rules.get('amount', {
                    'required': True,
                    'min': 0.01,
                    'message': 'Please enter a valid amount'
                }),
                'helpText': 'Enter transaction amount'
            },
        ]
    
    def _requires_client_selection(self, pattern: AccountTransactionPattern) -> bool:
        """Check if pattern requires client selection"""
        # If account is child account, it's client-specific
        return pattern.account.account_level == Account.LEVEL_CHILD
    
    def _generate_client_field(self, pattern: AccountTransactionPattern) -> Dict:
        """Generate client selection field"""
        return {
            'id': 'client_id',
            'label': 'Client',
            'type': 'select',  # Will be populated by API
            'required': True,
            'validation': {
                'required': True,
                'message': 'Please select a client'
            },
            'config': {
                'endpoint': '/api/clients/',  # Frontend will fetch from here
                'labelField': 'full_name',
                'valueField': 'id',
                'searchable': True,
                'filters': {
                    'status': 'active'
                }
            },
            'helpText': 'Select the client for this transaction'
        }
    
    def _generate_contra_account_fields(self, pattern: AccountTransactionPattern) -> List[Dict]:
        """Generate contra account selection fields"""
        contra_links = list(pattern.contra_account_links.all())
        
        if not contra_links:
            logger.warning(f"Pattern {pattern.code} has no contra accounts configured")
            return []
        
        fields = []
        
        # Group contra accounts by selection criteria
        grouped = {}
        for link in contra_links:
            criteria_key = json.dumps(link.account_selection_criteria, sort_keys=True)
            if criteria_key not in grouped:
                grouped[criteria_key] = []
            grouped[criteria_key].append(link)
        
        if len(grouped) == 1:
            # Single group - one field
            link = contra_links[0]
            fields.append({
                'id': 'contra_account_id',
                'label': link.form_label or 'Account',
                'type': 'account_select',
                'required': True,
                'validation': {
                    'required': True,
                    'message': f'{link.form_label or "Account"} is required'
                },
                'config': {
                    'selection_criteria': link.account_selection_criteria,
                    'default_selection_rule': link.default_selection_rule,
                },
                'helpText': link.help_text or f'Select {link.form_label or "account"}'
            })
        
        else:
            # Multiple groups - cascading selection
            # First: Account type selector
            fields.append({
                'id': 'contra_account_type',
                'label': 'Account Type',
                'type': 'select',
                'required': True,
                'options': [
                    {
                        'value': str(idx),
                        'label': link.form_label
                    }
                    for idx, link in enumerate(contra_links)
                ],
                'validation': {
                    'required': True,
                    'message': 'Please select account type'
                }
            })
            
            # Then: Specific account selector (shows after type selected)
            fields.append({
                'id': 'contra_account_id',
                'label': 'Select Account',
                'type': 'account_select',
                'required': True,
                'visible_when': {
                    'field': 'contra_account_type',
                    'operator': 'is_not_null'
                },
                'config': {
                    'criteria_from_field': 'contra_account_type',
                    'criteria_map': {
                        str(idx): link.account_selection_criteria
                        for idx, link in enumerate(contra_links)
                    }
                },
                'validation': {
                    'required': True,
                    'message': 'Please select an account'
                }
            })
        
        return fields
    
    def _generate_conditional_fields(self, pattern: AccountTransactionPattern) -> List[Dict]:
        """Generate fields that appear based on conditions"""
        conditional_fields = []
        
        # Check if approval is required based on amount
        if pattern.approval_config.get('required'):
            for rule in pattern.approval_config.get('rules', []):
                condition = rule.get('condition', '')
                
                # Parse condition like "amount > 50000"
                if 'amount' in condition:
                    threshold = self._extract_threshold(condition)
                    
                    conditional_fields.append({
                        'id': 'approval_reason',
                        'label': 'Reason for High Amount',
                        'type': 'textarea',
                        'required': True,
                        'visible_when': {
                            'field': 'amount',
                            'operator': '>',
                            'value': threshold
                        },
                        'validation': {
                            'required': True,
                            'minLength': 10,
                            'message': 'Please provide a reason for this high amount transaction'
                        },
                        'helpText': f'Required for transactions above {threshold}'
                    })
        
        return conditional_fields
    
    def _generate_smart_layout(self, fields: List[Dict]) -> Dict:
        """Generate smart form layout"""
        # Group fields into sections
        sections = []
        
        # Section 1: Basic info
        basic_fields = ['transaction_date', 'client_id', 'amount']
        if any(f['id'] in basic_fields for f in fields):
            sections.append({
                'id': 'basic_info',
                'title': 'Basic Information',
                'fields': [f['id'] for f in fields if f['id'] in basic_fields]
            })
        
        # Section 2: Account selection
        account_fields = ['contra_account_type', 'contra_account_id']
        if any(f['id'] in account_fields for f in fields):
            sections.append({
                'id': 'accounts',
                'title': 'Account Details',
                'fields': [f['id'] for f in fields if f['id'] in account_fields]
            })
        
        # Section 3: Additional fields
        additional_ids = [f['id'] for f in fields 
                         if f['id'] not in basic_fields + account_fields + ['description', 'approval_reason']]
        if additional_ids:
            sections.append({
                'id': 'additional',
                'title': 'Additional Information',
                'fields': additional_ids
            })
        
        # Section 4: Notes (always last)
        notes_fields = ['description', 'approval_reason']
        if any(f['id'] in notes_fields for f in fields):
            sections.append({
                'id': 'notes',
                'title': 'Notes',
                'fields': [f['id'] for f in fields if f['id'] in notes_fields],
                'collapsible': True
            })
        
        return {
            'type': 'sections',
            'sections': sections
        }
    
    def _extract_conditional_logic(self, pattern: AccountTransactionPattern) -> List[Dict]:
        """Extract conditional logic from pattern"""
        logic_rules = []
        
        # Add approval-based conditions
        if pattern.approval_config.get('required'):
            for rule in pattern.approval_config.get('rules', []):
                condition = rule.get('condition', '')
                if 'amount' in condition:
                    threshold = self._extract_threshold(condition)
                    logic_rules.append({
                        'when': {
                            'field': 'amount',
                            'operator': '>',
                            'value': threshold
                        },
                        'then': {
                            'show_field': 'approval_reason',
                            'require_field': 'approval_reason'
                        }
                    })
        
        # Add availability conditions
        if pattern.availability_conditions:
            # Could add more complex conditional logic here
            pass
        
        return logic_rules
    
    def _extract_threshold(self, condition_str: str):
        """Extract numeric threshold from condition string"""
        import re
        from decimal import Decimal
        match = re.search(r'[\d.]+', condition_str)
        if match:
            return Decimal(match.group())
        return Decimal('0')
    
    # ================================================================
    # WORKFLOW GENERATION
    # ================================================================
    
    def generate_workflow_for_pattern(
        self,
        pattern: AccountTransactionPattern
    ) -> WorkflowTemplate:
        """
        Generate workflow that processes form submissions
        
        Creates workflow with:
        - Validation
        - Approval (if required)
        - Transaction creation
        - Post-transaction actions
        - Notifications
        """
        steps = []
        step_counter = 0
        
        # 1. Validation step
        validation_step = self._create_validation_step(pattern, step_counter)
        steps.append(validation_step)
        step_counter += 1
        
        # 2. Approval step (if required)
        if pattern.approval_config.get('required'):
            approval_step = self._create_approval_step(pattern, step_counter)
            steps.append(approval_step)
            validation_step['next'] = approval_step['id']
            step_counter += 1
        
        # 3. Transaction creation step
        transaction_step = self._create_transaction_step(pattern, step_counter)
        steps.append(transaction_step)
        
        # Link previous step to transaction
        if pattern.approval_config.get('required'):
            steps[-2]['next'] = transaction_step['id']  # approval -> transaction
        else:
            steps[0]['next'] = transaction_step['id']  # validation -> transaction
        
        step_counter += 1
        
        # 4. Post-transaction actions
        if pattern.post_transaction_actions:
            action_steps = self._create_post_transaction_steps(pattern, step_counter)
            steps.extend(action_steps)
            transaction_step['next'] = action_steps[0]['id']
            step_counter += len(action_steps)
        
        # 5. Notification steps
        notification_steps = self._create_notification_steps(pattern, step_counter)
        steps.extend(notification_steps)
        
        # Link to notifications
        if pattern.post_transaction_actions:
            steps[-len(notification_steps)-len(action_steps)]['next'] = notification_steps[0]['id']
        else:
            transaction_step['next'] = notification_steps[0]['id']
        
        # 6. Error handling step
        error_step = self._create_error_handling_step(pattern, step_counter + len(notification_steps))
        steps.append(error_step)
        
        # Build workflow definition
        workflow_def = {
            'steps': steps,
            'initial_step': steps[0]['id'],
            'error_handling': {
                'on_error': error_step['id'],
                'retry_policy': {
                    'max_attempts': 3,
                    'backoff': 'exponential'
                }
            }
        }
        
        # Create workflow template
        workflow = WorkflowTemplate.objects.create(
            owner=pattern.owner,
            branch=pattern.branch,
            created_by=pattern.created_by,
            tenant=pattern.tenant,
            name=f'Process {pattern.name}',
            description=f'Auto-generated workflow for {pattern.name}',
            trigger_type='event',
            trigger_config={
                'event_name': f'transaction.{pattern.code}',
                'filters': pattern.availability_conditions
            },
            workflow_definition=workflow_def,
            workflow_type='template',
            access_level='internal',
            is_active=True,
            requires_approval=pattern.approval_config.get('required', False),
            approval_config=pattern.approval_config
        )
        
        logger.info(f"Generated workflow for pattern {pattern.code}: {workflow.id}")
        
        return workflow
    
    def _create_validation_step(self, pattern: AccountTransactionPattern, step_num: int) -> Dict:
        """Create validation step"""
        return {
            'id': f'validate_{step_num}',
            'name': 'Validate Transaction Data',
            'type': 'condition',
            'config': {
                'conditions': [
                    {
                        'field': 'form.amount',
                        'operator': '>',
                        'value': 0
                    }
                ],
                'logic': 'AND'
            },
            'on_true': f'next_step_{step_num+1}',  # Will be updated
            'on_false': 'error_handler'
        }
    
    def _create_approval_step(self, pattern: AccountTransactionPattern, step_num: int) -> Dict:
        """Create approval step"""
        return {
            'id': f'approval_{step_num}',
            'name': 'Require Approval',
            'type': 'approval',
            'config': pattern.approval_config,
            'next': f'next_step_{step_num+1}'  # Will be updated
        }
    
    def _create_transaction_step(self, pattern: AccountTransactionPattern, step_num: int) -> Dict:
        """Create transaction creation step"""
        # Determine contra side (opposite of this account's side)
        contra_side = 'CR' if pattern.this_account_side == 'DR' else 'DR'
        
        return {
            'id': f'create_transaction_{step_num}',
            'name': 'Create Transaction',
            'type': 'transaction',
            'config': {
                'transaction_type': 'double_entry',
                'series_code': 'TXN',
                'date': '${form.transaction_date}',
                'description': '${form.description}',
                'entries': [
                    {
                        'account_id': pattern.account.id,
                        'side': pattern.this_account_side,
                        'amount': '${form.amount}'
                    },
                    {
                        'account_id': '${form.contra_account_id}',
                        'side': contra_side,
                        'amount': '${form.amount}'
                    }
                ]
            },
            'next': f'next_step_{step_num+1}'  # Will be updated
        }
    
    def _create_post_transaction_steps(self, pattern: AccountTransactionPattern, start_num: int) -> List[Dict]:
        """Create post-transaction action steps"""
        steps = []
        
        for idx, action in enumerate(pattern.post_transaction_actions):
            action_type = action.get('type')
            step_num = start_num + idx
            
            if action_type == 'update_client_status':
                steps.append({
                    'id': f'update_client_{step_num}',
                    'name': 'Update Client Status',
                    'type': 'update',
                    'config': {
                        'entity': 'Client',
                        'id': '${form.client_id}',
                        'fields': action.get('fields', {})
                    },
                    'next': f'next_step_{step_num+1}'
                })
        
        return steps
    
    def _create_notification_steps(self, pattern: AccountTransactionPattern, start_num: int) -> List[Dict]:
        """Create notification steps"""
        return [
            {
                'id': f'send_confirmation_{start_num}',
                'name': 'Send Transaction Confirmation',
                'type': 'notification',
                'config': {
                    'template_code': 'transaction_receipt',
                    'recipient_source': 'client',
                    'channels': ['sms', 'email'],
                    'context_mapping': {
                        'client_name': '${client.full_name}',
                        'transaction_ref': f'${{step_create_transaction_{start_num-1}.reference_number}}',
                        'amount': '${form.amount}',
                        'balance': f'${{step_create_transaction_{start_num-1}.account_balance}}',
                        'transaction_date': '${form.transaction_date}'
                    }
                },
                'next': None  # End of workflow
            }
        ]
    
    def _create_error_handling_step(self, pattern: AccountTransactionPattern, step_num: int) -> Dict:
        """Create error handling step"""
        return {
            'id': 'error_handler',
            'name': 'Handle Error',
            'type': 'notification',
            'config': {
                'template_code': 'transaction_failed',
                'recipient_source': 'user',
                'channels': ['in_app'],
                'context_mapping': {
                    'error_message': '${workflow_error}',
                    'pattern_name': pattern.name
                }
            },
            'next': None
        }