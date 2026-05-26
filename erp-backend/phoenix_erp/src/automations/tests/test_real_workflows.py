# automations/tests/test_real_workflows.py
"""
Comprehensive integration tests using real workflow definitions
Tests workflows that interact with accounts, transactions, and inventory
"""
from django.test import TestCase
from django.contrib.auth import get_user_model
from decimal import Decimal
from datetime import date

from automations.models import WorkflowTemplate, WorkflowRun
from automations.workflow_executor import WorkflowExecutor
from branches.models import Branch
from accounts.models import Account, AccountCategory
from clients.models import Client, ClientClassification
from inventory.models import InventoryItem, InventoryCategory, InventoryStock, Location
from transactions.models import Transaction, TransactionSeries

User = get_user_model()


class RealWorkflowIntegrationTest(TestCase):
    """Test real workflow definitions with actual database models"""
    
    def setUp(self):
        """Set up test data"""
        # Create user
        self.user = User.objects.create_user(
            username='testuser',
            email='test@test.com',
            password='testpass123'
        )
        
        # Create branch
        self.branch = Branch.objects.create(
            name='Main Branch',
            code='MAIN',
            is_active=True
        )
        
        # Create account categories
        self.asset_category = AccountCategory.objects.create(
            section=1,  # Assets
            name='Assets',
            owner=self.user,
            branch=self.branch
        )
        
        self.expense_category = AccountCategory.objects.create(
            section=5,  # Expenses
            name='Expenses',
            owner=self.user,
            branch=self.branch
        )
        
        self.liability_category = AccountCategory.objects.create(
            section=2,  # Liabilities
            name='Liabilities',
            owner=self.user,
            branch=self.branch
        )
        
        self.income_category = AccountCategory.objects.create(
            section=4,  # Income
            name='Income',
            owner=self.user,
            branch=self.branch
        )
        
        # Create accounts
        self.inventory_account = Account.objects.create(
            code='130',
            name='Inventory',
            account_type=Account.ASSET,
            account_level=Account.LEVEL_PARENT,
            category=self.asset_category,
            branch=self.branch,
            owner=self.user
        )
        
        self.cash_account = Account.objects.create(
            code='100',
            name='Cash at Bank',
            account_type=Account.ASSET,
            account_level=Account.LEVEL_PARENT,
            category=self.asset_category,
            branch=self.branch,
            owner=self.user
        )
        
        self.cogs_account = Account.objects.create(
            code='500',
            name='Cost of Goods Sold',
            account_type=Account.EXPENSE,
            account_level=Account.LEVEL_PARENT,
            category=self.expense_category,
            branch=self.branch,
            owner=self.user
        )
        
        self.income_account = Account.objects.create(
            code='400',
            name='Sales Income',
            account_type=Account.INCOME,
            account_level=Account.LEVEL_PARENT,
            category=self.income_category,
            branch=self.branch,
            owner=self.user
        )
        
        self.payables_account = Account.objects.create(
            code='200',
            name='Accounts Payable',
            account_type=Account.LIABILITY,
            account_level=Account.LEVEL_PARENT,
            category=self.liability_category,
            branch=self.branch,
            owner=self.user
        )
        
        # Create inventory category
        self.category = InventoryCategory.objects.create(
            name='Electronics',
            code='ELEC',
            branch=self.branch,
            owner=self.user,
            inventory_account=self.inventory_account,
            cogs_account=self.cogs_account,
            sales_account=self.income_account
        )
        
        # Create inventory item
        self.item = InventoryItem.objects.create(
            name='Laptop',
            sku='LAP001',
            category=self.category,
            branch=self.branch,
            owner=self.user,
            is_active=True,
            unit_of_measure='piece',
            cost_price=Decimal('500.00'),
            selling_price=Decimal('800.00')
        )
        
        # Create location
        self.location = Location.objects.create(
            name='Main Warehouse',
            code='WH01',
            branch=self.branch,
            owner=self.user,
            location_type='warehouse'
        )
        
        # Create inventory stock
        self.stock = InventoryStock.objects.create(
            item=self.item,
            location=self.location,
            branch=self.branch,
            owner=self.user,
            quantity_on_hand=100,
            quantity_available=100,
            average_cost=Decimal('500.00')
        )
        
        # Create transaction series for transaction steps
        self.transaction_series = TransactionSeries.objects.create(
            code='JRN',
            description='Journal Entries'
        )
        
        # Create default TXN series (used by transaction step if not specified)
        self.txn_series = TransactionSeries.objects.create(
            code='TXN',
            description='General Transactions'
        )
    
    def test_inventory_purchase_workflow(self):
        """Test purchasing inventory with transaction creation"""
        # Define purchase workflow
        workflow_def = {
            "steps": [
                {
                    "id": "validate_purchase",
                    "name": "Validate Purchase Data",
                    "type": "validation",
                    "config": {
                        "validations": [
                            {
                                "field": "quantity",
                                "rule": "required"
                            },
                            {
                                "field": "quantity",
                                "rule": "min",
                                "value": 1
                            },
                            {
                                "field": "unit_cost",
                                "rule": "required"
                            },
                            {
                                "field": "unit_cost",
                                "rule": "min",
                                "value": 0.01
                            }
                        ]
                    },
                    "next": "calculate_total"
                },
                {
                    "id": "calculate_total",
                    "name": "Calculate Total Cost",
                    "type": "calculation",
                    "config": {
                        "formula": "${quantity} * ${unit_cost}",
                        "result_name": "total_cost"
                    },
                    "next": "update_stock"
                },
                {
                    "id": "update_stock",
                    "name": "Update Stock Levels",
                    "type": "variable",
                    "config": {
                        "mode": "set",
                        "variables": {
                            "new_quantity": "${quantity_on_hand + quantity}",
                            "new_average_cost": "${((quantity_on_hand * average_cost) + total_cost) / (quantity_on_hand + quantity)}"
                        }
                    },
                    "next": "create_transaction"
                },
                {
                    "id": "create_transaction",
                    "name": "Create Purchase Transaction",
                    "type": "transaction",
                    "config": {
                        "transaction_type": "journal",
                        "description": "Purchase: ${item_name} x ${quantity}",
                        "date": "${purchase_date}",
                        "entries": [
                            {
                                "account_id": "${inventory_account_id}",
                                "side": "DR",
                                "amount": "${total_cost}",
                                "description": "Inventory purchased"
                            },
                            {
                                "account_id": "${cash_account_id}",
                                "side": "CR",
                                "amount": "${total_cost}",
                                "description": "Cash payment"
                            }
                        ]
                    }
                }
            ],
            "initial_step": "validate_purchase"
        }
        
        # Create workflow template
        template = WorkflowTemplate.objects.create(
            name="Purchase Inventory",
            
            trigger_type="manual",
            workflow_definition=workflow_def,
            owner=self.user,
            branch=self.branch
        )
        
        # Create workflow run with context
        run = WorkflowRun.objects.create(
            template=template,
            context={
                'quantity': 20,
                'unit_cost': 550.00,
                'item_name': self.item.name,
                'item_id': self.item.id,
                'quantity_on_hand': float(self.stock.quantity_on_hand),
                'average_cost': float(self.stock.average_cost),
                'inventory_account_id': self.inventory_account.id,
                'cash_account_id': self.cash_account.id,
                'purchase_date': str(date.today())
            },
            owner=self.user,
            branch=self.branch,
            current_step_id='validate_purchase'
        )
        
        # Execute workflow
        executor = WorkflowExecutor(run)
        success = executor.execute()
        
        # Assertions
        self.assertTrue(success)
        run.refresh_from_db()
        self.assertEqual(run.status, 'completed')
        
        # Check calculation results
        self.assertIn('total_cost', run.context)
        self.assertEqual(run.context['total_cost'], 11000.0)  # 20 * 550
        
        # Check transaction was created
        transactions = Transaction.objects.filter(
            branch=self.branch,
            description__icontains='Purchase'
        )
        self.assertEqual(transactions.count(), 1)
        
        transaction = transactions.first()
        self.assertEqual(transaction.entries.count(), 2)
        
        # Verify debit entry
        dr_entry = transaction.entries.filter(side='DR').first()
        self.assertEqual(dr_entry.account, self.inventory_account)
        self.assertEqual(float(dr_entry.amount), 11000.0)
        
        # Verify credit entry
        cr_entry = transaction.entries.filter(side='CR').first()
        self.assertEqual(cr_entry.account, self.cash_account)
        self.assertEqual(float(cr_entry.amount), 11000.0)
    
    def test_inventory_sale_workflow_with_cogs(self):
        """Test selling inventory with COGS calculation"""
        workflow_def = {
            "steps": [
                {
                    "id": "check_stock",
                    "name": "Check Stock Availability",
                    "type": "validation",
                    "config": {
                        "validations": [
                            {
                                "field": "quantity_available",
                                "rule": "gte",
                                "value": "${sale_quantity}"
                            }
                        ]
                    },
                    "next": "calculate_cogs"
                },
                {
                    "id": "calculate_cogs",
                    "name": "Calculate COGS",
                    "type": "calculation",
                    "config": {
                        "formula": "${sale_quantity} * ${average_cost}",
                        "result_name": "cogs_amount"
                    },
                    "next": "calculate_income"
                },
                {
                    "id": "calculate_income",
                    "name": "Calculate Income",
                    "type": "calculation",
                    "config": {
                        "formula": "${sale_quantity} * ${selling_price}",
                        "result_name": "income_amount"
                    },
                    "next": "record_cogs"
                },
                {
                    "id": "record_cogs",
                    "name": "Record Cost of Goods Sold",
                    "type": "transaction",
                    "config": {
                        "transaction_type": "journal",
                        "description": "COGS: ${item_name} x ${sale_quantity}",
                        "date": "${sale_date}",
                        "entries": [
                            {
                                "account_id": "${cogs_account_id}",
                                "side": "DR",
                                "amount": "${cogs_amount}",
                                "description": "Cost of goods sold"
                            },
                            {
                                "account_id": "${inventory_account_id}",
                                "side": "CR",
                                "amount": "${cogs_amount}",
                                "description": "Inventory reduction"
                            }
                        ]
                    },
                    "next": "record_income"
                },
                {
                    "id": "record_income",
                    "name": "Record Sales Income",
                    "type": "transaction",
                    "config": {
                        "transaction_type": "journal",
                        "description": "Sale: ${item_name} x ${sale_quantity}",
                        "date": "${sale_date}",
                        "entries": [
                            {
                                "account_id": "${cash_account_id}",
                                "side": "DR",
                                "amount": "${income_amount}",
                                "description": "Cash received"
                            },
                            {
                                "account_id": "${income_account_id}",
                                "side": "CR",
                                "amount": "${income_amount}",
                                "description": "Sales income"
                            }
                        ]
                    }
                }
            ],
            "initial_step": "check_stock"
        }
        
        template = WorkflowTemplate.objects.create(
            name="Sell Inventory",
            
            trigger_type="manual",
            workflow_definition=workflow_def,
            owner=self.user,
            branch=self.branch
        )
        
        run = WorkflowRun.objects.create(
            template=template,
            context={
                'item_name': self.item.name,
                'sale_quantity': 10,
                'selling_price': 800.00,
                'average_cost': float(self.stock.average_cost),
                'quantity_available': float(self.stock.quantity_available),
                'cogs_account_id': self.cogs_account.id,
                'inventory_account_id': self.inventory_account.id,
                'cash_account_id': self.cash_account.id,
                'income_account_id': self.income_account.id,
                'sale_date': str(date.today())
            },
            owner=self.user,
            branch=self.branch,
            current_step_id='check_stock'
        )
        
        executor = WorkflowExecutor(run)
        success = executor.execute()
        
        self.assertTrue(success)
        run.refresh_from_db()
        self.assertEqual(run.status, 'completed')
        
        # Check calculations
        self.assertEqual(run.context['cogs_amount'], 5000.0)  # 10 * 500
        self.assertEqual(run.context['income_amount'], 8000.0)  # 10 * 800
        
        # Check two transactions were created
        transactions = Transaction.objects.filter(branch=self.branch)
        self.assertEqual(transactions.count(), 2)
        
        # Verify COGS transaction
        cogs_txn = transactions.filter(description__icontains='COGS').first()
        self.assertIsNotNone(cogs_txn)
        self.assertEqual(cogs_txn.entries.count(), 2)
        
        # Verify Income transaction
        income_txn = transactions.filter(description__icontains='Sale:').first()
        self.assertIsNotNone(income_txn)
        self.assertEqual(income_txn.entries.count(), 2)
    
    def test_multi_item_purchase_with_loop(self):
        """Test purchasing multiple items using loop step"""
        # Create additional items
        item2 = InventoryItem.objects.create(
            name='Mouse',
            sku='MOU001',
            category=self.category,
            branch=self.branch,
            owner=self.user,
            is_active=True,
            unit_of_measure='piece',
            cost_price=Decimal('15.00'),
            selling_price=Decimal('25.00')
        )
        
        item3 = InventoryItem.objects.create(
            name='Keyboard',
            sku='KEY001',
            category=self.category,
            branch=self.branch,
            owner=self.user,
            is_active=True,
            unit_of_measure='piece',
            cost_price=Decimal('35.00'),
            selling_price=Decimal('55.00')
        )
        
        workflow_def = {
            "steps": [
                {
                    "id": "validate_items",
                    "name": "Validate Purchase Items",
                    "type": "validation",
                    "config": {
                        "validations": [
                            {
                                "field": "purchase_items",
                                "rule": "required"
                            }
                        ]
                    },
                    "next": "process_items"
                },
                {
                    "id": "process_items",
                    "name": "Process Each Item",
                    "type": "loop",
                    "config": {
                        "collection": "${purchase_items}",
                        "item_variable": "current_item",
                        "index_variable": "idx",
                        "max_iterations": 50,
                        "steps": [
                            {
                                "type": "variable",
                                "config": {
                                    "mode": "set",
                                    "variables": {
                                        "item_processed": "true"
                                    }
                                }
                            }
                        ]
                    },
                    "next": "calculate_grand_total"
                },
                {
                    "id": "calculate_grand_total",
                    "name": "Calculate Total Purchase Amount",
                    "type": "aggregate",
                    "config": {
                        "collection": "${purchase_items}",
                        "operations": [
                            {
                                "type": "sum",
                                "field": "total",
                                "result_name": "grand_total"
                            },
                            {
                                "type": "count",
                                "result_name": "item_count"
                            }
                        ]
                    },
                    "next": "create_summary_transaction"
                },
                {
                    "id": "create_summary_transaction",
                    "name": "Create Purchase Transaction",
                    "type": "transaction",
                    "config": {
                        "transaction_type": "journal",
                        "description": "Bulk Purchase: ${item_count} items",
                        "date": "${purchase_date}",
                        "entries": [
                            {
                                "account_id": "${inventory_account_id}",
                                "side": "DR",
                                "amount": "${grand_total}",
                                "description": "Inventory purchased (bulk)"
                            },
                            {
                                "account_id": "${payables_account_id}",
                                "side": "CR",
                                "amount": "${grand_total}",
                                "description": "Accounts payable"
                            }
                        ]
                    }
                }
            ],
            "initial_step": "validate_items"
        }
        
        template = WorkflowTemplate.objects.create(
            name="Bulk Purchase",
            
            trigger_type="manual",
            workflow_definition=workflow_def,
            owner=self.user,
            branch=self.branch
        )
        
        purchase_items = [
            {'item_name': 'Laptop', 'quantity': 5, 'unit_cost': 550, 'total': 2750},
            {'item_name': 'Mouse', 'quantity': 20, 'unit_cost': 15, 'total': 300},
            {'item_name': 'Keyboard', 'quantity': 15, 'unit_cost': 35, 'total': 525}
        ]
        
        run = WorkflowRun.objects.create(
            template=template,
            context={
                'purchase_items': purchase_items,
                'inventory_account_id': self.inventory_account.id,
                'payables_account_id': self.payables_account.id,
                'purchase_date': str(date.today())
            },
            owner=self.user,
            branch=self.branch,
            current_step_id='validate_items'
        )
        
        executor = WorkflowExecutor(run)
        success = executor.execute()
        
        self.assertTrue(success)
        run.refresh_from_db()
        self.assertEqual(run.status, 'completed')
        
        # Check aggregation results
        self.assertEqual(run.context['grand_total'], 3575)  # 2750 + 300 + 525
        self.assertEqual(run.context['item_count'], 3)
        
        # Check transaction
        transactions = Transaction.objects.filter(branch=self.branch)
        self.assertEqual(transactions.count(), 1)
        
        transaction = transactions.first()
        self.assertEqual(float(transaction.get_total_amount()), 3575.0)
    
    def test_conditional_discount_workflow(self):
        """Test workflow with conditional logic for bulk discounts"""
        workflow_def = {
            "steps": [
                {
                    "id": "calculate_subtotal",
                    "name": "Calculate Subtotal",
                    "type": "calculation",
                    "config": {
                        "formula": "${quantity} * ${unit_price}",
                        "result_name": "subtotal"
                    },
                    "next": "check_discount_eligibility"
                },
                {
                    "id": "check_discount_eligibility",
                    "name": "Check for Bulk Discount",
                    "type": "condition",
                    "config": {
                        "conditions": [
                            {
                                "field": "${quantity}",
                                "operator": "gte",
                                "value": 50
                            }
                        ],
                        "on_true": "apply_bulk_discount",
                        "on_false": "apply_regular_discount"
                    }
                },
                {
                    "id": "apply_bulk_discount",
                    "name": "Apply 15% Bulk Discount",
                    "type": "script",
                    "config": {
                        "script": """
discount_rate = 0.15
discount_amount = subtotal * discount_rate
final_total = subtotal - discount_amount
result = {
    'discount_rate': discount_rate,
    'discount_amount': discount_amount,
    'final_total': final_total,
    'discount_type': 'Bulk Discount (15%)'
}
""",
                        "result_variable": "discount_result"
                    },
                    "next": "create_sale_transaction"
                },
                {
                    "id": "apply_regular_discount",
                    "name": "Apply 5% Regular Discount",
                    "type": "script",
                    "config": {
                        "script": """
discount_rate = 0.05
discount_amount = subtotal * discount_rate
final_total = subtotal - discount_amount
result = {
                    'discount_rate': discount_rate,
    'discount_amount': discount_amount,
    'final_total': final_total,
    'discount_type': 'Regular Discount (5%)'
}
""",
                        "result_variable": "discount_result"
                    },
                    "next": "create_sale_transaction"
                },
                {
                    "id": "create_sale_transaction",
                    "name": "Record Sale",
                    "type": "transaction",
                    "config": {
                        "transaction_type": "journal",
                        "description": "Sale with ${discount_result.discount_type}",
                        "date": "${sale_date}",
                        "entries": [
                            {
                                "account_id": "${cash_account_id}",
                                "side": "DR",
                                "amount": "${discount_result.final_total}",
                                "description": "Cash received"
                            },
                            {
                                "account_id": "${income_account_id}",
                                "side": "CR",
                                "amount": "${discount_result.final_total}",
                                "description": "Sales income"
                            }
                        ]
                    }
                }
            ],
            "initial_step": "calculate_subtotal"
        }
        
        template = WorkflowTemplate.objects.create(
            name="Sale with Discount",
            
            trigger_type="manual",
            workflow_definition=workflow_def,
            owner=self.user,
            branch=self.branch
        )
        
        # Test bulk discount path (quantity >= 50)
        run_bulk = WorkflowRun.objects.create(
            template=template,
            context={
                'quantity': 60,
                'unit_price': 100,
                'cash_account_id': self.cash_account.id,
                'income_account_id': self.income_account.id,
                'sale_date': str(date.today())
            },
            owner=self.user,
            branch=self.branch,
            current_step_id='calculate_subtotal'
        )
        
        executor = WorkflowExecutor(run_bulk)
        success = executor.execute()
        
        self.assertTrue(success)
        run_bulk.refresh_from_db()
        self.assertEqual(run_bulk.status, 'completed')
        self.assertEqual(run_bulk.context['subtotal'], 6000)
        self.assertEqual(run_bulk.context['discount_result']['discount_rate'], 0.15)
        self.assertEqual(run_bulk.context['discount_result']['final_total'], 5100.0)  # 6000 * 0.85
        
        # Test regular discount path (quantity < 50)
        run_regular = WorkflowRun.objects.create(
            template=template,
            context={
                'quantity': 30,
                'unit_price': 100,
                'cash_account_id': self.cash_account.id,
                'income_account_id': self.income_account.id,
                'sale_date': str(date.today())
            },
            owner=self.user,
            branch=self.branch,
            current_step_id='calculate_subtotal'
        )
        
        executor = WorkflowExecutor(run_regular)
        success = executor.execute()
        
        self.assertTrue(success)
        run_regular.refresh_from_db()
        self.assertEqual(run_regular.status, 'completed')
        self.assertEqual(run_regular.context['subtotal'], 3000)
        self.assertEqual(run_regular.context['discount_result']['discount_rate'], 0.05)
        self.assertEqual(run_regular.context['discount_result']['final_total'], 2850.0)  # 3000 * 0.95
    
    def test_filter_and_aggregate_accounts(self):
        """Test filtering and aggregating account balances"""
        # Create more accounts with balances
        acc1 = Account.objects.create(
            code='110',
            name='Petty Cash',
            account_type=Account.ASSET,
            account_level=Account.LEVEL_PARENT,
            category=self.asset_category,
            branch=self.branch,
            owner=self.user,
            balance=Decimal('500.00')
        )
        
        acc2 = Account.objects.create(
            code='120',
            name='Savings Account',
            account_type=Account.ASSET,
            account_level=Account.LEVEL_PARENT,
            category=self.asset_category,
            branch=self.branch,
            owner=self.user,
            balance=Decimal('25000.00')
        )
        
        acc3 = Account.objects.create(
            code='510',
            name='Utilities Expense',
            account_type=Account.EXPENSE,
            account_level=Account.LEVEL_PARENT,
            category=self.expense_category,
            branch=self.branch,
            owner=self.user,
            balance=Decimal('3500.00')
        )
        
        workflow_def = {
            "steps": [
                {
                    "id": "prepare_accounts",
                    "name": "Prepare Account Data",
                    "type": "variable",
                    "config": {
                        "mode": "set",
                        "variables": {
                            "all_accounts": "${accounts}"
                        }
                    },
                    "next": "filter_asset_accounts"
                },
                {
                    "id": "filter_asset_accounts",
                    "name": "Filter Asset Accounts",
                    "type": "filter",
                    "config": {
                        "collection": "${all_accounts}",
                        "conditions": [
                            {
                                "field": "account_type",
                                "operator": "eq",
                                "value": "ASSET"
                            }
                        ],
                        "logic": "AND",
                        "result_variable": "asset_accounts"
                    },
                    "next": "calculate_total_assets"
                },
                {
                    "id": "calculate_total_assets",
                    "name": "Calculate Total Assets",
                    "type": "aggregate",
                    "config": {
                        "collection": "${asset_accounts}",
                        "operations": [
                            {
                                "type": "sum",
                                "field": "balance",
                                "result_name": "total_assets"
                            },
                            {
                                "type": "count",
                                "result_name": "asset_count"
                            },
                            {
                                "type": "avg",
                                "field": "balance",
                                "result_name": "avg_balance"
                            }
                        ]
                    }
                }
            ],
            "initial_step": "prepare_accounts"
        }
        
        template = WorkflowTemplate.objects.create(
            name="Account Analysis",
            
            trigger_type="manual",
            workflow_definition=workflow_def,
            owner=self.user,
            branch=self.branch
        )
        
        accounts_data = [
            {'code': '100', 'name': 'Cash at Bank', 'account_type': 'ASSET', 'balance': 0},
            {'code': '110', 'name': 'Petty Cash', 'account_type': 'ASSET', 'balance': 500},
            {'code': '120', 'name': 'Savings', 'account_type': 'ASSET', 'balance': 25000},
            {'code': '130', 'name': 'Inventory', 'account_type': 'ASSET', 'balance': 0},
            {'code': '510', 'name': 'Utilities', 'account_type': 'EXPENSE', 'balance': 3500}
        ]
        
        run = WorkflowRun.objects.create(
            template=template,
            context={
                'accounts': accounts_data
            },
            owner=self.user,
            branch=self.branch,
            current_step_id='prepare_accounts'
        )
        
        executor = WorkflowExecutor(run)
        success = executor.execute()
        
        self.assertTrue(success)
        run.refresh_from_db()
        self.assertEqual(run.status, 'completed')
        
        # Check filter results
        self.assertIn('asset_accounts', run.context)
        self.assertEqual(len(run.context['asset_accounts']), 4)
        
        # Check aggregation results
        self.assertEqual(run.context['total_assets'], 25500)  # 0 + 500 + 25000 + 0
        self.assertEqual(run.context['asset_count'], 4)
        self.assertEqual(run.context['avg_balance'], 6375.0)  # 25500 / 4
    
    def test_map_transform_accounts(self):
        """Test transforming account data with map step"""
        workflow_def = {
            "steps": [
                {
                    "id": "transform_accounts",
                    "name": "Transform Account Display",
                    "type": "map",
                    "config": {
                        "collection": "${accounts}",
                        "transform": {
                            "display_code": "${item.code}",
                            "display_name": "${item.code} - ${item.name}",
                            "balance_display": "Balance: ${item.balance}",
                            "account_category": "${item.account_type}"
                        },
                        "result_variable": "transformed_accounts"
                    }
                }
            ],
            "initial_step": "transform_accounts"
        }
        
        template = WorkflowTemplate.objects.create(
            name="Transform Accounts",
            
            trigger_type="manual",
            workflow_definition=workflow_def,
            owner=self.user,
            branch=self.branch
        )
        
        accounts_data = [
            {'code': '100', 'name': 'Cash at Bank', 'account_type': 'ASSET', 'balance': 15000},
            {'code': '200', 'name': 'Accounts Payable', 'account_type': 'LIABILITY', 'balance': 8000}
        ]
        
        run = WorkflowRun.objects.create(
            template=template,
            context={'accounts': accounts_data},
            owner=self.user,
            branch=self.branch,
            current_step_id='transform_accounts'
        )
        
        executor = WorkflowExecutor(run)
        success = executor.execute()
        
        self.assertTrue(success)
        run.refresh_from_db()
        self.assertEqual(run.status, 'completed')
        
        # Check transformation results
        transformed = run.context['transformed_accounts']
        self.assertEqual(len(transformed), 2)
        self.assertEqual(transformed[0]['display_name'], '100 - Cash at Bank')
        self.assertEqual(transformed[0]['balance_display'], 'Balance: 15000')
        self.assertEqual(transformed[1]['display_name'], '200 - Accounts Payable')
