"""
permissions/management/commands/seed_permissions.py

Idempotent seed command that populates the permission catalog:
  1. Module records  (one per logical application area)
  2. ModulePage records  (one per page within each module)
  3. PageAction records  (one per permission code used in the frontend)
  4. Optionally: RolePermissionPolicy records for every existing Role

Usage:
    # Seed catalog only (safe to run repeatedly):
    python manage.py seed_permissions

    # Also create role policies for a specific tenant:
    python manage.py seed_permissions --create-policies --tenant-id 1

    # Dry-run to preview what would be created:
    python manage.py seed_permissions --dry-run
"""
from django.core.management.base import BaseCommand
from django.db import transaction


# ─────────────────────────────────────────────────────────────────────────────
# Catalog definition
# Each entry: (module_code, module_name, module_icon, order)
# ─────────────────────────────────────────────────────────────────────────────
MODULES = [
    ('accounts',        'Accounts',         'BookOpen',         1),
    ('clients',         'Clients',          'Users',            2),
    ('incomes',         'Incomes',          'TrendingUp',       3),
    ('receivables',     'Receivables',      'DollarSign',       4),
    ('procurement',     'Procurement',      'ShoppingCart',     5),
    ('inventory',       'Inventory',        'Package',          6),
    ('expenses',        'Expenses',         'Receipt',          7),
    ('hr',              'HR',               'UserCheck',        8),
    ('assets',          'Assets',           'Layers',           9),
    ('liabilities',     'Liabilities',      'CreditCard',       10),
    ('treasury',        'Treasury',         'Vault',            11),
    ('banks',           'Banks',            'Landmark',         12),
    ('loans',           'Loans',            'Banknote',         13),
    ('budgets',         'Budgets',          'PieChart',         14),
    ('savings',         'Savings',          'PiggyBank',        15),
    ('cash-management', 'Cash Management',  'Coins',            16),
    ('reports',         'Reports',          'FileText',         17),
    ('automations',     'Automations',      'Zap',              18),
    ('dashboards',      'Dashboards',       'LayoutDashboard',  19),
    ('products',        'Products',         'Box',              20),
    ('discounts',       'Discounts',        'Tag',              21),
    ('branches',        'Branches',         'GitBranch',        22),
    ('tenants',         'Tenants',          'Building',         23),
    ('users',           'Users & Roles',    'Shield',           24),
    ('pages',           'Pages',            'File',             25),
    ('permissions',     'Permissions',      'Lock',             26),
    ('notifications',   'Notifications',    'Bell',             27),
    ('queries',         'Queries',          'Search',           28),
    ('tickets',         'Tickets',          'LifeBuoy',         29),
    ('transactions',    'Transactions',     'ArrowLeftRight',   30),
    ('common',          'System',           'Settings',         31),
    ('widgets',         'Widgets',          'Grid',             32),
    ('interbranch',     'Inter-Branch Transfers', 'Repeat',     33),
]

# ─────────────────────────────────────────────────────────────────────────────
# Pages: (module_code, page_code, page_title, page_type, order)
# ─────────────────────────────────────────────────────────────────────────────
PAGES = [
    # accounts
    ('accounts', 'chart-of-accounts', 'Chart of Accounts',    'list',   1),
    ('accounts', 'account-categories','Account Categories',   'list',   2),
    ('accounts', 'accounting-periods','Accounting Periods',   'list',   3),
    ('accounts', 'balance-sheet',     'Balance Sheet',        'custom', 4),
    # clients
    ('clients', 'clients',            'Clients',              'list',   1),
    ('clients', 'client-classifications','Client Classifications','list',2),
    ('clients', 'client-documents',   'Client Documents',     'list',   3),
    ('clients', 'client-relationships','Client Relationships','list',   4),
    ('clients', 'client-notes',       'Client Notes',         'list',   5),
    ('clients', 'client-groups',      'Client Groups',        'list',   6),
    # incomes
    ('incomes', 'academic-years',     'Academic Years',       'list',   1),
    ('incomes', 'academic-terms',     'Academic Terms',       'list',   2),
    ('incomes', 'income-categories',  'Income Categories',    'list',   3),
    ('incomes', 'service-items',      'Service Items',        'list',   4),
    ('incomes', 'incomes',            'Incomes',              'list',   5),
    ('incomes', 'fee-structures',     'Fee Structures',       'list',   6),
    ('incomes', 'invoices',           'Invoices',             'list',   7),
    ('incomes', 'fee-entitlements',   'Fee Entitlements',     'list',   8),
    ('incomes', 'payment-plans',      'Payment Plans',        'list',   9),
    ('incomes', 'payment-plan-installments','Installments',   'list',   10),
    # receivables
    ('receivables', 'customer-receivables','Customer Receivables','list',1),
    ('receivables', 'receivable-activity', 'Activity Log',   'list',   2),
    ('receivables', 'customer-statements', 'Statements',     'list',   3),
    # procurement
    ('procurement', 'purchase-requisitions','Purchase Requisitions','list',1),
    ('procurement', 'purchase-orders',  'Purchase Orders',   'list',   2),
    ('procurement', 'goods-received',   'Goods Received',    'list',   3),
    ('procurement', 'purchase-returns', 'Purchase Returns',  'list',   4),
    ('procurement', 'supplier-quotes',  'Supplier Quotes',   'list',   5),
    ('procurement', 'suppliers',        'Suppliers',         'list',   6),
    ('procurement', 'three-way-matching','3-Way Matching',   'list',   7),
    ('procurement', 'procurement-config','Settings',         'custom', 8),
    # inventory
    ('inventory', 'inventory-items',   'Inventory Items',    'list',   1),
    ('inventory', 'inventory-categories','Categories',       'list',   2),
    ('inventory', 'locations',         'Locations',          'list',   3),
    ('inventory', 'stock',             'Stock',              'list',   4),
    ('inventory', 'stock-movements',   'Movements',          'list',   5),
    ('inventory', 'stock-adjustments', 'Adjustments',        'list',   6),
    ('inventory', 'stock-transfers',   'Transfers',          'list',   7),
    ('inventory', 'allocations',       'Allocations',        'list',   8),
    ('inventory', 'allocation-redemptions','Redemptions',    'list',   9),
    ('inventory', 'write-offs',        'Write-offs',         'list',   10),
    ('inventory', 'sales-orders',      'Sales Orders',       'list',   11),
    ('inventory', 'physical-counts',   'Physical Counts',    'list',   12),
    ('inventory', 'pending-approvals', 'Pending Approvals',  'list',   13),
    # expenses
    ('expenses', 'expenses',           'Expenses',           'list',   1),
    ('expenses', 'resource-consumption','Resource Consumption','list', 2),
    ('expenses', 'resources',          'Resources',          'list',   3),
    ('expenses', 'prepaid-vouchers',   'Prepaid Vouchers',   'list',   4),
    ('expenses', 'expense-categories', 'Expense Categories', 'list',   5),
    # hr
    ('hr', 'staff',                    'Staff',              'list',   1),
    ('hr', 'salary-components',        'Salary Components',  'list',   2),
    ('hr', 'staff-pay-info',           'Staff Pay Info',     'list',   3),
    ('hr', 'bonus-deductions',         'Bonus & Deductions', 'list',   4),
    ('hr', 'payroll-schedules',        'Payroll Schedules',  'list',   5),
    ('hr', 'leave-types',              'Leave Types',        'list',   6),
    ('hr', 'leave-balances',           'Leave Balances',     'list',   7),
    ('hr', 'leave-requests',           'Leave Requests',     'list',   8),
    ('hr', 'attendance',               'Attendance',         'list',   9),
    ('hr', 'payroll',                  'Payroll',            'list',   10),
    ('hr', 'payslips',                 'Payslips',           'list',   11),
    ('hr', 'pension-remittances',      'Pension Remittances','list',   12),
    ('hr', 'employee-documents',       'Employee Documents', 'list',   13),
    ('hr', 'pay-component-removals',   'Pay Component Removals','list',14),
    ('hr', 'staff-ious',               'Staff IOUs',         'list',   15),
    ('hr', 'statutory-filings',        'Statutory Filings',  'list',   16),
    ('hr', 'hr-config',                'HR Config',          'custom', 17),
    # assets
    ('assets', 'fixed-assets',         'Fixed Assets',       'list',   1),
    ('assets', 'asset-categories',     'Asset Categories',   'list',   2),
    ('assets', 'asset-depreciation',   'Depreciation',       'list',   3),
    ('assets', 'asset-maintenance',    'Maintenance',        'list',   4),
    ('assets', 'asset-acquisitions',   'Acquisitions',       'list',   5),
    ('assets', 'asset-requisitions',   'Requisitions',       'list',   6),
    # liabilities
    ('liabilities', 'accounts-payable','Accounts Payable',   'list',   1),
    # treasury
    ('treasury', 'cashier-accounts',   'Cashier Accounts',   'list',   1),
    ('treasury', 'cash-collections',   'Cash Collections',   'list',   2),
    ('treasury', 'cash-reconciliation','Cash Reconciliation','list',   3),
    ('treasury', 'cash-transfers',     'Cash Transfers',     'list',   4),
    ('treasury', 'bank-reconciliation','Bank Reconciliation','list',   5),
    ('treasury', 'petty-cash-funds',   'Petty Cash Funds',   'list',   6),
    ('treasury', 'petty-cash-vouchers','Petty Cash Vouchers','list',   7),
    ('treasury', 'petty-cash-replenishments','Replenishments','list',  8),
    ('treasury', 'collection-sheets',  'Collection Sheets',  'list',   9),
    # banks
    ('banks', 'banks',                 'Banks',              'list',   1),
    ('banks', 'bank-accounts',         'Bank Accounts',      'list',   2),
    ('banks', 'bank-payments',         'Bank Payments',      'list',   3),
    ('banks', 'bank-transfers',        'Bank Transfers',     'list',   4),
    ('banks', 'bank-feed-consent',     'Bank Feed Consent',  'custom', 5),
    ('banks', 'bank-statement-uploads','Statement Uploads',  'list',   6),
    ('banks', 'bank-reconciliation-exceptions', 'Reconciliation Exceptions', 'list', 7),
    # loans
    ('loans', 'loan-accounts',         'Loan Accounts',      'list',   1),
    ('loans', 'loan-disbursements',    'Loan Disbursements', 'list',   2),
    ('loans', 'loan-disbursement-corrections', 'Disbursement Corrections', 'list', 3),
    # budgets
    ('budgets', 'budget-periods',      'Budget Periods',     'list',   1),
    ('budgets', 'budget-lines',        'Budget Lines',       'list',   2),
    # savings
    ('savings', 'savings-accounts',    'Savings Accounts',   'list',   1),
    ('savings', 'contribution-schedules','Contribution Schedules','list',2),
    ('savings', 'compulsory-savings-policies','Savings Policies','list',3),
    # cash-management
    ('cash-management', 'summary',     'Summary',            'custom',  1),
    # reports
    ('reports', 'financial-reports',   'Financial Reports',  'custom', 1),
    ('reports', 'report-categories',   'Report Categories',  'list',   2),
    ('reports', 'report-templates',    'Report Templates',   'list',   3),
    ('reports', 'report-executions',   'Report Executions',  'list',   4),
    # automations
    ('automations', 'forms',           'Forms',              'list',   1),
    ('automations', 'form-submissions','Form Submissions',   'list',   2),
    ('automations', 'workflow-templates','Workflow Templates','list',  3),
    ('automations', 'workflow-runs',   'Workflow Runs',      'list',   4),
    ('automations', 'workflow-approvals','Workflow Approvals','list',  5),
    # dashboards
    ('dashboards', 'dashboards',       'Dashboards',         'custom',  1),
    # products
    ('products', 'products',           'Products',           'list',   1),
    # users
    ('users', 'roles',                 'Roles',              'list',   1),
    ('users', 'staff-users',           'Staff Users',        'list',   2),
    # tenants
    ('tenants', 'tenants',             'Tenants',            'list',   1),
    # branches
    ('branches', 'branches',           'Branches',           'list',   1),
    # common
    ('common', 'business-day',         'Business Day',       'custom', 1),
    ('common', 'backdate-requests',    'Backdate Requests',  'list',   2),
    # permissions
    ('permissions', 'role-permission-policies','Role Policies','list', 1),
    ('permissions', 'user-permission-overrides','User Overrides','list',2),
    # notifications
    ('notifications', 'notifications', 'Notifications',      'list',   1),
    # interbranch
    ('interbranch', 'transfers',       'Inter-Branch Transfers', 'list', 1),
]

# ─────────────────────────────────────────────────────────────────────────────
# Actions: (module_code, page_code, action_code, action_name, action_type)
# These map to the requiredPermission codes used in the frontend.
# ─────────────────────────────────────────────────────────────────────────────
ACTIONS = [
    # ── accounts ──────────────────────────────────────────────────────────────
    ('accounts','chart-of-accounts','accounts-view',   'View Accounts',  'view'),
    ('accounts','chart-of-accounts','accounts-create', 'Create Account', 'create'),
    ('accounts','chart-of-accounts','accounts-edit',   'Edit Account',   'edit'),
    ('accounts','chart-of-accounts','trial-balance-view','View Trial Balance','view'),
    ('accounts','account-categories','account-categories-view',  'View Account Categories',  'view'),
    ('accounts','account-categories','account-categories-create','Create Account Category',  'create'),
    ('accounts','account-categories','account-categories-edit',  'Edit Account Category',    'edit'),
    ('accounts','balance-sheet',    'balance-sheet-view','View Balance Sheet','view'),
    ('accounts','financial-reports','cash-flow-view',  'View Cash Flow',  'view'),
    # ── clients ───────────────────────────────────────────────────────────────
    ('clients','clients','client-list',        'List Clients',     'view'),
    ('clients','clients','client-create',      'Create Client',    'create'),
    ('clients','clients','client-edit',        'Edit Client',      'edit'),
    ('clients','clients','client-view-detail', 'View Client Detail','view'),
    ('clients','clients','client-import',      'Import Clients',   'import'),
    # ── incomes ───────────────────────────────────────────────────────────────
    ('incomes','invoices','invoice-list',       'List Invoices',    'view'),
    ('incomes','invoices','invoice-create',     'Create Invoice',   'create'),
    ('incomes','invoices','invoice-edit',       'Edit Invoice',     'edit'),
    ('incomes','invoices','invoice-view-detail','View Invoice',     'view'),
    ('incomes','invoices','invoice-record-payment','Record Payment','process'),
    ('incomes','fee-structures','fee-structure-list',  'List Fee Structures','view'),
    ('incomes','fee-structures','fee-structure-create','Create Fee Structure','create'),
    ('incomes','fee-entitlements','entitlement-list',  'List Entitlements','view'),
    ('incomes','fee-entitlements','entitlement-create','Create Entitlement','create'),
    ('incomes','incomes','income-list',        'List Incomes',     'view'),
    # ── receivables ───────────────────────────────────────────────────────────
    ('receivables','customer-receivables','receivables-list',   'List Receivables','view'),
    ('receivables','customer-receivables','receivable-view-detail','View Receivable','view'),
    ('receivables','customer-receivables','write-off-approve',  'Approve Write-off','approve'),
    ('receivables','customer-receivables','issue-refund',       'Issue Refund',    'process'),
    # ── procurement ───────────────────────────────────────────────────────────
    ('procurement','purchase-requisitions','pr-list',    'List PRs',       'view'),
    ('procurement','purchase-requisitions','pr-create',  'Create PR',      'create'),
    ('procurement','purchase-requisitions','pr-edit',    'Edit PR',        'edit'),
    ('procurement','purchase-requisitions','pr-view-detail','View PR',     'view'),
    ('procurement','purchase-orders','po-list',          'List POs',       'view'),
    ('procurement','purchase-orders','po-create',        'Create PO',      'create'),
    ('procurement','purchase-orders','po-edit',          'Edit PO',        'edit'),
    ('procurement','purchase-orders','po-view-detail',   'View PO',        'view'),
    ('procurement','purchase-orders','po-manage',        'Manage PO',      'approve'),
    ('procurement','goods-received','grn-list',          'List GRNs',      'view'),
    ('procurement','goods-received','grn-create',        'Create GRN',     'create'),
    ('procurement','goods-received','grn-view-detail',   'View GRN',       'view'),
    ('procurement','goods-received','grn-quality-check', 'GRN Quality Check','process'),
    ('procurement','suppliers','supplier-list',          'List Suppliers',  'view'),
    ('procurement','suppliers','supplier-create',        'Create Supplier', 'create'),
    ('procurement','suppliers','supplier-edit',          'Edit Supplier',   'edit'),
    ('procurement','suppliers','supplier-view-detail',   'View Supplier',   'view'),
    ('procurement','supplier-quotes','quote-list',       'List Quotes',     'view'),
    ('procurement','supplier-quotes','quote-create',     'Create Quote',    'create'),
    ('procurement','supplier-quotes','quote-edit',       'Edit Quote',      'edit'),
    ('procurement','supplier-quotes','quote-view-detail','View Quote',      'view'),
    ('procurement','supplier-quotes','quote-compare',    'Compare Quotes',  'view'),
    ('procurement','purchase-returns','return-list',     'List Returns',    'view'),
    ('procurement','purchase-returns','return-create',   'Create Return',   'create'),
    ('procurement','purchase-returns','return-edit',     'Edit Return',     'edit'),
    ('procurement','purchase-returns','return-view-detail','View Return',   'view'),
    # ── inventory ─────────────────────────────────────────────────────────────
    ('inventory','inventory-items','item-list',          'List Items',      'view'),
    ('inventory','inventory-items','item-create',        'Create Item',     'create'),
    ('inventory','inventory-items','item-edit',          'Edit Item',       'edit'),
    ('inventory','inventory-items','item-view-detail',   'View Item',       'view'),
    ('inventory','inventory-items','item-import',        'Import Items',    'import'),
    ('inventory','stock-movements','movement-list',      'List Movements',  'view'),
    ('inventory','locations','location-list',            'List Locations',  'view'),
    ('inventory','stock-adjustments','adjustment-list',  'List Adjustments','view'),
    ('inventory','stock-adjustments','adjustment-create','Create Adjustment','create'),
    ('inventory','stock-adjustments','adjustment-view-detail','View Adjustment','view'),
    ('inventory','stock-transfers','transfer-list',      'List Transfers',  'view'),
    ('inventory','stock-transfers','transfer-create',    'Create Transfer', 'create'),
    ('inventory','write-offs','write-off-list',          'List Write-offs', 'view'),
    ('inventory','write-offs','write-off-create',        'Create Write-off','create'),
    ('inventory','physical-counts','physical-count-list','List Physical Counts','view'),
    ('inventory','physical-counts','physical-count-create','Create Physical Count','create'),
    ('inventory','sales-orders','sales-order-list',      'List Sales Orders','view'),
    ('inventory','sales-orders','sales-order-create',    'Create Sales Order','create'),
    ('inventory','allocations','allocation-list',        'List Allocations','view'),
    ('inventory','inventory-items','material-request-list', 'List Material Requests','view'),
    ('inventory','inventory-items','material-request-create','Create Material Request','create'),
    ('inventory','inventory-items','office-use-request-list','List Office-Use Requests','view'),
    ('inventory','inventory-items','office-use-request-create','Create Office-Use Request','create'),
    # ── expenses ──────────────────────────────────────────────────────────────
    ('expenses','expenses','expense-list',               'List Expenses',   'view'),
    ('expenses','expenses','expense-create',             'Create Expense',  'create'),
    ('expenses','expenses','expense-edit',               'Edit Expense',    'edit'),
    ('expenses','resources','expenses-resource-list',    'List Resources',  'view'),
    ('expenses','resources','expenses-resource-create',  'Create Resource', 'create'),
    ('expenses','resources','expenses-resource-edit',    'Edit Resource',   'edit'),
    ('expenses','resource-consumption','consumption-list',  'List Consumptions','view'),
    ('expenses','resource-consumption','consumption-create','Create Consumption','create'),
    ('expenses','resource-consumption','consumption-approve','Approve Consumption','approve'),
    # ── HR ────────────────────────────────────────────────────────────────────
    ('hr','staff','staff-list',                          'List Staff',      'view'),
    ('hr','staff','staff-create',                        'Create Staff',    'create'),
    ('hr','staff','staff-edit',                          'Edit Staff',      'edit'),
    ('hr','staff','staff-view-detail',                   'View Staff',      'view'),
    ('hr','staff','staff-import',                        'Import Staff',    'import'),
    ('hr','attendance','attendance-list',                'List Attendance', 'view'),
    ('hr','attendance','attendance-create',              'Create Attendance','create'),
    ('hr','attendance','attendance-edit',                'Edit Attendance', 'edit'),
    ('hr','attendance','attendance-view-detail',         'View Attendance', 'view'),
    ('hr','leave-requests','leave-request-list',         'List Leave Requests','view'),
    ('hr','leave-requests','leave-request-create',       'Create Leave Request','create'),
    ('hr','leave-requests','leave-request-approve',      'Approve Leave',   'approve'),
    ('hr','payroll','payroll-list',                      'List Payroll',    'view'),
    ('hr','payroll','payroll-create',                    'Create Payroll',  'create'),
    ('hr','payroll','payroll-edit',                      'Edit Payroll',    'edit'),
    ('hr','payroll','payroll-run',                       'Run Payroll',     'process'),
    ('hr','payslips','payroll-view-payslip',             'View Payslip',    'view'),
    ('hr','hr-config','hr-config',                       'HR Config',       'custom'),
    # ── assets ────────────────────────────────────────────────────────────────
    ('assets','fixed-assets','asset-list',               'List Assets',     'view'),
    ('assets','fixed-assets','asset-create',             'Create Asset',    'create'),
    ('assets','fixed-assets','asset-edit',               'Edit Asset',      'edit'),
    ('assets','asset-depreciation','asset-depreciate',   'Run Depreciation','process'),
    ('assets','fixed-assets','asset-dispose',            'Dispose Asset',   'process'),
    # ── liabilities ───────────────────────────────────────────────────────────
    ('liabilities','accounts-payable','payables-list',   'List Payables',   'view'),
    ('liabilities','accounts-payable','payables-create', 'Create Payable',  'create'),
    # ── treasury ──────────────────────────────────────────────────────────────
    ('treasury','cashier-accounts','treasury-list',      'List Treasury',   'view'),
    ('treasury','cashier-accounts','treasury-create',    'Create Treasury Record','create'),
    ('treasury','cashier-accounts','treasury-edit',      'Edit Treasury Record','edit'),
    ('treasury','bank-reconciliation','treasury-reconcile','Reconcile',     'process'),
    # ── banks ─────────────────────────────────────────────────────────────────
    ('banks','bank-accounts','bank-list',                'List Banks',      'view'),
    ('banks','bank-accounts','bank-create',              'Create Bank',     'create'),
    ('banks','bank-accounts','bank-edit',                'Edit Bank',       'edit'),
    ('banks','bank-transfers','bank-approve',            'Approve Bank Transfer','approve'),
    # ── interbranch ───────────────────────────────────────────────────────────
    ('interbranch','transfers','interbranch-reverse',    'Reverse Inter-Branch Transfer','approve'),
    ('banks','bank-reconciliation-exceptions','bank-recon-resolve','Resolve Reconciliation Exception','approve'),
    # ── loans ─────────────────────────────────────────────────────────────────
    ('loans','loan-accounts','loan-list',                'List Loans',      'view'),
    ('loans','loan-accounts','loan-create',              'Create Loan',     'create'),
    ('loans','loan-accounts','loan-edit',                'Edit Loan',       'edit'),
    ('loans','loan-accounts','loan-view-detail',         'View Loan',       'view'),
    ('loans','loan-accounts','loan-approve',             'Approve Loan',    'approve'),
    ('loans','loan-accounts','loan-reject',              'Reject Loan',     'reject'),
    ('loans','loan-disbursements','loan-disbursement-list',  'List Disbursements','view'),
    ('loans','loan-disbursements','loan-disbursement-approve','Approve Disbursement','approve'),
    ('loans','loan-disbursement-corrections','loan-correction-approve','Approve Disbursement Correction','approve'),
    # ── budgets ───────────────────────────────────────────────────────────────
    ('budgets','budget-periods','budget-list',           'List Budgets',    'view'),
    ('budgets','budget-periods','budget-create',         'Create Budget',   'create'),
    ('budgets','budget-periods','budget-edit',           'Edit Budget',     'edit'),
    # ── savings ───────────────────────────────────────────────────────────────
    ('savings','savings-accounts','savings-list',        'List Savings',    'view'),
    ('savings','savings-accounts','savings-create',      'Create Savings',  'create'),
    # ── cash management ───────────────────────────────────────────────────────
    ('cash-management','collection-sheets','cash-management-list','List Cash Mgmt','view'),
    ('cash-management','collection-sheets','cash-management-create','Create Cash Mgmt','create'),
    # ── reports ───────────────────────────────────────────────────────────────
    ('reports','financial-reports','report-list',        'List Reports',    'view'),
    ('reports','financial-reports','report-create',      'Create Report',   'create'),
    ('reports','financial-reports','report-edit',        'Edit Report',     'edit'),
    # ── automations / forms ───────────────────────────────────────────────────
    ('automations','forms','form-list',                  'List Forms',      'view'),
    ('automations','forms','form-create',                'Create Form',     'create'),
    ('automations','workflow-templates','workflow-list', 'List Workflows',  'view'),
    ('automations','workflow-templates','workflow-create','Create Workflow','create'),
    ('automations','workflow-templates','automation-list',  'List Automations','view'),
    ('automations','workflow-templates','automation-create','Create Automation','create'),
    ('automations','workflow-templates','automation-edit',  'Edit Automation', 'edit'),
    ('automations','workflow-approvals','approval-list', 'List Approvals',  'view'),
    # ── dashboards ────────────────────────────────────────────────────────────
    ('dashboards','dashboards','dashboard-view',         'View Dashboard',  'view'),
    ('dashboards','dashboards','dashboard-create',       'Create Dashboard','create'),
    ('dashboards','dashboards','dashboard-edit',         'Edit Dashboard',  'edit'),
    # ── discounts ─────────────────────────────────────────────────────────────
    ('discounts','discounts','discount-list',            'List Discounts',  'view'),
    ('discounts','discounts','discount-create',          'Create Discount', 'create'),
    ('discounts','discounts','discount-edit',            'Edit Discount',   'edit'),
    # ── users / admin ─────────────────────────────────────────────────────────
    ('users','staff-users','user-list',                  'List Users',      'view'),
    ('users','staff-users','user-create',                'Create User',     'create'),
    ('users','staff-users','user-edit',                  'Edit User',       'edit'),
    # ── tenants ───────────────────────────────────────────────────────────────
    ('tenants','tenants','tenant-manage',                'Manage Tenants',  'custom'),
    # ── branches ──────────────────────────────────────────────────────────────
    ('branches','branches','branch-manage',              'Manage Branches', 'custom'),
    # ── products ──────────────────────────────────────────────────────────────
    ('products','products','product-list',               'List Products',   'view'),
    ('products','products','product-create',             'Create Product',  'create'),
    # ── common / system ───────────────────────────────────────────────────────
    ('common','business-day','business-day-manage',      'Manage Business Day','custom'),
    # ── credit notes ──────────────────────────────────────────────────────────
    ('incomes','invoices','credit-note-list',            'List Credit Notes','view'),
    ('incomes','invoices','credit-note-create',          'Create Credit Note','create'),
    # ── journal vouchers ──────────────────────────────────────────────────────
    ('accounts','chart-of-accounts','voucher-list',      'List Vouchers',   'view'),
    ('accounts','chart-of-accounts','voucher-create',    'Create Voucher',  'create'),
]

# ─────────────────────────────────────────────────────────────────────────────
# Role permission matrix  (role_name_pattern → permission code set)
# Applied when --create-policies is used.
#
# DIRECTOR / PRINCIPAL → full access (all codes)
# ADMIN                → full access minus tenant-manage
# AUDITOR              → view + export only
# STAFF / TEACHER      → domain codes only
# CASHIER              → treasury + bank + receivables
# HR OFFICER           → hr module only
# ─────────────────────────────────────────────────────────────────────────────
DIRECTOR_CODES = None     # None = ALL codes
AUDITOR_VIEW_ONLY = True  # View/export flags, no create/edit/delete/approve


class Command(BaseCommand):
    help = 'Seed permission catalog: Modules, Pages, Actions, and optionally Role Policies'

    def add_arguments(self, parser):
        parser.add_argument(
            '--create-policies',
            action='store_true',
            default=False,
            help='Also create RolePermissionPolicy records for existing roles',
        )
        parser.add_argument(
            '--tenant-id',
            type=int,
            default=None,
            help='Only create policies for roles belonging to this tenant ID',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            default=False,
            help='Print what would be created without writing to DB',
        )

    # ─────────────────────────────────────────────────────────────────────────

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        create_policies = options['create_policies']
        tenant_id = options['tenant_id']

        if dry_run:
            self.stdout.write(self.style.WARNING('[DRY RUN] No changes will be saved.\n'))

        with transaction.atomic():
            modules = self._seed_modules(dry_run)
            pages = self._seed_pages(modules, dry_run)
            actions = self._seed_actions(modules, pages, dry_run)

            if create_policies:
                self._seed_role_policies(modules, pages, actions, tenant_id, dry_run)

            if dry_run:
                transaction.set_rollback(True)

        self.stdout.write(self.style.SUCCESS('\nPermission catalog seed complete.\n'))

    # ─────────────────────────────────────────────────────────────────────────

    def _seed_modules(self, dry_run):
        from pages.models import Module

        self.stdout.write('\n[1] Modules')
        created = 0
        module_map = {}

        for (code, name, icon, order) in MODULES:
            if not dry_run:
                obj, was_created = Module.all_objects.get_or_create(
                    owner=None, branch=None, code=code,
                    defaults=dict(
                        name=name, icon=icon, order=order,
                        is_active=True, is_deleted=False,
                    ),
                )
                if was_created:
                    created += 1
                module_map[code] = obj
            else:
                self.stdout.write(f'  would create/get Module: {code}')
                module_map[code] = None

        self.stdout.write(f'  Created {created} new modules (existing untouched)')
        return module_map

    def _seed_pages(self, module_map, dry_run):
        from pages.models import Module, ModulePage
        from django.db import IntegrityError

        self.stdout.write('\n[2] Module Pages')
        created = 0
        page_map = {}   # (module_code, page_code) → ModulePage

        for (mod_code, page_code, title, page_type, order) in PAGES:
            module = module_map.get(mod_code)
            key = (mod_code, page_code)

            if not dry_run and module:
                # Use update_or_create to avoid url_path uniqueness conflicts
                url_path = f'/{mod_code}/{page_code}/'
                try:
                    obj, was_created = ModulePage.all_objects.get_or_create(
                        module=module, code=page_code,
                        defaults=dict(
                            title=title, page_type=page_type, order=order,
                            is_active=True, is_deleted=False,
                            url_path=url_path, page_config={},
                        ),
                    )
                    if was_created:
                        created += 1
                    page_map[key] = obj
                except IntegrityError:
                    # url_path conflict — fetch existing
                    try:
                        obj = ModulePage.all_objects.get(module=module, code=page_code)
                        page_map[key] = obj
                    except ModulePage.DoesNotExist:
                        self.stdout.write(self.style.WARNING(
                            f'  Skipped page {mod_code}/{page_code}: url_path conflict'
                        ))
            else:
                self.stdout.write(f'  would create/get Page: {mod_code}/{page_code}')
                page_map[key] = None

        self.stdout.write(f'  Created {created} new pages (existing untouched)')
        return page_map

    def _seed_actions(self, module_map, page_map, dry_run):
        from pages.action_models import PageAction

        self.stdout.write('\n[3] Page Actions (permission codes)')
        created = 0
        action_map = {}  # action_code → PageAction

        for (mod_code, page_code, action_code, action_name, action_type) in ACTIONS:
            module = module_map.get(mod_code)
            page = page_map.get((mod_code, page_code))

            if not dry_run and module:
                obj, was_created = PageAction.all_objects.get_or_create(
                    module=module, page=page, code=action_code,
                    defaults=dict(
                        name=action_name, action_type=action_type,
                        is_active=True, is_deleted=False, owner=None,
                    ),
                )
                if was_created:
                    created += 1
                action_map[action_code] = obj
            else:
                self.stdout.write(f'  would create/get Action: {action_code}')
                action_map[action_code] = None

        self.stdout.write(f'  Created {created} new actions (existing untouched)')
        return action_map

    def _seed_role_policies(self, module_map, page_map, action_map, tenant_id, dry_run):
        from users.models import Role
        from permissions.models import RolePermissionPolicy

        self.stdout.write('\n[4] Role Permission Policies')

        qs = Role.objects.all()
        if tenant_id:
            qs = qs.filter(tenant_id=tenant_id)

        created = 0
        for role in qs:
            role_name = role.name.lower()

            # Determine what permission level this role gets
            is_superadmin = any(k in role_name for k in ('director', 'principal', 'sys_admin', 'sysadmin', 'system admin'))
            is_admin = any(k in role_name for k in ('admin', 'manager', 'supervisor'))
            is_auditor = 'auditor' in role_name
            is_hr = 'hr' in role_name or 'human resource' in role_name
            is_cashier = any(k in role_name for k in ('cashier', 'teller'))
            is_finance = any(k in role_name for k in ('finance', 'accountant', 'accounts'))

            for action_code, action_obj in action_map.items():
                if action_obj is None:
                    continue

                # Determine flags based on role
                if is_superadmin:
                    flags = dict(can_view=True, can_create=True, can_edit=True,
                                 can_delete=True, can_approve=True, can_export=True)
                elif is_admin:
                    # Admin: full except delete for financial + no tenant-manage
                    if action_code == 'tenant-manage':
                        continue
                    flags = dict(can_view=True, can_create=True, can_edit=True,
                                 can_delete=False, can_approve=True, can_export=True)
                elif is_auditor:
                    flags = dict(can_view=True, can_create=False, can_edit=False,
                                 can_delete=False, can_approve=False, can_export=True)
                elif is_hr:
                    # HR: only hr module codes
                    hr_codes = {c for c in action_map if any(
                        c.startswith(p) for p in ('staff-', 'payroll-', 'attendance-',
                                                    'leave-', 'hr-', 'salary-', 'pension-')
                    )}
                    if action_code not in hr_codes:
                        continue
                    flags = dict(can_view=True, can_create=True, can_edit=True,
                                 can_delete=False, can_approve=False, can_export=True)
                elif is_cashier:
                    cashier_codes = {c for c in action_map if any(
                        c.startswith(p) for p in ('treasury-', 'bank-', 'receivables-',
                                                    'cash-management-', 'savings-',
                                                    'invoice-', 'receivable-')
                    )}
                    if action_code not in cashier_codes:
                        continue
                    flags = dict(can_view=True, can_create=True, can_edit=False,
                                 can_delete=False, can_approve=False, can_export=False)
                elif is_finance:
                    finance_codes = {c for c in action_map if any(
                        c.startswith(p) for p in ('accounts-', 'voucher-', 'balance-',
                                                    'trial-', 'cash-flow-', 'report-',
                                                    'payables-', 'expense-', 'bank-',
                                                    'treasury-', 'budget-')
                    )}
                    if action_code not in finance_codes:
                        continue
                    flags = dict(can_view=True, can_create=True, can_edit=True,
                                 can_delete=False, can_approve=False, can_export=True)
                else:
                    # Generic staff: view only for non-destructive actions
                    if any(sfx in action_code for sfx in ('-delete', '-dispose', '-depreciate', 'tenant-manage', 'branch-manage')):
                        continue
                    flags = dict(can_view=True, can_create=False, can_edit=False,
                                 can_delete=False, can_approve=False, can_export=False)

                if not dry_run:
                    _, was_created = RolePermissionPolicy.objects.get_or_create(
                        role=role,
                        module=action_obj.module,
                        page=action_obj.page,
                        action=action_obj,
                        defaults={**flags, 'scope': 'own_branch'},
                    )
                    if was_created:
                        created += 1
                else:
                    self.stdout.write(f'  would create policy: {role.name} → {action_code}')

        self.stdout.write(f'  Created {created} new role policies')
