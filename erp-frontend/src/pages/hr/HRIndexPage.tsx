// HR Index Page - Dashboard with navigation to all HR modules
import React from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  Calendar,
  Clock,
  DollarSign,
  FileText,
  UserCheck,
  TrendingUp,
  AlertCircle,
  Settings,
  Plus,
  MapPin,
  BarChart3,
  CheckCircle,
  XCircle,
  Shield,
} from 'lucide-react';
import { usePendingBonusDeductionCount } from '../../hooks/useBonusDeductionRequests';
import { usePayComponentRemovalPendingCount } from '../../hooks/useSalaryComponents';

const HRIndexPage: React.FC = () => {
  // Get pending bonus/deduction requests count for notification badge
  const { count: pendingBonusDeductionCount } = usePendingBonusDeductionCount();
  const { data: removalPendingData } = usePayComponentRemovalPendingCount();
  const pendingRemovalCount = removalPendingData?.count ?? 0;

  // Mock stats - in real app, these would come from API
  const stats = {
    totalStaff: 45,
    pendingLeaves: 8,
    todayAttendance: 42,
    activePayrolls: 2,
  };

  const modules = [
    {
      title: 'HR Configuration',
      description:
        'Configure branch-level HR settings, leave policies, attendance rules, and approval workflows',
      icon: Settings,
      path: '/hr/config',
      color: 'bg-indigo-500',
      stats: 'System Settings',
      isNew: true,
    },
    {
      title: 'Staff Management',
      description:
        'Manage employee records, departments, positions, and comprehensive staff details with HR data',
      icon: Users,
      path: '/hr/staff',
      color: 'bg-blue-500',
      stats: `${stats.totalStaff} Staff Members`,
      enhanced: true,
    },
    {
      title: 'Bonus & Deduction Requests',
      description:
        'Create, manage, and approve one-time salary bonuses and deductions with workflow approval',
      icon: Plus,
      path: '/hr/bonus-deduction',
      color: 'bg-teal-500',
      stats: 'Request Management',
      badge: pendingBonusDeductionCount > 0 ? pendingBonusDeductionCount : null,
      isNew: true,
    },
    {
      title: 'Attendance Tracking',
      description:
        'GPS-validated clock in/out, monitor daily attendance, working hours, and overtime calculation',
      icon: MapPin,
      path: '/hr/clock',
      color: 'bg-orange-500',
      stats: `${stats.todayAttendance} Present Today`,
      enhanced: true,
    },
    {
      title: 'Leave Management',
      description:
        'Handle leave requests, approvals, leave types, and enhanced leave balance initialization',
      icon: Calendar,
      path: '/hr/leave-requests',
      color: 'bg-green-500',
      stats: `${stats.pendingLeaves} Pending Requests`,
      enhanced: true,
    },
    {
      title: 'Salary Components',
      description: 'Configure earnings and deduction components for payroll calculations',
      icon: BarChart3,
      path: '/hr/salary-components',
      color: 'bg-purple-500',
      stats: 'Earnings & Deductions',
    },
    {
      title: 'Payroll Management',
      description: 'Process payroll, generate payslips, and manage dual-approval workflow payments',
      icon: DollarSign,
      path: '/hr/payroll',
      color: 'bg-red-500',
      stats: `${stats.activePayrolls} Active Payrolls`,
      enhanced: true,
    },
    {
      title: 'Component Removal Requests',
      description:
        'Review and approve requests to remove salary components from staff pay profiles',
      icon: Settings,
      path: '/hr/bonus-deduction?tab=removals',
      color: 'bg-violet-500',
      stats: 'Pay Component Removals',
      badge: pendingRemovalCount > 0 ? pendingRemovalCount : null,
      isNew: true,
    },
    {
      title: 'Pension Remittances',
      description:
        'Process and track pension fund remittances (employee 8% + employer 10%) with full GL accounting',
      icon: Shield,
      path: '/hr/pension-remittances',
      color: 'bg-emerald-600',
      stats: 'Pension Fund',
    },
    {
      title: 'HR Dashboard',
      description: 'Overview of HR metrics, analytics, and key performance indicators',
      icon: TrendingUp,
      path: '/hr/dashboard',
      color: 'bg-gray-600',
      stats: 'Analytics & Insights',
    },
  ];

  const quickActions = [
    {
      title: 'Add New Staff',
      description: 'Register a new employee',
      icon: UserCheck,
      path: '/hr/staff/create',
      color: 'text-blue-600',
    },
    {
      title: 'Clock In/Out',
      description: 'Record staff attendance',
      icon: Clock,
      path: '/hr/clock',
      color: 'text-green-600',
    },
    {
      title: 'Request Bonus/Deduction',
      description: 'Create salary adjustment request',
      icon: Plus,
      path: '/hr/bonus-deduction/create',
      color: 'text-teal-600',
    },
    {
      title: 'Leave Balances',
      description: 'View staff leave balances',
      icon: Calendar,
      path: '/hr/leave-balances',
      color: 'text-purple-600',
    },
    {
      title: 'Leave Types',
      description: 'Manage leave categories',
      icon: FileText,
      path: '/hr/leave-types',
      color: 'text-orange-600',
    },
    {
      title: 'HR Configuration',
      description: 'Configure HR settings',
      icon: Settings,
      path: '/hr/config',
      color: 'text-indigo-600',
    },
    {
      title: 'Pension Remittances',
      description: 'Process pension fund payments',
      icon: Shield,
      path: '/hr/pension-remittances',
      color: 'text-emerald-600',
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">HR & Payroll Management</h1>
          <p className="mt-2 text-gray-600">
            Manage your human resources, attendance, leave requests, and payroll processing
          </p>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-2 lg:grid-cols-5 gap-4 sm:gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Users className="h-8 w-8 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Total Staff</p>
                <p className="text-2xl font-semibold text-gray-900">{stats.totalStaff}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Calendar className="h-8 w-8 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Pending Leaves</p>
                <p className="text-2xl font-semibold text-gray-900">{stats.pendingLeaves}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Plus className="h-8 w-8 text-teal-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Pending Requests</p>
                <div className="flex items-center">
                  <p className="text-2xl font-semibold text-gray-900">
                    {pendingBonusDeductionCount}
                  </p>
                  {pendingBonusDeductionCount > 0 && (
                    <div className="ml-2 h-2 w-2 bg-red-500 rounded-full animate-pulse"></div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Clock className="h-8 w-8 text-orange-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Present Today</p>
                <p className="text-2xl font-semibold text-gray-900">{stats.todayAttendance}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <DollarSign className="h-8 w-8 text-purple-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Active Payrolls</p>
                <p className="text-2xl font-semibold text-gray-900">{stats.activePayrolls}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Main Modules */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {modules.map(module => {
            const IconComponent = module.icon;
            return (
              <Link
                key={module.path}
                to={module.path}
                className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow duration-200 p-6 block relative"
              >
                <div className="flex items-start">
                  <div className={`flex-shrink-0 ${module.color} rounded-lg p-3 relative`}>
                    <IconComponent className="h-6 w-6 text-white" />
                    {/* Notification Badge */}
                    {module.badge && (
                      <div className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full h-6 w-6 flex items-center justify-center font-semibold">
                        {module.badge > 99 ? '99+' : module.badge}
                      </div>
                    )}
                  </div>
                  <div className="ml-4 flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">{module.title}</h3>
                      {/* Enhanced/New Indicators */}
                      {module.isNew && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          New
                        </span>
                      )}
                      {module.enhanced && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          Enhanced
                        </span>
                      )}
                    </div>
                    <p className="text-gray-600 mb-3">{module.description}</p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center text-sm text-gray-500">
                        <TrendingUp className="h-4 w-4 mr-1" />
                        {module.stats}
                      </div>
                      {/* Pending Badge for stats */}
                      {module.badge && (
                        <div className="flex items-center text-sm text-red-600 font-medium">
                          <AlertCircle className="h-4 w-4 mr-1" />
                          {module.badge} Pending
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {quickActions.map(action => {
              const IconComponent = action.icon;
              return (
                <Link
                  key={action.path}
                  to={action.path}
                  className="flex items-center p-4 border border-gray-200 rounded-lg hover:border-gray-300 hover:bg-gray-50 transition-colors duration-200"
                >
                  <IconComponent className={`h-5 w-5 ${action.color} mr-3`} />
                  <div>
                    <p className="font-medium text-gray-900">{action.title}</p>
                    <p className="text-sm text-gray-500">{action.description}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Recent Activity - Enhanced with HR system activities */}
        <div className="mt-8 bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Recent Activity</h2>
          <div className="space-y-4">
            {pendingBonusDeductionCount > 0 && (
              <div className="flex items-center p-3 bg-teal-50 rounded-lg">
                <Plus className="h-5 w-5 text-teal-600 mr-3" />
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {pendingBonusDeductionCount} bonus/deduction request
                    {pendingBonusDeductionCount > 1 ? 's' : ''} pending approval
                  </p>
                  <p className="text-xs text-gray-500">Review and approve salary adjustments</p>
                </div>
              </div>
            )}
            <div className="flex items-center p-3 bg-blue-50 rounded-lg">
              <Calendar className="h-5 w-5 text-blue-600 mr-3" />
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {stats.pendingLeaves} leave request{stats.pendingLeaves > 1 ? 's' : ''} submitted
                  today
                </p>
                <p className="text-xs text-gray-500">Requires manager approval</p>
              </div>
            </div>
            <div className="flex items-center p-3 bg-green-50 rounded-lg">
              <CheckCircle className="h-5 w-5 text-green-600 mr-3" />
              <div>
                <p className="text-sm font-medium text-gray-900">GPS attendance tracking active</p>
                <p className="text-xs text-gray-500">
                  Location validation enabled for all branches
                </p>
              </div>
            </div>
            <div className="flex items-center p-3 bg-purple-50 rounded-lg">
              <BarChart3 className="h-5 w-5 text-purple-600 mr-3" />
              <div>
                <p className="text-sm font-medium text-gray-900">
                  Leave balances initialized for current year
                </p>
                <p className="text-xs text-gray-500">All staff entitlements updated</p>
              </div>
            </div>
            <div className="flex items-center p-3 bg-orange-50 rounded-lg">
              <MapPin className="h-5 w-5 text-orange-600 mr-3" />
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {stats.todayAttendance} staff members clocked in today
                </p>
                <p className="text-xs text-gray-500">GPS validation successful for all entries</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HRIndexPage;
