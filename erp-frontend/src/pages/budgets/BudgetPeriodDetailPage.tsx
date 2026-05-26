/**
 * Budget Period Detail Page (RPT-02)
 * View period info, manage budget lines, approve/activate workflow.
 */

import React, { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Edit,
  CheckCircle,
  PlayCircle,
  PlusCircle,
  Trash2,
  BarChart2,
  AlertTriangle,
} from 'lucide-react';
import {
  useBudgetPeriod,
  useBudgetLines,
  useCreateBudgetLine,
  useUpdateBudgetLine,
  useDeleteBudgetLine,
  useApproveBudgetPeriod,
  useActivateBudgetPeriod,
} from '../../hooks/useBudgets';
import { useApprovalGuard } from '../../hooks/useApprovalGuard';
import { accountService } from '../../services/accountService';
import type { BudgetLineFormData } from '../../types/budgets';

type TabId = 'overview' | 'lines';

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  approved: 'bg-blue-100 text-blue-700',
  active: 'bg-green-100 text-green-700',
  closed: 'bg-red-100 text-red-700',
};

const fmt = (val?: string | number | null): string => {
  if (val === null || val === undefined) return '—';
  const n = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(n)) return '—';
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 2,
  }).format(n);
};

const pct = (val?: number | null): string =>
  val === null || val === undefined ? '—' : `${val.toFixed(1)}%`;

const EMPTY_LINE: BudgetLineFormData = { account: 0, amount: '', notes: '' };

const BudgetPeriodDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const periodId = parseInt(id!);
  const { canUserApprove } = useApprovalGuard();

  const { data: period, isLoading, error: periodError } = useBudgetPeriod(periodId);
  const { data: lines = [] } = useBudgetLines({ budget_period: periodId });

  const createLine = useCreateBudgetLine();
  const updateLine = useUpdateBudgetLine();
  const deleteLine = useDeleteBudgetLine();
  const approvePeriod = useApproveBudgetPeriod();
  const activatePeriod = useActivateBudgetPeriod();

  const { data: allAccounts = [] } = useQuery({
    queryKey: ['accounts', 'all-for-budget'],
    queryFn: () => accountService.getAccounts(),
    staleTime: 60_000,
  });

  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [actionError, setActionError] = useState<string | null>(null);

  // Add-line modal state
  const [showAddLine, setShowAddLine] = useState(false);
  const [lineForm, setLineForm] = useState<BudgetLineFormData>(EMPTY_LINE);
  const [lineErrors, setLineErrors] = useState<Partial<Record<keyof BudgetLineFormData, string>>>(
    {}
  );

  // Edit-line modal state
  const [editLineId, setEditLineId] = useState<number | null>(null);
  const [editLineForm, setEditLineForm] = useState<BudgetLineFormData>(EMPTY_LINE);

  // Confirm delete
  const [deleteLineId, setDeleteLineId] = useState<number | null>(null);

  // ---- Validation -----------------------------------------------------------
  const validateLine = (f: BudgetLineFormData): boolean => {
    const errs: Partial<Record<keyof BudgetLineFormData, string>> = {};
    if (!f.account || f.account === 0) errs.account = 'Account is required';
    if (!f.amount || parseFloat(f.amount) <= 0) errs.amount = 'Enter a positive amount';
    setLineErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ---- Handlers -------------------------------------------------------------
  const handleApprove = async () => {
    setActionError(null);
    try {
      await approvePeriod.mutateAsync(periodId);
    } catch (err: unknown) {
      const e = err as { details?: { error?: string }; message?: string };
      setActionError(e?.details?.error ?? (err instanceof Error ? err.message : 'Approval failed'));
    }
  };

  const handleActivate = async () => {
    setActionError(null);
    try {
      await activatePeriod.mutateAsync(periodId);
    } catch (err: unknown) {
      const e = err as { details?: { error?: string }; message?: string };
      setActionError(
        e?.details?.error ?? (err instanceof Error ? err.message : 'Activation failed')
      );
    }
  };

  const handleAddLine = async () => {
    if (!validateLine(lineForm)) return;
    try {
      await createLine.mutateAsync({ ...lineForm, budget_period: periodId });
      setShowAddLine(false);
      setLineForm(EMPTY_LINE);
    } catch (err: unknown) {
      const e = err as { details?: { error?: string }; message?: string };
      setLineErrors(prev => ({
        ...prev,
        amount: e?.details?.error ?? (err instanceof Error ? err.message : 'Save failed'),
      }));
    }
  };

  const handleUpdateLine = async () => {
    if (editLineId === null || !validateLine(editLineForm)) return;
    try {
      await updateLine.mutateAsync({ id: editLineId, data: editLineForm });
      setEditLineId(null);
    } catch (err: unknown) {
      const e = err as { details?: { error?: string }; message?: string };
      setLineErrors(prev => ({
        ...prev,
        amount: e?.details?.error ?? (err instanceof Error ? err.message : 'Update failed'),
      }));
    }
  };

  const handleDeleteLine = async () => {
    if (deleteLineId === null) return;
    try {
      await deleteLine.mutateAsync(deleteLineId);
      setDeleteLineId(null);
    } catch {
      /* ignore */
    }
  };

  const openEdit = (lineId: number) => {
    const line = lines.find(l => l.id === lineId);
    if (!line) return;
    setEditLineForm({ account: line.account, amount: line.amount, notes: line.notes ?? '' });
    setLineErrors({});
    setEditLineId(lineId);
  };

  // ---- Render ---------------------------------------------------------------
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (periodError || !period) {
    return (
      <div className="p-6 text-center text-red-600">
        <AlertTriangle className="h-10 w-10 mx-auto mb-2" />
        <p>Failed to load budget period.</p>
        <button
          onClick={() => navigate('/budgets/periods')}
          className="mt-3 text-blue-600 underline text-sm"
        >
          Back to list
        </button>
      </div>
    );
  }

  const canEdit = period.status === 'draft';
  const canApproveAction = canUserApprove && period.status === 'draft';
  const canActivateAction = canUserApprove && period.status === 'approved';
  const isBusy = approvePeriod.isPending || activatePeriod.isPending;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <button
            aria-label="Back to list"
            onClick={() => navigate('/budgets/periods')}
            className="mt-1 p-2 text-gray-500 hover:text-gray-700 border border-gray-300 rounded-lg"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">{period.name}</h1>
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${STATUS_COLORS[period.status] ?? 'bg-gray-100 text-gray-700'}`}
              >
                {period.status}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-0.5">
              {period.start_date} → {period.end_date}
              {period.line_count !== undefined &&
                ` · ${period.line_count} line${period.line_count !== 1 ? 's' : ''}`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canEdit && (
            <Link
              to={`/budgets/periods/${periodId}/edit`}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <Edit className="h-4 w-4" />
              Edit
            </Link>
          )}
          <Link
            to={`/budgets/periods/${periodId}/variance`}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <BarChart2 className="h-4 w-4" />
            Variance Report
          </Link>
          {canApproveAction && (
            <button
              onClick={handleApprove}
              disabled={isBusy}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <CheckCircle className="h-4 w-4" />
              {approvePeriod.isPending ? 'Approving…' : 'Approve'}
            </button>
          )}
          {canActivateAction && (
            <button
              onClick={handleActivate}
              disabled={isBusy}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              <PlayCircle className="h-4 w-4" />
              {activatePeriod.isPending ? 'Activating…' : 'Activate'}
            </button>
          )}
        </div>
      </div>

      {actionError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {actionError}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Budget', value: fmt(period.total_budget), color: 'text-blue-600' },
          { label: 'Actual Spent', value: fmt(period.total_actual), color: 'text-gray-900' },
          {
            label: 'Variance',
            value: fmt(period.total_variance),
            color:
              parseFloat(period.total_variance ?? '0') >= 0 ? 'text-green-600' : 'text-red-600',
          },
          { label: 'Utilization', value: pct(period.utilization_percent), color: 'text-gray-900' },
        ].map(card => (
          <div key={card.label} className="bg-white border rounded-lg p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">{card.label}</p>
            <p className={`text-xl font-semibold mt-1 ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="bg-white border rounded-lg">
        <div className="flex border-b">
          {(['overview', 'lines'] as TabId[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-3 text-sm font-medium capitalize ${
                activeTab === tab
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab === 'lines' ? 'Budget Lines' : 'Overview'}
            </button>
          ))}
        </div>

        <div className="p-5">
          {/* ---- Overview Tab ---- */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { label: 'Status', value: period.status },
                  { label: 'Start Date', value: period.start_date },
                  { label: 'End Date', value: period.end_date },
                  { label: 'Budget Lines', value: String(period.line_count ?? lines.length) },
                  { label: 'Variance %', value: pct(period.variance_percent) },
                  { label: 'Approved By', value: period.approved_by_name ?? '—' },
                  {
                    label: 'Approved At',
                    value: period.approved_at ? period.approved_at.slice(0, 10) : '—',
                  },
                ].map(row => (
                  <div key={row.label} className="flex gap-2">
                    <span className="text-sm text-gray-500 w-32 shrink-0">{row.label}:</span>
                    <span className="text-sm text-gray-900 font-medium capitalize">
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
              {period.notes && (
                <div className="mt-4 border-t pt-4">
                  <p className="text-sm font-medium text-gray-700 mb-1">Notes</p>
                  <p className="text-sm text-gray-600 whitespace-pre-wrap">{period.notes}</p>
                </div>
              )}
            </div>
          )}

          {/* ---- Budget Lines Tab ---- */}
          {activeTab === 'lines' && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-semibold text-gray-700">
                  Budget Lines ({lines.length})
                </h3>
                {canEdit && (
                  <button
                    onClick={() => {
                      setLineForm(EMPTY_LINE);
                      setLineErrors({});
                      setShowAddLine(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    <PlusCircle className="h-4 w-4" />
                    Add Line
                  </button>
                )}
              </div>

              {lines.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <p className="text-sm">No budget lines yet.</p>
                  {canEdit && (
                    <button
                      onClick={() => {
                        setLineForm(EMPTY_LINE);
                        setLineErrors({});
                        setShowAddLine(true);
                      }}
                      className="mt-2 text-blue-600 text-sm hover:underline"
                    >
                      Add the first line →
                    </button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left">
                        <th className="px-3 py-2 text-xs font-semibold text-gray-500">Account</th>
                        <th className="px-3 py-2 text-xs font-semibold text-gray-500 text-right">
                          Budget
                        </th>
                        <th className="px-3 py-2 text-xs font-semibold text-gray-500 text-right">
                          Actual
                        </th>
                        <th className="px-3 py-2 text-xs font-semibold text-gray-500 text-right">
                          Variance
                        </th>
                        <th className="px-3 py-2 text-xs font-semibold text-gray-500 text-right">
                          Used %
                        </th>
                        <th className="px-3 py-2 text-xs font-semibold text-gray-500">Status</th>
                        <th className="px-3 py-2 text-xs font-semibold text-gray-500">Notes</th>
                        {canEdit && <th className="px-3 py-2" />}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {lines.map(line => (
                        <tr key={line.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2">
                            <div className="font-medium text-gray-900">
                              {line.account_name ?? `Account #${line.account}`}
                            </div>
                            {line.account_code && (
                              <div className="text-xs text-gray-400">{line.account_code}</div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-900">{fmt(line.amount)}</td>
                          <td className="px-3 py-2 text-right text-gray-600">{fmt(line.actual)}</td>
                          <td
                            className={`px-3 py-2 text-right font-medium ${parseFloat(line.variance ?? '0') >= 0 ? 'text-green-600' : 'text-red-600'}`}
                          >
                            {fmt(line.variance)}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-600">
                            {pct(line.utilization_percent)}
                          </td>
                          <td className="px-3 py-2">
                            {line.variance_status && (
                              <span
                                className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize
                                ${line.variance_status === 'over' ? 'bg-red-100 text-red-700' : ''}
                                ${line.variance_status === 'under' ? 'bg-green-100 text-green-700' : ''}
                                ${line.variance_status === 'on_track' ? 'bg-blue-100 text-blue-700' : ''}
                              `}
                              >
                                {line.variance_status.replace('_', ' ')}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-gray-500 max-w-[160px] truncate">
                            {line.notes ?? '—'}
                          </td>
                          {canEdit && (
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-1">
                                <button
                                  aria-label="Edit line"
                                  onClick={() => openEdit(line.id)}
                                  className="p-1 text-gray-400 hover:text-blue-600 rounded"
                                >
                                  <Edit className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  aria-label="Delete line"
                                  onClick={() => setDeleteLineId(line.id)}
                                  className="p-1 text-gray-400 hover:text-red-600 rounded"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ---- Add Line Modal ---- */}
      {showAddLine && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Add Budget Line</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Account <span className="text-red-500">*</span>
              </label>
              <select
                aria-label="Select account"
                value={lineForm.account}
                onChange={e => setLineForm(f => ({ ...f, account: parseInt(e.target.value) }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value={0}>— Select account —</option>
                {allAccounts.map(acc => (
                  <option key={acc.id} value={parseInt(acc.id)}>
                    {acc.code ? `${acc.code} · ` : ''}
                    {acc.name}
                  </option>
                ))}
              </select>
              {lineErrors.account && (
                <p className="mt-1 text-sm text-red-600">{lineErrors.account}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Budget Amount (₦) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={lineForm.amount}
                onChange={e => setLineForm(f => ({ ...f, amount: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {lineErrors.amount && (
                <p className="mt-1 text-sm text-red-600">{lineErrors.amount}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                rows={2}
                placeholder="Optional notes…"
                value={lineForm.notes}
                onChange={e => setLineForm(f => ({ ...f, notes: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowAddLine(false)}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAddLine}
                disabled={createLine.isPending}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {createLine.isPending ? 'Saving…' : 'Add Line'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Edit Line Modal ---- */}
      {editLineId !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Edit Budget Line</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Account <span className="text-red-500">*</span>
              </label>
              <select
                aria-label="Select account for edit"
                value={editLineForm.account}
                onChange={e => setEditLineForm(f => ({ ...f, account: parseInt(e.target.value) }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value={0}>— Select account —</option>
                {allAccounts.map(acc => (
                  <option key={acc.id} value={parseInt(acc.id)}>
                    {acc.code ? `${acc.code} · ` : ''}
                    {acc.name}
                  </option>
                ))}
              </select>
              {lineErrors.account && (
                <p className="mt-1 text-sm text-red-600">{lineErrors.account}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Budget Amount (₦) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={editLineForm.amount}
                onChange={e => setEditLineForm(f => ({ ...f, amount: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {lineErrors.amount && (
                <p className="mt-1 text-sm text-red-600">{lineErrors.amount}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                rows={2}
                placeholder="Optional notes…"
                value={editLineForm.notes}
                onChange={e => setEditLineForm(f => ({ ...f, notes: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setEditLineId(null)}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateLine}
                disabled={updateLine.isPending}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {updateLine.isPending ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Confirm Delete Line Modal ---- */}
      {deleteLineId !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Delete Budget Line?</h3>
            <p className="text-sm text-gray-600">This action cannot be undone.</p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setDeleteLineId(null)}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteLine}
                disabled={deleteLine.isPending}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {deleteLine.isPending ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BudgetPeriodDetailPage;
