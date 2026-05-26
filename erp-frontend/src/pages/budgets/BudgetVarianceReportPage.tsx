/**
 * Budget Variance Report Page (RPT-02)
 * Displays budget vs actual variance broken down by department and account type.
 */

import React, { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, AlertTriangle, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { useBudgetVarianceReport } from '../../hooks/useBudgets';
import type { VarianceReportFilters, AccountType } from '../../types/budgets';

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

const varClass = (variance?: string | null): string => {
  if (!variance) return 'text-gray-600';
  const v = parseFloat(variance);
  if (isNaN(v)) return 'text-gray-600';
  return v >= 0 ? 'text-green-600' : 'text-red-600';
};

const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
  { value: 'asset', label: 'Asset' },
  { value: 'liability', label: 'Liability' },
  { value: 'equity', label: 'Equity' },
  { value: 'revenue', label: 'Revenue' },
  { value: 'expense', label: 'Expense' },
];

const BudgetVarianceReportPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const periodId = parseInt(id!);

  const [filters, setFilters] = useState<VarianceReportFilters>({});

  const { data: response, isLoading, error, refetch } = useBudgetVarianceReport(periodId, filters);

  const report = response?.data;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="p-6 text-center text-red-600">
        <AlertTriangle className="h-10 w-10 mx-auto mb-2" />
        <p className="text-sm">Failed to load variance report.</p>
        <div className="mt-3 flex justify-center gap-4">
          <button onClick={() => refetch()} className="text-blue-600 underline text-sm">
            Retry
          </button>
          <button
            onClick={() => navigate(`/budgets/periods/${periodId}`)}
            className="text-gray-600 underline text-sm"
          >
            Back to period
          </button>
        </div>
      </div>
    );
  }

  const { period, summary, by_department, by_account_type, lines } = report;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <button
            aria-label="Back to budget period"
            onClick={() => navigate(`/budgets/periods/${periodId}`)}
            className="mt-1 p-2 text-gray-500 hover:text-gray-700 border border-gray-300 rounded-lg"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Variance Report</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              <Link to={`/budgets/periods/${periodId}`} className="text-blue-600 hover:underline">
                {period.name}
              </Link>
              {' · '}
              {period.start_date} → {period.end_date}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Filter by account type"
            value={filters.account_type ?? ''}
            onChange={e =>
              setFilters(f => ({
                ...f,
                account_type: e.target.value ? (e.target.value as AccountType) : undefined,
              }))
            }
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Account Types</option>
            {ACCOUNT_TYPES.map(t => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1.5">
            <label className="text-sm text-gray-600 whitespace-nowrap">Min Variance %</label>
            <input
              type="number"
              min="0"
              max="100"
              placeholder="e.g. 10"
              value={filters.threshold ?? ''}
              onChange={e =>
                setFilters(f => ({
                  ...f,
                  threshold: e.target.value ? parseFloat(e.target.value) : undefined,
                }))
              }
              className="w-24 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {(filters.account_type || filters.threshold) && (
            <button
              onClick={() => setFilters({})}
              className="text-sm text-gray-500 hover:text-gray-700 border border-gray-300 rounded-lg px-3 py-1.5"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'Total Budget',
            value: fmt(summary.total_budget),
            icon: null,
            color: 'text-blue-600',
          },
          {
            label: 'Total Actual',
            value: fmt(summary.total_actual),
            icon: null,
            color: 'text-gray-900',
          },
          {
            label: 'Total Variance',
            value: fmt(summary.total_variance),
            icon: parseFloat(summary.total_variance) >= 0 ? TrendingUp : TrendingDown,
            color: parseFloat(summary.total_variance) >= 0 ? 'text-green-600' : 'text-red-600',
          },
          {
            label: 'Utilization',
            value: pct(summary.utilization_percent),
            icon: Minus,
            color: 'text-gray-900',
          },
        ].map(card => (
          <div
            key={card.label}
            className="bg-white border rounded-lg p-4 flex items-start justify-between"
          >
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">{card.label}</p>
              <p className={`text-xl font-semibold mt-1 ${card.color}`}>{card.value}</p>
            </div>
            {card.icon && <card.icon className={`h-5 w-5 mt-1 ${card.color}`} />}
          </div>
        ))}
      </div>

      {/* Over / Under Summary */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-xs font-semibold text-red-700 uppercase tracking-wide">Over Budget</p>
          <p className="text-2xl font-bold text-red-700 mt-1">{summary.over_budget_count}</p>
          <p className="text-xs text-red-600 mt-0.5">lines exceeding allocation</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-xs font-semibold text-green-700 uppercase tracking-wide">
            Under Budget
          </p>
          <p className="text-2xl font-bold text-green-700 mt-1">{summary.under_budget_count}</p>
          <p className="text-xs text-green-600 mt-0.5">lines with remaining budget</p>
        </div>
      </div>

      {/* By Account Type */}
      {by_account_type.length > 0 && (
        <div className="bg-white border rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b bg-gray-50">
            <h2 className="text-sm font-semibold text-gray-700">By Account Type</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left border-b">
                  <th className="px-4 py-2 text-xs font-semibold text-gray-500">Type</th>
                  <th className="px-4 py-2 text-xs font-semibold text-gray-500 text-right">
                    Budget
                  </th>
                  <th className="px-4 py-2 text-xs font-semibold text-gray-500 text-right">
                    Actual
                  </th>
                  <th className="px-4 py-2 text-xs font-semibold text-gray-500 text-right">
                    Variance
                  </th>
                  <th className="px-4 py-2 text-xs font-semibold text-gray-500 text-right">
                    Variance %
                  </th>
                  <th className="px-4 py-2 text-xs font-semibold text-gray-500 text-right">
                    Utilization
                  </th>
                  <th className="px-4 py-2 text-xs font-semibold text-gray-500 text-right">
                    Lines
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {by_account_type.map(row => (
                  <tr key={row.account_type} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium text-gray-900 capitalize">
                      {row.account_type_display}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-900">{fmt(row.budget)}</td>
                    <td className="px-4 py-2 text-right text-gray-600">{fmt(row.actual)}</td>
                    <td className={`px-4 py-2 text-right font-medium ${varClass(row.variance)}`}>
                      {fmt(row.variance)}
                    </td>
                    <td className={`px-4 py-2 text-right ${varClass(row.variance)}`}>
                      {pct(row.variance_percent)}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-600">
                      {pct(row.utilization_percent)}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-500">{row.line_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* By Department */}
      {by_department.length > 0 && (
        <div className="bg-white border rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b bg-gray-50">
            <h2 className="text-sm font-semibold text-gray-700">By Department</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left border-b">
                  <th className="px-4 py-2 text-xs font-semibold text-gray-500">Department</th>
                  <th className="px-4 py-2 text-xs font-semibold text-gray-500 text-right">
                    Budget
                  </th>
                  <th className="px-4 py-2 text-xs font-semibold text-gray-500 text-right">
                    Actual
                  </th>
                  <th className="px-4 py-2 text-xs font-semibold text-gray-500 text-right">
                    Variance
                  </th>
                  <th className="px-4 py-2 text-xs font-semibold text-gray-500 text-right">
                    Variance %
                  </th>
                  <th className="px-4 py-2 text-xs font-semibold text-gray-500 text-right">
                    Utilization
                  </th>
                  <th className="px-4 py-2 text-xs font-semibold text-gray-500 text-right">
                    Lines
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {by_department.map(row => (
                  <tr key={row.department_id ?? 'unassigned'} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium text-gray-900">
                      {row.department_name || 'Unassigned'}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-900">{fmt(row.budget)}</td>
                    <td className="px-4 py-2 text-right text-gray-600">{fmt(row.actual)}</td>
                    <td className={`px-4 py-2 text-right font-medium ${varClass(row.variance)}`}>
                      {fmt(row.variance)}
                    </td>
                    <td className={`px-4 py-2 text-right ${varClass(row.variance)}`}>
                      {pct(row.variance_percent)}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-600">
                      {pct(row.utilization_percent)}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-500">{row.line_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Line Detail */}
      {lines.length > 0 && (
        <div className="bg-white border rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b bg-gray-50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Line Detail ({lines.length})</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left border-b">
                  <th className="px-4 py-2 text-xs font-semibold text-gray-500">Account</th>
                  <th className="px-4 py-2 text-xs font-semibold text-gray-500">Department</th>
                  <th className="px-4 py-2 text-xs font-semibold text-gray-500 text-right">
                    Budget
                  </th>
                  <th className="px-4 py-2 text-xs font-semibold text-gray-500 text-right">
                    Actual
                  </th>
                  <th className="px-4 py-2 text-xs font-semibold text-gray-500 text-right">
                    Variance
                  </th>
                  <th className="px-4 py-2 text-xs font-semibold text-gray-500 text-right">
                    Used %
                  </th>
                  <th className="px-4 py-2 text-xs font-semibold text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lines.map(line => (
                  <tr key={line.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <div className="font-medium text-gray-900">
                        {line.account_name ?? `Account #${line.account}`}
                      </div>
                      {line.account_code && (
                        <div className="text-xs text-gray-400">{line.account_code}</div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-gray-600 text-sm">
                      {line.department_name ?? '—'}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-900">{fmt(line.amount)}</td>
                    <td className="px-4 py-2 text-right text-gray-600">{fmt(line.actual)}</td>
                    <td className={`px-4 py-2 text-right font-medium ${varClass(line.variance)}`}>
                      {fmt(line.variance)}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-600">
                      {pct(line.utilization_percent)}
                    </td>
                    <td className="px-4 py-2">
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default BudgetVarianceReportPage;
