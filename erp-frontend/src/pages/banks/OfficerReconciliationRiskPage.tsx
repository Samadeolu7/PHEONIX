import React, { useMemo, useState } from 'react';
import { ArrowUpDown, ShieldAlert, Users } from 'lucide-react';
import { useOfficerRiskReport } from '../../hooks/useReconciliation';

type SortKey =
  | 'officer_name'
  | 'branch_name'
  | 'matched_count'
  | 'erp_only_count'
  | 'unresolved_erp_only_count'
  | 'high_priority_count'
  | 'match_rate'
  | 'reference_compliance_rate'
  | 'avg_posting_lag_days'
  | 'late_posting_count';

const DEFAULT_SORT: { key: SortKey; direction: 'asc' | 'desc' } = {
  key: 'unresolved_erp_only_count',
  direction: 'desc',
};

const formatPercent = (value: number | null): string =>
  value === null ? '—' : `${Math.round(value * 100)}%`;

const formatLag = (value: number | null): string => {
  if (value === null) return '—';
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0) return 'On time';
  return rounded > 0 ? `${rounded}d late` : `${Math.abs(rounded)}d early`;
};

const OfficerReconciliationRiskPage: React.FC = () => {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sort, setSort] = useState(DEFAULT_SORT);

  const {
    data: rows = [],
    isLoading: loading,
    error: queryError,
  } = useOfficerRiskReport({ date_from: dateFrom || undefined, date_to: dateTo || undefined });
  const error = queryError
    ? queryError instanceof Error
      ? queryError.message
      : 'Failed to load report'
    : null;

  const toggleSort = (key: SortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'desc' }
    );
  };

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    const { key, direction } = sort;
    copy.sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (typeof av === 'string' || typeof bv === 'string') {
        return String(av).localeCompare(String(bv)) * (direction === 'asc' ? 1 : -1);
      }
      return (Number(av) - Number(bv)) * (direction === 'asc' ? 1 : -1);
    });
    return copy;
  }, [rows, sort]);

  const SortableHeader: React.FC<{ label: string; sortKey: SortKey; align?: 'left' | 'center' }> = ({
    label,
    sortKey,
    align = 'center',
  }) => (
    <th
      onClick={() => toggleSort(sortKey)}
      className={`px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:text-gray-700 ${
        align === 'center' ? 'text-center' : 'text-left'
      }`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown className={`w-3 h-3 ${sort.key === sortKey ? 'text-blue-600' : 'text-gray-300'}`} />
      </span>
    </th>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <ShieldAlert className="w-7 h-7 text-blue-600" />
        <h1 className="text-3xl font-bold text-gray-900">Officer Reconciliation Risk</h1>
      </div>
      <p className="text-gray-600 mb-6">
        Accountability signals per officer across all reconciliation activity — matched
        transactions and ERP-only exceptions alike, regardless of whether they've since been
        resolved. Sort any column; nothing here is a verdict, only a starting point for review.
      </p>

      <div className="bg-white rounded-lg shadow p-4 mb-6 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        {(dateFrom || dateTo) && (
          <button
            onClick={() => {
              setDateFrom('');
              setDateTo('');
            }}
            className="text-sm text-blue-600 hover:underline"
          >
            Clear dates
          </button>
        )}
      </div>

      {loading && (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="bg-white rounded-lg shadow overflow-hidden overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <SortableHeader label="Officer" sortKey="officer_name" align="left" />
                <SortableHeader label="Branch" sortKey="branch_name" align="left" />
                <SortableHeader label="Matched" sortKey="matched_count" />
                <SortableHeader label="ERP Only" sortKey="erp_only_count" />
                <SortableHeader label="Unresolved" sortKey="unresolved_erp_only_count" />
                <SortableHeader label="High Priority" sortKey="high_priority_count" />
                <SortableHeader label="Match Rate" sortKey="match_rate" />
                <SortableHeader label="Reference Compliance" sortKey="reference_compliance_rate" />
                <SortableHeader label="Avg Posting Lag" sortKey="avg_posting_lag_days" />
                <SortableHeader label="Late Postings" sortKey="late_posting_count" />
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedRows.map((row) => (
                <tr key={row.officer_id} className={row.high_priority_count > 0 ? 'bg-red-50' : ''}>
                  <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                    {row.officer_name}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                    {row.branch_name || '—'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-center text-sm text-gray-700">
                    {row.matched_count}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-center text-sm text-gray-700">
                    {row.erp_only_count}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-center text-sm">
                    <span
                      className={
                        row.unresolved_erp_only_count > 0
                          ? 'text-amber-700 font-semibold'
                          : 'text-gray-400'
                      }
                    >
                      {row.unresolved_erp_only_count}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-center text-sm">
                    <span
                      className={
                        row.high_priority_count > 0 ? 'text-red-700 font-semibold' : 'text-gray-400'
                      }
                    >
                      {row.high_priority_count}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-center text-sm text-gray-700">
                    {formatPercent(row.match_rate)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-center text-sm">
                    <span
                      className={
                        row.reference_compliance_rate !== null && row.reference_compliance_rate < 0.5
                          ? 'text-red-700 font-semibold'
                          : 'text-gray-700'
                      }
                    >
                      {formatPercent(row.reference_compliance_rate)}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-center text-sm text-gray-700">
                    {formatLag(row.avg_posting_lag_days)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-center text-sm text-gray-700">
                    {row.late_posting_count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {sortedRows.length === 0 && (
            <div className="text-center py-12">
              <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No officer activity yet</h3>
              <p className="text-gray-600">
                Once statements are reconciled, officers with matched transactions or ERP-only
                exceptions will show up here.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default OfficerReconciliationRiskPage;
