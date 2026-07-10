// src/config/featureRegistry.ts
import {
  // Financial Module Icons
  FileText,
  CreditCard,
  Receipt,
  BarChart3,
  Plus,
  Settings,
  Calculator,
  TrendingUp,
  PieChart,
  Upload,
  Wallet,
  Eye,
  Edit,
  Trash2,
  Download,

  // Client Services Icons
  Users,
  Building,
  GraduationCap,
  Target,
  CheckSquare,
  UserPlus,

  // Operations Icons
  ShoppingCart,
  Package,
  RotateCcw,
  Truck,
  Boxes,
  Tag,
  Home,
  AlertTriangle,
  Clock,
  DollarSign,
  Calendar,
  Activity,
  ClipboardList,

  // Administration Icons
  User,
  Briefcase,
  CalendarDays,
  Clock3,
  DollarSign as DollarIcon,
  Calculator as CalcIcon,
  ListChecks,
  Settings as SettingsIcon,

  // Common Icons
  AlertCircle,
  CheckCircle,
  XCircle,
  HelpCircle,
  Filter,
  Search,
  ArrowRight,
  ArrowLeft,
  Save,
  X,
  Copy,
  Printer,
  Mail,
  Phone,
  MapPin,
  Globe,
  Star,
  Award,
  Shield,
  Key,
  Lock,
  Unlock,
  Layers,
  Gauge,
  Wrench,
  TrendingDown,
  Droplets,
  Banknote,
  ArrowRightLeft,
} from 'lucide-react';
import { getRoleRank } from '../types/roles';
import { ROUTE_TO_PAGE } from './routeToPageMap';
import { permissionService } from '../services/permissionService';

export interface FeatureCard {
  id: string;
  title: string;
  description: string;
  path: string;
  icon: any;
  requiredPermission: string;
  moduleId:
    | 'financial'
    | 'client-services'
    | 'administration'
    | 'all-access'
    | 'inventory'
    | 'procurement'
    | 'fixed-asset'
    | 'petty-cash'
    | 'bank'
    | 'receivable'
    | 'accounts-payable'
    | 'savings'
    | 'loans';
  category: string;
  isNew?: boolean;
  isEnhanced?: boolean;
  isDeprecated?: boolean;
}

export const FEATURE_REGISTRY: FeatureCard[] = [
  // ==========================================================================
  // FINANCIAL MODULE - Complete from FinancialManagementModule.tsx
  // ==========================================================================

  // ----- Receivables Category -----
  {
    id: 'receivables-list',
    title: '📝 All Receivables List',
    description:
      'Unified view of all receivables with aging buckets, collection assignment, bulk operations, and comprehensive filtering',
    path: '/receivables/list',
    icon: Receipt,
    requiredPermission: 'receivables-list',
    moduleId: 'receivable',
    category: 'Receivables',
    isNew: true,
  },
  {
    id: 'aging-analysis-report',
    title: '📊 Aging Analysis Report',
    description:
      'Interactive aging breakdown with customer drill-down, export capabilities, date range filtering, and trend analysis',
    path: '/receivables/aging-report',
    icon: BarChart3,
    requiredPermission: 'receivables-report',
    moduleId: 'receivable',
    category: 'Receivables',
    isNew: true,
  },
  {
    id: 'bulk-payment-upload',
    title: '📤 Bulk Payment Upload',
    description:
      'CSV payment upload interface with payment mapping, validation, batch processing status, and error handling',
    path: '/receivables/bulk-payment-upload',
    icon: Upload,
    requiredPermission: 'payment-bulk-upload',
    moduleId: 'receivable',
    category: 'Receivables',
    isNew: true,
  },
  {
    id: 'collections-dashboard',
    title: '🎯 Collections Dashboard',
    description:
      'Overdue receivables summary with collector assignment interface, collection activity metrics, and escalation management',
    path: '/receivables/collections',
    icon: Target,
    requiredPermission: 'collections-view',
    moduleId: 'receivable',
    category: 'Receivables',
    isNew: true,
  },
  {
    id: 'collection-workbench',
    title: '💼 Collection Workbench',
    description:
      'Collector activity interface with contact logging, payment promise tracking, and collection activity timeline',
    path: '/receivables/collections/workbench',
    icon: ClipboardList,
    requiredPermission: 'collections-workbench',
    moduleId: 'receivable',
    category: 'Receivables',
    isNew: true,
  },
  {
    id: 'reminder-management',
    title: '📧 Reminder Management',
    description:
      'Automated reminder settings with template management, sending history, and manual reminder capabilities',
    path: '/receivables/reminders',
    icon: Mail,
    requiredPermission: 'reminder-manage',
    moduleId: 'receivable',
    category: 'Receivables',
    isNew: true,
  },
  {
    id: 'automated-workflows',
    title: '🔄 Automated Workflows',
    description:
      'Aging updates connected to workflow triggers with collection stage progression and escalation rule management',
    path: '/receivables/workflows',
    icon: Settings,
    requiredPermission: 'workflow-manage',
    moduleId: 'receivable',
    category: 'Receivables',
    isNew: true,
  },
  {
    id: 'advanced-reporting',
    title: '📈 Advanced Reporting',
    description:
      'Comprehensive reporting interface with custom report builder, scheduled reports, and download history',
    path: '/receivables/advanced-reporting',
    icon: BarChart3,
    requiredPermission: 'report-executions-view',
    moduleId: 'receivable',
    category: 'Receivables',
    isNew: true,
  },
  {
    id: 'customer-statements',
    title: '📄 Customer Statements',
    description:
      'Statement generation interface with individual and batch generation, history tracking, and email delivery options',
    path: '/receivables/statements',
    icon: FileText,
    requiredPermission: 'statement-generate',
    moduleId: 'receivable',
    category: 'Receivables',
    isNew: true,
  },
  {
    id: 'statement-preview',
    title: '👁️ Statement Preview',
    description:
      'Statement preview interface with transaction details, balances, PDF generation, and email composition',
    path: '/receivables/statement-preview-test',
    icon: Eye,
    requiredPermission: 'statement-preview',
    moduleId: 'receivable',
    category: 'Receivables',
    isNew: true,
  },

  // ----- Financial Reports Category -----
  {
    id: 'chart-of-accounts',
    title: 'Chart of Accounts',
    description:
      'Manage and view the complete chart of accounts with hierarchical structure, account types, and balances',
    path: '/accounts',
    icon: Wallet,
    requiredPermission: 'chart-of-accounts-view',
    moduleId: 'financial',
    category: 'Financial Reports',
    isNew: true,
  },
  {
    id: 'account-hierarchy',
    title: 'Account Hierarchy',
    description:
      'Browse the full chart of accounts in a hierarchical tree view grouped by account type',
    path: '/accounts/hierarchy',
    icon: BarChart3,
    requiredPermission: 'chart-of-accounts-view',
    moduleId: 'financial',
    category: 'Financial Reports',
    isNew: true,
  },
  {
    id: 'account-ledgers',
    title: 'Ledger Search',
    description: 'Search and open ledger transaction histories for any GL account',
    path: '/accounts/ledger-search',
    icon: BarChart3,
    requiredPermission: '',
    moduleId: 'financial',
    category: 'Financial Reports',
    isNew: true,
  },
  {
    id: 'trial-balance',
    title: 'Trial Balance Report',
    description:
      'Complete trial balance with hierarchical account display, filtering, and export functionality',
    path: '/reports/financial/trial-balance',
    icon: Calculator,
    requiredPermission: 'financial-reports-view',
    moduleId: 'financial',
    category: 'Financial Reports',
    isNew: true,
  },
  {
    id: 'profit-loss',
    title: 'Statement of Profit or Loss',
    description:
      'FIRS/IFRS-compliant Statement of Profit or Loss and Other Comprehensive Income with comparative analysis',

    path: '/reports/financial/profit-loss',
    icon: TrendingUp,
    requiredPermission: 'financial-reports-view',
    moduleId: 'financial',
    category: 'Financial Reports',
    isNew: true,
  },
  {
    id: 'balance-sheet',
    title: 'Statement of Financial Position',
    description:
      'FIRS/IAS 1-compliant Statement of Financial Position (formerly Balance Sheet) with current/non-current classification',
    path: '/reports/financial/balance-sheet',
    icon: PieChart,
    requiredPermission: 'financial-reports-view',
    moduleId: 'financial',
    category: 'Financial Reports',
    isNew: true,
  },

  // ==========================================================================
  // BANKING CATEGORY (under Financial module)
  // ==========================================================================

  {
    id: 'bank-accounts-list',
    title: 'Bank Accounts',
    description:
      "Manage your organisation's bank accounts — track GL-linked balances, view transaction history, and reconcile with physical bank statements",
    path: '/banks/accounts',
    icon: CreditCard,
    requiredPermission: '',
    moduleId: 'bank',
    category: 'Banking',
    isNew: true,
  },
  {
    id: 'banks-list',
    title: 'Manage Banks',
    description:
      'Add and configure banking institutions — branch details, account manager contacts, and SWIFT/IBAN references',
    path: '/banks',
    icon: Building,
    requiredPermission: '',
    moduleId: 'bank',
    category: 'Banking',
    isNew: true,
  },
  {
    id: 'bank-transfer-new',
    title: 'New Inter-bank Transfer',
    description:
      'Initiate inter-bank transfers with dual-approval support and automatic GL journal entries (Dr destination / Cr source)',
    path: '/banks/transfers/new',
    icon: TrendingUp,
    requiredPermission: 'bank-create',
    moduleId: 'bank',
    category: 'Banking',
    isNew: true,
  },
  {
    id: 'bank-payments',
    title: 'Bank Payments',
    description:
      'Record bank payments for supplier invoices or direct expenses with traceable references',
    path: '/banks/payments',
    icon: Receipt,
    requiredPermission: '',
    moduleId: 'bank',
    category: 'Banking',
    isNew: true,
  },
  {
    id: 'bank-transfer-approvals',
    title: 'Inter-bank Transfer Approvals',
    description:
      'Review and authorise pending inter-bank transfers that require dual-approval before the GL journal is posted',
    path: '/banks/transfers/approvals',
    icon: CheckSquare,
    requiredPermission: 'bank-approve',
    moduleId: 'bank',
    category: 'Banking',
    isNew: true,
  },
  {
    id: 'bank-reconciliation',
    title: 'Bank Reconciliation',
    description:
      'Reconcile system ledger balances against uploaded bank statements, flag unmatched entries, and produce reconciliation reports',
    path: '/treasury/bank-reconciliation',
    icon: BarChart3,
    requiredPermission: '',
    moduleId: 'bank',
    category: 'Banking',
    isNew: true,
  },
  {
    id: 'bank-statement-reconciliation',
    title: 'Statement Reconciliation (Auto-Match)',
    description:
      'Upload a bank statement (CSV, Excel, or QIF) and automatically match transactions against ERP records, with an exception queue for anything unmatched',
    path: '/banks/reconciliations',
    icon: Upload,
    requiredPermission: '',
    moduleId: 'bank',
    category: 'Banking',
    isNew: true,
  },
  {
    id: 'bank-transfer-list',
    title: '💸 Bank Transfer History',
    description:
      'View all inter-bank transfers — pending, approved, completed, and rejected — with inline approve/reject actions for pending transfers.',
    path: '/banks/transfers',
    icon: Activity,
    requiredPermission: 'bank-list',
    moduleId: 'bank',
    category: 'Banking',
    isNew: true,
  },
  {
    id: 'cash-reconciliation',
    title: '🧾 Cash Reconciliation',
    description:
      'Cashier daily close — record physical denomination count by note/coin, reconcile against system balance, finance officer sign-off, and post variances to GL.',
    path: '/treasury/cash-reconciliation',
    icon: Calculator,
    requiredPermission: '',
    moduleId: 'bank',
    category: 'Banking',
    isNew: true,
  },
  {
    id: 'cashier-accounts',
    title: '💰 Cashier Accounts',
    description:
      'Manage cashier float accounts — create accounts, assign cashiers, set opening balances, and track daily cash collections.',
    path: '/treasury/cashier-accounts',
    icon: CreditCard,
    requiredPermission: '',
    moduleId: 'bank',
    category: 'Banking',
    isNew: true,
  },
  {
    id: 'cash-transfers',
    title: '🔄 Cash Transfers',
    description:
      'Record cash movements between cashier accounts and bank accounts with approval workflow and GL journal entry generation.',
    path: '/treasury/cash-transfers',
    icon: ArrowRight,
    requiredPermission: 'treasury-list',
    moduleId: 'bank',
    category: 'Banking',
    isNew: true,
  },

  // ==========================================================================
  // ACCOUNTING CATEGORY (under Financial module)
  // ==========================================================================

  {
    id: 'journal-vouchers',
    title: '📒 Journal Vouchers',
    description:
      'Create and manage manual GL journal entries with balanced debit/credit lines, approval workflow, and reversal support',
    path: '/accounting/journal-vouchers',
    icon: FileText,
    requiredPermission: 'chart-of-accounts-view',
    moduleId: 'financial',
    category: 'Accounting',
    isNew: true,
  },
  {
    id: 'create-journal-voucher',
    title: '➕ New Journal Voucher',
    description:
      'Record a new manual journal entry with account search, DR/CR lines, and automatic balance validation before posting to the GL',
    path: '/accounting/journal-vouchers/create',
    icon: Plus,
    requiredPermission: 'chart-of-accounts-view',
    moduleId: 'financial',
    category: 'Accounting',
    isNew: true,
  },
  {
    id: 'period-management',
    title: '📅 Accounting Period Management',
    description:
      'Close, reopen, or reclose accounting periods for month-end and year-end processing. View all open and closed periods with status badges and full audit trail.',
    path: '/accounting/periods',
    icon: Calendar,
    requiredPermission: 'chart-of-accounts-view',
    moduleId: 'financial',
    category: 'Accounting',
    isNew: true,
  },

  // ==========================================================================
  // BUDGETS CATEGORY (under Financial module)
  // ==========================================================================

  {
    id: 'budget-periods-list',
    title: '📊 Budget Periods',
    description:
      'Manage budget periods — create, approve, and activate annual or project budgets. View actual vs budgeted spending with variance analysis by department and account type.',
    path: '/budgets/periods',
    icon: BarChart3,
    requiredPermission: '',
    moduleId: 'financial',
    category: 'Budgets',
    isNew: true,
  },
  {
    id: 'budget-period-create',
    title: '➕ New Budget Period',
    description:
      'Create a new budget period with date range, then add budget line allocations per GL account. Activate after approval to enable real-time budget enforcement and variance tracking.',
    path: '/budgets/periods/new',
    icon: Plus,
    requiredPermission: '',
    moduleId: 'financial',
    category: 'Budgets',
    isNew: true,
  },

  // ----- Accounts Payable Category -----
  {
    id: 'payables-list',
    title: '📋 Accounts Payable',
    description:
      'View and manage all vendor payables — unpaid invoices, payment schedules, and outstanding balances across all suppliers.',
    path: '/liabilities/payables',
    icon: FileText,
    requiredPermission: 'payable-list',
    moduleId: 'accounts-payable',
    category: 'Accounts Payable',
    isNew: true,
  },
  {
    id: 'payable-create',
    title: '➕ Create Payable',
    description:
      'Record a new vendor payable — vendor invoice entry with GL account coding, due date, and payment terms for outstanding obligations.',
    path: '/liabilities/payables/new',
    icon: Plus,
    requiredPermission: 'payable-create',
    moduleId: 'accounts-payable',
    category: 'Accounts Payable',
    isNew: true,
  },
  {
    id: 'payable-matching',
    title: '🔗 3-Way Matching Dashboard',
    description:
      'Match vendor invoices to purchase orders and goods receipts — identify discrepancies and approve payables for payment processing.',
    path: '/liabilities/matching',
    icon: CheckCircle,
    requiredPermission: 'payable-list',
    moduleId: 'accounts-payable',
    category: 'Accounts Payable',
    isNew: true,
  },
  {
    id: 'vendor-ap-aging',
    title: '📅 AP Aging Report',
    description:
      'Analyze outstanding payables by age bucket (0–30, 31–60, 61–90, 90+ days) to prioritize payments and manage cash flow effectively.',
    path: '/liabilities/vendors',
    icon: TrendingDown,
    requiredPermission: 'payable-list',
    moduleId: 'accounts-payable',
    category: 'Accounts Payable',
    isNew: true,
  },

  // ==========================================================================
  // CLIENT SERVICES MODULE
  // ==========================================================================

  // ----- Client Management Category -----
  {
    id: 'clients-page',
    title: 'Client Management',
    description: 'Borrower and savings account holder overview and management',
    path: '/clients',
    icon: Users,
    requiredPermission: 'clients-view',
    moduleId: 'client-services',
    category: 'Client Management',
    isEnhanced: true,
  },
  {
    id: 'client-create-page',
    title: 'Register New Client',
    description: 'Enroll a new borrower or savings account holder with full KYC',
    path: '/clients/create',
    icon: UserPlus,
    requiredPermission: 'clients-create',
    moduleId: 'client-services',
    category: 'Client Management',
    isNew: true,
  },
  {
    id: 'client-groups-page',
    title: '👥 Client Groups',
    description:
      'Create and manage savings groups; view member lists, group balances, and contribution status',
    path: '/clients/groups',
    icon: Users,
    requiredPermission: 'clients-view',
    moduleId: 'client-services',
    category: 'Client Management',
    isNew: true,
  },
  {
    id: 'prospect-list',
    title: '🔍 Prospects',
    description:
      'View and manage potential clients in the pipeline — follow up, convert to clients, or close as lost',
    path: '/prospects',
    icon: Target,
    requiredPermission: 'clients-view',
    moduleId: 'client-services',
    category: 'Client Management',
    isNew: true,
  },
  {
    id: 'prospect-public-registration',
    title: '🌐 Prospect Registration',
    description:
      'Register a new prospect or self-service onboarding form. Prospects are created without fee collection and converted later.',
    path: '/prospects/register',
    icon: Globe,
    requiredPermission: 'clients-view',
    moduleId: 'client-services',
    category: 'Client Management',
    isNew: true,
  },
  {
    id: 'client-reactivate',
    title: '🔄 Re-activate Account',
    description: 'Re-activate a dormant or suspended client account with approval workflow',
    path: '/clients/reactivate',
    icon: RotateCcw,
    requiredPermission: 'clients-edit',
    moduleId: 'client-services',
    category: 'Client Management',
    isNew: true,
  },
  {
    id: 'client-classifications-page',
    title: 'Client Classifications',
    description: 'Client risk tiers, segments, and classification management',
    path: '/clients/classifications',
    icon: Building,
    requiredPermission: 'client-classifications-view',
    moduleId: 'client-services',
    category: 'Client Management',
    isNew: true,
  },
  {
    id: 'client-registration-config',
    title: '⚙️ Registration Fee Config',
    description:
      'Configure per-branch registration fee and ID card fee by client type, including linked income GL accounts.',
    path: '/clients/registration-config',
    icon: Settings,
    requiredPermission: 'clients-edit',
    moduleId: 'client-services',
    category: 'Client Management',
    isNew: true,
  },

  // ==========================================================================
  // ADMINISTRATION MODULE
  // ==========================================================================

  // ----- Admin Management Category -----
  {
    id: 'branch-management',
    title: 'Branch Management',
    description: 'Complete branch management with CRUD operations',
    path: '/admin/branches',
    icon: Building,
    requiredPermission: 'branches-view',
    moduleId: 'administration',
    category: 'Admin Management',
    isNew: true,
  },
  {
    id: 'user-management',
    title: 'User Management',
    description: 'Manage users, roles, and permissions',
    path: '/admin/users',
    icon: Users,
    requiredPermission: 'staff-users-view',
    moduleId: 'administration',
    category: 'Admin Management',
  },
  {
    id: 'permission-setup',
    title: 'Permission Setup',
    description: 'Set view, create, edit, approve, and export permissions per role',
    path: '/admin/permission-setup',
    icon: Shield,
    requiredPermission: 'staff-users-view',
    moduleId: 'administration',
    category: 'Admin Management',
    isNew: true,
  },

  // ----- HR & Payroll Category -----
  {
    id: 'staff-management',
    title: 'Staff Management',
    description: 'Complete staff directory with CRUD operations',
    path: '/hr/staff',
    icon: Users,
    requiredPermission: 'staff-view',
    moduleId: 'administration',
    category: 'HR & Payroll',
    isNew: true,
  },
  {
    id: 'staff-create',
    title: 'Create/Edit Staff',
    description: 'Staff member creation and editing with department tracking',
    path: '/hr/staff/create',
    icon: UserPlus,
    requiredPermission: 'staff-create',
    moduleId: 'administration',
    category: 'HR & Payroll',
    isNew: true,
  },
  {
    id: 'staff-pay-components',
    title: 'Staff Pay Components',
    description: 'Manage individual staff member salary components and allowances',
    path: '/hr/staff',
    icon: DollarIcon,
    requiredPermission: 'staff-pay-components',
    moduleId: 'administration',
    category: 'HR & Payroll',
    isNew: true,
  },
  {
    id: 'attendance-management',
    title: 'Attendance Management',
    description: 'Daily attendance tracking with clock in/out functionality',
    path: '/hr/attendance',
    icon: CheckSquare,
    requiredPermission: 'attendance-view',
    moduleId: 'administration',
    category: 'HR & Payroll',
    isNew: true,
  },
  {
    id: 'clock-in-out',
    title: 'Clock In/Out',
    description: 'Staff clock in and clock out interface with time tracking',
    path: '/hr/attendance/clock',
    icon: Clock3,
    requiredPermission: 'attendance-clock',
    moduleId: 'administration',
    category: 'HR & Payroll',
    isNew: true,
  },
  {
    id: 'attendance-form',
    title: 'Attendance Form',
    description: 'Manual attendance entry and correction form',
    path: '/hr/attendance/create',
    icon: Plus,
    requiredPermission: 'attendance-create',
    moduleId: 'administration',
    category: 'HR & Payroll',
    isNew: true,
  },
  {
    id: 'leave-management',
    title: 'Leave Management',
    description: 'Complete leave management with approval workflow',
    path: '/hr/leave-requests',
    icon: CalendarDays,
    requiredPermission: 'leave-requests-view',
    moduleId: 'administration',
    category: 'HR & Payroll',
    isNew: true,
  },
  {
    id: 'leave-request-create',
    title: 'Create Leave Request',
    description: 'Submit new leave request with type selection and date range',
    path: '/hr/leave-requests/create',
    icon: Plus,
    requiredPermission: 'leave-requests-create',
    moduleId: 'administration',
    category: 'HR & Payroll',
    isNew: true,
  },
  {
    id: 'leave-balances',
    title: 'Leave Balances',
    description: 'View staff leave balances and entitlements by type',
    path: '/hr/leave-balances',
    icon: BarChart3,
    requiredPermission: 'leave-requests-view',
    moduleId: 'administration',
    category: 'HR & Payroll',
    isNew: true,
  },
  {
    id: 'leave-types',
    title: 'Leave Types Management',
    description: 'Configure leave types with rules and entitlements',
    path: '/hr/leave-types',
    icon: SettingsIcon,
    requiredPermission: 'leave-types-edit',
    moduleId: 'administration',
    category: 'HR & Payroll',
    isNew: true,
  },
  {
    id: 'payroll-management',
    title: 'Payroll Management',
    description: 'Complete payroll processing with calculate → approve → process workflow',
    path: '/hr/payroll',
    icon: DollarIcon,
    requiredPermission: 'payroll-view',
    moduleId: 'administration',
    category: 'HR & Payroll',
    isNew: true,
  },
  {
    id: 'payroll-create',
    title: 'Create/Process Payroll',
    description: 'Generate new payroll run with calculation and approval steps',
    path: '/hr/payroll/create',
    icon: Plus,
    requiredPermission: 'payroll-create',
    moduleId: 'administration',
    category: 'HR & Payroll',
    isNew: true,
  },
  {
    id: 'salary-components',
    title: 'Salary Components',
    description: 'Manage salary components, allowances, and deductions',
    path: '/hr/salary-components',
    icon: CalcIcon,
    requiredPermission: 'salary-component-list',
    moduleId: 'administration',
    category: 'HR & Payroll',
    isNew: true,
  },
  {
    id: 'salary-component-create',
    title: 'Create/Edit Salary Component',
    description: 'Create and configure salary components with calculation rules',
    path: '/hr/salary-components/create',
    icon: Plus,
    requiredPermission: 'salary-component-create',
    moduleId: 'administration',
    category: 'HR & Payroll',
    isNew: true,
  },
  {
    id: 'bonus-deduction-list',
    title: 'Bonus & Deduction Requests',
    description: 'Manage bonus and deduction requests',
    path: '/hr/bonus-deduction',
    icon: ListChecks,
    requiredPermission: 'bonus-deductions-view',
    moduleId: 'administration',
    category: 'HR & Payroll',
    isNew: true,
  },
  {
    id: 'bonus-deduction-create',
    title: 'Create Bonus/Deduction Request',
    description: 'Create bonus and deduction requests',
    path: '/hr/bonus-deduction/create',
    icon: Plus,
    requiredPermission: 'bonus-deductions-create',
    moduleId: 'administration',
    category: 'HR & Payroll',
    isNew: true,
  },
  {
    id: 'pay-component-removals',
    title: 'Component Removal Approvals',
    description: 'Review and approve requests to remove salary components from staff pay profiles',
    path: '/hr/bonus-deduction?tab=removals',
    icon: Trash2,
    requiredPermission: 'bonus-deductions-view',
    moduleId: 'administration',
    category: 'HR & Payroll',
    isNew: true,
  },
  {
    id: 'staff-iou-list',
    title: 'Staff IOU',
    description:
      'Manage staff cash advances recovered via fixed monthly payroll deductions (Dr Payroll Clearance / Cr Staff IOU Receivable)',
    path: '/hr/ious',
    icon: Banknote,
    requiredPermission: 'staff-iou-list',
    moduleId: 'administration',
    category: 'HR & Payroll',
    isNew: true,
  },
  {
    id: 'staff-iou-create',
    title: 'New Staff IOU',
    description: 'Create a new staff IOU / cash advance',
    path: '/hr/ious/create',
    icon: Plus,
    requiredPermission: 'staff-iou-create',
    moduleId: 'administration',
    category: 'HR & Payroll',
    isNew: true,
  },
  {
    id: 'staff-iou-bulk-debit',
    title: 'Bulk Staff Debit',
    description:
      'Charge a cost across multiple staff members in one operation — Dr Staff IOU Receivable (per staff) / Cr any account (e.g. Asset Disposal)',
    path: '/hr/ious/bulk-debit',
    icon: ArrowRightLeft,
    requiredPermission: 'staff-iou-create',
    moduleId: 'administration',
    category: 'HR & Payroll',
    isNew: true,
  },
  {
    id: 'pension-remittances',
    title: 'Pension Remittances',
    description:
      'Process pension fund remittances — employee 8% + employer 10% contributions — with automatic GL journal entries',
    path: '/hr/pension-remittances',
    icon: Shield,
    requiredPermission: '',
    moduleId: 'administration',
    category: 'HR & Payroll',
    isNew: true,
  },
  {
    id: 'hr-configuration',
    title: 'HR Configuration',
    description:
      'Configure branch HR settings — staff ID prefix, pension rates, leave policies, attendance rules, and approval workflows',
    path: '/hr/config',
    icon: SettingsIcon,
    requiredPermission: '',
    moduleId: 'administration',
    category: 'HR & Payroll',
  },
  {
    id: 'staff-excel-import',
    title: 'Staff Excel Import',
    description:
      'Bulk-import staff from a payroll Excel spreadsheet — creates employee records, salary components, and pay assignments automatically',
    path: '/hr/staff/import',
    icon: Upload,
    requiredPermission: 'staff-create',
    moduleId: 'administration',
    category: 'HR & Payroll',
    isNew: true,
  },
  {
    id: 'payroll-schedules',
    title: '📅 Payroll Schedules',
    description:
      'Define and manage payroll processing schedules — monthly, bi-weekly — assigned to payroll runs for automated timing control and compliance.',
    path: '/hr/payroll-schedules',
    icon: CalendarDays,
    requiredPermission: 'payroll-view',
    moduleId: 'administration',
    category: 'HR & Payroll',
    isNew: true,
  },
  {
    id: 'payslips',
    title: '🧾 Payslips',
    description:
      'View all payslips across all staff and pay periods with filtering by employee, pay period, and status. Download individual or bulk payslip PDFs.',
    path: '/hr/payslips',
    icon: FileText,
    requiredPermission: 'payroll-view',
    moduleId: 'administration',
    category: 'HR & Payroll',
    isNew: true,
  },
  {
    id: 'client-statements',
    title: 'Client Statements',
    description: 'View individual client financial statements, invoices and payments',
    path: '/clients/:id/statement',
    icon: FileText,
    requiredPermission: '',
    moduleId: 'client-services',
    category: 'Client Management',
    isNew: true,
  },

  // ==========================================================================
  // CLIENT SERVICES — Savings Category
  // ==========================================================================
  {
    id: 'savings-accounts-list',
    title: '🏦 Savings Accounts',
    description: 'View and manage all member savings accounts, balances, and transaction history',
    path: '/savings/accounts',
    icon: Banknote,
    requiredPermission: 'savings-accounts-view',
    moduleId: 'client-services',
    category: 'Savings',
    isNew: true,
  },
  {
    id: 'savings-account-new',
    title: '➕ New Savings Account',
    description:
      'Open a new savings account for a member with product selection and initial deposit',
    path: '/savings/accounts/create',
    icon: Plus,
    requiredPermission: 'savings-accounts-create',
    moduleId: 'client-services',
    category: 'Savings',
    isNew: true,
  },
  {
    id: 'savings-deposit',
    title: '💰 Record Savings Deposit',
    description:
      'Flexible savings deposit — search any client, pick their account, and record a payment. Works for all product types (daily, weekly, monthly, smart savings).',
    path: '/savings/deposit',
    icon: ArrowRightLeft,
    requiredPermission: 'savings-accounts-view',
    moduleId: 'client-services',
    category: 'Savings',
  },
  {
    id: 'savings-collection',
    title: '📋 Savings Collection',
    description:
      'Record bulk savings deposits from group collection sheets and individual transactions',
    path: '/savings/collection',
    icon: ClipboardList,
    requiredPermission: 'cash-collections-view',
    moduleId: 'client-services',
    category: 'Savings',
    isNew: true,
  },
  {
    id: 'savings-products',
    title: '📦 Savings Products',
    description: 'Define and manage savings product types, interest rates, and terms',
    path: '/savings/products',
    icon: Layers,
    requiredPermission: 'savings-products',
    moduleId: 'client-services',
    category: 'Savings',
    isNew: true,
  },
  {
    id: 'savings-policy',
    title: '📜 Compulsory Savings Policy',
    description:
      'Configure compulsory savings requirements, minimum balance rules, and policy settings',
    path: '/savings/policy',
    icon: Shield,
    requiredPermission: 'compulsory-savings-policies-view',
    moduleId: 'client-services',
    category: 'Savings',
    isNew: true,
  },
  {
    id: 'savings-product-config',
    title: '⚙️ Savings Product Config',
    description:
      'Configure cycle savings, first-deposit income rules, and tiered withdrawal controls per product',
    path: '/savings/products',
    icon: Settings,
    requiredPermission: 'savings-products',
    moduleId: 'client-services',
    category: 'Savings',
    isNew: true,
  },
  {
    id: 'savings-withdrawals',
    title: '💸 Withdrawal Approvals',
    description:
      'Review and approve member withdrawal requests. Configure tiered multi-approver rules.',
    path: '/savings/withdrawals',
    icon: Banknote,
    requiredPermission: 'savings-accounts-view',
    moduleId: 'client-services',
    category: 'Savings',
    isNew: true,
  },
  {
    id: 'savings-combined-receipt',
    title: '🧾 Receipt Combined',
    description:
      'Record a savings deposit and loan repayment for the same client in a single transaction',
    path: '/savings/combined-receipt',
    icon: Receipt,
    requiredPermission: 'cash-collections-view',
    moduleId: 'client-services',
    category: 'Savings',
    isNew: true,
  },
  {
    id: 'savings-group-combined',
    title: '👥 Receipt Group Combined',
    description:
      'Record savings deposits and loan repayments for all members of a group in one batch',
    path: '/savings/group-combined-receipt',
    icon: Users,
    requiredPermission: 'cash-collections-view',
    moduleId: 'client-services',
    category: 'Savings',
    isNew: true,
  },

  // ----- Savings Collection Category -----
  {
    id: 'savings-collection-sheet',
    title: '🏦 Collection Sheet',
    description:
      'Record contribution payments for a savings product — select product, pick date, mark as collected',
    path: '/savings/collection/sheet',
    icon: ClipboardList,
    requiredPermission: 'cash-collections-view',
    moduleId: 'client-services',
    category: 'Savings Collection',
    isNew: true,
  },
  {
    id: 'savings-collection-spreadsheet',
    title: '📊 Collection Spreadsheet',
    description:
      'Bulk contribution collection using a spreadsheet-style grid — enter amounts for all members at once',
    path: '/savings/collection/spreadsheet',
    icon: BarChart3,
    requiredPermission: 'cash-collections-view',
    moduleId: 'client-services',
    category: 'Savings Collection',
    isNew: true,
  },
  {
    id: 'savings-multi-day-deposit',
    title: '📋 Multi-Day Deposit',
    description:
      'Record contributions for multiple past days in a single entry — handles catch-up payments',
    path: '/savings/collection/multi-day',
    icon: Calendar,
    requiredPermission: 'cash-collections-view',
    moduleId: 'client-services',
    category: 'Savings Collection',
    isNew: true,
  },

  // ==========================================================================
  // CLIENT SERVICES — Loans Category
  // ==========================================================================
  {
    id: 'loan-accounts-list',
    title: '💳 Loan Accounts',
    description:
      'View all active and historical loan accounts with repayment status and balance tracking',
    path: '/loans/accounts',
    icon: CreditCard,
    requiredPermission: 'loan-accounts-view',
    moduleId: 'client-services',
    category: 'Loans',
    isNew: true,
  },
  {
    id: 'loan-application-new',
    title: '📝 New Loan Application',
    description:
      'Submit a new loan application for a member with loan product selection and repayment schedule',
    path: '/loans/accounts/create',
    icon: Plus,
    requiredPermission: 'loan-accounts-create',
    moduleId: 'client-services',
    category: 'Loans',
    isNew: true,
  },
  {
    id: 'loan-verification',
    title: '✅ Loan Verification',
    description: 'Review and verify pending loan applications before approval and disbursement',
    path: '/loans/verification',
    icon: CheckSquare,
    requiredPermission: 'loans-verify',
    moduleId: 'client-services',
    category: 'Loans',
    isNew: true,
  },
  {
    id: 'loan-disbursements',
    title: '💰 Loan Disbursements',
    description: 'Manage approved loan disbursements, track payment status, and process payouts',
    path: '/loans/disbursements',
    icon: DollarSign,
    requiredPermission: 'loan-disbursements-view',
    moduleId: 'client-services',
    category: 'Loans',
    isNew: true,
  },
  {
    id: 'daily-collection-sheet',
    title: '📅 Loan Collection',
    description:
      'Individual, group, and savings-debit loan repayment collection with cash and bank transfer modes',
    path: '/loans/collection',
    icon: Calendar,
    requiredPermission: 'cash-collections-view',
    moduleId: 'client-services',
    category: 'Loans',
    isNew: true,
  },
  {
    id: 'loan-repayment-approvals',
    title: '✅ Repayment Approvals',
    description:
      'Director inbox for pending savings-debit loan repayment requests requiring approval before GL posting',
    path: '/loans/repayment-approvals',
    icon: ClipboardList,
    requiredPermission: 'loan-repayment-requests-approve',
    moduleId: 'client-services',
    category: 'Loans',
    isNew: true,
  },
  {
    id: 'loan-restructure-approvals',
    title: '🔁 Restructure Approvals',
    description:
      'Director inbox for pending loan restructure proposals — approve to apply the new term/rate, reject to leave the loan untouched',
    path: '/loans/restructure-approvals',
    icon: ClipboardList,
    requiredPermission: 'loan-accounts-approve',
    moduleId: 'client-services',
    category: 'Loans',
    isNew: true,
  },
  {
    id: 'loan-products',
    title: '🏷️ Loan Products',
    description: 'Manage loan product types, interest rates, terms, fees, and eligibility criteria',
    path: '/loans/products',
    icon: Layers,
    requiredPermission: 'loan-products-list',
    moduleId: 'client-services',
    category: 'Loans',
    isNew: true,
  },

  // ----- Loan Reports Category -----
  {
    id: 'loan-debtors-report',
    title: '📋 Debtors Report',
    description:
      'Full list of clients with outstanding loan balances, broken down by product and status',
    path: '/reports/loans/debtors',
    icon: FileText,
    requiredPermission: 'loan-accounts-view',
    moduleId: 'client-services',
    category: 'Loan Reports',
    isNew: true,
  },
  {
    id: 'loan-defaulters-report',
    title: '⚠️ Defaulters Report',
    description:
      'Clients whose loans are in default — overdue balance, days past due, and assigned officer',
    path: '/reports/loans/defaulters',
    icon: AlertTriangle,
    requiredPermission: 'loan-accounts-view',
    moduleId: 'client-services',
    category: 'Loan Reports',
    isNew: true,
  },
  {
    id: 'loan-par-report',
    title: '📊 Portfolio at Risk (PAR)',
    description:
      'Portfolio at Risk ratio — defaulted outstanding balances vs total outstanding portfolio',
    path: '/reports/loans/par',
    icon: TrendingDown,
    requiredPermission: 'loan-accounts-view',
    moduleId: 'client-services',
    category: 'Loan Reports',
    isNew: true,
  },
  {
    id: 'remittance-report',
    title: '📅 Remittance Report',
    description:
      'Daily transactions report — all collections received on a given date by officer and mode',
    path: '/reports/daily-transactions',
    icon: Calendar,
    requiredPermission: 'loan-accounts-view',
    moduleId: 'client-services',
    category: 'Loan Reports',
    isNew: true,
  },
  {
    id: 'daily-summary-report',
    title: '📆 Daily Summary Report',
    description:
      'End-of-day summary: total disbursements, total collections, outstanding balance, and defaulter count',
    path: '/reports/daily-summary',
    icon: BarChart3,
    requiredPermission: 'loan-accounts-view',
    moduleId: 'client-services',
    category: 'Loan Reports',
    isNew: true,
  },
  {
    id: 'report-summary-by-date',
    title: '🗓️ Report Summary by Date',
    description:
      'Flexible date-range transaction summary — filter by branch, officer, or loan product',
    path: '/reports/summary',
    icon: Calendar,
    requiredPermission: 'loan-accounts-view',
    moduleId: 'client-services',
    category: 'Loan Reports',
    isNew: true,
  },
  {
    id: 'group-report',
    title: '👥 Group Report',
    description:
      'All client groups with member counts, cumulative savings, outstanding loans, and collection rates',
    path: '/reports/clients/groups',
    icon: Users,
    requiredPermission: 'loan-accounts-view',
    moduleId: 'client-services',
    category: 'Loan Reports',
    isNew: true,
  },

  // ==========================================================================
  {
    id: 'inventory-items-list',
    title: '📦 Item Catalog',
    description:
      'Browse and manage all inventory items, categories, units of measure, and reorder levels',
    path: '/inventory/items',
    icon: Package,
    requiredPermission: 'item-list',
    moduleId: 'inventory',
    category: 'Items',
    isNew: false,
  },
  {
    id: 'inventory-item-new',
    title: '➕ New Item',
    description:
      'Create a new inventory item with specifications, pricing, and category assignment',
    path: '/inventory/items/create',
    icon: Plus,
    requiredPermission: 'item-create',
    moduleId: 'inventory',
    category: 'Items',
  },
  {
    id: 'inventory-locations',
    title: '📍 Stock Locations',
    description: 'Manage warehouse bins, store rooms, and storage location hierarchy',
    path: '/inventory/locations',
    icon: MapPin,
    requiredPermission: 'item-list',
    moduleId: 'inventory',
    category: 'Items',
  },
  {
    id: 'inventory-categories',
    title: '🏷️ Item Categories',
    description: 'Organise inventory into categories and subcategories for reporting and budgeting',
    path: '/inventory/categories',
    icon: Tag,
    requiredPermission: 'item-list',
    moduleId: 'inventory',
    category: 'Items',
  },
  {
    id: 'inventory-movements',
    title: '🔄 Stock Movements',
    description:
      'Full audit trail of all stock movements — receipts, issues, returns, and transfers',
    path: '/inventory/movements',
    icon: ArrowRightLeft,
    requiredPermission: 'item-list',
    moduleId: 'inventory',
    category: 'Stock Control',
  },
  {
    id: 'inventory-adjustments',
    title: '✏️ Stock Adjustments',
    description:
      'Record and review quantity or value adjustments with reason codes and approval workflow',
    path: '/inventory/adjustments',
    icon: Edit,
    requiredPermission: 'item-adjust',
    moduleId: 'inventory',
    category: 'Stock Control',
    isNew: true,
  },
  {
    id: 'inventory-adjustment-new',
    title: '➕ New Adjustment',
    description: 'Create a new stock adjustment entry for quantity corrections or revaluation',
    path: '/inventory/adjustments/new',
    icon: Plus,
    requiredPermission: 'item-adjust',
    moduleId: 'inventory',
    category: 'Stock Control',
    isNew: true,
  },
  {
    id: 'inventory-transfers',
    title: '🚚 Stock Transfers',
    description:
      'Transfer inventory between locations or departments with picking and confirmation workflow',
    path: '/inventory/transfers',
    icon: Truck,
    requiredPermission: 'item-list',
    moduleId: 'inventory',
    category: 'Stock Control',
    isNew: true,
  },
  {
    id: 'inventory-transfer-new',
    title: '➕ New Transfer',
    description: 'Initiate a new inter-location stock transfer request',
    path: '/inventory/transfers/new',
    icon: Plus,
    requiredPermission: 'item-list',
    moduleId: 'inventory',
    category: 'Stock Control',
    isNew: true,
  },
  {
    id: 'inventory-material-requests',
    title: '📋 Material Requests',
    description: 'View all department material requisitions and their fulfilment status',
    path: '/inventory/material-requests',
    icon: ClipboardList,
    requiredPermission: 'item-list',
    moduleId: 'inventory',
    category: 'Requests & Issues',
    isNew: true,
  },
  {
    id: 'inventory-material-request-new',
    title: '➕ New Material Request',
    description: 'Create a department material requisition to request items from the store',
    path: '/inventory/material-requests/new',
    icon: Plus,
    requiredPermission: 'item-list',
    moduleId: 'inventory',
    category: 'Requests & Issues',
    isNew: true,
  },
  {
    id: 'inventory-writeoffs',
    title: '🗑️ Write-offs',
    description: 'Record and approve disposal or write-off of damaged, expired, or obsolete stock',
    path: '/inventory/write-offs',
    icon: Trash2,
    requiredPermission: 'item-adjust',
    moduleId: 'inventory',
    category: 'Requests & Issues',
    isNew: true,
  },
  {
    id: 'inventory-physical-counts',
    title: '🔢 Physical Counts',
    description: 'Manage stock-take sessions, record actual counts, and reconcile variances',
    path: '/inventory/physical-counts',
    icon: CheckSquare,
    requiredPermission: 'item-list',
    moduleId: 'inventory',
    category: 'Auditing',
    isNew: true,
  },
  {
    id: 'inventory-valuation-report',
    title: '📊 Stock Valuation Report',
    description:
      'Current stock value by location, category, and cost method with export capabilities',
    path: '/inventory/reports/valuation',
    icon: BarChart3,
    requiredPermission: 'item-list',
    moduleId: 'inventory',
    category: 'Auditing',
    isNew: true,
  },

  // ==========================================================================
  // PROCUREMENT MODULE
  // ==========================================================================
  {
    id: 'procurement-suppliers',
    title: '🤝 Suppliers',
    description:
      'Manage approved supplier register, contact details, payment terms, and performance ratings',
    path: '/procurement/suppliers',
    icon: Building,
    requiredPermission: 'supplier-list',
    moduleId: 'procurement',
    category: 'Suppliers',
  },
  {
    id: 'procurement-supplier-new',
    title: '➕ Add Supplier',
    description:
      'Register a new supplier with bank details, credit terms, and category classification',
    path: '/procurement/suppliers/create',
    icon: Plus,
    requiredPermission: 'supplier-create',
    moduleId: 'procurement',
    category: 'Suppliers',
  },
  {
    id: 'procurement-settings',
    title: '⚙️ Procurement Settings',
    description: 'Configure approval thresholds, procurement categories, and workflow settings',
    path: '/procurement/settings',
    icon: Settings,
    requiredPermission: 'proc-settings',
    moduleId: 'procurement',
    category: 'Suppliers',
  },
  {
    id: 'procurement-requisitions',
    title: '📋 Purchase Requisitions',
    description:
      'View all internal purchase requests from departments awaiting procurement processing',
    path: '/procurement/requisitions',
    icon: ClipboardList,
    requiredPermission: 'purchase-requisitions-view',
    moduleId: 'procurement',
    category: 'Purchasing',
  },
  {
    id: 'procurement-requisition-new',
    title: '➕ New Requisition',
    description: 'Submit a new purchase requisition with itemised requirements and justification',
    path: '/procurement/requisitions/new',
    icon: Plus,
    requiredPermission: 'purchase-requisitions-create',
    moduleId: 'procurement',
    category: 'Purchasing',
  },
  {
    id: 'procurement-orders',
    title: '🛒 Purchase Orders',
    description: 'Manage all purchase orders with supplier acknowledgement and delivery tracking',
    path: '/procurement/orders',
    icon: ShoppingCart,
    requiredPermission: 'purchase-orders-view',
    moduleId: 'procurement',
    category: 'Purchasing',
  },
  {
    id: 'procurement-order-new',
    title: '➕ New Purchase Order',
    description:
      'Raise a new purchase order against an approved requisition or directly to a supplier',
    path: '/procurement/orders/new',
    icon: Plus,
    requiredPermission: 'purchase-orders-create',
    moduleId: 'procurement',
    category: 'Purchasing',
  },
  {
    id: 'procurement-grn',
    title: '📥 Goods Received Notes',
    description:
      'Capture and confirm goods receipts, match to purchase orders, and flag discrepancies',
    path: '/procurement/grns',
    icon: Boxes,
    requiredPermission: 'grn-list',
    moduleId: 'procurement',
    category: 'Receiving',
    isNew: true,
  },
  {
    id: 'procurement-grn-new',
    title: '➕ New GRN',
    description: 'Create a new goods received note for a delivered purchase order',
    path: '/procurement/grns/new',
    icon: Plus,
    requiredPermission: 'grn-create',
    moduleId: 'procurement',
    category: 'Receiving',
    isNew: true,
  },
  {
    id: 'procurement-returns',
    title: '↩️ Purchase Returns',
    description: 'Manage supplier returns, credit note requests, and replacement processing',
    path: '/procurement/returns',
    icon: RotateCcw,
    requiredPermission: 'purchase-requisitions-view',
    moduleId: 'procurement',
    category: 'Receiving',
    isNew: true,
  },

  // ==========================================================================
  // FIXED ASSET MODULE
  // ==========================================================================
  {
    id: 'asset-register',
    title: '📋 Asset Register',
    description:
      'Complete register of all fixed assets with current book value, location, and status',
    path: '/assets',
    icon: Home,
    requiredPermission: 'asset-list',
    moduleId: 'fixed-asset',
    category: 'Asset Management',
  },
  {
    id: 'asset-register-single',
    title: '➕ Register New Asset',
    description: 'Add a new asset to the register with acquisition details and depreciation policy',
    path: '/assets/register',
    icon: Plus,
    requiredPermission: 'asset-create',
    moduleId: 'fixed-asset',
    category: 'Asset Management',
  },
  {
    id: 'asset-categories',
    title: '🏷️ Asset Categories',
    description: 'Manage asset categories with linked depreciation rates and GL account mappings',
    path: '/assets/categories',
    icon: Tag,
    requiredPermission: 'asset-list',
    moduleId: 'fixed-asset',
    category: 'Asset Management',
  },
  {
    id: 'asset-requisitions',
    title: '📋 Asset Requisitions',
    description: 'Department requests for new assets pending approval and procurement processing',
    path: '/assets/purchases',
    icon: ClipboardList,
    requiredPermission: 'asset-list',
    moduleId: 'fixed-asset',
    category: 'Acquisition',
    isNew: true,
  },
  {
    id: 'asset-requisition-new',
    title: '➕ New Asset Requisition',
    description: 'Submit a new request for asset purchase with justification and budget allocation',
    path: '/assets/purchases/new',
    icon: Plus,
    requiredPermission: 'asset-create',
    moduleId: 'fixed-asset',
    category: 'Acquisition',
    isNew: true,
  },
  {
    id: 'asset-acquisitions',
    title: '🛒 Asset Acquisitions',
    description:
      'Bulk asset acquisition records — link to purchase orders and activate asset shells',
    path: '/assets/acquisitions',
    icon: ShoppingCart,
    requiredPermission: 'asset-list',
    moduleId: 'fixed-asset',
    category: 'Acquisition',
    isNew: true,
  },
  {
    id: 'asset-acquisition-new',
    title: '➕ New Acquisition',
    description: 'Record a new asset acquisition and activate corresponding asset register entries',
    path: '/assets/acquisitions/new',
    icon: Plus,
    requiredPermission: 'asset-create',
    moduleId: 'fixed-asset',
    category: 'Acquisition',
    isNew: true,
  },
  {
    id: 'asset-maintenance',
    title: '🔧 Asset Maintenance',
    description: 'Schedule and record maintenance events, costs, and service history per asset',
    path: '/assets/maintenance',
    icon: Wrench,
    requiredPermission: 'asset-list',
    moduleId: 'fixed-asset',
    category: 'Maintenance & Depreciation',
    isNew: true,
  },
  {
    id: 'asset-maintenance-new',
    title: '➕ Log Maintenance Event',
    description: 'Log a new maintenance event with cost, service provider, and next service date',
    path: '/assets/maintenance/new',
    icon: Plus,
    requiredPermission: 'asset-create',
    moduleId: 'fixed-asset',
    category: 'Maintenance & Depreciation',
    isNew: true,
  },
  {
    id: 'asset-depreciation',
    title: '📉 Depreciation Ledger',
    description: 'View accumulated depreciation schedules and run period-end depreciation entries',
    path: '/assets/depreciation',
    icon: TrendingDown,
    requiredPermission: 'asset-list',
    moduleId: 'fixed-asset',
    category: 'Maintenance & Depreciation',
    isNew: true,
  },
  {
    id: 'asset-fuel-monitor',
    title: '⛽ Fleet Fuel Monitor',
    description: 'Track fuel receipts, consumption, mileage, and anomalies for fleet assets',
    path: '/assets/fuel-monitor',
    icon: Droplets,
    requiredPermission: 'asset-list',
    moduleId: 'fixed-asset',
    category: 'Fleet Management',
    isNew: true,
  },

  // ==========================================================================
  // PETTY CASH MODULE
  // ==========================================================================
  {
    id: 'petty-cash-funds',
    title: '💵 Petty Cash Funds',
    description: 'Manage petty cash fund balances, custodians, and fund limits per department',
    path: '/treasury/petty-cash',
    icon: Wallet,
    requiredPermission: 'bank-accounts-view',
    moduleId: 'petty-cash',
    category: 'Funds',
  },
  {
    id: 'petty-cash-fund-new',
    title: '➕ New Fund',
    description: 'Create a new petty cash fund and assign a custodian with approved cash limit',
    path: '/treasury/petty-cash/funds/new',
    icon: Plus,
    requiredPermission: 'bank-payments-create',
    moduleId: 'petty-cash',
    category: 'Funds',
  },
  {
    id: 'petty-cash-vouchers',
    title: '🧾 Petty Cash Vouchers',
    description: 'View all petty cash expense vouchers with approval status and GL coding',
    path: '/treasury/petty-cash/vouchers',
    icon: Receipt,
    requiredPermission: 'bank-accounts-view',
    moduleId: 'petty-cash',
    category: 'Vouchers',
  },
  {
    id: 'petty-cash-voucher-new',
    title: '➕ New Voucher',
    description: 'Create a petty cash expense voucher with description, amount, and GL account',
    path: '/treasury/petty-cash/vouchers/new',
    icon: Plus,
    requiredPermission: 'bank-payments-create',
    moduleId: 'petty-cash',
    category: 'Vouchers',
  },
  {
    id: 'petty-cash-replenishments',
    title: '🔄 Replenishments',
    description: 'Request and approve fund replenishments to top up petty cash balances',
    path: '/treasury/petty-cash/replenishments',
    icon: RotateCcw,
    requiredPermission: 'bank-accounts-view',
    moduleId: 'petty-cash',
    category: 'Vouchers',
  },
  {
    id: 'petty-cash-replenishment-new',
    title: '➕ New Replenishment',
    description: 'Submit a replenishment request with supporting vouchers and approval workflow',
    path: '/treasury/petty-cash/replenishments/new',
    icon: Plus,
    requiredPermission: 'bank-payments-create',
    moduleId: 'petty-cash',
    category: 'Vouchers',
  },

  // ==========================================================================
  // SAVINGS MODULE (standalone landing page)
  // ==========================================================================
  {
    id: 'savings-mod-accounts',
    title: '🏦 Savings Accounts',
    description: 'View and manage all member savings accounts, balances, and transaction history',
    path: '/savings/accounts',
    icon: Banknote,
    requiredPermission: 'savings-accounts-view',
    moduleId: 'savings',
    category: 'Accounts',
    isNew: true,
  },
  {
    id: 'savings-mod-account-new',
    title: '➕ New Savings Account',
    description:
      'Open a new savings account for a member with product selection and initial deposit',
    path: '/savings/accounts/create',
    icon: Plus,
    requiredPermission: 'savings-accounts-create',
    moduleId: 'savings',
    category: 'Accounts',
    isNew: true,
  },
  {
    id: 'savings-mod-deposit',
    title: '💰 Record Savings Deposit',
    description:
      'Flexible deposit — search client, pick account, record payment for any savings product type.',
    path: '/savings/deposit',
    icon: ArrowRightLeft,
    requiredPermission: 'savings-accounts-view',
    moduleId: 'savings',
    category: 'Transactions',
    isNew: true,
  },
  {
    id: 'savings-mod-collection',
    title: '📋 Receipt Savings',
    description: 'Record savings deposits — individual or from a group collection sheet',
    path: '/savings/collection',
    icon: ClipboardList,
    requiredPermission: 'cash-collections-view',
    moduleId: 'savings',
    category: 'Transactions',
    isNew: true,
  },
  {
    id: 'savings-mod-withdrawals',
    title: '💸 Savings Withdrawal',
    description: 'Process member withdrawal requests with tiered approval workflow',
    path: '/savings/withdrawals',
    icon: Banknote,
    requiredPermission: 'savings-accounts-view',
    moduleId: 'savings',
    category: 'Transactions',
    isNew: true,
  },
  {
    id: 'savings-mod-combined',
    title: '🧾 Receipt Combined',
    description:
      'Record a savings deposit and loan repayment for the same client in one transaction',
    path: '/savings/combined-receipt',
    icon: Receipt,
    requiredPermission: 'cash-collections-view',
    moduleId: 'savings',
    category: 'Transactions',
    isNew: true,
  },
  {
    id: 'savings-mod-group-combined',
    title: '👥 Receipt Group Combined',
    description: 'Record savings deposits and loan repayments for all group members in one batch',
    path: '/savings/group-combined-receipt',
    icon: Users,
    requiredPermission: 'cash-collections-view',
    moduleId: 'savings',
    category: 'Transactions',
    isNew: true,
  },

  // ----- Savings Reports -----
  {
    id: 'savings-product-report',
    title: '📈 Savings by Product',
    description:
      'Portfolio health report per savings product — balance totals, account counts, active/dormant breakdown',
    path: '/reports/savings-by-product',
    icon: BarChart3,
    requiredPermission: 'savings-accounts-view',
    moduleId: 'savings',
    category: 'Reports',
    isNew: true,
  },
  {
    id: 'savings-mod-dc-report',
    title: '📅 Daily Contribution Report',
    description: 'Per-day collection totals and individual contribution records',
    path: '/reports/contributions/daily',
    icon: Calendar,
    requiredPermission: 'savings-accounts-view',
    moduleId: 'savings',
    category: 'Reports',
    isNew: true,
  },
  {
    id: 'savings-mod-dc-spreadsheet',
    title: '📊 Daily Contribution Spreadsheet',
    description:
      'Grid view of all client contributions across selected dates for easy reconciliation',
    path: '/reports/contributions/spreadsheet',
    icon: BarChart3,
    requiredPermission: 'savings-accounts-view',
    moduleId: 'savings',
    category: 'Reports',
    isNew: true,
  },
  {
    id: 'savings-mod-group-report',
    title: '👥 Group Savings Report',
    description: 'All savings groups with member counts, balances, and contribution performance',
    path: '/reports/clients/groups',
    icon: Users,
    requiredPermission: 'savings-accounts-view',
    moduleId: 'savings',
    category: 'Reports',
    isNew: true,
  },

  // ----- Configuration -----
  {
    id: 'savings-mod-products',
    title: '📦 Savings Products',
    description: 'Define and manage savings product types, interest rates, and terms',
    path: '/savings/products',
    icon: Layers,
    requiredPermission: 'savings-products',
    moduleId: 'savings',
    category: 'Configuration',
    isNew: true,
  },
  {
    id: 'savings-mod-policy',
    title: '📜 Compulsory Savings Policy',
    description:
      'Configure compulsory savings requirements, minimum balance rules, and policy settings',
    path: '/savings/policy',
    icon: Shield,
    requiredPermission: 'compulsory-savings-policies-view',
    moduleId: 'savings',
    category: 'Configuration',
    isNew: true,
  },

  // ==========================================================================
  // LOANS MODULE (standalone landing page — mirrors client-services entries)
  // ==========================================================================
  {
    id: 'loans-mod-accounts',
    title: '💳 Loan Accounts',
    description:
      'View all active and historical loan accounts with repayment status and balance tracking',
    path: '/loans/accounts',
    icon: CreditCard,
    requiredPermission: 'loan-accounts-view',
    moduleId: 'loans',
    category: 'Accounts',
    isNew: true,
  },
  {
    id: 'loans-mod-new',
    title: '📝 New Loan Application',
    description:
      'Submit a new loan application for a member with product selection and repayment schedule',
    path: '/loans/accounts/create',
    icon: Plus,
    requiredPermission: 'loan-accounts-create',
    moduleId: 'loans',
    category: 'Accounts',
    isNew: true,
  },
  {
    id: 'loans-mod-verification',
    title: '✅ Loan Verification',
    description: 'Review and verify pending loan applications before approval and disbursement',
    path: '/loans/verification',
    icon: CheckSquare,
    requiredPermission: 'loans-verify',
    moduleId: 'loans',
    category: 'Workflow',
    isNew: true,
  },
  {
    id: 'loans-mod-disbursements',
    title: '💰 Loan Disbursements',
    description: 'Manage approved loan disbursements, track payment status, and process payouts',
    path: '/loans/disbursements',
    icon: DollarSign,
    requiredPermission: 'loan-disbursements-view',
    moduleId: 'loans',
    category: 'Workflow',
    isNew: true,
  },
  {
    id: 'loans-mod-collection',
    title: '📅 Loan Collection',
    description:
      'Individual, group, and savings-debit repayment collection with cash and bank transfer modes',
    path: '/loans/collection',
    icon: Calendar,
    requiredPermission: 'cash-collections-view',
    moduleId: 'loans',
    category: 'Collection',
    isNew: true,
  },
  {
    id: 'loans-mod-repayment-approvals',
    title: '✅ Repayment Approvals',
    description:
      'Director inbox for pending savings-debit loan repayment requests requiring approval',
    path: '/loans/repayment-approvals',
    icon: ClipboardList,
    requiredPermission: 'loan-repayment-requests-approve',
    moduleId: 'loans',
    category: 'Collection',
    isNew: true,
  },
  {
    id: 'loans-mod-products',
    title: '🏷️ Loan Products',
    description: 'Manage loan product types, interest rates, terms, fees, and eligibility criteria',
    path: '/loans/products',
    icon: Layers,
    requiredPermission: 'loan-products-list',
    moduleId: 'loans',
    category: 'Configuration',
    isNew: true,
  },

  // ----- Loans Module Reports -----
  {
    id: 'loans-mod-debtors',
    title: '📋 Debtors Report',
    description: 'Full list of clients with outstanding loan balances by product and status',
    path: '/reports/loans/debtors',
    icon: FileText,
    requiredPermission: 'loan-accounts-view',
    moduleId: 'loans',
    category: 'Reports',
    isNew: true,
  },
  {
    id: 'loans-mod-defaulters',
    title: '⚠️ Defaulters Report',
    description: 'Clients in default — overdue balance, days past due, and assigned officer',
    path: '/reports/loans/defaulters',
    icon: AlertTriangle,
    requiredPermission: 'loan-accounts-view',
    moduleId: 'loans',
    category: 'Reports',
    isNew: true,
  },
  {
    id: 'loans-mod-par',
    title: '📊 Portfolio at Risk (PAR)',
    description: 'PAR ratio — defaulted outstanding balances vs total outstanding portfolio',
    path: '/reports/loans/par',
    icon: TrendingDown,
    requiredPermission: 'loan-accounts-view',
    moduleId: 'loans',
    category: 'Reports',
    isNew: true,
  },
  {
    id: 'loans-mod-remittance',
    title: '📅 Remittance Report',
    description: 'Daily collections report — all receipts on a given date by officer and mode',
    path: '/reports/daily-transactions',
    icon: Calendar,
    requiredPermission: 'loan-accounts-view',
    moduleId: 'loans',
    category: 'Reports',
    isNew: true,
  },
  {
    id: 'loans-mod-daily-summary',
    title: '📆 Daily Summary Report',
    description:
      'End-of-day summary: disbursements, collections, outstanding balance, defaulter count',
    path: '/reports/daily-summary',
    icon: BarChart3,
    requiredPermission: 'loan-accounts-view',
    moduleId: 'loans',
    category: 'Reports',
    isNew: true,
  },
  {
    id: 'loans-mod-summary-by-date',
    title: '🗓️ Report Summary by Date',
    description: 'Flexible date-range transaction summary — filter by branch, officer, or product',
    path: '/reports/summary',
    icon: Calendar,
    requiredPermission: 'loan-accounts-view',
    moduleId: 'loans',
    category: 'Reports',
    isNew: true,
  },
  {
    id: 'loans-mod-group-report',
    title: '👥 Group Report',
    description:
      'All client groups with member counts, cumulative savings, outstanding loans, and collection rates',
    path: '/reports/clients/groups',
    icon: Users,
    requiredPermission: 'loan-accounts-view',
    moduleId: 'loans',
    category: 'Reports',
    isNew: true,
  },

  // ----- Officer Portfolio Dashboard -----
  {
    id: 'officer-portfolio-dashboard',
    title: '📈 My Portfolio Dashboard',
    description:
      'Personal KPI summary for credit officers — active portfolio, PAR30, defaulting loans, collections this month, and PAR ageing buckets',
    path: '/reports/officer-portfolio',
    icon: Gauge,
    requiredPermission: 'loan-accounts-view',
    moduleId: 'loans',
    category: 'Reports',
    isNew: true,
  },
  {
    id: 'officer-portfolio-cs',
    title: '📈 My Portfolio Dashboard',
    description:
      'Personal KPI summary for credit officers — active portfolio, PAR30, defaulting loans, collections this month, and PAR ageing buckets',
    path: '/reports/officer-portfolio',
    icon: Gauge,
    requiredPermission: 'loan-accounts-view',
    moduleId: 'client-services',
    category: 'Loan Reports',
    isNew: true,
  },

  // ----- Portfolio & Performance Report (Track 2) -----
  {
    id: 'portfolio-performance-report',
    title: '📊 Portfolio & Performance Report',
    description:
      'Full drillable report: branch × product × officer × CBN risk-band breakdown, interest income by recognition mode, provisioning compliance snapshot, and officer scorecard trends — with CSV export',
    path: '/reports/portfolio-performance',
    icon: BarChart3,
    requiredPermission: 'loan-accounts-view',
    moduleId: 'loans',
    category: 'Reports',
    isNew: true,
  },
];

// ==========================================================================
// HELPER FUNCTIONS
// ==========================================================================

/**
 * Get all features for a specific module
 */
export const getFeaturesByModule = (moduleId: string): FeatureCard[] => {
  return FEATURE_REGISTRY.filter(f => f.moduleId === moduleId);
};

/**
 * Whether a single feature card is accessible to the user. Looks up the
 * card's `path` in ROUTE_TO_PAGE to check the live page-permission matrix
 * first (the module:page:action the card's route actually resolves to);
 * falls back to the legacy `requiredPermission` string only when the matrix
 * has no entry for that page yet (registry gap, same dual-mode principle as
 * ProtectedRoute). Previously this had two DIFFERENT, inconsistent
 * implementations (this file's getAccessibleFeatures treated an empty
 * requiredPermission as "always visible"; AllAccessPage.tsx's separate
 * inline filter treated it as "never visible") — this is the single shared
 * source both now use.
 */
export const isFeatureAccessible = (
  feature: FeatureCard,
  hasPermission: (perm: string) => boolean,
  selectedRole?: string
): boolean => {
  if (getRoleRank(selectedRole) >= 4) return true; // Director/Principal bypass

  const mapping = ROUTE_TO_PAGE[feature.path];
  if (mapping) {
    const verdict = permissionService.resolvePageAccess(mapping.module, mapping.page, mapping.action);
    if (verdict !== 'unknown') return verdict === 'allow';
    // 'unknown' — no matrix entry yet, fall through to the legacy check.
  }
  return !!feature.requiredPermission && hasPermission(feature.requiredPermission);
};

/**
 * Get accessible features for a module based on user permissions.
 * Director and Principal bypass all permission checks.
 */
export const getAccessibleFeatures = (
  moduleId: string,
  hasPermission: (perm: string) => boolean,
  selectedRole?: string
): FeatureCard[] => {
  return FEATURE_REGISTRY.filter(
    f => f.moduleId === moduleId && isFeatureAccessible(f, hasPermission, selectedRole)
  );
};

/**
 * Get features grouped by category for a module.
 * Pass selectedRole to grant Director/Principal full access.
 */
export const getFeaturesGroupedByCategory = (
  moduleId: string,
  hasPermission: (perm: string) => boolean,
  selectedRole?: string
): Record<string, FeatureCard[]> => {
  const accessible = getAccessibleFeatures(moduleId, hasPermission, selectedRole);

  return accessible.reduce(
    (acc, feature) => {
      if (!acc[feature.category]) {
        acc[feature.category] = [];
      }
      acc[feature.category].push(feature);
      return acc;
    },
    {} as Record<string, FeatureCard[]>
  );
};

/**
 * Check if a user has access to any feature in a module
 */
export const hasModuleAccess = (
  moduleId: string,
  hasPermission: (perm: string) => boolean,
  selectedRole?: string
): boolean => {
  return FEATURE_REGISTRY.some(
    f => f.moduleId === moduleId && isFeatureAccessible(f, hasPermission, selectedRole)
  );
};

/**
 * Get all unique categories for a module
 */
export const getModuleCategories = (moduleId: string): string[] => {
  const categories = FEATURE_REGISTRY.filter(f => f.moduleId === moduleId).map(f => f.category);

  return [...new Set(categories)].sort();
};

export default FEATURE_REGISTRY;
