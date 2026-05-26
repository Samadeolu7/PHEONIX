/**
 * Petty Cash Fund Detail Page
 * View fund details, recent vouchers, reimbursement history
 */

import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import {
  WalletIcon,
  ArrowLeftIcon,
  EditIcon,
  FileTextIcon,
  RefreshCwIcon,
  TrendingUpIcon,
  TrendingDownIcon,
  ClockIcon,
  CheckCircle2Icon,
  AlertCircleIcon,
} from 'lucide-react';
import {
  usePettyCashFund,
  usePettyCashFundSummary,
  usePettyCashVouchers,
  usePettyCashReplenishments,
} from '../../hooks/usePettyCash';

/** Safely format a nullable/undefined date string; returns fallback on invalid values. */
const safeDate = (value: string | null | undefined, fmt: string, fallback = '\u2014'): string => {
  if (!value) return fallback;
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return fallback;
    return format(d, fmt);
  } catch {
    return fallback;
  }
};

export const PettyCashFundDetail: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const fundId = parseInt(id || '0');

  const [activeTab, setActiveTab] = useState<'overview' | 'vouchers' | 'replenishments'>(
    'overview'
  );

  // Fetch fund data
  const { data: fund, isLoading: loadingFund } = usePettyCashFund(fundId);
  const { data: summary, isLoading: loadingSummary } = usePettyCashFundSummary(fundId);
  const { data: recentVouchers = [] } = usePettyCashVouchers({ fund: fundId });
  const { data: replenishments = [] } = usePettyCashReplenishments({ fund: fundId });

  if (loadingFund || loadingSummary) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-64"></div>
          <div className="grid grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!fund) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h3 className="font-semibold text-red-900">Fund Not Found</h3>
          <p className="text-sm text-red-700 mt-1">
            The petty cash fund you're looking for doesn't exist.
          </p>
          <button
            onClick={() => navigate('/treasury/petty-cash')}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const balance = parseFloat(fund.current_balance);
  const floatAmount = parseFloat(fund.float_amount);
  const percentage = (balance / floatAmount) * 100;
  const needsReplenishment = percentage < 30;
  const disbursedUnretired = parseFloat(fund.disbursed_amount || '0');

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/treasury/petty-cash')}
            title="Back to Petty Cash"
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeftIcon className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <WalletIcon className="h-8 w-8" />
              {fund.fund_name}
            </h1>
            <p className="text-gray-600 mt-1">
              Custodian: {fund.custodian_name} • Status:{' '}
              <span
                className={`font-semibold ${fund.status === 'active' ? 'text-green-600' : 'text-gray-600'}`}
              >
                {fund.status === 'active' ? 'Active' : fund.status}
              </span>
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => navigate(`/treasury/petty-cash/funds/${fundId}/edit`)}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
          >
            <EditIcon className="h-4 w-4" />
            Edit Fund
          </button>
          <button
            onClick={() => navigate('/treasury/petty-cash/vouchers/new')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <FileTextIcon className="h-4 w-4" />
            New Voucher
          </button>
          <button
            onClick={() => navigate(`/treasury/petty-cash/replenishments/new?fund=${fundId}`)}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
          >
            <RefreshCwIcon className="h-4 w-4" />
            Request Reimbursement
          </button>
        </div>
      </div>

      {/* Alert */}
      {needsReplenishment && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircleIcon className="h-5 w-5 text-yellow-600 mt-0.5" />
            <div>
              <h3 className="font-semibold text-yellow-900">Low Balance Alert</h3>
              <p className="text-sm text-yellow-700 mt-1">
                This fund is below 30% of its float amount. Consider requesting a reimbursement.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Float Amount */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Float Amount</p>
              <p className="text-2xl font-bold mt-1">₦{floatAmount.toLocaleString()}</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-lg">
              <WalletIcon className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>

        {/* Current Balance */}
        <div
          className={`rounded-lg shadow p-6 ${needsReplenishment ? 'bg-yellow-50' : 'bg-white'}`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Current Balance</p>
              <p className="text-2xl font-bold mt-1">₦{balance.toLocaleString()}</p>
              <p className="text-xs text-gray-500 mt-1">{percentage.toFixed(1)}% of float</p>
            </div>
            <div
              className={`p-3 rounded-lg ${needsReplenishment ? 'bg-yellow-200' : 'bg-green-100'}`}
            >
              {needsReplenishment ? (
                <TrendingDownIcon className="h-6 w-6 text-yellow-600" />
              ) : (
                <CheckCircle2Icon className="h-6 w-6 text-green-600" />
              )}
            </div>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 mt-3">
            <div
              className={`h-2 rounded-full ${needsReplenishment ? 'bg-yellow-500' : 'bg-green-500'}`}
              style={{ width: `${Math.min(percentage, 100)}%` }}
            ></div>
          </div>
        </div>

        {/* Disbursed Unretired */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Disbursed Unretired</p>
              <p className="text-2xl font-bold mt-1">₦{disbursedUnretired.toLocaleString()}</p>
            </div>
            <div className="p-3 bg-orange-100 rounded-lg">
              <ClockIcon className="h-6 w-6 text-orange-600" />
            </div>
          </div>
        </div>

        {/* Total Vouchers */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Vouchers</p>
              <p className="text-2xl font-bold mt-1">
                {summary?.statistics?.total_vouchers ?? recentVouchers.length}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {summary?.statistics?.pending_vouchers ?? 0} pending
              </p>
            </div>
            <div className="p-3 bg-purple-100 rounded-lg">
              <FileTextIcon className="h-6 w-6 text-purple-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Fund Information Card */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Fund Information</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-gray-600">Fund Code</p>
            <p className="font-medium">{fund.fund_code}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Custodian</p>
            <p className="font-medium">{fund.custodian_name}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">GL Account</p>
            <p className="font-medium">
              {fund.petty_cash_account_name || `Account #${fund.petty_cash_account}`}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Status</p>
            <p className="font-medium capitalize">{fund.status}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Established Date</p>
            <p className="font-medium">{safeDate(fund.established_date, 'MMM dd, yyyy')}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Created</p>
            <p className="font-medium">{safeDate(fund.created_at, 'MMM dd, yyyy')}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow">
        <div className="border-b px-6">
          <div className="flex gap-6">
            <button
              onClick={() => setActiveTab('overview')}
              className={`py-4 border-b-2 font-medium transition-colors ${
                activeTab === 'overview'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('vouchers')}
              className={`py-4 border-b-2 font-medium transition-colors ${
                activeTab === 'vouchers'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Vouchers ({recentVouchers.length})
            </button>
            <button
              onClick={() => setActiveTab('replenishments')}
              className={`py-4 border-b-2 font-medium transition-colors ${
                activeTab === 'replenishments'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Reimbursements ({replenishments.length})
            </button>
          </div>
        </div>

        <div className="p-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Recent Activity */}
                <div>
                  <h3 className="font-semibold mb-3">Recent Vouchers</h3>
                  <div className="space-y-2">
                    {recentVouchers.slice(0, 5).map(voucher => (
                      <button
                        key={voucher.id}
                        onClick={() => navigate(`/treasury/petty-cash/vouchers/${voucher.id}`)}
                        className="w-full text-left p-3 border rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <p className="font-medium text-sm">{voucher.voucher_number}</p>
                            <p className="text-xs text-gray-600 mt-1">{voucher.payee_name}</p>
                          </div>
                          <span className="text-sm font-semibold">
                            ₦{parseFloat(voucher.amount).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-xs text-gray-500">
                            {safeDate(voucher.voucher_date, 'MMM dd')}
                          </span>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${
                              voucher.status === 'approved'
                                ? 'bg-green-100 text-green-800'
                                : voucher.status === 'pending'
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {voucher.status}
                          </span>
                        </div>
                      </button>
                    ))}
                    {recentVouchers.length === 0 && (
                      <p className="text-sm text-gray-500 text-center py-8">No vouchers yet</p>
                    )}
                  </div>
                </div>

                {/* Balance History Chart Placeholder */}
                <div>
                  <h3 className="font-semibold mb-3">Balance Trend</h3>
                  <div className="border rounded-lg p-6 text-center">
                    <TrendingUpIcon className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-sm text-gray-500">Balance trend chart coming soon</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'vouchers' && (
            <div className="space-y-3">
              {recentVouchers.length === 0 ? (
                <div className="text-center py-12">
                  <FileTextIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500 mb-4">No vouchers for this fund yet</p>
                  <button
                    onClick={() => navigate('/treasury/petty-cash/vouchers/new')}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Create First Voucher
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Voucher #
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Payee
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Amount
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Date
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {recentVouchers.map(voucher => (
                        <tr
                          key={voucher.id}
                          onClick={() => navigate(`/treasury/petty-cash/vouchers/${voucher.id}`)}
                          className="hover:bg-gray-50 cursor-pointer"
                        >
                          <td className="px-4 py-3 text-sm font-medium text-blue-600">
                            {voucher.voucher_number}
                          </td>
                          <td className="px-4 py-3 text-sm">{voucher.payee_name}</td>
                          <td className="px-4 py-3 text-sm font-semibold">
                            ₦{parseFloat(voucher.amount).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">
                            {safeDate(voucher.voucher_date, 'MMM dd, yyyy')}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <span
                              className={`px-2 py-1 rounded-full text-xs font-semibold ${
                                voucher.status === 'approved'
                                  ? 'bg-green-100 text-green-800'
                                  : voucher.status === 'pending'
                                    ? 'bg-yellow-100 text-yellow-800'
                                    : voucher.status === 'disbursed'
                                      ? 'bg-blue-100 text-blue-800'
                                      : 'bg-gray-100 text-gray-800'
                              }`}
                            >
                              {voucher.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'replenishments' && (
            <div className="space-y-3">
              {replenishments.length === 0 ? (
                <div className="text-center py-12">
                  <RefreshCwIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500 mb-4">No reimbursements for this fund yet</p>
                  <button
                    onClick={() =>
                      navigate(`/treasury/petty-cash/replenishments/new?fund=${fundId}`)
                    }
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    Request Reimbursement
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {replenishments.map(rep => (
                    <button
                      key={rep.id}
                      onClick={() => navigate(`/treasury/petty-cash/replenishments/${rep.id}`)}
                      className="w-full text-left p-4 border rounded-lg hover:shadow transition-shadow"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="font-medium">{rep.replenishment_number}</p>
                          <p className="text-sm text-gray-600 mt-1">
                            {safeDate(rep.replenishment_date, 'MMM dd, yyyy')}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-semibold">
                            ₦{parseFloat(rep.replenishment_amount).toLocaleString()}
                          </p>
                          <span
                            className={`text-xs px-2 py-1 rounded-full ${
                              rep.status === 'posted'
                                ? 'bg-green-100 text-green-800'
                                : rep.status === 'approved'
                                  ? 'bg-blue-100 text-blue-800'
                                  : rep.status === 'under_review'
                                    ? 'bg-purple-100 text-purple-800'
                                    : 'bg-yellow-100 text-yellow-800'
                            }`}
                          >
                            {rep.status}
                          </span>
                        </div>
                      </div>
                      {rep.verified_by_name && (
                        <p className="text-xs text-gray-500">Verified by: {rep.verified_by_name}</p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
