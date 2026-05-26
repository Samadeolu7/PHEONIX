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

export interface FeatureCard {
  id: string;
  title: string;
  description: string;
  path: string;
  icon: any;
  requiredPermission: string;
  moduleId: 'financial' | 'client-services' | 'operations' | 'administration' | 'all-access'; // Add 'all-access'
  category: string;
  isNew?: boolean;
  isEnhanced?: boolean;
  isDeprecated?: boolean;
}

export const FEATURE_REGISTRY: FeatureCard[] = [
  // ==========================================================================
  // FINANCIAL MODULE - Complete from FinancialManagementModule.tsx
  // ==========================================================================

  // ----- Invoicing Category -----
  // {
  //   id: 'create-fee-invoice',
  //   title: 'Create Fee Invoice',
  //   description: 'Create invoices for fees, tuition, and other academic charges',
  //   path: '/fee/invoices/create',
  //   icon: FileText,
  //   moduleId: 'financial',
  //   category: 'Invoicing',
  //   requiredPermission: 'invoice-create',
  //   // isActive: true,
  //   // order: 1,
  // },
  // {
  //   id: 'create-inventory-invoice',
  //   title: 'Create Inventory Invoice',
  //   description: 'Create invoices for inventory items, products, and stock sales',
  //   path: '/sales/invoices/create-inventory',
  //   icon: Package,
  //   moduleId: 'financial',
  //   category: 'Invoicing',
  //   requiredPermission: 'invoice-create',
  //   // isActive: true,
  //   // order: 2,
  // },
  {
    id: 'create-unified-invoice',
    title: 'Create Unified Invoice',
    description: 'Create comprehensive invoices with fees, inventory, and custom items',
    path: '/invoices/create',
    icon: Layers,
    moduleId: 'financial',
    category: 'Invoicing',
    requiredPermission: 'invoice-create',
    // isActive: true,
    // order: 3,
  },

  {
    id: 'invoices-list-enhanced',
    title: '📋 Invoices List',
    description:
      'Complete invoice management with status badges, payment progress indicators, filtering, and integrated payment recording',
    path: '/sales/invoices',
    icon: FileText,
    requiredPermission: 'invoice-list',
    moduleId: 'financial',
    category: 'Invoicing',
    isNew: true,
  },
  {
    id: 'credit-notes-standalone',
    title: '🧾 Credit Notes',
    description:
      'Browse and manage all credit notes across invoices — apply to customer accounts, cancel, or reverse with full GL journal entry support',
    path: '/sales/credit-notes',
    icon: CreditCard,
    requiredPermission: 'credit-note-list',
    moduleId: 'financial',
    category: 'Invoicing',
    isEnhanced: true,
  },

  // ----- Receivables Category -----
  {
    id: 'receivables-list',
    title: '📝 All Receivables List',
    description:
      'Unified view of all receivables with aging buckets, collection assignment, bulk operations, and comprehensive filtering',
    path: '/receivables/list',
    icon: Receipt,
    requiredPermission: 'receivables-list',
    moduleId: 'financial',
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
    moduleId: 'financial',
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
    moduleId: 'financial',
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
    moduleId: 'financial',
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
    moduleId: 'financial',
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
    moduleId: 'financial',
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
    moduleId: 'financial',
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
    requiredPermission: 'report-advanced',
    moduleId: 'financial',
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
    moduleId: 'financial',
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
    moduleId: 'financial',
    category: 'Receivables',
    isNew: true,
  },

  // ----- Fee Structures Category -----
  {
    id: 'fee-structures-list',
    title: '⚙️ Fee Structures List',
    description:
      'Display all fee structures with filtering, create/edit/deactivate actions, usage statistics, and industry config',
    path: '/incomes/fee-structures',
    icon: Settings,
    requiredPermission: 'fee-structure-list',
    moduleId: 'financial',
    category: 'Fee Structures',
    isNew: true,
  },
  {
    id: 'fee-structure-form',
    title: '📝 Fee Structure Form',
    description:
      'Comprehensive fee structure creation with industry-specific configurations, access rules, and recurring billing',
    path: '/incomes/fee-structures/create',
    icon: Plus,
    requiredPermission: 'fee-structure-create',
    moduleId: 'financial',
    category: 'Fee Structures',
    isNew: true,
  },
  {
    id: 'bulk-invoice-wizard',
    title: '🎯 Bulk Invoice Wizard',
    description:
      'Multi-step wizard for bulk invoice generation with fee structure selection, client filtering, and preview confirmation',
    path: '/demo/bulk-invoice-wizard',
    icon: FileText,
    requiredPermission: 'invoice-bulk-create',
    moduleId: 'financial',
    category: 'Fee Structures',
    isNew: true,
  },
  {
    id: 'bulk-invoice-results',
    title: '📊 Bulk Invoice Results',
    description:
      'Bulk generation results with success/error summary, individual invoice review, and bulk send functionality',
    path: '/bulk-invoice-results',
    icon: BarChart3,
    requiredPermission: 'invoice-bulk-view',
    moduleId: 'financial',
    category: 'Fee Structures',
    isNew: true,
  },

  // ----- Entitlements Category -----
  {
    id: 'entitlements-list',
    title: '🎓 Entitlements List',
    description:
      'Client entitlements with payment status, access level visualizations, and entitlement management actions',
    path: '/incomes/entitlements',
    icon: GraduationCap,
    requiredPermission: 'entitlement-list',
    moduleId: 'financial',
    category: 'Entitlements',
    isNew: true,
  },
  {
    id: 'entitlement-detail',
    title: '🔍 Entitlement Detail View',
    description:
      'Complete entitlement information with payment progress, access matrix, and access level change history',
    path: '/incomes/entitlements/1/view',
    icon: Eye,
    requiredPermission: 'entitlement-view-detail',
    moduleId: 'financial',
    category: 'Entitlements',
    isNew: true,
  },
  {
    id: 'entitlement-dashboard',
    title: '🎯 Entitlement Dashboard',
    description:
      'Client-facing entitlement dashboard with payment status, access levels, quick payment, and service access matrix',
    path: '/incomes/entitlements/dashboard',
    icon: Target,
    requiredPermission: 'entitlement-dashboard',
    moduleId: 'financial',
    category: 'Entitlements',
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
    requiredPermission: 'accounts-view',
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
    requiredPermission: 'accounts-view',
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
    requiredPermission: 'trial-balance-view',
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
    requiredPermission: 'pl-view',
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
    requiredPermission: 'balance-sheet-view',
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
    moduleId: 'financial',
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
    moduleId: 'financial',
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
    requiredPermission: '',
    moduleId: 'financial',
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
    moduleId: 'financial',
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
    requiredPermission: '',
    moduleId: 'financial',
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
    moduleId: 'financial',
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
    requiredPermission: '',
    moduleId: 'financial',
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
    moduleId: 'financial',
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
    moduleId: 'financial',
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
    requiredPermission: '',
    moduleId: 'financial',
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
    requiredPermission: 'accounts-view',
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
    requiredPermission: 'accounts-view',
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
    requiredPermission: 'accounts-view',
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
    moduleId: 'financial',
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
    moduleId: 'financial',
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
    moduleId: 'financial',
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
    moduleId: 'financial',
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
    requiredPermission: 'client-list',
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
    requiredPermission: 'client-create',
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
    requiredPermission: 'classification-list',
    moduleId: 'client-services',
    category: 'Client Management',
    isNew: true,
  },

  // ----- Service Access Category -----
  {
    id: 'entitlements-page',
    title: '🔑 Service Access',
    description:
      'Manage client entitlements, product access levels, and service eligibility criteria',
    path: '/incomes/entitlements',
    icon: Key,
    requiredPermission: 'entitlement-list',
    moduleId: 'client-services',
    category: 'Service Access',
    isNew: true,
  },
  {
    id: 'access-control-page',
    title: '🔐 Access Control Checker',
    description:
      'Validate client service eligibility in real-time, check payment requirements, and upgrade access levels',
    path: '/demo/access-control',
    icon: CheckSquare,
    requiredPermission: 'access-control-check',
    moduleId: 'client-services',
    category: 'Service Access',
    isNew: true,
  },

  // ==========================================================================
  // OPERATIONS MODULE - Complete from OperationsModule.tsx
  // ==========================================================================

  // ----- Procurement Category -----
  {
    id: 'po-list-enhanced',
    title: 'Purchase Orders List',
    description: 'Enhanced purchase order management with filtering and search',
    path: '/procurement/orders',
    icon: ShoppingCart,
    requiredPermission: 'po-list',
    moduleId: 'operations',
    category: 'Procurement',
    isEnhanced: true,
  },
  {
    id: 'po-create',
    title: 'Create Purchase Order',
    description: 'New purchase order creation form with item selection',
    path: '/procurement/orders/create',
    icon: ShoppingCart,
    requiredPermission: 'po-create',
    moduleId: 'operations',
    category: 'Procurement',
    isNew: true,
  },
  {
    id: 'pr-list',
    title: 'Purchase Requisitions',
    description: 'Complete requisition management system with approval workflow',
    path: '/procurement/requisitions',
    icon: FileText,
    requiredPermission: 'pr-list',
    moduleId: 'operations',
    category: 'Procurement',
    isNew: true,
  },
  {
    id: 'pr-create',
    title: 'Create Requisition',
    description: 'Multi-line requisition form with budget tracking',
    path: '/procurement/requisitions/create',
    icon: FileText,
    requiredPermission: 'pr-create',
    moduleId: 'operations',
    category: 'Procurement',
    isNew: true,
  },
  {
    id: 'grn-list',
    title: 'Goods Received Notes (GRN)',
    description: 'GRN management with quality inspection and posting',
    path: '/procurement/grn',
    icon: Package,
    requiredPermission: 'grn-list',
    moduleId: 'operations',
    category: 'Procurement',
    isNew: true,
  },
  {
    id: 'grn-create',
    title: 'Create GRN',
    description: 'Goods receipt recording with delivery information',
    path: '/procurement/grn/create',
    icon: Package,
    requiredPermission: 'grn-create',
    moduleId: 'operations',
    category: 'Procurement',
    isNew: true,
  },
  {
    id: 'returns-list',
    title: 'Purchase Returns',
    description: 'Return management with credit note tracking and status workflow',
    path: '/procurement/returns',
    icon: RotateCcw,
    requiredPermission: 'return-list',
    moduleId: 'operations',
    category: 'Procurement',
    isNew: true,
  },
  {
    id: 'return-create',
    title: 'Create Return',
    description: 'Return creation with reason categorization and refund methods',
    path: '/procurement/returns/create',
    icon: RotateCcw,
    requiredPermission: 'return-create',
    moduleId: 'operations',
    category: 'Procurement',
    isNew: true,
  },
  {
    id: 'suppliers-list-enhanced',
    title: 'Suppliers Management',
    description: 'Enhanced supplier management with contact tracking and performance',
    path: '/procurement/suppliers',
    icon: Users,
    requiredPermission: 'supplier-list',
    moduleId: 'operations',
    category: 'Procurement',
    isEnhanced: true,
  },
  {
    id: 'supplier-create',
    title: 'Create/Edit Supplier',
    description: 'Supplier creation and editing with contact and payment terms',
    path: '/procurement/suppliers/create',
    icon: Users,
    requiredPermission: 'supplier-create',
    moduleId: 'operations',
    category: 'Procurement',
    isNew: true,
  },

  // ----- Inventory Category -----
  {
    id: 'inventory-items-list',
    title: 'Inventory Items List',
    description: 'Comprehensive item catalog with search, filtering, and bulk operations',
    path: '/inventory/items',
    icon: Package,
    requiredPermission: 'item-list',
    moduleId: 'operations',
    category: 'Inventory',
    isNew: true,
  },
  {
    id: 'inventory-ledgers',
    title: 'Inventory Ledgers',
    description:
      'Per-item ledger showing all stock movements, cost analysis, and linked transactions. Open any item and click "View Ledger".',
    path: '/inventory/items',
    icon: TrendingUp,
    requiredPermission: 'item-list',
    moduleId: 'operations',
    category: 'Inventory',
    isNew: true,
  },
  {
    id: 'material-requests',
    title: 'Material Requests',
    description: 'Create and manage material requests for service-linked inventory consumption',
    path: '/inventory/material-requests',
    icon: Boxes,
    requiredPermission: '',
    moduleId: 'operations',
    category: 'Inventory',
    isNew: true,
  },
  {
    id: 'office-use-requests',
    title: 'Office Use Requests',
    description:
      'Request inventory items for internal office use — issues stock and posts an expense journal entry automatically',
    path: '/inventory/office-use-requests',
    icon: ClipboardList,
    requiredPermission: '',
    moduleId: 'operations',
    category: 'Inventory',
    isNew: true,
  },
  {
    id: 'office-use-request-create',
    title: 'New Office Use Request',
    description:
      'Create a new office use request selecting items, expense account, and delivery location',
    path: '/inventory/office-use-requests/create',
    icon: Package,
    requiredPermission: '',
    moduleId: 'operations',
    category: 'Inventory',
    isNew: true,
  },
  {
    id: 'item-create',
    title: 'Create/Edit Item',
    description: 'Full item management form with pricing, tracking, and accounting integration',
    path: '/inventory/items/create',
    icon: Package,
    requiredPermission: 'item-create',
    moduleId: 'operations',
    category: 'Inventory',
    isNew: true,
  },
  {
    id: 'stock-movements',
    title: 'Stock Movements',
    description: 'Complete movement history with filtering by type, date, and location',
    path: '/inventory/movements',
    icon: TrendingUp,
    requiredPermission: 'movement-list',
    moduleId: 'operations',
    category: 'Inventory',
    isNew: true,
  },
  {
    id: 'stock-adjustments',
    title: 'Stock Adjustments',
    description: 'Create stock adjustments with proper documentation and reason codes',
    path: '/inventory/adjustments/create',
    icon: CheckSquare,
    requiredPermission: 'adjustment-create',
    moduleId: 'operations',
    category: 'Inventory',
    isNew: true,
  },
  {
    id: 'stock-transfers',
    title: 'Stock Transfers',
    description: 'Transfer inventory between locations with tracking and documentation',
    path: '/inventory/transfers/create',
    icon: Truck,
    requiredPermission: 'transfer-create',
    moduleId: 'operations',
    category: 'Inventory',
    isNew: true,
  },
  {
    id: 'inventory-locations',
    title: 'Inventory Locations',
    description: 'Storage location management with types and address tracking',
    path: '/inventory/locations',
    icon: Building,
    requiredPermission: 'location-list',
    moduleId: 'operations',
    category: 'Inventory',
    isNew: true,
  },
  {
    id: 'stock-valuation',
    title: '📊 Stock Valuation Report',
    description:
      'View the current valuation of all inventory items by cost method — FIFO, weighted average, or standard cost — with category and location breakdowns.',
    path: '/inventory/reports/valuation',
    icon: BarChart3,
    requiredPermission: '',
    moduleId: 'operations',
    category: 'Inventory',
    isNew: true,
  },
  {
    id: 'inventory-write-offs',
    title: '🗑️ Inventory Write-offs',
    description:
      'Record and manage inventory write-offs due to damage, expiry, or loss. Creates journal entries debiting loss account and crediting stock.',
    path: '/inventory/write-offs',
    icon: Trash2,
    requiredPermission: 'write-off-list',
    moduleId: 'operations',
    category: 'Inventory',
    isNew: true,
  },
  {
    id: 'inventory-write-off-create',
    title: '➕ New Write-off',
    description:
      'Create a new inventory write-off entry with item selection, quantity, reason, and automatic GL posting to loss/expense accounts.',
    path: '/inventory/write-offs/new',
    icon: Plus,
    requiredPermission: 'write-off-create',
    moduleId: 'operations',
    category: 'Inventory',
    isNew: true,
  },
  {
    id: 'physical-count-list',
    title: '🔢 Physical Count Sessions',
    description:
      'Manage physical inventory count sessions — create count sheets, record actual quantities, compare to system quantities, and post variances.',
    path: '/inventory/physical-counts',
    icon: ClipboardList,
    requiredPermission: 'physical-count-list',
    moduleId: 'operations',
    category: 'Inventory',
    isNew: true,
  },
  {
    id: 'physical-count-create',
    title: '➕ New Physical Count',
    description:
      'Start a new physical inventory count session for a location or item category. Assign counters and generate count sheets automatically.',
    path: '/inventory/physical-counts/new',
    icon: Plus,
    requiredPermission: 'physical-count-create',
    moduleId: 'operations',
    category: 'Inventory',
    isNew: true,
  },

  // ----- Resource Consumption Category -----
  {
    id: 'resource-consumption-list',
    title: '📊 Resource Consumption List',
    description: 'View and manage all resource consumption records with filtering and search',
    path: '/expenses/resource-consumption',
    icon: BarChart3,
    requiredPermission: 'consumption-list',
    moduleId: 'operations',
    category: 'Resource Consumption',
    isNew: true,
  },
  {
    id: 'fuel-log-form',
    title: '⛽ Log Fuel Receipt',
    description:
      'Simple form to record who received fuel, how many litres, and current odometer — no voucher needed',
    path: '/expenses/fuel-log/create',
    icon: Droplets,
    requiredPermission: 'consumption-create',
    moduleId: 'operations',
    category: 'Resource Consumption',
    isNew: true,
  },
  {
    id: 'resource-consumption-form',
    title: '📝 Resource Consumption Form',
    description: 'Advanced form for prepaid-voucher and complex resource consumption records',
    path: '/expenses/resource-consumption/create',
    icon: Plus,
    requiredPermission: 'consumption-create',
    moduleId: 'operations',
    category: 'Resource Consumption',
    isDeprecated: true,
  },
  {
    id: 'irregularities-dashboard',
    title: '⚠️ Irregularities Dashboard',
    description: 'Monitor and manage resource consumption irregularities and exceptions',
    path: '/expenses/resource-consumption/irregularities',
    icon: AlertTriangle,
    requiredPermission: 'irregularities-view',
    moduleId: 'operations',
    category: 'Resource Consumption',
    isNew: true,
  },
  {
    id: 'approval-queue',
    title: '✅ Approval Queue',
    description: 'Review and approve pending resource consumption records',
    path: '/expenses/resource-consumption/approval-queue',
    icon: CheckSquare,
    requiredPermission: 'consumption-approve',
    moduleId: 'operations',
    category: 'Resource Consumption',
    isNew: true,
  },
  {
    id: 'posting-queue',
    title: '📋 Posting Queue',
    description: 'Manage the posting of approved resource consumption to accounting',
    path: '/expenses/resource-consumption/posting-queue',
    icon: FileText,
    requiredPermission: 'consumption-post',
    moduleId: 'operations',
    category: 'Resource Consumption',
    isNew: true,
  },

  // ----- Voucher Management Category -----
  {
    id: 'voucher-list',
    title: '🎫 Voucher List',
    description: 'Manage prepaid vouchers with balance tracking and expiry monitoring',
    path: '/expenses/vouchers',
    icon: CreditCard,
    requiredPermission: 'voucher-list',
    moduleId: 'operations',
    category: 'Voucher Management',
    isNew: true,
  },
  {
    id: 'voucher-form',
    title: '➕ Voucher Form',
    description: 'Create and edit prepaid vouchers with allocation and beneficiary settings',
    path: '/expenses/vouchers/create',
    icon: Plus,
    requiredPermission: 'voucher-create',
    moduleId: 'operations',
    category: 'Voucher Management',
    isNew: true,
  },
  {
    id: 'expiring-vouchers',
    title: '⏰ Expiring Vouchers Dashboard',
    description: 'Monitor vouchers approaching expiry with renewal and notification management',
    path: '/expenses/vouchers/expiring',
    icon: Clock,
    requiredPermission: 'voucher-expiring-view',
    moduleId: 'operations',
    category: 'Voucher Management',
    isNew: true,
  },

  // ----- Prepaid Expenses Category -----
  {
    id: 'prepaid-list',
    title: '💰 Prepaid Expenses List',
    description: 'Manage prepaid expenses with amortization schedules and tracking',
    path: '/expenses/prepaid',
    icon: Calendar,
    requiredPermission: 'prepaid-list',
    moduleId: 'operations',
    category: 'Prepaid Expenses',
    isNew: true,
  },
  {
    id: 'prepaid-create',
    title: '➕ Create Prepaid Expense',
    description: 'Create new prepaid expenses with amortization rules and allocation',
    path: '/expenses/prepaid/create',
    icon: Plus,
    requiredPermission: 'prepaid-create',
    moduleId: 'operations',
    category: 'Prepaid Expenses',
    isNew: true,
  },
  {
    id: 'prepaid-amortize',
    title: '📊 Amortize Prepaid Expense',
    description: 'Process and manage amortization entries for prepaid expenses',
    path: '/expenses/prepaid/1/amortize',
    icon: Calculator,
    requiredPermission: 'prepaid-amortize',
    moduleId: 'operations',
    category: 'Prepaid Expenses',
    isNew: true,
  },

  // ----- Fixed Asset Management Category -----
  {
    id: 'asset-register',
    title: '🏗️ Fixed Asset Register',
    description:
      'View and manage all fixed assets — vehicles, computers, generators, printers, furniture and more with full depreciation tracking',
    path: '/assets',
    icon: Package,
    requiredPermission: '',
    moduleId: 'operations',
    category: 'Fixed Asset Management',
    isNew: true,
  },
  {
    id: 'asset-register-create',
    title: '➕ Register Single Asset',
    description:
      'Register a single fixed asset — computer, vehicle, generator, printer, furniture — with depreciation settings and photo upload',
    path: '/assets/register',
    icon: Plus,
    requiredPermission: '',
    moduleId: 'operations',
    category: 'Fixed Asset Management',
    isNew: true,
  },
  {
    id: 'asset-bulk-acquisition',
    title: '📦 Bulk Asset Acquisition',
    description:
      'Purchase multiple asset types from one supplier under a single PO — automatically creates Fixed Assets, Accounts Payable, and GL journal entries',
    path: '/assets/acquisitions/new',
    icon: ShoppingCart,
    requiredPermission: '',
    moduleId: 'operations',
    category: 'Fixed Asset Management',
    isNew: true,
  },
  {
    id: 'asset-requisitions',
    title: '📋 Asset Requisitions',
    description:
      'Request assets for purchase and track approval status — approved requisitions convert to a Purchase for Finance to process',
    path: '/assets/requisitions',
    icon: ClipboardList,
    requiredPermission: '',
    moduleId: 'operations',
    category: 'Fixed Asset Management',
    isNew: true,
  },
  {
    id: 'asset-requisition-new',
    title: '✏️ New Asset Requisition',
    description:
      'Submit a new request for one or more assets — specify category, quantity, and estimated cost for manager approval',
    path: '/assets/requisitions/new',
    icon: Plus,
    requiredPermission: '',
    moduleId: 'operations',
    category: 'Fixed Asset Management',
    isNew: true,
  },
  {
    id: 'asset-acquisitions-list',
    title: '🧾 Asset Purchase',
    description:
      'View all bulk asset purchases — draft and posted purchases with supplier, PO, AP, and GL journal links',
    path: '/assets/acquisitions',
    icon: ShoppingCart,
    requiredPermission: '',
    moduleId: 'operations',
    category: 'Fixed Asset Management',
    isNew: true,
  },
  {
    id: 'asset-acquisition-approvals',
    title: '✅ Asset Acquisition Approvals',
    description:
      'Review and approve submitted bulk asset purchase acquisitions — approve to unlock posting which creates PO, AP, GL entries and activates Fixed Assets',
    path: '/approvals/pending',
    icon: CheckCircle,
    requiredPermission: '',
    moduleId: 'operations',
    category: 'Fixed Asset Management',
    isNew: true,
  },
  {
    id: 'asset-categories',
    title: '🗂️ Asset Categories',
    description:
      'Manage fixed asset category GL account mappings — asset account, accumulated depreciation, depreciation expense, and maintenance expense accounts',
    path: '/assets/categories',
    icon: Layers,
    requiredPermission: '',
    moduleId: 'operations',
    category: 'Fixed Asset Management',
    isNew: true,
  },
  {
    id: 'fleet-fuel-monitor',
    title: '⛽ Fleet Fuel Monitor',
    description:
      'Monitor vehicle fuel efficiency (km/litre), odometer readings, anomaly alerts, and staff fuel allocations',
    path: '/assets/fuel-monitor',
    icon: Gauge,
    requiredPermission: '',
    moduleId: 'operations',
    category: 'Fixed Asset Management',
    isNew: true,
  },
  {
    id: 'record-fuel-consumption',
    title: '📝 Record Fuel Fill-up',
    description:
      'Record vehicle or staff fuel consumption with odometer reading, quantity, cost, and prepaid/postpaid flow',
    path: '/expenses/resource-consumption/create',
    icon: Activity,
    requiredPermission: 'consumption-create',
    moduleId: 'operations',
    category: 'Fixed Asset Management',
    isNew: true,
  },
  {
    id: 'fuel-irregularities',
    title: '⚠️ Fuel Anomaly Dashboard',
    description:
      'Review flagged fuel consumption irregularities — theft suspicion, odometer rollback, impossible efficiency rates',
    path: '/expenses/resource-consumption/irregularities',
    icon: AlertTriangle,
    requiredPermission: 'irregularities-view',
    moduleId: 'operations',
    category: 'Fixed Asset Management',
    isNew: true,
  },
  {
    id: 'utility-bills',
    title: '💡 Utility Bills (Electricity, Water, Gas)',
    description:
      'Record monthly NEPA/electricity, water and gas bills with GL posting — bills not tied to a specific asset',
    path: '/expenses/resource-consumption/create?type=utility',
    icon: Activity,
    requiredPermission: 'consumption-create',
    moduleId: 'operations',
    category: 'Fixed Asset Management',
    isNew: true,
  },
  {
    id: 'asset-maintenance',
    title: '🔧 Asset Maintenance',
    description:
      'Record and track maintenance events for all fixed assets — schedule upcoming services, post costs to GL, and view full maintenance history',
    path: '/assets/maintenance',
    icon: Wrench,
    requiredPermission: '',
    moduleId: 'operations',
    category: 'Fixed Asset Management',
    isNew: true,
  },
  {
    id: 'asset-maintenance-new',
    title: '➕ Log Asset Maintenance',
    description:
      'Record a maintenance event for a specific asset with cost, service details, and optional GL posting',
    path: '/assets/maintenance/new',
    icon: Plus,
    requiredPermission: '',
    moduleId: 'operations',
    category: 'Fixed Asset Management',
    isNew: true,
  },
  {
    id: 'asset-depreciation',
    title: '📉 Depreciation Ledger',
    description:
      'View all depreciation entries, post unposted entries to the GL, and run batch depreciation for the current period',
    path: '/assets/depreciation',
    icon: TrendingDown,
    requiredPermission: '',
    moduleId: 'operations',
    category: 'Fixed Asset Management',
    isNew: true,
  },
  {
    id: 'asset-disposal',
    title: '🗑️ Asset Disposal',
    description:
      'Dispose of a fixed asset by sale, scrapping, donation, or write-off — generates the full clearing-account journal (Dr Asset Disposal A/c, Cr Fixed Asset) and records any gain or loss to P&L automatically',
    path: '/assets',
    icon: Package,
    requiredPermission: '',
    moduleId: 'operations',
    category: 'Fixed Asset Management',
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
    requiredPermission: 'branch-list',
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
    requiredPermission: 'user-list',
    moduleId: 'administration',
    category: 'Admin Management',
  },

  // ----- HR & Payroll Category -----
  {
    id: 'staff-management',
    title: 'Staff Management',
    description: 'Complete staff directory with CRUD operations',
    path: '/hr/staff',
    icon: Users,
    requiredPermission: 'staff-list',
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
    requiredPermission: 'attendance-list',
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
    requiredPermission: 'leave-list',
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
    requiredPermission: 'leave-create',
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
    requiredPermission: 'leave-balances-view',
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
    requiredPermission: 'leave-types-manage',
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
    requiredPermission: 'payroll-list',
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
    requiredPermission: 'bonus-deduction-list',
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
    requiredPermission: 'bonus-deduction-create',
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
    requiredPermission: 'bonus-deduction-list',
    moduleId: 'administration',
    category: 'HR & Payroll',
    isNew: true,
  },
  {
    id: 'staff-iou-list',
    title: 'Staff IOU',
    description: 'Manage staff cash advances recovered via fixed monthly payroll deductions (Dr Payroll Clearance / Cr Staff IOU Receivable)',
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
    description: 'Charge a cost across multiple staff members in one operation — Dr Staff IOU Receivable (per staff) / Cr any account (e.g. Asset Disposal)',
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
    requiredPermission: 'payroll-list',
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
    requiredPermission: 'payroll-list',
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
 * Get accessible features for a module based on user permissions.
 * Director and Principal bypass all permission checks.
 */
export const getAccessibleFeatures = (
  moduleId: string,
  hasPermission: (perm: string) => boolean,
  selectedRole?: string
): FeatureCard[] => {
  const SUPERUSER_ROLES = ['Director', 'Principal'];
  const isSuperUser = selectedRole ? SUPERUSER_ROLES.includes(selectedRole) : false;

  return FEATURE_REGISTRY.filter(
    f =>
      f.moduleId === moduleId &&
      (isSuperUser || !f.requiredPermission || hasPermission(f.requiredPermission))
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
  hasPermission: (perm: string) => boolean
): boolean => {
  return FEATURE_REGISTRY.some(f => f.moduleId === moduleId && hasPermission(f.requiredPermission));
};

/**
 * Get all unique categories for a module
 */
export const getModuleCategories = (moduleId: string): string[] => {
  const categories = FEATURE_REGISTRY.filter(f => f.moduleId === moduleId).map(f => f.category);

  return [...new Set(categories)].sort();
};

export default FEATURE_REGISTRY;
