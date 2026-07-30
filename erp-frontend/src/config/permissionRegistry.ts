/**
 * permissionRegistry.ts
 *
 * Single source of truth for every module and page that exists in this
 * frontend app.  When the permission setup page loads, it syncs this list
 * to the backend, which auto-creates the Module / ModulePage DB records
 * so that RolePermissionPolicy FKs can reference them.
 *
 * Adding a new frontend page:
 *   1. Add it here under the right module.
 *   2. Make sure the backend ViewSet has matching permission_module + permission_page.
 *   That's it — the permission setup page picks it up automatically.
 */

export interface PermPage {
  code: string;
  title: string;
  description?: string;
  /** One page = one canonical route. Use this when the page maps to a single path. */
  path?: string;
  /** Pages legitimately covering multiple routes (list/new/edit/detail of ONE entity). */
  paths?: string[];
}

export interface PermModule {
  code: string;
  name: string;
  icon: string;
  color: string;
  description?: string;
  pages: PermPage[];
}

export const PERMISSION_REGISTRY: PermModule[] = [
  {
    code: 'clients',
    name: 'Clients',
    icon: 'Users',
    color: '#4f46e5',
    description: 'Client registration, groups, and relationship management',
    pages: [
      { code: 'clients', title: 'Client List', description: 'View and manage client records', paths: ['/clients', '/clients/:clientId/ledger', '/clients/:id', '/clients/:id/edit', '/clients/:id/statement', '/clients/create', '/clients/import', '/clients/registration-config', '/clients/school-fees-import'] },
      { code: 'client-groups', title: 'Client Groups', description: 'Ajo / savings groups and member management', paths: ['/clients/groups', '/reports/clients/groups'] },
      { code: 'client-classifications', title: 'Classifications', description: 'Client classification categories', paths: ['/clients/classifications', '/clients/classifications/:id/edit', '/clients/classifications/create'] },
      { code: 'client-documents', title: 'Documents', description: 'Upload and view client documents' },
      { code: 'client-notes', title: 'Notes', description: 'Client interaction notes' },
      { code: 'client-relationships', title: 'Relationships', description: 'Client-to-client relationship records' },
      { code: 'client-services', title: 'Client Services', description: 'Service assignment for clients (e.g. student services)', path: '/client-services' },
      { code: 'prospects', title: 'Prospects', description: 'Prospective client pipeline and reactivation', paths: ['/clients/reactivate', '/prospects'] },
    ],
  },
  {
    code: 'loans',
    name: 'Loans',
    icon: 'CreditCard',
    color: '#0891b2',
    description: 'Loan origination, disbursement, repayment, and collections',
    pages: [
      { code: 'loan-accounts', title: 'Loan Accounts', description: 'Create and manage loan accounts', paths: ['/loans/accounts', '/loans/accounts/:id', '/loans/accounts/create', '/loans/restructure-approvals'] },
      { code: 'loan-verification', title: 'Loan Verification', description: 'Verify loan applications before disbursement', paths: ['/loans/verification', '/loans/verification/:loanId'] },
      { code: 'loan-collection', title: 'Loan Collection', description: 'Field loan repayment collection', path: '/loans/collection' },
      { code: 'loan-repayment-approvals', title: 'Repayment Approvals', description: 'Approve savings-debit repayment requests', path: '/loans/repayment-approvals' },
      { code: 'loan-products', title: 'Loan Products', description: 'Configure loan product types', paths: ['/loans/products', '/loans/products/:id/config'] },
      { code: 'loan-disbursements', title: 'Disbursements', description: 'Disburse approved loans', paths: ['/loans/disbursements', '/loans/disbursements/:loanId'] },
      { code: 'loan-disbursement-corrections', title: 'Disbursement Corrections', description: 'Fix loans disbursed to the wrong customer (always dual director approval)', path: '/loans/disbursement-corrections' },
      { code: 'loan-repayment-requests', title: 'Repayment Requests', description: 'Savings-debit repayment requests' },
      { code: 'loan-reports', title: 'Loan Reports', description: 'Portfolio, debtors, defaulters, PAR, disbursement master roll, daily collection and staff performance reports', paths: ['/reports/daily-summary', '/reports/disbursement-master-roll', '/reports/daily-collection-report', '/reports/staff-performance', '/reports/daily-transactions', '/reports/loans/debtors', '/reports/loans/defaulters', '/reports/loans/par', '/reports/officer-portfolio', '/reports/portfolio-performance', '/reports/summary'] },
    ],
  },
  {
    code: 'savings',
    name: 'Savings',
    icon: 'PiggyBank',
    color: '#059669',
    description: 'Savings accounts, deposits, withdrawals, and schedules',
    pages: [
      { code: 'savings-accounts', title: 'Savings Accounts', description: 'View and manage savings accounts', paths: ['/savings/accounts', '/savings/accounts/:id', '/savings/accounts/create'] },
      { code: 'savings-withdrawals', title: 'Withdrawals', description: 'Process savings withdrawals', path: '/savings/withdrawals' },
      { code: 'savings-deposit', title: 'Deposits', description: 'Process savings deposits', path: '/savings/deposit' },
      { code: 'savings-collection', title: 'Collection', description: 'Field savings collection — sheet, spreadsheet, and multi-day views', paths: ['/reports/contributions/daily', '/reports/contributions/spreadsheet', '/savings/collection', '/savings/collection/multi-day', '/savings/collection/sheet', '/savings/collection/spreadsheet'] },
      { code: 'compulsory-savings-policies', title: 'Compulsory Savings Policies', description: 'Mandatory savings rules', path: '/savings/policy' },
      { code: 'combined-receipt', title: 'Combined Receipt', description: 'Print combined/group savings receipts', paths: ['/savings/combined-receipt', '/savings/group-combined-receipt'] },
      { code: 'savings-reports', title: 'Savings Reports', description: 'Savings-by-product reporting', path: '/reports/savings-by-product' },
      { code: 'contribution-schedules', title: 'Contribution Schedules', description: 'Savings contribution schedules' },
    ],
  },
  {
    code: 'cash-management',
    name: 'Cash Management',
    icon: 'Wallet',
    color: '#d97706',
    description: 'Cashier accounts, collections, transfers, and reconciliation',
    pages: [
      { code: 'summary', title: 'Treasury Summary', description: 'Treasury module landing/summary dashboard', paths: ['/treasury', '/treasury/dashboard'] },
      { code: 'collection-sheets', title: 'Collection Sheets', description: 'Group collection sheets', paths: ['/cash-management/collection-sheets', '/cash-management/collection-sheets/:sheetId'] },
      { code: 'cashier-accounts', title: 'Cashier Accounts', description: 'Manage cashier float accounts', paths: ['/treasury/cashier-accounts', '/treasury/cashier-accounts/new'] },
      { code: 'cash-collections', title: 'Cash Collections', description: 'Record cash received' },
      { code: 'cash-transfers', title: 'Cash Transfers', description: 'Transfer between cashier accounts', paths: ['/treasury/cash-transfers', '/treasury/cash-transfers/new'] },
      { code: 'cash-reconciliation', title: 'Cash Reconciliation', description: 'Daily cashier reconciliation', path: '/treasury/cash-reconciliation' },
      { code: 'petty-cash-funds', title: 'Petty Cash Funds', description: 'Manage petty cash funds', paths: ['/petty-cash', '/treasury/petty-cash', '/treasury/petty-cash/funds/:id', '/treasury/petty-cash/funds/:id/edit', '/treasury/petty-cash/funds/new'] },
      { code: 'petty-cash-vouchers', title: 'Petty Cash Vouchers', description: 'Record petty cash payments', paths: ['/treasury/petty-cash/vouchers', '/treasury/petty-cash/vouchers/:id', '/treasury/petty-cash/vouchers/:id/edit', '/treasury/petty-cash/vouchers/new'] },
      { code: 'petty-cash-replenishments', title: 'Replenishments', description: 'Petty cash fund replenishment requests', paths: ['/treasury/petty-cash/replenishments', '/treasury/petty-cash/replenishments/:id', '/treasury/petty-cash/replenishments/new'] },
      { code: 'bank-reconciliation', title: 'Bank Reconciliation', description: 'Reconcile bank statements', path: '/treasury/bank-reconciliation' },
    ],
  },
  {
    code: 'accounts',
    name: 'Accounts (GL)',
    icon: 'BookOpen',
    color: '#7c3aed',
    description: 'General ledger, chart of accounts, and financial periods',
    pages: [
      { code: 'chart-of-accounts', title: 'Chart of Accounts', description: 'GL accounts structure', paths: ['/accounting/journal-vouchers', '/accounting/journal-vouchers/:id', '/accounting/journal-vouchers/create', '/accounting/periods', '/accounts', '/accounts/new'] },
      { code: 'account-summary', title: 'Account Summary', description: 'Per-account balance summary view', path: '/accounts/:accountId/summary' },
      { code: 'account-ledger', title: 'Account Ledger', description: 'Per-account transaction ledger detail', path: '/accounts/:accountId/ledger' },
      { code: 'account-hierarchy', title: 'Account Hierarchy', description: 'GL chart-of-accounts tree/hierarchy view', path: '/accounts/hierarchy' },
      { code: 'ledger-search', title: 'Ledger Search', description: 'Cross-account GL ledger search', path: '/accounts/ledger-search' },
      { code: 'financial-management', title: 'Financial Management', description: 'Financial management overview/landing page', path: '/financial-management' },
      { code: 'account-categories', title: 'Account Categories', description: 'GL account groupings' },
      { code: 'accounting-periods', title: 'Accounting Periods', description: 'Financial year and period management' },
      { code: 'balance-sheet', title: 'Balance Sheet', description: 'View balance sheet reports' },
    ],
  },
  {
    code: 'transactions',
    name: 'Transactions',
    icon: 'ArrowLeftRight',
    color: '#0284c7',
    description: 'Journal entries and transaction ledger',
    pages: [
      { code: 'transactions', title: 'Transaction Ledger', description: 'View all posted journal entries' },
      { code: 'transaction-series', title: 'Transaction Series', description: 'Manage transaction series codes' },
    ],
  },
  {
    code: 'banks',
    name: 'Banking',
    icon: 'Building2',
    color: '#1d4ed8',
    description: 'Bank accounts, payments, and transfers',
    pages: [
      { code: 'banks', title: 'Banks', description: 'Bank master records (institutions)', paths: ['/banks', '/banks/:id', '/banks/:id/edit', '/banks/new'] },
      { code: 'bank-accounts', title: 'Bank Accounts', description: 'Company bank account records', paths: ['/banks/accounts', '/banks/accounts/:id', '/banks/accounts/:id/edit', '/banks/accounts/new'] },
      { code: 'bank-transfers', title: 'Bank Transfers', description: 'Transfer between bank accounts', paths: ['/banks/transfers', '/banks/transfers/new', '/banks/transfers/approvals'] },
      { code: 'bank-payments', title: 'Bank Payments', description: 'Record outward bank payments', paths: ['/banks/payments', '/banks/payments/new'] },
      { code: 'bank-statement-reconciliation', title: 'Statement Reconciliation (Auto-Match)', description: 'Upload bank statements and review matched/unmatched transactions', paths: ['/banks/reconciliations', '/banks/reconciliations/new', '/banks/reconciliations/:id', '/banks/reconciliations/officer-risk-report', '/banks/reconciliations/manual-overrides', '/banks/reconciliations/missing-money-summary', '/banks/reconciliations/payment-trace'] },
    ],
  },
  {
    code: 'hr',
    name: 'Human Resources',
    icon: 'UserCheck',
    color: '#be185d',
    description: 'Staff management, leave, payroll, and attendance',
    pages: [
      { code: 'staff', title: 'Staff Records', description: 'Create and manage staff profiles', paths: ['/hr', '/hr/dashboard', '/hr/self-service', '/hr/staff', '/hr/staff/:id/edit', '/hr/staff/:id/view', '/hr/staff/:staffId/documents', '/hr/staff/create', '/hr/staff/import'] },
      { code: 'hr-config', title: 'HR Config', description: 'HR module configuration', path: '/hr/config' },
      { code: 'salary-components', title: 'Salary Components', description: 'Configure salary component types', paths: ['/hr/salary-components', '/hr/salary-components/:id/edit', '/hr/salary-components/new'] },
      { code: 'staff-pay-info', title: 'Staff Pay Info', description: 'Per-staff pay component assignment and removals', paths: ['/hr/pay-component-removals', '/hr/staff/:staffId/pay-components'] },
      { code: 'bonus-deductions', title: 'Bonus / Deductions', description: 'Ad-hoc bonuses and deductions', paths: ['/hr/bonus-deduction', '/hr/bonus-deduction/:id/edit', '/hr/bonus-deduction/:id/view', '/hr/bonus-deduction/create'] },
      { code: 'staff-ious', title: 'Staff IOUs', description: 'Staff loan/IOU tracking', paths: ['/hr/ious', '/hr/ious/:id/view', '/hr/ious/bulk-debit', '/hr/ious/create'] },
      { code: 'leave-balances', title: 'Leave Balances', description: 'View staff leave balances', path: '/hr/leave-balances' },
      { code: 'leave-types', title: 'Leave Types', description: 'Configure leave type categories', paths: ['/hr/leave-types', '/hr/leave-types/:id/edit', '/hr/leave-types/create'] },
      { code: 'leave-requests', title: 'Leave Requests', description: 'Apply for and approve leave', paths: ['/hr/leave-requests', '/hr/leave-requests/:id/edit', '/hr/leave-requests/:id/view', '/hr/leave-requests/create'] },
      { code: 'leave-calendar', title: 'Leave Calendar', description: 'Calendar view of staff leave', path: '/hr/leave-calendar' },
      { code: 'attendance', title: 'Attendance', description: 'Track staff attendance', paths: ['/hr/attendance', '/hr/attendance/:id/edit', '/hr/attendance/:id/view', '/hr/attendance/create', '/hr/clock'] },
      { code: 'payroll', title: 'Payroll', description: 'Process and approve payroll', paths: ['/hr/payroll', '/hr/payroll-schedules', '/hr/payroll-schedules/:id/edit', '/hr/payroll-schedules/new', '/hr/payroll/:id/edit', '/hr/payroll/:id/view', '/hr/payroll/create', '/hr/pension-remittances'] },
      { code: 'payslips', title: 'Payslips', description: 'View and download payslips', paths: ['/hr/payslips', '/hr/payslips/:id'] },
      { code: 'pension-remittances', title: 'Pension Remittances', description: 'Pension remittance filings' },
      { code: 'employee-documents', title: 'Employee Documents', description: 'Staff document uploads' },
      { code: 'pay-component-removals', title: 'Pay Component Removals', description: 'Removed pay component audit trail' },
      { code: 'statutory-filings', title: 'Statutory Filings', description: 'Regulatory/statutory filings' },
    ],
  },
  {
    code: 'reports',
    name: 'Reports',
    icon: 'BarChart3',
    color: '#9333ea',
    description: 'Report templates, financial reports, and exports',
    pages: [
      { code: 'report-templates', title: 'Report Templates', description: 'Configure report templates', paths: ['/reports', '/reports/:reportId/edit', '/reports/new'] },
      { code: 'report-executions', title: 'Run Reports', description: 'Execute and download reports', path: '/report/:reportCode' },
      { code: 'financial-reports', title: 'Financial Reports', description: 'P&L, balance sheet, cash flow', paths: ['/reports/financial/balance-sheet', '/reports/financial/cash-flow', '/reports/financial/profit-loss', '/reports/financial/trial-balance'] },
      { code: 'report-categories', title: 'Report Categories', description: 'Report category configuration' },
    ],
  },
  {
    code: 'procurement',
    name: 'Procurement',
    icon: 'ShoppingCart',
    color: '#c2410c',
    description: 'Purchase requisitions, orders, and supplier management',
    pages: [
      { code: 'purchase-requisitions', title: 'Requisitions', description: 'Raise purchase requisitions', paths: ['/procurement', '/procurement/requisitions', '/procurement/requisitions/:id/edit', '/procurement/requisitions/:id/view', '/procurement/requisitions/create'] },
      { code: 'purchase-orders', title: 'Purchase Orders', description: 'Approve and manage POs', paths: ['/procurement/orders', '/procurement/orders/:id/edit', '/procurement/orders/:id/view', '/procurement/orders/create'] },
      { code: 'suppliers', title: 'Suppliers', description: 'Supplier master records', paths: ['/procurement/suppliers', '/procurement/suppliers/:id/edit', '/procurement/suppliers/:id/view', '/procurement/suppliers/create'] },
      { code: 'goods-received', title: 'Goods Received', description: 'Goods received notes and quality checks', paths: ['/procurement/grn', '/procurement/grn/:id/quality-check', '/procurement/grn/:id/view', '/procurement/grn/create'] },
      { code: 'purchase-returns', title: 'Purchase Returns', description: 'Return goods to supplier', paths: ['/procurement/returns', '/procurement/returns/:id/edit', '/procurement/returns/:id/view', '/procurement/returns/create'] },
      { code: 'supplier-quotes', title: 'Supplier Quotes', description: 'Request and compare supplier quotes', paths: ['/procurement/quotes', '/procurement/quotes/:id', '/procurement/quotes/:id/edit', '/procurement/quotes/:id/view', '/procurement/quotes/compare/:requisitionId', '/procurement/quotes/new'] },
      { code: 'three-way-matching', title: '3-Way Matching', description: 'PO/GRN/Invoice three-way matching dashboard', path: '/procurement/three-way-matching' },
      { code: 'procurement-config', title: 'Settings', description: 'Procurement module configuration', path: '/procurement/settings' },
    ],
  },
  {
    code: 'branches',
    name: 'Branches',
    icon: 'MapPin',
    color: '#64748b',
    description: 'Branch setup and management',
    pages: [
      { code: 'branches', title: 'Branches', description: 'Create and manage company branches', paths: ['/admin/branches', '/admin/branches/:id/view', '/admin/branches/create'] },
    ],
  },
  {
    code: 'users',
    name: 'Users & Roles',
    icon: 'ShieldCheck',
    color: '#374151',
    description: 'User management, roles, and access control',
    pages: [
      { code: 'roles', title: 'Roles', description: 'Create and manage user roles' },
      { code: 'staff-users', title: 'User Accounts', description: 'Create and manage user accounts', paths: ['/admin/access-control', '/admin/dashboard-assignment', '/admin/dashboard-builder/:templateId?', '/admin/users', '/administration', '/all-access'] },
    ],
  },
  {
    code: 'permissions',
    name: 'Permissions',
    icon: 'Lock',
    color: '#111827',
    description: 'Fine-grained permission policies and user overrides',
    pages: [
      { code: 'role-permission-policies', title: 'Role Policies', description: 'Configure role-level permission policies', paths: ['/admin/permission-setup', '/admin/permissions-matrix'] },
      { code: 'user-permission-overrides', title: 'User Overrides', description: 'Grant individual users elevated permissions', paths: ['/admin/permission-elevation-log', '/admin/permission-exceptions', '/admin/user-overrides'] },
    ],
  },
  {
    code: 'dashboards',
    name: 'Dashboards',
    icon: 'LayoutDashboard',
    color: '#0d9488',
    description: 'User dashboards, widgets, and role-based views',
    pages: [
      { code: 'dashboards', title: 'Dashboards', description: 'User dashboards, widgets, and role-based dashboard views', paths: ['/dashboard', '/dashboard/:dashboardId', '/dashboard/:dashboardId/edit', '/dashboard/create', '/dashboard/debug', '/dashboard/demo', '/dashboard/role-based', '/dashboard/select', '/dashboard/settings', '/dashboard/workflow-centric', '/settings/role-navigation'] },
    ],
  },
  {
    code: 'products',
    name: 'Products',
    icon: 'Box',
    color: '#65a30d',
    description: 'Service and savings product catalog',
    pages: [
      { code: 'products', title: 'Products', description: 'Manage service/savings products', paths: ['/products', '/savings/products', '/savings/products/:id/config'] },
    ],
  },
  {
    code: 'inventory',
    name: 'Inventory',
    icon: 'Package',
    color: '#ea580c',
    description: 'Stock items, movements, transfers, and allocations',
    pages: [
      { code: 'inventory-items', title: 'Inventory Items', description: 'Item catalog CRUD and ledger', paths: ['/inventory', '/inventory/initial-stock-import', '/inventory/items', '/inventory/items/:id/edit', '/inventory/items/:id/ledger', '/inventory/items/:id/view', '/inventory/items/create'] },
      { code: 'stock-movements', title: 'Stock Movements', description: 'Stock movement history and tracker', paths: ['/inventory/movements', '/inventory/tracker'] },
      { code: 'locations', title: 'Locations', description: 'Inventory storage locations', path: '/inventory/locations' },
      { code: 'stock-adjustments', title: 'Stock Adjustments', description: 'Manual stock quantity adjustments', paths: ['/inventory/adjustments', '/inventory/adjustments/:id', '/inventory/adjustments/create'] },
      { code: 'stock-transfers', title: 'Stock Transfers', description: 'Transfer stock between locations', paths: ['/inventory/transfers', '/inventory/transfers/:id', '/inventory/transfers/create'] },
      { code: 'stock-valuation', title: 'Stock Valuation Report', description: 'Inventory valuation reporting', path: '/inventory/reports/valuation' },
      { code: 'material-requests', title: 'Material Requests (history)', description: 'Retired material request workflow, kept read-only for historical records', paths: ['/inventory/material-requests', '/inventory/material-requests/:id'] },
      { code: 'office-use-requests', title: 'Office-Use Requests', description: 'Office-use stock request workflow', paths: ['/inventory/office-use-requests', '/inventory/office-use-requests/:id', '/inventory/office-use-requests/create'] },
      { code: 'sales-orders', title: 'Sales Orders', description: 'Inventory-linked sales orders', paths: ['/inventory/sales-orders', '/inventory/sales-orders/:id', '/inventory/sales-orders/new'] },
      { code: 'allocations', title: 'Allocations', description: 'Stock allocation to clients/staff', paths: ['/inventory/allocations', '/inventory/allocations/:id'] },
      { code: 'allocation-redemptions', title: 'Redemptions', description: 'Redeem allocated stock', path: '/inventory/redemptions' },
      { code: 'write-offs', title: 'Write-offs', description: 'Stock write-off records', paths: ['/inventory/write-offs', '/inventory/write-offs/new'] },
      { code: 'pending-approvals', title: 'Reorder Alerts', description: 'Low-stock reorder alerts / pending approvals', path: '/inventory/reorder-alerts' },
      { code: 'physical-counts', title: 'Physical Counts', description: 'Periodic physical inventory counts', paths: ['/inventory/physical-counts', '/inventory/physical-counts/:id', '/inventory/physical-counts/new'] },
      { code: 'inventory-categories', title: 'Categories', description: 'Inventory item categories' },
    ],
  },
  {
    code: 'receivables',
    name: 'Receivables',
    icon: 'DollarSign',
    color: '#16a34a',
    description: 'Customer receivables, collections, and statements',
    pages: [
      { code: 'customer-receivables', title: 'Customer Receivables', description: 'Receivables dashboard, list, and collections', paths: ['/collections/dashboard', '/receivable', '/receivables/:id/view', '/receivables/aging-report', '/receivables/collections', '/receivables/collections/workbench', '/receivables/dashboard', '/receivables/list'] },
      { code: 'receivable-activity', title: 'Activity Log', description: 'Reminders and automated collection workflows', paths: ['/receivables/reminders', '/receivables/workflows'] },
      { code: 'customer-statements', title: 'Statements', description: 'Customer statements and advanced reporting', paths: ['/receivables/advanced-reporting', '/receivables/bulk-payment-upload', '/receivables/data-consistency', '/receivables/payment-trends', '/receivables/statement-preview-test', '/receivables/statements'] },
      { code: 'payment-plans', title: 'Payment Plans', description: 'Customer payment plan management', path: '/receivables/payment-plans' },
      { code: 'record-payment', title: 'Record Payment', description: 'Record a receivable payment', path: '/receivables/payments/record' },
    ],
  },
  {
    code: 'incomes',
    name: 'Incomes',
    icon: 'TrendingUp',
    color: '#0891b2',
    description: 'Invoices, fee structures, and income tracking',
    pages: [
      { code: 'invoices', title: 'Invoices', description: 'Invoice, credit note, and batch review management', paths: ['/fee/invoices/create', '/incomes/invoices/batch-review', '/invoices/create', '/sales/credit-notes', '/sales/invoices', '/sales/invoices/:id/edit', '/sales/invoices/:id/view', '/sales/invoices/:invoiceId/credit-notes', '/sales/invoices/:invoiceId/credit-notes/:creditNoteId/edit', '/sales/invoices/:invoiceId/credit-notes/:creditNoteId/view', '/sales/invoices/:invoiceId/credit-notes/create', '/sales/invoices/create-inventory'] },
      { code: 'service-items', title: 'Service Items', description: 'Billable service item catalog', path: '/incomes/service-items' },
      { code: 'fee-structures', title: 'Fee Structures', description: 'Fee structure CRUD, approvals, and setup', paths: ['/incomes/fee-structures', '/incomes/fee-structures/:id/edit', '/incomes/fee-structures/:id/view', '/incomes/fee-structures/approvals', '/incomes/fee-structures/create', '/incomes/setup/fee-structure'] },
      { code: 'academic-years', title: 'Financial Periods', description: 'Academic/financial session periods', path: '/incomes/financial-periods' },
      { code: 'income-categories', title: 'Income Categories', description: 'Income category configuration', path: '/incomes/categories' },
      { code: 'fee-entitlements', title: 'Fee Entitlements', description: 'Client fee entitlement/discount records', paths: ['/incomes/entitlements', '/incomes/entitlements/:id/edit', '/incomes/entitlements/:id/view', '/incomes/entitlements/create', '/incomes/entitlements/dashboard'] },
      { code: 'incomes', title: 'Incomes', description: 'Income records list' },
      { code: 'payment-plans', title: 'Payment Plans', description: 'Fee payment plan templates' },
      { code: 'payment-plan-installments', title: 'Installments', description: 'Payment plan installment schedules' },
    ],
  },
  {
    code: 'discounts',
    name: 'Discounts',
    icon: 'Tag',
    color: '#db2777',
    description: 'Discount programs and applications',
    pages: [
      { code: 'discount-programs', title: 'Discount Programs', description: 'Discount program CRUD', paths: ['/discounts/programs', '/discounts/programs/:id', '/discounts/programs/:id/edit', '/discounts/programs/create'] },
      { code: 'discount-applications', title: 'Discount Applications', description: 'Applications of discounts to accounts', paths: ['/discounts/applications', '/discounts/applications/:id', '/discounts/applications/new'] },
      { code: 'applied-discounts', title: 'Applied Discounts', description: 'View/apply discounts, auto-apply rules, analytics', paths: ['/discounts/analytics', '/discounts/applied', '/discounts/apply', '/discounts/auto-apply'] },
    ],
  },
  {
    code: 'tenants',
    name: 'Tenants',
    icon: 'Building',
    color: '#475569',
    description: 'Tenant organization management',
    pages: [
      { code: 'tenants', title: 'Tenants', description: 'Manage tenant organizations', paths: ['/admin/tenants', '/admin/tenants/:id/edit', '/admin/tenants/:id/view', '/admin/tenants/create'] },
    ],
  },
  {
    code: 'common',
    name: 'System',
    icon: 'Settings',
    color: '#52525b',
    description: 'Business day and system-wide administrative operations',
    pages: [
      { code: 'business-day', title: 'Business Day', description: 'Business day open/close and admin operations', paths: ['/admin/close-year', '/admin/review-week', '/admin/transaction-reversal', '/business-day'] },
      { code: 'backdate-requests', title: 'Backdate Requests', description: 'Requests to post transactions on prior dates' },
    ],
  },
  {
    code: 'automations',
    name: 'Automations',
    icon: 'Zap',
    color: '#f59e0b',
    description: 'Workflow templates, runs, approvals, and dynamic forms',
    pages: [
      { code: 'workflow-templates', title: 'Workflow Templates', description: 'Configure automation workflow templates', paths: ['/admin/workflows', '/admin/workflows/:workflowId', '/admin/workflows/new', '/automations/templates', '/automations/templates/:id/edit', '/automations/templates/:id/view', '/automations/templates/create'] },
      { code: 'workflow-runs', title: 'Workflow Runs', description: 'Automation execution runs and logs', paths: ['/automations/run/:templateId', '/automations/runs', '/automations/runs/:id', '/automations/runs/:id/logs'] },
      { code: 'workflow-approvals', title: 'Workflow Approvals', description: 'Approve pending automation/workflow steps', paths: ['/approvals', '/approvals/pending', '/approvals/workflow', '/automations/approvals/:id', '/automations/approvals/history'] },
      { code: 'forms', title: 'Forms', description: 'User-facing dynamic forms and submissions', paths: ['/admin/forms', '/admin/submissions', '/forms', '/forms/:formId', '/forms/submissions'] },
      { code: 'form-submissions', title: 'Form Submissions', description: 'Submitted form response records' },
    ],
  },
  {
    code: 'expenses',
    name: 'Expenses',
    icon: 'Receipt',
    color: '#dc2626',
    description: 'Expense tracking, vouchers, and prepaid amortization',
    pages: [
      { code: 'resource-consumption', title: 'Resource Consumption', description: 'Fuel/resource consumption logging and approvals', paths: ['/expenses/fuel-log/create', '/expenses/resource-consumption', '/expenses/resource-consumption/:id', '/expenses/resource-consumption/:id/approve', '/expenses/resource-consumption/:id/edit', '/expenses/resource-consumption/:id/post', '/expenses/resource-consumption/approval-queue', '/expenses/resource-consumption/create', '/expenses/resource-consumption/fuel-report', '/expenses/resource-consumption/irregularities', '/expenses/resource-consumption/posting-queue'] },
      { code: 'resources', title: 'Resources', description: 'Consumable/fixed resource master records', paths: ['/expenses/resources', '/expenses/resources/:id', '/expenses/resources/:id/edit', '/expenses/resources/create'] },
      { code: 'expenses', title: 'Expenses', description: 'General expense records and payment vouchers', paths: ['/expenses', '/expenses/:id', '/expenses/:id/edit', '/expenses/create', '/expenses/vouchers', '/expenses/vouchers/:id', '/expenses/vouchers/:id/edit', '/expenses/vouchers/create', '/expenses/vouchers/expiring'] },
      { code: 'expense-categories', title: 'Expense Categories', description: 'Expense category configuration', paths: ['/expenses/categories', '/expenses/categories/:id/edit', '/expenses/categories/create'] },
      { code: 'prepaid-vouchers', title: 'Prepaid Vouchers', description: 'Prepaid expense tracking and amortization', paths: ['/expenses/prepaid', '/expenses/prepaid/:id', '/expenses/prepaid/:id/amortize', '/expenses/prepaid/:id/edit', '/expenses/prepaid/create'] },
    ],
  },
  {
    code: 'liabilities',
    name: 'Liabilities',
    icon: 'CreditCard',
    color: '#7c2d12',
    description: 'Accounts payable and vendor liabilities',
    pages: [
      { code: 'accounts-payable', title: 'Accounts Payable', description: 'Payables list, matching, and vendor aging', paths: ['/accounts-payable', '/liabilities/matching', '/liabilities/payables', '/liabilities/payables/:id', '/liabilities/payables/new', '/liabilities/vendors'] },
    ],
  },
  {
    code: 'budgets',
    name: 'Budgets',
    icon: 'PieChart',
    color: '#4d7c0f',
    description: 'Budget periods and variance tracking',
    pages: [
      { code: 'budget-periods', title: 'Budget Periods', description: 'Budget period CRUD and variance reporting', paths: ['/budgets/periods', '/budgets/periods/:id', '/budgets/periods/:id/edit', '/budgets/periods/:id/variance', '/budgets/periods/new'] },
      { code: 'budget-lines', title: 'Budget Lines', description: 'Budget line item allocations' },
    ],
  },
  {
    code: 'assets',
    name: 'Assets',
    icon: 'Layers',
    color: '#7c3aed',
    description: 'Fixed asset register, depreciation, and maintenance',
    pages: [
      { code: 'fixed-assets', title: 'Fixed Assets', description: 'Fixed asset register, purchases/acquisitions, and disposal', paths: ['/assets', '/assets/:id', '/assets/:id/dispose', '/assets/:id/edit', '/assets/acquisitions', '/assets/acquisitions/:id', '/assets/acquisitions/new', '/assets/dispose', '/assets/purchases', '/assets/purchases/:id', '/assets/purchases/new', '/assets/register', '/fixed-asset'] },
      { code: 'asset-categories', title: 'Asset Categories', description: 'Asset category configuration', paths: ['/assets/categories', '/assets/categories/:id/edit', '/assets/categories/create'] },
      { code: 'asset-depreciation', title: 'Depreciation', description: 'Run and view asset depreciation', paths: ['/assets/depreciation', '/assets/depreciation/run'] },
      { code: 'asset-maintenance', title: 'Maintenance', description: 'Asset maintenance records', paths: ['/assets/maintenance', '/assets/maintenance/:id', '/assets/maintenance/new'] },
      { code: 'asset-fuel-monitor', title: 'Fuel Monitor', description: 'Vehicle/asset fuel monitoring dashboard', path: '/assets/fuel-monitor' },
      { code: 'asset-acquisitions', title: 'Acquisitions', description: 'Asset acquisition workflow' },
      { code: 'asset-requisitions', title: 'Requisitions', description: 'Asset requisition workflow' },
    ],
  },
  {
    code: 'pages',
    name: 'Pages',
    icon: 'File',
    color: '#78716c',
    description: 'Dynamic page registry',
    pages: [
      { code: 'pages', title: 'Pages', description: 'Dynamic/new page registry index', path: '/newpages' },
    ],
  },
];

/** Flat map for quick lookup by `module:page` key */
export const PAGE_REGISTRY_MAP: Record<string, { module: PermModule; page: PermPage }> = {};
for (const mod of PERMISSION_REGISTRY) {
  for (const page of mod.pages) {
    PAGE_REGISTRY_MAP[`${mod.code}:${page.code}`] = { module: mod, page };
  }
}

/** Role permission templates — sensible defaults for common roles */
export interface RoleTemplate {
  label: string;
  description: string;
  policies: Record<string, {
    can_view: boolean;
    can_create: boolean;
    can_edit: boolean;
    can_delete: boolean;
    can_approve: boolean;
    can_export: boolean;
    scope: string;
  }>;
}

const full = (scope: string) => ({
  can_view: true, can_create: true, can_edit: true,
  can_delete: true, can_approve: false, can_export: true, scope,
});
const writer = (scope: string) => ({
  can_view: true, can_create: true, can_edit: true,
  can_delete: false, can_approve: false, can_export: false, scope,
});
const viewer = (scope: string) => ({
  can_view: true, can_create: false, can_edit: false,
  can_delete: false, can_approve: false, can_export: false, scope,
});
const none = () => ({
  can_view: false, can_create: false, can_edit: false,
  can_delete: false, can_approve: false, can_export: false, scope: 'own_branch',
});

export const ROLE_TEMPLATES: RoleTemplate[] = [
  {
    label: 'Credit Officer',
    description: 'Can create and manage their assigned clients and loans',
    policies: {
      'clients:clients':               writer('assigned_clients'),
      'clients:client-groups':         writer('assigned_clients'),
      'clients:client-classifications':viewer('assigned_clients'),
      'clients:client-documents':      writer('assigned_clients'),
      'clients:client-notes':          writer('assigned_clients'),
      'loans:loan-accounts':           writer('assigned_clients'),
      'loans:loan-disbursements':      viewer('assigned_clients'),
      'savings:savings-accounts':      writer('assigned_clients'),
      'cash-management:cash-collections': writer('own_branch'),
      'cash-management:cash-transfers':   writer('own_branch'),
      'cash-management:collection-sheets': writer('own_branch'),
      'reports:report-executions':     viewer('own_branch'),
    },
  },
  {
    label: 'Finance Officer',
    description: 'Manages savings, cash collections, and financial records',
    policies: {
      'clients:clients':                     viewer('own_branch'),
      'savings:savings-accounts':            writer('own_branch'),
      'savings:contribution-schedules':      viewer('own_branch'),
      'cash-management:cashier-accounts':    writer('own_branch'),
      'cash-management:cash-collections':    writer('own_branch'),
      'cash-management:cash-transfers':      writer('own_branch'),
      'cash-management:cash-reconciliation': writer('own_branch'),
      'cash-management:collection-sheets':   writer('own_branch'),
      'cash-management:petty-cash-vouchers': writer('own_branch'),
      'transactions:transactions':           viewer('own_branch'),
      'reports:report-executions':           writer('own_branch'),
      'reports:financial-reports':           viewer('own_branch'),
    },
  },
  {
    label: 'Accountant',
    description: 'Read access to all financial modules; no client creation',
    policies: {
      'clients:clients':             viewer('own_branch'),
      'loans:loan-accounts':         viewer('own_branch'),
      'savings:savings-accounts':    viewer('own_branch'),
      'cash-management:cashier-accounts':    viewer('own_branch'),
      'cash-management:cash-collections':    viewer('own_branch'),
      'cash-management:cash-reconciliation': writer('own_branch'),
      'cash-management:bank-reconciliation': writer('own_branch'),
      'accounts:chart-of-accounts':  viewer('own_branch'),
      'accounts:accounting-periods': viewer('own_branch'),
      'accounts:balance-sheet':      viewer('own_branch'),
      'transactions:transactions':   viewer('own_branch'),
      'banks:bank-accounts':         viewer('own_branch'),
      'banks:bank-payments':         writer('own_branch'),
      'reports:report-executions':   writer('own_branch'),
      'reports:financial-reports':   viewer('own_branch'),
    },
  },
  {
    label: 'HR Officer',
    description: 'Manages staff records, leave, and attendance',
    policies: {
      'hr:staff':            writer('own_branch'),
      'hr:leave-requests':   writer('own_branch'),
      'hr:leave-types':      viewer('own_branch'),
      'hr:attendance':       writer('own_branch'),
      'hr:payslips':         viewer('own_branch'),
      'hr:bonus-deductions': writer('own_branch'),
      'reports:report-executions': viewer('own_branch'),
    },
  },
  {
    label: 'Branch Manager',
    description: 'Full access within their branch — all modules, approve up to their limit',
    policies: Object.fromEntries(
      PERMISSION_REGISTRY.flatMap(mod =>
        mod.pages.map(page => [
          `${mod.code}:${page.code}`,
          { ...full('own_branch'), can_approve: true },
        ])
      )
    ),
  },
  {
    label: 'Supervisor',
    description: 'Manages all daily operations within the branch — cannot give final financial approvals',
    policies: Object.fromEntries(
      PERMISSION_REGISTRY.flatMap(mod =>
        mod.pages.map(page => {
          // Supervisors cannot approve financial/sensitive actions
          const noApproveModules = ['loans', 'savings', 'banks', 'hr', 'procurement', 'cash-management'];
          const canApprove = !noApproveModules.includes(mod.code);
          return [
            `${mod.code}:${page.code}`,
            { ...full('own_branch'), can_approve: canApprove },
          ];
        })
      )
    ),
  },
  {
    label: 'Administrator',
    description: 'Full access across all modules (no global scope)',
    policies: Object.fromEntries(
      PERMISSION_REGISTRY.flatMap(mod =>
        mod.pages.map(page => [
          `${mod.code}:${page.code}`,
          { ...full('own_branch'), can_approve: true },
        ])
      )
    ),
  },
];
