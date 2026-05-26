# procurement/management/commands/setup_procurement_system.py
"""
Management command to set up the complete procurement system:
- Form schemas for PR, PO, GRN workflows
- Module pages for procurement management UI
- Workflow templates for procurement automation
- Report templates for procurement analytics

Usage:
    python manage.py setup_procurement_system [--user-id=X] [--skip-forms] [--skip-workflows] [--skip-pages] [--skip-reports]
"""

from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.db import transaction
from automations.models import FormSchema, WorkflowTemplate
from pages.models import Module, ModulePage
from reports.models import ReportTemplate
import json

User = get_user_model()


class Command(BaseCommand):
    help = 'Sets up procurement system: forms, workflows, pages, and reports'
    
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
        self.stdout.write(self.style.SUCCESS('\n🚀 Starting Procurement System Setup...\n'))
        
        # Get user
        user_id = options.get('user_id')
        if user_id:
            try:
                user = User.objects.get(id=user_id)
            except User.DoesNotExist:
                self.stdout.write(self.style.ERROR(f'❌ User with ID {user_id} not found'))
                return
        else:
            user = User.objects.filter(is_superuser=True).first()
            if not user:
                self.stdout.write(self.style.ERROR('❌ No superuser found. Create one first.'))
                return
        
        self.stdout.write(f'👤 Using user: {user.get_full_name()} ({user.email})')
        
        owner = user.owner
        branch = user.branch
        
        # Create components
        try:
            with transaction.atomic():
                if not options['skip_forms']:
                    self.create_form_schemas(owner, branch, user)
                
                if not options['skip_workflows']:
                    self.create_workflow_templates(owner, branch, user)
                
                if not options['skip_pages']:
                    self.create_module_pages(owner, branch, user)
                
                if not options['skip_reports']:
                    self.create_report_templates(owner, branch, user)
            
            self.stdout.write(self.style.SUCCESS('\n✅ Procurement System Setup Complete!\n'))
            self.print_next_steps()
            
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'\n❌ Setup failed: {str(e)}\n'))
            raise
    
    def create_form_schemas(self, owner, branch, user):
        """Create form schemas for procurement workflows"""
        self.stdout.write('\n📝 Creating Form Schemas...')
        
        forms = [
            {
                'name': 'Purchase Requisition Form',
                'description': 'Submit purchase requisition for approval',
                'trigger_event_name': 'pr-submitted',
                'schema': {
                    'fields': [
                        {
                            'name': 'department',
                            'type': 'text',
                            'label': 'Department',
                            'required': True,
                            'placeholder': 'e.g., IT, Admin, Operations'
                        },
                        {
                            'name': 'required_by_date',
                            'type': 'date',
                            'label': 'Required By Date',
                            'required': True,
                            'validation': {
                                'min': 'today'
                            }
                        },
                        {
                            'name': 'purpose',
                            'type': 'textarea',
                            'label': 'Purpose/Justification',
                            'required': True,
                            'placeholder': 'Explain why these items are needed'
                        },
                        {
                            'name': 'items',
                            'type': 'array',
                            'label': 'Items Requested',
                            'required': True,
                            'minItems': 1,
                            'itemSchema': {
                                'type': 'object',
                                'properties': {
                                    'item_id': {
                                        'type': 'select',
                                        'label': 'Item',
                                        'dataSource': 'inventory_items',
                                        'required': True
                                    },
                                    'quantity': {
                                        'type': 'number',
                                        'label': 'Quantity',
                                        'required': True,
                                        'min': 1
                                    },
                                    'estimated_unit_price': {
                                        'type': 'number',
                                        'label': 'Est. Unit Price',
                                        'required': True,
                                        'min': 0
                                    },
                                    'justification': {
                                        'type': 'text',
                                        'label': 'Justification'
                                    }
                                }
                            }
                        }
                    ]
                },
                'metadata': {
                    'category': 'procurement',
                    'icon': 'file-text',
                    'color': '#3b82f6'
                }
            },
            {
                'name': 'Purchase Order Approval Form',
                'description': 'Approve or reject purchase orders',
                'trigger_event_name': 'po-approved',
                'schema': {
                    'fields': [
                        {
                            'name': 'po_id',
                            'type': 'hidden',
                            'required': True
                        },
                        {
                            'name': 'decision',
                            'type': 'radio',
                            'label': 'Decision',
                            'required': True,
                            'options': [
                                {'value': 'approve', 'label': 'Approve'},
                                {'value': 'reject', 'label': 'Reject'}
                            ]
                        },
                        {
                            'name': 'comments',
                            'type': 'textarea',
                            'label': 'Comments',
                            'placeholder': 'Any additional comments or conditions',
                            'showIf': {
                                'field': 'decision',
                                'value': 'approve'
                            }
                        },
                        {
                            'name': 'rejection_reason',
                            'type': 'textarea',
                            'label': 'Rejection Reason',
                            'required': True,
                            'showIf': {
                                'field': 'decision',
                                'value': 'reject'
                            }
                        }
                    ]
                },
                'metadata': {
                    'category': 'procurement',
                    'icon': 'check-circle',
                    'color': '#10b981'
                }
            },
            {
                'name': 'Goods Received Note Form',
                'description': 'Record receipt of purchased goods',
                'trigger_event_name': 'grn-created',
                'schema': {
                    'fields': [
                        {
                            'name': 'purchase_order_id',
                            'type': 'select',
                            'label': 'Purchase Order',
                            'required': True,
                            'dataSource': 'approved_purchase_orders'
                        },
                        {
                            'name': 'received_date',
                            'type': 'date',
                            'label': 'Received Date',
                            'required': True,
                            'default': 'today'
                        },
                        {
                            'name': 'delivery_note_number',
                            'type': 'text',
                            'label': 'Delivery Note #',
                            'placeholder': 'Supplier delivery note number'
                        },
                        {
                            'name': 'items',
                            'type': 'array',
                            'label': 'Items Received',
                            'required': True,
                            'minItems': 1,
                            'itemSchema': {
                                'type': 'object',
                                'properties': {
                                    'po_item_id': {
                                        'type': 'select',
                                        'label': 'PO Item',
                                        'required': True,
                                        'dataSource': 'po_items'
                                    },
                                    'quantity_received': {
                                        'type': 'number',
                                        'label': 'Quantity Received',
                                        'required': True,
                                        'min': 0
                                    },
                                    'quality_status': {
                                        'type': 'select',
                                        'label': 'Quality',
                                        'required': True,
                                        'options': [
                                            {'value': 'good', 'label': 'Good'},
                                            {'value': 'damaged', 'label': 'Damaged'},
                                            {'value': 'defective', 'label': 'Defective'}
                                        ]
                                    },
                                    'batch_number': {
                                        'type': 'text',
                                        'label': 'Batch #'
                                    },
                                    'expiry_date': {
                                        'type': 'date',
                                        'label': 'Expiry Date'
                                    }
                                }
                            }
                        },
                        {
                            'name': 'notes',
                            'type': 'textarea',
                            'label': 'Notes',
                            'placeholder': 'Any observations or issues'
                        }
                    ]
                },
                'metadata': {
                    'category': 'procurement',
                    'icon': 'package',
                    'color': '#8b5cf6'
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
                    'trigger_event_name': form_data['trigger_event_name'],
                    'schema': form_data['schema'],
                    'metadata': form_data['metadata'],
                    'is_active': True
                }
            )
            status = '✓ Created' if created else '↻ Updated'
            self.stdout.write(f'  {status}: {form.name}')
        
        self.stdout.write(self.style.SUCCESS(f'✅ Created {len(forms)} form schemas'))
    
    def create_workflow_templates(self, owner, branch, user):
        """Create workflow templates for procurement automation"""
        self.stdout.write('\n⚙️  Creating Workflow Templates...')
        
        workflows = [
            {
                'name': 'Purchase Requisition to PO',
                'description': 'Automatically create PO when PR is approved',
                'trigger_type': 'event',
                'trigger_config': {
                    'event_name': 'pr-approved'
                },
                'workflow_type': 'event_driven',
                'access_level': 'branch',
                'steps': [
                    {
                        'step_type': 'condition',
                        'name': 'check_approval_amount',
                        'description': 'Check if amount requires additional approval',
                        'config': {
                            'condition': 'event.estimated_total > 100000',
                            'true_next': 'notify_finance_manager',
                            'false_next': 'create_purchase_order'
                        }
                    },
                    {
                        'step_type': 'notification',
                        'name': 'notify_finance_manager',
                        'description': 'Notify finance manager for high-value PR',
                        'config': {
                            'recipients': ['role:finance_manager'],
                            'subject': 'High-Value PR Requires Review',
                            'message': 'PR {{event.pr_number}} for {{event.estimated_total}} requires your review',
                            'next_step': 'await_finance_approval'
                        }
                    },
                    {
                        'step_type': 'approval',
                        'name': 'await_finance_approval',
                        'description': 'Wait for finance manager approval',
                        'config': {
                            'approvers': ['role:finance_manager'],
                            'approval_type': 'any',
                            'timeout_hours': 48,
                            'approved_next': 'create_purchase_order',
                            'rejected_next': 'notify_rejection'
                        }
                    },
                    {
                        'step_type': 'api_call',
                        'name': 'create_purchase_order',
                        'description': 'Create PO from approved PR',
                        'config': {
                            'method': 'POST',
                            'endpoint': '/api/procurement/purchase-orders/',
                            'payload': {
                                'requisition_id': '{{event.pr_id}}',
                                'supplier_id': '{{event.preferred_supplier_id}}',
                                'expected_delivery_date': '{{event.required_by_date}}',
                                'items': '{{event.items}}'
                            },
                            'next_step': 'notify_success'
                        }
                    },
                    {
                        'step_type': 'notification',
                        'name': 'notify_success',
                        'description': 'Notify requester of PO creation',
                        'config': {
                            'recipients': ['{{event.requested_by_email}}'],
                            'subject': 'PO Created for Your Requisition',
                            'message': 'Your requisition {{event.pr_number}} has been converted to PO',
                            'next_step': None
                        }
                    },
                    {
                        'step_type': 'notification',
                        'name': 'notify_rejection',
                        'description': 'Notify requester of rejection',
                        'config': {
                            'recipients': ['{{event.requested_by_email}}'],
                            'subject': 'PR Rejected',
                            'message': 'Your requisition {{event.pr_number}} was rejected',
                            'next_step': None
                        }
                    }
                ]
            },
            {
                'name': 'Auto Stock Replenishment Check',
                'description': 'Daily check for items below reorder level and create PR',
                'trigger_type': 'schedule',
                'trigger_config': {
                    'schedule_type': 'daily',
                    'time': '09:00'
                },
                'workflow_type': 'scheduled',
                'access_level': 'branch',
                'steps': [
                    {
                        'step_type': 'query',
                        'name': 'find_low_stock_items',
                        'description': 'Query items below reorder level',
                        'config': {
                            'query_type': 'database',
                            'model': 'InventoryStock',
                            'filters': {
                                'available_quantity__lte': 'F(reorder_level)'
                            },
                            'store_as': 'low_stock_items',
                            'next_step': 'check_items_found'
                        }
                    },
                    {
                        'step_type': 'condition',
                        'name': 'check_items_found',
                        'description': 'Check if any items need replenishment',
                        'config': {
                            'condition': 'len(context.low_stock_items) > 0',
                            'true_next': 'create_replenishment_pr',
                            'false_next': None
                        }
                    },
                    {
                        'step_type': 'transaction',
                        'name': 'create_replenishment_pr',
                        'description': 'Create PR for low stock items',
                        'config': {
                            'operations': [
                                {
                                    'action': 'create',
                                    'model': 'PurchaseRequisition',
                                    'data': {
                                        'department': 'Inventory',
                                        'purpose': 'Automatic replenishment - items below reorder level',
                                        'status': 'submitted'
                                    },
                                    'store_as': 'pr'
                                },
                                {
                                    'action': 'create_many',
                                    'model': 'PurchaseRequisitionItem',
                                    'data_source': 'context.low_stock_items',
                                    'data_template': {
                                        'requisition_id': '{{pr.id}}',
                                        'item_id': '{{item.item_id}}',
                                        'quantity': '{{item.reorder_quantity}}',
                                        'estimated_unit_price': '{{item.item.cost_price}}'
                                    }
                                }
                            ],
                            'next_step': 'notify_procurement_team'
                        }
                    },
                    {
                        'step_type': 'notification',
                        'name': 'notify_procurement_team',
                        'description': 'Alert procurement team',
                        'config': {
                            'recipients': ['role:procurement_officer'],
                            'subject': 'Auto-Generated Replenishment PR',
                            'message': 'System created PR {{pr.pr_number}} for {{count(low_stock_items)}} items below reorder level',
                            'next_step': None
                        }
                    }
                ]
            },
            {
                'name': 'GRN Processing & Stock Update',
                'description': 'Process GRN and update inventory automatically',
                'trigger_type': 'event',
                'trigger_config': {
                    'event_name': 'grn-created'
                },
                'workflow_type': 'event_driven',
                'access_level': 'branch',
                'steps': [
                    {
                        'step_type': 'loop',
                        'name': 'process_grn_items',
                        'description': 'Process each GRN item',
                        'config': {
                            'iterate_over': 'event.items',
                            'item_var': 'grn_item',
                            'steps': [
                                {
                                    'step_type': 'api_call',
                                    'name': 'update_stock',
                                    'description': 'Update inventory stock',
                                    'config': {
                                        'method': 'POST',
                                        'endpoint': '/api/inventory/stock/receive/',
                                        'payload': {
                                            'item_id': '{{grn_item.item_id}}',
                                            'quantity': '{{grn_item.quantity_received}}',
                                            'location_id': '{{event.location_id}}',
                                            'unit_cost': '{{grn_item.unit_cost}}',
                                            'batch_number': '{{grn_item.batch_number}}',
                                            'grn_id': '{{event.grn_id}}'
                                        }
                                    }
                                },
                                {
                                    'step_type': 'condition',
                                    'name': 'check_quality',
                                    'description': 'Check if item is damaged',
                                    'config': {
                                        'condition': "grn_item.quality_status == 'damaged'",
                                        'true_next': 'create_return_note',
                                        'false_next': None
                                    }
                                },
                                {
                                    'step_type': 'transaction',
                                    'name': 'create_return_note',
                                    'description': 'Create return note for damaged items',
                                    'config': {
                                        'operations': [
                                            {
                                                'action': 'create',
                                                'model': 'PurchaseReturn',
                                                'data': {
                                                    'grn_id': '{{event.grn_id}}',
                                                    'return_type': 'damaged',
                                                    'status': 'pending'
                                                }
                                            }
                                        ]
                                    }
                                }
                            ],
                            'next_step': 'update_po_status'
                        }
                    },
                    {
                        'step_type': 'api_call',
                        'name': 'update_po_status',
                        'description': 'Update PO received status',
                        'config': {
                            'method': 'PATCH',
                            'endpoint': '/api/procurement/purchase-orders/{{event.po_id}}/update_status/',
                            'next_step': 'notify_completion'
                        }
                    },
                    {
                        'step_type': 'notification',
                        'name': 'notify_completion',
                        'description': 'Notify relevant parties',
                        'config': {
                            'recipients': [
                                '{{event.created_by_email}}',
                                'role:inventory_manager'
                            ],
                            'subject': 'GRN Processed',
                            'message': 'GRN {{event.grn_number}} processed successfully. Inventory updated.',
                            'next_step': None
                        }
                    }
                ]
            }
        ]
        
        for wf_data in workflows:
            wf, created = WorkflowTemplate.objects.update_or_create(
                owner=owner,
                branch=branch,
                name=wf_data['name'],
                defaults={
                    'description': wf_data['description'],
                    'trigger_type': wf_data['trigger_type'],
                    'trigger_config': wf_data['trigger_config'],
                    'workflow_type': wf_data['workflow_type'],
                    'access_level': wf_data['access_level'],
                    'steps': wf_data['steps'],
                    'is_active': True,
                    'version': 1
                }
            )
            status = '✓ Created' if created else '↻ Updated'
            self.stdout.write(f'  {status}: {wf.name}')
        
        self.stdout.write(self.style.SUCCESS(f'✅ Created {len(workflows)} workflow templates'))
    
    def create_module_pages(self, owner, branch, user):
        """Create module pages for procurement UI"""
        self.stdout.write('\n📄 Creating Module Pages...')
        
        # Get or create Procurement module
        module, _ = Module.objects.get_or_create(
            owner=owner,
            branch=branch,
            code='procurement',
            defaults={
                'name': 'Procurement',
                'description': 'Procurement and purchasing management',
                'icon': 'shopping-cart',
                'color': '#3b82f6',
                'order': 5,
                'is_active': True
            }
        )
        
        pages = [
            {
                'code': 'procurement-dashboard',
                'title': 'Procurement Dashboard',
                'description': 'Overview of procurement activities',
                'icon': 'layout-dashboard',
                'page_type': 'dashboard',
                'show_in_menu': True,
                'order': 1,
                'page_config': {
                    'widgets': [
                        {
                            'id': 'pending_prs',
                            'type': 'stat',
                            'title': 'Pending PRs',
                            'dataSource': {
                                'endpoint': '/api/procurement/requisitions/',
                                'params': {'status': 'submitted'},
                                'countField': 'count'
                            },
                            'icon': 'file-text',
                            'color': '#f59e0b'
                        },
                        {
                            'id': 'active_pos',
                            'type': 'stat',
                            'title': 'Active POs',
                            'dataSource': {
                                'endpoint': '/api/procurement/purchase-orders/',
                                'params': {'status__in': 'approved,sent'},
                                'countField': 'count'
                            },
                            'icon': 'shopping-cart',
                            'color': '#3b82f6'
                        },
                        {
                            'id': 'pending_grns',
                            'type': 'stat',
                            'title': 'Pending GRNs',
                            'dataSource': {
                                'endpoint': '/api/procurement/grns/',
                                'params': {'status': 'pending'},
                                'countField': 'count'
                            },
                            'icon': 'package',
                            'color': '#8b5cf6'
                        },
                        {
                            'id': 'total_spend_month',
                            'type': 'stat',
                            'title': 'Total Spend (Month)',
                            'dataSource': {
                                'endpoint': '/api/procurement/analytics/monthly-spend/',
                                'valueField': 'total_amount'
                            },
                            'format': 'currency',
                            'icon': 'dollar-sign',
                            'color': '#10b981'
                        },
                        {
                            'id': 'pr_status_chart',
                            'type': 'chart',
                            'title': 'PR Status Distribution',
                            'chartType': 'pie',
                            'dataSource': {
                                'endpoint': '/api/procurement/requisitions/status-summary/'
                            }
                        },
                        {
                            'id': 'top_suppliers',
                            'type': 'list',
                            'title': 'Top Suppliers (YTD)',
                            'dataSource': {
                                'endpoint': '/api/procurement/suppliers/top-performers/'
                            },
                            'displayFields': ['name', 'total_orders', 'total_value']
                        },
                        {
                            'id': 'recent_pos',
                            'type': 'list',
                            'title': 'Recent Purchase Orders',
                            'dataSource': {
                                'endpoint': '/api/procurement/purchase-orders/',
                                'params': {'ordering': '-order_date', 'limit': 10}
                            },
                            'displayFields': ['po_number', 'supplier_name', 'order_date', 'status', 'total_amount']
                        },
                        {
                            'id': 'delivery_performance',
                            'type': 'chart',
                            'title': 'Delivery Performance',
                            'chartType': 'line',
                            'dataSource': {
                                'endpoint': '/api/procurement/analytics/delivery-performance/'
                            }
                        }
                    ]
                }
            },
            {
                'code': 'pr-list',
                'title': 'Purchase Requisitions',
                'description': 'View and manage purchase requisitions',
                'icon': 'file-text',
                'page_type': 'list',
                'show_in_menu': True,
                'order': 2,
                'page_config': {
                    'entity': 'PurchaseRequisition',
                    'apiEndpoint': '/api/procurement/requisitions/',
                    'columns': [
                        {'field': 'pr_number', 'label': 'PR Number', 'sortable': True, 'searchable': True},
                        {'field': 'department', 'label': 'Department', 'sortable': True, 'filterable': True},
                        {'field': 'requested_by_name', 'label': 'Requested By', 'sortable': True},
                        {'field': 'request_date', 'label': 'Date', 'type': 'date', 'sortable': True},
                        {'field': 'required_by_date', 'label': 'Required By', 'type': 'date', 'sortable': True},
                        {'field': 'estimated_total', 'label': 'Est. Total', 'type': 'currency', 'sortable': True},
                        {'field': 'status', 'label': 'Status', 'type': 'badge', 'filterable': True}
                    ],
                    'filters': [
                        {
                            'field': 'status',
                            'type': 'select',
                            'label': 'Status',
                            'options': [
                                {'value': 'draft', 'label': 'Draft'},
                                {'value': 'submitted', 'label': 'Submitted'},
                                {'value': 'approved', 'label': 'Approved'},
                                {'value': 'rejected', 'label': 'Rejected'},
                                {'value': 'po_created', 'label': 'PO Created'}
                            ]
                        },
                        {
                            'field': 'request_date',
                            'type': 'daterange',
                            'label': 'Request Date'
                        }
                    ],
                    'actions': [
                        {
                            'id': 'view',
                            'label': 'View',
                            'icon': 'eye',
                            'type': 'detail',
                            'url': '/procurement/pr/{{id}}'
                        },
                        {
                            'id': 'approve',
                            'label': 'Approve',
                            'icon': 'check',
                            'type': 'api',
                            'endpoint': '/api/procurement/requisitions/{{id}}/approve/',
                            'method': 'POST',
                            'showIf': "row.status === 'submitted'",
                            'confirmation': 'Approve this requisition?'
                        },
                        {
                            'id': 'reject',
                            'label': 'Reject',
                            'icon': 'x',
                            'type': 'api',
                            'endpoint': '/api/procurement/requisitions/{{id}}/reject/',
                            'method': 'POST',
                            'showIf': "row.status === 'submitted'",
                            'requireInput': {
                                'field': 'reason',
                                'label': 'Rejection Reason',
                                'type': 'textarea'
                            }
                        },
                        {
                            'id': 'create_po',
                            'label': 'Create PO',
                            'icon': 'shopping-cart',
                            'type': 'navigate',
                            'url': '/procurement/po/new?pr={{id}}',
                            'showIf': "row.status === 'approved'"
                        }
                    ],
                    'bulkActions': [
                        {
                            'id': 'approve_multiple',
                            'label': 'Approve Selected',
                            'icon': 'check-circle',
                            'endpoint': '/api/procurement/requisitions/bulk-approve/',
                            'confirmation': 'Approve {{count}} requisitions?'
                        }
                    ],
                    'defaultSort': {'field': 'request_date', 'order': 'desc'}
                }
            },
            {
                'code': 'po-manager',
                'title': 'Purchase Orders',
                'description': 'Manage purchase orders and supplier orders',
                'icon': 'shopping-cart',
                'page_type': 'custom',
                'show_in_menu': True,
                'order': 3,
                'page_config': {
                    'component': 'PurchaseOrderManager',
                    'props': {
                        'enableGRN': True,
                        'enableApproval': True,
                        'defaultView': 'po-list'
                    }
                }
            },
            {
                'code': 'grn-list',
                'title': 'Goods Received Notes',
                'description': 'View and manage goods received notes',
                'icon': 'package',
                'page_type': 'list',
                'show_in_menu': True,
                'order': 4,
                'page_config': {
                    'entity': 'GoodsReceivedNote',
                    'apiEndpoint': '/api/procurement/grns/',
                    'columns': [
                        {'field': 'grn_number', 'label': 'GRN Number', 'sortable': True, 'searchable': True},
                        {'field': 'purchase_order.po_number', 'label': 'PO Number', 'sortable': True},
                        {'field': 'purchase_order.supplier.name', 'label': 'Supplier', 'sortable': True},
                        {'field': 'received_date', 'label': 'Received Date', 'type': 'date', 'sortable': True},
                        {'field': 'total_items', 'label': 'Items', 'type': 'number'},
                        {'field': 'status', 'label': 'Status', 'type': 'badge', 'filterable': True}
                    ],
                    'filters': [
                        {
                            'field': 'status',
                            'type': 'select',
                            'label': 'Status',
                            'options': [
                                {'value': 'pending', 'label': 'Pending'},
                                {'value': 'posted', 'label': 'Posted'},
                                {'value': 'cancelled', 'label': 'Cancelled'}
                            ]
                        },
                        {
                            'field': 'received_date',
                            'type': 'daterange',
                            'label': 'Received Date'
                        }
                    ],
                    'actions': [
                        {
                            'id': 'view',
                            'label': 'View',
                            'icon': 'eye',
                            'type': 'detail',
                            'url': '/procurement/grn/{{id}}'
                        },
                        {
                            'id': 'post',
                            'label': 'Post to Inventory',
                            'icon': 'check-circle',
                            'type': 'api',
                            'endpoint': '/api/procurement/grns/{{id}}/post/',
                            'method': 'POST',
                            'showIf': "row.status === 'pending'",
                            'confirmation': 'Post this GRN to inventory?'
                        }
                    ],
                    'defaultSort': {'field': 'received_date', 'order': 'desc'}
                }
            },
            {
                'code': 'supplier-list',
                'title': 'Suppliers',
                'description': 'Manage supplier information',
                'icon': 'users',
                'page_type': 'list',
                'show_in_menu': True,
                'order': 5,
                'page_config': {
                    'entity': 'Supplier',
                    'apiEndpoint': '/api/procurement/suppliers/',
                    'columns': [
                        {'field': 'code', 'label': 'Code', 'sortable': True, 'searchable': True},
                        {'field': 'name', 'label': 'Name', 'sortable': True, 'searchable': True},
                        {'field': 'email', 'label': 'Email'},
                        {'field': 'phone', 'label': 'Phone'},
                        {'field': 'payment_terms', 'label': 'Payment Terms'},
                        {'field': 'is_active', 'label': 'Active', 'type': 'boolean'}
                    ],
                    'filters': [
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
                            'url': '/procurement/supplier/{{id}}'
                        },
                        {
                            'id': 'performance',
                            'label': 'Performance',
                            'icon': 'bar-chart',
                            'type': 'modal',
                            'endpoint': '/api/procurement/suppliers/{{id}}/performance/'
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
        """Create report templates for procurement analytics"""
        self.stdout.write('\n📊 Creating Report Templates...')
        
        reports = [
            {
                'name': 'Purchase Order Summary',
                'code': 'procurement-po-summary',
                'description': 'Summary of purchase orders by status and supplier',
                'report_type': 'tabular',
                'data_source': {
                    'type': 'model',
                    'model': 'procurement.PurchaseOrder',
                    'includes': ['supplier', 'delivery_location', 'items']
                },
                'columns': [
                    {
                        'name': 'PO Number',
                        'code': 'po_number',
                        'column_type': 'field',
                        'field_path': 'po_number',
                        'format_type': 'text',
                        'is_visible': True,
                        'order': 1
                    },
                    {
                        'name': 'Supplier',
                        'code': 'supplier_name',
                        'column_type': 'field',
                        'field_path': 'supplier.name',
                        'format_type': 'text',
                        'is_visible': True,
                        'order': 2
                    },
                    {
                        'name': 'Order Date',
                        'code': 'order_date',
                        'column_type': 'field',
                        'field_path': 'order_date',
                        'format_type': 'date',
                        'is_visible': True,
                        'order': 3
                    },
                    {
                        'name': 'Expected Delivery',
                        'code': 'expected_delivery_date',
                        'column_type': 'field',
                        'field_path': 'expected_delivery_date',
                        'format_type': 'date',
                        'is_visible': True,
                        'order': 4
                    },
                    {
                        'name': 'Status',
                        'code': 'status',
                        'column_type': 'field',
                        'field_path': 'status',
                        'format_type': 'text',
                        'is_visible': True,
                        'order': 5
                    },
                    {
                        'name': 'Total Amount',
                        'code': 'total_amount',
                        'column_type': 'field',
                        'field_path': 'total_amount',
                        'format_type': 'currency',
                        'is_visible': True,
                        'order': 6
                    },
                    {
                        'name': 'Items Count',
                        'code': 'items_count',
                        'column_type': 'aggregation',
                        'aggregation_function': 'count',
                        'aggregation_field': 'items',
                        'format_type': 'number',
                        'is_visible': True,
                        'order': 7
                    }
                ],
                'parameters': [
                    {
                        'name': 'Start Date',
                        'code': 'start_date',
                        'parameter_type': 'date',
                        'label': 'From Date',
                        'is_required': True,
                        'order': 1
                    },
                    {
                        'name': 'End Date',
                        'code': 'end_date',
                        'parameter_type': 'date',
                        'label': 'To Date',
                        'is_required': True,
                        'order': 2
                    },
                    {
                        'name': 'Status',
                        'code': 'status',
                        'parameter_type': 'multiselect',
                        'label': 'Status Filter',
                        'is_required': False,
                        'default_value': ['approved', 'sent'],
                        'order': 3,
                        'choices': [
                            {'value': 'draft', 'label': 'Draft'},
                            {'value': 'submitted', 'label': 'Submitted'},
                            {'value': 'approved', 'label': 'Approved'},
                            {'value': 'sent', 'label': 'Sent'},
                            {'value': 'partially_received', 'label': 'Partially Received'},
                            {'value': 'received', 'label': 'Received'}
                        ]
                    },
                    {
                        'name': 'Supplier',
                        'code': 'supplier_id',
                        'parameter_type': 'select',
                        'label': 'Supplier',
                        'is_required': False,
                        'order': 4,
                        'data_source': 'suppliers'
                    }
                ],
                'filters': {
                    'order_date__gte': '{{start_date}}',
                    'order_date__lte': '{{end_date}}',
                    'status__in': '{{status}}',
                    'supplier_id': '{{supplier_id}}'
                },
                'grouping': {
                    'enabled': True,
                    'fields': ['supplier_name', 'status'],
                    'show_subtotals': True
                },
                'sorting': {
                    'default_field': 'order_date',
                    'default_order': 'desc'
                }
            },
            {
                'name': 'Supplier Performance Report',
                'code': 'procurement-supplier-performance',
                'description': 'Analyze supplier delivery performance and order history',
                'report_type': 'tabular',
                'data_source': {
                    'type': 'model',
                    'model': 'procurement.Supplier',
                    'includes': ['purchase_orders', 'purchase_orders__goods_received_notes']
                },
                'columns': [
                    {
                        'name': 'Supplier Name',
                        'code': 'supplier_name',
                        'column_type': 'field',
                        'field_path': 'name',
                        'format_type': 'text',
                        'is_visible': True,
                        'order': 1
                    },
                    {
                        'name': 'Total Orders',
                        'code': 'total_orders',
                        'column_type': 'aggregation',
                        'aggregation_function': 'count',
                        'aggregation_field': 'purchase_orders',
                        'format_type': 'number',
                        'is_visible': True,
                        'order': 2
                    },
                    {
                        'name': 'Completed Orders',
                        'code': 'completed_orders',
                        'column_type': 'aggregation',
                        'aggregation_function': 'count',
                        'aggregation_field': 'purchase_orders',
                        'aggregation_filter': {'status': 'received'},
                        'format_type': 'number',
                        'is_visible': True,
                        'order': 3
                    },
                    {
                        'name': 'Total Value',
                        'code': 'total_value',
                        'column_type': 'aggregation',
                        'aggregation_function': 'sum',
                        'aggregation_field': 'purchase_orders.total_amount',
                        'format_type': 'currency',
                        'is_visible': True,
                        'order': 4
                    },
                    {
                        'name': 'Avg Order Value',
                        'code': 'avg_order_value',
                        'column_type': 'aggregation',
                        'aggregation_function': 'avg',
                        'aggregation_field': 'purchase_orders.total_amount',
                        'format_type': 'currency',
                        'is_visible': True,
                        'order': 5
                    },
                    {
                        'name': 'On-Time Delivery %',
                        'code': 'on_time_percentage',
                        'column_type': 'calculation',
                        'calculation_expression': '(completed_orders / total_orders * 100)',
                        'format_type': 'percentage',
                        'is_visible': True,
                        'order': 6
                    }
                ],
                'parameters': [
                    {
                        'name': 'Period',
                        'code': 'period',
                        'parameter_type': 'select',
                        'label': 'Period',
                        'is_required': True,
                        'default_value': 'this_year',
                        'order': 1,
                        'choices': [
                            {'value': 'this_month', 'label': 'This Month'},
                            {'value': 'last_month', 'label': 'Last Month'},
                            {'value': 'this_quarter', 'label': 'This Quarter'},
                            {'value': 'this_year', 'label': 'This Year'},
                            {'value': 'custom', 'label': 'Custom Date Range'}
                        ]
                    },
                    {
                        'name': 'Min Orders',
                        'code': 'min_orders',
                        'parameter_type': 'number',
                        'label': 'Minimum Orders',
                        'is_required': False,
                        'default_value': 1,
                        'order': 2
                    }
                ],
                'filters': {
                    'is_active': True
                },
                'sorting': {
                    'default_field': 'total_value',
                    'default_order': 'desc'
                }
            },
            {
                'name': 'Procurement Spend Analysis',
                'code': 'procurement-spend-analysis',
                'description': 'Detailed analysis of procurement spending by category and period',
                'report_type': 'tabular',
                'data_source': {
                    'type': 'model',
                    'model': 'procurement.PurchaseOrderItem',
                    'includes': ['purchase_order', 'item', 'item.category']
                },
                'columns': [
                    {
                        'name': 'Category',
                        'code': 'category',
                        'column_type': 'field',
                        'field_path': 'item.category.name',
                        'format_type': 'text',
                        'is_visible': True,
                        'order': 1
                    },
                    {
                        'name': 'Item Name',
                        'code': 'item_name',
                        'column_type': 'field',
                        'field_path': 'item.name',
                        'format_type': 'text',
                        'is_visible': True,
                        'order': 2
                    },
                    {
                        'name': 'Total Quantity',
                        'code': 'total_quantity',
                        'column_type': 'aggregation',
                        'aggregation_function': 'sum',
                        'aggregation_field': 'quantity',
                        'format_type': 'number',
                        'is_visible': True,
                        'order': 3
                    },
                    {
                        'name': 'Total Spend',
                        'code': 'total_spend',
                        'column_type': 'calculation',
                        'calculation_expression': 'quantity * unit_price',
                        'format_type': 'currency',
                        'is_visible': True,
                        'order': 4
                    },
                    {
                        'name': 'Avg Unit Price',
                        'code': 'avg_unit_price',
                        'column_type': 'aggregation',
                        'aggregation_function': 'avg',
                        'aggregation_field': 'unit_price',
                        'format_type': 'currency',
                        'is_visible': True,
                        'order': 5
                    },
                    {
                        'name': 'Number of Orders',
                        'code': 'order_count',
                        'column_type': 'aggregation',
                        'aggregation_function': 'count',
                        'aggregation_field': 'purchase_order',
                        'aggregation_distinct': True,
                        'format_type': 'number',
                        'is_visible': True,
                        'order': 6
                    }
                ],
                'parameters': [
                    {
                        'name': 'Start Date',
                        'code': 'start_date',
                        'parameter_type': 'date',
                        'label': 'From Date',
                        'is_required': True,
                        'order': 1
                    },
                    {
                        'name': 'End Date',
                        'code': 'end_date',
                        'parameter_type': 'date',
                        'label': 'To Date',
                        'is_required': True,
                        'order': 2
                    },
                    {
                        'name': 'Category',
                        'code': 'category_id',
                        'parameter_type': 'select',
                        'label': 'Category',
                        'is_required': False,
                        'order': 3,
                        'data_source': 'inventory_categories'
                    }
                ],
                'filters': {
                    'purchase_order__order_date__gte': '{{start_date}}',
                    'purchase_order__order_date__lte': '{{end_date}}',
                    'item__category_id': '{{category_id}}',
                    'purchase_order__status__in': ['approved', 'sent', 'partially_received', 'received']
                },
                'grouping': {
                    'enabled': True,
                    'fields': ['category', 'item_name'],
                    'show_subtotals': True
                },
                'sorting': {
                    'default_field': 'total_spend',
                    'default_order': 'desc'
                }
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
                    'report_type': report_data['report_type'],
                    'data_source': report_data['data_source'],
                    'filters': report_data.get('filters', {}),
                    'grouping': report_data.get('grouping', {}),
                    'sorting': report_data.get('sorting', {}),
                    'is_active': True
                }
            )
            
            # Create columns
            for col_data in report_data['columns']:
                from reports.models import ReportColumn
                ReportColumn.objects.update_or_create(
                    report_template=report,
                    code=col_data['code'],
                    defaults={
                        'name': col_data['name'],
                        'column_type': col_data['column_type'],
                        'field_path': col_data.get('field_path'),
                        'calculation_expression': col_data.get('calculation_expression'),
                        'aggregation_function': col_data.get('aggregation_function'),
                        'aggregation_field': col_data.get('aggregation_field'),
                        'aggregation_filter': col_data.get('aggregation_filter', {}),
                        'aggregation_distinct': col_data.get('aggregation_distinct', False),
                        'format_type': col_data['format_type'],
                        'is_visible': col_data['is_visible'],
                        'order': col_data['order']
                    }
                )
            
            # Create parameters
            for param_data in report_data['parameters']:
                from reports.models import ReportParameter
                ReportParameter.objects.update_or_create(
                    report_template=report,
                    code=param_data['code'],
                    defaults={
                        'name': param_data['name'],
                        'parameter_type': param_data['parameter_type'],
                        'label': param_data['label'],
                        'is_required': param_data['is_required'],
                        'default_value': param_data.get('default_value'),
                        'choices': param_data.get('choices', []),
                        'data_source': param_data.get('data_source'),
                        'order': param_data['order']
                    }
                )
            
            status = '✓ Created' if created else '↻ Updated'
            self.stdout.write(f'  {status}: {report.name}')
        
        self.stdout.write(self.style.SUCCESS(f'✅ Created {len(reports)} report templates'))
    
    def print_next_steps(self):
        """Print next steps for user"""
        self.stdout.write('\n' + '='*60)
        self.stdout.write(self.style.SUCCESS('📋 NEXT STEPS:\n'))
        self.stdout.write('1. Test the forms:')
        self.stdout.write('   - Navigate to /procurement pages')
        self.stdout.write('   - Submit test PRs, POs, and GRNs\n')
        self.stdout.write('2. Trigger workflows:')
        self.stdout.write('   - Approve a PR to trigger PO creation workflow')
        self.stdout.write('   - Create GRN to trigger stock update workflow\n')
        self.stdout.write('3. Generate reports:')
        self.stdout.write('   - Go to Reports > Procurement')
        self.stdout.write('   - Run PO Summary and Supplier Performance reports\n')
        self.stdout.write('4. Review pages:')
        self.stdout.write('   - Check procurement dashboard for KPIs')
        self.stdout.write('   - Test list views and filters\n')
        self.stdout.write('='*60 + '\n')
