// src/components/procurement/IntegrationDashboard.tsx
import React, { useState, useEffect } from 'react';
import {
  Database,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Clock,
  DollarSign,
  Package,
  RotateCcw,
  Activity,
  BarChart3,
  RefreshCw,
} from 'lucide-react';
import { useProcurementIntegration } from '../../hooks/useProcurementIntegration';
import { procurementService } from '../../services/procurementService';
import {
  PendingIntegration,
  ProcurementAnalytics,
  InventoryImpactReport,
  AccountingImpactReport,
} from '../../types/procurement';

interface IntegrationDashboardProps {
  onRefresh?: () => void;
}

export const IntegrationDashboard: React.FC<IntegrationDashboardProps> = ({ onRefresh }) => {
  const [pendingGRNs, setPendingGRNs] = useState<PendingIntegration[]>([]);
  const [pendingReturns, setPendingReturns] = useState<PendingIntegration[]>([]);
  const [analytics, setAnalytics] = useState<ProcurementAnalytics | null>(null);
  const [inventoryReport, setInventoryReport] = useState<InventoryImpactReport | null>(null);
  const [accountingReport, setAccountingReport] = useState<AccountingImpactReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { getPendingIntegrations } = useProcurementIntegration();

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load pending integrations
      const [grnPending, returnPending] = await Promise.all([
        getPendingIntegrations({ type: 'grn' }),
        getPendingIntegrations({ type: 'return' }),
      ]);

      setPendingGRNs(grnPending);
      setPendingReturns(returnPending);

      // Load analytics and reports
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const [analyticsData, inventoryData, accountingData] = await Promise.all([
        procurementService.getProcurementAnalytics({
          date_from: startDate,
          date_to: endDate,
        }),
        procurementService.getInventoryImpactReport({
          date_from: startDate,
          date_to: endDate,
        }),
        procurementService.getAccountingImpactReport({
          date_from: startDate,
          date_to: endDate,
        }),
      ]);

      setAnalytics(analyticsData);
      setInventoryReport(inventoryData);
      setAccountingReport(accountingData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    loadDashboardData();
    onRefresh?.();
  };

  const formatCurrency = (amount: string | number) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
    }).format(num);
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'bg-red-100 text-red-800';
      case 'high':
        return 'bg-orange-100 text-orange-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="animate-spin mr-2" size={20} />
        Loading integration dashboard...
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <div className="flex items-center">
          <AlertCircle className="text-red-400 mr-2" size={20} />
          <div className="text-red-800">{error}</div>
        </div>
        <button onClick={handleRefresh} className="mt-2 text-red-600 hover:text-red-800 underline">
          Try again
        </button>
      </div>
    );
  }

  const totalPending = pendingGRNs.length + pendingReturns.length;
  const urgentPending = [...pendingGRNs, ...pendingReturns].filter(
    p => p.priority === 'urgent'
  ).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Database size={24} />
          Integration Dashboard
        </h2>
        <button
          onClick={handleRefresh}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Pending Integrations</p>
              <p className="text-3xl font-bold text-gray-900">{totalPending}</p>
            </div>
            <Clock className="text-yellow-500" size={32} />
          </div>
          <div className="mt-2">
            <span className="text-sm text-gray-500">{urgentPending} urgent items</span>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">GRNs Pending</p>
              <p className="text-3xl font-bold text-blue-900">{pendingGRNs.length}</p>
            </div>
            <Package className="text-blue-500" size={32} />
          </div>
          <div className="mt-2">
            <span className="text-sm text-gray-500">
              {formatCurrency(
                pendingGRNs.reduce((sum, grn) => sum + parseFloat(grn.estimated_value), 0)
              )}{' '}
              value
            </span>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Returns Pending</p>
              <p className="text-3xl font-bold text-purple-900">{pendingReturns.length}</p>
            </div>
            <RotateCcw className="text-purple-500" size={32} />
          </div>
          <div className="mt-2">
            <span className="text-sm text-gray-500">
              {formatCurrency(
                pendingReturns.reduce((sum, ret) => sum + parseFloat(ret.estimated_value), 0)
              )}{' '}
              value
            </span>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Integration Health</p>
              <p className="text-3xl font-bold text-green-900">
                {totalPending === 0
                  ? '100%'
                  : Math.round((1 - urgentPending / totalPending) * 100) + '%'}
              </p>
            </div>
            <Activity className="text-green-500" size={32} />
          </div>
          <div className="mt-2">
            <span className="text-sm text-gray-500">System health score</span>
          </div>
        </div>
      </div>

      {/* Pending Items */}
      {totalPending > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Pending Integrations</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Number
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Pending Systems
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Priority
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Value
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Days Pending
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {[...pendingGRNs, ...pendingReturns]
                  .sort((a, b) => {
                    const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };
                    return (
                      priorityOrder[b.priority as keyof typeof priorityOrder] -
                      priorityOrder[a.priority as keyof typeof priorityOrder]
                    );
                  })
                  .slice(0, 10)
                  .map(item => (
                    <tr key={`${item.entity_type}-${item.entity_id}`}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          {item.entity_type === 'grn' ? (
                            <Package className="text-blue-500 mr-2" size={16} />
                          ) : (
                            <RotateCcw className="text-purple-500 mr-2" size={16} />
                          )}
                          <span className="text-sm font-medium text-gray-900 capitalize">
                            {item.entity_type}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {item.entity_number}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex space-x-1">
                          {item.pending_systems.map(system => (
                            <span
                              key={system}
                              className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800"
                            >
                              {system}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getPriorityColor(item.priority)}`}
                        >
                          {item.priority}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatCurrency(item.estimated_value)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {item.days_pending} days
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Analytics Summary */}
      {analytics && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
              <BarChart3 size={20} />
              Procurement Analytics (Last 30 Days)
            </h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Total Purchase Orders</span>
                <span className="text-lg font-semibold text-gray-900">
                  {analytics.total_purchase_orders}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Total PO Value</span>
                <span className="text-lg font-semibold text-gray-900">
                  {formatCurrency(analytics.total_po_value)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Total GRNs</span>
                <span className="text-lg font-semibold text-gray-900">{analytics.total_grns}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Total Returns</span>
                <span className="text-lg font-semibold text-gray-900">
                  {analytics.total_returns}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
              <TrendingUp size={20} />
              Integration Impact
            </h3>
            <div className="space-y-4">
              {inventoryReport && (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Inventory Receipts</span>
                    <span className="text-lg font-semibold text-green-600">
                      {inventoryReport.total_receipts}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Receipt Value</span>
                    <span className="text-lg font-semibold text-green-600">
                      {formatCurrency(inventoryReport.total_receipt_value)}
                    </span>
                  </div>
                </>
              )}
              {accountingReport && (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">AP Entries</span>
                    <span className="text-lg font-semibold text-blue-600">
                      {accountingReport.total_ap_entries}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Journal Entries</span>
                    <span className="text-lg font-semibold text-blue-600">
                      {accountingReport.total_journal_entries}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* No Pending Items Message */}
      {totalPending === 0 && (
        <div className="bg-green-50 border border-green-200 rounded-md p-6 text-center">
          <CheckCircle className="text-green-500 mx-auto mb-2" size={48} />
          <h3 className="text-lg font-medium text-green-800 mb-2">All Integrations Up to Date</h3>
          <p className="text-green-600">
            There are no pending integrations. All GRNs and returns have been successfully
            processed.
          </p>
        </div>
      )}
    </div>
  );
};

export default IntegrationDashboard;
