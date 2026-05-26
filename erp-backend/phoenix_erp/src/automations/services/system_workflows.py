SYSTEM_WORKFLOWS = {
    'post_balanced_transaction': {
        'name': 'Post Balanced Transaction',
        'description': 'Posts a debit and credit transaction ensuring the books remain balanced',
        'workflow_type': 'system',
        'access_level': 'internal',
        'category': 'Financial Operations',
        'is_atomic': True,
        'is_locked': True,
        'max_execution_time_seconds': 30,
        'version': 1,
        
        'required_inputs': [
            {
                'name': 'debit_account_id',
                'type': 'string',
                'description': 'Account to debit from',
                'validation': 'required'
            },
            {
                'name': 'credit_account_id',
                'type': 'string',
                'description': 'Account to credit to',
                'validation': 'required'
            },
            {
                'name': 'amount',
                'type': 'number',
                'description': 'Transaction amount (must be positive)',
                'validation': 'amount > 0'
            },
            {
                'name': 'description',
                'type': 'string',
                'description': 'Transaction description',
                'validation': 'required'
            },
        ],
        
        'outputs': [
            {
                'name': 'debit_transaction_id',
                'type': 'string',
                'description': 'ID of the debit transaction created'
            },
            {
                'name': 'credit_transaction_id',
                'type': 'string',
                'description': 'ID of the credit transaction created'
            },
            {
                'name': 'balanced',
                'type': 'boolean',
                'description': 'Whether the transaction is balanced'
            },
            {
                'name': 'debit_balance',
                'type': 'number',
                'description': 'Updated balance of debit account'
            },
            {
                'name': 'credit_balance',
                'type': 'number',
                'description': 'Updated balance of credit account'
            },
        ],
        
        'workflow_definition': {
            'steps': [
                {
                    'id': 'validate_accounts',
                    'name': 'Validate Accounts',
                    'type': 'query',
                    'config': {
                        'entity': 'Account',
                        'filters': [
                            {
                                'field': 'id',
                                'operator': 'in',
                                'value': ['${debit_account_id}', '${credit_account_id}']
                            },
                            {
                                'field': 'status',
                                'operator': '==',
                                'value': 'ACTIVE'
                            }
                        ]
                    },
                    'next': 'check_accounts_exist'
                },
                {
                    'id': 'check_accounts_exist',
                    'name': 'Check Accounts Exist',
                    'type': 'condition',
                    'config': {
                        'conditions': [
                            {
                                'field': 'validate_accounts.count',
                                'operator': '==',
                                'compare_to': '2'
                            }
                        ],
                        'on_true': 'create_debit',
                        'on_false': 'fail_invalid_accounts'
                    }
                },
                {
                    'id': 'fail_invalid_accounts',
                    'name': 'Fail: Invalid Accounts',
                    'type': 'terminate',
                    'config': {
                        'status': 'INVALID_ACCOUNTS',
                        'error': 'One or both accounts are invalid or inactive'
                    }
                },
                {
                    'id': 'create_debit',
                    'name': 'Create Debit Transaction',
                    'type': 'transaction',
                    'config': {
                        'transaction_type': 'DEBIT',
                        'account_id': '${debit_account_id}',
                        'amount': '-${amount}',
                        'description': '${description}',
                        'metadata': {
                            'paired_with': 'pending',
                            'workflow_execution_id': '${execution_id}'
                        }
                    },
                    'next': 'create_credit'
                },
                {
                    'id': 'create_credit',
                    'name': 'Create Credit Transaction',
                    'type': 'transaction',
                    'config': {
                        'transaction_type': 'CREDIT',
                        'account_id': '${credit_account_id}',
                        'amount': '${amount}',
                        'description': '${description}',
                        'metadata': {
                            'paired_with': '${create_debit.transaction_id}',
                            'workflow_execution_id': '${execution_id}'
                        }
                    },
                    'next': 'verify_balance'
                },
                {
                    'id': 'verify_balance',
                    'name': 'Verify Balance',
                    'type': 'calculation',
                    'config': {
                        'formula': '${create_debit.amount} + ${create_credit.amount}',
                        'result_name': 'net_balance'
                    },
                    'next': 'check_balance'
                },
                {
                    'id': 'check_balance',
                    'name': 'Check Balance is Zero',
                    'type': 'condition',
                    'config': {
                        'conditions': [
                            {
                                'field': 'verify_balance.net_balance',
                                'operator': '==',
                                'compare_to': '0'
                            }
                        ],
                        'on_true': 'success',
                        'on_false': 'rollback_transactions'
                    }
                },
                {
                    'id': 'rollback_transactions',
                    'name': 'Rollback Transactions',
                    'type': 'rollback',
                    'config': {
                        'transaction_ids': [
                            '${create_debit.transaction_id}',
                            '${create_credit.transaction_id}'
                        ]
                    },
                    'next': 'fail_unbalanced'
                },
                {
                    'id': 'fail_unbalanced',
                    'name': 'Fail: Unbalanced',
                    'type': 'terminate',
                    'config': {
                        'status': 'UNBALANCED',
                        'error': 'Transactions do not balance - rolled back'
                    }
                },
                {
                    'id': 'success',
                    'name': 'Success',
                    'type': 'terminate',
                    'config': {
                        'status': 'SUCCESS',
                        'output': {
                            'debit_transaction_id': '${create_debit.transaction_id}',
                            'credit_transaction_id': '${create_credit.transaction_id}',
                            'balanced': True,
                            'debit_balance': '${create_debit.new_balance}',
                            'credit_balance': '${create_credit.new_balance}'
                        }
                    }
                }
            ],
            'initial_step': 'validate_accounts'
        }
    },
    
    'reverse_transaction': {
        'name': 'Reverse Transaction',
        'description': 'Reverses a transaction by creating offsetting entries',
        'workflow_type': 'system',
        'access_level': 'internal',
        'category': 'Financial Operations',
        'is_atomic': True,
        'is_locked': True,
        'max_execution_time_seconds': 30,
        'version': 1,
        
        'required_inputs': [
            {
                'name': 'transaction_id',
                'type': 'string',
                'description': 'ID of transaction to reverse',
                'validation': 'required'
            },
            {
                'name': 'reason',
                'type': 'string',
                'description': 'Reason for reversal',
                'validation': 'required'
            },
        ],
        
        'outputs': [
            {
                'name': 'reversal_transaction_id',
                'type': 'string',
                'description': 'ID of the reversal transaction'
            },
            {
                'name': 'original_transaction_id',
                'type': 'string',
                'description': 'ID of the original transaction'
            },
            {
                'name': 'success',
                'type': 'boolean',
                'description': 'Whether reversal was successful'
            },
            {
                'name': 'reversal_amount',
                'type': 'number',
                'description': 'Amount reversed'
            },
        ],
        
        'workflow_definition': {
            'steps': [
                {
                    'id': 'fetch_original',
                    'name': 'Fetch Original Transaction',
                    'type': 'query',
                    'config': {
                        'entity': 'Transaction',
                        'filters': [
                            {
                                'field': 'id',
                                'operator': '==',
                                'value': '${transaction_id}'
                            }
                        ]
                    },
                    'next': 'validate_transaction'
                },
                {
                    'id': 'validate_transaction',
                    'name': 'Validate Transaction',
                    'type': 'condition',
                    'config': {
                        'conditions': [
                            {
                                'field': 'fetch_original.count',
                                'operator': '==',
                                'compare_to': '1'
                            },
                            {
                                'field': 'fetch_original.results[0].status',
                                'operator': '==',
                                'compare_to': 'POSTED'
                            }
                        ],
                        'on_true': 'create_reversal',
                        'on_false': 'fail_invalid_transaction'
                    }
                },
                {
                    'id': 'fail_invalid_transaction',
                    'name': 'Fail: Invalid Transaction',
                    'type': 'terminate',
                    'config': {
                        'status': 'INVALID_TRANSACTION',
                        'error': 'Transaction not found or not in POSTED status'
                    }
                },
                {
                    'id': 'create_reversal',
                    'name': 'Create Reversal Transaction',
                    'type': 'transaction',
                    'config': {
                        'transaction_type': '${fetch_original.results[0].type == "DEBIT" ? "CREDIT" : "DEBIT"}',
                        'account_id': '${fetch_original.results[0].account_id}',
                        'amount': '${fetch_original.results[0].amount * -1}',
                        'description': 'Reversal: ${fetch_original.results[0].description}',
                        'metadata': {
                            'reverses_transaction_id': '${transaction_id}',
                            'reason': '${reason}',
                            'workflow_execution_id': '${execution_id}'
                        }
                    },
                    'next': 'update_original_status'
                },
                {
                    'id': 'update_original_status',
                    'name': 'Update Original Status',
                    'type': 'update',
                    'config': {
                        'entity': 'Transaction',
                        'entity_id': '${transaction_id}',
                        'updates': {
                            'status': 'REVERSED',
                            'reversed_by': '${create_reversal.transaction_id}',
                            'reversal_reason': '${reason}'
                        }
                    },
                    'next': 'success'
                },
                {
                    'id': 'success',
                    'name': 'Success',
                    'type': 'terminate',
                    'config': {
                        'status': 'SUCCESS',
                        'output': {
                            'reversal_transaction_id': '${create_reversal.transaction_id}',
                            'original_transaction_id': '${transaction_id}',
                            'success': True,
                            'reversal_amount': '${create_reversal.amount}'
                        }
                    }
                }
            ],
            'initial_step': 'fetch_original'
        }
    },
    
    'send_notification': {
        'name': 'Send Notification',
        'description': 'Sends a notification via email, SMS, or in-app',
        'workflow_type': 'system',
        'access_level': 'internal',
        'category': 'Communication',
        'is_atomic': False,
        'is_locked': True,
        'max_execution_time_seconds': 60,
        'version': 1,
        
        'required_inputs': [
            {
                'name': 'recipient',
                'type': 'string',
                'description': 'Recipient email or phone',
                'validation': 'required'
            },
            {
                'name': 'template_id',
                'type': 'string',
                'description': 'Notification template ID',
                'validation': 'required'
            },
            {
                'name': 'variables',
                'type': 'object',
                'description': 'Template variables',
                'validation': 'required'
            },
            {
                'name': 'notification_type',
                'type': 'string',
                'description': 'Type of notification (email, sms, in_app)',
                'validation': 'required'
            },
        ],
        
        'outputs': [
            {
                'name': 'notification_id',
                'type': 'string',
                'description': 'ID of sent notification'
            },
            {
                'name': 'delivered',
                'type': 'boolean',
                'description': 'Whether notification was delivered'
            },
            {
                'name': 'delivery_status',
                'type': 'string',
                'description': 'Delivery status (sent, delivered, failed)'
            },
        ],
        
        'workflow_definition': {
            'steps': [
                {
                    'id': 'fetch_template',
                    'name': 'Fetch Notification Template',
                    'type': 'query',
                    'config': {
                        'entity': 'NotificationTemplate',
                        'filters': [
                            {
                                'field': 'id',
                                'operator': '==',
                                'value': '${template_id}'
                            },
                            {
                                'field': 'status',
                                'operator': '==',
                                'value': 'ACTIVE'
                            }
                        ]
                    },
                    'next': 'validate_template'
                },
                {
                    'id': 'validate_template',
                    'name': 'Validate Template',
                    'type': 'condition',
                    'config': {
                        'conditions': [
                            {
                                'field': 'fetch_template.count',
                                'operator': '==',
                                'compare_to': '1'
                            }
                        ],
                        'on_true': 'render_content',
                        'on_false': 'fail_invalid_template'
                    }
                },
                {
                    'id': 'fail_invalid_template',
                    'name': 'Fail: Invalid Template',
                    'type': 'terminate',
                    'config': {
                        'status': 'INVALID_TEMPLATE',
                        'error': 'Notification template not found or inactive'
                    }
                },
                {
                    'id': 'render_content',
                    'name': 'Render Content',
                    'type': 'calculation',
                    'config': {
                        'template': '${fetch_template.results[0].content}',
                        'variables': '${variables}',
                        'result_name': 'rendered_content'
                    },
                    'next': 'send_notification'
                },
                {
                    'id': 'send_notification',
                    'name': 'Send Notification',
                    'type': 'notification',
                    'config': {
                        'recipient': '${recipient}',
                        'subject': '${fetch_template.results[0].subject}',
                        'content': '${render_content.rendered_content}',
                        'notification_type': '${notification_type}',
                        'metadata': {
                            'template_id': '${template_id}',
                            'workflow_execution_id': '${execution_id}'
                        }
                    },
                    'next': 'check_delivery'
                },
                {
                    'id': 'check_delivery',
                    'name': 'Check Delivery Status',
                    'type': 'condition',
                    'config': {
                        'conditions': [
                            {
                                'field': 'send_notification.delivery_status',
                                'operator': '==',
                                'compare_to': 'DELIVERED'
                            }
                        ],
                        'on_true': 'success',
                        'on_false': 'log_delivery_failure'
                    }
                },
                {
                    'id': 'log_delivery_failure',
                    'name': 'Log Delivery Failure',
                    'type': 'update',
                    'config': {
                        'entity': 'Notification',
                        'entity_id': '${send_notification.notification_id}',
                        'updates': {
                            'status': 'FAILED',
                            'error_message': 'Failed to deliver notification'
                        }
                    },
                    'next': 'fail_delivery'
                },
                {
                    'id': 'fail_delivery',
                    'name': 'Fail: Delivery Failed',
                    'type': 'terminate',
                    'config': {
                        'status': 'DELIVERY_FAILED',
                        'error': 'Notification could not be delivered'
                    }
                },
                {
                    'id': 'success',
                    'name': 'Success',
                    'type': 'terminate',
                    'config': {
                        'status': 'SUCCESS',
                        'output': {
                            'notification_id': '${send_notification.notification_id}',
                            'delivered': True,
                            'delivery_status': '${send_notification.delivery_status}'
                        }
                    }
                }
            ],
            'initial_step': 'fetch_template'
        }
    },

    'approve_transaction': {
        'name': 'Approve Transaction',
        'description': 'Multi-level approval workflow for financial transactions',
        'workflow_type': 'system',
        'access_level': 'internal',
        'category': 'Financial Operations',
        'is_atomic': True,
        'is_locked': True,
        'max_execution_time_seconds': 86400,  # 24 hours for approval timeout
        'version': 1,
        
        'required_inputs': [
            {
                'name': 'transaction_id',
                'type': 'string',
                'description': 'ID of transaction to approve',
                'validation': 'required'
            },
            {
                'name': 'amount',
                'type': 'number',
                'description': 'Transaction amount for approval thresholds',
                'validation': 'required'
            },
            {
                'name': 'initiator_id',
                'type': 'string',
                'description': 'User ID who initiated the transaction',
                'validation': 'required'
            },
        ],
        
        'outputs': [
            {
                'name': 'approved',
                'type': 'boolean',
                'description': 'Whether transaction was approved'
            },
            {
                'name': 'approval_level',
                'type': 'string',
                'description': 'Level at which approval was granted'
            },
            {
                'name': 'approver_ids',
                'type': 'array',
                'description': 'List of user IDs who approved'
            },
        ],
        
        'workflow_definition': {
            'steps': [
                {
                    'id': 'check_auto_approval',
                    'name': 'Check Auto-approval',
                    'type': 'condition',
                    'config': {
                        'conditions': [
                            {
                                'field': 'amount',
                                'operator': '<=',
                                'compare_to': '1000'
                            }
                        ],
                        'on_true': 'auto_approve',
                        'on_false': 'require_manager_approval'
                    }
                },
                {
                    'id': 'auto_approve',
                    'name': 'Auto-approve',
                    'type': 'update',
                    'config': {
                        'entity': 'Transaction',
                        'entity_id': '${transaction_id}',
                        'updates': {
                            'status': 'APPROVED',
                            'approval_level': 'AUTO',
                            'approved_by': 'system'
                        }
                    },
                    'next': 'success_auto'
                },
                {
                    'id': 'success_auto',
                    'name': 'Success: Auto-approved',
                    'type': 'terminate',
                    'config': {
                        'status': 'SUCCESS',
                        'output': {
                            'approved': True,
                            'approval_level': 'AUTO',
                            'approver_ids': ['system']
                        }
                    }
                },
                {
                    'id': 'require_manager_approval',
                    'name': 'Require Manager Approval',
                    'type': 'approval',
                    'config': {
                        'approvers': ['${get_managers.results}'],
                        'required_approvals': 1,
                        'timeout_minutes': 1440,  # 24 hours
                        'instructions': 'Please review and approve transaction ${transaction_id} for amount ${amount}'
                    },
                    'next': 'check_manager_approval'
                },
                {
                    'id': 'get_managers',
                    'name': 'Get Department Managers',
                    'type': 'query',
                    'config': {
                        'entity': 'User',
                        'filters': [
                            {
                                'field': 'role',
                                'operator': '==',
                                'value': 'manager'
                            },
                            {
                                'field': 'department',
                                'operator': '==',
                                'value': '${initiator_department}'
                            }
                        ]
                    }
                },
                {
                    'id': 'check_manager_approval',
                    'name': 'Check Manager Approval',
                    'type': 'condition',
                    'config': {
                        'conditions': [
                            {
                                'field': 'require_manager_approval.approved',
                                'operator': '==',
                                'compare_to': 'true'
                            }
                        ],
                        'on_true': 'update_manager_approval',
                        'on_false': 'fail_approval'
                    }
                },
                {
                    'id': 'update_manager_approval',
                    'name': 'Update Manager Approval',
                    'type': 'update',
                    'config': {
                        'entity': 'Transaction',
                        'entity_id': '${transaction_id}',
                        'updates': {
                            'status': 'APPROVED',
                            'approval_level': 'MANAGER',
                            'approved_by': '${require_manager_approval.approver_ids}'
                        }
                    },
                    'next': 'success_manager'
                },
                {
                    'id': 'success_manager',
                    'name': 'Success: Manager Approved',
                    'type': 'terminate',
                    'config': {
                        'status': 'SUCCESS',
                        'output': {
                            'approved': True,
                            'approval_level': 'MANAGER',
                            'approver_ids': '${require_manager_approval.approver_ids}'
                        }
                    }
                },
                {
                    'id': 'fail_approval',
                    'name': 'Fail: Approval Rejected',
                    'type': 'update',
                    'config': {
                        'entity': 'Transaction',
                        'entity_id': '${transaction_id}',
                        'updates': {
                            'status': 'REJECTED',
                            'rejected_by': '${require_manager_approval.approver_ids}'
                        }
                    },
                    'next': 'terminate_rejected'
                },
                {
                    'id': 'terminate_rejected',
                    'name': 'Terminate: Rejected',
                    'type': 'terminate',
                    'config': {
                        'status': 'REJECTED',
                        'output': {
                            'approved': False,
                            'approval_level': 'NONE',
                            'approver_ids': []
                        }
                    }
                }
            ],
            'initial_step': 'check_auto_approval'
        }
    }
}