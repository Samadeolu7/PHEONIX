import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { accountPeriodService, AccountingPeriod } from '../../services/accountPeriodService';

// ─── helpers ────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  '',
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function periodLabel(p: AccountingPeriod): string {
  if (p.period_type === 'year') return `FY ${p.year}`;
  return `${MONTH_NAMES[p.month ?? 0]} ${p.year}`;
}

// ─── component ──────────────────────────────────────────────────────────────

const PeriodManagementPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [typeFilter, setTypeFilter] = useState<'month' | 'year' | ''>('month');
  const [yearFilter, setYearFilter] = useState<string>('');
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    period: AccountingPeriod;
    action: 'close' | 'reopen' | 'reclose';
  } | null>(null);

  const {
    data: periods = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['accounting-periods', typeFilter, yearFilter],
    queryFn: () =>
      accountPeriodService.list({
        period_type: typeFilter || undefined,
        year: yearFilter ? parseInt(yearFilter) : undefined,
        ordering: '-year,-month',
      }),
  });

  const notify = (text: string, ok: boolean) => {
    setMessage({ text, ok });
    setTimeout(() => setMessage(null), 5000);
  };

  const closeMutation = useMutation({
    mutationFn: (id: number) => accountPeriodService.close(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounting-periods'] });
      notify('Period closed successfully.', true);
    },
    onError: (err: unknown) =>
      notify((err as { message?: string })?.message ?? 'Failed to close period.', false),
  });

  const reopenMutation = useMutation({
    mutationFn: (id: number) => accountPeriodService.reopen(id),
    onSuccess: result => {
      queryClient.invalidateQueries({ queryKey: ['accounting-periods'] });
      const n = result.affected_periods?.length ?? 1;
      notify(`Period reopened. ${n} period(s) affected.`, true);
    },
    onError: (err: unknown) =>
      notify((err as { message?: string })?.message ?? 'Failed to reopen period.', false),
  });

  const recloseMutation = useMutation({
    mutationFn: (id: number) => accountPeriodService.reclose(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounting-periods'] });
      notify('Period reclosed successfully.', true);
    },
    onError: (err: unknown) =>
      notify((err as { message?: string })?.message ?? 'Failed to reclose period.', false),
  });

  const handleConfirm = () => {
    if (!confirmAction) return;
    const { period, action } = confirmAction;
    setConfirmAction(null);
    if (action === 'close') closeMutation.mutate(period.id);
    else if (action === 'reopen') reopenMutation.mutate(period.id);
    else recloseMutation.mutate(period.id);
  };

  const isBusy = closeMutation.isPending || reopenMutation.isPending || recloseMutation.isPending;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Accounting Period Management</h1>
        <p className="mt-1 text-sm text-gray-500">
          Close, reopen, and reclose accounting periods. Closing a period locks transactions and
          creates balance snapshots for reporting.
        </p>
      </div>

      {/* Toast */}
      {message && (
        <div
          className={`mb-4 rounded-md px-4 py-3 text-sm font-medium ${
            message.ok
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Period Type</label>
          <select
            aria-label="Period type filter"
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value as 'month' | 'year' | '')}
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            <option value="month">Monthly</option>
            <option value="year">Yearly</option>
            <option value="">All</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Year</label>
          <input
            type="number"
            placeholder="e.g. 2026"
            value={yearFilter}
            onChange={e => setYearFilter(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-28 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white shadow-sm rounded-lg border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading periods…</div>
        ) : isError ? (
          <div className="p-8 text-center text-red-500 text-sm">
            Failed to load periods. Check your connection and try again.
          </div>
        ) : periods.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">No periods found.</div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left font-semibold text-gray-600">Period</th>
                <th className="px-6 py-3 text-left font-semibold text-gray-600">Type</th>
                <th className="px-6 py-3 text-left font-semibold text-gray-600">Status</th>
                <th className="px-6 py-3 text-left font-semibold text-gray-600">Closed By</th>
                <th className="px-6 py-3 text-right font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {periods.map(period => (
                <tr key={period.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 font-medium text-gray-900">{periodLabel(period)}</td>
                  <td className="px-6 py-4 text-gray-500 capitalize">{period.period_type}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        period.is_closed ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                      }`}
                    >
                      {period.is_closed ? 'Closed' : 'Open'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-500">
                    {period.closed_by_name ?? '—'}
                    {period.closed_at && (
                      <span className="block text-xs text-gray-400">
                        {new Date(period.closed_at).toLocaleDateString()}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {!period.is_closed && (
                        <button
                          disabled={isBusy}
                          onClick={() => setConfirmAction({ period, action: 'close' })}
                          className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-md bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          Close Period
                        </button>
                      )}
                      {period.is_closed && (
                        <>
                          <button
                            disabled={isBusy}
                            onClick={() => setConfirmAction({ period, action: 'reopen' })}
                            className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            Reopen
                          </button>
                          <button
                            disabled={isBusy}
                            onClick={() => setConfirmAction({ period, action: 'reclose' })}
                            className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-md bg-gray-600 text-white hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            Reclose
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Warning about reopen */}
      <p className="mt-3 text-xs text-gray-400">
        ⚠ Reopening a period will invalidate balance snapshots for that period and all subsequent
        periods. Use with caution.
      </p>

      {/* Confirmation modal */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              Confirm{' '}
              {confirmAction.action === 'close'
                ? 'Period Close'
                : confirmAction.action === 'reopen'
                  ? 'Period Reopen'
                  : 'Period Reclose'}
            </h2>
            <p className="text-sm text-gray-600 mb-5">
              {confirmAction.action === 'close' && (
                <>
                  You are about to <strong>close</strong>{' '}
                  <strong>{periodLabel(confirmAction.period)}</strong>. This will lock all
                  transactions in this period and create balance snapshots. This action can be
                  reversed by reopening the period.
                </>
              )}
              {confirmAction.action === 'reopen' && (
                <>
                  You are about to <strong>reopen</strong>{' '}
                  <strong>{periodLabel(confirmAction.period)}</strong>. This will invalidate balance
                  snapshots for this and all subsequent periods. All affected periods will be
                  re-opened.
                </>
              )}
              {confirmAction.action === 'reclose' && (
                <>
                  You are about to <strong>reclose</strong>{' '}
                  <strong>{periodLabel(confirmAction.period)}</strong>. New balance snapshots will
                  be created.
                </>
              )}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmAction(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                className={`px-4 py-2 text-sm font-medium text-white rounded-md transition-colors ${
                  confirmAction.action === 'close'
                    ? 'bg-orange-600 hover:bg-orange-700'
                    : confirmAction.action === 'reopen'
                      ? 'bg-blue-600 hover:bg-blue-700'
                      : 'bg-gray-700 hover:bg-gray-800'
                }`}
              >
                Yes,{' '}
                {confirmAction.action === 'close'
                  ? 'Close Period'
                  : confirmAction.action === 'reopen'
                    ? 'Reopen Period'
                    : 'Reclose Period'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PeriodManagementPage;
