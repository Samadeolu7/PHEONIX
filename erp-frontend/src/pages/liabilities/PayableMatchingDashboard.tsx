/**
 * Payable 3-Way Match Dashboard (LIB-03)
 * Shows pending and failed validation payables with inline validate action.
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';
import {
  getPendingValidation,
  getFailedValidation,
  validateThreeWayMatch,
} from '../../services/liabilitiesService';
import type { AccountsPayableListItem } from '../../types/liabilities';

type TabId = 'pending' | 'failed';

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  passed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  not_required: 'bg-gray-100 text-gray-600',
};

const PayableMatchingDashboard: React.FC = () => {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabId>('pending');
  const [validatingId, setValidatingId] = useState<number | null>(null);
  const [validateError, setValidateError] = useState<string | null>(null);
  const [validateSuccess, setValidateSuccess] = useState<string | null>(null);

  const {
    data: pendingItems = [],
    isLoading: loadingPending,
    refetch: refetchPending,
  } = useQuery({
    queryKey: ['payables', 'pending-validation'],
    queryFn: getPendingValidation,
    staleTime: 30_000,
  });

  const {
    data: failedItems = [],
    isLoading: loadingFailed,
    refetch: refetchFailed,
  } = useQuery({
    queryKey: ['payables', 'failed-validation'],
    queryFn: getFailedValidation,
    staleTime: 30_000,
  });

  const validateMutation = useMutation({
    mutationFn: (id: number) => validateThreeWayMatch(id),
    onSuccess: (result, id) => {
      setValidatingId(null);
      if (result.valid) {
        setValidateSuccess(`Payable #${id} passed 3-way match validation.`);
      } else {
        setValidateError(`Payable #${id} failed validation: ${result.messages.join('; ')}`);
      }
      qc.invalidateQueries({ queryKey: ['payables'] });
      refetchPending();
      refetchFailed();
    },
    onError: (err: unknown, id) => {
      setValidatingId(null);
      const e = err as { message?: string };
      setValidateError(`Failed to validate payable #${id}: ${e?.message ?? 'Unknown error'}`);
    },
  });

  const handleValidate = (id: number) => {
    setValidateError(null);
    setValidateSuccess(null);
    setValidatingId(id);
    validateMutation.mutate(id);
  };

  const isLoading = activeTab === 'pending' ? loadingPending : loadingFailed;
  const items: AccountsPayableListItem[] = activeTab === 'pending' ? pendingItems : failedItems;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">3-Way Match Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Review and validate AP invoices against purchase orders and goods received notes.
          </p>
        </div>
        <button
          onClick={() => {
            refetchPending();
            refetchFailed();
          }}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
          <ShieldCheck className="h-8 w-8 text-yellow-500 shrink-0" />
          <div>
            <p className="text-xs font-semibold text-yellow-700 uppercase tracking-wide">
              Pending Validation
            </p>
            <p className="text-3xl font-bold text-yellow-800 mt-1">
              {loadingPending ? '…' : pendingItems.length}
            </p>
            <p className="text-xs text-yellow-600 mt-0.5">Awaiting 3-way match check</p>
          </div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <ShieldAlert className="h-8 w-8 text-red-500 shrink-0" />
          <div>
            <p className="text-xs font-semibold text-red-700 uppercase tracking-wide">
              Failed Validation
            </p>
            <p className="text-3xl font-bold text-red-800 mt-1">
              {loadingFailed ? '…' : failedItems.length}
            </p>
            <p className="text-xs text-red-600 mt-0.5">Discrepancies require resolution</p>
          </div>
        </div>
      </div>

      {/* Alert banners */}
      {validateSuccess && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
          <CheckCircle className="h-4 w-4 shrink-0" />
          <span>{validateSuccess}</span>
          <button
            aria-label="Dismiss"
            onClick={() => setValidateSuccess(null)}
            className="ml-auto font-bold"
          >
            ×
          </button>
        </div>
      )}
      {validateError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
          <XCircle className="h-4 w-4 shrink-0" />
          <span>{validateError}</span>
          <button
            aria-label="Dismiss"
            onClick={() => setValidateError(null)}
            className="ml-auto font-bold"
          >
            ×
          </button>
        </div>
      )}

      {/* Tabs + Table */}
      <div className="bg-white border rounded-lg">
        <div className="flex border-b">
          {(
            [
              { id: 'pending' as TabId, label: 'Pending Validation', count: pendingItems.length },
              { id: 'failed' as TabId, label: 'Failed Validation', count: failedItems.length },
            ] as { id: TabId; label: string; count: number }[]
          ).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium ${
                activeTab === tab.id
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                  tab.id === 'pending' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        <div className="p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              {activeTab === 'pending' ? (
                <>
                  <CheckCircle className="h-10 w-10 mx-auto mb-2 text-green-400" />
                  <p className="text-sm text-green-600 font-medium">
                    No payables pending validation
                  </p>
                </>
              ) : (
                <>
                  <CheckCircle className="h-10 w-10 mx-auto mb-2 text-green-400" />
                  <p className="text-sm text-green-600 font-medium">No failed validations</p>
                </>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="px-3 py-2 text-xs font-semibold text-gray-500">Reference</th>
                    <th className="px-3 py-2 text-xs font-semibold text-gray-500">Vendor</th>
                    <th className="px-3 py-2 text-xs font-semibold text-gray-500">Invoice #</th>
                    <th className="px-3 py-2 text-xs font-semibold text-gray-500 text-right">
                      Amount
                    </th>
                    <th className="px-3 py-2 text-xs font-semibold text-gray-500">Status</th>
                    <th className="px-3 py-2 text-xs font-semibold text-gray-500">Match Status</th>
                    <th className="px-3 py-2 text-xs font-semibold text-gray-500">Due Date</th>
                    <th className="px-3 py-2 text-xs font-semibold text-gray-500">PO #</th>
                    <th className="px-3 py-2 text-xs font-semibold text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map(item => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <Link
                          to={`/liabilities/payables/${item.id}`}
                          className="text-blue-600 hover:underline font-medium"
                        >
                          {item.reference_number}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-gray-900">{item.vendor_name}</td>
                      <td className="px-3 py-2 text-gray-600">{item.invoice_number}</td>
                      <td className="px-3 py-2 text-right text-gray-900">
                        ₦{parseFloat(item.total_amount).toLocaleString()}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${
                            item.status === 'overdue'
                              ? 'bg-red-100 text-red-700'
                              : item.status === 'partial'
                                ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {item.status}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${
                            STATUS_BADGE[item.three_way_match_status] ?? 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {item.three_way_match_status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-500">{item.due_date}</td>
                      <td className="px-3 py-2 text-gray-500">
                        {item.purchase_order_number ?? '—'}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          {activeTab === 'pending' && (
                            <button
                              onClick={() => handleValidate(item.id)}
                              disabled={validateMutation.isPending && validatingId === item.id}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                            >
                              {validateMutation.isPending && validatingId === item.id ? (
                                <>
                                  <span className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full" />
                                  Checking…
                                </>
                              ) : (
                                <>
                                  <ShieldCheck className="h-3 w-3" />
                                  Validate
                                </>
                              )}
                            </button>
                          )}
                          {activeTab === 'failed' && (
                            <button
                              onClick={() => handleValidate(item.id)}
                              disabled={validateMutation.isPending && validatingId === item.id}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50"
                            >
                              {validateMutation.isPending && validatingId === item.id ? (
                                <>
                                  <span className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full" />
                                  Re-checking…
                                </>
                              ) : (
                                <>
                                  <AlertTriangle className="h-3 w-3" />
                                  Re-validate
                                </>
                              )}
                            </button>
                          )}
                          <Link
                            to={`/liabilities/payables/${item.id}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
                          >
                            <ExternalLink className="h-3 w-3" />
                            View
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PayableMatchingDashboard;
