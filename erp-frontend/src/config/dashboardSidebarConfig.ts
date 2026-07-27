/**
 * dashboardSidebarConfig.ts
 *
 * Sidebar navigation configuration.
 * Modules are organised per the restructuring plan:
 *   Operation     → Fixed Asset (separate), Inventory (separate),
 *                   Procurement (separate)
 *   Financial Mgmt→ Receivable (separate), Financial Reports (under Account),
 *                   Bank (separate), Accounting (under Account),
 *                   Account Payable (separate)
 *   Treasury      → Bank Management (separate → merged into BANK),
 *                   Petty Cash (separate)
 *   + NEW: LOANS, SAVINGS modules
 *   Deleted items → Invoicing, Entitlements, Fee Structures (moved to Loans),
 *                   Resource Consumption, Voucher Management
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
        leaf('Staff Directory', '/hr/staff'),
        leaf('Salary Components', '/hr/salary-components'),
        leaf('Leave Types', '/hr/leave-types'),
        leaf('Payroll Schedules', '/hr/payroll-schedules'),
        leaf('HR Configuration', '/hr/config'),
        leaf('Pension Remittances', '/hr/pension-remittances'),
      ]),
      grp('btn-hr-tx', 'TRANSACTION', 'file-text', [
        leaf('Payroll List', '/hr/payroll'),
        leaf('New Payroll Run', '/hr/payroll/create'),
        leaf('Attendance', '/hr/attendance'),
        leaf('Clock In / Out', '/hr/attendance/clock'),
        leaf('Leave Requests', '/hr/leave-requests'),
        leaf('New Leave Request', '/hr/leave-requests/create'),
        leaf('Leave Balances', '/hr/leave-balances'),
        leaf('Bonus & Deduction', '/hr/bonus-deduction'),
        leaf('New Bonus/Deduction', '/hr/bonus-deduction/create'),
        leaf('Payslips', '/hr/payslips'),
        leaf('Staff Import (Excel)', '/hr/staff/import'),
      ]),
    ]),

    // 2. ACCOUNT
    // Includes: core accounting, financial reports, prepaid expenses (moved from Inventory)
    grp('btn-acct', 'ACCOUNT', 'bar-chart', [
      grp('btn-acct-master', 'MASTER', 'file-text', [
        leaf('Chart of Accounts', '/accounts'),
        leaf('Account Hierarchy', '/accounts/hierarchy'),
        leaf('Accounting Periods', '/accounting/periods'),
        leaf('Budget Periods', '/budgets/periods'),
      ]),
      grp('btn-acct-tx', 'TRANSACTION', 'file-text', [
        leaf('Ledger Search', '/accounts/ledger-search'),
        leaf('Journal Vouchers', '/accounting/journal-vouchers'),
        leaf('New Journal Voucher', '/accounting/journal-vouchers/create'),
        leaf('New Budget Period', '/budgets/periods/new'),
        leaf('Trial Balance', '/reports/financial/trial-balance'),
        leaf('Profit & Loss', '/reports/financial/profit-loss'),
        leaf('Balance Sheet', '/reports/financial/balance-sheet'),
        leaf('Cash Flow Statement', '/reports/financial/cash-flow'),
        leaf('Prepaid Expenses', '/expenses/prepaid'),
        leaf('New Prepaid Expense', '/expenses/prepaid/create'),
      ]),
    ]),

    // 3. CLIENT SERVICE
    grp('btn-student', 'CLIENT SERVICE', 'graduation-cap', [
      grp('btn-student-master', 'MASTER', 'file-text', [
        leaf('Client Classifications', '/clients/classifications'),
        leaf('Client Groups', '/clients/groups'),
        leaf('Registration Fee Config', '/clients/registration-config'),
      ]),
      grp('btn-student-tx', 'TRANSACTION', 'file-text', [
        leaf('Client Management', '/clients'),
        leaf('Register New Client', '/clients/create'),
        leaf('Prospect Registration', '/prospects/register'),
        leaf('Prospects List', '/prospects'),
        leaf('Re-activate Account', '/clients/reactivate'),
        leaf('Client Statements', '/receivables/statements'),
      ]),
    ]),

    // 4. PROCUREMENT (Operation → separate)
    // Removed: 3-Way Matching, Accounts Payable, AP Aging, Supplier Quotes → moved to ACCOUNTS PAYABLE
    grp('btn-proc', 'PROCUREMENT', 'shopping-cart', [
      leaf('📋 Module Overview', '/procurement'),
      grp('btn-proc-master', 'MASTER', 'file-text', [
        leaf('Suppliers', '/procurement/suppliers'),
        leaf('Add Supplier', '/procurement/suppliers/create'),
        leaf('Procurement Settings', '/procurement/settings'),
      ]),
      grp('btn-proc-tx', 'TRANSACTION', 'file-text', [
        leaf('Purchase Requisitions', '/procurement/requisitions'),
        leaf('New Requisition', '/procurement/requisitions/create'),
        leaf('Purchase Orders', '/procurement/orders'),
        leaf('New Purchase Order', '/procurement/orders/create'),
        leaf('Goods Received Notes', '/procurement/grn'),
        leaf('New GRN', '/procurement/grn/create'),
        leaf('Purchase Returns', '/procurement/returns'),
        leaf('New Return', '/procurement/returns/create'),
      ]),
    ]),

    // 5. INVENTORY (Operation → separate)
    // Removed: Resource Consumption, Voucher Management, Expiring Vouchers, Prepaid Expenses
    grp('btn-inv', 'INVENTORY', 'package', [
      leaf('📋 Module Overview', '/inventory'),
      grp('btn-inv-master', 'MASTER', 'file-text', [
        leaf('Inventory Items', '/inventory/items'),
        leaf('Stock Locations', '/inventory/locations'),
        leaf('Expense Categories', '/expenses/categories'),
      ]),
      grp('btn-inv-tx', 'TRANSACTION', 'file-text', [
        leaf('Stock Movements', '/inventory/movements'),
        leaf('Stock Adjustments', '/inventory/adjustments'),
        leaf('New Adjustment', '/inventory/adjustments/create'),
        leaf('Stock Transfers', '/inventory/transfers'),
        leaf('New Transfer', '/inventory/transfers/create'),
        leaf('Stock Valuation Report', '/inventory/reports/valuation'),
        leaf('Material Requests', '/inventory/material-requests'),
        leaf('New Material Request', '/inventory/material-requests/create'),
        leaf('Office Use Requests', '/inventory/office-use-requests'),
        leaf('New Office Use Request', '/inventory/office-use-requests/create'),
        leaf('Write-offs', '/inventory/write-offs'),
        leaf('New Write-off', '/inventory/write-offs/new'),
        leaf('Physical Counts', '/inventory/physical-counts'),
        leaf('New Physical Count', '/inventory/physical-counts/new'),
      ]),
    ]),

    // 6. FIXED ASSET (Operation → separate, was embedded under Asset Management)
    grp('btn-assets', 'FIXED ASSET', 'home', [
      leaf('📋 Module Overview', '/fixed-asset'),
      grp('btn-assets-master', 'MASTER', 'file-text', [
        leaf('Asset Categories', '/assets/categories'),
      ]),
      grp('btn-assets-tx', 'TRANSACTION', 'file-text', [
        leaf('Fixed Asset Register', '/assets'),
        leaf('Register Single Asset', '/assets/register'),
        leaf('Asset Requisitions', '/assets/requisitions'),
        leaf('New Asset Requisition', '/assets/requisitions/new'),
        leaf('Asset Acquisitions', '/assets/acquisitions'),
        leaf('Bulk Asset Acquisition', '/assets/acquisitions/new'),
        leaf('Asset Maintenance', '/assets/maintenance'),
        leaf('Log Maintenance Event', '/assets/maintenance/new'),
        leaf('Depreciation Ledger', '/assets/depreciation'),
        leaf('Fleet Fuel Monitor', '/assets/fuel-monitor'),
        leaf('Log Fuel Receipt', '/expenses/fuel-log/create'),
        leaf('Fuel Anomaly Dashboard', '/expenses/resource-consumption/irregularities'),
      ]),
    ]),

    // 7. BANK (Financial Management → separate; Bank Management → separate under BANK)
    grp('btn-bank', 'BANK', 'credit-card', [
      leaf('📋 Module Overview', '/bank'),
      grp('btn-bank-master', 'MASTER', 'file-text', [
        leaf('Banks', '/banks'),
        leaf('Bank Accounts', '/banks/accounts'),
        leaf('New Bank Account', '/banks/accounts/new'),
      ]),
      grp('btn-bank-tx', 'TRANSACTION', 'file-text', [
        leaf('Bank Payments', '/banks/payments'),
        leaf('New Bank Payment', '/banks/payments/new'),
        leaf('Inter-bank Transfers', '/banks/transfers'),
        leaf('New Transfer', '/banks/transfers/new'),
        leaf('Transfer Approvals', '/banks/transfers/approvals'),
        leaf('Bank Reconciliation (Manual)', '/treasury/bank-reconciliation'),
        leaf('Statement Reconciliation (Auto-Match)', '/banks/reconciliations'),
        leaf('Officer Reconciliation Risk', '/banks/reconciliations/officer-risk-report'),
        leaf('Manual Overrides', '/banks/reconciliations/manual-overrides'),
        leaf('Missing Money Summary', '/banks/reconciliations/missing-money-summary'),
        leaf('Payment Trace', '/banks/reconciliations/payment-trace'),
        leaf('Cash Reconciliation', '/treasury/cash-reconciliation'),
        leaf('Cashier Accounts', '/treasury/cashier-accounts'),
        leaf('Cash Transfers', '/treasury/cash-transfers'),
      ]),
    ]),

    // 8. RECEIVABLE (Financial Management → separate)
    grp('btn-recv', 'RECEIVABLE', 'trending-up', [
      leaf('📋 Module Overview', '/receivable'),
      grp('btn-recv-tx', 'TRANSACTION', 'file-text', [
        leaf('Receivables', '/receivables/list'),
        leaf('Record Payment', '/receivables/payments/record'),
        leaf('Aging Report', '/receivables/aging-report'),
        leaf('Bulk Payment Upload', '/receivables/bulk-payment-upload'),
        leaf('Collections Dashboard', '/receivables/collections'),
        leaf('Collection Workbench', '/receivables/collections/workbench'),
        leaf('Reminder Management', '/receivables/reminders'),
      ]),
    ]),

    // 9. ACCOUNT PAYABLE (Financial Management → separate)
    grp('btn-ap', 'ACCOUNT PAYABLE', 'file-minus', [
      leaf('📋 Module Overview', '/accounts-payable'),
      grp('btn-ap-tx', 'TRANSACTION', 'file-text', [
        leaf('Accounts Payable', '/liabilities/payables'),
        leaf('New Payable', '/liabilities/payables/new'),
        leaf('AP Aging Report', '/liabilities/vendors'),
        leaf('3-Way Matching', '/liabilities/matching'),
        leaf('Supplier Quotes', '/procurement/quotes'),
      ]),
    ]),

    // 10. PETTY CASH (Treasury & Expenses → separate)
    grp('btn-petty', 'PETTY CASH', 'wallet', [
      leaf('📋 Module Overview', '/petty-cash'),
      grp('btn-petty-master', 'MASTER', 'file-text', [
        leaf('Petty Cash Funds', '/treasury/petty-cash'),
        leaf('New Fund', '/treasury/petty-cash/funds/new'),
      ]),
      grp('btn-petty-tx', 'TRANSACTION', 'file-text', [
        leaf('Petty Cash Vouchers', '/treasury/petty-cash/vouchers'),
        leaf('New Voucher', '/treasury/petty-cash/vouchers/new'),
        leaf('Replenishments', '/treasury/petty-cash/replenishments'),
        leaf('New Replenishment', '/treasury/petty-cash/replenishments/new'),
      ]),
    ]),

    // 11. SAVINGS (Client savings accounts & collection)
    grp('btn-savings', 'SAVINGS', 'piggy-bank', [
      leaf('📋 Module Overview', '/savings'),
      grp('btn-savings-master', 'MASTER', 'file-text', [
        leaf('Savings Products', '/savings/products'),
        leaf('Compulsory Policy', '/savings/policy'),
      ]),
      grp('btn-savings-tx', 'TRANSACTION', 'file-text', [
        leaf('Savings Accounts', '/savings/accounts'),
        leaf('New Savings Account', '/savings/accounts/create'),
        leaf('Receipt Savings', '/savings/collection'),
        leaf('Savings Withdrawal', '/savings/withdrawals'),
        leaf('Receipt Combined', '/savings/combined-receipt'),
        leaf('Receipt Group Combined', '/savings/group-combined-receipt'),
      ]),
      grp('btn-savings-collection', 'COLLECTION', 'file-text', [
        leaf('Collection Sheet', '/savings/collection/sheet'),
        leaf('Collection Spreadsheet', '/savings/collection/spreadsheet'),
        leaf('Multi-Day Deposit', '/savings/collection/multi-day'),
      ]),
      grp('btn-savings-rpt', 'REPORT', 'file-text', [
        leaf('Savings by Product', '/reports/savings-by-product'),
        leaf('Daily Contribution Report', '/reports/contributions/daily'),
        leaf('Daily Contribution Spreadsheet', '/reports/contributions/spreadsheet'),
        leaf('Group Savings Report', '/reports/clients/groups'),
      ]),
    ]),

    // 12. LOANS (Client loan accounts, workflow & daily collection)
    grp('btn-loans', 'LOANS', 'landmark', [
      leaf('📋 Module Overview', '/loans'),
      grp('btn-loans-master', 'MASTER', 'file-text', [leaf('Loan Products', '/loans/products')]),
      grp('btn-loans-tx', 'TRANSACTION', 'file-text', [
        leaf('Loan Accounts', '/loans/accounts'),
        leaf('New Loan Application', '/loans/accounts/create'),
        leaf('Loan Verification', '/loans/verification'),
        leaf('Loan Disbursements', '/loans/disbursements'),
        leaf('Loan Collection', '/loans/collection'),
        leaf('Repayment Approvals', '/loans/repayment-approvals'),
        leaf('Restructure Approvals', '/loans/restructure-approvals'),
        leaf('Disbursement Corrections', '/loans/disbursement-corrections'),
      ]),
      grp('btn-loans-rpt', 'REPORT', 'file-text', [
        leaf('Debtors Report', '/reports/loans/debtors'),
        leaf('Defaulters Report', '/reports/loans/defaulters'),
        leaf('Portfolio at Risk', '/reports/loans/par'),
        leaf('Remittance Report', '/reports/daily-transactions'),
        leaf('Group Report', '/reports/clients/groups'),
        leaf('Report Summary by Date', '/reports/summary'),
        leaf('Disbursement Master Roll', '/reports/disbursement-master-roll'),
        leaf('Disbursement by Product', '/reports/disbursement-by-product'),
        leaf('Daily Collection Report', '/reports/daily-collection-report'),
        leaf('Staff Performance Report', '/reports/staff-performance'),
      ]),
    ]),

    // 13. REPORTS (admin-level cross-module reports)
    grp('btn-reports', 'REPORTS', 'bar-chart', [
      grp('btn-reports-financial', 'FINANCIAL', 'file-text', [
        leaf('Income Report', '/reports/income'),
        leaf('Trial Balance', '/reports/financial/trial-balance'),
        leaf('Profit & Loss', '/reports/financial/profit-loss'),
        leaf('Balance Sheet', '/reports/financial/balance-sheet'),
        leaf('Liquidity & Impact (DC)', '/reports/liquidity-impact'),
      ]),
      grp('btn-reports-ops', 'OPERATIONS', 'file-text', [
        leaf('Debtors Report', '/reports/loans/debtors'),
        leaf('Defaulters Report', '/reports/loans/defaulters'),
        leaf('Portfolio at Risk (PAR)', '/reports/loans/par'),
        leaf('Remittance Report', '/reports/daily-transactions'),
        leaf('Group Report', '/reports/clients/groups'),
        leaf('Report Summary by Date', '/reports/summary'),
        leaf('Disbursement Master Roll', '/reports/disbursement-master-roll'),
        leaf('Disbursement by Product', '/reports/disbursement-by-product'),
        leaf('Daily Collection Report', '/reports/daily-collection-report'),
        leaf('Staff Performance Report', '/reports/staff-performance'),
      ]),
      grp('btn-reports-savings', 'SAVINGS', 'file-text', [
        leaf('Savings by Product', '/reports/savings-by-product'),
        leaf('Daily Contribution Report', '/reports/contributions/daily'),
        leaf('DC Spreadsheet', '/reports/contributions/spreadsheet'),
      ]),
    ]),

    // 14. OFFICE SPACE / ADMIN
    grp('btn-admin', 'ADMIN', 'settings', [
      grp('btn-admin-access', 'ACCESS CONTROL', 'shield', [
        leaf('User Management', '/admin/users'),
        leaf('Role Management', '/admin/roles'),
        leaf('Permission Setup', '/admin/permission-setup'),
      ]),
      grp('btn-admin-office', 'OFFICE SPACE', 'file-text', [
        leaf('Clock In', '/hr/attendance/clock'),
        leaf('Clock Out', '/hr/attendance/clock'),
      ]),
      grp('btn-admin-ops', 'OPERATIONS', 'file-text', [
        leaf('Transaction Reversal', '/admin/transaction-reversal'),
        leaf('Review Week', '/admin/review-week'),
        leaf('Close Month', '/accounting/periods'),
        leaf('Close Year', '/admin/close-year'),
        leaf('Scheduled Jobs', '/admin/scheduled-jobs'),
        leaf('Change Password', '/profile'),
      ]),
    ]),
  ],
};
