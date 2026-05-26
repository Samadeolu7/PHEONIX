# inventory/management/commands/setup_allocation_system.py
"""
Management command to automatically create:
- Form schemas for allocation workflows
- Module pages for allocation UI
- Report templates for tracking
- Workflow templates for automation
"""
from django.core.management.base import BaseCommand
from django.db import transaction
from django.contrib.auth import get_user_model
from automations.models import FormSchema, WorkflowTemplate, WorkflowType, WorkflowAccessLevel
from pages.models import Module, ModulePage, PageWidget, QuickAction
from reports.models import ReportTemplate, ReportParameter, ReportColumn
from accounts.models import Account

User = get_user_model()


class Command(BaseCommand):
    help = 'Set up allocation system: forms, pages, workflows, and reports'
    
    def add_arguments(self, parser):
        parser.add_argument(
            '--user-id',
            type=int,
            help='User ID to assign as owner (defaults to first superuser)'
        )
        parser.add_argument(
            '--skip-forms',
            action='store_true',
            help='Skip form schema creation'
        )
        parser.add_argument(
            '--skip-pages',
            action='store_true',
            help='Skip module page creation'
        )
        parser.add_argument(
            '--skip-workflows',
            action='store_true',
            help='Skip workflow template creation'
        )
        parser.add_argument(
            '--skip-reports',
            action='store_true',
            help='Skip report template creation'
        )
    
    @transaction.atomic
    def handle(self, *args, **options):
        # Get user
        user_id = options.get('user_id')
        if user_id:
            user = User.objects.get(id=user_id)
        else:
            user = User.objects.filter(is_superuser=True).first()
            if not user:
                self.stdout.write(self.style.ERROR('No superuser found. Please create one first.'))
                return
        
        self.stdout.write(self.style.SUCCESS(f'Setting up allocation system for user: {user.username}'))
        
        # Create components
        if not options['skip_forms']:
            self.create_form_schemas(user)
        
        if not options['skip_pages']:
            self.create_module_pages(user)
        
        if not options['skip_workflows']:
            self.create_workflow_templates(user)
        
        if not options['skip_reports']:
            self.create_report_templates(user)
        
        self.stdout.write(self.style.SUCCESS('✅ Allocation system setup complete!'))
    
    def create_form_schemas(self, user):
        """Create form schemas for allocation workflows"""
        self.stdout.write('Creating form schemas...')
        
        # 1. Invoice Payment Form (triggers allocation workflow)
        invoice_payment_form, created = FormSchema.objects.get_or_create(
            name='Invoice Payment Form',
            owner=user,
            branch=user.branch,
            defaults={
                'description': 'Form to record invoice payments and trigger allocation workflows',
                'trigger_event_name': 'invoice-paid',
                'schema': {
                    'fields': [
                        {
                            'name': 'invoice_id',
                            'type': 'select',
                            'label': 'Invoice',
                            'required': True,
                            'data_source': '/api/invoices/?status=unpaid'
                        },
                        {
                            'name': 'payment_amount',
                            'type': 'number',
                            'label': 'Payment Amount',
                            'required': True,
                            'min': 0
                        },
                        {
                            'name': 'payment_method',
                            'type': 'select',
                            'label': 'Payment Method',
                            'required': True,
                            'options': [
                                {'value': 'cash', 'label': 'Cash'},
                                {'value': 'bank_transfer', 'label': 'Bank Transfer'},
                                {'value': 'card', 'label': 'Card'},
                                {'value': 'cheque', 'label': 'Cheque'}
                            ]
                        },
                        {
                            'name': 'payment_reference',
                            'type': 'text',
                            'label': 'Payment Reference',
                            'required': False
                        },
                        {
                            'name': 'payment_date',
                            'type': 'date',
                            'label': 'Payment Date',
                            'required': True,
                            'default': 'today'
                        }
                    ]
                },
                'is_active': True,
                'created_by': user
            }
        )
        if created:
            self.stdout.write(self.style.SUCCESS('  ✓ Invoice Payment Form'))
        
        # 2. Manual Allocation Form
        manual_allocation_form, created = FormSchema.objects.get_or_create(
            name='Manual Allocation Form',
            owner=user,
            branch=user.branch,
            defaults={
                'description': 'Form to manually create inventory allocations',
                'trigger_event_name': 'allocation-created',
                'schema': {
                    'fields': [
                        {
                            'name': 'client_id',
                            'type': 'select',
                            'label': 'Client',
                            'required': True,
                            'data_source': '/api/clients/?is_active=true'
                        },
                        {
                            'name': 'allocation_type',
                            'type': 'select',
                            'label': 'Allocation Type',
                            'required': True,
                            'options': [
                                {'value': 'monetary', 'label': 'Monetary'},
                                {'value': 'item_specific', 'label': 'Item Specific'},
                                {'value': 'fuel', 'label': 'Fuel'},
                                {'value': 'mixed', 'label': 'Mixed'}
                            ]
                        },
                        {
                            'name': 'allocated_amount',
                            'type': 'number',
                            'label': 'Allocated Amount',
                            'required': True,
                            'min': 0
                        },
                        {
                            'name': 'valid_from',
                            'type': 'date',
                            'label': 'Valid From',
                            'required': True,
                            'default': 'today'
                        },
                        {
                            'name': 'valid_until',
                            'type': 'date',
                            'label': 'Valid Until',
                            'required': False
                        },
                        {
                            'name': 'items',
                            'type': 'repeater',
                            'label': 'Items',
                            'required': False,
                            'fields': [
                                {
                                    'name': 'item_id',
                                    'type': 'select',
                                    'label': 'Item',
                                    'required': True,
                                    'data_source': '/api/inventory/items/summary/'
                                },
                                {
                                    'name': 'quantity',
                                    'type': 'number',
                                    'label': 'Quantity',
                                    'required': True,
                                    'min': 1
                                },
                                {
                                    'name': 'is_one_time_only',
                                    'type': 'checkbox',
                                    'label': 'One-Time Only',
                                    'default': False
                                }
                            ]
                        },
                        {
                            'name': 'notes',
                            'type': 'textarea',
                            'label': 'Notes',
                            'required': False
                        }
                    ]
                },
                'is_active': True,
                'created_by': user
            }
        )
        if created:
            self.stdout.write(self.style.SUCCESS('  ✓ Manual Allocation Form'))
        
        # 3. Quick Redemption Form
        quick_redemption_form, created = FormSchema.objects.get_or_create(
            name='Quick Redemption Form',
            owner=user,
            branch=user.branch,
            defaults={
                'description': 'Quick form for processing redemptions',
                'trigger_event_name': 'redemption-processed',
                'schema': {
                    'fields': [
                        {
                            'name': 'allocation_search',
                            'type': 'autocomplete',
                            'label': 'Search Allocation',
                            'required': True,
                            'data_source': '/api/inventory/allocations/search/',
                            'search_param': 'query',
                            'display_field': 'allocation_number'
                        },
                        {
                            'name': 'items',
                            'type': 'dynamic_list',
                            'label': 'Items to Redeem',
                            'required': True,
                            'depends_on': 'allocation_search',
                            'data_source': '/api/inventory/allocations/{allocation_search}/items/'
                        },
                        {
                            'name': 'meter_reading',
                            'type': 'number',
                            'label': 'Meter Reading',
                            'required': False,
                            'conditional': {
                                'field': 'allocation_type',
                                'equals': 'fuel'
                            }
                        },
                        {
                            'name': 'notes',
                            'type': 'textarea',
                            'label': 'Notes',
                            'required': False
                        }
                    ]
                },
                'is_active': True,
                'created_by': user
            }
        )
        if created:
            self.stdout.write(self.style.SUCCESS('  ✓ Quick Redemption Form'))
    
    def create_module_pages(self, user):
        """Create module pages for allocation system"""
        self.stdout.write('Creating module pages...')
        
        # Get or create Inventory module
        inventory_module, created = Module.objects.get_or_create(
            code='inventory',
            owner=user,
            defaults={
                'name': 'Inventory',
                'description': 'Inventory and allocation management',
                'icon': 'package',
                'color': '#8b5cf6',
                'order': 4,
                'is_active': True,
                'created_by': user
            }
        )
        if created:
            self.stdout.write(self.style.SUCCESS('  ✓ Inventory Module'))
        
        # 1. Allocation Dashboard
        allocation_dashboard, created = ModulePage.objects.get_or_create(
            module=inventory_module,
            code='allocation-dashboard',
            owner=user,
            defaults={
                'title': 'Allocation Dashboard',
                'description': 'Overview of allocations and redemptions',
                'icon': 'layout-dashboard',
                'page_type': 'dashboard',
                'page_config': {
                    'widgets': [
                        {
                            'type': 'kpi',
                            'title': 'Active Allocations',
                            'data_source': '/api/inventory/allocations/?status=active',
                            'value_field': 'count'
                        },
                        {
                            'type': 'kpi',
                            'title': 'Total Allocated',
                            'data_source': '/api/inventory/allocations/stats/',
                            'value_field': 'total_allocated',
                            'format': 'currency'
                        },
                        {
                            'type': 'kpi',
                            'title': 'Total Redeemed',
                            'data_source': '/api/inventory/allocations/stats/',
                            'value_field': 'total_redeemed',
                            'format': 'currency'
                        },
                        {
                            'type': 'chart',
                            'title': 'Redemptions Over Time',
                            'chart_type': 'line',
                            'data_source': '/api/inventory/redemptions/chart/',
                            'x_field': 'date',
                            'y_field': 'amount'
                        },
                        {
                            'type': 'table',
                            'title': 'Recent Redemptions',
                            'data_source': '/api/inventory/redemptions/recent/',
                            'columns': ['redemption_number', 'client_name', 'total_amount', 'redemption_date']
                        }
                    ]
                },
                'show_in_menu': True,
                'order': 1,
                'is_active': True,
                'created_by': user
            }
        )
        if created:
            self.stdout.write(self.style.SUCCESS('  ✓ Allocation Dashboard'))
        
        # 2. Allocation List Page
        allocation_list, created = ModulePage.objects.get_or_create(
            module=inventory_module,
            code='allocations',
            owner=user,
            defaults={
                'title': 'Allocations',
                'description': 'Manage inventory allocations',
                'icon': 'gift',
                'page_type': 'list',
                'page_config': {
                    'entity': 'inventory.InventoryAllocation',
                    'api_endpoint': '/api/inventory/allocations/',
                    'columns': [
                        {'field': 'allocation_number', 'label': 'Number', 'sortable': True},
                        {'field': 'client_name', 'label': 'Client', 'sortable': True},
                        {'field': 'allocation_type', 'label': 'Type', 'sortable': True},
                        {'field': 'allocated_amount', 'label': 'Allocated', 'format': 'currency'},
                        {'field': 'remaining_amount', 'label': 'Remaining', 'format': 'currency'},
                        {'field': 'status', 'label': 'Status', 'badge': True}
                    ],
                    'filters': [
                        {'field': 'status', 'type': 'select', 'options': ['active', 'suspended', 'completed', 'expired']},
                        {'field': 'allocation_type', 'type': 'select', 'options': ['monetary', 'item_specific', 'fuel', 'mixed']},
                        {'field': 'client', 'type': 'autocomplete', 'data_source': '/api/clients/'}
                    ],
                    'actions': [
                        {'label': 'View Details', 'action': 'view', 'icon': 'eye'},
                        {'label': 'Add Item', 'action': 'add_item', 'icon': 'plus'},
                        {'label': 'Suspend', 'action': 'suspend', 'icon': 'pause', 'confirm': True},
                        {'label': 'Close', 'action': 'close', 'icon': 'x', 'confirm': True}
                    ]
                },
                'show_in_menu': True,
                'order': 2,
                'is_active': True,
                'created_by': user
            }
        )
        if created:
            self.stdout.write(self.style.SUCCESS('  ✓ Allocations List'))
        
        # 3. Redemption Manager Page (Custom React Component)
        redemption_manager, created = ModulePage.objects.get_or_create(
            module=inventory_module,
            code='redemption-manager',
            owner=user,
            defaults={
                'title': 'Redemption Manager',
                'description': 'Process allocation redemptions',
                'icon': 'shopping-cart',
                'page_type': 'custom',
                'page_config': {
                    'component': 'AllocationRedemptionManager',
                    'props': {
                        'api_base': '/api/inventory'
                    }
                },
                'show_in_menu': True,
                'order': 3,
                'is_active': True,
                'created_by': user
            }
        )
        if created:
            self.stdout.write(self.style.SUCCESS('  ✓ Redemption Manager'))
        
        # 4. Redemption History Page
        redemption_history, created = ModulePage.objects.get_or_create(
            module=inventory_module,
            code='redemption-history',
            owner=user,
            defaults={
                'title': 'Redemption History',
                'description': 'View all redemption transactions',
                'icon': 'history',
                'page_type': 'list',
                'page_config': {
                    'entity': 'inventory.AllocationRedemption',
                    'api_endpoint': '/api/inventory/redemptions/',
                    'columns': [
                        {'field': 'redemption_number', 'label': 'Number', 'sortable': True},
                        {'field': 'client_name', 'label': 'Client', 'sortable': True},
                        {'field': 'total_amount', 'label': 'Amount', 'format': 'currency'},
                        {'field': 'redemption_date', 'label': 'Date', 'format': 'date'},
                        {'field': 'redeemed_by_name', 'label': 'Processed By'},
                        {'field': 'approved', 'label': 'Approved', 'format': 'boolean'}
                    ],
                    'filters': [
                        {'field': 'date_from', 'type': 'date', 'label': 'From Date'},
                        {'field': 'date_to', 'type': 'date', 'label': 'To Date'},
                        {'field': 'allocation', 'type': 'autocomplete', 'data_source': '/api/inventory/allocations/'}
                    ]
                },
                'show_in_menu': True,
                'order': 4,
                'is_active': True,
                'created_by': user
            }
        )
        if created:
            self.stdout.write(self.style.SUCCESS('  ✓ Redemption History'))
    
    def create_workflow_templates(self, user):
        """Create workflow templates"""
        self.stdout.write('Creating workflow templates...')
        
        # 1. Invoice Payment → Allocation Workflow
        invoice_workflow, created = WorkflowTemplate.objects.get_or_create(
            name='Invoice Payment to Allocation',
            owner=user,
            branch=user.branch,
            defaults={
                'description': 'Automatically create allocation when invoice is paid',
                'workflow_type': WorkflowType.TEMPLATE,
                'access_level': WorkflowAccessLevel.INTERNAL,
                'category': 'inventory',
                'trigger_type': 'event',
                'trigger_config': {
                    'event_name': 'invoice-paid',
                    'filters': {
                        'invoice_type__in': ['school_supplies', 'fuel_voucher', 'service_contract']
                    }
                },
                'workflow_definition': {
                    'initial_step': 'validate_invoice',
                    'steps': [
                        {
                            'id': 'validate_invoice',
                            'type': 'condition',
                            'name': 'Validate Invoice',
                            'config': {
                                'condition': 'context.payment_amount >= context.invoice_amount',
                                'on_true': 'create_allocation',
                                'on_false': 'log_partial_payment'
                            }
                        },
                        {
                            'id': 'create_allocation',
                            'type': 'transaction',
                            'name': 'Create Allocation',
                            'config': {
                                'action': 'api_call',
                                'method': 'POST',
                                'endpoint': '/api/inventory/allocations/',
                                'data': {
                                    'client': '{{context.client_id}}',
                                    'allocation_type': '{{context.allocation_type}}',
                                    'allocated_amount': '{{context.payment_amount}}',
                                    'linked_invoice': '{{context.invoice_id}}',
                                    'valid_from': '{{context.payment_date}}',
                                    'notes': 'Auto-created from invoice payment'
                                }
                            },
                            'next': 'add_allocation_items'
                        },
                        {
                            'id': 'add_allocation_items',
                            'type': 'loop',
                            'name': 'Add Items to Allocation',
                            'config': {
                                'iterate_over': 'context.invoice_items',
                                'item_var': 'invoice_item',
                                'steps': [
                                    {
                                        'id': 'create_item',
                                        'type': 'transaction',
                                        'config': {
                                            'action': 'api_call',
                                            'method': 'POST',
                                            'endpoint': '/api/inventory/allocations/{{variables.allocation_id}}/add_item/',
                                            'data': {
                                                'item': '{{invoice_item.item_id}}',
                                                'allocated_quantity': '{{invoice_item.quantity}}',
                                                'unit_price': '{{invoice_item.unit_price}}',
                                                'is_one_time_only': '{{invoice_item.is_uniform}}'
                                            }
                                        }
                                    }
                                ]
                            },
                            'next': 'send_notification'
                        },
                        {
                            'id': 'send_notification',
                            'type': 'notification',
                            'name': 'Notify Client',
                            'config': {
                                'template': 'allocation_created',
                                'recipient': '{{context.client_email}}',
                                'data': {
                                    'allocation_number': '{{variables.allocation_number}}',
                                    'amount': '{{context.payment_amount}}'
                                }
                            },
                            'next': 'end'
                        },
                        {
                            'id': 'log_partial_payment',
                            'type': 'log',
                            'name': 'Log Partial Payment',
                            'config': {
                                'level': 'warning',
                                'message': 'Partial payment received, allocation not created'
                            },
                            'next': 'end'
                        }
                    ]
                },
                'is_atomic': False,
                'is_active': True,
                'created_by': user
            }
        )
        if created:
            self.stdout.write(self.style.SUCCESS('  ✓ Invoice Payment to Allocation Workflow'))
        
        # 2. Low Balance Replenishment Workflow
        replenish_workflow, created = WorkflowTemplate.objects.get_or_create(
            name='Auto-Replenish Low Balance Allocations',
            owner=user,
            branch=user.branch,
            defaults={
                'description': 'Automatically replenish allocations below threshold',
                'workflow_type': WorkflowType.TEMPLATE,
                'access_level': WorkflowAccessLevel.INTERNAL,
                'category': 'inventory',
                'trigger_type': 'schedule',
                'trigger_config': {
                    'schedule': 'daily',
                    'time': '06:00'
                },
                'workflow_definition': {
                    'initial_step': 'find_low_allocations',
                    'steps': [
                        {
                            'id': 'find_low_allocations',
                            'type': 'query',
                            'name': 'Find Low Balance Allocations',
                            'config': {
                                'action': 'api_call',
                                'method': 'GET',
                                'endpoint': '/api/inventory/allocations/?auto_replenish=true',
                                'store_as': 'allocations'
                            },
                            'next': 'process_replenishments'
                        },
                        {
                            'id': 'process_replenishments',
                            'type': 'loop',
                            'name': 'Process Replenishments',
                            'config': {
                                'iterate_over': 'variables.allocations',
                                'item_var': 'allocation',
                                'steps': [
                                    {
                                        'id': 'check_threshold',
                                        'type': 'condition',
                                        'config': {
                                            'condition': 'allocation.remaining_amount < allocation.replenish_threshold',
                                            'on_true': 'replenish',
                                            'on_false': 'skip'
                                        }
                                    },
                                    {
                                        'id': 'replenish',
                                        'type': 'transaction',
                                        'config': {
                                            'action': 'api_call',
                                            'method': 'PATCH',
                                            'endpoint': '/api/inventory/allocations/{{allocation.id}}/',
                                            'data': {
                                                'allocated_amount': '{{allocation.allocated_amount + allocation.replenish_amount}}'
                                            }
                                        }
                                    }
                                ]
                            },
                            'next': 'end'
                        }
                    ]
                },
                'is_atomic': False,
                'is_active': True,
                'created_by': user
            }
        )
        if created:
            self.stdout.write(self.style.SUCCESS('  ✓ Auto-Replenishment Workflow'))
    
    def create_report_templates(self, user):
        """Create report templates"""
        self.stdout.write('Creating report templates...')
        
        # Get cash/bank accounts for report filters
        cash_account = Account.objects.filter(
            owner=user,
            account_type='ASSET',
            code__icontains='cash'
        ).first()
        
        # 1. Allocation Summary Report
        allocation_report, created = ReportTemplate.objects.get_or_create(
            name='Allocation Summary Report',
            code='allocation_summary',
            owner=user,
            branch=user.branch,
            defaults={
                'description': 'Summary of all allocations by status and type',
                'category': 'inventory',
                'data_source': 'inventory.InventoryAllocation',
                'query_config': {
                    'base_query': 'SELECT * FROM inventory_inventoryallocation',
                    'filters': [],
                    'grouping': ['allocation_type', 'status']
                },
                'is_active': True,
                'created_by': user
            }
        )
        if created:
            # Add columns
            ReportColumn.objects.create(
                report=allocation_report,
                name='allocation_type',
                code='allocation_type',
                label='Allocation Type',
                column_type='field',
                field_path='allocation_type',
                format_type='text',
                is_visible=True,
                order=1
            )
            ReportColumn.objects.create(
                report=allocation_report,
                name='status',
                code='status',
                label='Status',
                column_type='field',
                field_path='status',
                format_type='text',
                is_visible=True,
                order=2
            )
            ReportColumn.objects.create(
                report=allocation_report,
                name='count',
                code='count',
                label='Count',
                column_type='aggregation',
                aggregation_function='COUNT',
                field_path='id',
                format_type='number',
                is_visible=True,
                order=3
            )
            ReportColumn.objects.create(
                report=allocation_report,
                name='total_allocated',
                code='total_allocated',
                label='Total Allocated',
                column_type='aggregation',
                aggregation_function='SUM',
                field_path='allocated_amount',
                format_type='currency',
                is_visible=True,
                order=4
            )
            ReportColumn.objects.create(
                report=allocation_report,
                name='total_redeemed',
                code='total_redeemed',
                label='Total Redeemed',
                column_type='aggregation',
                aggregation_function='SUM',
                field_path='redeemed_amount',
                format_type='currency',
                is_visible=True,
                order=5
            )
            
            # Add parameters
            ReportParameter.objects.create(
                report=allocation_report,
                name='date_from',
                code='date_from',
                parameter_type='date',
                label='From Date',
                is_required=False,
                order=1
            )
            ReportParameter.objects.create(
                report=allocation_report,
                name='date_to',
                code='date_to',
                parameter_type='date',
                label='To Date',
                is_required=False,
                order=2
            )
            ReportParameter.objects.create(
                report=allocation_report,
                name='status',
                code='status',
                parameter_type='select',
                label='Status',
                is_required=False,
                parameter_config={
                    'options': [
                        {'value': 'active', 'label': 'Active'},
                        {'value': 'suspended', 'label': 'Suspended'},
                        {'value': 'completed', 'label': 'Completed'},
                        {'value': 'expired', 'label': 'Expired'}
                    ]
                },
                order=3
            )
            
            self.stdout.write(self.style.SUCCESS('  ✓ Allocation Summary Report'))
        
        # 2. Redemption Detail Report
        redemption_report, created = ReportTemplate.objects.get_or_create(
            name='Redemption Detail Report',
            code='redemption_detail',
            owner=user,
            branch=user.branch,
            defaults={
                'description': 'Detailed list of all redemption transactions',
                'category': 'inventory',
                'data_source': 'inventory.AllocationRedemption',
                'query_config': {
                    'base_query': 'SELECT * FROM inventory_allocationredemption',
                    'joins': [
                        'LEFT JOIN inventory_inventoryallocation ON inventory_allocationredemption.allocation_id = inventory_inventoryallocation.id',
                        'LEFT JOIN clients_client ON inventory_inventoryallocation.client_id = clients_client.id'
                    ]
                },
                'is_active': True,
                'created_by': user
            }
        )
        if created:
            # Add columns
            columns = [
                ('redemption_number', 'Redemption Number', 'text', 'redemption_number'),
                ('redemption_date', 'Date', 'date', 'redemption_date'),
                ('client_name', 'Client', 'text', 'allocation__client__name'),
                ('allocation_number', 'Allocation Number', 'text', 'allocation__allocation_number'),
                ('total_amount', 'Amount', 'currency', 'total_amount'),
                ('payment_method', 'Payment Method', 'text', 'payment_method'),
                ('meter_reading', 'Meter Reading', 'number', 'meter_reading'),
                ('fuel_efficiency', 'Fuel Efficiency', 'number', 'fuel_efficiency'),
                ('approved', 'Approved', 'boolean', 'approved')
            ]
            
            for i, (code, label, format_type, field_path) in enumerate(columns, 1):
                ReportColumn.objects.create(
                    report=redemption_report,
                    name=code,
                    code=code,
                    label=label,
                    column_type='field',
                    field_path=field_path,
                    format_type=format_type,
                    is_visible=True,
                    order=i
                )
            
            # Add parameters
            ReportParameter.objects.create(
                report=redemption_report,
                name='date_from',
                code='date_from',
                parameter_type='date',
                label='From Date',
                is_required=True,
                order=1
            )
            ReportParameter.objects.create(
                report=redemption_report,
                name='date_to',
                code='date_to',
                parameter_type='date',
                label='To Date',
                is_required=True,
                order=2
            )
            ReportParameter.objects.create(
                report=redemption_report,
                name='client',
                code='client',
                parameter_type='account',  # Reusing account type for client selection
                label='Client (Optional)',
                is_required=False,
                order=3
            )
            
            self.stdout.write(self.style.SUCCESS('  ✓ Redemption Detail Report'))
        
        # 3. Fuel Efficiency Report
        fuel_report, created = ReportTemplate.objects.get_or_create(
            name='Fuel Efficiency Report',
            code='fuel_efficiency',
            owner=user,
            branch=user.branch,
            defaults={
                'description': 'Fuel consumption and efficiency analysis',
                'category': 'inventory',
                'data_source': 'inventory.AllocationRedemption',
                'query_config': {
                    'base_query': 'SELECT * FROM inventory_allocationredemption WHERE allocation__allocation_type = \'fuel\'',
                    'joins': [
                        'LEFT JOIN inventory_inventoryallocation ON inventory_allocationredemption.allocation_id = inventory_inventoryallocation.id'
                    ]
                },
                'is_active': True,
                'created_by': user
            }
        )
        if created:
            # Add columns
            columns = [
                ('redemption_date', 'Date', 'date', 'redemption_date'),
                ('asset_name', 'Asset', 'text', 'allocation__linked_asset__name'),
                ('distance_traveled', 'Distance (km)', 'number', 'distance_traveled'),
                ('fuel_amount', 'Fuel Amount', 'currency', 'total_amount'),
                ('fuel_efficiency', 'Efficiency (km/L)', 'number', 'fuel_efficiency'),
                ('efficiency_variance', 'Variance (%)', 'percent', 'efficiency_variance'),
                ('anomaly_detected', 'Anomaly', 'boolean', 'anomaly_detected')
            ]
            
            for i, (code, label, format_type, field_path) in enumerate(columns, 1):
                ReportColumn.objects.create(
                    report=fuel_report,
                    name=code,
                    code=code,
                    label=label,
                    column_type='field',
                    field_path=field_path,
                    format_type=format_type,
                    is_visible=True,
                    order=i
                )
            
            self.stdout.write(self.style.SUCCESS('  ✓ Fuel Efficiency Report'))
