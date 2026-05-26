// Test component for dashboard components
import React from 'react';
import {
  DollarSign,
  Users,
  Package,
  TrendingUp,
  FileText,
  CreditCard,
  Plus,
  Eye,
} from 'lucide-react';
import {
  MetricCard,
  QuickActionCard,
  ActivityFeed,
  MetricsGrid,
  QuickActionsGrid,
  ActivityItem,
} from './index';

export const DashboardTest: React.FC = () => {
  // Sample data for testing
  const sampleActivities: ActivityItem[] = [
    {
      id: '1',
      type: 'invoice',
      title: 'New invoice created',
      description: 'Invoice #INV-2024-001 created for John Doe - ₦50,000',
      timestamp: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
      user: 'Admin User',
      status: 'success',
      actionUrl: '/sales/invoices/1',
    },
    {
      id: '2',
      type: 'payment',
      title: 'Payment received',
      description: 'Payment of ₦25,000 received for Invoice #INV-2024-001',
      timestamp: new Date(Date.now() - 15 * 60 * 1000), // 15 minutes ago
      user: 'Finance Team',
      status: 'success',
      actionUrl: '/receivables/payments/1',
    },
    {
      id: '3',
      type: 'approval',
      title: 'Purchase order pending approval',
      description: 'PO #PO-2024-005 for office supplies awaiting approval',
      timestamp: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
      user: 'Procurement Team',
      status: 'pending',
      actionUrl: '/procurement/orders/5',
    },
    {
      id: '4',
      type: 'system',
      title: 'Inventory alert',
      description: 'Low stock alert for 3 items in main warehouse',
      timestamp: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
      status: 'error',
      actionUrl: '/inventory/alerts',
    },
    {
      id: '5',
      type: 'user',
      title: 'New user registered',
      description: 'Jane Smith has been added to the system',
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
      user: 'HR Team',
      status: 'info',
      actionUrl: '/admin/users/jane-smith',
    },
  ];

  return (
    <div className="p-6 space-y-8 bg-gray-50 min-h-screen">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Dashboard Components Test</h1>
        <p className="text-gray-600">Testing all dashboard foundation components</p>
      </div>

      {/* Metrics Section */}
      <section>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Metric Cards</h2>
        <MetricsGrid>
          <MetricCard
            title="Total Revenue"
            value="₦2,450,000"
            change={{ value: 12.5, type: 'increase', period: 'last month' }}
            icon={DollarSign}
            color="green"
            onClick={() => console.log('Revenue clicked')}
          />
          <MetricCard
            title="Active Students"
            value="1,247"
            change={{ value: -2.3, type: 'decrease', period: 'last week' }}
            icon={Users}
            color="blue"
          />
          <MetricCard
            title="Inventory Items"
            value="856"
            change={{ value: 5.7, type: 'increase', period: 'last month' }}
            icon={Package}
            color="purple"
          />
          <MetricCard
            title="Outstanding Receivables"
            value="₦450,000"
            icon={TrendingUp}
            color="yellow"
          />
        </MetricsGrid>
      </section>

      {/* Loading State */}
      <section>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Loading States</h2>
        <MetricsGrid>
          <MetricCard title="Loading Metric" value="0" icon={DollarSign} loading={true} />
          <MetricCard title="Another Loading" value="0" icon={Users} loading={true} />
        </MetricsGrid>
      </section>

      {/* Quick Actions Section */}
      <section>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Quick Action Cards</h2>
        <QuickActionsGrid>
          <QuickActionCard
            title="Financial Management"
            description="Manage accounts, receivables, and financial reports"
            icon={DollarSign}
            color="green"
            stats={[
              { label: 'Outstanding', value: '₦2.4M' },
              { label: 'Overdue', value: '₦450K' },
            ]}
            actions={[
              {
                label: 'Create Invoice',
                path: '/sales/invoices/create',
                primary: true,
                icon: Plus,
              },
              { label: 'View Receivables', path: '/receivables/dashboard', icon: Eye },
              { label: 'Record Payment', path: '/receivables/payments/record', icon: CreditCard },
              {
                label: 'Financial Reports',
                path: '/reports/financial/trial-balance',
                icon: FileText,
              },
            ]}
          />
          <QuickActionCard
            title="Client Services"
            description="Manage student entitlements and academic services"
            icon={Users}
            color="blue"
            stats={[
              { label: 'Active Students', value: '1,247' },
              { label: 'Pending Fees', value: '₦1.8M' },
            ]}
            actions={[
              {
                label: 'View Entitlements',
                path: '/incomes/entitlements',
                primary: true,
                icon: Eye,
              },
              { label: 'Fee Structures', path: '/incomes/fee-structures', icon: FileText },
              { label: 'Student Accounts', path: '/clients', icon: Users },
            ]}
          />
        </QuickActionsGrid>
      </section>

      {/* Activity Feed Section */}
      <section>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Activity Feed</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ActivityFeed activities={sampleActivities} maxItems={5} showFilters={true} />
          <ActivityFeed activities={[]} maxItems={5} showFilters={false} />
        </div>
      </section>

      {/* Loading Activity Feed */}
      <section>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Loading Activity Feed</h2>
        <ActivityFeed activities={[]} loading={true} />
      </section>
    </div>
  );
};
