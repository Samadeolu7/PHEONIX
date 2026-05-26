// src/pages/financialReports/CashFlowStatementPage.tsx
import React, { useState, useCallback } from 'react';
import {
  DollarSign,
  Calendar,
  Download,
  TrendingUp,
  TrendingDown,
  CheckCircle,
  AlertTriangle,
  Briefcase,
  Building,
  CreditCard,
} from 'lucide-react';
import { reportsService } from '../../services/reportsService';
import { CashFlowStatement, CashFlowStatementParams, CashFlowItem } from '../../types/cashflow';
import { useToast } from '../../hooks/useToast';

const CashFlowStatementPage: React.FC = () => {
  const [cashFlow, setCashFlow] = useState<CashFlowStatement | null>(null);
  const [loading, setLoading] = useState(false);
  const [params, setParams] = useState<CashFlowStatementParams>({
    start_date: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString()
      .split('T')[0],
    end_date: new Date().toISOString().split('T')[0],
    method: 'direct',
  });

  const { success, error: showError } = useToast();

  const fetchCashFlowStatement = useCallback(async () => {
    try {
      setLoading(true);
      const response = await reportsService.getCashFlowStatement(params);

      if (response.success) {
        setCashFlow(response.data);
        success('Cash flow statement loaded successfully');
      } else {
        showError(response.error || 'Failed to load cash flow statement');
      }
    } catch (error: any) {
      console.error('Error fetching cash flow:', error);
      showError(error.message || 'Failed to fetch cash flow statement');
    } finally {
      setLoading(false);
    }
  }, [params, success, showError]);

  const handleGenerate = () => {
    fetchCashFlowStatement();
  };

  const formatCurrency = (value: string) => {
    const num = parseFloat(value);
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 2,
    }).format(num);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const renderActivitySection = (
    title: string,
    icon: React.ReactNode,
    items: CashFlowItem[],
    net: string,
    bgColor: string,
    iconColor: string
  ) => {
    const netValue = parseFloat(net);
    const isPositive = netValue > 0;

    return (
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        {/* Section Header */}
        <div className={`${bgColor} p-4 flex items-center justify-between`}>
          <div className="flex items-center">
            <div className={`p-2 ${iconColor} bg-white bg-opacity-20 rounded-lg mr-3`}>{icon}</div>
            <h3 className="text-lg font-semibold text-white">{title}</h3>
          </div>
          <div className={`flex items-center ${isPositive ? 'text-green-100' : 'text-red-100'}`}>
            {isPositive ? (
              <TrendingUp className="w-5 h-5 mr-1" />
            ) : (
              <TrendingDown className="w-5 h-5 mr-1" />
            )}
            <span className="text-xl font-bold text-white">{formatCurrency(net)}</span>
          </div>
        </div>

        {/* Items List */}
        <div className="p-4">
          {items.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No transactions in this category</p>
          ) : (
            <div className="space-y-2">
              {items.map((item, index) => {
                const amount = parseFloat(item.amount);
                const isInflow = amount > 0;

                return (
                  <div
                    key={index}
                    className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{item.description}</p>
                      {item.reference && (
                        <p className="text-xs text-gray-500 mt-1">Ref: {item.reference}</p>
                      )}
                    </div>
                    <div
                      className={`text-right ml-4 ${isInflow ? 'text-green-600' : 'text-red-600'}`}
                    >
                      <p className="text-sm font-semibold">
                        {isInflow ? '+' : ''}
                        {formatCurrency(item.amount)}
                      </p>
                      {item.date && (
                        <p className="text-xs text-gray-500">{formatDate(item.date)}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Page Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <div className="p-3 bg-blue-100 rounded-lg mr-4">
              <DollarSign className="w-8 h-8 text-blue-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Cash Flow Statement</h1>
              <p className="text-gray-600 mt-1">
                Track cash inflows and outflows across operating, investing, and financing
                activities
              </p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
              <input
                type="date"
                value={params.start_date}
                onChange={e => setParams({ ...params, start_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
              <input
                type="date"
                value={params.end_date}
                onChange={e => setParams({ ...params, end_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Method</label>
              <select
                value={params.method}
                onChange={e =>
                  setParams({ ...params, method: e.target.value as 'direct' | 'indirect' })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="direct">Direct Method</option>
                <option value="indirect">Indirect Method</option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                onClick={handleGenerate}
                disabled={loading}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {loading ? 'Generating...' : 'Generate Statement'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      )}

      {/* Cash Flow Statement Content */}
      {cashFlow && !loading && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-sm text-gray-600 mb-2">Beginning Cash</p>
              <p className="text-2xl font-bold text-gray-900">
                {formatCurrency(cashFlow.beginning_cash)}
              </p>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-sm text-gray-600 mb-2">Net Change</p>
              <p
                className={`text-2xl font-bold ${parseFloat(cashFlow.net_change_in_cash) >= 0 ? 'text-green-600' : 'text-red-600'}`}
              >
                {formatCurrency(cashFlow.net_change_in_cash)}
              </p>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-sm text-gray-600 mb-2">Ending Cash</p>
              <p className="text-2xl font-bold text-gray-900">
                {formatCurrency(cashFlow.ending_cash)}
              </p>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-sm text-gray-600 mb-2">Verification</p>
              <div className="flex items-center">
                {cashFlow.verification.is_balanced ? (
                  <>
                    <CheckCircle className="w-6 h-6 text-green-600 mr-2" />
                    <span className="text-sm font-semibold text-green-600">Balanced</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-6 h-6 text-red-600 mr-2" />
                    <span className="text-sm font-semibold text-red-600">
                      Diff: {formatCurrency(cashFlow.verification.difference || '0')}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Activity Sections */}
          <div className="space-y-6">
            {/* Operating Activities */}
            {renderActivitySection(
              'Operating Activities',
              <Briefcase className="w-6 h-6 text-blue-600" />,
              cashFlow.operating_activities.items,
              cashFlow.operating_activities.net,
              'bg-blue-600',
              'text-blue-600'
            )}

            {/* Investing Activities */}
            {renderActivitySection(
              'Investing Activities',
              <Building className="w-6 h-6 text-purple-600" />,
              cashFlow.investing_activities.items,
              cashFlow.investing_activities.net,
              'bg-purple-600',
              'text-purple-600'
            )}

            {/* Financing Activities */}
            {renderActivitySection(
              'Financing Activities',
              <CreditCard className="w-6 h-6 text-green-600" />,
              cashFlow.financing_activities.items,
              cashFlow.financing_activities.net,
              'bg-green-600',
              'text-green-600'
            )}
          </div>

          {/* Net Change Summary */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-800 rounded-lg shadow-lg p-6 text-white">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div>
                <p className="text-blue-100 text-sm mb-1">Operating</p>
                <p className="text-2xl font-bold">
                  {formatCurrency(cashFlow.operating_activities.net)}
                </p>
              </div>
              <div>
                <p className="text-blue-100 text-sm mb-1">Investing</p>
                <p className="text-2xl font-bold">
                  {formatCurrency(cashFlow.investing_activities.net)}
                </p>
              </div>
              <div>
                <p className="text-blue-100 text-sm mb-1">Financing</p>
                <p className="text-2xl font-bold">
                  {formatCurrency(cashFlow.financing_activities.net)}
                </p>
              </div>
              <div className="border-l border-blue-400 pl-6">
                <p className="text-blue-100 text-sm mb-1">Net Change in Cash</p>
                <p className="text-3xl font-bold">{formatCurrency(cashFlow.net_change_in_cash)}</p>
              </div>
            </div>
          </div>

          {/* Period Info */}
          <div className="bg-white rounded-lg shadow p-4 text-sm text-gray-600">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <Calendar className="w-4 h-4 mr-2" />
                <span>
                  Period: {formatDate(cashFlow.period.start_date)} -{' '}
                  {formatDate(cashFlow.period.end_date)}
                </span>
              </div>
              <div>
                Method: <span className="font-semibold capitalize">{cashFlow.period.method}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!cashFlow && !loading && (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <DollarSign className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No Cash Flow Data</h3>
          <p className="text-gray-600 mb-6">
            Select a date range and click "Generate Statement" to view your cash flow
          </p>
        </div>
      )}
    </div>
  );
};

export default CashFlowStatementPage;
