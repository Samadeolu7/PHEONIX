import React from 'react';
import { Link } from 'react-router-dom';
import {
  FileText,
  CreditCard,
  Receipt,
  BarChart3,
  Eye,
  Plus,
  Settings,
  Calculator,
  TrendingUp,
  PieChart,
  Upload,
} from 'lucide-react';

interface PageLink {
  title: string;
  description: string;
  path: string;
  icon: React.ReactNode;
  isNew?: boolean;
  isEnhanced?: boolean;
}

const FinancialManagementModule: React.FC = () => {
  // Filter pages based on Administrator permissions from Phoenix Software Access Table
  const pageLinks: PageLink[] = [
    // Invoice generation (✓) - Administrator can generate invoices
    {
      title: '📄 Enhanced Create Invoice',
      description:
        'Enhanced invoice creation with auto number generation, client integration, validation, and preview functionality',
      path: '/sales/invoices/create',
      icon: <Plus size={20} />,
      isNew: true,
    },
    {
      title: '📋 Enhanced Invoices List',
      description:
        'Complete invoice management with status badges, payment progress indicators, filtering, and integrated payment recording',
      path: '/sales/invoices',
      icon: <FileText size={20} />,
      isNew: true,
    },

    // Payment Request (✓) - Administrator can handle payment requests
    {
      title: '💳 Payment Recording Modal',
      description:
        'Reusable payment recording modal with validation logic, payment method selection, and real-time balance calculations',
      path: '/receivables/payments/record',
      icon: <CreditCard size={20} />,
      isNew: true,
    },
    {
      title: '🔄 Unified Payment Modal',
      description:
        'Universal payment recording for all receivable types (invoices, entitlements, loans) with proper API routing',
      path: '/receivables/payments/unified',
      icon: <CreditCard size={20} />,
      isNew: true,
    },

    // Receivables Aging report (✓) - Administrator can view aging reports
    {
      title: '📝 All Receivables List',
      description:
        'Unified view of all receivables with aging buckets, collection assignment, bulk operations, and comprehensive filtering',
      path: '/receivables/list',
      icon: <Receipt size={20} />,
      isNew: true,
    },
    {
      title: '📊 Aging Analysis Report',
      description:
        'Interactive aging breakdown with customer drill-down, export capabilities, date range filtering, and trend analysis',
      path: '/receivables/aging-report',
      icon: <BarChart3 size={20} />,
      isNew: true,
    },

    // Daily Posting - Receipt (✓) - Administrator can handle daily posting
    {
      title: '📤 Bulk Payment Upload',
      description:
        'CSV payment upload interface with payment mapping, validation, batch processing status, and error handling',
      path: '/receivables/bulk-payment-upload',
      icon: <Upload size={20} />,
      isNew: true,
    },

    // Fee structure management for Administrator
    {
      title: '⚙️ Fee Structures List',
      description:
        'Display all fee structures with filtering, create/edit/deactivate actions, usage statistics, and industry config',
      path: '/incomes/fee-structures',
      icon: <Settings size={20} />,
      isNew: true,
    },
    {
      title: '📝 Fee Structure Form',
      description:
        'Comprehensive fee structure creation with industry-specific configurations, access rules, and recurring billing',
      path: '/incomes/fee-structures/create',
      icon: <Plus size={20} />,
      isNew: true,
    },
    {
      title: '🎯 Bulk Invoice Wizard',
      description:
        'Multi-step wizard for bulk invoice generation with fee structure selection, client filtering, and preview confirmation',
      path: '/demo/bulk-invoice-wizard',
      icon: <FileText size={20} />,
      isNew: true,
    },
    {
      title: '📊 Bulk Invoice Results',
      description:
        'Bulk generation results with success/error summary, individual invoice review, and bulk send functionality',
      path: '/bulk-invoice-results',
      icon: <BarChart3 size={20} />,
      isNew: true,
    },

    // Financial Reports - Administrator has access to key financial reports
    // Payable Report (✓), Petty Cash Report (✓), Asset Register (✓), Payroll Report (✓)
    // {
    //   title: 'Trial Balance Report',
    //   description: 'Complete trial balance with hierarchical account display, filtering, and export functionality',
    //   path: '/reports/financial/trial-balance',
    //   icon: <Calculator size={20} />,
    //   isNew: true
    // },
    // {
    //   title: 'Profit & Loss Statement',
    //   description: 'Comprehensive profit and loss report with comparative analysis and export options',
    //   path: '/reports/financial/profit-loss',
    //   icon: <TrendingUp size={20} />,
    //   isNew: true
    // },
    // {
    //   title: 'Balance Sheet Report',
    //   description: 'Complete balance sheet with assets, liabilities, and equity breakdown',
    //   path: '/reports/financial/balance-sheet',
    //   icon: <PieChart size={20} />,
    //   isNew: true
    // },

    // Customer Statements - Administrator can generate statements
    {
      title: '📄 Customer Statements',
      description:
        'Statement generation interface with individual and batch generation, history tracking, and email delivery options',
      path: '/receivables/statements',
      icon: <FileText size={20} />,
      isNew: true,
    },
    {
      title: '👁️ Statement Preview',
      description:
        'Statement preview interface with transaction details, balances, PDF generation, and email composition',
      path: '/receivables/statement-preview-test',
      icon: <Eye size={20} />,
      isNew: true,
    },
  ];

  const groupedLinks = pageLinks.reduce(
    (acc, link) => {
      const category =
        link.path.includes('/receivables/') ||
        link.path.includes('/sales/') ||
        link.path.includes('/incomes/') ||
        link.path.includes('/demo/bulk') ||
        link.path.includes('/bulk-invoice')
          ? 'Receivables & Invoicing'
          : 'Financial Reports';

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
              <h1 className="text-3xl font-bold text-gray-900">Financial Management</h1>
              <p className="mt-2 text-lg text-gray-600">
                Financial operations including receivables, invoicing, and reporting for
                administrators
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
                  className="group bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md hover:border-blue-300 transition-all duration-200"
                >
                  <div className="flex items-start space-x-4">
                    <div className="flex-shrink-0">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 group-hover:bg-blue-200 transition-colors">
                        {link.icon}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-2">
                        <h3 className="text-lg font-medium text-gray-900 group-hover:text-blue-600 transition-colors">
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

export default FinancialManagementModule;
