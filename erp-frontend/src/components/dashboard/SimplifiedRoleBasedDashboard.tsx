// src/components/dashboard/SimplifiedRoleBasedDashboard.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { usePermission } from '@/hooks/usePermissions';
import { StatsCard } from './StatsCard';
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
} from 'lucide-react';
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
    description: 'Revenue, expenses, and financial reporting',
    icon: DollarSign,
    path: '/financial-management',
    color: 'blue',
    requiredPermissions: [
      'invoice-list',
      'receivables-list',
      'fee-structure-list',
      'entitlement-list',
      'accounts-view',
    ],
  },
  {
    id: 'client-services',
    title: 'Client Services',
    description: 'Client records, loan accounts, and savings management',
    icon: Users,
    path: '/client-services',
    color: 'green',
    requiredPermissions: ['client-view', 'classification-view', 'entitlement-list'],
  },
  {
    id: 'operations',
    title: 'Operations',
    description: 'Procurement, inventory, and resource management',
    icon: Package,
    path: '/operations',
    color: 'purple',
    requiredPermissions: ['po-list', 'pr-list', 'item-list', 'consumption-list', 'voucher-list'],
  },
  {
    id: 'administration',
    title: 'Administration',
    description: 'HR, payroll, and system administration',
    icon: Users,
    path: '/administration',
    color: 'orange',
    requiredPermissions: ['staff-list', 'branch-list', 'payroll-list', 'leave-list'],
  },

  {
    id: 'treasury',
    title: 'Treasury & Expenses',

    description: 'Petty cash, expenses, prepaid expenses, and bank management',
    icon: CreditCard,
    path: '/treasury',
    color: 'teal',
    requiredPermissions: ['accounts-view'],
  },
  {
    id: 'all-access',
    title: 'All Access',
    description: 'Search and access every feature available to your role',
    icon: Grid,
    path: '/all-access',
    color: 'gray',
    requiredPermissions: [],
  },
];

// Color mappings for module cards
// Color mappings for module cards
const COLOR_STYLES = {
  blue: {
    light: '#3b82f620',
    medium: '#3b82f6',
    gradient: 'linear-gradient(135deg, #1e40af, #3b82f6)',
  },
  green: {
    light: '#10b98120',
    medium: '#10b981',
    gradient: 'linear-gradient(135deg, #059669, #10b981)',
  },
  purple: {
    light: '#8b5cf620',
    medium: '#8b5cf6',
    gradient: 'linear-gradient(135deg, #7c3aed, #8b5cf6)',
  },
  orange: {
    light: '#f9731620',
    medium: '#f97316',
    gradient: 'linear-gradient(135deg, #ea580c, #f97316)',
  },
  gray: {
    light: '#6b728020',
    medium: '#6b7280',
    gradient: 'linear-gradient(135deg, #4b5563, #6b7280)',
  },
  teal: {
    light: '#14b8a620',
    medium: '#14b8a6',
    gradient: 'linear-gradient(135deg, #0d9488, #14b8a6)',
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

    default: // Officer / general
      return [
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
        {
          id: 'active-loans',
          title: 'Active Loans',
          value: s.active_loans.toLocaleString(),
          icon: CreditCard,
          color: 'green' as const,
        },
        {
          id: 'outstanding-fees',
          title: 'Outstanding Fees',
          value: formatNaira(s.outstanding_fees),
          icon: DollarSign,
          color: 'blue' as const,
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
  const SUPERUSER_ROLES = ['Director', 'Principal'];
  const isSuperUser = effectiveRole ? SUPERUSER_ROLES.includes(effectiveRole) : false;

  const accessibleModules = MODULES.filter(
    module =>
      isSuperUser ||
      module.requiredPermissions.length === 0 ||
      module.requiredPermissions.some(perm => hasPermission(perm))
  );
  const accessibleQuickActions = isSuperUser
    ? QUICK_ACTIONS
    : QUICK_ACTIONS.filter(action => hasPermission(action.permission));

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
      <div className={`space-y-6 ${className}`}>
        {/* Loading skeleton - same as before */}
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg p-6 animate-pulse">
          <div className="h-8 bg-white/20 rounded w-64 mb-2"></div>
          <div className="h-4 bg-white/20 rounded w-96 mb-4"></div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white/10 rounded-lg p-4">
                <div className="h-3 bg-white/20 rounded w-20 mb-2"></div>
                <div className="h-6 bg-white/20 rounded w-16"></div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div
              key={i}
              className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 animate-pulse"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="h-4 bg-gray-200 rounded w-24"></div>
                <div className="h-8 w-8 bg-gray-200 rounded-lg"></div>
              </div>
              <div className="h-8 bg-gray-200 rounded w-20 mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-16"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Show message if no modules accessible
  if (accessibleModules.length === 0) {
    return (
      <div className={`space-y-6 ${className}`}>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-8 text-center">
          <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No Accessible Modules</h2>
          <p className="text-gray-600">
            Your current role doesn't have permissions to access any modules. Please contact your
            administrator.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Welcome Banner */}
      <div
        className="rounded-lg p-6 text-white"
        style={{
          background: `linear-gradient(135deg, #1e40af, #3b82f6)`,
        }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1">
            <h1 className="text-2xl font-bold mb-2">
              {getGreeting()}, {userName.split(' ')[0]}
            </h1>
            <p className="text-white/90 mb-4">
              Welcome to your {effectiveRole} dashboard. Here's your overview.
            </p>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {statsCards.slice(0, 3).map(stat => {
                const Icon = stat.icon;
                return (
                  <div key={stat.id} className="bg-white/10 rounded-lg p-4 backdrop-blur-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="text-white/80 text-sm">{stat.title}</p>
                        <p className="text-2xl font-bold">{stat.value}</p>
                      </div>
                      <Icon className="h-6 w-6 text-white/70" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* User Avatar */}
          <div className="hidden lg:block ml-6">
            <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center">
              <User className="h-10 w-10 text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions - Only show if user has permissions */}
      {accessibleQuickActions.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {accessibleQuickActions.map(action => {
              const Icon = action.icon;
              return (
                <button
                  key={action.id}
                  onClick={() => handleActionClick(action.path)}
                  className="p-4 bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md hover:border-blue-300 transition-all duration-200 text-left group"
                >
                  <div className="flex items-start space-x-3">
                    <div className="p-2 rounded-lg group-hover:scale-110 transition-transform duration-200 bg-blue-50">
                      <Icon className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-900 group-hover:text-blue-600">
                        {action.title}
                      </h3>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Key Metrics */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Key Performance Indicators</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {statsCards.map(stat => (
            <StatsCard
              key={stat.id}
              {...stat}
              className="dashboard-card-hover"
              onClick={() => console.log(`Clicked ${stat.title}`)}
            />
          ))}
        </div>
      </div>

      {/* Modules - Now dynamically generated based on permissions */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Your Modules</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {accessibleModules.map(module => {
            const Icon = module.icon;
            const colors = COLOR_STYLES[module.color as keyof typeof COLOR_STYLES];
            return (
              <button
                key={module.id}
                onClick={() => handleModuleClick(module.path)}
                className="p-6 bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md hover:border-blue-300 transition-all duration-200 text-left group"
              >
                <div className="flex items-start space-x-4">
                  <div
                    className="p-3 rounded-lg group-hover:scale-110 transition-transform duration-200"
                    style={{ backgroundColor: colors.light }}
                  >
                    <Icon className="h-6 w-6" style={{ color: colors.medium }} />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 mb-2">
                      {module.title}
                    </h3>
                    <p className="text-sm text-gray-500">{module.description}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Loan Portfolio At a Glance */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Operational Period */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-600" />
            Loan Portfolio
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Financial Year</span>
              <span className="font-medium text-gray-900">
                {liveStats.active_financial_year ?? '—'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Active Period</span>
              <span className="font-medium text-gray-900">{liveStats.active_period ?? '—'}</span>
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm text-gray-600">Repayment Rate</span>
                <span className="text-sm font-medium text-blue-600">
                  {formatPercent(liveStats.loan_repayment_rate)}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(liveStats.loan_repayment_rate, 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Pending Actions */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5 text-yellow-600" />
            Pending Actions
          </h3>
          <div className="space-y-3">
            {[
              {
                label: 'Approvals',
                value: liveStats.pending_approvals,
                color: 'text-yellow-700 bg-yellow-50',
              },
              {
                label: 'Leave Requests',
                value: liveStats.pending_leave_requests,
                color: 'text-purple-700 bg-purple-50',
              },
              {
                label: 'Purchase Orders',
                value: liveStats.pending_purchase_orders,
                color: 'text-blue-700 bg-blue-50',
              },
              {
                label: 'Open Tickets',
                value: liveStats.pending_tickets,
                color: 'text-red-700 bg-red-50',
              },
            ].map(item => (
              <div key={item.label} className="flex justify-between items-center">
                <span className="text-sm text-gray-600">{item.label}</span>
                <span className={`text-sm font-semibold px-2 py-0.5 rounded-full ${item.color}`}>
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Client Summary */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Users className="h-5 w-5 text-green-600" />
            Client Summary
          </h3>
          <div className="space-y-3">
            {[
              { label: 'Total Clients', value: liveStats.total_clients.toLocaleString() },
              { label: 'Active Clients', value: liveStats.active_clients.toLocaleString() },
              {
                label: 'New This Month',
                value: liveStats.new_clients_this_month.toLocaleString(),
              },
              { label: 'Total Staff', value: liveStats.total_staff.toLocaleString() },
            ].map(item => (
              <div key={item.label} className="flex justify-between items-center">
                <span className="text-sm text-gray-600">{item.label}</span>
                <span className="font-semibold text-gray-900">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SimplifiedRoleBasedDashboard;
