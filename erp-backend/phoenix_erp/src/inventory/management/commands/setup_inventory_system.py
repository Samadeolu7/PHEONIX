# inventory/management/commands/setup_inventory_system.py
"""
Management command to set up the complete inventory management system:
- Form schemas for inventory workflows
- Module pages for inventory UI (dashboard, items, stock, movements, transfers, allocations)
- Workflow templates for inventory automation (alerts, replenishment, transfers)
- Report templates for inventory analytics

Usage:
    python manage.py setup_inventory_system [--user-id=X] [--skip-forms] [--skip-workflows] [--skip-pages] [--skip-reports]
"""

from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.db import transaction
from automations.models import FormSchema, WorkflowTemplate, WorkflowType, WorkflowAccessLevel
from pages.models import Module, ModulePage
from reports.models import ReportTemplate
import json

User = get_user_model()


class Command(BaseCommand):
    help = 'Sets up inventory system: forms, workflows, pages, and reports'
    
    def add_arguments(self, parser):
        parser.add_argument(
            '--user-id',
            type=int,
            help='User ID to use as creator (defaults to first superuser)'
        )
        parser.add_argument(
            '--skip-forms',
            action='store_true',
            help='Skip form schema creation'
        )
        parser.add_argument(
            '--skip-workflows',
            action='store_true',
            help='Skip workflow template creation'
        )
        parser.add_argument(
            '--skip-pages',
            action='store_true',
            help='Skip module page creation'
        )
        parser.add_argument(
            '--skip-reports',
            action='store_true',
            help='Skip report template creation'
        )
    
    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('\n🚀 Starting Inventory System Setup...\n'))
        
        # Get user
        user_id = options.get('user_id')
        if user_id:
            try:
                user = User.objects.get(id=user_id)
            except User.DoesNotExist:
                self.stdout.write(self.style.ERROR(f'User with ID {user_id} not found'))
                return
        else:
            user = User.objects.filter(is_superuser=True).first()
            if not user:
                self.stdout.write(self.style.ERROR('No superuser found'))
                return
        
        self.stdout.write(f'👤 Using user: {user.get_full_name()} ({user.email})')
        
        owner = user.owner
        branch = user.branch
        
        # Create components
        try:
            if not options.get('skip_forms'):
                self.create_form_schemas(owner, branch, user)
            
            if not options.get('skip_workflows'):
                self.create_workflow_templates(owner, branch, user)
            
            if not options.get('skip_pages'):
                self.create_module_pages(owner, branch, user)
            
            if not options.get('skip_reports'):
                self.create_report_templates(owner, branch, user)
            
            self.stdout.write(self.style.SUCCESS('\n✅ Inventory System Setup Complete!\n'))
            self.print_next_steps()
            
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'\n❌ Setup failed: {str(e)}\n'))
            raise
    
    def create_form_schemas(self, owner, branch, user):
        """Create form schemas for inventory workflows"""
        self.stdout.write('\n📝 Creating Form Schemas...')
        
        forms = [
            {
                'name': 'Stock Transfer Request',
                'description': 'Request to transfer inventory between locations',
                'trigger_event_name': 'stock-transfer-requested',
                'schema': {
                    'fields': [
                        {
                            'name': 'from_location',
                            'type': 'select',
                            'label': 'From Location',
                            'required': True,
                            'api_endpoint': '/api/inventory/locations/',
                            'display_field': 'name',
                            'value_field': 'id'
                        },
                        {
                            'name': 'to_location',
                            'type': 'select',
                            'label': 'To Location',
                            'required': True,
                            'api_endpoint': '/api/inventory/locations/',
                            'display_field': 'name',
                            'value_field': 'id'
                        },
                        {
                            'name': 'items',
                            'type': 'items_list',
                            'label': 'Items to Transfer',
                            'required': True,
                            'min_items': 1,
                            'item_schema': {
                                'item': {
                                    'type': 'select',
                                    'label': 'Item',
                                    'required': True,
                                    'api_endpoint': '/api/inventory/items/',
                                    'display_field': 'name',
                                    'value_field': 'id'
                                },
                                'quantity': {
                                    'type': 'number',
                                    'label': 'Quantity',
                                    'required': True,
                                    'min': 1
                                }
                            }
                        },
                        {
                            'name': 'reason',
                            'type': 'textarea',
                            'label': 'Reason for Transfer',
                            'required': True
                        },
                        {
                            'name': 'requested_date',
                            'type': 'date',
                            'label': 'Requested Transfer Date',
                            'required': True
                        }
                    ]
                }
            },
            {
                'name': 'Stock Adjustment',
                'description': 'Adjust inventory quantities (add/remove stock)',
                'trigger_event_name': 'stock-adjustment-submitted',
                'schema': {
                    'fields': [
                        {
                            'name': 'location',
                            'type': 'select',
                            'label': 'Location',
                            'required': True,
                            'api_endpoint': '/api/inventory/locations/',
                            'display_field': 'name',
                            'value_field': 'id'
                        },
                        {
                            'name': 'adjustments',
                            'type': 'items_list',
                            'label': 'Adjustments',
                            'required': True,
                            'min_items': 1,
                            'item_schema': {
                                'item': {
                                    'type': 'select',
                                    'label': 'Item',
                                    'required': True,
                                    'api_endpoint': '/api/inventory/items/',
                                    'display_field': 'name',
                                    'value_field': 'id'
                                },
                                'adjustment_quantity': {
                                    'type': 'number',
                                    'label': 'Adjustment Quantity (+ or -)',
                                    'required': True
                                },
                                'reason': {
                                    'type': 'select',
                                    'label': 'Reason',
                                    'required': True,
                                    'options': [
                                        {'value': 'damage', 'label': 'Damaged Items'},
                                        {'value': 'theft', 'label': 'Theft/Loss'},
                                        {'value': 'expired', 'label': 'Expired Items'},
                                        {'value': 'found', 'label': 'Found Items'},
                                        {'value': 'count_discrepancy', 'label': 'Physical Count Discrepancy'},
                                        {'value': 'other', 'label': 'Other'}
                                    ]
                                }
                            }
                        },
                        {
                            'name': 'notes',
                            'type': 'textarea',
                            'label': 'Additional Notes',
                            'required': False
                        }
                    ]
                }
            },
            {
                'name': 'Low Stock Alert Configuration',
                'description': 'Configure automated low stock alerts',
                'trigger_event_name': 'low-stock-alert-configured',
                'schema': {
                    'fields': [
                        {
                            'name': 'item',
                            'type': 'select',
                            'label': 'Inventory Item',
                            'required': True,
                            'api_endpoint': '/api/inventory/items/',
                            'display_field': 'name',
                            'value_field': 'id'
                        },
                        {
                            'name': 'reorder_level',
                            'type': 'number',
                            'label': 'Reorder Level',
                            'required': True,
                            'min': 0,
                            'help_text': 'Alert when stock falls below this quantity'
                        },
                        {
                            'name': 'reorder_quantity',
                            'type': 'number',
                            'label': 'Reorder Quantity',
                            'required': True,
                            'min': 1,
                            'help_text': 'Quantity to reorder when stock is low'
                        },
                        {
                            'name': 'notification_recipients',
                            'type': 'multi_select',
                            'label': 'Notify Users',
                            'required': True,
                            'api_endpoint': '/api/users/',
                            'display_field': 'full_name',
                            'value_field': 'id'
                        }
                    ]
                }
            }
        ]
        
        for form_data in forms:
            form, created = FormSchema.objects.update_or_create(
                owner=owner,
                branch=branch,
                name=form_data['name'],
                defaults={
                    'description': form_data['description'],
                    'schema': form_data['schema'],
                    'trigger_event_name': form_data['trigger_event_name'],
                    'is_active': True
                }
            )
            status = '✓ Created' if created else '↻ Updated'
            self.stdout.write(f'  {status}: {form.name}')
        
        self.stdout.write(self.style.SUCCESS(f'✅ Created {len(forms)} form schemas'))
    
    def create_workflow_templates(self, owner, branch, user):
        """Create workflow templates for inventory automation"""
        self.stdout.write('\n🔄 Creating Workflow Templates...')
        
        workflows = [
            {
                'name': 'Automatic Stock Transfer',
                'code': 'auto-stock-transfer',
                'description': 'Automatically process stock transfers with approval for large quantities',
                'workflow_type': WorkflowType.EVENT_DRIVEN,
                'access_level': WorkflowAccessLevel.PRIVATE,
                'trigger': {
                    'type': 'event',
                    'event_name': 'stock-transfer-requested'
                },
                'steps': [
                    {
                        'id': 'check_quantity',
                        'name': 'Check Transfer Quantity',
                        'type': 'condition',
                        'config': {
                            'conditions': [
                                {
                                    'field': 'total_items',
                                    'operator': 'gt',
                                    'value': 100
                                }
                            ],
                            'true_next': 'require_approval',
                            'false_next': 'process_transfer'
                        }
                    },
                    {
                        'id': 'require_approval',
                        'name': 'Require Manager Approval',
                        'type': 'approval',
                        'config': {
                            'approver_role': 'inventory_manager',
                            'approval_message': 'Large stock transfer requires approval',
                            'timeout_hours': 24,
                            'on_approved': 'process_transfer',
                            'on_rejected': 'send_rejection_notification'
                        }
                    },
                    {
                        'id': 'process_transfer',
                        'name': 'Process Stock Transfer',
                        'type': 'api_call',
                        'config': {
                            'method': 'POST',
                            'endpoint': '/api/inventory/stock-movements/transfer/',
                            'body': {
                                'from_location_id': '{{form.from_location}}',
                                'to_location_id': '{{form.to_location}}',
                                'items': '{{form.items}}',
                                'reference_number': 'TRF-{{workflow.run_id}}'
                            }
                        }
                    },
                    {
                        'id': 'send_notification',
                        'name': 'Send Transfer Notification',
                        'type': 'notification',
                        'config': {
                            'recipients': ['{{form.submitted_by}}'],
                            'subject': 'Stock Transfer Completed',
                            'template': 'Your stock transfer from {{from_location.name}} to {{to_location.name}} has been completed.'
                        }
                    }
                ]
            },
            {
                'name': 'Low Stock Alert & Auto-Reorder',
                'code': 'low-stock-alert',
                'description': 'Check stock levels daily and alert/auto-reorder when low',
                'workflow_type': WorkflowType.SCHEDULED,
                'access_level': WorkflowAccessLevel.SHARED,
                'trigger': {
                    'type': 'schedule',
                    'cron': '0 8 * * *',  # Daily at 8 AM
                    'timezone': 'UTC'
                },
                'steps': [
                    {
                        'id': 'query_low_stock',
                        'name': 'Find Low Stock Items',
                        'type': 'query',
                        'config': {
                            'query_type': 'inventory_stock',
                            'filters': {
                                'quantity_on_hand__lte': 'F(item__reorder_level)'
                            },
                            'output_variable': 'low_stock_items'
                        }
                    },
                    {
                        'id': 'check_items_found',
                        'name': 'Check if Low Stock Items Found',
                        'type': 'condition',
                        'config': {
                            'conditions': [
                                {
                                    'field': 'low_stock_items.length',
                                    'operator': 'gt',
                                    'value': 0
                                }
                            ],
                            'true_next': 'loop_items',
                            'false_next': 'end'
                        }
                    },
                    {
                        'id': 'loop_items',
                        'name': 'Process Each Low Stock Item',
                        'type': 'loop',
                        'config': {
                            'collection': '{{low_stock_items}}',
                            'loop_variable': 'stock_item',
                            'steps': [
                                {
                                    'id': 'send_alert',
                                    'name': 'Send Low Stock Alert',
                                    'type': 'notification',
                                    'config': {
                                        'recipients': ['inventory_manager', 'purchasing_manager'],
                                        'subject': 'Low Stock Alert: {{stock_item.item.name}}',
                                        'template': 'Item {{stock_item.item.name}} (SKU: {{stock_item.item.sku}}) is low at {{stock_item.location.name}}. Current: {{stock_item.quantity_on_hand}}, Reorder Level: {{stock_item.item.reorder_level}}'
                                    }
                                },
                                {
                                    'id': 'check_auto_reorder',
                                    'name': 'Check if Auto-Reorder Enabled',
                                    'type': 'condition',
                                    'config': {
                                        'conditions': [
                                            {
                                                'field': 'stock_item.item.auto_reorder_enabled',
                                                'operator': 'eq',
                                                'value': True
                                            }
                                        ],
                                        'true_next': 'create_pr',
                                        'false_next': 'continue'
                                    }
                                },
                                {
                                    'id': 'create_pr',
                                    'name': 'Create Purchase Requisition',
                                    'type': 'api_call',
                                    'config': {
                                        'method': 'POST',
                                        'endpoint': '/api/procurement/requisitions/',
                                        'body': {
                                            'department': 'inventory',
                                            'purpose': 'Auto-reorder for low stock',
                                            'items': [
                                                {
                                                    'item_id': '{{stock_item.item.id}}',
                                                    'quantity': '{{stock_item.item.reorder_quantity}}',
                                                    'estimated_unit_price': '{{stock_item.item.last_purchase_price}}'
                                                }
                                            ]
                                        }
                                    }
                                }
                            ]
                        }
                    }
                ]
            },
            {
                'name': 'Stock Adjustment Approval',
                'code': 'stock-adjustment-approval',
                'description': 'Route stock adjustments through approval if significant',
                'workflow_type': WorkflowType.EVENT_DRIVEN,
                'access_level': WorkflowAccessLevel.PRIVATE,
                'trigger': {
                    'type': 'event',
                    'event_name': 'stock-adjustment-submitted'
                },
                'steps': [
                    {
                        'id': 'calculate_total_value',
                        'name': 'Calculate Total Adjustment Value',
                        'type': 'calculation',
                        'config': {
                            'variable_name': 'total_value',
                            'expression': 'sum(form.adjustments, adj => abs(adj.adjustment_quantity) * adj.item.average_cost)'
                        }
                    },
                    {
                        'id': 'check_value_threshold',
                        'name': 'Check if Requires Approval',
                        'type': 'condition',
                        'config': {
                            'conditions': [
                                {
                                    'field': 'total_value',
                                    'operator': 'gt',
                                    'value': 50000  # Threshold amount
                                }
                            ],
                            'true_next': 'require_approval',
                            'false_next': 'process_adjustment'
                        }
                    },
                    {
                        'id': 'require_approval',
                        'name': 'Get Manager Approval',
                        'type': 'approval',
                        'config': {
                            'approver_role': 'inventory_manager',
                            'approval_message': 'High-value stock adjustment requires approval (₦{{total_value}})',
                            'timeout_hours': 48,
                            'on_approved': 'process_adjustment',
                            'on_rejected': 'send_rejection'
                        }
                    },
                    {
                        'id': 'process_adjustment',
                        'name': 'Process Stock Adjustments',
                        'type': 'transaction',
                        'config': {
                            'steps': [
                                {
                                    'type': 'api_call',
                                    'endpoint': '/api/inventory/stock-movements/adjust/',
                                    'method': 'POST',
                                    'body': {
                                        'location_id': '{{form.location}}',
                                        'adjustments': '{{form.adjustments}}',
                                        'notes': '{{form.notes}}',
                                        'reference_number': 'ADJ-{{workflow.run_id}}'
                                    }
                                },
                                {
                                    'type': 'notification',
                                    'recipients': ['{{form.submitted_by}}', 'inventory_manager'],
                                    'subject': 'Stock Adjustment Processed',
                                    'template': 'Stock adjustments at {{location.name}} have been processed.'
                                }
                            ]
                        }
                    },
                    {
                        'id': 'send_rejection',
                        'name': 'Send Rejection Notification',
                        'type': 'notification',
                        'config': {
                            'recipients': ['{{form.submitted_by}}'],
                            'subject': 'Stock Adjustment Rejected',
                            'template': 'Your stock adjustment request has been rejected.'
                        }
                    }
                ]
            }
        ]
        
        for workflow_data in workflows:
            workflow, created = WorkflowTemplate.objects.update_or_create(
                owner=owner,
                branch=branch,
                code=workflow_data['code'],
                defaults={
                    'name': workflow_data['name'],
                    'description': workflow_data['description'],
                    'workflow_type': workflow_data['workflow_type'],
                    'access_level': workflow_data['access_level'],
                    'trigger_config': workflow_data['trigger'],
                    'steps_config': workflow_data['steps'],
                    'is_active': True,
                    'created_by': user
                }
            )
            status = '✓ Created' if created else '↻ Updated'
            self.stdout.write(f'  {status}: {workflow.name}')
        
        self.stdout.write(self.style.SUCCESS(f'✅ Created {len(workflows)} workflow templates'))
    
    def create_module_pages(self, owner, branch, user):
        """Create module pages for inventory UI"""
        self.stdout.write('\n📄 Creating Module Pages...')
        
        # Get or create Inventory module
        module, _ = Module.objects.get_or_create(
            owner=owner,
            branch=branch,
            code='inventory',
            defaults={
                'name': 'Inventory',
                'description': 'Inventory and stock management',
                'icon': 'package',
                'color': '#8b5cf6',
                'order': 3,
                'is_active': True
            }
        )
        
        pages = [
            {
                'code': 'inventory-dashboard',
                'title': 'Inventory Dashboard',
                'description': 'Overview of inventory status and metrics',
                'icon': 'layout-dashboard',
                'page_type': 'dashboard',
                'show_in_menu': True,
                'order': 1,
                'page_config': {
                    'widgets': [
                        {
                            'id': 'total_value',
                            'type': 'stat',
                            'title': 'Total Inventory Value',
                            'dataSource': {
                                'endpoint': '/api/inventory/analytics/total-value/',
                                'valueField': 'total_value'
                            },
                            'format': 'currency',
                            'icon': 'dollar-sign',
                            'color': '#10b981'
                        },
                        {
                            'id': 'low_stock_items',
                            'type': 'stat',
                            'title': 'Low Stock Items',
                            'dataSource': {
                                'endpoint': '/api/inventory/stock/',
                                'params': {'needs_reorder': True},
                                'countField': 'count'
                            },
                            'icon': 'alert-triangle',
                            'color': '#f59e0b'
                        },
                        {
                            'id': 'pending_transfers',
                            'type': 'stat',
                            'title': 'Pending Transfers',
                            'dataSource': {
                                'endpoint': '/api/inventory/stock-movements/',
                                'params': {'movement_type': 'transfer', 'status': 'pending'},
                                'countField': 'count'
                            },
                            'icon': 'truck',
                            'color': '#3b82f6'
                        },
                        {
                            'id': 'items_count',
                            'type': 'stat',
                            'title': 'Total Items',
                            'dataSource': {
                                'endpoint': '/api/inventory/items/',
                                'params': {'is_active': True},
                                'countField': 'count'
                            },
                            'icon': 'package',
                            'color': '#8b5cf6'
                        },
                        {
                            'id': 'stock_by_category',
                            'type': 'chart',
                            'title': 'Stock Value by Category',
                            'chartType': 'pie',
                            'dataSource': {
                                'endpoint': '/api/inventory/analytics/stock-by-category/'
                            }
                        },
                        {
                            'id': 'recent_movements',
                            'type': 'list',
                            'title': 'Recent Stock Movements',
                            'dataSource': {
                                'endpoint': '/api/inventory/stock-movements/',
                                'params': {'ordering': '-movement_date', 'limit': 10}
                            },
                            'displayFields': ['reference_number', 'item_name', 'movement_type', 'quantity', 'movement_date']
                        },
                        {
                            'id': 'low_stock_alerts',
                            'type': 'list',
                            'title': 'Items Needing Reorder',
                            'dataSource': {
                                'endpoint': '/api/inventory/stock/',
                                'params': {'needs_reorder': True, 'limit': 10}
                            },
                            'displayFields': ['item_name', 'location_name', 'quantity_on_hand', 'reorder_level']
                        }
                    ]
                }
            },
            {
                'code': 'inventory-items',
                'title': 'Inventory Items',
                'description': 'Manage inventory items and SKUs',
                'icon': 'package',
                'page_type': 'list',
                'show_in_menu': True,
                'order': 2,
                'page_config': {
                    'entity': 'InventoryItem',
                    'apiEndpoint': '/api/inventory/items/',
                    'columns': [
                        {'field': 'sku', 'label': 'SKU', 'sortable': True, 'searchable': True},
                        {'field': 'name', 'label': 'Name', 'sortable': True, 'searchable': True},
                        {'field': 'category.name', 'label': 'Category', 'sortable': True, 'filterable': True},
                        {'field': 'unit_of_measure', 'label': 'Unit', 'sortable': True},
                        {'field': 'reorder_level', 'label': 'Reorder Level', 'type': 'number'},
                        {'field': 'is_active', 'label': 'Active', 'type': 'boolean'}
                    ],
                    'filters': [
                        {
                            'field': 'category',
                            'type': 'select',
                            'label': 'Category',
                            'api_endpoint': '/api/inventory/categories/'
                        },
                        {
                            'field': 'is_active',
                            'type': 'boolean',
                            'label': 'Active Only'
                        }
                    ],
                    'actions': [
                        {
                            'id': 'view',
                            'label': 'View',
                            'icon': 'eye',
                            'type': 'detail',
                            'url': '/inventory/items/{{id}}'
                        },
                        {
                            'id': 'edit',
                            'label': 'Edit',
                            'icon': 'edit',
                            'type': 'navigate',
                            'url': '/inventory/items/{{id}}/edit'
                        },
                        {
                            'id': 'view_stock',
                            'label': 'Stock Levels',
                            'icon': 'bar-chart',
                            'type': 'modal',
                            'endpoint': '/api/inventory/items/{{id}}/stock-levels/'
                        }
                    ],
                    'defaultSort': {'field': 'name', 'order': 'asc'}
                }
            },
            {
                'code': 'stock-levels',
                'title': 'Stock Levels',
                'description': 'View current stock levels by location',
                'icon': 'bar-chart',
                'page_type': 'list',
                'show_in_menu': True,
                'order': 3,
                'page_config': {
                    'entity': 'InventoryStock',
                    'apiEndpoint': '/api/inventory/stock/',
                    'columns': [
                        {'field': 'item.sku', 'label': 'SKU', 'sortable': True, 'searchable': True},
                        {'field': 'item.name', 'label': 'Item', 'sortable': True, 'searchable': True},
                        {'field': 'location.name', 'label': 'Location', 'sortable': True, 'filterable': True},
                        {'field': 'quantity_on_hand', 'label': 'On Hand', 'type': 'number', 'sortable': True},
                        {'field': 'quantity_reserved', 'label': 'Reserved', 'type': 'number'},
                        {'field': 'quantity_available', 'label': 'Available', 'type': 'number'},
                        {'field': 'average_cost', 'label': 'Avg Cost', 'type': 'currency'},
                        {'field': 'total_value', 'label': 'Total Value', 'type': 'currency'},
                        {'field': 'needs_reorder', 'label': 'Reorder', 'type': 'badge'}
                    ],
                    'filters': [
                        {
                            'field': 'location',
                            'type': 'select',
                            'label': 'Location',
                            'api_endpoint': '/api/inventory/locations/'
                        },
                        {
                            'field': 'needs_reorder',
                            'type': 'boolean',
                            'label': 'Needs Reorder Only'
                        }
                    ],
                    'actions': [
                        {
                            'id': 'adjust',
                            'label': 'Adjust Stock',
                            'icon': 'edit',
                            'type': 'modal',
                            'form': 'stock-adjustment-form'
                        },
                        {
                            'id': 'transfer',
                            'label': 'Transfer',
                            'icon': 'truck',
                            'type': 'modal',
                            'form': 'stock-transfer-form'
                        }
                    ],
                    'defaultSort': {'field': 'item.name', 'order': 'asc'}
                }
            },
            {
                'code': 'stock-movements',
                'title': 'Stock Movements',
                'description': 'Track all inventory movements',
                'icon': 'activity',
                'page_type': 'custom',
                'show_in_menu': True,
                'order': 4,
                'page_config': {
                    'component': 'StockMovementTracker',
                    'props': {
                        'enableFilters': True,
                        'showStockLevels': True
                    }
                }
            },
            {
                'code': 'allocations',
                'title': 'Allocations & Redemptions',
                'description': 'Manage inventory allocations and redemptions',
                'icon': 'gift',
                'page_type': 'custom',
                'show_in_menu': True,
                'order': 5,
                'page_config': {
                    'component': 'AllocationRedemptionManager',
                    'props': {
                        'enableMeterReading': True,
                        'enableAnomalyDetection': True
                    }
                }
            },
            {
                'code': 'locations',
                'title': 'Locations',
                'description': 'Manage storage locations',
                'icon': 'map-pin',
                'page_type': 'list',
                'show_in_menu': True,
                'order': 6,
                'page_config': {
                    'entity': 'Location',
                    'apiEndpoint': '/api/inventory/locations/',
                    'columns': [
                        {'field': 'code', 'label': 'Code', 'sortable': True, 'searchable': True},
                        {'field': 'name', 'label': 'Name', 'sortable': True, 'searchable': True},
                        {'field': 'location_type', 'label': 'Type', 'sortable': True, 'filterable': True},
                        {'field': 'is_active', 'label': 'Active', 'type': 'boolean'}
                    ],
                    'actions': [
                        {
                            'id': 'view',
                            'label': 'View',
                            'icon': 'eye',
                            'type': 'detail',
                            'url': '/inventory/locations/{{id}}'
                        },
                        {
                            'id': 'view_stock',
                            'label': 'View Stock',
                            'icon': 'package',
                            'type': 'navigate',
                            'url': '/inventory/stock-levels?location={{id}}'
                        }
                    ],
                    'defaultSort': {'field': 'name', 'order': 'asc'}
                }
            }
        ]
        
        for page_data in pages:
            page, created = ModulePage.objects.update_or_create(
                owner=owner,
                branch=branch,
                module=module,
                code=page_data['code'],
                defaults={
                    'title': page_data['title'],
                    'description': page_data['description'],
                    'icon': page_data['icon'],
                    'page_type': page_data['page_type'],
                    'page_config': page_data['page_config'],
                    'show_in_menu': page_data['show_in_menu'],
                    'order': page_data['order'],
                    'is_active': True
                }
            )
            status = '✓ Created' if created else '↻ Updated'
            self.stdout.write(f'  {status}: {page.title}')
        
        self.stdout.write(self.style.SUCCESS(f'✅ Created {len(pages)} module pages'))
    
    def create_report_templates(self, owner, branch, user):
        """Create report templates for inventory analytics"""
        self.stdout.write('\n📊 Creating Report Templates...')
        
        reports = [
            {
                'name': 'Inventory Valuation Report',
                'code': 'inventory-valuation',
                'description': 'Current inventory value by category and location',
                'query': '''
                    SELECT 
                        ic.name as category,
                        l.name as location,
                        ii.sku,
                        ii.name as item_name,
                        ins.quantity_on_hand,
                        ins.average_cost,
                        (ins.quantity_on_hand * ins.average_cost) as total_value
                    FROM inventory_inventorystock ins
                    JOIN inventory_inventoryitem ii ON ins.item_id = ii.id
                    JOIN inventory_inventorycategory ic ON ii.category_id = ic.id
                    JOIN inventory_location l ON ins.location_id = l.id
                    WHERE ii.is_active = TRUE AND ins.quantity_on_hand > 0
                    ORDER BY total_value DESC
                ''',
                'columns': [
                    {'code': 'category', 'name': 'Category', 'data_type': 'text'},
                    {'code': 'location', 'name': 'Location', 'data_type': 'text'},
                    {'code': 'sku', 'name': 'SKU', 'data_type': 'text'},
                    {'code': 'item_name', 'name': 'Item Name', 'data_type': 'text'},
                    {'code': 'quantity_on_hand', 'name': 'Quantity', 'data_type': 'integer'},
                    {'code': 'average_cost', 'name': 'Avg Cost', 'data_type': 'decimal'},
                    {'code': 'total_value', 'name': 'Total Value', 'data_type': 'decimal'}
                ],
                'parameters': [
                    {
                        'code': 'category',
                        'name': 'Category',
                        'parameter_type': 'select',
                        'is_required': False
                    },
                    {
                        'code': 'location',
                        'name': 'Location',
                        'parameter_type': 'select',
                        'is_required': False
                    }
                ]
            },
            {
                'name': 'Stock Movement Summary',
                'code': 'stock-movement-summary',
                'description': 'Summary of stock movements by type and period',
                'query': '''
                    SELECT 
                        sm.movement_type,
                        DATE(sm.movement_date) as movement_date,
                        COUNT(*) as transaction_count,
                        SUM(sm.quantity) as total_quantity,
                        SUM(sm.total_cost) as total_value
                    FROM inventory_stockmovement sm
                    WHERE sm.movement_date BETWEEN :date_from AND :date_to
                    GROUP BY sm.movement_type, DATE(sm.movement_date)
                    ORDER BY movement_date DESC, movement_type
                ''',
                'columns': [
                    {'code': 'movement_type', 'name': 'Type', 'data_type': 'text'},
                    {'code': 'movement_date', 'name': 'Date', 'data_type': 'date'},
                    {'code': 'transaction_count', 'name': 'Transactions', 'data_type': 'integer'},
                    {'code': 'total_quantity', 'name': 'Total Qty', 'data_type': 'decimal'},
                    {'code': 'total_value', 'name': 'Total Value', 'data_type': 'decimal'}
                ],
                'parameters': [
                    {
                        'code': 'date_from',
                        'name': 'From Date',
                        'parameter_type': 'date',
                        'is_required': True
                    },
                    {
                        'code': 'date_to',
                        'name': 'To Date',
                        'parameter_type': 'date',
                        'is_required': True
                    }
                ]
            },
            {
                'name': 'Low Stock Items Report',
                'code': 'low-stock-items',
                'description': 'Items at or below reorder level',
                'query': '''
                    SELECT 
                        ii.sku,
                        ii.name as item_name,
                        l.name as location,
                        ins.quantity_on_hand,
                        ii.reorder_level,
                        ii.reorder_quantity,
                        (ii.reorder_level - ins.quantity_on_hand) as shortage,
                        ins.average_cost,
                        (ii.reorder_quantity * ins.average_cost) as reorder_cost
                    FROM inventory_inventorystock ins
                    JOIN inventory_inventoryitem ii ON ins.item_id = ii.id
                    JOIN inventory_location l ON ins.location_id = l.id
                    WHERE ii.is_active = TRUE 
                      AND ins.quantity_on_hand <= ii.reorder_level
                    ORDER BY shortage DESC
                ''',
                'columns': [
                    {'code': 'sku', 'name': 'SKU', 'data_type': 'text'},
                    {'code': 'item_name', 'name': 'Item', 'data_type': 'text'},
                    {'code': 'location', 'name': 'Location', 'data_type': 'text'},
                    {'code': 'quantity_on_hand', 'name': 'Current Stock', 'data_type': 'decimal'},
                    {'code': 'reorder_level', 'name': 'Reorder Level', 'data_type': 'decimal'},
                    {'code': 'reorder_quantity', 'name': 'Reorder Qty', 'data_type': 'decimal'},
                    {'code': 'shortage', 'name': 'Shortage', 'data_type': 'decimal'},
                    {'code': 'reorder_cost', 'name': 'Est. Reorder Cost', 'data_type': 'decimal'}
                ],
                'parameters': []
            }
        ]
        
        for report_data in reports:
            report, created = ReportTemplate.objects.update_or_create(
                owner=owner,
                branch=branch,
                code=report_data['code'],
                defaults={
                    'name': report_data['name'],
                    'description': report_data['description'],
                    'query': report_data['query'],
                    'is_active': True,
                    'created_by': user
                }
            )
            
            # Create columns
            if created:
                for i, col_data in enumerate(report_data['columns']):
                    report.columns.create(
                        code=col_data['code'],
                        name=col_data['name'],
                        data_type=col_data['data_type'],
                        order=i
                    )
                
                # Create parameters
                for i, param_data in enumerate(report_data['parameters']):
                    report.parameters.create(
                        code=param_data['code'],
                        name=param_data['name'],
                        parameter_type=param_data['parameter_type'],
                        is_required=param_data['is_required'],
                        order=i
                    )
            
            status = '✓ Created' if created else '↻ Updated'
            self.stdout.write(f'  {status}: {report.name}')
        
        self.stdout.write(self.style.SUCCESS(f'✅ Created {len(reports)} report templates'))
    
    def print_next_steps(self):
        """Print next steps for user"""
        self.stdout.write('\n' + '='*60)
        self.stdout.write(self.style.SUCCESS('📚 NEXT STEPS:'))
        self.stdout.write('='*60 + '\n')
        self.stdout.write('1. Run the backend server:')
        self.stdout.write('   python manage.py runserver\n')
        self.stdout.write('2. Access inventory dashboard:')
        self.stdout.write('   http://localhost:3000/inventory/dashboard\n')
        self.stdout.write('3. Available pages:')
        self.stdout.write('   • /inventory/dashboard - Overview & KPIs')
        self.stdout.write('   • /inventory/items - Manage items')
        self.stdout.write('   • /inventory/stock-levels - View stock')
        self.stdout.write('   • /inventory/stock-movements - Track movements')
        self.stdout.write('   • /inventory/allocations - Manage allocations')
        self.stdout.write('   • /inventory/locations - Manage locations\n')
        self.stdout.write('4. Test workflows:')
        self.stdout.write('   • Create stock transfer (triggers auto-approval)')
        self.stdout.write('   • Submit stock adjustment (triggers approval if high value)')
        self.stdout.write('   • Wait for daily low-stock check (8 AM UTC)\n')
        self.stdout.write('='*60 + '\n')
