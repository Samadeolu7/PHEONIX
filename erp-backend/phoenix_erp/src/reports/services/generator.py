# reports/services/generator.py
"""
Automatic report generation for accounts and products
Creates professional ERP-standard reports
"""
from django.db import transaction
from typing import Dict, Any
import logging

from reports.models import (
    ReportTemplate, ReportParameter, ReportColumn, ReportChart
)
from accounts.models import Account
from products.models import Product

logger = logging.getLogger(__name__)


class ReportGenerator:
    """Generate professional reports automatically"""
    
    @classmethod
    @transaction.atomic
    def generate_for_account(cls, account: Account, created_by) -> ReportTemplate:
        """
        Generate a comprehensive report for an account
        
        Creates:
        - Transaction history report
        - Balance analysis
        - Charts and visualizations
        """
        # Determine report configuration based on account type
        if account.account_type == Account.SAVINGS:
            return cls._generate_savings_report(account, created_by)
        elif account.account_type == Account.LOAN:
            return cls._generate_loan_report(account, created_by)
        elif account.account_type == Account.ASSET:
            return cls._generate_asset_report(account, created_by)
        elif account.account_type == Account.INCOME:
            return cls._generate_income_report(account, created_by)
        elif account.account_type == Account.EXPENSE:
            return cls._generate_expense_report(account, created_by)
        else:
            return cls._generate_general_report(account, created_by)
    
    @classmethod
    def _generate_savings_report(cls, account: Account, created_by) -> ReportTemplate:
        """Generate savings account report"""
        
        # Create report template
        report = ReportTemplate.objects.create(
            owner=account.owner,
            branch=account.branch,
            created_by=created_by,
            tenant=account.tenant,
            name=f"{account.name} - Savings Report",
            code=f"savings_report_{account.code.replace('-', '_').lower()}",
            description=f"Comprehensive report for {account.name} showing transactions, balance trends, and analysis",
            report_type='financial',
            access_level='internal',
            is_auto_generated=True,
            linked_account=account,
            primary_entity='TransactionEntry',  # Fixed: Was 'Transaction', should be 'TransactionEntry'
            allowed_entities=['Transaction', 'TransactionEntry', 'Account', 'Client'],
            allowed_fields=[
                'transaction_date', 'reference_number', 'description',
                'debit_amount', 'credit_amount', 'balance',
                'client__full_name', 'created_by__username'
            ],
            allowed_calculations=['sum', 'avg', 'count', 'min', 'max'],
            max_rows=10000,
            default_date_range='current_month',
            is_active=True,
            is_editable=True,
            report_config={
                'data_sources': [
                    {
                        'entity': 'TransactionEntry',
                        'alias': 'entries',
                        'relation_type': 'main'
                    }
                ],
                'filters': [
                    {
                        'field': 'account',
                        'operator': 'exact',
                        'value': account.id
                    },
                    {
                        'field': 'transaction__date',
                        'operator': 'gte',
                        'value': '${start_date}'
                    },
                    {
                        'field': 'transaction__date',
                        'operator': 'lte',
                        'value': '${end_date}'
                    }
                ],
                'ordering': ['-transaction__date', '-transaction__created_at'],
                'layout': {
                    'sections': [
                        {
                            'id': 'summary',
                            'title': 'Summary',
                            'position': 'top',
                            'widgets': ['kpi_cards', 'balance_trend']
                        },
                        {
                            'id': 'transactions',
                            'title': 'Transaction History',
                            'position': 'main',
                            'widgets': ['transaction_table']
                        },
                        {
                            'id': 'analysis',
                            'title': 'Analysis',
                            'position': 'bottom',
                            'widgets': ['monthly_analysis', 'transaction_type_breakdown']
                        }
                    ]
                }
            }
        )
        
        # Add parameters
        cls._create_date_range_parameters(report)
        
        # Add columns
        columns_config = [
            {
                'name': 'transaction_date',
                'code': 'transaction_date',
                'column_type': 'field',
                'label': 'Date',
                'field_path': 'transaction__date',
                'format_type': 'date',
                'format_options': {'format': '%Y-%m-%d'},
                'width': 120,
                'order': 1
            },
            {
                'name': 'reference',
                'code': 'reference',
                'column_type': 'field',
                'label': 'Reference',
                'field_path': 'transaction__reference_number',
                'format_type': 'text',
                'width': 150,
                'order': 2
            },
            {
                'name': 'description',
                'code': 'description',
                'column_type': 'field',
                'label': 'Description',
                'field_path': 'transaction__description',
                'format_type': 'text',
                'width': 300,
                'order': 3
            },
            {
                'name': 'debit',
                'code': 'debit',
                'column_type': 'field',
                'label': 'Deposits',
                'field_path': 'amount',
                'format_type': 'currency',
                'format_options': {'decimal_places': 2},
                'width': 150,
                'order': 4,
                'conditional_formatting': [
                    {
                        'condition': 'value > 0 AND side == "DR"',
                        'style': {'color': '#10b981', 'fontWeight': 'bold'}
                    }
                ]
            },
            {
                'name': 'credit',
                'code': 'credit',
                'column_type': 'field',
                'label': 'Withdrawals',
                'field_path': 'amount',
                'format_type': 'currency',
                'format_options': {'decimal_places': 2},
                'width': 150,
                'order': 5,
                'conditional_formatting': [
                    {
                        'condition': 'value > 0 AND side == "CR"',
                        'style': {'color': '#ef4444'}
                    }
                ]
            },
            {
                'name': 'running_balance',
                'code': 'running_balance',
                'column_type': 'calculation',
                'label': 'Balance',
                'formula': '{cumulative_sum}',
                'format_type': 'currency',
                'format_options': {'decimal_places': 2},
                'width': 150,
                'order': 6
            }
        ]
        
        for col_config in columns_config:
            ReportColumn.objects.create(
                template=report,
                owner=report.owner,
                branch=report.branch,
                created_by=created_by,
                tenant=report.tenant,
                **col_config
            )
        
        # Add charts
        charts_config = [
            {
                'name': 'balance_trend',
                'chart_type': 'line',
                'title': 'Balance Trend',
                'description': 'Account balance over time',
                'data_config': {
                    'x_axis': 'transaction_date',
                    'y_axis': 'running_balance',
                    'aggregation': 'last'
                },
                'display_config': {
                    'colors': ['#3b82f6'],
                    'show_legend': False,
                    'show_grid': True,
                    'height': 300
                },
                'position': 'top',
                'order': 1
            },
            {
                'name': 'transaction_types',
                'chart_type': 'pie',
                'title': 'Transaction Types',
                'description': 'Breakdown by transaction type',
                'data_config': {
                    'category': 'transaction__transaction_type',
                    'value': 'amount',
                    'aggregation': 'sum'
                },
                'display_config': {
                    'colors': ['#10b981', '#ef4444', '#f59e0b'],
                    'show_legend': True,
                    'height': 300
                },
                'position': 'bottom',
                'order': 1
            },
            {
                'name': 'monthly_summary',
                'chart_type': 'bar',
                'title': 'Monthly Activity',
                'description': 'Deposits and withdrawals by month',
                'data_config': {
                    'x_axis': 'month',
                    'series': ['deposits', 'withdrawals'],
                    'aggregation': 'sum'
                },
                'display_config': {
                    'colors': ['#10b981', '#ef4444'],
                    'show_legend': True,
                    'show_grid': True,
                    'height': 300
                },
                'position': 'bottom',
                'order': 2
            }
        ]
        
        for chart_config in charts_config:
            ReportChart.objects.create(
                template=report,
                owner=report.owner,
                branch=report.branch,
                created_by=created_by,
                tenant=report.tenant,
                **chart_config
            )
        
        return report
    
    @classmethod
    def _generate_loan_report(cls, account: Account, created_by) -> ReportTemplate:
        """Generate loan account report"""
        
        report = ReportTemplate.objects.create(
            owner=account.owner,
            branch=account.branch,
            created_by=created_by,
            tenant=account.tenant,
            name=f"{account.name} - Loan Report",
            code=f"loan_report_{account.code.replace('-', '_').lower()}",
            description=f"Loan performance report for {account.name} showing payments, balance, and repayment schedule",
            report_type='financial',
            access_level='internal',
            is_auto_generated=True,
            linked_account=account,
            primary_entity='TransactionEntry',
            allowed_entities=['TransactionEntry', 'Transaction', 'LoanAccount', 'LoanRepaymentSchedule'],
            allowed_fields=[
                'transaction__date', 'transaction__reference_number',
                'transaction__description', 'amount', 'side',
                'transaction__created_by__username'
            ],
            allowed_calculations=['sum', 'avg', 'count'],
            max_rows=10000,
            default_date_range='current_year',
            is_active=True,
            is_editable=True,
            report_config={
                'data_sources': [
                    {
                        'entity': 'TransactionEntry',
                        'alias': 'entries',
                        'relation_type': 'main'
                    }
                ],
                'filters': [
                    {
                        'field': 'account',
                        'operator': 'exact',
                        'value': account.id
                    }
                ],
                'ordering': ['-transaction__date']
            }
        )
        
        cls._create_date_range_parameters(report)
        
        # Loan-specific columns
        loan_columns = [
            {
                'name': 'payment_date',
                'code': 'payment_date',
                'column_type': 'field',
                'label': 'Payment Date',
                'field_path': 'transaction__date',
                'format_type': 'date',
                'width': 120,
                'order': 1
            },
            {
                'name': 'payment_amount',
                'code': 'payment_amount',
                'column_type': 'field',
                'label': 'Payment Amount',
                'field_path': 'amount',
                'format_type': 'currency',
                'width': 150,
                'order': 2
            },
            {
                'name': 'principal',
                'code': 'principal',
                'column_type': 'calculation',
                'label': 'Principal',
                'formula': '{amount} * 0.8',  # Simplified - real calculation is more complex
                'format_type': 'currency',
                'width': 150,
                'order': 3
            },
            {
                'name': 'interest',
                'code': 'interest',
                'column_type': 'calculation',
                'label': 'Interest',
                'formula': '{amount} * 0.2',
                'format_type': 'currency',
                'width': 150,
                'order': 4
            }
        ]
        
        for col in loan_columns:
            ReportColumn.objects.create(
                template=report,
                owner=report.owner,
                branch=report.branch,
                created_by=created_by,
                tenant=report.tenant,
                **col
            )
        
        return report
    
    @classmethod
    def _generate_asset_report(cls, account: Account, created_by) -> ReportTemplate:
        """Generate asset account report"""
        
        report = ReportTemplate.objects.create(
            owner=account.owner,
            branch=account.branch,
            created_by=created_by,
            tenant=account.tenant,
            name=f"{account.name} - Asset Report",
            code=f"asset_report_{account.code.replace('-', '_').lower()}",
            description=f"Asset tracking and valuation report for {account.name}",
            report_type='financial',
            access_level='internal',
            is_auto_generated=True,
            linked_account=account,
            primary_entity='TransactionEntry',
            allowed_entities=['TransactionEntry', 'Transaction'],
            allowed_fields=[
                'transaction__date', 'transaction__reference_number',
                'transaction__description', 'amount', 'side'
            ],
            allowed_calculations=['sum', 'avg', 'count'],
            max_rows=10000,
            default_date_range='current_year',
            is_active=True,
            is_editable=True,
            report_config={
                'data_sources': [
                    {
                        'entity': 'TransactionEntry',
                        'alias': 'entries'
                    }
                ],
                'filters': [
                    {
                        'field': 'account',
                        'operator': 'exact',
                        'value': account.id
                    }
                ]
            }
        )
        
        cls._create_date_range_parameters(report)
        
        return report
    
    @classmethod
    def _generate_expense_report(cls, account: Account, created_by) -> ReportTemplate:
        """Generate expense account report"""
        
        report = ReportTemplate.objects.create(
            owner=account.owner,
            branch=account.branch,
            created_by=created_by,
            tenant=account.tenant,
            name=f"{account.name} - Expense Report",
            code=f"expense_report_{account.code.replace('-', '_').lower()}",
            description=f"Expense tracking and analysis for {account.name}",
            report_type='financial',
            access_level='internal',
            is_auto_generated=True,
            linked_account=account,
            primary_entity='TransactionEntry',
            allowed_entities=['TransactionEntry', 'Transaction'],
            allowed_fields=[
                'transaction__date', 'transaction__reference_number',
                'transaction__description', 'amount'
            ],
            allowed_calculations=['sum', 'avg', 'count'],
            max_rows=10000,
            default_date_range='current_month',
            is_active=True,
            is_editable=True,
            report_config={
                'data_sources': [
                    {
                        'entity': 'TransactionEntry',
                        'alias': 'entries'
                    }
                ],
                'filters': [
                    {
                        'field': 'account',
                        'operator': 'exact',
                        'value': account.id
                    },
                    {
                        'field': 'side',
                        'operator': 'exact',
                        'value': 'DR'  # Expenses are debited
                    }
                ]
            }
        )
        
        cls._create_date_range_parameters(report)
        
        return report
    
    @classmethod
    def _generate_income_report(cls, account: Account, created_by) -> ReportTemplate:
        """Generate income account report"""
        
        report = ReportTemplate.objects.create(
            owner=account.owner,
            branch=account.branch,
            created_by=created_by,
            tenant=account.tenant,
            name=f"{account.name} - Income Report",
            code=f"income_report_{account.code.replace('-', '_').lower()}",
            description=f"Income analysis for {account.name} showing income trends and breakdowns",
            report_type='financial',
            access_level='internal',
            is_auto_generated=True,
            linked_account=account,
            primary_entity='TransactionEntry',
            allowed_entities=['TransactionEntry', 'Transaction'],
            allowed_fields=[
                'transaction__date', 'amount',
                'transaction__description'
            ],
            allowed_calculations=['sum', 'avg', 'count'],
            max_rows=10000,
            default_date_range='current_year',
            is_active=True,
            is_editable=True,
            report_config={
                'data_sources': [
                    {
                        'entity': 'TransactionEntry',
                        'alias': 'entries'
                    }
                ],
                'filters': [
                    {
                        'field': 'account',
                        'operator': 'exact',
                        'value': account.id
                    },
                    {
                        'field': 'side',
                        'operator': 'exact',
                        'value': 'CR'  # Income is credited
                    }
                ]
            }
        )
        
        cls._create_date_range_parameters(report)
        
        return report
    
    @classmethod
    def _generate_general_report(cls, account: Account, created_by) -> ReportTemplate:
        """Generate general account report"""
        
        report = ReportTemplate.objects.create(
            owner=account.owner,
            branch=account.branch,
            created_by=created_by,
            tenant=account.tenant,
            name=f"{account.name} - Account Report",
            code=f"account_report_{account.code.replace('-', '_').lower()}",
            description=f"Transaction history and analysis for {account.name}",
            report_type='financial',
            access_level='internal',
            is_auto_generated=True,
            linked_account=account,
            primary_entity='TransactionEntry',
            allowed_entities=['TransactionEntry', 'Transaction'],
            allowed_fields=[
                'transaction__date', 'transaction__reference_number',
                'transaction__description', 'amount', 'side'
            ],
            allowed_calculations=['sum', 'avg', 'count'],
            max_rows=10000,
            default_date_range='current_month',
            is_active=True,
            is_editable=True,
            report_config={
                'data_sources': [
                    {
                        'entity': 'TransactionEntry',
                        'alias': 'entries'
                    }
                ],
                'filters': [
                    {
                        'field': 'account',
                        'operator': 'exact',
                        'value': account.id
                    }
                ]
            }
        )
        
        cls._create_date_range_parameters(report)
        
        return report
    
    @classmethod
    def _create_date_range_parameters(cls, report: ReportTemplate):
        """Create standard date range parameters"""
        ReportParameter.objects.create(
            template=report,
            owner=report.owner,
            branch=report.branch,
            created_by=report.created_by,
            tenant=report.tenant,
            name='start_date',
            code='start_date',
            parameter_type='date',
            label='Start Date',
            description='Beginning of date range',
            is_required=True,
            order=1
        )
        
        ReportParameter.objects.create(
            template=report,
            owner=report.owner,
            branch=report.branch,
            created_by=report.created_by,
            tenant=report.tenant,
            name='end_date',
            code='end_date',
            parameter_type='date',
            label='End Date',
            description='End of date range',
            is_required=True,
            order=2
        )

    @classmethod
    @transaction.atomic
    def generate_for_product(cls, product: Product, created_by) -> ReportTemplate:
        """
        Generate a comprehensive report for a product
        
        Creates:
        - Account performance by product
        - Transaction analysis
        - Product usage metrics
        - Validation statistics
        """
        # Create report template
        report = ReportTemplate.objects.create(
            owner=product.owner,
            branch=product.branch,
            created_by=created_by,
            tenant=product.tenant,
            name=f"{product.name} - Product Performance Report",
            code=f"product_report_{product.code.replace('-', '_').lower()}",
            description=f"Comprehensive report for {product.name} showing account performance, transaction trends, and product metrics",
            report_type='analytical',
            access_level='internal',
            is_auto_generated=True,
            linked_product=product,
            primary_entity='Account',
            allowed_entities=['Account', 'Transaction', 'TransactionEntry', 'Product'],
            allowed_fields=[
                'account__name', 'account__account_number', 'account__balance',
                'account__created_at', 'account__is_active',
                'transaction__date', 'transaction__reference_number',
                'transaction__description', 'amount', 'side',
                'product__name', 'product__code', 'product__product_type'
            ],
            allowed_calculations=['sum', 'avg', 'count', 'min', 'max'],
            max_rows=10000,
            default_date_range='current_month',
            is_active=True,
            is_editable=True,
            report_config={
                'data_sources': [
                    {
                        'entity': 'Account',
                        'alias': 'accounts',
                        'relation_type': 'main'
                    }
                ],
                'filters': [
                    {
                        'field': 'product',
                        'operator': 'exact',
                        'value': product.id
                    },
                    {
                        'field': 'is_active',
                        'operator': 'exact',
                        'value': True
                    }
                ],
                'ordering': ['-created_at'],
                'layout': {
                    'sections': [
                        {
                            'id': 'summary',
                            'title': 'Product Summary',
                            'position': 'top',
                            'widgets': ['kpi_cards', 'account_distribution']
                        },
                        {
                            'id': 'accounts',
                            'title': 'Accounts Using This Product',
                            'position': 'main',
                            'widgets': ['account_table']
                        },
                        {
                            'id': 'transactions',
                            'title': 'Transaction Analysis',
                            'position': 'main',
                            'widgets': ['transaction_volume', 'transaction_trends']
                        },
                        {
                            'id': 'validation',
                            'title': 'Validation & Compliance',
                            'position': 'bottom',
                            'widgets': ['validation_stats', 'limit_usage']
                        }
                    ]
                }
            }
        )
        
        # Add parameters
        cls._create_product_report_parameters(report)
        
        # Add columns
        columns_config = [
            {
                'name': 'account_name',
                'code': 'account_name',
                'column_type': 'field',
                'label': 'Account Name',
                'field_path': 'name',
                'format_type': 'text',
                'width': 200,
                'order': 1
            },
            {
                'name': 'account_number',
                'code': 'account_number',
                'column_type': 'field',
                'label': 'Account Number',
                'field_path': 'account_number',
                'format_type': 'text',
                'width': 150,
                'order': 2
            },
            {
                'name': 'balance',
                'code': 'balance',
                'column_type': 'field',
                'label': 'Current Balance',
                'field_path': 'balance',
                'format_type': 'currency',
                'format_options': {'decimal_places': 2},
                'width': 150,
                'order': 3,
                'conditional_formatting': [
                    {
                        'condition': 'value < 0',
                        'style': {'color': '#ef4444', 'fontWeight': 'bold'}
                    },
                    {
                        'condition': 'value >= 0',
                        'style': {'color': '#10b981'}
                    }
                ]
            },
            {
                'name': 'created_date',
                'code': 'created_date',
                'column_type': 'field',
                'label': 'Date Opened',
                'field_path': 'created_at',
                'format_type': 'date',
                'format_options': {'format': '%Y-%m-%d'},
                'width': 120,
                'order': 4
            },
            {
                'name': 'status',
                'code': 'status',
                'column_type': 'field',
                'label': 'Status',
                'field_path': 'is_active',
                'format_type': 'boolean',
                'format_options': {
                    'true_label': 'Active',
                    'false_label': 'Inactive'
                },
                'width': 100,
                'order': 5
            }
        ]
        
        for col_config in columns_config:
            ReportColumn.objects.create(
                template=report,
                owner=report.owner,
                branch=report.branch,
                created_by=created_by,
                tenant=report.tenant,
                **col_config
            )
        
        # Add charts
        charts_config = [
            {
                'name': 'account_distribution',
                'chart_type': 'pie',
                'title': 'Account Status Distribution',
                'description': 'Active vs Inactive accounts',
                'data_config': {
                    'category': 'is_active',
                    'value': 'id',
                    'aggregation': 'count'
                },
                'display_config': {
                    'colors': ['#10b981', '#ef4444'],
                    'show_legend': True,
                    'height': 300
                },
                'position': 'top',
                'order': 1
            },
            {
                'name': 'balance_distribution',
                'chart_type': 'bar',
                'title': 'Account Balances',
                'description': 'Distribution of account balances',
                'data_config': {
                    'x_axis': 'account_number',
                    'y_axis': 'balance',
                    'aggregation': 'sum'
                },
                'display_config': {
                    'colors': ['#3b82f6'],
                    'show_legend': False,
                    'show_grid': True,
                    'height': 400
                },
                'position': 'main',
                'order': 2
            }
        ]
        
        for chart_config in charts_config:
            ReportChart.objects.create(
                template=report,
                owner=report.owner,
                branch=report.branch,
                created_by=created_by,
                tenant=report.tenant,
                **chart_config
            )
        
        return report
    
    @classmethod
    def _create_product_report_parameters(cls, report: ReportTemplate):
        """Create parameters for product reports"""
        ReportParameter.objects.create(
            template=report,
            owner=report.owner,
            branch=report.branch,
            created_by=report.created_by,
            tenant=report.tenant,
            name='include_inactive',
            code='include_inactive',
            parameter_type='boolean',
            label='Include Inactive Accounts',
            description='Show inactive accounts in report',
            is_required=False,
            default_value=False,
            order=1
        )
        
        ReportParameter.objects.create(
            template=report,
            owner=report.owner,
            branch=report.branch,
            created_by=report.created_by,
            tenant=report.tenant,
            name='min_balance',
            code='min_balance',
            parameter_type='number',
            label='Minimum Balance Filter',
            description='Only show accounts with balance above this amount',
            is_required=False,
            validation_rules={'min': 0},
            order=2
        )