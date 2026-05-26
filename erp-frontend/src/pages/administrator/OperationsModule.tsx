import React from 'react';
import { Link } from 'react-router-dom';
import { FileText, CreditCard, Settings, BarChart3 } from 'lucide-react';

interface PageLink {
  title: string;
  description: string;
  path: string;
  icon: React.ReactNode;
  isNew?: boolean;
  isEnhanced?: boolean;
}

const OperationsModule: React.FC = () => {
  // Filter pages based on Administrator's permissions from Phoenix Software Access Table
  const pageLinks: PageLink[] = [
    // Operations - Administrator has access to these basic operations
    {
      title: 'Daily Posting - Receipt',
      description: 'Daily posting of receipts and financial transactions',
      path: '/operations/daily-posting/receipts',
      icon: <FileText size={20} />,
      isNew: true,
    },
    {
      title: 'Daily Operations',
      description: 'Handle daily operational tasks and management functions',
      path: '/operations/daily',
      icon: <Settings size={20} />,
      isNew: true,
    },
    {
      title: 'Basic Data Entry',
      description: 'Basic data entry functions for operational information',
      path: '/data-entry/basic',
      icon: <FileText size={20} />,
      isNew: true,
    },
    {
      title: 'Payment Request',
      description: 'Handle payment request processing and approvals',
      path: '/financial/payment-requests',
      icon: <CreditCard size={20} />,
      isNew: true,
    },
    {
      title: 'Activity Report',
      description: 'General activity reporting and analytics for operations',
      path: '/reports/activity',
      icon: <BarChart3 size={20} />,
      isNew: true,
    },
  ];

  const groupedLinks = pageLinks.reduce(
    (acc, link) => {
      const category = 'Daily Operations';

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
              <h1 className="text-3xl font-bold text-gray-900">Operations Management</h1>
              <p className="mt-2 text-lg text-gray-600">
                Daily operations and administrative management functions for Administrator role
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
                  className="group bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md hover:border-purple-300 transition-all duration-200"
                >
                  <div className="flex items-start space-x-4">
                    <div className="flex-shrink-0">
                      <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center text-purple-600 group-hover:bg-purple-200 transition-colors">
                        {link.icon}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-2">
                        <h3 className="text-lg font-medium text-gray-900 group-hover:text-purple-600 transition-colors">
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

export default OperationsModule;
