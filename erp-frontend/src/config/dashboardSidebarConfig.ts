/**
 * dashboardSidebarConfig.ts
 *
 * Default 8-module sidebar navigation configuration that exactly mirrors
 * the Python build_sidebar_config() in create_director_dashboards.py.
 *
 * Used by SidebarWidgetConfigModal:
 *   1. Seeds state when no buttons have been configured yet.
 *   2. Restores defaults when the user clicks "Reset to default".
 *
 * IDs are stable, deterministic strings so that React keys are consistent
 * across renders and HMR sessions.
 *   • Leaf nodes  → `leaf${url.replace(/\//g, '-')}` (URL-derived, unique)
 *   • Group nodes → explicit short strings like `btn-hr`, `btn-hr-master`
 */
import { HierarchyButton } from '../types';

// ── Builder helpers ──────────────────────────────────────────────────────────

type Btn = HierarchyButton;

/** Leaf node — navigable page with no children. */
const leaf = (label: string, url: string): Btn => ({
  id: `leaf${url.replace(/\//g, '-')}`,
  label,
  icon: 'file-text',
  url,
  frontendUrl: url,
  children: [],
});

/** Group node — container with children, no URL. */
const grp = (id: string, label: string, icon: string, children: Btn[]): Btn => ({
  id,
  label,
  icon,
  children,
});

// ── Config type ──────────────────────────────────────────────────────────────

export interface SidebarConfig {
  hierarchyLevels: number;
  logoUrl: string;
  logoSize: 'small' | 'medium' | 'large';
  buttons: HierarchyButton[];
}

// ── Default config ───────────────────────────────────────────────────────────

export const DASHBOARD_SIDEBAR_CONFIG: SidebarConfig = {
  hierarchyLevels: 3,
  logoUrl: '',
  logoSize: 'medium',
  buttons: [

    // 1. HUMAN RESOURCES
    grp('btn-hr', 'HUMAN RESOURCES', 'users', [
      grp('btn-hr-master', 'MASTER', 'file-text', [
        leaf('Staff Directory',      '/hr/staff'),
        leaf('Salary Components',    '/hr/salary-components'),
        leaf('Leave Types',          '/hr/leave-types'),
        leaf('Payroll Schedules',    '/hr/payroll-schedules'),
        leaf('HR Configuration',     '/hr/config'),
        leaf('Pension Remittances',  '/hr/pension-remittances'),
      ]),
      grp('btn-hr-tx', 'TRANSACTION', 'file-text', [
        leaf('Payroll List',         '/hr/payroll'),
        leaf('New Payroll Run',      '/hr/payroll/create'),
        leaf('Attendance',           '/hr/attendance'),
        leaf('Clock In / Out',       '/hr/attendance/clock'),
        leaf('Leave Requests',       '/hr/leave-requests'),
        leaf('New Leave Request',    '/hr/leave-requests/create'),
        leaf('Leave Balances',       '/hr/leave-balances'),
        leaf('Bonus & Deduction',    '/hr/bonus-deduction'),
        leaf('New Bonus/Deduction',  '/hr/bonus-deduction/create'),
        leaf('Payslips',             '/hr/payslips'),
        leaf('Staff Import (Excel)', '/hr/staff/import'),
      ]),
    ]),

    // 2. ACCOUNT
    grp('btn-acct', 'ACCOUNT', 'bar-chart', [
      grp('btn-acct-master', 'MASTER', 'file-text', [
        leaf('Chart of Accounts',   '/accounts'),
        leaf('Account Hierarchy',   '/accounts/hierarchy'),
        leaf('Accounting Periods',  '/accounting/periods'),
        leaf('Budget Periods',      '/budgets/periods'),
      ]),
      grp('btn-acct-tx', 'TRANSACTION', 'file-text', [
        leaf('Ledger Search',       '/accounts/ledger-search'),
        leaf('Journal Vouchers',    '/accounting/journal-vouchers'),
        leaf('New Journal Voucher', '/accounting/journal-vouchers/create'),
        leaf('New Budget Period',   '/budgets/periods/new'),
        leaf('Trial Balance',       '/reports/financial/trial-balance'),
        leaf('Profit & Loss',       '/reports/financial/profit-loss'),
        leaf('Balance Sheet',       '/reports/financial/balance-sheet'),
        leaf('Cash Flow Statement', '/reports/financial/cash-flow'),
      ]),
    ]),

    // 3. CLIENT SERVICE
    grp('btn-student', 'CLIENT SERVICE', 'graduation-cap', [
      grp('btn-student-master', 'MASTER', 'file-text', [
        leaf('Client Classifications', '/clients/classifications'),
        leaf('Loan Products',           '/incomes/fee-structures'),
        leaf('Discount Programs',       '/discounts/programs'),
        leaf('Financial Periods',       '/incomes/academic-sessions'),
        leaf('Service Items',           '/incomes/service-items'),
        leaf('Income Categories',       '/incomes/categories'),
      ]),
      grp('btn-student-tx', 'TRANSACTION', 'file-text', [
        leaf('Client Management',      '/clients'),
        leaf('Register New Client',    '/clients/create'),
        leaf('Client Entitlements',    '/incomes/entitlements'),
        leaf('Entitlements Dashboard', '/incomes/entitlements/dashboard'),
        leaf('Create Invoice',         '/invoices/create'),
        leaf('Invoices List',          '/sales/invoices'),
        leaf('Credit Notes',           '/sales/credit-notes'),
        leaf('Bulk Invoice Wizard',    '/demo/bulk-invoice-wizard'),
        leaf('Client Statements',      '/receivables/statements'),
        leaf('Discount Applications',  '/discounts/applications'),
        leaf('Access Control Checker', '/demo/access-control'),
      ]),
    ]),

    // 4. PROCUREMENT
    grp('btn-proc', 'PROCUREMENT', 'shopping-cart', [
      grp('btn-proc-master', 'MASTER', 'file-text', [
        leaf('Suppliers',            '/procurement/suppliers'),
        leaf('Add Supplier',         '/procurement/suppliers/create'),
        leaf('Procurement Settings', '/procurement/settings'),
      ]),
      grp('btn-proc-tx', 'TRANSACTION', 'file-text', [
        leaf('Purchase Requisitions', '/procurement/requisitions'),
        leaf('New Requisition',       '/procurement/requisitions/create'),
        leaf('Purchase Orders',       '/procurement/orders'),
        leaf('New Purchase Order',    '/procurement/orders/create'),
        leaf('Goods Received Notes',  '/procurement/grn'),
        leaf('New GRN',               '/procurement/grn/create'),
        leaf('Purchase Returns',      '/procurement/returns'),
        leaf('New Return',            '/procurement/returns/create'),
        leaf('Supplier Quotes',       '/procurement/quotes'),
        leaf('3-Way Matching',        '/liabilities/matching'),
        leaf('Accounts Payable',      '/liabilities/payables'),
        leaf('New Payable',           '/liabilities/payables/new'),
        leaf('AP Aging Report',       '/liabilities/vendors'),
      ]),
    ]),

    // 5. INVENTORY
    grp('btn-inv', 'INVENTORY', 'package', [
      grp('btn-inv-master', 'MASTER', 'file-text', [
        leaf('Inventory Items',    '/inventory/items'),
        leaf('Stock Locations',    '/inventory/locations'),
        leaf('Expense Categories', '/expenses/categories'),
      ]),
      grp('btn-inv-tx', 'TRANSACTION', 'file-text', [
        leaf('Stock Movements',         '/inventory/movements'),
        leaf('Stock Adjustments',       '/inventory/adjustments'),
        leaf('New Adjustment',          '/inventory/adjustments/create'),
        leaf('Stock Transfers',         '/inventory/transfers'),
        leaf('New Transfer',            '/inventory/transfers/create'),
        leaf('Stock Valuation Report',  '/inventory/reports/valuation'),
        leaf('Material Requests',       '/inventory/material-requests'),
        leaf('New Material Request',    '/inventory/material-requests/create'),
        leaf('Office Use Requests',     '/inventory/office-use-requests'),
        leaf('New Office Use Request',  '/inventory/office-use-requests/create'),
        leaf('Write-offs',              '/inventory/write-offs'),
        leaf('New Write-off',           '/inventory/write-offs/new'),
        leaf('Physical Counts',         '/inventory/physical-counts'),
        leaf('New Physical Count',      '/inventory/physical-counts/new'),
        leaf('Resource Consumption',    '/expenses/resource-consumption'),
        leaf('Voucher Management',      '/expenses/vouchers'),
        leaf('Expiring Vouchers',       '/expenses/vouchers/expiring'),
        leaf('Prepaid Expenses',        '/expenses/prepaid'),
      ]),
    ]),

    // 6. ASSET MANAGEMENT
    grp('btn-assets', 'ASSET MANAGEMENT', 'home', [
      grp('btn-assets-master', 'MASTER', 'file-text', [
        leaf('Asset Categories', '/assets/categories'),
      ]),
      grp('btn-assets-tx', 'TRANSACTION', 'file-text', [
        leaf('Fixed Asset Register',   '/assets'),
        leaf('Register Single Asset',  '/assets/register'),
        leaf('Asset Requisitions',     '/assets/requisitions'),
        leaf('New Asset Requisition',  '/assets/requisitions/new'),
        leaf('Asset Acquisitions',     '/assets/acquisitions'),
        leaf('Bulk Asset Acquisition', '/assets/acquisitions/new'),
        leaf('Asset Maintenance',      '/assets/maintenance'),
        leaf('Log Maintenance Event',  '/assets/maintenance/new'),
        leaf('Depreciation Ledger',    '/assets/depreciation'),
        leaf('Fleet Fuel Monitor',     '/assets/fuel-monitor'),
        leaf('Log Fuel Receipt',       '/expenses/fuel-log/create'),
        leaf('Fuel Anomaly Dashboard', '/expenses/resource-consumption/irregularities'),
      ]),
    ]),

    // 7. BANK
    grp('btn-bank', 'BANK', 'credit-card', [
      grp('btn-bank-master', 'MASTER', 'file-text', [
        leaf('Banks',            '/banks'),
        leaf('Bank Accounts',    '/banks/accounts'),
        leaf('New Bank Account', '/banks/accounts/new'),
      ]),
      grp('btn-bank-tx', 'TRANSACTION', 'file-text', [
        leaf('Receivables',           '/receivables/list'),
        leaf('Record Payment',        '/receivables/payments/record'),
        leaf('Aging Report',          '/receivables/aging-report'),
        leaf('Bulk Payment Upload',   '/receivables/bulk-payment-upload'),
        leaf('Collections Dashboard', '/receivables/collections'),
        leaf('Collection Workbench',  '/receivables/collections/workbench'),
        leaf('Reminder Management',   '/receivables/reminders'),
        leaf('Bank Payments',         '/banks/payments'),
        leaf('New Bank Payment',      '/banks/payments/new'),
        leaf('Inter-bank Transfers',  '/banks/transfers'),
        leaf('New Transfer',          '/banks/transfers/new'),
        leaf('Transfer Approvals',    '/banks/transfers/approvals'),
        leaf('Bank Reconciliation',   '/treasury/bank-reconciliation'),
        leaf('Cash Reconciliation',   '/treasury/cash-reconciliation'),
        leaf('Cashier Accounts',      '/treasury/cashier-accounts'),
        leaf('Cash Transfers',        '/treasury/cash-transfers'),
      ]),
    ]),

    // 8. PETTY CASH
    grp('btn-petty', 'PETTY CASH', 'wallet', [
      grp('btn-petty-master', 'MASTER', 'file-text', [
        leaf('Petty Cash Funds', '/treasury/petty-cash'),
        leaf('New Fund',         '/treasury/petty-cash/funds/new'),
      ]),
      grp('btn-petty-tx', 'TRANSACTION', 'file-text', [
        leaf('Petty Cash Vouchers', '/treasury/petty-cash/vouchers'),
        leaf('New Voucher',         '/treasury/petty-cash/vouchers/new'),
        leaf('Replenishments',      '/treasury/petty-cash/replenishments'),
        leaf('New Replenishment',   '/treasury/petty-cash/replenishments/new'),
        leaf('Expiring Vouchers',   '/expenses/vouchers/expiring'),
      ]),
    ]),

  ],
};
