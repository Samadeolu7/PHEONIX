// src/pages/HomePageWithNavigation.tsx - Authenticated Homepage
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BRAND } from '../constants/brand';
import {
  LayoutDashboard,
  DollarSign,
  Package,
  FileText,
  GitBranch,
  CheckCircle,
  BarChart3,
  Users,
  ChevronDown,
  ChevronRight,
  LogOut,
  Feather,
} from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { canAccessHomepage, getRedirectPathForUser } from '../utils/roleBasedRedirect';

const businessModules = [
  {
    category: 'Procurement Management',
    description: 'Complete procurement workflow from requisitions to purchase orders',
    icon: '🛒',
    color: '#3b82f6',
    features: [
      {
        icon: '📋',
        title: 'Purchase Requisitions',
        description: 'Create and manage purchase requisitions with approval workflow',
        path: '/procurement/requisitions',
      },
      {
        icon: '🛍️',
        title: 'Purchase Orders',
        description: 'Generate and track purchase orders with supplier management',
        path: '/procurement/orders',
      },
      {
        icon: '📦',
        title: 'Goods Received Notes',
        description: 'Record and manage incoming goods with quality checks',
        path: '/procurement/grn',
      },
      {
        icon: '↩️',
        title: 'Purchase Returns',
        description: 'Handle returns and credit notes efficiently',
        path: '/procurement/returns',
      },
    ],
  },
  {
    category: 'Inventory Management',
    description: 'Comprehensive inventory control and stock management',
    icon: '📦',
    color: '#10b981',
    features: [
      {
        icon: '📊',
        title: 'Inventory Dashboard',
        description: 'Real-time inventory overview with key metrics',
        path: '/inventory',
      },
      {
        icon: '🏷️',
        title: 'Item Management',
        description: 'Manage inventory items with pricing and tracking',
        path: '/inventory/items',
      },
      {
        icon: '📈',
        title: 'Stock Movements',
        description: 'Track all inventory movements and transactions',
        path: '/inventory/movements',
      },
      {
        icon: '🏢',
        title: 'Locations',
        description: 'Manage storage locations and warehouses',
        path: '/inventory/locations',
      },
    ],
  },
  {
    category: 'Receivables & Revenue Management',
    description: 'Complete revenue cycle from billing to collections',
    icon: '💰',
    color: '#f59e0b',
    features: [
      // Invoicing & Billing
      {
        icon: '🧾',
        title: 'Service Invoices',
        description: 'Create fee-based invoices with optional entitlements',
        path: '/sales/invoices/create',
        badge: 'Create',
      },
      {
        icon: '📦',
        title: 'Inventory Invoices',
        description: 'Create invoices with line items for inventory sales',
        path: '/sales/invoices/create-inventory',
        badge: 'Create',
      },
      {
        icon: '📋',
        title: 'Bulk Invoice Wizard',
        description: 'Generate multiple invoices at once for recurring billing',
        path: '/sales/invoices/bulk',
        badge: 'Bulk',
      },
      {
        icon: '🔁',
        title: 'Credit Notes',
        description: 'Issue refunds and credit notes for adjustments',
        path: '/sales/credit-notes',
      },
      {
        icon: '📑',
        title: 'All Invoices',
        description: 'View and manage all invoices across all types',
        path: '/sales/invoices',
      },

      // Fee Configuration & Entitlements
      {
        icon: '⚙️',
        title: 'Fee Structures',
        description: 'Configure fee templates and pricing structures',
        path: '/incomes/fee-structures',
        badge: 'Config',
      },
      {
        icon: '🎫',
        title: 'Entitlements',
        description: 'Manage client entitlements and access levels',
        path: '/incomes/entitlements',
        badge: 'Config',
      },

      // Collections & Payments
      {
        icon: '💸',
        title: 'Record Payment',
        description: 'Record and allocate customer payments',
        path: '/receivables/payments/record',
        badge: 'Quick',
      },
      {
        icon: '💳',
        title: 'Receivables Dashboard',
        description: 'Monitor outstanding receivables and key metrics',
        path: '/receivables/dashboard',
      },
      {
        icon: '📊',
        title: 'Collections Workbench',
        description: 'Manage collections with prioritized follow-ups',
        path: '/receivables/collections-workbench',
      },
      {
        icon: '⏰',
        title: 'Aging Report',
        description: 'View receivables aging analysis by period',
        path: '/receivables/aging-report',
      },
      {
        icon: '📧',
        title: 'Payment Reminders',
        description: 'Configure and send automated payment reminders',
        path: '/receivables/reminders',
      },

      // Discounts & Promotions
      {
        icon: '🏷️',
        title: 'Discount Programs',
        description: 'Create and manage discount programs',
        path: '/discounts/programs',
      },
      {
        icon: '✨',
        title: 'Apply Discounts',
        description: 'Apply discounts to invoices and clients',
        path: '/discounts/apply',
      },
      {
        icon: '📈',
        title: 'Discount Analytics',
        description: 'Analyze discount performance and ROI',
        path: '/discounts/analytics',
      },

      // Reports & Statements
      {
        icon: '📄',
        title: 'Customer Statements',
        description: 'Generate customer account statements',
        path: '/receivables/statements',
      },
      {
        icon: '📉',
        title: 'Payment Trends',
        description: 'Analyze payment patterns and trends',
        path: '/receivables/payment-trends',
      },
      {
        icon: '🎯',
        title: 'Revenue Analytics',
        description: 'Advanced reporting and revenue insights',
        path: '/receivables/analytics',
      },
    ],
  },
  {
    category: 'Liabilities & Payables',
    description: 'Vendor payment management with 3-way matching and accountability',
    icon: '💳',
    color: '#ef4444',
    features: [
      {
        icon: '📋',
        title: 'Accounts Payable',
        description: 'Manage vendor invoices and payment obligations',
        path: '/liabilities/payables',
      },
      {
        icon: '➕',
        title: 'Create Payable',
        description: 'Record new vendor invoice with PO reference',
        path: '/liabilities/payables/new',
        badge: 'Create',
      },
      {
        icon: '✅',
        title: '3-Way Match Validation',
        description: 'Validate PO, GRN, and Invoice matching',
        path: '/liabilities/payables',
        badge: 'Validation',
      },
      {
        icon: '💸',
        title: 'Make Payments',
        description: 'Process vendor payments with accountability tracking',
        path: '/liabilities/payables',
        badge: 'Payment',
      },
      {
        icon: '⏰',
        title: 'Overdue Payables',
        description: 'Track and manage overdue vendor payments',
        path: '/liabilities/payables?status=overdue',
      },
    ],
  },
  {
    category: 'Financial Accounting',
    description: 'Core accounting and financial reporting',
    icon: '📊',
    color: '#8b5cf6',
    features: [
      {
        icon: '📊',
        title: 'Chart of Accounts',
        description: 'Manage your accounting structure and hierarchy',
        path: '/accounts',
      },
      {
        icon: '⚖️',
        title: 'Trial Balance',
        description: 'View trial balance report with account hierarchies',
        path: '/reports/financial/trial-balance',
      },
      {
        icon: '📈',
        title: 'Profit & Loss',
        description: 'Generate profit and loss statements with comparisons',
        path: '/reports/financial/profit-loss',
      },
      {
        icon: '🏦',
        title: 'Balance Sheet',
        description: 'View balance sheet with assets, liabilities, and equity',
        path: '/reports/financial/balance-sheet',
      },
      {
        icon: '📝',
        title: 'General Ledger',
        description: 'View detailed ledger entries and transactions',
        path: '/accounts/ledger',
      },
    ],
  },
  {
    category: 'Client & Supplier Management',
    description: 'Manage relationships with clients and suppliers',
    icon: '👥',
    color: '#8b5cf6',
    features: [
      {
        icon: '🏢',
        title: 'Client Management',
        description: 'Comprehensive client database and profiles',
        path: '/clients',
      },
      {
        icon: '🏭',
        title: 'Supplier Management',
        description: 'Manage supplier relationships and performance',
        path: '/procurement/suppliers',
      },
      {
        icon: '📋',
        title: 'Classifications',
        description: 'Organize clients and suppliers by categories',
        path: '/clients/classifications',
      },
    ],
  },
  {
    category: 'Automation & Workflows',
    description: 'Streamline business processes with intelligent automation',
    icon: '⚡',
    color: '#ec4899',
    features: [
      {
        icon: '🔄',
        title: 'Workflow Templates',
        description: 'Create and manage automation templates',
        path: '/automations/templates',
      },
      {
        icon: '▶️',
        title: 'Automation Runs',
        description: 'Monitor and track automation executions',
        path: '/automations/runs',
      },
      {
        icon: '✅',
        title: 'Approvals',
        description: 'Manage pending approval requests',
        path: '/approvals',
      },
    ],
  },
  {
    category: 'Analytics & Reporting',
    description: 'Business intelligence and comprehensive reporting',
    icon: '📊',
    color: '#06b6d4',
    features: [
      {
        icon: '📈',
        title: 'Dashboard Builder',
        description: 'Create custom dashboards with widgets',
        path: '/dashboard',
      },
      {
        icon: '📋',
        title: 'Report Builder',
        description: 'Generate custom reports and analytics',
        path: '/reports/new',
      },
      {
        icon: '📑',
        title: 'Reports Library',
        description: 'Access saved reports and scheduled analytics',
        path: '/reports',
      },
    ],
  },
];

interface Report {
  id: number;
  name: string;
  code: string;
  linked_account_code?: string;
  created_at: string;
}

interface FormTemplate {
  id: number;
  name: string;
  description: string;
  schema?: {
    fields: any[];
  };
}

interface Dashboard {
  id: number;
  name: string;
  description: string;
}

const HomePageWithNavigation: React.FC = () => {
  const { user, logout, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [reports, setReports] = useState<Report[]>([]);
  const [forms, setForms] = useState<FormTemplate[]>([]);
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Wait for auth to finish loading before making decisions
    // Don't redirect if we're still checking authentication
    if (authLoading) {
      return;
    }

    // Redirect to login if not authenticated (and not loading)
    if (!user) {
      navigate('/login');
      return;
    }

    // Redirect non-admins to their assigned dashboard
    if (!canAccessHomepage(user)) {
      const redirectPath = getRedirectPathForUser(user);
      navigate(redirectPath, { replace: true });
      return;
    }

    // User has access, fetch data
    fetchData();
  }, [user, navigate, authLoading]);

  const fetchData = async () => {
    try {
      // Don't fetch all data immediately - start with empty arrays for faster initial render
      setLoading(false);

      // Fetch data in the background after component is rendered
      setTimeout(async () => {
        const [reportsRes, formsRes, dashboardsRes] = await Promise.allSettled([
          api.get('/reports/templates/'),
          api.get('/automations/forms/'),
          api.get('/dashboards/'),
        ]);

        if (reportsRes.status === 'fulfilled') {
          console.log('Reports response:', reportsRes.value);
          const reportsData =
            reportsRes.value.results ||
            reportsRes.value.data?.results ||
            reportsRes.value.data ||
            reportsRes.value ||
            [];
          setReports(Array.isArray(reportsData) ? reportsData : []);
          console.log(Array.isArray(reportsData) ? reportsData : []);
        } else {
          console.error('Reports fetch failed:', reportsRes.reason);
        }

        if (formsRes.status === 'fulfilled') {
          console.log('Forms response:', formsRes.value);
          const formsData =
            formsRes.value.results ||
            formsRes.value.data?.results ||
            formsRes.value.data ||
            formsRes.value ||
            [];
          setForms(Array.isArray(formsData) ? formsData : []);
        } else {
          console.error('Forms fetch failed:', formsRes.reason);
        }

        if (dashboardsRes.status === 'fulfilled') {
          console.log('Dashboards response:', dashboardsRes.value);
          const dashboardData = dashboardsRes.value;
          const dashboardList =
            dashboardData.results ||
            dashboardData.data?.results ||
            dashboardData.data ||
            dashboardData ||
            [];
          setDashboards(Array.isArray(dashboardList) ? dashboardList : []);
        } else {
          console.error('Dashboards fetch failed:', dashboardsRes.reason);
        }
      }, 100); // Small delay to allow page to render first
    } catch (error) {
      console.error('Failed to fetch data:', error);
      setLoading(false);
    }
  };

  // Group reports by account
  const reportsByAccount = reports.reduce(
    (acc, report) => {
      // Use linked_account_code from the actual report structure
      const accountCode = report.linked_account_code || 'Unlinked';
      const key = accountCode === 'Unlinked' ? 'Unlinked Reports' : `Account ${accountCode}`;
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(report);
      return acc;
    },
    {} as Record<string, Report[]>
  );

  const toggleAccount = (accountKey: string) => {
    const newExpanded = new Set(expandedAccounts);
    if (newExpanded.has(accountKey)) {
      newExpanded.delete(accountKey);
    } else {
      newExpanded.add(accountKey);
    }
    setExpandedAccounts(newExpanded);
  };

  const mainModules = [
    {
      icon: <DollarSign size={32} />,
      title: 'Receivables',
      description: 'Invoicing, Collections & Revenue Management',
      path: '/receivables/dashboard',
      color: '#f59e0b',
    },
    {
      icon: <Users size={32} />,
      title: 'Clients',
      description: 'Client & Customer Management',
      path: '/clients',
      color: '#f43f5e',
    },
    {
      icon: <FileText size={32} />,
      title: 'Accounts',
      description: 'Chart of Accounts & Financial Reports',
      path: '/accounts',
      color: '#10b981',
    },
    {
      icon: <Package size={32} />,
      title: 'Inventory',
      description: 'Stock & Inventory Management',
      path: '/inventory/tracker',
      color: '#8b5cf6',
    },
    {
      icon: <FileText size={32} />,
      title: 'Procurement',
      description: 'Purchase Orders & Suppliers',
      path: '/procurement/purchase-orders',
      color: '#14b8a6',
    },
    {
      icon: <GitBranch size={32} />,
      title: 'Workflows',
      description: 'Automation & Approval Workflows',
      path: '/automations/templates',
      color: '#ec4899',
    },
    {
      icon: <CheckCircle size={32} />,
      title: 'Approvals',
      description: 'Pending Approval Requests',
      path: '/approvals/pending',
      color: '#06b6d4',
    },
    {
      icon: <Package size={32} />,
      title: 'Products',
      description: 'Product & Service Management',
      path: '/products',
      color: '#a855f7',
    },
  ];

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontSize: '1.5rem',
        }}
      >
        Loading...
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0a1857 0%, #162570 100%)',
        paddingBottom: '2rem',
      }}
    >
      {/* Header */}
      <div
        style={{
          background: 'rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(10px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.2)',
          padding: '1rem 2rem',
        }}
      >
        <div
          style={{
            maxWidth: '1400px',
            margin: '0 auto',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <img
              src={BRAND.logoUrl}
              alt="Krystar Trust"
              style={{
                height: '36px',
                width: '36px',
                borderRadius: '50%',
                border: '2px solid #b79758',
                objectFit: 'contain',
                background: 'rgba(255,255,255,0.1)',
              }}
              onError={e => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
            <h1 style={{ color: 'white', margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
              {BRAND.systemLabel}
            </h1>
          </div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <span style={{ color: 'rgba(255, 255, 255, 0.9)', fontWeight: 500 }}>
              {user?.first_name || user?.username || user?.email}
            </span>
            <button
              onClick={() => navigate('/account/settings')}
              style={{
                padding: '0.5rem 1rem',
                background: 'rgba(255, 255, 255, 0.2)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                borderRadius: '6px',
                color: 'white',
                cursor: 'pointer',
                fontSize: '0.875rem',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
              }}
            >
              Account Settings
            </button>
            {(user?.is_owner || user?.is_staff) && (
              <button
                onClick={() => navigate('/admin/users')}
                style={{
                  padding: '0.5rem 1rem',
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  borderRadius: '6px',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                }}
              >
                User Management
              </button>
            )}
            <button
              onClick={() => {
                logout();
                navigate('/login');
              }}
              style={{
                padding: '0.5rem 1rem',
                background: 'rgba(255, 255, 255, 0.2)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                borderRadius: '6px',
                color: 'white',
                cursor: 'pointer',
                fontSize: '0.875rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
              }}
            >
              <LogOut size={16} />
              Logout
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem' }}>
        {/* Hero */}
        <div style={{ textAlign: 'center', color: 'white', marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '2.5rem', margin: '0 0 0.5rem 0', fontWeight: 700 }}>
            Welcome Back, {user?.first_name || user?.username}! 👋
          </h2>
          <p style={{ fontSize: '1.125rem', margin: 0, opacity: 0.9 }}>
            Your complete business management system
          </p>
        </div>

        {/* New Pages Quick Access */}
        <div style={{ marginBottom: '3rem' }}>
          <div
            onClick={() => navigate('/newpages')}
            style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              borderRadius: '16px',
              padding: '2rem',
              boxShadow: '0 8px 32px rgba(102, 126, 234, 0.3)',
              cursor: 'pointer',
              transition: 'all 0.3s',
              border: '2px solid rgba(255, 255, 255, 0.1)',
              textAlign: 'center',
              color: 'white',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 12px 40px rgba(102, 126, 234, 0.4)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 8px 32px rgba(102, 126, 234, 0.3)';
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '1rem',
              }}
            >
              <Feather size={32} style={{ marginRight: '1rem' }} />
              <h3 style={{ fontSize: '1.5rem', margin: 0, fontWeight: 600 }}>
                🚀 New Pages & Features
              </h3>
            </div>
            <p style={{ fontSize: '1rem', margin: 0, opacity: 0.9 }}>
              Quick access to all newly created procurement, inventory, and client management pages
            </p>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                marginTop: '1rem',
                padding: '0.5rem 1rem',
                background: 'rgba(255, 255, 255, 0.2)',
                borderRadius: '8px',
                fontSize: '0.875rem',
                fontWeight: 500,
              }}
            >
              Click to explore →
            </div>
          </div>
        </div>

        {businessModules.map((module, moduleIndex) => (
          <div key={moduleIndex} style={{ marginBottom: '4rem' }}>
            {/* Module Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                marginBottom: '2rem',
                padding: '1.5rem',
                background: 'white',
                borderRadius: '12px',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
                border: `2px solid ${module.color}20`,
              }}
            >
              <div
                style={{
                  fontSize: '2.5rem',
                  marginRight: '1rem',
                  padding: '0.5rem',
                  background: `${module.color}15`,
                  borderRadius: '8px',
                }}
              >
                {module.icon}
              </div>
              <div style={{ flex: 1 }}>
                <h2
                  style={{
                    fontSize: '1.75rem',
                    fontWeight: 600,
                    color: '#1e293b',
                    margin: '0 0 0.5rem 0',
                  }}
                >
                  {module.category}
                </h2>
                <p
                  style={{
                    color: '#64748b',
                    margin: 0,
                    fontSize: '1rem',
                  }}
                >
                  {module.description}
                </p>
              </div>
              <div
                style={{
                  padding: '0.5rem 1rem',
                  background: `${module.color}10`,
                  borderRadius: '20px',
                  fontSize: '0.875rem',
                  color: module.color,
                  fontWeight: 600,
                }}
              >
                {module.features.length} Features
              </div>
            </div>

            {/* Module Features */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: '1.5rem',
              }}
            >
              {module.features.map((feature, featureIndex) => (
                <div
                  key={featureIndex}
                  onClick={() => navigate(feature.path)}
                  style={{
                    background: 'white',
                    borderRadius: '12px',
                    padding: '1.5rem',
                    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    border: '1px solid #e2e8f0',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'translateY(-4px)';
                    e.currentTarget.style.boxShadow = '0 12px 24px rgba(0, 0, 0, 0.1)';
                    e.currentTarget.style.borderColor = module.color;
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.05)';
                    e.currentTarget.style.borderColor = '#e2e8f0';
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      right: 0,
                      width: '60px',
                      height: '60px',
                      background: `${module.color}10`,
                      borderRadius: '0 12px 0 60px',
                    }}
                  />

                  <div
                    style={{
                      fontSize: '2rem',
                      marginBottom: '1rem',
                      position: 'relative',
                      zIndex: 1,
                    }}
                  >
                    {feature.icon}
                  </div>

                  <h3
                    style={{
                      fontSize: '1.125rem',
                      fontWeight: 600,
                      color: '#1e293b',
                      margin: '0 0 0.5rem 0',
                    }}
                  >
                    {feature.title}
                  </h3>

                  <p
                    style={{
                      color: '#64748b',
                      margin: 0,
                      fontSize: '0.875rem',
                      lineHeight: '1.5',
                    }}
                  >
                    {feature.description}
                  </p>

                  <div
                    style={{
                      marginTop: '1rem',
                      fontSize: '0.75rem',
                      color: '#94a3b8',
                      fontFamily: 'monospace',
                    }}
                  >
                    {feature.path}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Main Modules Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '1.5rem',
            marginBottom: '3rem',
          }}
        >
          {mainModules.map((module, index) => (
            <div
              key={index}
              onClick={() => navigate(module.path)}
              style={{
                background: 'white',
                borderRadius: '12px',
                padding: '1.5rem',
                boxShadow: '0 4px 24px rgba(0, 0, 0, 0.1)',
                cursor: 'pointer',
                transition: 'all 0.3s',
                border: `2px solid transparent`,
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.15)';
                e.currentTarget.style.borderColor = module.color;
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 24px rgba(0, 0, 0, 0.1)';
                e.currentTarget.style.borderColor = 'transparent';
              }}
            >
              <div style={{ color: module.color, marginBottom: '1rem' }}>{module.icon}</div>
              <h3
                style={{
                  fontSize: '1.25rem',
                  color: '#2c3e50',
                  margin: '0 0 0.5rem 0',
                  fontWeight: 600,
                }}
              >
                {module.title}
              </h3>
              <p
                style={{
                  color: '#718096',
                  margin: 0,
                  fontSize: '0.875rem',
                  lineHeight: '1.5',
                }}
              >
                {module.description}
              </p>
            </div>
          ))}
        </div>

        {/* Special Sections */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
            gap: '1.5rem',
            marginBottom: '2rem',
          }}
        >
          {/* Dashboards */}
          <div
            style={{
              background: 'white',
              borderRadius: '12px',
              padding: '1.5rem',
              boxShadow: '0 4px 24px rgba(0, 0, 0, 0.1)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                marginBottom: '1rem',
              }}
            >
              <LayoutDashboard size={24} color="#3b82f6" />
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: '#2c3e50' }}>
                Dashboards
              </h3>
            </div>
            <p style={{ color: '#718096', fontSize: '0.875rem', marginBottom: '1rem' }}>
              {dashboards.length} dashboard{dashboards.length !== 1 ? 's' : ''} available
            </p>
            <button
              onClick={() => navigate('/dashboard/select')}
              style={{
                width: '100%',
                padding: '0.75rem',
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: 600,
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = '#2563eb';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = '#3b82f6';
              }}
            >
              {dashboards.length > 1 ? 'Select Dashboard' : 'View Dashboard'}
            </button>
          </div>

          {/* Forms */}
          <div
            style={{
              background: 'white',
              borderRadius: '12px',
              padding: '1.5rem',
              boxShadow: '0 4px 24px rgba(0, 0, 0, 0.1)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                marginBottom: '1rem',
              }}
            >
              <FileText size={24} color="#8b5cf6" />
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: '#2c3e50' }}>
                Forms & Templates
              </h3>
            </div>
            <p style={{ color: '#718096', fontSize: '0.875rem', marginBottom: '1rem' }}>
              {forms.length} form{forms.length !== 1 ? 's' : ''} available
            </p>
            <div style={{ maxHeight: '200px', overflowY: 'auto', marginBottom: '1rem' }}>
              {forms.length > 0 ? (
                forms.slice(0, 5).map(form => (
                  <div
                    key={form.id}
                    onClick={() => navigate(`/forms/${form.id}`)}
                    style={{
                      padding: '0.75rem',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      marginBottom: '0.5rem',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = '#f9fafb';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <div style={{ fontSize: '0.875rem', fontWeight: 500, color: '#2c3e50' }}>
                      {form.name}
                    </div>
                    {form.description && (
                      <div style={{ fontSize: '0.75rem', color: '#718096', marginTop: '0.25rem' }}>
                        {form.description}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <p style={{ color: '#718096', fontSize: '0.875rem' }}>No forms available</p>
              )}
            </div>
            <button
              onClick={() => navigate('/forms')}
              style={{
                width: '100%',
                padding: '0.75rem',
                background: '#8b5cf6',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: 600,
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = '#7c3aed';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = '#8b5cf6';
              }}
            >
              Browse All Forms
            </button>
          </div>
        </div>

        {/* Reports by Account */}
        <div
          style={{
            background: 'white',
            borderRadius: '12px',
            padding: '1.5rem',
            boxShadow: '0 4px 24px rgba(0, 0, 0, 0.1)',
          }}
        >
          <div
            style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}
          >
            <BarChart3 size={24} color="#14b8a6" />
            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: '#2c3e50' }}>
              Reports by Account
            </h3>
          </div>

          {Object.keys(reportsByAccount).length > 0 ? (
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {Object.entries(reportsByAccount).map(([accountKey, accountReports]) => (
                <div key={accountKey} style={{ marginBottom: '0.5rem' }}>
                  <div
                    onClick={() => toggleAccount(accountKey)}
                    style={{
                      padding: '0.75rem',
                      background: '#f9fafb',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = '#f3f4f6';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = '#f9fafb';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {expandedAccounts.has(accountKey) ? (
                        <ChevronDown size={18} color="#718096" />
                      ) : (
                        <ChevronRight size={18} color="#718096" />
                      )}
                      <span style={{ fontSize: '0.875rem', fontWeight: 500, color: '#2c3e50' }}>
                        {accountKey}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        color: '#718096',
                        background: '#e5e7eb',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '12px',
                      }}
                    >
                      {accountReports.length} report{accountReports.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {expandedAccounts.has(accountKey) && (
                    <div style={{ paddingLeft: '2rem', marginTop: '0.5rem' }}>
                      {accountReports.map(report => (
                        <div
                          key={report.id}
                          onClick={() => navigate(`/report/${report.code}`)}
                          style={{
                            padding: '0.5rem 0.75rem',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            marginBottom: '0.25rem',
                            transition: 'all 0.2s',
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.background = '#f9fafb';
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.background = 'transparent';
                          }}
                        >
                          <div style={{ fontSize: '0.8125rem', color: '#2c3e50' }}>
                            {report.name}
                          </div>
                          <div
                            style={{ fontSize: '0.75rem', color: '#718096', marginTop: '0.125rem' }}
                          >
                            {new Date(report.created_at).toLocaleDateString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div
              style={{
                textAlign: 'center',
                padding: '2rem',
                color: '#718096',
                fontSize: '0.875rem',
              }}
            >
              No reports generated yet. Create your first report from the Reports module.
            </div>
          )}

          <button
            onClick={() => navigate('/reports')}
            style={{
              width: '100%',
              padding: '0.75rem',
              background: '#14b8a6',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: 600,
              marginTop: '1rem',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = '#0d9488';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = '#14b8a6';
            }}
          >
            View All Reports
          </button>
        </div>
      </div>
    </div>
  );
};

export default HomePageWithNavigation;
