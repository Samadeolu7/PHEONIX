/**
 * Petty Cash Dashboard Page
 * Overview of all petty cash funds, pending vouchers, and reimbursements
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import {
  WalletIcon,
  AlertCircleIcon,
  CheckCircle2Icon,
  XCircleIcon,
  ClockIcon,
  TrendingUpIcon,
  FileTextIcon,
  RefreshCwIcon,
} from 'lucide-react';
import {
  useDefaultPettyCashFund,
  usePettyCashVouchers,
  usePettyCashReplenishments,
} from '../../hooks/usePettyCash';
import { PettyCashFund, PettyCashVoucher, PettyCashReplenishment } from '../../types/pettyCash';

/** Safely format a nullable/undefined date string; returns fallback on bad values. */
const safeDate = (value: string | null | undefined, fmt: string, fallback = '—'): string => {
  if (!value) return fallback;
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return fallback;
    return format(d, fmt);
  } catch {
    return fallback;
  }
};

export const PettyCashDashboard: React.FC = () => {
  const navigate = useNavigate();

  // Fetch data
  const { data: defaultFund, isLoading: loadingFunds } = useDefaultPettyCashFund();
  const funds = defaultFund ? [defaultFund] : [];
  const { data: pendingVouchers = [], isLoading: loadingVouchers } = usePettyCashVouchers({
    status: 'pending',
  });
  const { data: approvedVouchers = [] } = usePettyCashVouchers({ status: 'approved' });
  const { data: retiredVouchers = [] } = usePettyCashVouchers({ status: 'retired' });
  const { data: pendingReplenishments = [] } = usePettyCashReplenishments({ status: 'pending' });
  const { data: verifiedReplenishments = [] } = usePettyCashReplenishments({ status: 'verified' });

  // Calculate summary metrics
  const totalFunds = funds.length;
  const totalFloat = funds.reduce((sum, fund) => sum + parseFloat(fund.float_amount), 0);
  const totalBalance = funds.reduce((sum, fund) => sum + parseFloat(fund.current_balance), 0);
  const totalDisbursedUnretired = funds.reduce(
    (sum, fund) => sum + parseFloat(fund.disbursed_unretired || '0'),
    0
  );

  // Identify funds needing attention
  const fundsNeedingReplenishment = funds.filter(fund => {
    const balance = parseFloat(fund.current_balance);
    const floatAmount = parseFloat(fund.float_amount);
    return balance < floatAmount * 0.3; // Less than 30% of float
  });

  if (loadingFunds || loadingVouchers) {
    return (
      <div className="p-8 space-y-6">
        <div className="animate-pulse">
          <div className="h-12 bg-gray-200 rounded w-64 mb-4"></div>
          <div className="grid grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Petty Cash Management</h1>
          <p className="text-gray-600">
            Monitor and manage all petty cash funds - {format(new Date(), 'EEEE, MMMM dd, yyyy')}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => navigate('/treasury/petty-cash/replenishments')}
            className="px-4 py-2 border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 flex items-center gap-2"
          >
            <RefreshCwIcon className="h-5 w-5" />
            Reimbursements
          </button>
          <button
            onClick={() => navigate('/treasury/petty-cash/vouchers/new')}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
          >
            <FileTextIcon className="h-5 w-5" />
            New Voucher
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Total Funds */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Active Funds</p>
              <p className="text-2xl font-bold mt-1">{totalFunds}</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-lg">
              <WalletIcon className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>

        {/* Total Float */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Float</p>
              <p className="text-2xl font-bold mt-1">${totalFloat.toLocaleString()}</p>
            </div>
            <div className="p-3 bg-green-100 rounded-lg">
              <TrendingUpIcon className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </div>

        {/* Current Balance */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Current Balance</p>
              <p className="text-2xl font-bold mt-1">${totalBalance.toLocaleString()}</p>
            </div>
            <div className="p-3 bg-purple-100 rounded-lg">
              <CheckCircle2Icon className="h-6 w-6 text-purple-600" />
            </div>
          </div>
        </div>

        {/* Disbursed Unretired */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Disbursed Unretired</p>
              <p className="text-2xl font-bold mt-1">${totalDisbursedUnretired.toLocaleString()}</p>
            </div>
            <div className="p-3 bg-orange-100 rounded-lg">
              <ClockIcon className="h-6 w-6 text-orange-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {fundsNeedingReplenishment.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircleIcon className="h-5 w-5 text-yellow-600 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-yellow-900">Funds Need Reimbursement</h3>
              <p className="text-sm text-yellow-700 mt-1">
                {fundsNeedingReplenishment.length} fund(s) are below 30% of their float amount:
              </p>
              <ul className="mt-2 space-y-1">
                {fundsNeedingReplenishment.map(fund => (
                  <li key={fund.id} className="text-sm text-yellow-700">
                    <button
                      onClick={() => navigate(`/treasury/petty-cash/funds/${fund.id}`)}
                      className="hover:underline font-medium"
                    >
                      {fund.fund_name}
                    </button>
                    {' - '}${parseFloat(fund.current_balance).toLocaleString()} of $
                    {parseFloat(fund.float_amount).toLocaleString()}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Action Items */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pending Approvals */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Pending Approvals</h2>
              <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-semibold rounded">
                {pendingVouchers.length}
              </span>
            </div>
          </div>
          <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
            {pendingVouchers.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">No pending vouchers</p>
            ) : (
              pendingVouchers.map((voucher: PettyCashVoucher) => (
                <button
                  key={voucher.id}
                  onClick={() => navigate(`/treasury/petty-cash/vouchers/${voucher.id}`)}
                  className="w-full text-left p-3 border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-medium text-sm">{voucher.voucher_number}</span>
                    <span className="text-sm font-semibold text-green-600">
                      ₦{parseFloat(voucher.amount).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 line-clamp-2">{voucher.purpose}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {voucher.requested_by_name} • {safeDate(voucher.voucher_date, 'MMM dd')}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Approved & Ready for Disbursement */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Ready to Disburse</h2>
              <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-semibold rounded">
                {approvedVouchers.length}
              </span>
            </div>
          </div>
          <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
            {approvedVouchers.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">No approved vouchers</p>
            ) : (
              approvedVouchers.map((voucher: PettyCashVoucher) => (
                <button
                  key={voucher.id}
                  onClick={() => navigate(`/treasury/petty-cash/vouchers/${voucher.id}`)}
                  className="w-full text-left p-3 border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-medium text-sm">{voucher.voucher_number}</span>
                    <span className="text-sm font-semibold text-green-600">
                      ₦{parseFloat(voucher.amount).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 line-clamp-2">{voucher.purpose}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {voucher.fund_name} • Approved {safeDate(voucher.approved_at, 'MMM dd')}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Awaiting Retirement */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Awaiting Retirement</h2>
              <span className="px-2 py-1 bg-orange-100 text-orange-800 text-xs font-semibold rounded">
                {retiredVouchers.length}
              </span>
            </div>
          </div>
          <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
            {retiredVouchers.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">No vouchers to retire</p>
            ) : (
              retiredVouchers.map((voucher: PettyCashVoucher) => (
                <button
                  key={voucher.id}
                  onClick={() => navigate(`/treasury/petty-cash/vouchers/${voucher.id}`)}
                  className="w-full text-left p-3 border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-medium text-sm">{voucher.voucher_number}</span>
                    <span className="text-sm font-semibold text-green-600">
                      ₦{parseFloat(voucher.amount).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 line-clamp-2">{voucher.purpose}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Disbursed {safeDate(voucher.disbursed_at, 'MMM dd')}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Reimbursements Section */}
      {(pendingReplenishments.length > 0 || verifiedReplenishments.length > 0) && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <RefreshCwIcon className="h-6 w-6 text-blue-600" />
            <h2 className="text-lg font-semibold text-blue-900">Active Reimbursements</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pendingReplenishments.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-blue-800 mb-2">Pending Verification</h3>
                <div className="space-y-2">
                  {pendingReplenishments.map((rep: PettyCashReplenishment) => (
                    <button
                      key={rep.id}
                      onClick={() => navigate(`/treasury/petty-cash/replenishments/${rep.id}`)}
                      className="w-full text-left p-3 bg-white border rounded-lg hover:shadow transition-shadow"
                    >
                      <div className="flex justify-between items-start">
                        <span className="font-medium text-sm">{rep.replenishment_number}</span>
                        <span className="text-sm font-semibold">
                          ₦{parseFloat(rep.replenishment_amount).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 mt-1">{rep.fund_name}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {verifiedReplenishments.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-blue-800 mb-2">Awaiting Approval</h3>
                <div className="space-y-2">
                  {verifiedReplenishments.map((rep: PettyCashReplenishment) => (
                    <button
                      key={rep.id}
                      onClick={() => navigate(`/treasury/petty-cash/replenishments/${rep.id}`)}
                      className="w-full text-left p-3 bg-white border rounded-lg hover:shadow transition-shadow"
                    >
                      <div className="flex justify-between items-start">
                        <span className="font-medium text-sm">{rep.replenishment_number}</span>
                        <span className="text-sm font-semibold">
                          ₦{parseFloat(rep.replenishment_amount).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 mt-1">{rep.fund_name}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Petty Cash Funds */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Petty Cash Fund</h2>
          </div>
        </div>
        <div className="p-6">
          {funds.length === 0 ? (
            <div className="text-center py-12">
              <WalletIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 mb-2">No petty cash fund found</p>
              <p className="text-sm text-gray-400">
                Contact your administrator to set up the petty cash fund.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {funds.map((fund: PettyCashFund) => {
                const balance = parseFloat(fund.current_balance);
                const floatAmount = parseFloat(fund.float_amount);
                const percentage = (balance / floatAmount) * 100;
                const needsReplenishment = percentage < 30;

                return (
                  <button
                    key={fund.id}
                    onClick={() => navigate(`/treasury/petty-cash/funds/${fund.id}`)}
                    className="text-left p-5 border rounded-lg hover:shadow-lg transition-shadow"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="font-semibold text-lg">{fund.fund_name}</h3>
                        <p className="text-sm text-gray-600">{fund.custodian_name}</p>
                      </div>
                      {needsReplenishment && (
                        <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-semibold rounded">
                          Low
                        </span>
                      )}
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Balance:</span>
                        <span className="font-semibold">₦{balance.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Float:</span>
                        <span>₦{floatAmount.toLocaleString()}</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${
                            needsReplenishment ? 'bg-yellow-500' : 'bg-green-500'
                          }`}
                          style={{ width: `${Math.min(percentage, 100)}%` }}
                        ></div>
                      </div>
                      <p className="text-xs text-gray-500 text-right">
                        {percentage.toFixed(1)}% of float
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
