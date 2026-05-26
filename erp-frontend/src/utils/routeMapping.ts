// Route mapping utility - Maps all existing App.tsx routes to functional categories
// Based on Phoenix Software Access Table requirements

import { UserRole } from '../types/roles';
import { FunctionalCategory, PageId } from '../types/permissions';

// Extended route interface for comprehensive mapping
export interface RouteMapping {
  path: string;
  pageId: PageId;
  title: string;
  category: FunctionalCategory;
  roles: UserRole[];
  component: string;
  description?: string;
  icon?: string;
  isNew?: boolean;
  isEnhanced?: boolean;
}

// Complete route mappings for all existing App.tsx routes
export const ROUTE_MAPPINGS: RouteMapping[] = [
  // User Management Routes'
  // User Management Routes
  {
    path: '/settings',
    pageId: 'users.settings',
    title: 'User Management',
    category: 'User Management',
    roles: ['Director', 'Principal', 'Administrator'],
    component: 'UserManagementPage',
    icon: 'Users',
    description: 'Manage system users and their access',
  },
  {
    path: '/admin/users',
    pageId: 'users.add',
    title: 'User Management',
    category: 'User Management',
    roles: ['Director', 'Principal', 'Administrator'],
    component: 'UserManagementPage',
    icon: 'Users',
    description: 'Manage system users and their access',
  },
  {
    path: '/admin/roles-matrix',
    pageId: 'users.edit_roles_permissions',
    title: 'Roles & Permissions Matrix',
    category: 'User Management',
    roles: ['Director', 'Principal'],
    component: 'RolesPermissionsMatrixPage',
    icon: 'Shield',
    description: 'Configure role-based permissions',
  },
  {
    path: '/admin/branches',
    pageId: 'users.branch_tenant_management',
    title: 'Branch Management',
    category: 'User Management',
    roles: ['Director', 'Principal', 'Administrator'],
    component: 'BranchListPage',
    icon: 'Building',
    description: 'Manage organizational branches',
  },
  {
    path: '/admin/tenants',
    pageId: 'users.branch_tenant_management',
    title: 'Tenant Management',
    category: 'User Management',
    roles: ['Director', 'Principal', 'Administrator'],
    component: 'TenantListPage',
    icon: 'Building2',
    description: 'Manage system tenants',
  },
  {
    path: '/admin/access-control',
    pageId: 'users.edit_roles_permissions',
    title: 'Access Control',
    category: 'User Management',
    roles: ['Director', 'Principal', 'Administrator'],
    component: 'AccessControlPage',
    icon: 'Lock',
    description: 'Configure system access controls',
  },

  // Financial Operations Routes
  {
    path: '/sales/invoices',
    pageId: 'financial.invoice_generation',
    title: 'Invoice Management',
    category: 'Financial Operations',
    roles: ['Director', 'Principal', 'Administrator', 'Officer'],
    component: 'InvoicesList',
    icon: 'FileText',
    description: 'Create and manage invoices',
  },
  {
    path: '/sales/invoices/create',
    pageId: 'financial.invoice_generation',
    title: 'Create Invoice',
    category: 'Financial Operations',
    roles: ['Director', 'Principal', 'Administrator', 'Officer'],
    component: 'CreateInvoice',
    icon: 'FilePlus',
    description: 'Create new invoices',
  },
  {
    path: '/sales/invoices/bulk',
    pageId: 'financial.invoice_generation',
    title: 'Bulk Invoice Creation',
    category: 'Financial Operations',
    roles: ['Director', 'Principal', 'Administrator', 'Officer'],
    component: 'BulkInvoiceWizardDemo',
    icon: 'FileStack',
    description: 'Create multiple invoices at once',
  },
  {
    path: '/accounts',
    pageId: 'financial.accounts_management',
    title: 'Chart of Accounts',
    category: 'Financial Operations',
    roles: ['Director', 'Principal', 'Administrator'],
    component: 'AccountsListPage',
    icon: 'BookOpen',
    description: 'Manage chart of accounts',
  },
  {
    path: '/accounts/new',
    pageId: 'financial.accounts_management',
    title: 'Create Account',
    category: 'Financial Operations',
    roles: ['Director', 'Principal', 'Administrator'],
    component: 'UnifiedAccountCreationPage',
    icon: 'Plus',
    description: 'Create new accounts',
  },
  {
    path: '/receivables/dashboard',
    pageId: 'financial.receivables_dashboard',
    title: 'Receivables Dashboard',
    category: 'Financial Operations',
    roles: ['Director', 'Principal', 'Administrator', 'Officer'],
    component: 'ReceivablesDashboard',
    icon: 'TrendingUp',
    description: 'Monitor accounts receivable',
  },
  {
    path: '/receivables/list',
    pageId: 'financial.receivables_dashboard',
    title: 'Receivables List',
    category: 'Financial Operations',
    roles: ['Director', 'Principal', 'Administrator', 'Officer'],
    component: 'ReceivablesList',
    icon: 'List',
    description: 'View all receivables',
  },
  {
    path: '/receivables/payments/record',
    pageId: 'financial.payment_requests',
    title: 'Record Payment',
    category: 'Financial Operations',
    roles: ['Director', 'Principal', 'Administrator', 'Officer'],
    component: 'RecordPayment',
    icon: 'CreditCard',
    description: 'Record customer payments',
  },
  {
    path: '/receivables/aging-report',
    pageId: 'reports.aging_reports',
    title: 'Aging Report',
    category: 'Financial Operations',
    roles: ['Director', 'Principal', 'Administrator', 'Officer'],
    component: 'AgingReport',
    icon: 'Clock',
    description: 'View receivables aging analysis',
  },
  {
    path: '/sales/invoices/:invoiceId/credit-notes',
    pageId: 'financial.credit_notes',
    title: 'Credit Notes',
    category: 'Financial Operations',
    roles: ['Director', 'Principal', 'Administrator', 'Officer'],
    component: 'CreditNotesList',
    icon: 'FileX',
    description: 'Manage credit notes',
  },
  {
    path: '/treasury/dashboard',
    pageId: 'financial.daily_posting',
    title: 'Treasury Dashboard',
    category: 'Financial Operations',
    roles: ['Director', 'Principal', 'Administrator', 'Officer'],
    component: 'TreasuryDashboard',
    icon: 'Wallet',
    description: 'Treasury management dashboard',
  },
  {
    path: '/treasury/bank-reconciliation',
    pageId: 'financial.daily_posting',
    title: 'Bank Reconciliation',
    category: 'Financial Operations',
    roles: ['Director', 'Principal', 'Administrator', 'Officer'],
    component: 'BankReconciliationPage',
    icon: 'CreditCard',
    description: 'Reconcile bank statements',
  },
  {
    path: '/treasury/petty-cash',
    pageId: 'financial.daily_posting',
    title: 'Petty Cash',
    category: 'Financial Operations',
    roles: ['Director', 'Principal', 'Administrator', 'Officer'],
    component: 'PettyCashDashboard',
    icon: 'Wallet',
    description: 'Manage petty cash funds and vouchers',
  },
  {
    path: '/treasury/petty-cash/vouchers',
    pageId: 'financial.daily_posting',
    title: 'Petty Cash Vouchers',
    category: 'Financial Operations',
    roles: ['Director', 'Principal', 'Administrator', 'Officer'],
    component: 'PettyCashVoucherList',
    icon: 'Receipt',
    description: 'Manage petty cash vouchers',
  },
  {
    path: '/expenses',
    pageId: 'financial.payment_requests',
    title: 'Expenses',
    category: 'Financial Operations',
    roles: ['Director', 'Principal', 'Administrator', 'Officer'],
    component: 'ExpenseListPage',
    icon: 'DollarSign',
    description: 'Manage general expenses',
  },
  {
    path: '/expenses/prepaid',
    pageId: 'financial.payment_requests',
    title: 'Prepaid Expenses',
    category: 'Financial Operations',
    roles: ['Director', 'Principal', 'Administrator', 'Officer'],
    component: 'PrepaidExpenseListPage',
    icon: 'CalendarDays',
    description: 'Manage prepaid expense amortization',
  },
  {
    path: '/liabilities/payables',
    pageId: 'financial.payment_requests',
    title: 'Accounts Payable',
    category: 'Financial Operations',
    roles: ['Director', 'Principal', 'Administrator', 'Officer'],
    component: 'PayablesListPage',
    icon: 'Receipt',
    description: 'Manage accounts payable',
  },
  {
    path: '/banks',
    pageId: 'financial.accounts_management',
    title: 'Banks',
    category: 'Financial Operations',
    roles: ['Director', 'Principal', 'Administrator', 'Officer'],
    component: 'BankListPage',
    icon: 'Building2',
    description: 'Manage banks',
  },
  {
    path: '/banks/accounts',
    pageId: 'financial.accounts_management',
    title: 'Bank Accounts',
    category: 'Financial Operations',
    roles: ['Director', 'Principal', 'Administrator', 'Officer'],
    component: 'BankAccountListPage',
    icon: 'CreditCard',
    description: 'Manage bank accounts and GL links',
  },
  {
    path: '/banks/accounts/new',
    pageId: 'financial.accounts_management',
    title: 'New Bank Account',
    category: 'Financial Operations',
    roles: ['Director', 'Principal', 'Administrator'],
    component: 'BankAccountFormPage',
    icon: 'CreditCard',
    description: 'Create a new bank account',
  },
  {
    path: '/banks/accounts/:id',
    pageId: 'financial.accounts_management',
    title: 'Bank Account Detail',
    category: 'Financial Operations',
    roles: ['Director', 'Principal', 'Administrator', 'Officer'],
    component: 'BankAccountDetailPage',
    icon: 'CreditCard',
    description: 'View bank account detail and ledger',
  },
  {
    path: '/banks/transfers',
    pageId: 'financial.accounts_management',
    title: 'Inter-bank Transfers',
    category: 'Financial Operations',
    roles: ['Director', 'Principal', 'Administrator', 'Officer'],
    component: 'BankTransferListPage',
    icon: 'ArrowLeftRight',
    description: 'Manage bank-to-bank transfers',
  },
  {
    path: '/banks/transfers/new',
    pageId: 'financial.accounts_management',
    title: 'New Inter-bank Transfer',
    category: 'Financial Operations',
    roles: ['Director', 'Principal', 'Administrator', 'Officer'],
    component: 'BankTransferFormPage',
    icon: 'ArrowLeftRight',
    description: 'Create a new inter-bank transfer',
  },
  {
    path: '/banks/payments',
    pageId: 'financial.accounts_management',
    title: 'Bank Payments',
    category: 'Financial Operations',
    roles: ['Director', 'Principal', 'Administrator', 'Officer'],
    component: 'BankPaymentListPage',
    icon: 'Receipt',
    description: 'Track supplier and expense bank payments',
  },
  {
    path: '/banks/payments/new',
    pageId: 'financial.accounts_management',
    title: 'New Bank Payment',
    category: 'Financial Operations',
    roles: ['Director', 'Principal', 'Administrator', 'Officer'],
    component: 'BankPaymentFormPage',
    icon: 'Receipt',
    description: 'Create a bank payment for suppliers or expenses',
  },

  // Student Management Routes
  {
    path: '/clients',
    pageId: 'students.client_management',
    title: 'Client Management',
    category: 'Client Management',
    roles: ['Director', 'Principal', 'Administrator', 'Registrar'],
    component: 'ClientListPage',
    icon: 'Users',
    description: 'Manage student/client records',
  },
  {
    path: '/clients/create',
    pageId: 'students.registration',
    title: 'Client Registration',
    category: 'Client Management',
    roles: ['Director', 'Principal', 'Administrator', 'Registrar'],
    component: 'ClientFormPage',
    icon: 'UserPlus',
    description: 'Register new clients/students',
  },
  {
    path: '/clients/classifications',
    pageId: 'students.client_management',
    title: 'Client Classifications',
    category: 'Client Management',
    roles: ['Director', 'Principal', 'Administrator', 'Registrar'],
    component: 'ClientClassificationsPage',
    icon: 'Tags',
    description: 'Manage client classifications',
  },
  {
    path: '/incomes/entitlements',
    pageId: 'students.entitlements',
    title: 'Student Entitlements',
    category: 'Client Management',
    roles: ['Director', 'Principal', 'Registrar', 'Officer'],
    component: 'EntitlementsList',
    icon: 'Award',
    description: 'Manage student entitlements',
  },
  {
    path: '/incomes/entitlements/dashboard',
    pageId: 'students.entitlements',
    title: 'Entitlements Dashboard',
    category: 'Client Management',
    roles: ['Director', 'Principal', 'Registrar', 'Officer'],
    component: 'EntitlementDashboard',
    icon: 'BarChart3',
    description: 'Entitlements overview dashboard',
  },
  {
    path: '/incomes/fee-structures',
    pageId: 'students.fee_structures',
    title: 'Fee Structures',
    category: 'Client Management',
    roles: ['Director', 'Principal', 'Registrar'],
    component: 'IncomeFeeStructureListPage',
    icon: 'DollarSign',
    description: 'Manage fee structures',
  },
  {
    path: '/receivables/statements',
    pageId: 'students.statements',
    title: 'Student Statements',
    category: 'Client Management',
    roles: ['Director', 'Principal', 'Registrar', 'Officer'],
    component: 'CustomerStatements',
    icon: 'Receipt',
    description: 'Generate student statements',
  },
  {
    path: '/discounts/programs',
    pageId: 'students.entitlements',
    title: 'Discount Programs',
    category: 'Client Management',
    roles: ['Director', 'Principal', 'Registrar'],
    component: 'DiscountProgramsList',
    icon: 'Percent',
    description: 'Manage discount/scholarship programs',
  },

  // Reports & Analytics Routes
  {
    path: '/reports/financial/trial-balance',
    pageId: 'reports.trial_balance',
    title: 'Trial Balance',
    category: 'Reports & Analytics',
    roles: ['Director', 'Principal', 'Administrator'],
    component: 'TrialBalancePage',
    icon: 'Calculator',
    description: 'Generate trial balance reports',
  },
  {
    path: '/reports/financial/profit-loss',
    pageId: 'reports.profit_loss',
    title: 'Statement of Profit or Loss',
    category: 'Reports & Analytics',
    roles: ['Director', 'Principal', 'Administrator'],
    component: 'ProfitLossPage',
    icon: 'BarChart3',
    description: 'FIRS-compliant Statement of Profit or Loss and Other Comprehensive Income',
  },
  {
    path: '/reports/financial/balance-sheet',
    pageId: 'reports.balance_sheet',
    title: 'Statement of Financial Position',
    category: 'Reports & Analytics',
    roles: ['Director', 'Principal', 'Administrator'],
    component: 'BalanceSheetPage',
    icon: 'Scale',
    description: 'FIRS/IAS 1-compliant Statement of Financial Position (formerly Balance Sheet)',
  },
  {
    path: '/reports',
    pageId: 'reports.activity_reports',
    title: 'Reports Center',
    category: 'Reports & Analytics',
    roles: ['Director', 'Principal', 'Administrator'],
    component: 'ReportsListPage',
    icon: 'FileBarChart',
    description: 'Access all system reports',
  },
  {
    path: '/receivables/advanced-reporting',
    pageId: 'reports.aging_reports',
    title: 'Advanced Reporting',
    category: 'Reports & Analytics',
    roles: ['Director', 'Principal', 'Administrator', 'Officer'],
    component: 'AdvancedReporting',
    icon: 'TrendingUp',
    description: 'Advanced receivables reporting',
  },
  {
    path: '/receivables/payment-trends',
    pageId: 'reports.financial_dashboard',
    title: 'Payment Trends',
    category: 'Reports & Analytics',
    roles: ['Director', 'Principal', 'Administrator', 'Officer'],
    component: 'PaymentTrends',
    icon: 'LineChart',
    description: 'Analyze payment trends',
  },
  {
    path: '/hr/payroll',
    pageId: 'reports.payroll_reports',
    title: 'Payroll Reports',
    category: 'Reports & Analytics',
    roles: ['Director', 'Principal', 'Administrator'],
    component: 'PayrollListPage',
    icon: 'Wallet',
    description: 'Generate payroll reports',
  },
  {
    path: '/inventory/reports/valuation',
    pageId: 'reports.inventory_reports',
    title: 'Inventory Reports',
    category: 'Reports & Analytics',
    roles: ['Director', 'Principal', 'Administrator', 'Officer'],
    component: 'StockValuationReportPage',
    icon: 'Package',
    description: 'Generate inventory reports',
  },

  // Operations Routes
  {
    path: '/procurement',
    pageId: 'operations.procurement_dashboard',
    title: 'Procurement Dashboard',
    category: 'Operations',
    roles: ['Director', 'Principal', 'Officer'],
    component: 'ProcurementIndexPage',
    icon: 'ShoppingCart',
    description: 'Procurement management dashboard',
  },
  {
    path: '/procurement/orders',
    pageId: 'operations.purchase_orders',
    title: 'Purchase Orders',
    category: 'Operations',
    roles: ['Director', 'Principal', 'Officer'],
    component: 'PurchaseOrderListPage',
    icon: 'ShoppingBag',
    description: 'Manage purchase orders',
  },
  {
    path: '/procurement/requisitions',
    pageId: 'operations.purchase_orders',
    title: 'Purchase Requisitions',
    category: 'Operations',
    roles: ['Director', 'Principal', 'Officer'],
    component: 'RequisitionListPage',
    icon: 'FileText',
    description: 'Manage purchase requisitions',
  },
  {
    path: '/procurement/suppliers',
    pageId: 'operations.supplier_management',
    title: 'Supplier Management',
    category: 'Operations',
    roles: ['Director', 'Principal', 'Officer'],
    component: 'SupplierListPage',
    icon: 'Truck',
    description: 'Manage suppliers',
  },
  {
    path: '/procurement/grn',
    pageId: 'operations.goods_receipt',
    title: 'Goods Receipt Notes',
    category: 'Operations',
    roles: ['Director', 'Principal', 'Officer'],
    component: 'GRNListPage',
    icon: 'PackageCheck',
    description: 'Manage goods receipt notes',
  },
  {
    path: '/procurement/quotes',
    pageId: 'operations.supplier_management',
    title: 'Supplier Quotes',
    category: 'Operations',
    roles: ['Director', 'Principal', 'Officer'],
    component: 'QuoteListPage',
    icon: 'FileSearch',
    description: 'Manage supplier quotes',
  },
  {
    path: '/inventory',
    pageId: 'operations.inventory_management',
    title: 'Inventory Management',
    category: 'Operations',
    roles: ['Director', 'Principal', 'Officer'],
    component: 'InventoryIndexPage',
    icon: 'Warehouse',
    description: 'Inventory management dashboard',
  },
  {
    path: '/inventory/items',
    pageId: 'operations.inventory_management',
    title: 'Inventory Items',
    category: 'Operations',
    roles: ['Director', 'Principal', 'Officer'],
    component: 'InventoryItemsPage',
    icon: 'Package',
    description: 'Manage inventory items',
  },
  {
    path: '/inventory/movements',
    pageId: 'operations.stock_movements',
    title: 'Stock Movements',
    category: 'Operations',
    roles: ['Director', 'Principal', 'Officer'],
    component: 'StockMovementsPage',
    icon: 'ArrowRightLeft',
    description: 'Track stock movements',
  },
  {
    path: '/inventory/locations',
    pageId: 'operations.inventory_management',
    title: 'Stock Locations',
    category: 'Operations',
    roles: ['Director', 'Principal', 'Officer'],
    component: 'StockLocationsPage',
    icon: 'MapPin',
    description: 'Manage stock locations',
  },
  {
    path: '/inventory/adjustments',
    pageId: 'operations.stock_movements',
    title: 'Stock Adjustments',
    category: 'Operations',
    roles: ['Director', 'Principal', 'Officer'],
    component: 'StockAdjustmentsListPage',
    icon: 'Settings',
    description: 'Manage stock adjustments',
  },
  {
    path: '/hr',
    pageId: 'operations.inventory_management',
    title: 'Human Resources',
    category: 'Operations',
    roles: ['Director', 'Principal', 'Administrator'],
    component: 'HRIndexPage',
    icon: 'Users',
    description: 'HR management dashboard',
  },
  {
    path: '/hr/staff',
    pageId: 'operations.inventory_management',
    title: 'Staff Management',
    category: 'Operations',
    roles: ['Director', 'Principal', 'Administrator'],
    component: 'StaffListPage',
    icon: 'UserCheck',
    description: 'Manage staff records',
  },
  {
    path: '/hr/attendance',
    pageId: 'operations.inventory_management',
    title: 'Attendance Management',
    category: 'Operations',
    roles: ['Director', 'Principal', 'Administrator'],
    component: 'AttendanceListPage',
    icon: 'Clock',
    description: 'Manage staff attendance',
  },
  {
    path: '/hr/leave-requests',
    pageId: 'operations.inventory_management',
    title: 'Leave Management',
    category: 'Operations',
    roles: ['Director', 'Principal', 'Administrator'],
    component: 'LeaveRequestsListPage',
    icon: 'Calendar',
    description: 'Manage leave requests',
  },
  {
    path: '/expenses/resource-consumption',
    pageId: 'operations.inventory_management',
    title: 'Resource Consumption',
    category: 'Operations',
    roles: ['Director', 'Principal', 'Officer'],
    component: 'ResourceConsumptionListPage',
    icon: 'Zap',
    description: 'Manage resource consumption',
  },
  {
    path: '/expenses/fuel-log/create',
    pageId: 'operations.inventory_management',
    title: 'Log Fuel Receipt',
    category: 'Operations',
    roles: ['Director', 'Principal', 'Officer'],
    component: 'FuelLogFormPage',
    icon: 'Droplets',
    description: 'Simple form to record fuel received by a vehicle or staff member',
  },
  {
    path: '/expenses/resources',
    pageId: 'operations.inventory_management',
    title: 'Resource Management',
    category: 'Operations',
    roles: ['Director', 'Principal', 'Officer'],
    component: 'ResourceListPage',
    icon: 'Layers',
    description: 'Manage resources',
  },
  {
    path: '/expenses/vouchers',
    pageId: 'operations.inventory_management',
    title: 'Voucher Management',
    category: 'Operations',
    roles: ['Director', 'Principal', 'Officer'],
    component: 'VoucherListPage',
    icon: 'Ticket',
    description: 'Manage vouchers',
  },
  {
    path: '/assets',
    pageId: 'operations.inventory_management',
    title: 'Asset Management',
    category: 'Operations',
    roles: ['Director', 'Principal', 'Administrator'],
    component: 'AssetListPage',
    icon: 'HardDrive',
    description: 'Manage fixed assets',
  },

  // System Administration Routes
  {
    path: '/admin/workflows',
    pageId: 'admin.workflow_management',
    title: 'Workflow Management',
    category: 'System Administration',
    roles: ['Director', 'Principal', 'Administrator'],
    component: 'AdminWorkflowsPage',
    icon: 'GitBranch',
    description: 'Configure system workflows',
  },
  {
    path: '/automations/templates',
    pageId: 'admin.workflow_management',
    title: 'Automation Templates',
    category: 'System Administration',
    roles: ['Director', 'Principal', 'Administrator'],
    component: 'AutomationTemplatesPage',
    icon: 'Zap',
    description: 'Manage automation templates',
  },
  {
    path: '/automations/runs',
    pageId: 'admin.workflow_management',
    title: 'Automation Runs',
    category: 'System Administration',
    roles: ['Director', 'Principal', 'Administrator'],
    component: 'AutomationRunsPage',
    icon: 'Play',
    description: 'Monitor automation runs',
  },
  {
    path: '/admin/forms',
    pageId: 'admin.system_settings',
    title: 'Form Management',
    category: 'System Administration',
    roles: ['Director', 'Principal', 'Administrator'],
    component: 'AdminFormsPage',
    icon: 'FileText',
    description: 'Manage system forms',
  },
  {
    path: '/admin/submissions',
    pageId: 'admin.audit_logs',
    title: 'Form Submissions',
    category: 'System Administration',
    roles: ['Director', 'Principal', 'Administrator'],
    component: 'AdminSubmissionsPage',
    icon: 'Send',
    description: 'View form submissions',
  },
  {
    path: '/dashboard/create',
    pageId: 'admin.dashboard_builder',
    title: 'Dashboard Builder',
    category: 'System Administration',
    roles: ['Director', 'Principal', 'Administrator'],
    component: 'DashboardCreatePage',
    icon: 'Layout',
    description: 'Build custom dashboards',
  },
  {
    path: '/approvals',
    pageId: 'admin.audit_logs',
    title: 'Approval Management',
    category: 'System Administration',
    // All four roles can VIEW the approvals page; only APPROVER_ROLES can act (see types/roles.ts)
    roles: ['Director', 'Principal', 'Administrator', 'Registrar'],
    component: 'ApprovalsPage',
    icon: 'CheckCircle',
    description: 'View and manage system approvals',
  },
];

// Helper functions for route mapping
export const getRoutesByCategory = (category: FunctionalCategory): RouteMapping[] => {
  return ROUTE_MAPPINGS.filter(route => route.category === category);
};

export const getRoutesByRole = (role: UserRole): RouteMapping[] => {
  return ROUTE_MAPPINGS.filter(route => route.roles.includes(role));
};

export const getRouteMapping = (path: string): RouteMapping | undefined => {
  return ROUTE_MAPPINGS.find(route => route.path === path);
};

export const getRouteMappingByPageId = (pageId: PageId): RouteMapping[] => {
  return ROUTE_MAPPINGS.filter(route => route.pageId === pageId);
};

// Get all unique categories
export const getAllCategories = (): FunctionalCategory[] => {
  const categories = new Set(ROUTE_MAPPINGS.map(route => route.category));
  return Array.from(categories);
};

// Get navigation structure organized by categories
export const getNavigationStructure = (userRole: UserRole | null) => {
  if (!userRole) return {};

  const userRoutes = getRoutesByRole(userRole);
  const structure: Record<FunctionalCategory, RouteMapping[]> = {} as Record<
    FunctionalCategory,
    RouteMapping[]
  >;

  userRoutes.forEach(route => {
    if (!structure[route.category]) {
      structure[route.category] = [];
    }
    structure[route.category].push(route);
  });

  return structure;
};

// Check if user can access a specific route
export const canUserAccessRoute = (path: string, userRole: UserRole | null): boolean => {
  console.log('🔍 canUserAccessRoute Debug:', {
    path,
    userRole,
    timestamp: new Date().toISOString(),
  });

  if (!userRole) {
    console.log('❌ canUserAccessRoute: No user role provided');
    return false;
  }

  // Director and Principal roles have access to all pages - bypass route restrictions
  if (userRole === 'Director' || userRole === 'Principal') {
    console.log('✅ canUserAccessRoute: Superuser role - allowing access to all pages', {
      path,
      userRole,
    });
    return true;
  }

  const route = getRouteMapping(path);
  if (!route) {
    console.log('✅ canUserAccessRoute: Route not in mapping, allowing access', { path });
    return true; // Allow access to unmapped routes
  }

  const hasAccess = route.roles.includes(userRole);
  console.log('🔍 canUserAccessRoute Result:', {
    path,
    userRole,
    requiredRoles: route.roles,
    hasAccess,
    routeTitle: route.title,
  });

  return hasAccess;
};

// Get breadcrumb navigation for a route
export const getBreadcrumbs = (path: string): Array<{ label: string; path?: string }> => {
  const route = getRouteMapping(path);
  if (!route) return [{ label: 'Home', path: '/' }];

  return [{ label: 'Home', path: '/' }, { label: route.category }, { label: route.title }];
};
