import React from 'react';
import { Link } from 'react-router-dom';
import {
  Building,
  Settings,
  ClipboardList,
  CheckSquare,
  Users,
  Calendar,
  DollarSign,
  Eye,
  Plus,
  Calculator,
  Clock,
  BarChart3,
} from 'lucide-react';

interface PageLink {
  title: string;
  description: string;
  path: string;
  icon: React.ReactNode;
  isNew?: boolean;
  isEnhanced?: boolean;
}

const AdministrationModule: React.FC = () => {
  // Filter pages based on Administrator permissions from Phoenix Software Access Table
  const pageLinks: PageLink[] = [
    // Admin Management - Administrator has access to user management and system settings
    {
      title: 'Branch Management',
      description: 'Complete branch management with CRUD operations',
      path: '/admin/branches',
      icon: <Building size={20} />,
      isNew: true,
    },
    {
      title: 'Tenant Management',
      description: 'Multi-tenant system management with domain configuration',
      path: '/admin/tenants',
      icon: <Settings size={20} />,
      isNew: true,
    },

    // User Management - Administrator can add new users (✓)
    {
      title: 'User Management',
      description: 'Add and manage system users with role assignments',
      path: '/admin/users',
      icon: <Users size={20} />,
      isNew: true,
    },

    // Automation - Administrator has access to automation workflows
    {
      title: 'Automation Templates',
      description: 'Workflow template creation and management',
      path: '/automations/templates',
      icon: <ClipboardList size={20} />,
      isNew: true,
    },
    {
      title: 'Automation Runs',
      description: 'Monitor and manage automation executions',
      path: '/automations/runs',
      icon: <CheckSquare size={20} />,
      isNew: true,
    },
    {
      title: 'Approvals Dashboard',
      description: 'Pending approvals and workflow status tracking',
      path: '/approvals',
      icon: <CheckSquare size={20} />,
      isNew: true,
    },

    // HR & Payroll - Administrator has access to HR functions
    {
      title: 'HR Dashboard',
      description: 'Main HR navigation with staff, leave, attendance, and payroll modules',
      path: '/hr',
      icon: <Users size={20} />,
      isNew: true,
    },
    {
      title: 'HR Analytics Dashboard',
      description: 'Comprehensive HR analytics with metrics and performance insights',
      path: '/hr/dashboard',
      icon: <BarChart3 size={20} />,
      isNew: true,
    },
    {
      title: 'Staff Management',
      description: 'Complete staff directory with CRUD operations',
      path: '/hr/staff',
      icon: <Users size={20} />,
      isNew: true,
    },
    {
      title: 'Create/Edit Staff',
      description: 'Staff member creation and editing with department tracking',
      path: '/hr/staff/create',
      icon: <Users size={20} />,
      isNew: true,
    },
    // {
    //   title: 'Staff Detail View',
    //   description: 'Detailed staff member information with history and documents',
    //   path: '/hr/staff/1',
    //   icon: <Eye size={20} />,
    //   isNew: true
    // },
    // {
    //   title: 'Staff Pay Components',
    //   description: 'Manage individual staff member salary components and allowances',
    //   path: '/hr/staff/1/pay-components',
    //   icon: <DollarSign size={20} />,
    //   isNew: true
    // },
    // {
    //   title: 'Attendance Management',
    //   description: 'Daily attendance tracking with clock in/out functionality',
    //   path: '/hr/attendance',
    //   icon: <CheckSquare size={20} />,
    //   isNew: true
    // },
    {
      title: 'Clock In/Out',
      description: 'Staff clock in and clock out interface with time tracking',
      path: '/hr/attendance/clock',
      icon: <Clock size={20} />,
      isNew: true,
    },
    {
      title: 'Attendance Form',
      description: 'Manual attendance entry and correction form',
      path: '/hr/attendance/create',
      icon: <Plus size={20} />,
      isNew: true,
    },
    // {
    //   title: 'Attendance Detail',
    //   description: 'Detailed attendance record with time logs and adjustments',
    //   path: '/hr/attendance/1',
    //   icon: <Eye size={20} />,
    //   isNew: true
    // },
    {
      title: 'Leave Management',
      description: 'Complete leave management with approval workflow',
      path: '/hr/leave-requests',
      icon: <Calendar size={20} />,
      isNew: true,
    },
    {
      title: 'Create Leave Request',
      description: 'Submit new leave request with type selection and date range',
      path: '/hr/leave-requests/create',
      icon: <Plus size={20} />,
      isNew: true,
    },
    // {
    //   title: 'Leave Request Detail',
    //   description: 'View leave request details with approval status and history',
    //   path: '/hr/leave-requests/1',
    //   icon: <Eye size={20} />,
    //   isNew: true
    // },
    {
      title: 'Leave Balances',
      description: 'View staff leave balances and entitlements by type',
      path: '/hr/leave-balances',
      icon: <BarChart3 size={20} />,
      isNew: true,
    },
    {
      title: 'Leave Types Management',
      description: 'Configure leave types with rules and entitlements',
      path: '/hr/leave-types',
      icon: <Settings size={20} />,
      isNew: true,
    },
    {
      title: 'Create/Edit Leave Type',
      description: 'Create and configure leave types with accrual rules',
      path: '/hr/leave-types/create',
      icon: <Plus size={20} />,
      isNew: true,
    },
    {
      title: 'Payroll Management',
      description: 'Complete payroll processing with calculate → approve → process workflow',
      path: '/hr/payroll',
      icon: <DollarSign size={20} />,
      isNew: true,
    },
    {
      title: 'Create/Process Payroll',
      description: 'Generate new payroll run with calculation and approval steps',
      path: '/hr/payroll/create',
      icon: <Plus size={20} />,
      isNew: true,
    },
    // {
    //   title: 'Payroll Detail',
    //   description: 'View payroll run details with staff breakdown and totals',
    //   path: '/hr/payroll/1',
    //   icon: <Eye size={20} />,
    //   isNew: true
    // },
    // {
    //   title: 'Payslip Detail',
    //   description: 'Individual staff payslip with earnings, deductions, and net pay',
    //   path: '/hr/payroll/1/payslips/1',
    //   icon: <Eye size={20} />,
    //   isNew: true
    // },
    {
      title: 'Salary Components',
      description: 'Manage salary components, allowances, and deductions',
      path: '/hr/salary-components',
      icon: <Calculator size={20} />,
      isNew: true,
    },
    {
      title: 'Create/Edit Salary Component',
      description: 'Create and configure salary components with calculation rules',
      path: '/hr/salary-components/create',
      icon: <Plus size={20} />,
      isNew: true,
    },
    // {
    //   title: 'Salary Components Debug',
    //   description: 'Debug and test salary component calculations and formulas',
    //   path: '/hr/salary-components/debug',
    //   icon: <Settings size={20} />,
    //   isNew: true
    // }
  ];

  const groupedLinks = pageLinks.reduce(
    (acc, link) => {
      let category = 'Other';

      if (link.path.includes('/admin/')) {
        category = 'Admin Management';
      } else if (link.path.includes('/automations/') || link.path.includes('/approvals')) {
        category = 'Automation';
      } else if (link.path.includes('/hr/')) {
        category = 'HR & Payroll';
      }

      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(link);
      return acc;
    },
    {} as Record<string, PageLink[]>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Administration</h1>
              <p className="mt-2 text-lg text-gray-600">
                System administration including user management, automation, and human resources
              </p>
            </div>
            <div className="text-sm text-gray-500">Administrator Module</div>
          </div>
        </div>

        {/* Categories */}
        {Object.entries(groupedLinks).map(([category, links]) => (
          <div key={category} className="mb-12">
            <h2 className="text-2xl font-semibold text-gray-800 mb-6 border-b border-gray-200 pb-2">
              {category}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {links.map((link, index) => (
                <Link
                  key={index}
                  to={link.path}
                  className="group bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md hover:border-orange-300 transition-all duration-200"
                >
                  <div className="flex items-start space-x-4">
                    <div className="flex-shrink-0">
                      <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center text-orange-600 group-hover:bg-orange-200 transition-colors">
                        {link.icon}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-2">
                        <h3 className="text-lg font-medium text-gray-900 group-hover:text-orange-600 transition-colors">
                          {link.title}
                        </h3>
                        {link.isNew && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                            New
                          </span>
                        )}
                        {link.isEnhanced && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                            Enhanced
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 leading-relaxed">{link.description}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}

        {/* Back to Dashboard */}
        <div className="mt-12 pt-8 border-t border-gray-200">
          <Link
            to="/dashboard/role-based"
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
          >
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
};

export default AdministrationModule;
