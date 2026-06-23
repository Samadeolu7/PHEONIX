/**
 * Cash Reconciliation Page (BNK-03)
 * Cashier daily cash close — physical count vs system balance reconciliation.
 */

import React, { useState } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Plus, RefreshCw, Calculator, MinusCircle } from 'lucide-react';
import { createReconciliationDeduction } from '../../services/paymentService';
import {
  useCashReconciliations,
  useCreateCashReconciliation,
  useFinanceOfficerSignoff,
  useActiveCashierAccounts,
} from '../../hooks/useTreasury';
import { useApprovalGuard } from '../../hooks/useApprovalGuard';
import type { CashReconciliation, CreateCashReconciliationRequest } from '../../types/treasury';

// ─── Nigerian denomination list ──────────────────────────────────────────────

const DENOMINATIONS = [1000, 500, 200, 100, 50, 20, 10, 5, 2, 1];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatCurrency = (value: string | number): string => {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(
    typeof value === 'string' ? parseFloat(value) : value
  );
};

const formatDate = (iso: string): string => {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const STATUS_BADGE: Record<string, string> = {
  balanced: 'bg-green-100 text-green-700',
  variance: 'bg-red-100 text-red-700',
  resolved: 'bg-gray-100 text-gray-600',
};

const STATUS_LABEL: Record<string, string> = {
  balanced: 'Balanced',
  variance: 'Variance',
  resolved: 'Resolved',
};

// ─── Component ───────────────────────────────────────────────────────────────

const CashReconciliationPage: React.FC = () => {
  const { canUserApprove } = useApprovalGuard();

  // List filters
  const [statusFilter, setStatusFilter] = useState('');

  // Create modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [form, setForm] = useState<CreateCashReconciliationRequest>({
    cashier_account: 0,
    reconciliation_date: new Date().toISOString().split('T')[0],
    physical_count: '',
    denomination_details: undefined,
    variance_explanation: '',
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Denomination calculator state
  const [showDenomCalc, setShowDenomCalc] = useState(false);
  const [denomCounts, setDenomCounts] = useState<Record<number, string>>(
    Object.fromEntries(DENOMINATIONS.map(d => [d, '']))
  );

  // Sign-off modal state
  const [signoffModal, setSignoffModal] = useState<{
    open: boolean;
    reconciliationId: number | null;
  }>({
    open: false,
    reconciliationId: null,
  });
  const [signoffNotes, setSignoffNotes] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  // Salary deduction modal state
  const [deductionModal, setDeductionModal] = useState<{
    open: boolean;
    reconciliation: { id: number; variance: string; cashier_name?: string } | null;
  }>({ open: false, reconciliation: null });
  const [deductionForm, setDeductionForm] = useState({ monthly_installment: '', start_month: '', notes: '' });
  const [deductionLoading, setDeductionLoading] = useState(false);
  const [deductionSuccess, setDeductionSuccess] = useState('');

  // Queries / mutations
  const filters = statusFilter ? { status: statusFilter } : undefined;
  const {
    data: reconciliations = [],
    isLoading,
    isFetching,
    refetch,
  } = useCashReconciliations(filters);
  const { data: cashierAccounts = [] } = useActiveCashierAccounts();
  const createMutation = useCreateCashReconciliation();
  const signoffMutation = useFinanceOfficerSignoff();

  // Computed denomination total
  const denomTotal = DENOMINATIONS.reduce((sum, d) => {
    const count = parseInt(denomCounts[d] || '0', 10);
    return sum + (isNaN(count) ? 0 : count * d);
  }, 0);

  // Summary stats
  const balancedCount = reconciliations.filter(r => r.status === 'balanced').length;
  const varianceCount = reconciliations.filter(r => r.status === 'variance').length;

  // ── Handlers ────────────────────────────────────────────────────────────────

  const openCreateModal = () => {
    setForm({
      cashier_account: cashierAccounts[0]?.id ?? 0,
      reconciliation_date: new Date().toISOString().split('T')[0],
      physical_count: '',
      denomination_details: undefined,
      variance_explanation: '',
    });
    setDenomCounts(Object.fromEntries(DENOMINATIONS.map(d => [d, ''])));
    setShowDenomCalc(false);
    setFormErrors({});
    setShowCreateModal(true);
  };

  const applyDenomTotal = () => {
    setForm(f => ({ ...f, physical_count: denomTotal.toFixed(2) }));
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!form.cashier_account) errors.cashier_account = 'Please select a cashier account';
    if (!form.reconciliation_date) errors.reconciliation_date = 'Date is required';
    if (!form.physical_count || isNaN(parseFloat(form.physical_count))) {
      errors.physical_count = 'Please enter a valid physical cash count';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreateSubmit = async () => {
    if (!validateForm()) return;
    setActionError(null);
    try {
      const payload: CreateCashReconciliationRequest = {
        cashier_account: form.cashier_account,
        reconciliation_date: form.reconciliation_date,
        physical_count: form.physical_count,
        variance_explanation: form.variance_explanation || undefined,
      };
      // Only include denomination_details if any counts were entered
      const filledDenoms = Object.fromEntries(
        DENOMINATIONS.filter(d => parseInt(denomCounts[d] || '0', 10) > 0).map(d => [
          String(d),
          parseInt(denomCounts[d], 10),
        ])
      );
      if (Object.keys(filledDenoms).length > 0) {
        payload.denomination_details = filledDenoms;
      }
      await createMutation.mutateAsync(payload);
      setShowCreateModal(false);
    } catch (err: unknown) {
      const e = err as {
        details?: { error?: string; non_field_errors?: string[] };
        message?: string;
      };
      setActionError(
        e?.details?.error ||
          e?.details?.non_field_errors?.join(' ') ||
          (err instanceof Error ? err.message : 'Failed to create reconciliation')
      );
    }
  };

  const handleSignoffSubmit = async () => {
    if (!signoffModal.reconciliationId) return;
    setActionError(null);
    try {
      await signoffMutation.mutateAsync({
        id: signoffModal.reconciliationId,
        data: { finance_officer_notes: signoffNotes || undefined },
      });
      setSignoffModal({ open: false, reconciliationId: null });
      setSignoffNotes('');
    } catch (err: unknown) {
      const e = err as { details?: { error?: string }; message?: string };
      setActionError(e?.details?.error || (err instanceof Error ? err.message : 'Sign-off failed'));
    }
  };

  const handleDeductionSubmit = async () => {
    if (!deductionModal.reconciliation) return;
    setDeductionLoading(true);
    setActionError(null);
    try {
      const shortfall = Math.abs(parseFloat(deductionModal.reconciliation.variance));
      const result = await createReconciliationDeduction({
        reconciliation_id: deductionModal.reconciliation.id,
        monthly_installment: deductionForm.monthly_installment || String(shortfall),
        start_month: deductionForm.start_month || undefined,
        notes: deductionForm.notes || undefined,
      });
      setDeductionSuccess(
        `Salary deduction IOU #${result.reference_number} created for ${result.staff_name}. ` +
        `Status: Pending Director Approval.`
      );
      setDeductionModal({ open: false, reconciliation: null });
    } catch (err: unknown) {
      const e = err as { details?: { detail?: string }; message?: string };
      setActionError(e?.details?.detail || (err instanceof Error ? err.message : 'Failed to create deduction'));
    } finally {
      setDeductionLoading(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cash Reconciliation</h1>
          <p className="text-sm text-gray-500 mt-1">
            Daily cashier shift close — physical cash count vs system balance
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isFetching && !isLoading && (
            <span className="flex items-center gap-1 text-sm text-gray-500">
              <RefreshCw className="h-3 w-3 animate-spin" /> Refreshing…
            </span>
          )}
          <button
            onClick={() => refetch()}
            className="p-2 text-gray-500 hover:text-gray-700 border border-gray-300 rounded-lg"
            aria-label="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
          >
            <Plus className="h-4 w-4" />
            New Reconciliation
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border rounded-lg p-4 flex items-center gap-3">
          <div className="p-2 bg-blue-50 rounded-lg">
            <Calculator className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Total Records</p>
            <p className="text-2xl font-bold text-gray-900">{reconciliations.length}</p>
          </div>
        </div>
        <div className="bg-white border rounded-lg p-4 flex items-center gap-3">
          <div className="p-2 bg-green-50 rounded-lg">
            <CheckCircle className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Balanced</p>
            <p className="text-2xl font-bold text-green-700">{balancedCount}</p>
          </div>
        </div>
        <div className="bg-white border rounded-lg p-4 flex items-center gap-3">
          <div className="p-2 bg-red-50 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-red-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Variance</p>
            <p className="text-2xl font-bold text-red-700">{varianceCount}</p>
          </div>
        </div>
      </div>

      {/* Status Filter */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-600">Filter:</span>
        {['', 'balanced', 'variance', 'resolved'].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              statusFilter === s
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
            }`}
          >
            {s === '' ? 'All' : STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {/* Error Banner */}
      {actionError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {actionError}
        </div>
      )}

      {/* Deduction Success Banner */}
      {deductionSuccess && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm flex items-start gap-2">
          <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            {deductionSuccess}
            <button onClick={() => setDeductionSuccess('')} className="ml-2 underline text-xs">Dismiss</button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white border rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500">Loading reconciliations…</div>
        ) : reconciliations.length === 0 ? (
          <div className="p-8 text-center">
            <Calculator className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">
              {statusFilter
                ? 'No reconciliations match the current filter.'
                : 'No reconciliations yet.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm divide-y divide-gray-100">
              <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 text-left">Cashier</th>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-right">System Balance</th>
                  <th className="px-4 py-3 text-right">Physical Count</th>
                  <th className="px-4 py-3 text-right">Variance</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Reconciled By</th>
                  <th className="px-4 py-3 text-left">Finance Sign-off</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {reconciliations.map((rec: CashReconciliation) => {
                  const varianceAmt = parseFloat(rec.variance);
                  const isPositiveVariance = varianceAmt > 0;
                  const hasVariance = varianceAmt !== 0;
                  return (
                    <tr key={rec.id} className="hover:bg-gray-50">
                      {/* Cashier */}
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {rec.cashier_name || `Account #${rec.cashier_account}`}
                      </td>

                      {/* Date */}
                      <td className="px-4 py-3 text-gray-600">
                        {formatDate(rec.reconciliation_date)}
                      </td>

                      {/* System Balance */}
                      <td className="px-4 py-3 text-right text-gray-700">
                        {formatCurrency(rec.system_balance)}
                      </td>

                      {/* Physical Count */}
                      <td className="px-4 py-3 text-right text-gray-700">
                        {formatCurrency(rec.physical_count)}
                      </td>

                      {/* Variance */}
                      <td
                        className={`px-4 py-3 text-right font-semibold ${
                          hasVariance
                            ? isPositiveVariance
                              ? 'text-green-600'
                              : 'text-red-600'
                            : 'text-gray-500'
                        }`}
                      >
                        {hasVariance ? (isPositiveVariance ? '+' : '') : ''}
                        {formatCurrency(rec.variance)}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[rec.status] ?? 'bg-gray-100 text-gray-600'}`}
                        >
                          {rec.status === 'balanced' && <CheckCircle className="h-3 w-3" />}
                          {rec.status === 'variance' && <AlertTriangle className="h-3 w-3" />}
                          {rec.status === 'resolved' && <XCircle className="h-3 w-3" />}
                          {STATUS_LABEL[rec.status] ?? rec.status}
                        </span>
                      </td>

                      {/* Reconciled By */}
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {rec.reconciled_by_name ?? '—'}
                      </td>

                      {/* Finance Sign-off */}
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {rec.finance_officer_signoff_name ? (
                          <span className="text-green-600 flex items-center gap-1">
                            <CheckCircle className="h-3 w-3" />
                            {rec.finance_officer_signoff_name}
                          </span>
                        ) : (
                          <span className="text-gray-400">Pending</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2 flex-wrap">
                          {!rec.finance_officer_signoff && canUserApprove && (
                            <button
                              onClick={() => {
                                setSignoffNotes('');
                                setActionError(null);
                                setSignoffModal({ open: true, reconciliationId: rec.id });
                              }}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded hover:bg-blue-100"
                            >
                              <CheckCircle className="h-3 w-3" />
                              Sign Off
                            </button>
                          )}
                          {rec.status === 'variance' && varianceAmt < 0 && (
                            <button
                              onClick={() => {
                                setDeductionForm({ monthly_installment: '', start_month: '', notes: '' });
                                setActionError(null);
                                setDeductionModal({ open: true, reconciliation: { id: rec.id, variance: rec.variance, cashier_name: rec.cashier_name } });
                              }}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-red-50 text-red-700 border border-red-200 rounded hover:bg-red-100"
                              title="Deduct shortfall from cashier's salary"
                            >
                              <MinusCircle className="h-3 w-3" />
                              Salary Deduction
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Create Reconciliation Modal ──────────────────────────────────────── */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white">
              <h2 className="text-xl font-bold text-gray-900">New Cash Reconciliation</h2>
              <button
                aria-label="Close modal"
                onClick={() => setShowCreateModal(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              {actionError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
                  {actionError}
                </div>
              )}

              {/* Cashier Account */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cashier Account <span className="text-red-500">*</span>
                </label>
                <select
                  aria-label="Cashier account"
                  value={form.cashier_account}
                  onChange={e =>
                    setForm(f => ({ ...f, cashier_account: parseInt(e.target.value) }))
                  }
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value={0}>— Select cashier account —</option>
                  {cashierAccounts.map(ca => (
                    <option key={ca.id} value={ca.id}>
                      {ca.name} ({ca.cashier_name ?? `Cashier #${ca.cashier}`})
                    </option>
                  ))}
                </select>
                {formErrors.cashier_account && (
                  <p className="mt-1 text-sm text-red-600">{formErrors.cashier_account}</p>
                )}
              </div>

              {/* Reconciliation Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reconciliation Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  aria-label="Reconciliation date"
                  value={form.reconciliation_date}
                  onChange={e => setForm(f => ({ ...f, reconciliation_date: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {formErrors.reconciliation_date && (
                  <p className="mt-1 text-sm text-red-600">{formErrors.reconciliation_date}</p>
                )}
              </div>

              {/* Physical Count */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-gray-700">
                    Physical Cash Count (₦) <span className="text-red-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowDenomCalc(v => !v)}
                    className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                  >
                    <Calculator className="h-3 w-3" />
                    {showDenomCalc ? 'Hide' : 'Use denomination calculator'}
                  </button>
                </div>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  aria-label="Physical cash count"
                  value={form.physical_count}
                  onChange={e => setForm(f => ({ ...f, physical_count: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {formErrors.physical_count && (
                  <p className="mt-1 text-sm text-red-600">{formErrors.physical_count}</p>
                )}
              </div>

              {/* Denomination Calculator */}
              {showDenomCalc && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-2">
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                    Denomination Count
                  </p>
                  {DENOMINATIONS.map(d => (
                    <div key={d} className="flex items-center gap-3">
                      <span className="text-sm text-gray-700 w-20">₦{d.toLocaleString()}</span>
                      <input
                        type="number"
                        min="0"
                        placeholder="0"
                        aria-label={`Count of ${d} naira notes`}
                        value={denomCounts[d]}
                        onChange={e => setDenomCounts(prev => ({ ...prev, [d]: e.target.value }))}
                        className="w-24 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-500">
                        = ₦{((parseInt(denomCounts[d] || '0', 10) || 0) * d).toLocaleString()}
                      </span>
                    </div>
                  ))}
                  <div className="pt-2 border-t border-gray-200 flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-800">
                      Total: {formatCurrency(denomTotal)}
                    </span>
                    <button
                      type="button"
                      onClick={applyDenomTotal}
                      className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      Apply Total
                    </button>
                  </div>
                </div>
              )}

              {/* Variance Explanation */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Variance Explanation{' '}
                  <span className="text-gray-400 font-normal">
                    (optional — required if variance)
                  </span>
                </label>
                <textarea
                  rows={2}
                  placeholder="Explain any difference between physical count and system balance…"
                  value={form.variance_explanation}
                  onChange={e => setForm(f => ({ ...f, variance_explanation: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 p-6 border-t sticky bottom-0 bg-white">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateSubmit}
                disabled={createMutation.isPending}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {createMutation.isPending ? 'Submitting…' : 'Submit Reconciliation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Salary Deduction Modal ───────────────────────────────────────────── */}
      {deductionModal.open && deductionModal.reconciliation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-6 border-b">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Create Salary Deduction</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Cashier: {deductionModal.reconciliation.cashier_name ?? `Reconciliation #${deductionModal.reconciliation.id}`}
                </p>
              </div>
              <button
                aria-label="Close deduction modal"
                onClick={() => setDeductionModal({ open: false, reconciliation: null })}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                ✕
              </button>
            </div>
            <div className="p-6 space-y-4">
              {actionError && (
                <div className="text-sm text-red-600 bg-red-50 rounded p-2">{actionError}</div>
              )}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                <p className="font-semibold mb-1">Shortfall: {formatCurrency(Math.abs(parseFloat(deductionModal.reconciliation.variance)))}</p>
                <p>This will create a pending salary deduction IOU on the cashier's staff profile. A director must approve it before deductions begin.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Monthly Installment (₦)
                  <span className="text-gray-400 font-normal ml-1">— leave blank to deduct full shortfall at once</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder={String(Math.abs(parseFloat(deductionModal.reconciliation.variance)))}
                  value={deductionForm.monthly_installment}
                  onChange={e => setDeductionForm(f => ({ ...f, monthly_installment: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start Month
                  <span className="text-gray-400 font-normal ml-1">— defaults to next month</span>
                </label>
                <input
                  type="date"
                  value={deductionForm.start_month}
                  onChange={e => setDeductionForm(f => ({ ...f, start_month: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                <textarea
                  rows={2}
                  placeholder="Additional context for this deduction…"
                  value={deductionForm.notes}
                  onChange={e => setDeductionForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t">
              <button
                onClick={() => setDeductionModal({ open: false, reconciliation: null })}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeductionSubmit}
                disabled={deductionLoading}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {deductionLoading ? 'Creating…' : 'Create Deduction IOU'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Finance Sign-off Modal ────────────────────────────────────────────── */}
      {signoffModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-lg font-bold text-gray-900">Finance Officer Sign-off</h2>
              <button
                aria-label="Close sign-off modal"
                onClick={() => setSignoffModal({ open: false, reconciliationId: null })}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                ✕
              </button>
            </div>
            <div className="p-6 space-y-4">
              {actionError && (
                <div className="text-sm text-red-600 bg-red-50 rounded p-2">{actionError}</div>
              )}
              <p className="text-sm text-gray-600">
                You are signing off on this cash reconciliation as the finance officer. This
                confirms the reconciliation has been reviewed and accepted.
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Finance Officer Notes{' '}
                  <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  rows={3}
                  placeholder="Add any review notes…"
                  value={signoffNotes}
                  onChange={e => setSignoffNotes(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t">
              <button
                onClick={() => setSignoffModal({ open: false, reconciliationId: null })}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSignoffSubmit}
                disabled={signoffMutation.isPending}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {signoffMutation.isPending ? 'Signing off…' : 'Confirm Sign-off'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CashReconciliationPage;
