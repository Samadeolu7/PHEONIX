// ProfitLossPage â€” Statement of Profit or Loss and Other Comprehensive Income (FIRS / IAS 1)
// Expandable Revenue / Expense sections, IFRS-compliant structure

import React, { useState, useCallback } from 'react';
import { TrendingUp, TrendingDown, ChevronDown, ChevronRight } from 'lucide-react';
import { useProfitLoss } from '../../hooks/useProfitLoss';
import ReportFilters from '../../components/financialReports/ReportFilters';
import ExportControls from '../../components/financialReports/ExportControls';
import {
  AccountBalance,
  ProfitLossParams,
  ReportFilters as ReportFiltersType,
  ExportFormat,
} from '../../types/financialReports';

const LEVEL_INDENT = ['pl-4', 'pl-11', 'pl-[72px]', 'pl-[100px]'] as const;

const fmtAmt = (v: string | number) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  if (isNaN(n)) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const fmtDate = (d: string) => {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

const ProfitLossPage: React.FC = () => {
  const [filters, setFilters] = useState<ProfitLossParams>({
    start_date: `${new Date().getFullYear()}-01-01`,
    detail_level: 'detailed',
    comparative: false,
  });
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['revenue', 'expenses'])
  );
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());

  const { data, loading, error, refetch, exportReport, isRefetching } = useProfitLoss(filters);

  const handleFiltersChange = useCallback(
    (newFilters: ReportFiltersType) => {
      if (!newFilters.startDate) return;
      const params: ProfitLossParams = {
        start_date: newFilters.startDate,
        end_date: newFilters.endDate,
        detail_level: newFilters.detailLevel || 'summary',
        comparative: newFilters.comparative || false,
      };
      setFilters(params);
      refetch(params);
    },
    [refetch]
  );

  const handleExport = useCallback(
    async (format: ExportFormat) => {
      try {
        await exportReport(format);
      } catch (e) {
        console.error('Export failed:', e);
      }
    },
    [exportReport]
  );

  const toggleSection = (key: string) =>
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const toggleAccount = (code: string) =>
    setExpandedAccounts(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  const renderAccount = (
    acc: AccountBalance,
    level: number,
    colorClass: string
  ): React.ReactNode => {
    const hasChildren = acc.children && acc.children.length > 0;
    const isExpanded = expandedAccounts.has(acc.code);
    const isParent = acc.level === 'PARENT';
    return (
      <React.Fragment key={acc.code}>
        <div
          tabIndex={hasChildren ? 0 : undefined}
          className={[
            'flex items-center border-b border-gray-50 pr-4 py-2 transition-colors',
            LEVEL_INDENT[Math.min(level, 3)],
            hasChildren ? 'cursor-pointer hover:bg-gray-50' : '',
            isParent ? 'bg-gray-50/40' : 'bg-white',
          ].join(' ')}
          onClick={() => hasChildren && toggleAccount(acc.code)}
          onKeyDown={e => {
            if (hasChildren && (e.key === 'Enter' || e.key === ' ')) toggleAccount(acc.code);
          }}
        >
          <div className="w-5 flex-shrink-0 mr-2 text-gray-400 flex items-center">
            {hasChildren ? (
              isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )
            ) : (
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-gray-300 ml-1.5" />
            )}
          </div>
          <div className={`w-28 flex-shrink-0 font-mono text-xs font-semibold ${colorClass} mr-3`}>
            {acc.code}
          </div>
          <div
            className={`flex-1 text-sm min-w-0 pr-4 ${
              isParent ? 'font-semibold text-gray-900' : 'text-gray-700'
            }`}
          >
            {acc.name}
          </div>
          <div className="w-40 flex-shrink-0 text-right font-mono text-sm text-gray-800 tabular-nums">
            {fmtAmt(acc.balance)}
          </div>
        </div>
        {hasChildren && isExpanded && acc.children && (
          <>{acc.children.map(child => renderAccount(child, level + 1, colorClass))}</>
        )}
      </React.Fragment>
    );
  };

  const netProfit = data ? parseFloat(data.net_profit) : null;
  const isProfitable = netProfit !== null && netProfit >= 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* â”€â”€ Header â”€â”€ */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-100 rounded-lg mt-0.5">
                {isProfitable ? (
                  <TrendingUp className="h-5 w-5 text-blue-600" />
                ) : (
                  <TrendingDown className="h-5 w-5 text-blue-600" />
                )}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 leading-tight">
                  Statement of Profit or Loss
                </h1>
                <p className="text-sm font-medium text-gray-600">and Other Comprehensive Income</p>
                <p className="text-sm text-gray-500 mt-0.5">
                  {data?.period
                    ? `For the period ${fmtDate(data.period.start)} to ${fmtDate(data.period.end)}`
                    : 'Performance of the entity over a period of time'}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Formerly: Profit &amp; Loss Statement Â· FIRS / IAS 1 Compliant
                </p>
              </div>
            </div>
            {data && !loading && (
              <ExportControls
                onExport={handleExport}
                loading={loading || isRefetching}
                disabled={!data}
              />
            )}
          </div>
          <div className="mt-5">
            <ReportFilters
              reportType="profit-loss"
              onFiltersChange={handleFiltersChange}
              initialFilters={{
                startDate: filters.start_date,
                detailLevel: filters.detail_level,
                comparative: filters.comparative,
              }}
              loading={loading || isRefetching}
            />
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-4">
        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
            <p className="font-semibold text-sm">Failed to load Statement</p>
            <p className="text-xs mt-1">{error}</p>
            <button
              onClick={() => refetch(filters)}
              className="mt-2 text-xs text-red-700 underline hover:no-underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && !data && (
          <div className="bg-white rounded-lg border border-gray-200 p-16 text-center">
            <div className="w-10 h-10 border-4 border-gray-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-500">Generating Statement of Profit or Lossâ€¦</p>
          </div>
        )}

        {/* â”€â”€ Report â”€â”€ */}
        {data && !loading && (
          <>
            {/* Column header */}
            <div className="bg-gray-800 text-gray-300 text-xs font-semibold uppercase tracking-wider rounded-t-lg flex items-center px-4 py-3">
              <div className="w-5 mr-2 flex-shrink-0" />
              <div className="w-28 flex-shrink-0 mr-3">Acc. No.</div>
              <div className="flex-1">Account / Description</div>
              <div className="w-40 text-right flex-shrink-0">Amount (₦)</div>
            </div>

            <div className="rounded-b-lg overflow-hidden border border-gray-200">
              {/* â”€â”€ Revenue Section â”€â”€ */}
              <div className="mb-0">
                <div className="px-5 py-2 bg-gray-100 border-b border-gray-200">
                  <span className="text-xs font-bold uppercase tracking-widest text-gray-500">
                    Income
                  </span>
                </div>
                <div>
                  <div
                    tabIndex={0}
                    className="flex items-center justify-between px-5 py-3.5 cursor-pointer select-none transition-colors hover:brightness-95 border-b bg-blue-50 border-blue-200"
                    onClick={() => toggleSection('revenue')}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') toggleSection('revenue');
                    }}
                  >
                    <div className="flex items-center gap-2">
                      {expandedSections.has('revenue') ? (
                        <ChevronDown className="h-4 w-4 text-gray-500" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-gray-400" />
                      )}
                      <div>
                        <span className="font-bold text-sm text-blue-700">Revenue</span>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Income from ordinary activities of the entity
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-400 mb-0.5">Total</p>
                      <p className="font-bold font-mono text-sm tabular-nums text-blue-700">
                        ₦{fmtAmt(data.revenue.total)}
                      </p>
                    </div>
                  </div>

                  {expandedSections.has('revenue') && (
                    <div>
                      {data.revenue.accounts.length === 0 ? (
                        <div className="px-6 py-6 text-center text-xs text-gray-400">
                          No revenue accounts
                        </div>
                      ) : (
                        data.revenue.accounts.map(acc => renderAccount(acc, 0, 'text-blue-700'))
                      )}
                      <div className="flex items-center px-4 py-2.5 bg-gray-50 border-t border-gray-200 text-xs font-semibold">
                        <div className="w-5 mr-2 flex-shrink-0" />
                        <div className="w-28 flex-shrink-0 mr-3" />
                        <div className="flex-1 text-blue-700">Total Revenue</div>
                        <div className="w-40 text-right font-mono tabular-nums text-blue-800">
                          ₦{fmtAmt(data.revenue.total)}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="h-px bg-gray-200" />

              {/* â”€â”€ Expenses Section â”€â”€ */}
              <div>
                <div className="px-5 py-2 bg-gray-100 border-b border-gray-200">
                  <span className="text-xs font-bold uppercase tracking-widest text-gray-500">
                    Expenditure
                  </span>
                </div>
                <div>
                  <div
                    tabIndex={0}
                    className="flex items-center justify-between px-5 py-3.5 cursor-pointer select-none transition-colors hover:brightness-95 border-b bg-red-50 border-red-200"
                    onClick={() => toggleSection('expenses')}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') toggleSection('expenses');
                    }}
                  >
                    <div className="flex items-center gap-2">
                      {expandedSections.has('expenses') ? (
                        <ChevronDown className="h-4 w-4 text-gray-500" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-gray-400" />
                      )}
                      <div>
                        <span className="font-bold text-sm text-red-700">Operating Expenses</span>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Costs incurred in generating revenue
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-400 mb-0.5">Total</p>
                      <p className="font-bold font-mono text-sm tabular-nums text-red-700">
                        ₦{fmtAmt(data.expenses.total)}
                      </p>
                    </div>
                  </div>

                  {expandedSections.has('expenses') && (
                    <div>
                      {data.expenses.accounts.length === 0 ? (
                        <div className="px-6 py-6 text-center text-xs text-gray-400">
                          No expense accounts
                        </div>
                      ) : (
                        data.expenses.accounts.map(acc => renderAccount(acc, 0, 'text-red-700'))
                      )}
                      <div className="flex items-center px-4 py-2.5 bg-gray-50 border-t border-gray-200 text-xs font-semibold">
                        <div className="w-5 mr-2 flex-shrink-0" />
                        <div className="w-28 flex-shrink-0 mr-3" />
                        <div className="flex-1 text-red-700">Total Operating Expenses</div>
                        <div className="w-40 text-right font-mono tabular-nums text-red-800">
                          ₦{fmtAmt(data.expenses.total)}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Net Profit / Loss calculation strip */}
            <div
              className={`rounded-lg border-2 px-5 py-4 flex items-center justify-between ${
                isProfitable ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'
              }`}
            >
              <div className="flex items-center gap-3">
                {isProfitable ? (
                  <div className="p-2 bg-green-100 rounded-lg">
                    <TrendingUp className="h-5 w-5 text-green-600" />
                  </div>
                ) : (
                  <div className="p-2 bg-red-100 rounded-lg">
                    <TrendingDown className="h-5 w-5 text-red-600" />
                  </div>
                )}
                <div>
                  <p
                    className={`font-bold text-sm ${isProfitable ? 'text-green-800' : 'text-red-800'}`}
                  >
                    {isProfitable ? 'Net Profit for the Period' : 'Net Loss for the Period'}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Revenue ({fmtAmt(data.revenue.total)}) âˆ’ Expenses (
                    {fmtAmt(data.expenses.total)})
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p
                  className={`text-2xl font-bold font-mono tabular-nums ${isProfitable ? 'text-green-700' : 'text-red-700'}`}
                >
                  ₦{fmtAmt(data.net_profit)}
                </p>
                {data.net_margin_percent && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    Net margin:{' '}
                    <span
                      className={`font-semibold ${isProfitable ? 'text-green-700' : 'text-red-700'}`}
                    >
                      {parseFloat(data.net_margin_percent).toFixed(2)}%
                    </span>
                  </p>
                )}
              </div>
            </div>

            {/* Summary KPIs */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-blue-900 text-white rounded-lg px-5 py-4">
                <p className="text-xs text-blue-300 uppercase tracking-wide mb-1">Total Revenue</p>
                <p className="text-xl font-bold font-mono tabular-nums text-blue-100">
                  ₦{fmtAmt(data.revenue.total)}
                </p>
              </div>
              <div className="bg-red-900 text-white rounded-lg px-5 py-4">
                <p className="text-xs text-red-300 uppercase tracking-wide mb-1">Total Expenses</p>
                <p className="text-xl font-bold font-mono tabular-nums text-red-100">
                  ₦{fmtAmt(data.expenses.total)}
                </p>
              </div>
              <div
                className={`text-white rounded-lg px-5 py-4 ${
                  isProfitable ? 'bg-green-800' : 'bg-red-800'
                }`}
              >
                <p
                  className={`text-xs uppercase tracking-wide mb-1 ${
                    isProfitable ? 'text-green-300' : 'text-red-300'
                  }`}
                >
                  {isProfitable ? 'Net Profit' : 'Net Loss'}
                </p>
                <p
                  className={`text-xl font-bold font-mono tabular-nums ${
                    isProfitable ? 'text-green-100' : 'text-red-100'
                  }`}
                >
                  ₦{fmtAmt(data.net_profit)}
                </p>
              </div>
            </div>

            {/* Comparative if available */}
            {data.comparative && (
              <div className="bg-white border border-gray-200 rounded-lg p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Comparative Analysis</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Prior Period Revenue</p>
                    <p className="font-mono font-semibold text-gray-700">
                      ₦{fmtAmt(data.comparative.revenue)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Prior Period Net Profit</p>
                    <p className="font-mono font-semibold text-gray-700">
                      ₦{fmtAmt(data.comparative.net_profit)}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Empty state */}
        {!loading && !error && !data && (
          <div className="bg-white rounded-lg border border-gray-200 p-16 text-center text-gray-400">
            <TrendingUp className="h-12 w-12 mx-auto mb-4 text-gray-200" />
            <p className="font-medium text-gray-600 mb-1">No Data Available</p>
            <p className="text-sm">
              Select a reporting period and apply filters to generate the statement.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProfitLossPage;
