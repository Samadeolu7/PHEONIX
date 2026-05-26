import { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { DollarSign, Activity, AlertCircle } from 'lucide-react';

// Loading Skeleton
function WidgetSkeleton() {
  return (
    <div className="bg-white rounded-lg shadow p-6 animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-1/3 mb-4"></div>
      <div className="h-8 bg-gray-200 rounded w-1/2 mb-4"></div>
      <div className="space-y-3">
        <div className="h-4 bg-gray-200 rounded"></div>
        <div className="h-4 bg-gray-200 rounded"></div>
        <div className="h-4 bg-gray-200 rounded w-5/6"></div>
      </div>
    </div>
  );
}

// Error State
function WidgetError({ message = '' }: any) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center space-x-2 text-red-600">
        <AlertCircle className="w-5 h-5" />
        <span className="text-sm font-medium">{message}</span>
      </div>
    </div>
  );
}

// Balance Summary Widget
function BalanceSummaryWidget(): any {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const response = await api.get('/widgets/balance-summary/data/');
      setData(response.data || response);
    } catch (err: any) {
      setError(err?.message || 'Failed to load balance data');
      console.error('Failed to load balance summary:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <WidgetSkeleton />;
  }

  if (error || !data) {
    return <WidgetError message={error || 'Failed to load balance data'} />;
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Account Balances</h3>
        <DollarSign className="w-5 h-5 text-green-600" />
      </div>

      <div className="mb-4">
        <p className="text-sm text-gray-500 mb-1">Total Balance</p>
        <p className="text-3xl font-bold text-gray-900">
          ${(data as any)?.total?.toLocaleString() || '0'}
        </p>
      </div>

      <div className="space-y-3">
        {(data as any)?.accounts?.map((account: any) => (
          <div
            key={account.id}
            className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
          >
            <span className="text-sm text-gray-700">{account.name}</span>
            <span className="text-sm font-semibold text-gray-900">
              ${account.balance?.toLocaleString() || '0'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Recent Transactions Widget
function RecentTransactionsWidget(): any {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const response = await api.get('/widgets/recent-transactions/data/');
      setData(response.data || response);
    } catch (err: any) {
      setError(err?.message || 'Failed to load transactions');
      console.error('Failed to load transactions:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <WidgetSkeleton />;
  }

  if (error || !data) {
    return <WidgetError message={error || 'Failed to load transactions'} />;
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Recent Transactions</h3>
        <Activity className="w-5 h-5 text-blue-600" />
      </div>

      <div className="space-y-3">
        {(data as any)?.results?.map((txn: any) => (
          <div
            key={txn.id}
            className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0"
          >
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">{txn.description}</p>
              <div className="flex items-center space-x-2 mt-1">
                <span className="text-xs text-gray-500">{txn.date}</span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    txn.status === 'COMPLETED'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-yellow-100 text-yellow-700'
                  }`}
                >
                  {txn.status}
                </span>
              </div>
            </div>
            <div
              className={`text-sm font-bold ${txn.amount > 0 ? 'text-green-600' : 'text-red-600'}`}
            >
              {txn.amount > 0 ? '+' : ''}${Math.abs(txn.amount).toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      <button className="w-full mt-4 text-sm text-blue-600 hover:text-blue-700 font-medium">
        View All Transactions →
      </button>
    </div>
  );
}

// Pending Approvals Widget
function PendingApprovalsWidget(): any {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const response = await api.get('/widgets/pending-approvals/data/');
      setData(response.data || response);
    } catch (err: any) {
      setError(err?.message || 'Failed to load approvals');
      console.error('Failed to load approvals:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <WidgetSkeleton />;
  }

  if (error) {
    return <WidgetError message={error} />;
  }

  const dataWithResults = (data as any)?.results;
  if (!data || !dataWithResults || dataWithResults.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Pending Approvals</h3>
          <AlertCircle className="w-5 h-5 text-orange-600" />
        </div>
        <p className="text-sm text-gray-500 text-center py-8">No pending approvals</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Pending Approvals</h3>
        <div className="flex items-center space-x-2">
          <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-semibold">
            {dataWithResults.length}
          </span>
          <AlertCircle className="w-5 h-5 text-orange-600" />
        </div>
      </div>

      <div className="space-y-3">
        {dataWithResults.map((item: any) => (
          <div key={item.id} className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">{item.type}</p>
                <p className="text-xs text-gray-600 mt-1">
                  Submitted by {item.submitted_by} • {item.submitted_at}
                </p>
              </div>
              <span className="text-sm font-bold text-gray-900">
                ${item.amount?.toLocaleString() || '0'}
              </span>
            </div>
            <div className="flex space-x-2 mt-3">
              <button className="flex-1 px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded hover:bg-green-700">
                Approve
              </button>
              <button className="flex-1 px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded hover:bg-red-700">
                Reject
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Workflow Health Widget
function WorkflowHealthWidget(): any {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const response = await api.get('/widgets/workflow-health/data/');
      setData(response.data || response);
    } catch (err: any) {
      setError(err?.message || 'Failed to load workflow data');
      console.error('Failed to load workflow health:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <WidgetSkeleton />;
  }

  if (error || !data) {
    return <WidgetError message={error || 'Failed to load workflow data'} />;
  }

  const workflowData = data as any;
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Workflow Health</h3>
        <Activity className="w-5 h-5 text-purple-600" />
      </div>

      <div className="mb-4">
        <p className="text-sm text-gray-500 mb-1">Success Rate</p>
        <p className="text-3xl font-bold text-gray-900">{workflowData.success_rate}%</p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="text-center">
          <p className="text-2xl font-bold text-green-600">{workflowData.completed}</p>
          <p className="text-xs text-gray-500 mt-1">Completed</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-yellow-600">{workflowData.pending}</p>
          <p className="text-xs text-gray-500 mt-1">Pending</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-red-600">{workflowData.failed}</p>
          <p className="text-xs text-gray-500 mt-1">Failed</p>
        </div>
      </div>

      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className="bg-green-600 h-2 rounded-full transition-all duration-500"
          style={{ width: `${workflowData.success_rate}%` }}
        />
      </div>
    </div>
  );
}

// Main DashboardPageRenderer Component
export default function DashboardPageRenderer({ config }: any) {
  if (!config || !config.widgets) {
    return (
      <div className="p-8">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-yellow-800">No dashboard configuration found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">{config.title || 'Dashboard'}</h1>
        {config.description && <p className="text-gray-600 mt-2">{config.description}</p>}
      </div>

      {/* Widgets Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {config.widgets.map((widget: any) => {
          // Render appropriate widget based on type
          switch (widget.type) {
            case 'balance_summary':
              return <BalanceSummaryWidget key={widget.id} widget={widget} />;

            case 'recent_transactions':
              return <RecentTransactionsWidget key={widget.id} widget={widget} />;

            case 'pending_approvals':
              return <PendingApprovalsWidget key={widget.id} widget={widget} />;

            case 'workflow_health':
              return <WorkflowHealthWidget key={widget.id} widget={widget} />;

            default:
              return (
                <div key={widget.id} className="bg-white rounded-lg shadow p-6">
                  <p className="text-gray-500">Unknown widget type: {widget.type}</p>
                </div>
              );
          }
        })}
      </div>
    </div>
  );
}
