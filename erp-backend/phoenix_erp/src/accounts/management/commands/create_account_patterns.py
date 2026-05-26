# accounts/management/commands/create_account_patterns.py
"""
Management command to create default transaction patterns for accounts
Run after creating accounts to auto-generate forms and workflows
"""
from django.core.management.base import BaseCommand
from django.db import transaction
from accounts.models import Account, AccountTransactionPattern
from automations.services.form_generation import FormGenerationService


class Command(BaseCommand):
    help = 'Create default transaction patterns for accounts'
    
    def add_arguments(self, parser):
        parser.add_argument(
            '--account-id',
            type=int,
            help='Specific account ID (optional - will process all if not provided)'
        )
        parser.add_argument(
            '--regenerate',
            action='store_true',
            help='Regenerate patterns even if they exist'
        )
    
    @transaction.atomic
    def handle(self, *args, **options):
        account_id = options.get('account_id')
        regenerate = options.get('regenerate', False)
        
        # Get accounts to process
        if account_id:
            accounts = Account.objects.filter(id=account_id, enable_smart_forms=True)
        else:
            accounts = Account.objects.filter(enable_smart_forms=True, is_deleted=False)
        
        total_created = 0
        total_updated = 0
        
        for account in accounts:
            self.stdout.write(f"\nProcessing account: {account.code} - {account.name}")
            
            # Check if patterns already exist
            existing_patterns = account.transaction_patterns.filter(is_deleted=False).count()
            
            if existing_patterns > 0 and not regenerate:
                self.stdout.write(
                    self.style.WARNING(f"  Account already has {existing_patterns} patterns. Skipping...")
                )
                continue
            
            if regenerate and existing_patterns > 0:
                self.stdout.write(f"  Deleting {existing_patterns} existing patterns...")
                account.transaction_patterns.all().delete()
            
            # Create default patterns based on account type
            patterns = self._create_patterns_for_account(account)
            
            for pattern_data in patterns:
                pattern = self._create_pattern(account, pattern_data)
                if pattern:
                    total_created += 1
                    self.stdout.write(
                        self.style.SUCCESS(f"  ✓ Created pattern: {pattern.code}")
                    )
        
        self.stdout.write(
            self.style.SUCCESS(
                f"\n\nCompleted! Created {total_created} patterns"
            )
        )
    
    def _create_patterns_for_account(self, account: Account) -> list:
        """Get pattern definitions for account type"""
        patterns = []
        
        if account.account_type == Account.LOAN:
            patterns = [
                {
                    'name': f'{account.name} - Repayment from Bank',
                    'code': 'loan_repayment_bank',
                    'this_account_side': 'CR',  # Credit loan (reduces balance)
                    'contra_accounts': {
                        'account_type': 'ASSET',
                        'code_prefix': '101',
                        'label': 'Payment Source (Bank)'
                    },
                    'validation_rules': {
                        'amount': {'min': 1, 'max': 10000000, 'required': True},
                        'requires_approval_above': 50000
                    },
                    'approval_config': {
                        'required': True,
                        'rules': [
                            {'condition': 'amount > 50000', 'approvers': ['manager']}
                        ]
                    }
                },
                {
                    'name': f'{account.name} - Internal Repayment',
                    'code': 'loan_repayment_savings',
                    'this_account_side': 'CR',
                    'contra_accounts': {
                        'account_type': 'SAVINGS',
                        'label': 'Savings Account'
                    },
                    'validation_rules': {
                        'amount': {'min': 1, 'max': 10000000, 'required': True}
                    }
                },
                {
                    'name': f'{account.name} - Disbursement',
                    'code': 'loan_disbursement',
                    'this_account_side': 'DR',  # Debit loan (increases balance)
                    'contra_accounts': {
                        'account_type': 'ASSET',
                        'code_prefix': '101',
                        'label': 'Disbursement Account'
                    },
                    'validation_rules': {
                        'amount': {'min': 1000, 'max': 10000000, 'required': True},
                        'requires_approval_above': 100000
                    },
                    'approval_config': {
                        'required': True,
                        'rules': [
                            {'condition': 'amount > 100000', 'approvers': ['manager', 'ceo']}
                        ]
                    },
                    'post_transaction_actions': [
                        {
                            'type': 'update_client_status',
                            'fields': {'status': 'active'}
                        }
                    ]
                }
            ]
        
        elif account.account_type == Account.SAVINGS:
            patterns = [
                {
                    'name': f'{account.name} - Deposit',
                    'code': 'savings_deposit',
                    'this_account_side': 'CR',  # Credit savings (increases balance)
                    'contra_accounts': {
                        'account_type': 'ASSET',
                        'code_prefix': '101',
                        'label': 'Deposit Source'
                    },
                    'validation_rules': {
                        'amount': {'min': 1, 'max': 10000000, 'required': True}
                    },
                    'display_config': {
                        'icon': 'arrow-down-circle',
                        'color': '#4CAF50',
                        'category': 'deposits',
                        'featured': True
                    }
                },
                {
                    'name': f'{account.name} - Withdrawal',
                    'code': 'savings_withdrawal',
                    'this_account_side': 'DR',  # Debit savings (decreases balance)
                    'contra_accounts': {
                        'account_type': 'ASSET',
                        'code_prefix': '101',
                        'label': 'Cash/Bank Account'
                    },
                    'validation_rules': {
                        'amount': {'min': 1, 'max': 10000000, 'required': True}
                    },
                    'display_config': {
                        'icon': 'arrow-up-circle',
                        'color': '#F44336',
                        'category': 'withdrawals'
                    }
                }
            ]
        
        elif account.account_type == Account.INCOME:
            patterns = [
                {
                    'name': f'{account.name} - Receipt',
                    'code': 'income_receipt',
                    'this_account_side': 'CR',  # Credit income
                    'contra_accounts': {
                        'account_type': 'ASSET',
                        'code_prefix': '101',
                        'label': 'Received Into'
                    },
                    'validation_rules': {
                        'amount': {'min': 1, 'required': True}
                    },
                    'display_config': {
                        'icon': 'currency-dollar',
                        'color': '#2196F3',
                        'category': 'income'
                    }
                }
            ]
        
        return patterns
    
    def _create_pattern(self, account: Account, pattern_data: dict) -> AccountTransactionPattern:
        """Create a single pattern with contra accounts"""
        from automations.services.form_generation import FormGenerationService
        
        try:
            # Create pattern
            pattern = AccountTransactionPattern.objects.create(
                account=account,
                owner=account.owner,
                branch=account.branch,
                created_by=account.created_by,
                name=pattern_data['name'],
                code=pattern_data['code'],
                this_account_side=pattern_data['this_account_side'],
                validation_rules=pattern_data.get('validation_rules', {}),
                approval_config=pattern_data.get('approval_config', {}),
                post_transaction_actions=pattern_data.get('post_transaction_actions', []),
                display_config=pattern_data.get('display_config', {}),
                auto_generate_form=True,
                auto_generate_workflow=True
            )
            
            # Create contra account links
            self._link_contra_accounts(pattern, pattern_data['contra_accounts'])
            
            # Generate form and workflow
            service = FormGenerationService()
            
            if pattern.auto_generate_form:
                form_schema = service.generate_form_for_pattern(pattern)
                pattern.generated_form_schema = form_schema
                self.stdout.write(f"    → Generated form schema: {form_schema.id}")
            
            if pattern.auto_generate_workflow:
                workflow = service.generate_workflow_for_pattern(pattern)
                pattern.generated_workflow = workflow
                self.stdout.write(f"    → Generated workflow: {workflow.id}")
            
            pattern.save()
            
            return pattern
        
        except Exception as e:
            self.stdout.write(
                self.style.ERROR(f"  ✗ Error creating pattern {pattern_data['code']}: {e}")
            )
            return None
    
    def _link_contra_accounts(self, pattern: AccountTransactionPattern, contra_config: dict):
        """Link contra accounts to pattern"""
        from accounts.models import PatternContraAccount
        
        # Find matching contra accounts
        contra_qs = Account.objects.filter(
            branch=pattern.branch,
            account_type=contra_config['account_type'],
            is_deleted=False
        )
        
        if 'code_prefix' in contra_config:
            contra_qs = contra_qs.filter(code__startswith=contra_config['code_prefix'])
        
        # Create links
        for contra_account in contra_qs:
            PatternContraAccount.objects.create(
                pattern=pattern,
                contra_account=contra_account,
                form_label=contra_config.get('label', contra_account.name),
                account_selection_criteria=contra_config,
                display_order=0
            )
            self.stdout.write(f"    → Linked contra account: {contra_account.code}")