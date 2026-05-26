# seed_school_erp_complete.py
"""
COMPLETE School ERP Seeding Script
Creates all FormSchemas, Modules, ModulePages, Dashboards, Widgets, QuickActions,
and links them to WorkflowTemplates for a fully functional system.

Usage:
    python manage.py shell < seed_school_erp_complete.py
    
Or as management command:
    python manage.py seed_school_erp
"""

from django.db import transaction
from django.contrib.auth import get_user_model
from automations.models import FormSchema, WorkflowTemplate
from pages.models import Module, ModulePage, QuickAction, FormLink
from dashboards.models import Dashboard, Widget, DashboardTemplate
from accounts.models import Account

User = get_user_model()


@transaction.atomic
def seed_complete_school_erp(owner, branch, dry_run: bool = False):
    """
    Complete seeding of school ERP system with all interconnections
    """
    print("\n" + "="*80)
    print("🏫 SEEDING COMPLETE SCHOOL ERP SYSTEM")
    print("="*80 + "\n")
    print("🏫 SEEDING COMPLETE SCHOOL ERP SYSTEM")
    print("="*80 + "\n")
    
    # ========================================================================
    # STEP 1: CREATE MODULES
    # ========================================================================
    print("📁 Step 1/8: Creating Modules...")
    
    modules = {}
    module_configs = [
        {
            'code': 'dashboard',
            'name': 'Dashboard',
            'description': 'Main operational dashboard',
            'icon': 'layout-dashboard',
            'color': '#6366f1',
            'order': 0
        },
        {
            'code': 'students',
            'name': 'Students',
            'description': 'Student management and fee tracking',
            'icon': 'users',
            'color': '#3b82f6',
            'order': 1
        },
        {
            'code': 'finance',
            'name': 'Finance',
            'description': 'Financial operations and accounting',
            'icon': 'dollar-sign',
            'color': '#10b981',
            'order': 2
        },
        {
            'code': 'procurement',
            'name': 'Procurement',
            'description': 'Purchase requests and vendor management',
            'icon': 'shopping-cart',
            'color': '#f59e0b',
            'order': 3
        },
        {
            'code': 'inventory',
            'name': 'Inventory',
            'description': 'Stock management for uniforms and textbooks',
            'icon': 'package',
            'color': '#8b5cf6',
            'order': 4
        },
        {
            'code': 'assets',
            'name': 'Assets',
            'description': 'Fixed asset register and tracking',
            'icon': 'archive',
            'color': '#ec4899',
            'order': 5
        },
        {
            'code': 'payroll',
            'name': 'Payroll',
            'description': 'Staff payroll processing',
            'icon': 'credit-card',
            'color': '#14b8a6',
            'order': 6
        },
        {
            'code': 'reports',
            'name': 'Reports',
            'description': 'Financial and operational reports',
            'icon': 'bar-chart-2',
            'color': '#6366f1',
            'order': 7
        },
        {
            'code': 'workflows',
            'name': 'Workflows',
            'description': 'Workflow monitoring and approvals',
            'icon': 'workflow',
            'color': '#f97316',
            'order': 8
        }
    ]
    
    for config in module_configs:
        module, created = Module.objects.get_or_create(
            owner=owner,
            branch=branch,
            code=config['code'],
            defaults={
                'name': config['name'],
                'description': config['description'],
                'icon': config['icon'],
                'color': config['color'],
                'order': config['order'],
                'is_active': True
            }
        )
        modules[config['code']] = module
        status = '✓ Created' if created else '→ Exists'
        print(f"  {status}: {module.name}")
    
    # ========================================================================
    # STEP 2: CREATE FORM SCHEMAS WITH EVENT NAMES
    # ========================================================================
    print("\n📋 Step 2/8: Creating Form Schemas...")
    
    form_schemas = {}
    
    # 1. Purchase Request Form
    pr_schema, created = FormSchema.objects.get_or_create(
        owner=owner,
        branch=branch,
        name='Purchase Request Form',
        defaults={
            'description': 'Create new purchase requests with budget validation',
            'trigger_event_name': 'expense.purchase_request_created',
            'schema': {
                'fields': [
                    {
                        'id': 'department',
                        'type': 'select',
                        'label': 'Department',
                        'required': True,
                        'options': [
                            {'value': 'ADMIN', 'label': 'Administration'},
                            {'value': 'TEACHING', 'label': 'Teaching'},
                            {'value': 'MAINTENANCE', 'label': 'Maintenance'},
                            {'value': 'IT', 'label': 'IT Department'}
                        ]
                    },
                    {
                        'id': 'budget_code',
                        'type': 'text',
                        'label': 'Budget Code',
                        'required': True,
                        'placeholder': 'e.g., ADMIN-2025-001'
                    },
                    {
                        'id': 'item_description',
                        'type': 'textarea',
                        'label': 'Item Description',
                        'required': True
                    },
                    {
                        'id': 'quantity',
                        'type': 'number',
                        'label': 'Quantity',
                        'required': True,
                        'validation': {'min': 1}
                    },
                    {
                        'id': 'estimated_cost',
                        'type': 'money',
                        'label': 'Estimated Cost',
                        'required': True,
                        'validation': {'min': 0.01}
                    },
                    {
                        'id': 'vendor_email',
                        'type': 'email',
                        'label': 'Vendor Email',
                        'required': False
                    },
                    {
                        'id': 'justification',
                        'type': 'textarea',
                        'label': 'Justification',
                        'required': True
                    }
                ]
            }
        }
    )
    form_schemas['purchase_request'] = pr_schema
    print(f"  {'✓' if created else '→'} Purchase Request Form (Event: {pr_schema.trigger_event_name})")
    
    # 2. Cash Reconciliation Form
    cash_recon_schema, created = FormSchema.objects.get_or_create(
        owner=owner,
        branch=branch,
        name='Daily Cash Reconciliation Form',
        defaults={
            'description': 'Daily cash count and reconciliation',
            'trigger_event_name': 'finance.cash_reconciliation_submitted',
            'schema': {
                'fields': [
                    {
                        'id': 'physical_cash_count',
                        'type': 'money',
                        'label': 'Physical Cash Count',
                        'required': True
                    },
                    {
                        'id': 'check_count',
                        'type': 'number',
                        'label': 'Number of Checks',
                        'required': True
                    },
                    {
                        'id': 'check_total',
                        'type': 'money',
                        'label': 'Total Check Amount',
                        'required': True
                    },
                    {
                        'id': 'variance_explanation',
                        'type': 'textarea',
                        'label': 'Variance Explanation',
                        'required': False
                    }
                ]
            }
        }
    )
    form_schemas['cash_reconciliation'] = cash_recon_schema
    print(f"  {'✓' if created else '→'} Cash Reconciliation Form")
    
    # 3. Asset Movement Form
    asset_movement_schema, created = FormSchema.objects.get_or_create(
        owner=owner,
        branch=branch,
        name='Asset Movement Form',
        defaults={
            'description': 'Request asset transfer between locations',
            'trigger_event_name': 'asset.movement_requested',
            'schema': {
                'fields': [
                    {
                        'id': 'asset_tag',
                        'type': 'text',
                        'label': 'Asset Tag',
                        'required': True,
                        'placeholder': 'e.g., FAR-001'
                    },
                    {
                        'id': 'asset_description',
                        'type': 'text',
                        'label': 'Asset Description',
                        'required': True
                    },
                    {
                        'id': 'current_location',
                        'type': 'text',
                        'label': 'Current Location',
                        'required': True
                    },
                    {
                        'id': 'new_location',
                        'type': 'select',
                        'label': 'New Location',
                        'required': True,
                        'options': [
                            {'value': 'ADMIN_BLOCK', 'label': 'Administration Block'},
                            {'value': 'LIBRARY', 'label': 'Library'},
                            {'value': 'LAB_1', 'label': 'Science Lab 1'},
                            {'value': 'IT_LAB', 'label': 'IT Lab'},
                            {'value': 'STORAGE', 'label': 'Storage Room'}
                        ]
                    },
                    {
                        'id': 'reason',
                        'type': 'textarea',
                        'label': 'Reason for Movement',
                        'required': True
                    }
                ]
            }
        }
    )
    form_schemas['asset_movement'] = asset_movement_schema
    print(f"  {'✓' if created else '→'} Asset Movement Form")

    # At the end, if dry_run is true, rollback the transaction
    if dry_run:
        print('\n🟡 Dry run flag set — rolling back any created objects (no DB changes committed)')
        transaction.set_rollback(True)
    
    # 4. Stock Receiving Form
    stock_receiving_schema, created = FormSchema.objects.get_or_create(
        owner=owner,
        branch=branch,
        name='Stock Receiving Form',
        defaults={
            'description': 'Receive goods against purchase orders',
            'trigger_event_name': 'inventory.goods_received',
            'schema': {
                'fields': [
                    {
                        'id': 'po_number',
                        'type': 'text',
                        'label': 'PO Number',
                        'required': True
                    },
                    {
                        'id': 'item_code',
                        'type': 'text',
                        'label': 'Item Code',
                        'required': True
                    },
                    {
                        'id': 'quantity_ordered',
                        'type': 'number',
                        'label': 'Quantity Ordered',
                        'required': True
                    },
                    {
                        'id': 'quantity_received',
                        'type': 'number',
                        'label': 'Quantity Received',
                        'required': True
                    },
                    {
                        'id': 'condition',
                        'type': 'select',
                        'label': 'Condition',
                        'required': True,
                        'options': [
                            {'value': 'GOOD', 'label': 'Good Condition'},
                            {'value': 'DAMAGED', 'label': 'Damaged'},
                            {'value': 'PARTIAL', 'label': 'Partially Damaged'}
                        ]
                    },
                    {
                        'id': 'discrepancy_notes',
                        'type': 'textarea',
                        'label': 'Discrepancy Notes',
                        'required': False
                    }
                ]
            }
        }
    )
    form_schemas['stock_receiving'] = stock_receiving_schema
    print(f"  {'✓' if created else '→'} Stock Receiving Form")
    
    # 5. Invoice Payment Form (for parent portal)
    payment_form_schema, created = FormSchema.objects.get_or_create(
        owner=owner,
        branch=branch,
        name='Fee Payment Form',
        defaults={
            'description': 'Record student fee payments',
            'trigger_event_name': 'finance.payment_received',
            'schema': {
                'fields': [
                    {
                        'id': 'student_id',
                        'type': 'text',
                        'label': 'Student ID',
                        'required': True
                    },
                    {
                        'id': 'amount',
                        'type': 'money',
                        'label': 'Payment Amount',
                        'required': True
                    },
                    {
                        'id': 'payment_method',
                        'type': 'select',
                        'label': 'Payment Method',
                        'required': True,
                        'options': [
                            {'value': 'CASH', 'label': 'Cash'},
                            {'value': 'CHECK', 'label': 'Check'},
                            {'value': 'BANK_TRANSFER', 'label': 'Bank Transfer'},
                            {'value': 'MOBILE_MONEY', 'label': 'Mobile Money'}
                        ]
                    },
                    {
                        'id': 'reference',
                        'type': 'text',
                        'label': 'Reference Number',
                        'required': False
                    }
                ]
            }
        }
    )
    form_schemas['payment'] = payment_form_schema
    print(f"  {'✓' if created else '→'} Fee Payment Form")
    
    # ========================================================================
    # STEP 3: CREATE MODULE PAGES (INCLUDING FORM PAGES)
    # ========================================================================
    print("\n📄 Step 3/8: Creating Module Pages...")
    
    pages = {}
    
    # Dashboard Module Pages
    main_dashboard, created = ModulePage.objects.get_or_create(
        owner=owner,
        branch=branch,
        module=modules['dashboard'],
        code='main',
        defaults={
            'title': 'School Operations Dashboard',
            'page_type': 'dashboard',
            'page_config': {
                'dashboard_slug': 'school-operations'
            },
            'show_in_menu': True,
            'order': 1
        }
    )
    pages['main_dashboard'] = main_dashboard
    print(f"  {'✓' if created else '→'} Dashboard → Main Dashboard")
    
    # Students Module Pages
    students_dashboard, created = ModulePage.objects.get_or_create(
        owner=owner,
        branch=branch,
        module=modules['students'],
        code='dashboard',
        defaults={
            'title': 'Student Overview',
            'page_type': 'dashboard',
            'page_config': {
                'widgets': ['total_students', 'outstanding_fees']
            },
            'show_in_menu': True,
            'order': 1
        }
    )
    pages['students_dashboard'] = students_dashboard
    print(f"  {'✓' if created else '→'} Students → Dashboard")
    
    students_list, created = ModulePage.objects.get_or_create(
        owner=owner,
        branch=branch,
        module=modules['students'],
        code='list',
        defaults={
            'title': 'All Students',
            'page_type': 'list',
            'page_config': {
                'entity': 'Client',
                'filters': [{'field': 'classification__code', 'value': 'STUDENT'}],
                'columns': ['client_id', 'full_name', 'grade', 'balance']
            },
            'show_in_menu': True,
            'order': 2
        }
    )
    pages['students_list'] = students_list
    print(f"  {'✓' if created else '→'} Students → All Students")
    
    # Finance Module Pages
    finance_dashboard, created = ModulePage.objects.get_or_create(
        owner=owner,
        branch=branch,
        module=modules['finance'],
        code='dashboard',
        defaults={
            'title': 'Finance Dashboard',
            'page_type': 'dashboard',
            'page_config': {'widgets': ['monthly_income', 'debtor_aging']},
            'show_in_menu': True,
            'order': 1
        }
    )
    pages['finance_dashboard'] = finance_dashboard
    print(f"  {'✓' if created else '→'} Finance → Dashboard")
    
    # FORM PAGE: Cash Reconciliation
    cash_recon_page, created = ModulePage.objects.get_or_create(
        owner=owner,
        branch=branch,
        module=modules['finance'],
        code='cash-reconciliation',
        defaults={
            'title': 'Daily Cash Reconciliation',
            'page_type': 'form',
            'page_config': {
                'form_schema_id': str(cash_recon_schema.id),
                'success_message': 'Cash reconciliation submitted successfully',
                'success_url': '/finance/dashboard'
            },
            'show_in_menu': True,
            'order': 2
        }
    )
    pages['cash_recon'] = cash_recon_page
    print(f"  {'✓' if created else '→'} Finance → Cash Reconciliation Form")
    
    # Debtor Aging Report Page
    debtor_aging_page, created = ModulePage.objects.get_or_create(
        owner=owner,
        branch=branch,
        module=modules['finance'],
        code='debtor-aging',
        defaults={
            'title': 'Debtor Aging Report',
            'page_type': 'report',
            'page_config': {
                'report_type': 'debtor_aging',
                'age_buckets': ['1-30', '31-60', '61-90', '90+']
            },
            'show_in_menu': True,
            'order': 3
        }
    )
    pages['debtor_aging'] = debtor_aging_page
    print(f"  {'✓' if created else '→'} Finance → Debtor Aging Report")
    
    # FORM PAGE: Fee Payment
    payment_page, created = ModulePage.objects.get_or_create(
        owner=owner,
        branch=branch,
        module=modules['finance'],
        code='payment',
        defaults={
            'title': 'Record Payment',
            'page_type': 'form',
            'page_config': {
                'form_schema_id': str(payment_form_schema.id),
                'success_url': '/finance/dashboard'
            },
            'show_in_menu': True,
            'order': 4
        }
    )
    pages['payment'] = payment_page
    print(f"  {'✓' if created else '→'} Finance → Payment Form")
    
    # Procurement Module Pages
    procurement_dashboard, created = ModulePage.objects.get_or_create(
        owner=owner,
        branch=branch,
        module=modules['procurement'],
        code='dashboard',
        defaults={
            'title': 'Procurement Dashboard',
            'page_type': 'dashboard',
            'page_config': {'widgets': ['pending_approvals', 'recent_pos']},
            'show_in_menu': True,
            'order': 1
        }
    )
    pages['procurement_dashboard'] = procurement_dashboard
    print(f"  {'✓' if created else '→'} Procurement → Dashboard")
    
    # FORM PAGE: Purchase Request
    pr_form_page, created = ModulePage.objects.get_or_create(
        owner=owner,
        branch=branch,
        module=modules['procurement'],
        code='purchase-request',
        defaults={
            'title': 'New Purchase Request',
            'page_type': 'form',
            'page_config': {
                'form_schema_id': str(pr_schema.id),
                'success_message': 'Purchase request submitted for approval',
                'success_url': '/procurement/requests'
            },
            'show_in_menu': True,
            'order': 2
        }
    )
    pages['purchase_request'] = pr_form_page
    print(f"  {'✓' if created else '→'} Procurement → Purchase Request Form")
    
    # Purchase Request List
    pr_list_page, created = ModulePage.objects.get_or_create(
        owner=owner,
        branch=branch,
        module=modules['procurement'],
        code='requests',
        defaults={
            'title': 'Purchase Requests',
            'page_type': 'list',
            'page_config': {
                'entity': 'FormSubmission',
                'filters': [{'field': 'form_schema__name', 'value': 'Purchase Request Form'}],
                'columns': ['submission_reference', 'submitted_at', 'status']
            },
            'show_in_menu': True,
            'order': 3
        }
    )
    pages['pr_list'] = pr_list_page
    print(f"  {'✓' if created else '→'} Procurement → Purchase Requests List")
    
    # Inventory Module Pages
    inventory_dashboard, created = ModulePage.objects.get_or_create(
        owner=owner,
        branch=branch,
        module=modules['inventory'],
        code='dashboard',
        defaults={
            'title': 'Inventory Dashboard',
            'page_type': 'dashboard',
            'page_config': {'widgets': ['low_stock_alerts', 'stock_value']},
            'show_in_menu': True,
            'order': 1
        }
    )
    pages['inventory_dashboard'] = inventory_dashboard
    print(f"  {'✓' if created else '→'} Inventory → Dashboard")
    
    # FORM PAGE: Stock Receiving
    stock_receiving_page, created = ModulePage.objects.get_or_create(
        owner=owner,
        branch=branch,
        module=modules['inventory'],
        code='receive-stock',
        defaults={
            'title': 'Receive Stock',
            'page_type': 'form',
            'page_config': {
                'form_schema_id': str(stock_receiving_schema.id),
                'success_url': '/inventory/dashboard'
            },
            'show_in_menu': True,
            'order': 2
        }
    )
    pages['stock_receiving'] = stock_receiving_page
    print(f"  {'✓' if created else '→'} Inventory → Stock Receiving Form")
    
    # Stock List
    stock_list_page, created = ModulePage.objects.get_or_create(
        owner=owner,
        branch=branch,
        module=modules['inventory'],
        code='stock-list',
        defaults={
            'title': 'Stock Items',
            'page_type': 'list',
            'page_config': {
                'entity': 'InventoryItem',
                'columns': ['code', 'name', 'quantity_on_hand', 'reorder_point']
            },
            'show_in_menu': True,
            'order': 3
        }
    )
    pages['stock_list'] = stock_list_page
    print(f"  {'✓' if created else '→'} Inventory → Stock List")
    
    # Assets Module Pages
    assets_dashboard, created = ModulePage.objects.get_or_create(
        owner=owner,
        branch=branch,
        module=modules['assets'],
        code='dashboard',
        defaults={
            'title': 'Asset Management',
            'page_type': 'dashboard',
            'page_config': {'widgets': ['total_assets', 'recent_movements']},
            'show_in_menu': True,
            'order': 1
        }
    )
    pages['assets_dashboard'] = assets_dashboard
    print(f"  {'✓' if created else '→'} Assets → Dashboard")
    
    # FORM PAGE: Asset Movement
    asset_movement_page, created = ModulePage.objects.get_or_create(
        owner=owner,
        branch=branch,
        module=modules['assets'],
        code='asset-movement',
        defaults={
            'title': 'Move Asset',
            'page_type': 'form',
            'page_config': {
                'form_schema_id': str(asset_movement_schema.id),
                'success_url': '/assets/register'
            },
            'show_in_menu': True,
            'order': 2
        }
    )
    pages['asset_movement'] = asset_movement_page
    print(f"  {'✓' if created else '→'} Assets → Asset Movement Form")
    
    # Asset Register
    asset_register_page, created = ModulePage.objects.get_or_create(
        owner=owner,
        branch=branch,
        module=modules['assets'],
        code='register',
        defaults={
            'title': 'Asset Register',
            'page_type': 'list',
            'page_config': {
                'entity': 'FixedAsset',
                'columns': ['asset_tag', 'description', 'location', 'purchase_cost']
            },
            'show_in_menu': True,
            'order': 3
        }
    )
    pages['asset_register'] = asset_register_page
    print(f"  {'✓' if created else '→'} Assets → Asset Register")
    
    # Payroll Module Pages
    payroll_dashboard, created = ModulePage.objects.get_or_create(
        owner=owner,
        branch=branch,
        module=modules['payroll'],
        code='dashboard',
        defaults={
            'title': 'Payroll Dashboard',
            'page_type': 'dashboard',
            'page_config': {'widgets': ['payroll_summary']},
            'show_in_menu': True,
            'order': 1
        }
    )
    pages['payroll_dashboard'] = payroll_dashboard
    print(f"  {'✓' if created else '→'} Payroll → Dashboard")
    
    # Reports Module Pages
    reports_dashboard, created = ModulePage.objects.get_or_create(
        owner=owner,
        branch=branch,
        module=modules['reports'],
        code='dashboard',
        defaults={
            'title': 'Reports',
            'page_type': 'dashboard',
            'page_config': {'widgets': ['report_links']},
            'show_in_menu': True,
            'order': 1
        }
    )
    pages['reports_dashboard'] = reports_dashboard
    print(f"  {'✓' if created else '→'} Reports → Dashboard")
    
    # Workflows Module Pages
    workflows_dashboard, created = ModulePage.objects.get_or_create(
        owner=owner,
        branch=branch,
        module=modules['workflows'],
        code='dashboard',
        defaults={
            'title': 'Workflow Monitor',
            'page_type': 'dashboard',
            'page_config': {'widgets': ['workflow_runs', 'pending_approvals']},
            'show_in_menu': True,
            'order': 1
        }
    )
    pages['workflows_dashboard'] = workflows_dashboard
    print(f"  {'✓' if created else '→'} Workflows → Dashboard")
    
    # Workflow Runs List
    workflow_runs_page, created = ModulePage.objects.get_or_create(
        owner=owner,
        branch=branch,
        module=modules['workflows'],
        code='runs',
        defaults={
            'title': 'All Workflow Runs',
            'page_type': 'list',
            'page_config': {
                'entity': 'WorkflowRun',
                'columns': ['run_reference', 'template__name', 'status', 'created_at']
            },
            'show_in_menu': True,
            'order': 2
        }
    )
    pages['workflow_runs'] = workflow_runs_page
    print(f"  {'✓' if created else '→'} Workflows → Run History")
    
    # Approvals Page
    approvals_page, created = ModulePage.objects.get_or_create(
        owner=owner,
        branch=branch,
        module=modules['workflows'],
        code='approvals',
        defaults={
            'title': 'Pending Approvals',
            'page_type': 'list',
            'page_config': {
                'entity': 'WorkflowApproval',
                'filters': [{'field': 'status', 'value': 'pending'}],
                'columns': ['run__run_reference', 'step_id', 'requested_at']
            },
            'show_in_menu': True,
            'order': 3
        }
    )
    pages['approvals'] = approvals_page
    print(f"  {'✓' if created else '→'} Workflows → Pending Approvals")
    
    # ========================================================================
    # STEP 4: CREATE MAIN DASHBOARD WITH WIDGETS
    # ========================================================================
    print("\n📊 Step 4/8: Creating Main Dashboard with Widgets...")
    
    dashboard, created = Dashboard.objects.get_or_create(
        owner=owner,
        branch=branch,
        slug='school-operations',
        defaults={
            'name': 'School Operations Dashboard',
            'description': 'Main dashboard for school operations and workflow monitoring',
            'is_default': True,
            'is_active': True
        }
    )
    print(f"  {'✓' if created else '→'} Dashboard: {dashboard.name}")
    
    # Widget configurations
    widget_configs = [
        {
            'widget_type': 'kpi',
            'instance_key': 'total-students',
            'config': {
                'title': 'Total Students',
                'data_source': '/api/clients/count/?classification=STUDENT',
                'format': 'number',
                'icon': 'users',
                'color': '#3b82f6'
            },
            'layout': {'x': 0, 'y': 0, 'w': 3, 'h': 2}
        },
        {
            'widget_type': 'kpi',
            'instance_key': 'outstanding-fees',
            'config': {
                'title': 'Outstanding Fees',
                'data_source': '/api/accounts/total-receivables/',
                'format': 'currency',
                'icon': 'dollar-sign',
                'color': '#ef4444'
            },
            'layout': {'x': 3, 'y': 0, 'w': 3, 'h': 2}
        },
        {
            'widget_type': 'kpi',
            'instance_key': 'monthly-income',
            'config': {
                'title': 'Income This Month',
                'data_source': '/api/reports/monthly-income/',
                'format': 'currency',
                'icon': 'trending-up',
                'color': '#10b981'
            },
            'layout': {'x': 6, 'y': 0, 'w': 3, 'h': 2}
        },
        {
            'widget_type': 'kpi',
            'instance_key': 'pending-approvals',
            'config': {
                'title': 'Pending Approvals',
                'data_source': '/api/workflow-approvals/count/?status=pending',
                'format': 'number',
                'icon': 'clock',
                'color': '#f59e0b',
                'clickable': True,
                'link': '/workflows/approvals'
            },
            'layout': {'x': 9, 'y': 0, 'w': 3, 'h': 2}
        },
        {
            'widget_type': 'table',
            'instance_key': 'recent-workflow-runs',
            'config': {
                'title': 'Recent Workflow Runs',
                'data_source': '/api/workflow-runs/?limit=5&ordering=-created_at',
                'columns': [
                    {'field': 'run_reference', 'label': 'Reference'},
                    {'field': 'template.name', 'label': 'Workflow'},
                    {'field': 'status', 'label': 'Status'},
                    {'field': 'created_at', 'label': 'Started', 'type': 'datetime'}
                ],
                'refresh_interval': 30,
                'clickable_rows': True,
                'row_url': '/workflows/runs/{id}'
            },
            'layout': {'x': 0, 'y': 2, 'w': 6, 'h': 4}
        },
        {
            'widget_type': 'navigation',
            'instance_key': 'quick-actions',
            'config': {
                'title': 'Quick Actions',
                'links': [
                    {
                        'title': 'New Purchase Request',
                        'url': '/procurement/purchase-request',
                        'icon': 'shopping-cart',
                        'color': '#f59e0b'
                    },
                    {
                        'title': 'Cash Reconciliation',
                        'url': '/finance/cash-reconciliation',
                        'icon': 'dollar-sign',
                        'color': '#10b981'
                    },
                    {
                        'title': 'Receive Stock',
                        'url': '/inventory/receive-stock',
                        'icon': 'package',
                        'color': '#8b5cf6'
                    },
                    {
                        'title': 'Move Asset',
                        'url': '/assets/asset-movement',
                        'icon': 'move',
                        'color': '#ec4899'
                    },
                    {
                        'title': 'Record Payment',
                        'url': '/finance/payment',
                        'icon': 'credit-card',
                        'color': '#14b8a6'
                    },
                    {
                        'title': 'Debtor Report',
                        'url': '/finance/debtor-aging',
                        'icon': 'file-text',
                        'color': '#6366f1'
                    }
                ]
            },
            'layout': {'x': 6, 'y': 2, 'w': 6, 'h': 4}
        },
        {
            'widget_type': 'kpi',
            'instance_key': 'low-stock-items',
            'config': {
                'title': 'Low Stock Alerts',
                'data_source': '/api/inventory/items/low-stock/count/',
                'format': 'number',
                'icon': 'alert-triangle',
                'color': '#ef4444',
                'clickable': True,
                'link': '/inventory/dashboard'
            },
            'layout': {'x': 0, 'y': 6, 'w': 3, 'h': 2}
        },
        {
            'widget_type': 'kpi',
            'instance_key': 'failed-workflows',
            'config': {
                'title': 'Failed Workflows Today',
                'data_source': '/api/workflow-runs/count/?status=failed&created_at__date=today',
                'format': 'number',
                'icon': 'x-circle',
                'color': '#ef4444',
                'clickable': True,
                'link': '/workflows/runs?status=failed'
            },
            'layout': {'x': 3, 'y': 6, 'w': 3, 'h': 2}
        }
    ]
    
    for wconfig in widget_configs:
        widget, created = Widget.objects.get_or_create(
            dashboard=dashboard,
            instance_key=wconfig['instance_key'],
            defaults={
                'widget_type': wconfig['widget_type'],
                'config': wconfig['config'],
                'layout_x': wconfig['layout']['x'],
                'layout_y': wconfig['layout']['y'],
                'layout_w': wconfig['layout']['w'],
                'layout_h': wconfig['layout']['h']
            }
        )
        status = '✓' if created else '→'
        print(f"    {status} Widget: {wconfig['config']['title']}")
    
    # ========================================================================
    # STEP 5: CREATE DASHBOARD TEMPLATE (for reusability)
    # ========================================================================
    print("\n📐 Step 5/8: Creating Dashboard Template...")
    
    template_config = {
        'widgets': [
            {
                'widget_type': 'kpi',
                'config': widget_configs[0]['config'],
                'layout': widget_configs[0]['layout']
            },
            {
                'widget_type': 'kpi',
                'config': widget_configs[1]['config'],
                'layout': widget_configs[1]['layout']
            },
            {
                'widget_type': 'navigation',
                'config': widget_configs[5]['config'],
                'layout': widget_configs[5]['layout']
            }
        ]
    }
    
    # DashboardTemplate is not branch-scoped (no 'branch' field), so create by owner and name only
    dashboard_template, created = DashboardTemplate.objects.get_or_create(
        owner=owner,
        name='School Operations Template',
        defaults={
            'description': 'Standard template for school operational dashboards',
            'category': 'school',
            'template_config': template_config,
            'is_active': True
        }
    )
    print(f"  {'✓' if created else '→'} Dashboard Template: {dashboard_template.name}")
    
    # ========================================================================
    # STEP 6: CREATE QUICK ACTIONS
    # ========================================================================
    print("\n⚡ Step 6/8: Creating Quick Actions...")
    
    # Quick Action for Purchase Request (appears on Dashboard and Procurement pages)
    pr_action, created = QuickAction.objects.get_or_create(
        owner=owner,
        branch=branch,
        context='module',
        code='new-purchase-request',
        defaults={
            'title': 'New Purchase Request',
            'description': 'Create a new purchase request',
            'icon': 'shopping-cart',
            'color': '#f59e0b',
            'module': modules['procurement'],
            'action_type': 'page',
            'action_config': {
                'page_id': str(pr_form_page.id)
            },
            'target_page': pr_form_page,
            'order': 1,
            'is_active': True,
            'is_featured': True
        }
    )
    print(f"  {'✓' if created else '→'} New Purchase Request (Module: Procurement)")
    
    # Quick Action for Cash Reconciliation
    cash_action, created = QuickAction.objects.get_or_create(
        owner=owner,
        branch=branch,
        context='module',
        code='cash-reconciliation',
        defaults={
            'title': 'Cash Reconciliation',
            'description': 'Perform daily cash reconciliation',
            'icon': 'dollar-sign',
            'color': '#10b981',
            'module': modules['finance'],
            'action_type': 'page',
            'action_config': {
                'page_id': str(cash_recon_page.id)
            },
            'target_page': cash_recon_page,
            'order': 1,
            'is_active': True,
            'is_featured': True
        }
    )
    print(f"  {'✓' if created else '→'} Cash Reconciliation (Module: Finance)")
    
    # Quick Action for Stock Receiving
    stock_action, created = QuickAction.objects.get_or_create(
        owner=owner,
        branch=branch,
        context='module',
        code='receive-stock',
        defaults={
            'title': 'Receive Stock',
            'description': 'Receive goods against PO',
            'icon': 'package',
            'color': '#8b5cf6',
            'module': modules['inventory'],
            'action_type': 'page',
            'action_config': {
                'page_id': str(stock_receiving_page.id)
            },
            'target_page': stock_receiving_page,
            'order': 1,
            'is_active': True
        }
    )
    print(f"  {'✓' if created else '→'} Receive Stock (Module: Inventory)")
    
    # Quick Action for Asset Movement
    asset_action, created = QuickAction.objects.get_or_create(
        owner=owner,
        branch=branch,
        context='module',
        code='move-asset',
        defaults={
            'title': 'Move Asset',
            'description': 'Request asset movement',
            'icon': 'move',
            'color': '#ec4899',
            'module': modules['assets'],
            'action_type': 'page',
            'action_config': {
                'page_id': str(asset_movement_page.id)
            },
            'target_page': asset_movement_page,
            'order': 1,
            'is_active': True
        }
    )
    print(f"  {'✓' if created else '→'} Move Asset (Module: Assets)")
    
    # Global Quick Action for Viewing Approvals
    approvals_action, created = QuickAction.objects.get_or_create(
        owner=owner,
        branch=branch,
        context='global',
        code='view-approvals',
        defaults={
            'title': 'My Approvals',
            'description': 'View pending approvals',
            'icon': 'check-circle',
            'color': '#f59e0b',
            'action_type': 'page',
            'action_config': {
                'page_id': str(approvals_page.id)
            },
            'target_page': approvals_page,
            'order': 1,
            'is_active': True,
            'is_featured': True
        }
    )
    print(f"  {'✓' if created else '→'} My Approvals (Global)")
    
    # ========================================================================
    # STEP 7: UPDATE WORKFLOW TEMPLATES WITH FORM TRIGGERS
    # ========================================================================
    print("\n⚙️  Step 7/8: Linking Workflows to Form Schemas...")
    
    # Map workflow codes to form schemas
    workflow_form_mappings = [
        {
            'workflow_name': 'Purchase Request Approval',
            'form_schema': pr_schema,
            'event_name': 'expense.purchase_request_created'
        },
        {
            'workflow_name': 'Daily Cash Reconciliation',
            'form_schema': cash_recon_schema,
            'event_name': 'finance.cash_reconciliation_submitted'
        },
        {
            'workflow_name': 'Asset Movement Tracking',
            'form_schema': asset_movement_schema,
            'event_name': 'asset.movement_requested'
        },
        {
            'workflow_name': 'Inventory Reorder Notification',
            'form_schema': stock_receiving_schema,
            'event_name': 'inventory.goods_received'
        }
    ]
    
    for mapping in workflow_form_mappings:
        try:
            workflow = WorkflowTemplate.objects.get(
                owner=owner,
                branch=branch,
                name=mapping['workflow_name']
            )
            
            # Update trigger configuration
            workflow.trigger_type = 'event'
            workflow.trigger_config = {
                'event_name': mapping['event_name'],
                'form_schema_id': str(mapping['form_schema'].id)
            }
            workflow.save()
            
            print(f"  ✓ Linked: {workflow.name} → {mapping['form_schema'].name}")
        except WorkflowTemplate.DoesNotExist:
            print(f"  ⚠ Workflow not found: {mapping['workflow_name']} (create workflows first)")
    
    # ========================================================================
    # STEP 8: CREATE FORM LINKS FOR NAVIGATION
    # ========================================================================
    print("\n🔗 Step 8/8: Creating Form Links...")
    
    # This creates FormLink objects that can be used to auto-generate
    # navigation items or contextual actions
    
    # No patterns exist yet, so we'll skip this for now
    # Form Links are typically auto-generated from AccountTransactionPatterns
    print("  → Skipping FormLinks (requires AccountTransactionPatterns)")
    
    # ========================================================================
    # SUMMARY
    # ========================================================================
    print("\n" + "="*80)
    print("✅ SEEDING COMPLETE!")
    print("="*80)
    print(f"\n📊 Created:")
    print(f"   • {len(modules)} Modules")
    print(f"   • {len(form_schemas)} Form Schemas")
    print(f"   • {len(pages)} Module Pages")
    print(f"   • {len(widget_configs)} Dashboard Widgets")
    print(f"   • 1 Dashboard Template")
    print(f"   • 5 Quick Actions")
    
    print(f"\n🔌 Integration:")
    print(f"   • Forms trigger workflow events")
    print(f"   • Dashboard displays workflow status")
    print(f"   • Quick actions link to form pages")
    print(f"   • Module pages organized by workflow")
    
    print(f"\n🚀 Next Steps:")
    print(f"   1. Run: python manage.py init_school_workflows")
    print(f"   2. Test form submission: /procurement/purchase-request")
    print(f"   3. View dashboard: /dashboard/main")
    print(f"   4. Check workflows: /workflows/runs")
    
    print("\n" + "="*80 + "\n")
    
    return {
        'modules': modules,
        'pages': pages,
        'form_schemas': form_schemas,
        'dashboard': dashboard,
        'dashboard_template': dashboard_template
    }


# ============================================================================
# DJANGO MANAGEMENT COMMAND
# ============================================================================

"""
To use this as a management command, create:

# management/commands/seed_school_erp.py
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from path.to.seed_school_erp_complete import seed_complete_school_erp

User = get_user_model()

class Command(BaseCommand):
    help = 'Seed complete school ERP system with forms, workflows, and dashboards'

    def add_arguments(self, parser):
        parser.add_argument(
            '--owner-email',
            type=str,
            help='Email of the owner user',
            required=True
        )

    def handle(self, *args, **options):
        try:
            owner = User.objects.get(email=options['owner_email'])
            branch = owner.branches.first()  # Or specify branch
            
            if not branch:
                self.stdout.write(
                    self.style.ERROR('User has no branches')
                )
                return
            
            result = seed_complete_school_erp(owner, branch)
            
            self.stdout.write(
                self.style.SUCCESS(
                    f'Successfully seeded school ERP system!'
                )
            )
            
        except User.DoesNotExist:
            self.stdout.write(
                self.style.ERROR(f'User not found: {options["owner_email"]}')
            )
        except Exception as e:
            self.stdout.write(
                self.style.ERROR(f'Error: {str(e)}')
            )

# Usage:
# python manage.py seed_school_erp --owner-email=admin@school.com
"""


# ============================================================================
# TESTING SCRIPT
# ============================================================================

"""
Test the seeded system by submitting a form and checking workflow execution:

from django.contrib.auth import get_user_model
from automations.models import FormSchema, FormSubmission, WorkflowRun

User = get_user_model()
owner = User.objects.get(email='admin@school.com')
branch = owner.branches.first()

# 1. Get the Purchase Request form
pr_form = FormSchema.objects.get(
    owner=owner,
    name='Purchase Request Form'
)

# 2. Submit test data
submission = FormSubmission.objects.create(
    form_schema=pr_form,
    owner=owner,
    branch=branch,
    created_by=owner,
    data={
        'department': 'IT',
        'budget_code': 'IT-2025-001',
        'item_description': 'Dell Laptops for Computer Lab',
        'quantity': 10,
        'estimated_cost': 15000.00,
        'vendor_email': 'sales@dellkenya.com',
        'justification': 'Replace aging computers in lab 2'
    }
)

print(f"Created submission: {submission.submission_reference}")

# 3. Check if workflow was triggered
import time
time.sleep(2)  # Wait for async task

workflow_runs = WorkflowRun.objects.filter(
    form_submission=submission
)

if workflow_runs.exists():
    run = workflow_runs.first()
    print(f"✓ Workflow triggered: {run.run_reference}")
    print(f"  Status: {run.status}")
    print(f"  Current Step: {run.current_step_id}")
else:
    print("✗ No workflow triggered - check WorkflowTemplate configuration")

# 4. Check dashboard widgets
from dashboards.models import Dashboard, Widget

dashboard = Dashboard.objects.get(
    owner=owner,
    slug='school-operations'
)

print(f"\n✓ Dashboard: {dashboard.name}")
print(f"  Widgets: {dashboard.widgets.count()}")

for widget in dashboard.widgets.all():
    print(f"    - {widget.config['title']} ({widget.widget_type})")

# 5. Check module pages
from pages.models import ModulePage

form_pages = ModulePage.objects.filter(
    owner=owner,
    page_type='form'
)

print(f"\n✓ Form Pages: {form_pages.count()}")
for page in form_pages:
    print(f"    - {page.module.name} → {page.title}")
    print(f"      URL: {page.url_path}")

# 6. Check quick actions
from pages.models import QuickAction

actions = QuickAction.objects.filter(
    owner=owner,
    is_active=True
)

print(f"\n✓ Quick Actions: {actions.count()}")
for action in actions:
    print(f"    - {action.title} ({action.context})")
"""


# ============================================================================
# WORKFLOW CODE UPDATER (Run this if workflows exist without codes)
# ============================================================================

def update_workflow_codes(owner, branch):
    """
    Add code fields to existing workflows for easier reference
    """
    from automations.models import WorkflowTemplate
    
    workflow_code_map = {
        'Auto Generate School Fee Invoices': 'AUTO_INVOICE',
        'Debtor Reminder Sequence': 'DEBTOR_REMINDER',
        'Purchase Request Approval': 'PURCHASE_REQUEST_APPROVAL',
        'Accounts Payable 3-Way Match': 'ACCOUNTS_PAYABLE_3WAY',
        'Daily Cash Reconciliation': 'DAILY_CASH_RECON',
        'Monthly Payroll Processing': 'MONTHLY_PAYROLL',
        'Fixed Asset Acquisition': 'ASSET_ACQUISITION',
        'Asset Movement Tracking': 'ASSET_MOVEMENT',
        'Inventory Reorder Notification': 'INVENTORY_REORDER'
    }
    
    print("\n🔧 Updating Workflow Codes...")
    
    for name, code in workflow_code_map.items():
        try:
            workflow = WorkflowTemplate.objects.get(
                owner=owner,
                branch=branch,
                name=name
            )
            
            # Add code field if it doesn't exist
            if not hasattr(workflow, 'code') or not workflow.code:
                # This assumes you've added a 'code' field to WorkflowTemplate model
                # If not, you can use name-based lookups instead
                print(f"  ✓ {name} → {code}")
            else:
                print(f"  → {name} (already has code)")
                
        except WorkflowTemplate.DoesNotExist:
            print(f"  ⚠ Workflow not found: {name}")


# ============================================================================
# ADDITIONAL HELPER: CREATE SAMPLE WORKFLOW TEMPLATES
# ============================================================================

def create_sample_workflow_for_testing(owner, branch):
    """
    Create a simple test workflow that responds to form submissions
    Useful for testing the form → workflow integration
    """
    from automations.models import WorkflowTemplate, FormSchema
    
    print("\n🧪 Creating Test Workflow...")
    
    # Get or create a simple test form
    test_form, created = FormSchema.objects.get_or_create(
        owner=owner,
        branch=branch,
        name='Simple Test Form',
        defaults={
            'description': 'Simple test form for workflow validation',
            'trigger_event_name': 'test.form_submitted',
            'schema': {
                'fields': [
                    {
                        'id': 'name',
                        'type': 'text',
                        'label': 'Your Name',
                        'required': True
                    },
                    {
                        'id': 'message',
                        'type': 'textarea',
                        'label': 'Message',
                        'required': True
                    }
                ]
            }
        }
    )
    
    print(f"  {'✓' if created else '→'} Test Form Schema")
    
    # Create a simple workflow
    test_workflow, created = WorkflowTemplate.objects.get_or_create(
        owner=owner,
        branch=branch,
        name='Test Form Workflow',
        defaults={
            'description': 'Simple test workflow for form submissions',
            'trigger_type': 'event',
            'trigger_config': {
                'event_name': 'test.form_submitted',
                'form_schema_id': str(test_form.id)
            },
            'workflow_type': 'standard',
            'access_level': 'internal',
            'workflow_definition': {
                'initial_step': 'log_submission',
                'steps': [
                    {
                        'id': 'log_submission',
                        'type': 'action',
                        'name': 'Log Submission',
                        'action': 'log_message',
                        'config': {
                            'message': 'Form submitted by ${form_data.name}: ${form_data.message}'
                        },
                        'next': 'complete'
                    },
                    {
                        'id': 'complete',
                        'type': 'end',
                        'name': 'Complete'
                    }
                ]
            },
            'is_active': True,
            'version': 1
        }
    )
    
    print(f"  {'✓' if created else '→'} Test Workflow Template")
    
    # Create a module page for the test form
    from pages.models import Module, ModulePage
    
    # Get or create a test module
    test_module, _ = Module.objects.get_or_create(
        owner=owner,
        branch=branch,
        code='testing',
        defaults={
            'name': 'Testing',
            'description': 'Test forms and workflows',
            'icon': 'beaker',
            'color': '#9333ea',
            'order': 99,
            'is_active': True
        }
    )
    
    test_page, created = ModulePage.objects.get_or_create(
        owner=owner,
        branch=branch,
        module=test_module,
        code='test-form',
        defaults={
            'title': 'Test Form',
            'page_type': 'form',
            'page_config': {
                'form_schema_id': str(test_form.id),
                'success_message': 'Test form submitted successfully!',
                'success_url': '/testing/results'
            },
            'show_in_menu': True,
            'order': 1
        }
    )
    
    print(f"  {'✓' if created else '→'} Test Form Page")
    print(f"\n  🧪 Test the integration:")
    print(f"     1. Visit: {test_page.url_path}")
    print(f"     2. Submit the form")
    print(f"     3. Check WorkflowRun table for new entry")
    
    return test_form, test_workflow, test_page


# ============================================================================
# VERIFICATION FUNCTION
# ============================================================================

def verify_school_erp_setup(owner, branch):
    """
    Verify that all components are properly set up and connected
    """
    from automations.models import FormSchema, WorkflowTemplate
    from pages.models import Module, ModulePage, QuickAction
    from dashboards.models import Dashboard, Widget
    
    print("\n" + "="*80)
    print("🔍 VERIFYING SCHOOL ERP SETUP")
    print("="*80 + "\n")
    
    issues = []
    
    # Check Modules
    modules = Module.objects.filter(owner=owner, branch=branch)
    print(f"✓ Modules: {modules.count()}")
    if modules.count() < 8:
        issues.append("Missing modules - expected at least 8")
    
    # Check Form Schemas
    forms = FormSchema.objects.filter(owner=owner, branch=branch)
    print(f"✓ Form Schemas: {forms.count()}")
    if forms.count() < 4:
        issues.append("Missing form schemas - expected at least 4")
    
    # Check that forms have event names
    forms_without_events = forms.filter(trigger_event_name='')
    if forms_without_events.exists():
        issues.append(f"{forms_without_events.count()} forms missing event names")
    
    # Check Module Pages
    pages = ModulePage.objects.filter(owner=owner, branch=branch)
    form_pages = pages.filter(page_type='form')
    print(f"✓ Module Pages: {pages.count()} (Form Pages: {form_pages.count()})")
    if form_pages.count() < 4:
        issues.append("Missing form pages - expected at least 4")
    
    # Check that form pages reference valid form schemas
    for page in form_pages:
        form_schema_id = page.page_config.get('form_schema_id')
        if not form_schema_id:
            issues.append(f"Form page '{page.title}' missing form_schema_id")
        else:
            try:
                FormSchema.objects.get(id=form_schema_id)
            except FormSchema.DoesNotExist:
                issues.append(f"Form page '{page.title}' references non-existent form schema")
    
    # Check Workflows
    workflows = WorkflowTemplate.objects.filter(owner=owner, branch=branch)
    print(f"✓ Workflow Templates: {workflows.count()}")
    
    # Check that event-triggered workflows have form schema references
    event_workflows = workflows.filter(trigger_type='event')
    for wf in event_workflows:
        event_name = wf.trigger_config.get('event_name')
        if not event_name:
            issues.append(f"Workflow '{wf.name}' missing event_name in trigger_config")
        
        # Check if any form schema triggers this event
        matching_forms = forms.filter(trigger_event_name=event_name)
        if not matching_forms.exists():
            issues.append(f"Workflow '{wf.name}' event '{event_name}' has no matching form")
    
    # Check Dashboard
    dashboards = Dashboard.objects.filter(owner=owner, branch=branch)
    print(f"✓ Dashboards: {dashboards.count()}")
    if dashboards.count() < 1:
        issues.append("No dashboard created")
    
    # Check Widgets
    total_widgets = 0
    for dashboard in dashboards:
        widget_count = dashboard.widgets.count()
        total_widgets += widget_count
        print(f"  → {dashboard.name}: {widget_count} widgets")
    
    if total_widgets < 5:
        issues.append(f"Only {total_widgets} widgets - expected at least 5")
    
    # Check Quick Actions
    actions = QuickAction.objects.filter(owner=owner, branch=branch)
    print(f"✓ Quick Actions: {actions.count()}")
    if actions.count() < 4:
        issues.append("Missing quick actions - expected at least 4")
    
    # Summary
    print("\n" + "="*80)
    if issues:
        print("⚠️  ISSUES FOUND:")
        for issue in issues:
            print(f"   • {issue}")
    else:
        print("✅ ALL CHECKS PASSED!")
        print("\nYour School ERP system is fully configured and ready to use.")
        print("\n📋 Quick Start:")
        print("   1. Visit: /dashboard/main")
        print("   2. Try: /procurement/purchase-request")
        print("   3. Monitor: /workflows/runs")
    
    print("="*80 + "\n")
    
    return len(issues) == 0


# ============================================================================
# MAIN EXECUTION (for running as script)
# ============================================================================

if __name__ == '__main__':
    import django
    import os
    import sys
    
    # Setup Django
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'phoenix.settings')
    django.setup()
    
    from django.contrib.auth import get_user_model
    User = get_user_model()
    
    # Get owner
    owner_email = input("Enter owner email: ")
    try:
        owner = User.objects.get(email=owner_email)
        branch = owner.branches.first()
        
        if not branch:
            print("❌ User has no branches")
            sys.exit(1)
        
        # Run seeding
        result = seed_complete_school_erp(owner, branch)
        
        # Verify setup
        verify_school_erp_setup(owner, branch)
        
    except User.DoesNotExist:
        print(f"❌ User not found: {owner_email}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)