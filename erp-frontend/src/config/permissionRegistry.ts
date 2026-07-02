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
      { code: 'clients',                title: 'Client List',       description: 'View and manage client records' },
      { code: 'client-groups',          title: 'Client Groups',     description: 'Ajo / savings groups and member management' },
      { code: 'client-classifications', title: 'Classifications',   description: 'Client classification categories' },
      { code: 'client-documents',       title: 'Documents',         description: 'Upload and view client documents' },
      { code: 'client-notes',           title: 'Notes',             description: 'Client interaction notes' },
      { code: 'client-relationships',   title: 'Relationships',     description: 'Client-to-client relationship records' },
    ],
  },
  {
    code: 'loans',
    name: 'Loans',
    icon: 'CreditCard',
    color: '#0891b2',
    description: 'Loan origination, disbursement, repayment, and collections',
    pages: [
      { code: 'loan-accounts',           title: 'Loan Accounts',          description: 'Create and manage loan accounts' },
      { code: 'loan-disbursements',      title: 'Disbursements',          description: 'Disburse approved loans' },
      { code: 'loan-repayment-requests', title: 'Repayment Requests',     description: 'Savings-debit repayment requests' },
    ],
  },
  {
    code: 'savings',
    name: 'Savings',
    icon: 'PiggyBank',
    color: '#059669',
    description: 'Savings accounts, deposits, withdrawals, and schedules',
    pages: [
      { code: 'savings-accounts',            title: 'Savings Accounts',           description: 'View and manage savings accounts' },
      { code: 'contribution-schedules',      title: 'Contribution Schedules',     description: 'Savings contribution schedules' },
      { code: 'compulsory-savings-policies', title: 'Compulsory Savings Policies',description: 'Mandatory savings rules' },
    ],
  },
  {
    code: 'cash-management',
    name: 'Cash Management',
    icon: 'Wallet',
    color: '#d97706',
    description: 'Cashier accounts, collections, transfers, and reconciliation',
    pages: [
      { code: 'cashier-accounts',         title: 'Cashier Accounts',       description: 'Manage cashier float accounts' },
      { code: 'cash-collections',         title: 'Cash Collections',       description: 'Record cash received' },
      { code: 'cash-transfers',           title: 'Cash Transfers',         description: 'Transfer between cashier accounts' },
      { code: 'cash-reconciliation',      title: 'Cash Reconciliation',    description: 'Daily cashier reconciliation' },
      { code: 'collection-sheets',        title: 'Collection Sheets',      description: 'Group collection sheets' },
      { code: 'petty-cash-funds',         title: 'Petty Cash Funds',       description: 'Manage petty cash funds' },
      { code: 'petty-cash-vouchers',      title: 'Petty Cash Vouchers',    description: 'Record petty cash payments' },
      { code: 'bank-reconciliation',      title: 'Bank Reconciliation',    description: 'Reconcile bank statements' },
    ],
  },
  {
    code: 'accounts',
    name: 'Accounts (GL)',
    icon: 'BookOpen',
    color: '#7c3aed',
    description: 'General ledger, chart of accounts, and financial periods',
    pages: [
      { code: 'chart-of-accounts',  title: 'Chart of Accounts',  description: 'GL accounts structure' },
      { code: 'account-categories', title: 'Account Categories', description: 'GL account groupings' },
      { code: 'accounting-periods', title: 'Accounting Periods', description: 'Financial year and period management' },
      { code: 'balance-sheet',      title: 'Balance Sheet',      description: 'View balance sheet reports' },
    ],
  },
  {
    code: 'transactions',
    name: 'Transactions',
    icon: 'ArrowLeftRight',
    color: '#0284c7',
    description: 'Journal entries and transaction ledger',
    pages: [
      { code: 'transactions',        title: 'Transaction Ledger', description: 'View all posted journal entries' },
      { code: 'transaction-series',  title: 'Transaction Series', description: 'Manage transaction series codes' },
    ],
  },
  {
    code: 'banks',
    name: 'Banking',
    icon: 'Building2',
    color: '#1d4ed8',
    description: 'Bank accounts, payments, and transfers',
    pages: [
      { code: 'bank-accounts',         title: 'Bank Accounts',    description: 'Company bank account records' },
      { code: 'bank-payments',         title: 'Bank Payments',    description: 'Record outward bank payments' },
      { code: 'bank-transfers',        title: 'Bank Transfers',   description: 'Transfer between bank accounts' },
      { code: 'bank-statement-uploads',title: 'Statement Uploads',description: 'Upload bank statement files' },
    ],
  },
  {
    code: 'hr',
    name: 'Human Resources',
    icon: 'UserCheck',
    color: '#be185d',
    description: 'Staff management, leave, payroll, and attendance',
    pages: [
      { code: 'staff',               title: 'Staff Records',    description: 'Create and manage staff profiles' },
      { code: 'leave-requests',      title: 'Leave Requests',   description: 'Apply for and approve leave' },
      { code: 'leave-types',         title: 'Leave Types',      description: 'Configure leave type categories' },
      { code: 'attendance',          title: 'Attendance',       description: 'Track staff attendance' },
      { code: 'payroll',             title: 'Payroll',          description: 'Process and approve payroll' },
      { code: 'payslips',            title: 'Payslips',         description: 'View and download payslips' },
      { code: 'bonus-deductions',    title: 'Bonus / Deductions', description: 'Ad-hoc bonuses and deductions' },
    ],
  },
  {
    code: 'reports',
    name: 'Reports',
    icon: 'BarChart3',
    color: '#9333ea',
    description: 'Report templates, financial reports, and exports',
    pages: [
      { code: 'report-templates',   title: 'Report Templates',  description: 'Configure report templates' },
      { code: 'report-executions',  title: 'Run Reports',       description: 'Execute and download reports' },
      { code: 'financial-reports',  title: 'Financial Reports', description: 'P&L, balance sheet, cash flow' },
    ],
  },
  {
    code: 'procurement',
    name: 'Procurement',
    icon: 'ShoppingCart',
    color: '#c2410c',
    description: 'Purchase requisitions and orders',
    pages: [
      { code: 'purchase-requisitions', title: 'Requisitions', description: 'Raise purchase requisitions' },
      { code: 'purchase-orders',       title: 'Purchase Orders', description: 'Approve and manage POs' },
    ],
  },
  {
    code: 'branches',
    name: 'Branches',
    icon: 'MapPin',
    color: '#64748b',
    description: 'Branch setup and management',
    pages: [
      { code: 'branches', title: 'Branches', description: 'Create and manage company branches' },
    ],
  },
  {
    code: 'users',
    name: 'Users & Roles',
    icon: 'ShieldCheck',
    color: '#374151',
    description: 'User management, roles, and access control',
    pages: [
      { code: 'roles',       title: 'Roles',          description: 'Create and manage user roles' },
      { code: 'staff-users', title: 'User Accounts',  description: 'Create and manage user accounts' },
    ],
  },
  {
    code: 'permissions',
    name: 'Permissions',
    icon: 'Lock',
    color: '#111827',
    description: 'Fine-grained permission policies and user overrides',
    pages: [
      { code: 'role-permission-policies', title: 'Role Policies',     description: 'Configure role-level permission policies' },
      { code: 'user-permission-overrides', title: 'User Overrides',   description: 'Grant individual users elevated permissions' },
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
