import React from 'react';
import { Link } from 'react-router-dom';
import { Users, Building, GraduationCap, Eye, Target, CheckSquare, UserPlus } from 'lucide-react';

interface PageLink {
  title: string;
  description: string;
  path: string;
  icon: React.ReactNode;
  isNew?: boolean;
  isEnhanced?: boolean;
}

const StudentServicesModule: React.FC = () => {
  // Filter pages based on Administrator permissions from Phoenix Software Access Table
  const pageLinks: PageLink[] = [
    // Add new users (✓) - Administrator can add new users
    {
      title: 'User Management',
      description: 'Add and manage system users with role assignments',
      path: '/admin/users',
      icon: <UserPlus size={20} />,
      isNew: true,
    },

    // Registration new student (✓) - Administrator can register new students
    {
      title: 'Client Dashboard',
      description: 'Client overview and management dashboard for student registration',
      path: '/clients',
      icon: <Users size={20} />,
      isEnhanced: true,
    },
    {
      title: 'Client Classifications',
      description: 'Client categorization and classification management for student organization',
      path: '/clients/classifications',
      icon: <Building size={20} />,
      isNew: true,
    },

    // Student Entitlements - Administrator has access to student management
    {
      title: '🎓 Entitlements List',
      description:
        'Client entitlements with payment status, access level visualizations, and entitlement management actions',
      path: '/incomes/entitlements',
      icon: <GraduationCap size={20} />,
      isNew: true,
    },
    {
      title: '🔍 Entitlement Detail View',
      description:
        'Complete entitlement information with payment progress, access matrix, and access level change history',
      path: '/incomes/entitlements/1/view',
      icon: <Eye size={20} />,
      isNew: true,
    },
    // {
    //   title: '🔐 Access Control Checker',
    //   description: 'Service access validation interface with real-time checking, payment requirements, and upgrade options',
    //   path: '/demo/access-control',
    //   icon: <CheckSquare size={20} />,
    //   isNew: true
    // },
    {
      title: '🎯 Entitlement Dashboard',
      description:
        'Client-facing entitlement dashboard with payment status, access levels, quick payment, and service access matrix',
      path: '/incomes/entitlements/dashboard',
      icon: <Target size={20} />,
      isNew: true,
    },
  ];

  const groupedLinks = pageLinks.reduce(
    (acc, link) => {
      let category = 'Other';

      if (link.path.includes('/admin/users')) {
        category = 'User Management';
      } else if (link.path.includes('/clients')) {
        category = 'Client Management';
      } else if (
        link.path.includes('/incomes/entitlements') ||
        link.path.includes('/demo/access-control')
      ) {
        category = 'Student Entitlements';
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
              <h1 className="text-3xl font-bold text-gray-900">Client Services</h1>
              <p className="mt-2 text-lg text-gray-600">
                Student and client management including user administration, registration, and
                entitlements
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
                  className="group bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md hover:border-green-300 transition-all duration-200"
                >
                  <div className="flex items-start space-x-4">
                    <div className="flex-shrink-0">
                      <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center text-green-600 group-hover:bg-green-200 transition-colors">
                        {link.icon}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-2">
                        <h3 className="text-lg font-medium text-gray-900 group-hover:text-green-600 transition-colors">
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

export default StudentServicesModule;
