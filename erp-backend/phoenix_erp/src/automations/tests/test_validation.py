from django.test import TestCase
from automations.validators import WorkflowValidator


class WorkflowValidationTests(TestCase):
    def test_valid_workflow(self):
        workflow_def = {
            'steps': [
                {
                    'id': 'step_1',
                    'name': 'Query Account',
                    'type': 'query',
                    'config': {
                        'entity': 'Account',
                        'filters': [
                            {'field': 'id', 'operator': '==', 'value': '${form.account_id}'}
                        ]
                    },
                    'next': 'step_2'
                },
                {
                    'id': 'step_2',
                    'name': 'Check Balance',
                    'type': 'condition',
                    'config': {
                        'conditions': [
                            {'field': 'step_1.results.0.balance', 'operator': '>=', 'value': '100'}
                        ],
                        'logic': 'AND'
                    },
                    'on_true': 'step_3',
                    'on_false': 'step_4'
                },
                {
                    'id': 'step_3',
                    'name': 'Process Transaction',
                    'type': 'transaction',
                    'config': {
                        'transaction_type': 'debit',
                        'account': '${form.account_id}',
                        'amount': '${form.amount}'
                    }
                },
                {
                    'id': 'step_4',
                    'name': 'Send Error',
                    'type': 'notification',
                    'config': {
                        'type': 'email',
                        'recipient': '${form.user.email}',
                        'message': 'Insufficient balance'
                    }
                }
            ],
            'initial_step': 'step_1'
        }
        
        validator = WorkflowValidator(workflow_def, 'event', {'event_name': 'withdrawal'})
        result = validator.validate()
        
        self.assertTrue(result['valid'])
        self.assertEqual(len(result['errors']), 0)
    
    def test_circular_reference(self):
        workflow_def = {
            'steps': [
                {'id': 'step_1', 'type': 'query', 'config': {}, 'next': 'step_2'},
                {'id': 'step_2', 'type': 'query', 'config': {}, 'next': 'step_1'}
            ],
            'initial_step': 'step_1'
        }
        
        validator = WorkflowValidator(workflow_def, 'manual', {})
        result = validator.validate()
        
        self.assertFalse(result['valid'])
        self.assertTrue(any('circular' in e.lower() for e in result['errors']))
    
    def test_invalid_entity(self):
        workflow_def = {
            'steps': [
                {
                    'id': 'step_1',
                    'type': 'query',
                    'config': {'entity': 'InvalidModel'}
                }
            ],
            'initial_step': 'step_1'
        }
        
        validator = WorkflowValidator(workflow_def, 'manual', {})
        result = validator.validate()
        
        self.assertFalse(result['valid'])
        self.assertTrue(any('not allowed' in e for e in result['errors']))
