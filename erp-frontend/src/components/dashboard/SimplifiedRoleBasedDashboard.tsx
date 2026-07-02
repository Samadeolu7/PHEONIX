// src/components/dashboard/SimplifiedRoleBasedDashboard.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { usePermission } from '@/hooks/usePermissions';
import { BRAND } from '../../constants/brand';
import { ThreadWidget } from '../threads/ThreadWidget';
import {
  Clock,
  User,
  AlertTriangle,
  CheckCircle,
  DollarSign,
  Users,
  Package,
  FileText,
  ShoppingCart,
  BarChart3,
  CreditCard,
  Activity,
  Grid,
  ArrowRight,
  TrendingUp,
  ChevronRight,
  Menu,
  X,
  Settings,
  Home,
  Wallet,
  Building,
  Banknote,
  CalendarDays,
  CheckSquare,
  ClipboardList,
  Layers,
} from 'lucide-react';
import { getRoleSidebarButtons, NAV_CONFIG_ROLES } from '../../config/roleSidebarConfig';
import { getRoleRank } from '../../types/roles';
import RenderedSidebarButton from './RenderedSidebarButton';
import { permissionService } from '@/services/permissionService';
import {
  dashboardStatsService,
  MicrofinanceDashboardStats,
  formatNaira,
  formatPercent,
} from '../../services/dashboardStatsService';

// Module definitions with their required permissions
const MODULES = [
  {
    id: 'financial',
    title: 'Financial Management',
    description: 'Accounting, budgets, and financial reporting',
    icon: DollarSign,
    path: '/financial-management',
    color: 'blue',
    requiredPermissions: ['accounts-view'],
  },
  {
    id: 'client-services',
    title: 'Client Services',
    description: 'Client records and member management',
    icon: Users,
    path: '/client-services',
    color: 'green',
    requiredPermissions: ['clients-view', 'client-list'],
  },
  {
    id: 'savings',
    title: 'Savings',
    description: 'Member savings accounts, products, and collections',
    icon: Banknote,
    path: '/savings',
    color: 'emerald',
    requiredPermissions: ['savings-accounts-view', 'savings-accounts-create'],
  },
  {
    id: 'loans',
    title: 'Loans',
    description: 'Loan applications, disbursements, and repayments',
    icon: CreditCard,
    path: '/loans',
    color: 'indigo',
    requiredPermissions: ['loan-accounts-view', 'loan-accounts-create'],
  },
  {
    id: 'receivable',
    title: 'Receivables',
    description: 'Collections, invoicing, and payment tracking',
    icon: TrendingUp,
    path: '/receivable',
    color: 'amber',
    requiredPermissions: ['receivables-list', 'invoice-list'],
  },
  {
    id: 'bank',
    title: 'Bank & Cash',
    description: 'Bank accounts, payments, reconciliation, and cashiers',
    icon: Building,
    path: '/bank',
    color: 'teal',
    requiredPermissions: [],
  },
  {
    id: 'accounts-payable',
    title: 'Accounts Payable',
    description: 'Vendor payables, matching, and AP aging',
    icon: FileText,
    path: '/accounts-payable',
    color: 'rose',
    requiredPermissions: ['payable-list'],
  },
  {
    id: 'procurement',
    title: 'Procurement',
    description: 'Suppliers, purchase orders, and goods receipts',
    icon: ShoppingCart,
    path: '/procurement',
    color: 'purple',
    requiredPermissions: ['po-list', 'pr-list'],
  },
  {
    id: 'inventory',
    title: 'Inventory',
    description: 'Stock control, movements, and item catalog',
    icon: Package,
    path: '/inventory',
    color: 'orange',
    requiredPermissions: ['item-list'],
  },
  {
    id: 'fixed-asset',
    title: 'Fixed Assets',
    description: 'Asset register, depreciation, maintenance, and fleet',
    icon: Home,
    path: '/fixed-asset',
    color: 'slate',
    requiredPermissions: ['asset-list'],
  },
  {
    id: 'petty-cash',
    title: 'Petty Cash',
    description: 'Petty cash funds, vouchers, and replenishments',
    icon: Wallet,
    path: '/petty-cash',
    color: 'yellow',
    requiredPermissions: ['treasury-list'],
  },
  {
    id: 'administration',
    title: 'Administration',
    description: 'HR, payroll, and system administration',
    icon: Settings,
    path: '/administration',
    color: 'gray',
    requiredPermissions: ['staff-list', 'branch-list', 'payroll-list'],
  },
  {
    id: 'all-access',
    title: 'All Access',
    description: 'Search and access every feature available to your role',
    icon: Grid,
    path: '/all-access',
    color: 'navy',
    requiredPermissions: [],
  },
];

// Color mappings for module cards - KTIL brand-aligned
const COLOR_STYLES = {
  blue: {
    light: 'rgba(10,24,87,0.06)',
    medium: BRAND.colors.navyPrimary,
    gradient: `linear-gradient(135deg, ${BRAND.colors.navyDark}, ${BRAND.colors.navyLight})`,
    border: 'rgba(10,24,87,0.18)',
  },
  green: {
    light: '#10b98112',
    medium: '#059669',
    gradient: 'linear-gradient(135deg, #065f46, #059669)',
    border: '#10b98130',
  },
  emerald: {
    light: '#34d39912',
    medium: '#10b981',
    gradient: 'linear-gradient(135deg, #047857, #10b981)',
    border: '#34d39930',
  },
  indigo: {
    light: '#6366f112',
    medium: '#4f46e5',
    gradient: 'linear-gradient(135deg, #3730a3, #6366f1)',
    border: '#6366f130',
  },
  amber: {
    light: '#f59e0b12',
    medium: '#d97706',
    gradient: 'linear-gradient(135deg, #92400e, #d97706)',
    border: '#f59e0b30',
  },
  purple: {
    light: '#7c3aed12',
    medium: '#7c3aed',
    gradient: 'linear-gradient(135deg, #5b21b6, #7c3aed)',
    border: '#7c3aed30',
  },
  orange: {
    light: `rgba(183,151,88,0.10)`,
    medium: BRAND.colors.gold,
    gradient: `linear-gradient(135deg, ${BRAND.colors.goldDark}, ${BRAND.colors.gold})`,
    border: `${BRAND.colors.gold}40`,
  },
  rose: {
    light: '#f4366312',
    medium: '#e11d48',
    gradient: 'linear-gradient(135deg, #9f1239, #e11d48)',
    border: '#f4366330',
  },
  slate: {
    light: '#64748b12',
    medium: '#475569',
    gradient: 'linear-gradient(135deg, #1e293b, #475569)',
    border: '#64748b30',
  },
  yellow: {
    light: '#eab30812',
    medium: '#ca8a04',
    gradient: 'linear-gradient(135deg, #78350f, #ca8a04)',
    border: '#eab30830',
  },
  gray: {
    light: `rgba(183,151,88,0.12)`,
    medium: BRAND.colors.goldDark,
    gradient: `linear-gradient(135deg, ${BRAND.colors.navyDark} 0%, ${BRAND.colors.goldDark} 100%)`,
    border: `rgba(183,151,88,0.40)`,
  },
  navy: {
    light: 'rgba(10,24,87,0.08)',
    medium: BRAND.colors.navyPrimary,
    gradient: `linear-gradient(135deg, ${BRAND.colors.navyDark} 0%, ${BRAND.colors.navyPrimary} 100%)`,
    border: 'rgba(10,24,87,0.30)',
  },
  teal: {
    light: '#0d948812',
    medium: '#0d9488',
    gradient: 'linear-gradient(135deg, #0f766e, #14b8a6)',
    border: '#14b8a630',
  },
};

// Build role-specific KPI cards from live API stats.
// Each role sees the metrics most relevant to them.
function buildStatsCards(role: string, s: MicrofinanceDashboardStats) {
  switch (role) {
    case 'Director':
      return [
        {
          id: 'active-loans',
          title: 'Active Loans',
          value: s.active_loans.toLocaleString(),
          icon: CreditCard,
          color: 'green' as const,
        },
        {
          id: 'loan-book',
          title: 'Loan Book',
          value: formatNaira(s.total_loan_book),
          icon: DollarSign,
          color: 'blue' as const,
        },
        {
          id: 'pending-approvals',
          title: 'Pending Approvals',
          value: String(s.pending_approvals),
          icon: Clock,
          color: 'yellow' as const,
        },
        {
          id: 'overdue-loans',
          title: 'Overdue Loans',
          value: s.overdue_loans.toLocaleString(),
          icon: AlertTriangle,
          color: 'red' as const,
        },
      ];

    case 'Principal':
      return [
        {
          id: 'active-clients',
          title: 'Active Clients',
          value: s.active_clients.toLocaleString(),
          icon: Users,
          color: 'green' as const,
        },
        {
          id: 'repayment-rate',
          title: 'Repayment Rate',
          value: formatPercent(s.loan_repayment_rate),
          icon: Activity,
          color: 'blue' as const,
        },
        {
          id: 'total-staff',
          title: 'Total Staff',
          value: String(s.total_staff),
          icon: Users,
          color: 'purple' as const,
        },
        {
          id: 'pending-approvals',
          title: 'Pending Approvals',
          value: String(s.pending_approvals),
          icon: Clock,
          color: 'yellow' as const,
        },
      ];

    case 'Finance Officer':
    case 'Accountant':
      return [
        {
          id: 'total-invoiced',
          title: 'Total Invoiced',
          value: formatNaira(s.total_invoiced),
          icon: FileText,
          color: 'blue' as const,
        },
        {
          id: 'total-collected',
          title: 'Total Collected',
          value: formatNaira(s.total_collected),
          icon: DollarSign,
          color: 'green' as const,
        },
        {
          id: 'outstanding',
          title: 'Outstanding Fees',
          value: formatNaira(s.outstanding_fees),
          icon: Activity,
          color: 'red' as const,
        },
        {
          id: 'overdue-count',
          title: 'Overdue Invoices',
          value: String(s.overdue_invoice_count),
          icon: AlertTriangle,
          color: 'yellow' as const,
        },
      ];

    case 'HR Officer':
    case 'HR Manager':
      return [
        {
          id: 'total-staff',
          title: 'Total Staff',
          value: String(s.total_staff),
          icon: Users,
          color: 'blue' as const,
        },
        {
          id: 'on-leave',
          title: 'On Leave Today',
          value: String(s.staff_on_leave_today),
          icon: Clock,
          color: 'yellow' as const,
        },
        {
          id: 'leave-requests',
          title: 'Pending Leave Requests',
          value: String(s.pending_leave_requests),
          icon: FileText,
          color: 'purple' as const,
        },
        {
          id: 'payroll-net',
          title: 'Last Net Payroll',
          value: formatNaira(s.last_payroll_net_pay),
          icon: DollarSign,
          color: 'green' as const,
        },
      ];

    case 'Procurement Officer':
    case 'Store Officer':
      return [
        {
          id: 'pending-pr',
          title: 'Pending Requisitions',
          value: String(s.pending_requisitions),
          icon: ShoppingCart,
          color: 'blue' as const,
        },
        {
          id: 'pending-po',
          title: 'Pending Purchase Orders',
          value: String(s.pending_purchase_orders),
          icon: Package,
          color: 'purple' as const,
        },
        {
          id: 'pending-approvals',
          title: 'Pending Approvals',
          value: String(s.pending_approvals),
          icon: Clock,
          color: 'yellow' as const,
        },
        {
          id: 'pending-tickets',
          title: 'Open Tickets',
          value: String(s.pending_tickets),
          icon: AlertTriangle,
          color: 'red' as const,
        },
      ];

    case 'Registrar':
      return [
        {
          id: 'total-clients',
          title: 'Total Clients',
          value: s.total_clients.toLocaleString(),
          icon: Users,
          color: 'green' as const,
        },
        {
          id: 'active-clients',
          title: 'Active Clients',
          value: s.active_clients.toLocaleString(),
          icon: CheckCircle,
          color: 'blue' as const,
        },
        {
          id: 'new-clients',
          title: 'New This Month',
          value: String(s.new_clients_this_month),
          icon: Users,
          color: 'purple' as const,
        },
        {
          id: 'pending-tickets',
          title: 'Open Tickets',
          value: String(s.pending_tickets),
          icon: Clock,
          color: 'yellow' as const,
        },
      ];

    case 'Credit Officer':
    case 'Loan Officer':
    case 'Field Officer':
      return [
        {
          id: 'loan-book',
          title: 'My Loan Portfolio',
          value: formatNaira(s.total_loan_book),
          icon: DollarSign,
          color: 'green' as const,
        },
        {
          id: 'par30',
          title: 'PAR30',
          value: s.par30_ratio != null ? `${s.par30_ratio.toFixed(2)}%` : '—',
          icon: AlertTriangle,
          color: (s.par30_ratio ?? 0) > 5 ? ('red' as const) : ('yellow' as const),
        },
        {
          id: 'collections',
          title: 'Collections (Month)',
          value: formatNaira(s.collections_this_month ?? '0'),
          icon: Activity,
          color: 'blue' as const,
        },
        {
          id: 'cash-balance',
          title:
            s.cashier_balance != null && parseFloat(s.cashier_balance) !== 0
              ? '⚠ Cash Balance'
              : 'Cash Balance',
          value: s.cashier_balance != null ? formatNaira(s.cashier_balance) : '—',
          icon: Wallet,
          color:
            s.cashier_balance != null && parseFloat(s.cashier_balance) !== 0
              ? ('red' as const)
              : ('green' as const),
        },
      ];

    default: // Officer / general
      return [
        {
          id: 'loan-book',
          title: 'Loan Portfolio',
          value: formatNaira(s.total_loan_book),
          icon: CreditCard,
          color: 'green' as const,
        },
        {
          id: 'overdue-loans',
          title: 'Overdue Loans',
          value: s.overdue_loans.toLocaleString(),
          icon: AlertTriangle,
          color: s.overdue_loans > 0 ? ('red' as const) : ('green' as const),
        },
        {
          id: 'collections',
          title: 'Collections (Month)',
          value: formatNaira(s.collections_this_month ?? '0'),
          icon: Activity,
          color: 'blue' as const,
        },
        {
          id: 'cash-balance',
          title:
            s.cashier_balance != null && parseFloat(s.cashier_balance) !== 0
              ? '⚠ Cash Balance'
              : 'Cash Balance',
          value: s.cashier_balance != null ? formatNaira(s.cashier_balance) : '—',
          icon: Wallet,
          color:
            s.cashier_balance != null && parseFloat(s.cashier_balance) !== 0
              ? ('red' as const)
              : ('green' as const),
        },
      ];
  }
}

// Quick actions that appear based on permissions
const QUICK_ACTIONS = [
  {
    id: 'create-invoice',
    title: 'Create Invoice',
    icon: FileText,
    path: '/invoices/create',
    permission: 'invoice-create',
  },
  {
    id: 'create-po',
    title: 'Create PO',
    icon: ShoppingCart,
    path: '/procurement/orders/create',
    permission: 'po-create',
  },
  {
    id: 'record-payment',
    title: 'Record Payment',
    icon: CreditCard,
    path: '/receivables/payments/record',
    permission: 'invoice-record-payment',
  },
  {
    id: 'new-staff',
    title: 'Add Staff',
    icon: Users,
    path: '/hr/staff/create',
    permission: 'staff-create',
  },
  {
    id: 'view-reports',
    title: 'View Reports',
    icon: BarChart3,
    path: '/reports',
    permission: 'reports-view',
  },
  {
    id: 'approvals',
    title: 'Approvals',
    icon: CheckCircle,
    path: '/approvals',
    permission: 'approvals-view',
  },
];

// Role-specific quick actions for officer-level users — focused on daily field tasks
const OFFICER_QUICK_ACTIONS: Record<
  string,
  { id: string; title: string; icon: typeof CreditCard; path: string }[]
> = {
  'Credit Officer': [
    {
      id: 'loan-collection',
      title: 'Loan Collection',
      icon: CreditCard,
      path: '/loans/collection',
    },
    { id: 'savings-deposit', title: 'Savings Deposit', icon: Banknote, path: '/savings/deposit' },
    { id: 'new-client', title: 'New Client', icon: Users, path: '/clients/create' },
    { id: 'new-loan', title: 'New Loan', icon: DollarSign, path: '/loans/accounts/create' },
    {
      id: 'my-portfolio',
      title: 'My Portfolio',
      icon: BarChart3,
      path: '/reports/officer-portfolio',
    },
    {
      id: 'defaulters',
      title: 'Defaulters',
      icon: AlertTriangle,
      path: '/reports/loans/defaulters',
    },
  ],
  'Loan Officer': [
    {
      id: 'loan-collection',
      title: 'Loan Collection',
      icon: CreditCard,
      path: '/loans/collection',
    },
    { id: 'savings-deposit', title: 'Savings Deposit', icon: Banknote, path: '/savings/deposit' },
    { id: 'new-client', title: 'New Client', icon: Users, path: '/clients/create' },
    { id: 'new-loan', title: 'New Loan', icon: DollarSign, path: '/loans/accounts/create' },
    {
      id: 'my-portfolio',
      title: 'My Portfolio',
      icon: BarChart3,
      path: '/reports/officer-portfolio',
    },
    {
      id: 'defaulters',
      title: 'Defaulters',
      icon: AlertTriangle,
      path: '/reports/loans/defaulters',
    },
  ],
  'Field Officer': [
    {
      id: 'loan-collection',
      title: 'Loan Collection',
      icon: CreditCard,
      path: '/loans/collection',
    },
    { id: 'savings-deposit', title: 'Savings Deposit', icon: Banknote, path: '/savings/deposit' },
    { id: 'new-client', title: 'New Client', icon: Users, path: '/clients/create' },
    {
      id: 'my-portfolio',
      title: 'My Portfolio',
      icon: BarChart3,
      path: '/reports/officer-portfolio',
    },
    {
      id: 'defaulters',
      title: 'Defaulters',
      icon: AlertTriangle,
      path: '/reports/loans/defaulters',
    },
  ],
  'Finance Officer': [
    {
      id: 'journal-entry',
      title: 'Journal Entry',
      icon: FileText,
      path: '/accounting/journal-vouchers/create',
    },
    {
      id: 'trial-balance',
      title: 'Trial Balance',
      icon: BarChart3,
      path: '/reports/financial/trial-balance',
    },
    { id: 'bank-accounts', title: 'Bank Accounts', icon: Building, path: '/banks/accounts' },
    {
      id: 'cash-reconcil',
      title: 'Cash Reconciliation',
      icon: CheckCircle,
      path: '/treasury/cash-reconciliation',
    },
  ],
  Accountant: [
    {
      id: 'journal-entry',
      title: 'Journal Entry',
      icon: FileText,
      path: '/accounting/journal-vouchers/create',
    },
    {
      id: 'trial-balance',
      title: 'Trial Balance',
      icon: BarChart3,
      path: '/reports/financial/trial-balance',
    },
    { id: 'chart-of-accounts', title: 'Chart of Accounts', icon: Layers, path: '/accounts' },
    {
      id: 'cash-reconcil',
      title: 'Cash Reconciliation',
      icon: CheckCircle,
      path: '/treasury/cash-reconciliation',
    },
  ],
  'HR Officer': [
    { id: 'attendance', title: 'Attendance', icon: CheckSquare, path: '/hr/attendance' },
    {
      id: 'leave-requests',
      title: 'Leave Requests',
      icon: CalendarDays,
      path: '/hr/leave-requests',
    },
    { id: 'staff-list', title: 'Staff List', icon: Users, path: '/hr/staff' },
    { id: 'payroll', title: 'Payroll', icon: DollarSign, path: '/hr/payroll' },
  ],
  'HR Manager': [
    { id: 'attendance', title: 'Attendance', icon: CheckSquare, path: '/hr/attendance' },
    {
      id: 'leave-requests',
      title: 'Leave Requests',
      icon: CalendarDays,
      path: '/hr/leave-requests',
    },
    { id: 'staff-list', title: 'Staff List', icon: Users, path: '/hr/staff' },
    { id: 'payroll', title: 'Payroll', icon: DollarSign, path: '/hr/payroll' },
  ],
  'Procurement Officer': [
    {
      id: 'requisitions',
      title: 'Requisitions',
      icon: ClipboardList,
      path: '/procurement/requisitions',
    },
    {
      id: 'purchase-orders',
      title: 'Purchase Orders',
      icon: ShoppingCart,
      path: '/procurement/orders',
    },
    { id: 'grns', title: 'Goods Received', icon: Package, path: '/procurement/grns' },
    { id: 'suppliers', title: 'Suppliers', icon: Building, path: '/procurement/suppliers' },
  ],
  'Store Officer': [
    { id: 'items', title: 'Item Catalog', icon: Package, path: '/inventory/items' },
    { id: 'movements', title: 'Stock Movements', icon: Activity, path: '/inventory/movements' },
    {
      id: 'material-requests',
      title: 'Material Requests',
      icon: ClipboardList,
      path: '/inventory/material-requests',
    },
    { id: 'adjustments', title: 'Adjustments', icon: CheckSquare, path: '/inventory/adjustments' },
  ],
};

/**
 * Returns the explicit module IDs this role is allowed to see.
 * null = no restriction (super user shows all).
 * This prevents lower roles from seeing irrelevant modules like Procurement,
 * Fixed Assets, Petty Cash, Administration, etc.
 */
function getAllowedModuleIds(role: string): string[] | null {
  switch (role) {
    case 'Credit Officer':
    case 'Loan Officer':
    case 'Field Officer':
    case 'Officer':
      return ['client-services', 'loans', 'savings', 'bank', 'all-access'];
    case 'Finance Officer':
    case 'Accountant':
      return ['financial', 'bank', 'accounts-payable', 'all-access'];
    case 'HR Officer':
    case 'HR Manager':
      return ['administration', 'all-access'];
    case 'Procurement Officer':
      return ['procurement', 'inventory', 'accounts-payable', 'all-access'];
    case 'Store Officer':
      return ['inventory', 'procurement', 'all-access'];
    case 'Registrar':
      return ['client-services', 'savings', 'all-access'];
    default:
      return null; // Directors, Principals, Administrators — unrestricted
  }
}

interface SimplifiedRoleBasedDashboardProps {
  className?: string;
}

export const SimplifiedRoleBasedDashboard: React.FC<SimplifiedRoleBasedDashboardProps> = ({
  className = '',
}) => {
  useEffect(() => {
    permissionService.debugPermissions();
  }, []);

  const { user, selectedRole } = useAuth();
  const navigate = useNavigate();
  const { hasPermission, permissions } = usePermission();

  const [loading, setLoading] = useState(true);
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);
  const [schoolStats, setSchoolStats] = useState<MicrofinanceDashboardStats | null>(null);

  // Wait for permissions to be available
  useEffect(() => {
    if (permissions.length > 0 || permissionService.getPermissions().length > 0) {
      setPermissionsLoaded(true);
    } else {
      const timer = setTimeout(() => setPermissionsLoaded(true), 500);
      return () => clearTimeout(timer);
    }
  }, [permissions]);

  // Fetch microfinance KPI stats from the analytics API
  useEffect(() => {
    let cancelled = false;
    dashboardStatsService.getStats().then(data => {
      if (!cancelled) {
        setSchoolStats(data);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const effectiveRole = selectedRole || 'Officer';

  // Slide-over navigation panel
  const [navOpen, setNavOpen] = useState(false);
  const canConfigNav = NAV_CONFIG_ROLES.includes(effectiveRole);
  const roleSidebarButtons = getRoleSidebarButtons(effectiveRole);

  // Build role-specific KPI cards from live data (fall back to zeros while loading)
  const emptyStats: MicrofinanceDashboardStats = {
    total_clients: 0,
    active_clients: 0,
    new_clients_this_month: 0,
    active_loans: 0,
    total_loan_book: '0.00',
    total_disbursed_this_month: '0.00',
    overdue_loans: 0,
    loan_repayment_rate: 0,
    total_invoiced: '0.00',
    total_collected: '0.00',
    outstanding_fees: '0.00',
    overdue_invoice_count: 0,
    total_outstanding_receivables: '0.00',
    total_savings: '0.00',
    defaulting_loans: 0,
    par30_ratio: 0,
    par30_amount: '0.00',
    collections_this_month: '0.00',
    pending_approvals: 0,
    pending_tickets: 0,
    total_staff: 0,
    pending_leave_requests: 0,
    staff_on_leave_today: 0,
    last_payroll_status: null,
    last_payroll_period: null,
    last_payroll_net_pay: '0.00',
    pending_requisitions: 0,
    pending_purchase_orders: 0,
    active_financial_year: null,
    active_period: null,
    period_progress_pct: 0,
  };
  const liveStats = schoolStats ?? emptyStats;
  const statsCards = buildStatsCards(effectiveRole, liveStats);

  // Director and Principal bypass all permission checks
  const isSuperUser = getRoleRank(effectiveRole) >= 4;

  // Role-specific module restriction: officers only see what's relevant to their job
  const allowedModuleIds = isSuperUser ? null : getAllowedModuleIds(effectiveRole);
  const accessibleModules = MODULES.filter(module => {
    if (allowedModuleIds !== null) return allowedModuleIds.includes(module.id);
    // Super users: show all, no permission filtering needed
    return true;
  });

  // Role-specific quick actions — officers get field-relevant shortcuts, not generic ERP ones
  const officerQuickActions = OFFICER_QUICK_ACTIONS[effectiveRole];
  const accessibleQuickActions =
    officerQuickActions ??
    (isSuperUser ? QUICK_ACTIONS : QUICK_ACTIONS.filter(a => hasPermission(a.permission)));

  const handleModuleClick = (path: string) => {
    navigate(path);
  };

  const handleActionClick = (path: string) => {
    navigate(path);
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const userName =
    user?.first_name && user?.last_name
      ? `${user.first_name} ${user.last_name}`
      : user?.username || 'User';

  if (loading || !permissionsLoaded) {
    return (
      <div className="space-y-6 animate-pulse">
        {/* Welcome banner skeleton */}
        <div
          className="rounded-2xl p-8"
          style={{
            background: `linear-gradient(135deg, ${BRAND.colors.navyDark}, ${BRAND.colors.navyLight})`,
          }}
        >
          <div
            className="h-7 rounded-lg w-56 mb-3"
            style={{ background: 'rgba(183,151,88,0.25)' }}
          />
          <div className="h-4 rounded w-80 mb-6" style={{ background: 'rgba(255,255,255,0.12)' }} />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div
                key={i}
                className="rounded-xl p-4"
                style={{ background: 'rgba(255,255,255,0.08)' }}
              >
                <div
                  className="h-3 rounded w-20 mb-2"
                  style={{ background: 'rgba(183,151,88,0.25)' }}
                />
                <div
                  className="h-6 rounded w-14"
                  style={{ background: 'rgba(255,255,255,0.15)' }}
                />
              </div>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div
              key={i}
              className="bg-white rounded-xl border p-5"
              style={{ borderColor: BRAND.colors.border }}
            >
              <div className="h-4 bg-gray-100 rounded w-24 mb-3" />
              <div className="h-8 bg-gray-100 rounded w-20 mb-2" />
              <div className="h-3 bg-gray-50 rounded w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (accessibleModules.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
          style={{
            background: `rgba(183,151,88,0.12)`,
            border: `1.5px solid ${BRAND.colors.border}`,
          }}
        >
          <AlertTriangle className="w-8 h-8" style={{ color: BRAND.colors.gold }} />
        </div>
        <h2 className="text-xl font-bold mb-2" style={{ color: BRAND.colors.navyPrimary }}>
          No Accessible Modules
        </h2>
        <p className="text-sm text-center max-w-sm" style={{ color: BRAND.colors.textSecondary }}>
          Your current role doesn't have permissions to access any modules. Contact your
          administrator.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* ── SLIDE-OVER NAV PANEL ─────────────────────────────────────── */}
      {navOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            style={{ background: 'rgba(6,14,48,0.55)', backdropFilter: 'blur(2px)' }}
            onClick={() => setNavOpen(false)}
          />
          {/* Drawer */}
          <div
            className="fixed top-0 left-0 h-full z-50 flex flex-col"
            style={{
              width: '288px',
              background: `linear-gradient(180deg, ${BRAND.colors.navyDark} 0%, ${BRAND.colors.navyPrimary} 100%)`,
              boxShadow: '6px 0 40px rgba(6,14,48,0.55)',
            }}
          >
            {/* Gold top accent */}
            <div
              className="h-1 flex-shrink-0"
              style={{
                background: `linear-gradient(90deg, ${BRAND.colors.gold}, ${BRAND.colors.goldDark}, ${BRAND.colors.gold})`,
              }}
            />
            {/* Header */}
            <div
              className="flex items-center justify-between px-4 py-4 flex-shrink-0"
              style={{
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                background: BRAND.colors.navyDark,
              }}
            >
              <div>
                <p className="text-sm font-black text-white">Quick Navigation</p>
                <p className="text-xs mt-0.5" style={{ color: BRAND.colors.gold }}>
                  {effectiveRole}
                </p>
              </div>
              <button
                onClick={() => setNavOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(255,255,255,0.12)',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(183,151,88,0.18)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.07)';
                }}
              >
                <X className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.65)' }} />
              </button>
            </div>

            {/* Nav buttons */}
            <div
              className="flex-1 overflow-y-auto py-2"
              style={
                {
                  scrollbarWidth: 'thin',
                  scrollbarColor: 'rgba(255,255,255,0.1) transparent',
                } as React.CSSProperties
              }
            >
              {roleSidebarButtons.length > 0 ? (
                roleSidebarButtons.map(btn => (
                  <RenderedSidebarButton
                    key={btn.id}
                    button={btn}
                    level={0}
                    onNavigate={url => {
                      navigate(url);
                      setNavOpen(false);
                    }}
                  />
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                  <Menu className="w-10 h-10 mb-3" style={{ color: 'rgba(255,255,255,0.15)' }} />
                  <p className="text-sm" style={{ color: 'rgba(255,255,255,0.35)' }}>
                    No navigation configured for this role.
                  </p>
                  {canConfigNav && (
                    <button
                      onClick={() => {
                        navigate('/settings/role-navigation');
                        setNavOpen(false);
                      }}
                      className="mt-4 text-xs underline"
                      style={{ color: BRAND.colors.gold }}
                    >
                      Configure now →
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div
              className="flex-shrink-0 px-4 py-4"
              style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}
            >
              {canConfigNav ? (
                <button
                  onClick={() => {
                    navigate('/settings/role-navigation');
                    setNavOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold"
                  style={{
                    background: 'rgba(183,151,88,0.12)',
                    color: BRAND.colors.gold,
                    border: '1px solid rgba(183,151,88,0.25)',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'rgba(183,151,88,0.22)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'rgba(183,151,88,0.12)';
                  }}
                >
                  <Settings className="w-4 h-4 flex-shrink-0" />
                  Configure Navigation
                </button>
              ) : (
                <p className="text-center text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>
                  Contact a Director to configure navigation
                </p>
              )}
            </div>
          </div>
        </>
      )}

      <div className="space-y-6">
        {/* ── HERO: split 3-col identity + 2-col KPI grid ─────────────── */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: `linear-gradient(135deg, ${BRAND.colors.navyDark} 0%, ${BRAND.colors.navyPrimary} 55%, ${BRAND.colors.navyLight} 100%)`,
            boxShadow: `0 8px 40px rgba(10,24,87,0.32)`,
          }}
        >
          <div className="p-7 grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Left: identity + period progress */}
            <div className="lg:col-span-3 flex flex-col justify-between gap-5">
              <div>
                {/* Role + FY badges */}
                <div className="flex items-center gap-2 mb-4 flex-wrap">
                  <span
                    className="text-xs font-black uppercase tracking-widest px-3 py-1 rounded-full"
                    style={{
                      background: 'rgba(183,151,88,0.22)',
                      color: BRAND.colors.gold,
                      border: '1px solid rgba(183,151,88,0.40)',
                    }}
                  >
                    {effectiveRole}
                  </span>
                  {liveStats.active_financial_year && (
                    <span
                      className="text-xs font-semibold px-3 py-1 rounded-full"
                      style={{
                        background: 'rgba(255,255,255,0.08)',
                        color: 'rgba(255,255,255,0.55)',
                      }}
                    >
                      FY {liveStats.active_financial_year}
                    </span>
                  )}
                  {/* Navigation drawer toggle */}
                  <button
                    onClick={() => setNavOpen(true)}
                    className="ml-auto inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all"
                    style={{
                      background: 'rgba(255,255,255,0.07)',
                      color: 'rgba(255,255,255,0.70)',
                      border: '1px solid rgba(255,255,255,0.15)',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = 'rgba(183,151,88,0.18)';
                      e.currentTarget.style.color = BRAND.colors.gold;
                      e.currentTarget.style.borderColor = 'rgba(183,151,88,0.40)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.07)';
                      e.currentTarget.style.color = 'rgba(255,255,255,0.70)';
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
                    }}
                  >
                    <Menu className="w-3.5 h-3.5" />
                    Navigation
                  </button>
                </div>

                {/* Large greeting */}
                <p className="text-4xl font-black text-white leading-none">{getGreeting()},</p>
                <p
                  className="text-4xl font-black leading-none mt-0.5"
                  style={{ color: BRAND.colors.gold }}
                >
                  {userName.split(' ')[0]}.
                </p>
                <p className="text-sm mt-3" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  {new Date().toLocaleDateString('en-NG', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              </div>

              {/* Period progress bar */}
              <div
                className="rounded-xl p-4"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.10)',
                }}
              >
                <div className="flex justify-between items-center mb-2">
                  <span
                    className="text-xs font-bold uppercase tracking-wider"
                    style={{ color: 'rgba(255,255,255,0.5)' }}
                  >
                    {liveStats.active_period ?? 'Current Period'}
                  </span>
                  <span className="text-sm font-black" style={{ color: BRAND.colors.gold }}>
                    {liveStats.period_progress_pct}%
                  </span>
                </div>
                <div
                  className="w-full h-2 rounded-full"
                  style={{ background: 'rgba(255,255,255,0.10)' }}
                >
                  <div
                    className="h-2 rounded-full transition-all duration-700"
                    style={{
                      width: `${Math.min(liveStats.period_progress_pct, 100)}%`,
                      background: `linear-gradient(90deg, ${BRAND.colors.gold}, ${BRAND.colors.goldDark})`,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Right: 2×2 KPI tiles */}
            <div className="lg:col-span-2 grid grid-cols-2 gap-3">
              {statsCards.map((stat, i) => {
                const Icon = stat.icon;
                const isPrimary = i === 0;
                return (
                  <div
                    key={stat.id}
                    className="rounded-xl p-4 flex flex-col justify-between"
                    style={{
                      background: isPrimary ? 'rgba(183,151,88,0.20)' : 'rgba(255,255,255,0.07)',
                      border: isPrimary
                        ? '1px solid rgba(183,151,88,0.40)'
                        : '1px solid rgba(255,255,255,0.10)',
                    }}
                  >
                    <Icon
                      className="w-4 h-4 mb-3"
                      style={{ color: isPrimary ? BRAND.colors.gold : 'rgba(255,255,255,0.40)' }}
                    />
                    <div>
                      <p className="text-xl font-black text-white leading-none mb-1">
                        {stat.value}
                      </p>
                      <p className="text-xs" style={{ color: 'rgba(255,255,255,0.50)' }}>
                        {stat.title}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Gold accent line */}
          <div
            className="h-px"
            style={{
              background: `linear-gradient(90deg, ${BRAND.colors.gold}, ${BRAND.colors.goldDark} 50%, transparent)`,
            }}
          />
        </div>

        {/* ── CASHIER BALANCE ALERT ────────────────────────────────────── */}
        {liveStats.cashier_balance != null && (
          <div
            className="rounded-xl px-5 py-4 flex items-center justify-between gap-4"
            style={
              parseFloat(liveStats.cashier_balance) !== 0
                ? { background: '#fef2f2', border: '1.5px solid #fca5a5' }
                : { background: '#f0fdf4', border: '1.5px solid #86efac' }
            }
          >
            <div className="flex items-center gap-3">
              <div
                className="rounded-lg p-2"
                style={
                  parseFloat(liveStats.cashier_balance) !== 0
                    ? { background: '#fee2e2', color: '#dc2626' }
                    : { background: '#dcfce7', color: '#16a34a' }
                }
              >
                <Wallet className="w-5 h-5" />
              </div>
              <div>
                <p
                  className="text-xs font-semibold uppercase tracking-wide"
                  style={{ color: '#6b7280' }}
                >
                  My Cash Account Balance
                  {liveStats.cashier_account_name && (
                    <span className="ml-1 font-normal normal-case" style={{ color: '#9ca3af' }}>
                      — {liveStats.cashier_account_name}
                    </span>
                  )}
                </p>
                <p
                  className="text-xl font-black mt-0.5"
                  style={{
                    color: parseFloat(liveStats.cashier_balance) !== 0 ? '#dc2626' : '#16a34a',
                  }}
                >
                  {formatNaira(liveStats.cashier_balance)}
                </p>
              </div>
            </div>
            <div
              className="flex items-center gap-1.5 text-sm font-semibold flex-shrink-0"
              style={{ color: parseFloat(liveStats.cashier_balance) !== 0 ? '#dc2626' : '#16a34a' }}
            >
              {parseFloat(liveStats.cashier_balance) !== 0 ? (
                <>
                  <AlertTriangle className="w-4 h-4" /> Must be ₦0.00 at end of day
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" /> Balanced
                </>
              )}
            </div>
          </div>
        )}

        {/* ── QUICK ACTIONS: horizontal pill strip ─────────────────────── */}
        {accessibleQuickActions.length > 0 && (
          <div className="flex items-center gap-3 flex-wrap">
            <span
              className="text-xs font-black uppercase tracking-widest flex-shrink-0"
              style={{ color: BRAND.colors.textSecondary }}
            >
              Quick Actions
            </span>
            <div className="w-px h-4 flex-shrink-0" style={{ background: BRAND.colors.border }} />
            {accessibleQuickActions.map(action => {
              const Icon = action.icon;
              return (
                <button
                  key={action.id}
                  onClick={() => handleActionClick(action.path)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all duration-200 border"
                  style={{
                    background: '#ffffff',
                    borderColor: BRAND.colors.border,
                    color: BRAND.colors.navyPrimary,
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = BRAND.colors.navyPrimary;
                    e.currentTarget.style.color = '#ffffff';
                    e.currentTarget.style.borderColor = BRAND.colors.navyPrimary;
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(10,24,87,0.20)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = '#ffffff';
                    e.currentTarget.style.color = BRAND.colors.navyPrimary;
                    e.currentTarget.style.borderColor = BRAND.colors.border;
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {action.title}
                </button>
              );
            })}
          </div>
        )}

        {/* ── MODULES: gradient colored tiles ──────────────────────────── */}
        <div>
          <SectionHeader icon={Grid} title="Your Modules" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {accessibleModules.map(module => {
              const Icon = module.icon;
              const colors = COLOR_STYLES[module.color as keyof typeof COLOR_STYLES];
              return (
                <button
                  key={module.id}
                  onClick={() => handleModuleClick(module.path)}
                  className="group relative rounded-2xl p-5 text-left overflow-hidden transition-all duration-300"
                  style={{
                    background: colors.gradient,
                    boxShadow: `0 4px 16px ${colors.border}`,
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'translateY(-4px) scale(1.03)';
                    e.currentTarget.style.boxShadow = `0 14px 32px ${colors.border}`;
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'translateY(0) scale(1)';
                    e.currentTarget.style.boxShadow = `0 4px 16px ${colors.border}`;
                  }}
                >
                  {/* Radial shine overlay */}
                  <div
                    className="absolute inset-0 opacity-20 pointer-events-none"
                    style={{
                      background:
                        'radial-gradient(circle at top right, rgba(255,255,255,0.35), transparent 65%)',
                    }}
                  />
                  <Icon
                    className="w-6 h-6 mb-4 relative z-10"
                    style={{ color: 'rgba(255,255,255,0.92)' }}
                  />
                  <h3 className="text-xs font-black text-white leading-snug relative z-10">
                    {module.title}
                  </h3>
                  <ArrowRight
                    className="w-3.5 h-3.5 mt-2 opacity-0 group-hover:opacity-70 transition-opacity relative z-10"
                    style={{ color: '#fff' }}
                  />
                </button>
              );
            })}
          </div>
        </div>

        {/* ── BOTTOM SECTION: dark portfolio panel + priority queue ─────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Portfolio overview — spans 2 cols, dark card */}
          <div
            className="lg:col-span-2 rounded-2xl p-6"
            style={{
              background: `linear-gradient(135deg, ${BRAND.colors.navyDark} 0%, ${BRAND.colors.navyPrimary} 100%)`,
              boxShadow: '0 4px 24px rgba(10,24,87,0.22)',
            }}
          >
            <p
              className="text-xs font-black uppercase tracking-widest mb-5"
              style={{ color: BRAND.colors.gold }}
            >
              Portfolio Overview
            </p>

            {/* 4 headline figures */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              {[
                { label: 'Loan Book', value: formatNaira(liveStats.total_loan_book) },
                { label: 'Active Loans', value: liveStats.active_loans.toLocaleString() },
                {
                  label: 'Disbursed (Mo.)',
                  value: formatNaira(liveStats.total_disbursed_this_month),
                },
                { label: 'Total Savings', value: formatNaira(liveStats.total_savings) },
              ].map(item => (
                <div key={item.label}>
                  <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.40)' }}>
                    {item.label}
                  </p>
                  <p className="text-lg font-black text-white leading-tight">{item.value}</p>
                </div>
              ))}
            </div>

            {/* Repayment rate */}
            <div>
              <div className="flex justify-between items-baseline mb-2">
                <span
                  className="text-xs font-bold uppercase tracking-wide"
                  style={{ color: 'rgba(255,255,255,0.45)' }}
                >
                  Loan Repayment Rate
                </span>
                <span className="text-2xl font-black" style={{ color: BRAND.colors.gold }}>
                  {formatPercent(liveStats.loan_repayment_rate)}
                </span>
              </div>
              <div
                className="w-full h-3 rounded-full"
                style={{ background: 'rgba(255,255,255,0.08)' }}
              >
                <div
                  className="h-3 rounded-full transition-all duration-700"
                  style={{
                    width: `${Math.min(liveStats.loan_repayment_rate, 100)}%`,
                    background: `linear-gradient(90deg, ${BRAND.colors.gold}, ${BRAND.colors.goldDark})`,
                  }}
                />
              </div>
            </div>

            {/* Overdue callout */}
            {liveStats.overdue_loans > 0 && (
              <div
                className="mt-4 flex items-center gap-3 rounded-xl px-4 py-3"
                style={{
                  background: 'rgba(220,38,38,0.12)',
                  border: '1px solid rgba(220,38,38,0.25)',
                }}
              >
                <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: '#f87171' }} />
                <span className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.70)' }}>
                  {liveStats.overdue_loans} overdue loan
                  {liveStats.overdue_loans !== 1 ? 's' : ''} require attention
                </span>
              </div>
            )}
          </div>

          {/* Priority queue — right col, white card */}
          <div
            className="rounded-2xl p-5 bg-white"
            style={{ border: `1.5px solid ${BRAND.colors.border}` }}
          >
            <p
              className="text-xs font-black uppercase tracking-widest mb-4"
              style={{ color: BRAND.colors.navyPrimary }}
            >
              Priority Queue
            </p>
            <div className="space-y-1">
              {[
                {
                  label: 'Loan Approvals',
                  value: liveStats.pending_approvals,
                  icon: CheckCircle,
                  accent: BRAND.colors.navyPrimary,
                },
                {
                  label: 'Leave Requests',
                  value: liveStats.pending_leave_requests,
                  icon: Clock,
                  accent: '#7c3aed',
                },
                {
                  label: 'Purchase Orders',
                  value: liveStats.pending_purchase_orders,
                  icon: ShoppingCart,
                  accent: '#0d9488',
                },
                {
                  label: 'Open Tickets',
                  value: liveStats.pending_tickets,
                  icon: AlertTriangle,
                  accent: '#dc2626',
                },
                {
                  label: 'Requisitions',
                  value: liveStats.pending_requisitions,
                  icon: FileText,
                  accent: BRAND.colors.goldDark,
                },
              ].map(item => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.label}
                    className="flex items-center justify-between py-2 px-3 rounded-lg transition-colors"
                    style={{ cursor: 'default' }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = '#f9f7f3';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
                        style={{ background: `${item.accent}14` }}
                      >
                        <Icon className="w-3 h-3" style={{ color: item.accent }} />
                      </div>
                      <span
                        className="text-xs font-medium"
                        style={{ color: BRAND.colors.textSecondary }}
                      >
                        {item.label}
                      </span>
                    </div>
                    <span
                      className="text-sm font-black px-2 py-0.5 rounded-full"
                      style={{ background: `${item.accent}14`, color: item.accent }}
                    >
                      {item.value}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── CLIENT SUMMARY: 4-tile strip ─────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            {
              label: 'Total Clients',
              value: liveStats.total_clients.toLocaleString(),
              icon: Users,
            },
            {
              label: 'Active Clients',
              value: liveStats.active_clients.toLocaleString(),
              icon: CheckCircle,
            },
            {
              label: 'New This Month',
              value: liveStats.new_clients_this_month.toLocaleString(),
              icon: TrendingUp,
            },
            { label: 'Total Staff', value: liveStats.total_staff.toLocaleString(), icon: Users },
          ].map(item => {
            const Icon = item.icon;
            return (
              <div
                key={item.label}
                className="rounded-xl px-4 py-4 bg-white flex items-center gap-4"
                style={{ border: `1.5px solid ${BRAND.colors.border}` }}
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(10,24,87,0.06)' }}
                >
                  <Icon className="w-4 h-4" style={{ color: BRAND.colors.navyPrimary }} />
                </div>
                <div className="min-w-0">
                  <p
                    className="text-xl font-black leading-none mb-0.5 truncate"
                    style={{ color: BRAND.colors.navyPrimary }}
                  >
                    {item.value}
                  </p>
                  <p className="text-xs truncate" style={{ color: BRAND.colors.textSecondary }}>
                    {item.label}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── DISCUSSIONS WIDGET ───────────────────────────────────────── */}
        <div className="max-w-sm">
          <ThreadWidget />
        </div>
      </div>
    </>
  );
};

// ── Sub-components ──────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center"
        style={{
          background: `${BRAND.colors.navyPrimary}0e`,
          border: `1px solid ${BRAND.colors.border}`,
        }}
      >
        <Icon className="w-3.5 h-3.5" style={{ color: BRAND.colors.navyPrimary }} />
      </div>
      <h2
        className="text-sm font-bold uppercase tracking-widest"
        style={{ color: BRAND.colors.navyPrimary }}
      >
        {title}
      </h2>
      <div className="flex-1 h-px" style={{ background: BRAND.colors.border }} />
    </div>
  );
}

function PortfolioRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-1">
      <span className="text-xs font-medium" style={{ color: BRAND.colors.textSecondary }}>
        {label}
      </span>
      <span className="text-sm font-bold" style={{ color: BRAND.colors.navyPrimary }}>
        {value}
      </span>
    </div>
  );
}

export default SimplifiedRoleBasedDashboard;
