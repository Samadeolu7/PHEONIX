// Phoenix Software Access Table - TypeScript interfaces and constants
// Based on the Phoenix Software Access Table requirements

import { UserRole } from './roles';

// Page identifiers based on functional categories
export type PageId =
  // User Management
  | 'users.add'
  | 'users.edit_roles_permissions'
  | 'users.branch_tenant_management'
  | 'users.settings'

  // Financial Operations
  | 'financial.invoice_generation'
  | 'financial.invoice_approval'
  | 'financial.payment_requests'
  | 'financial.payment_approval'
  | 'financial.daily_posting'
  | 'financial.accounts_management'
  | 'financial.receivables_dashboard'
  | 'financial.credit_notes'

  // Student Management
  | 'students.registration'
  | 'students.client_management'
  | 'students.entitlements'
  | 'students.fee_structures'
  | 'students.statements'

  // Reports & Analytics
  | 'reports.profit_loss'
  | 'reports.balance_sheet'
  | 'reports.trial_balance'
  | 'reports.aging_reports'
  | 'reports.payroll_reports'
  | 'reports.inventory_reports'
  | 'reports.activity_reports'
  | 'reports.financial_dashboard'

  // Operations
  | 'operations.procurement_dashboard'
  | 'operations.purchase_orders'
  | 'operations.inventory_management'
  | 'operations.supplier_management'
  | 'operations.stock_movements'
  | 'operations.goods_receipt'

  // System Administration
  | 'admin.system_settings'
  | 'admin.audit_logs'
  | 'admin.workflow_management'
  | 'admin.dashboard_builder'
  | 'admin.roles_permissions_matrix';

// Functional categories for page organization
export type FunctionalCategory =
  | 'User Management'
  | 'Financial Operations'
  | 'Client Management'
  | 'Reports & Analytics'
  | 'Operations'
  | 'System Administration';

// Page definition interface
export interface PageDefinition {
  id: PageId;
  title: string;
  path: string;
  category: FunctionalCategory;
  description?: string;
  icon?: string;
}

// Permission interface
export interface Permission {
  pageId: PageId;
  roles: UserRole[];
}

// Phoenix Software Access Table - Complete permissions matrix
export const PHOENIX_ACCESS_TABLE: Permission[] = [
  // User Management - Directors and Administrators only
  { pageId: 'users.add', roles: ['Director', 'Administrator'] },
  { pageId: 'users.edit_roles_permissions', roles: ['Director'] },
  { pageId: 'users.branch_tenant_management', roles: ['Director', 'Administrator'] },

  // Financial Operations - Directors, Principals, and Officers
  { pageId: 'financial.invoice_generation', roles: ['Director', 'Principal', 'Officer'] },
  { pageId: 'financial.invoice_approval', roles: ['Director', 'Principal'] },
  { pageId: 'financial.payment_requests', roles: ['Director', 'Principal', 'Officer'] },
  { pageId: 'financial.payment_approval', roles: ['Director', 'Principal'] },
  { pageId: 'financial.daily_posting', roles: ['Director', 'Principal', 'Officer'] },
  { pageId: 'financial.accounts_management', roles: ['Director', 'Principal', 'Administrator'] },
  { pageId: 'financial.receivables_dashboard', roles: ['Director', 'Principal', 'Officer'] },
  { pageId: 'financial.credit_notes', roles: ['Director', 'Principal', 'Officer'] },

  // Student Management - All roles except Officer for some functions
  {
    pageId: 'students.registration',
    roles: ['Director', 'Principal', 'Administrator', 'Registrar'],
  },
  {
    pageId: 'students.client_management',
    roles: ['Director', 'Principal', 'Administrator', 'Registrar'],
  },
  { pageId: 'students.entitlements', roles: ['Director', 'Principal', 'Registrar', 'Officer'] },
  { pageId: 'students.fee_structures', roles: ['Director', 'Principal', 'Registrar'] },
  { pageId: 'students.statements', roles: ['Director', 'Principal', 'Registrar', 'Officer'] },

  // Reports & Analytics - Most roles have access to reports
  { pageId: 'reports.profit_loss', roles: ['Director', 'Principal', 'Administrator'] },
  { pageId: 'reports.balance_sheet', roles: ['Director', 'Principal', 'Administrator'] },
  { pageId: 'reports.trial_balance', roles: ['Director', 'Principal', 'Administrator'] },
  { pageId: 'reports.aging_reports', roles: ['Director', 'Principal', 'Administrator', 'Officer'] },
  { pageId: 'reports.payroll_reports', roles: ['Director', 'Principal', 'Administrator'] },
  {
    pageId: 'reports.inventory_reports',
    roles: ['Director', 'Principal', 'Administrator', 'Officer'],
  },
  { pageId: 'reports.activity_reports', roles: ['Director', 'Principal', 'Administrator'] },
  {
    pageId: 'reports.financial_dashboard',
    roles: ['Director', 'Principal', 'Administrator', 'Officer'],
  },

  // Operations - Directors, Principals, and Officers
  { pageId: 'operations.procurement_dashboard', roles: ['Director', 'Principal', 'Officer'] },
  { pageId: 'operations.purchase_orders', roles: ['Director', 'Principal', 'Officer'] },
  { pageId: 'operations.inventory_management', roles: ['Director', 'Principal', 'Officer'] },
  { pageId: 'operations.supplier_management', roles: ['Director', 'Principal', 'Officer'] },
  { pageId: 'operations.stock_movements', roles: ['Director', 'Principal', 'Officer'] },
  { pageId: 'operations.goods_receipt', roles: ['Director', 'Principal', 'Officer'] },

  // System Administration - Directors and Administrators only
  { pageId: 'admin.system_settings', roles: ['Director', 'Administrator'] },
  { pageId: 'admin.audit_logs', roles: ['Director', 'Administrator'] },
  { pageId: 'admin.workflow_management', roles: ['Director', 'Administrator'] },
  { pageId: 'admin.dashboard_builder', roles: ['Director', 'Administrator'] },
  { pageId: 'admin.roles_permissions_matrix', roles: ['Director'] },
];

// Page definitions with routing information
export const PAGE_DEFINITIONS: PageDefinition[] = [
  // User Management
  {
    id: 'users.add',
    title: 'Add Users',
    path: '/admin/users/add',
    category: 'User Management',
    icon: 'UserPlus',
  },
  {
    id: 'users.edit_roles_permissions',
    title: 'Edit Roles & Permissions',
    path: '/admin/roles-permissions',
    category: 'User Management',
    icon: 'Shield',
  },
  {
    id: 'users.branch_tenant_management',
    title: 'Branch/Tenant Management',
    path: '/admin/branches',
    category: 'User Management',
    icon: 'Building',
  },

  // Financial Operations
  {
    id: 'financial.invoice_generation',
    title: 'Invoice Generation',
    path: '/financial/invoices',
    category: 'Financial Operations',
    icon: 'FileText',
  },
  {
    id: 'financial.invoice_approval',
    title: 'Invoice Approval',
    path: '/financial/invoices/approval',
    category: 'Financial Operations',
    icon: 'CheckCircle',
  },
  {
    id: 'financial.payment_requests',
    title: 'Payment Requests',
    path: '/financial/payments/requests',
    category: 'Financial Operations',
    icon: 'CreditCard',
  },
  {
    id: 'financial.payment_approval',
    title: 'Payment Approval',
    path: '/financial/payments/approval',
    category: 'Financial Operations',
    icon: 'CheckCircle2',
  },
  {
    id: 'financial.daily_posting',
    title: 'Daily Posting',
    path: '/financial/posting',
    category: 'Financial Operations',
    icon: 'Calendar',
  },
  {
    id: 'financial.accounts_management',
    title: 'Accounts Management',
    path: '/financial/accounts',
    category: 'Financial Operations',
    icon: 'BookOpen',
  },
  {
    id: 'financial.receivables_dashboard',
    title: 'Receivables Dashboard',
    path: '/financial/receivables',
    category: 'Financial Operations',
    icon: 'TrendingUp',
  },
  {
    id: 'financial.credit_notes',
    title: 'Credit Notes',
    path: '/financial/credit-notes',
    category: 'Financial Operations',
    icon: 'FileX',
  },

  // Student Management
  {
    id: 'students.registration',
    title: 'Student Registration',
    path: '/students/registration',
    category: 'Client Management',
    icon: 'UserCheck',
  },
  {
    id: 'students.client_management',
    title: 'Client Management',
    path: '/students/clients',
    category: 'Client Management',
    icon: 'Users',
  },
  {
    id: 'students.entitlements',
    title: 'Entitlements',
    path: '/students/entitlements',
    category: 'Client Management',
    icon: 'Award',
  },
  {
    id: 'students.fee_structures',
    title: 'Fee Structures',
    path: '/students/fee-structures',
    category: 'Client Management',
    icon: 'DollarSign',
  },
  {
    id: 'students.statements',
    title: 'Student Statements',
    path: '/students/statements',
    category: 'Client Management',
    icon: 'Receipt',
  },

  // Reports & Analytics
  {
    id: 'reports.profit_loss',
    title: 'Statement of Profit or Loss',
    path: '/reports/profit-loss',
    category: 'Reports & Analytics',
    icon: 'BarChart3',
  },
  {
    id: 'reports.balance_sheet',
    title: 'Statement of Financial Position',
    path: '/reports/balance-sheet',
    category: 'Reports & Analytics',
    icon: 'Scale',
  },
  {
    id: 'reports.trial_balance',
    title: 'Trial Balance',
    path: '/reports/trial-balance',
    category: 'Reports & Analytics',
    icon: 'Calculator',
  },
  {
    id: 'reports.aging_reports',
    title: 'Aging Reports',
    path: '/reports/aging',
    category: 'Reports & Analytics',
    icon: 'Clock',
  },
  {
    id: 'reports.payroll_reports',
    title: 'Payroll Reports',
    path: '/reports/payroll',
    category: 'Reports & Analytics',
    icon: 'Wallet',
  },
  {
    id: 'reports.inventory_reports',
    title: 'Inventory Reports',
    path: '/reports/inventory',
    category: 'Reports & Analytics',
    icon: 'Package',
  },
  {
    id: 'reports.activity_reports',
    title: 'Activity Reports',
    path: '/reports/activity',
    category: 'Reports & Analytics',
    icon: 'Activity',
  },
  {
    id: 'reports.financial_dashboard',
    title: 'Financial Dashboard',
    path: '/reports/financial-dashboard',
    category: 'Reports & Analytics',
    icon: 'PieChart',
  },

  // Operations
  {
    id: 'operations.procurement_dashboard',
    title: 'Procurement Dashboard',
    path: '/operations/procurement',
    category: 'Operations',
    icon: 'ShoppingCart',
  },
  {
    id: 'operations.purchase_orders',
    title: 'Purchase Orders',
    path: '/operations/purchase-orders',
    category: 'Operations',
    icon: 'ShoppingBag',
  },
  {
    id: 'operations.inventory_management',
    title: 'Inventory Management',
    path: '/operations/inventory',
    category: 'Operations',
    icon: 'Warehouse',
  },
  {
    id: 'operations.supplier_management',
    title: 'Supplier Management',
    path: '/operations/suppliers',
    category: 'Operations',
    icon: 'Truck',
  },
  {
    id: 'operations.stock_movements',
    title: 'Stock Movements',
    path: '/operations/stock-movements',
    category: 'Operations',
    icon: 'ArrowRightLeft',
  },
  {
    id: 'operations.goods_receipt',
    title: 'Goods Receipt',
    path: '/operations/goods-receipt',
    category: 'Operations',
    icon: 'PackageCheck',
  },

  // System Administration
  {
    id: 'admin.system_settings',
    title: 'System Settings',
    path: '/admin/settings',
    category: 'System Administration',
    icon: 'Settings',
  },
  {
    id: 'admin.audit_logs',
    title: 'Audit Logs',
    path: '/admin/audit-logs',
    category: 'System Administration',
    icon: 'FileSearch',
  },
  {
    id: 'admin.workflow_management',
    title: 'Workflow Management',
    path: '/admin/workflows',
    category: 'System Administration',
    icon: 'GitBranch',
  },
  {
    id: 'admin.dashboard_builder',
    title: 'Dashboard Builder',
    path: '/admin/dashboard-builder',
    category: 'System Administration',
    icon: 'Layout',
  },
  {
    id: 'admin.roles_permissions_matrix',
    title: 'Roles & Permissions Matrix',
    path: '/admin/roles-matrix',
    category: 'System Administration',
    icon: 'Grid3x3',
  },
];

// Helper functions for permission checking
export const getPermissionsForRole = (role: UserRole): PageId[] => {
  return PHOENIX_ACCESS_TABLE.filter(permission => permission.roles.includes(role)).map(
    permission => permission.pageId
  );
};

export const getRolesForPage = (pageId: PageId): UserRole[] => {
  const permission = PHOENIX_ACCESS_TABLE.find(p => p.pageId === pageId);
  return permission ? permission.roles : [];
};

export const getPagesByCategory = (category: FunctionalCategory): PageDefinition[] => {
  return PAGE_DEFINITIONS.filter(page => page.category === category);
};

export const getPageDefinition = (pageId: PageId): PageDefinition | undefined => {
  return PAGE_DEFINITIONS.find(page => page.id === pageId);
};

export const getPageDefinitionByPath = (path: string): PageDefinition | undefined => {
  return PAGE_DEFINITIONS.find(page => page.path === path);
};

// Categories for organizing navigation
export const FUNCTIONAL_CATEGORIES: FunctionalCategory[] = [
  'User Management',
  'Financial Operations',
  'Client Management',
  'Reports & Analytics',
  'Operations',
  'System Administration',
];
