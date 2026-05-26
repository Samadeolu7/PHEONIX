// BalanceSheetPage â€” Statement of Financial Position (FIRS / IAS 1)
// Expandable Current / Non-Current sections, accounting equation check

import React, { useState, useCallback } from 'react';
import { FileText, CheckCircle, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { useBalanceSheet } from '../../hooks/useBalanceSheet';
import ReportFilters from '../../components/financialReports/ReportFilters';
import ExportControls from '../../components/financialReports/ExportControls';
import {
  AccountBalance,
  BalanceSheetParams,
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

interface SectionRow {
  key: string;
  label: string;
  sublabel: string;
  accounts: AccountBalance[];
  total: string;
  colorClass: string;
  bgClass: string;
  borderClass: string;
  /** Optional extra line shown after accounts (used for Net Profit in equity section) */
  extraLine?: { label: string; amount: string; colorClass: string };
}

const BalanceSheetPage: React.FC = () => {
  const [filters, setFilters] = useState<BalanceSheetParams>({ detail_level: 'detailed' });
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set([
      'assets-current',
      'assets-noncurrent',
      'liabilities-current',
      'liabilities-noncurrent',
      'equity',
    ])
  );
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());

  const { data, loading, error, refetch, exportReport, isRefetching } = useBalanceSheet(filters);

  const handleFiltersChange = useCallback(
    (newFilters: ReportFiltersType) => {
      const params: BalanceSheetParams = {
        as_of_date: newFilters.asOfDate,
        detail_level: newFilters.detailLevel || 'summary',
        comparative_date: newFilters.comparativeDate,
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

  const getSections = (): SectionRow[] => {
    if (!data) return [];
    return [
      {
        key: 'assets-current',
        label: 'Current Assets',
        sublabel: 'Assets expected to be realised within twelve months',
        accounts: data.assets.current.accounts,
        total: data.assets.current.total,
        colorClass: 'text-emerald-700',
        bgClass: 'bg-emerald-50',
        borderClass: 'border-emerald-200',
      },
      {
        key: 'assets-noncurrent',
        label: 'Non-Current Assets',
        sublabel: 'Assets expected to be held beyond twelve months',
        accounts: data.assets.non_current.accounts,
        total: data.assets.non_current.total,
        colorClass: 'text-emerald-800',
        bgClass: 'bg-emerald-50',
        borderClass: 'border-emerald-200',
      },
      {
        key: 'liabilities-current',
        label: 'Current Liabilities',
        sublabel: 'Obligations due within twelve months',
        accounts: data.liabilities.current.accounts,
        total: data.liabilities.current.total,
        colorClass: 'text-orange-700',
        bgClass: 'bg-orange-50',
        borderClass: 'border-orange-200',
      },
      {
        key: 'liabilities-noncurrent',
        label: 'Non-Current Liabilities',
        sublabel: 'Obligations due beyond twelve months',
        accounts: data.liabilities.non_current.accounts,
        total: data.liabilities.non_current.total,
        colorClass: 'text-orange-800',
        bgClass: 'bg-orange-50',
        borderClass: 'border-orange-200',
      },
      {
        key: 'equity',
        label: 'Equity',
        sublabel: "Residual interest in the entity's net assets",
        accounts: data.equity.accounts,
        total: data.equity.total,
        colorClass: 'text-purple-700',
        bgClass: 'bg-purple-50',
        borderClass: 'border-purple-200',
        extraLine:
          data.equity.net_profit_for_period != null
            ? {
                label:
                  parseFloat(data.equity.net_profit_for_period) >= 0
                    ? 'Net Profit for the Period'
                    : 'Net Loss for the Period',
                // Store as absolute value; label + colour convey the sign
                amount: String(Math.abs(parseFloat(data.equity.net_profit_for_period))),
                colorClass:
                  parseFloat(data.equity.net_profit_for_period) >= 0
                    ? 'text-green-700'
                    : 'text-red-700',
              }
            : undefined,
      },
    ];
  };

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

  const renderGroup = (
    sectionKeys: string[],
    groupLabel: string,
    groupTotal: string,
    groupTotalLabel: string,
    sections: SectionRow[]
  ) => {
    const sectionList = sections.filter(s => sectionKeys.includes(s.key));
    return (
      <div className="mb-2">
        <div className="px-5 py-2 bg-gray-100 border-b border-gray-200">
          <span className="text-xs font-bold uppercase tracking-widest text-gray-500">
            {groupLabel}
          </span>
        </div>

        {sectionList.map(sec => {
          const isExpanded = expandedSections.has(sec.key);
          return (
            <div key={sec.key} className="overflow-hidden">
              <div
                tabIndex={0}
                className={`flex items-center justify-between px-5 py-3.5 cursor-pointer select-none transition-colors hover:brightness-95 border-b ${sec.bgClass} ${sec.borderClass}`}
                onClick={() => toggleSection(sec.key)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') toggleSection(sec.key);
                }}
              >
                <div className="flex items-center gap-2">
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-gray-500" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  )}
                  <div>
                    <span className={`font-bold text-sm ${sec.colorClass}`}>{sec.label}</span>
                    <p className="text-xs text-gray-500 mt-0.5">{sec.sublabel}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400 mb-0.5">Total</p>
                  <p className={`font-bold font-mono text-sm tabular-nums ${sec.colorClass}`}>
                    ₦{fmtAmt(sec.total)}
                  </p>
                </div>
              </div>

              {isExpanded && (
                <div>
                  {sec.accounts.length === 0 && !sec.extraLine ? (
                    <div className="px-6 py-6 text-center text-xs text-gray-400">
                      No accounts in this section
                    </div>
                  ) : (
                    sec.accounts.map(acc => renderAccount(acc, 0, sec.colorClass))
                  )}
                  {/* Extra line — used for Net Profit / Loss in the Equity section */}
                  {sec.extraLine && (
                    <div className="flex items-center px-4 py-2.5 border-b border-indigo-100 bg-indigo-50/60">
                      <div className="w-5 mr-2 flex-shrink-0">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-400 ml-1.5" />
                      </div>
                      <div className="w-28 flex-shrink-0 font-mono text-xs font-semibold text-indigo-300 mr-3">
                        &mdash;
                      </div>
                      <div
                        className={`flex-1 text-sm font-semibold italic ${sec.extraLine.colorClass}`}
                      >
                        {sec.extraLine.label}
                      </div>
                      <div
                        className={`w-40 flex-shrink-0 text-right font-mono text-sm tabular-nums font-bold ${sec.extraLine.colorClass}`}
                      >
                        &#x20A6;{fmtAmt(sec.extraLine.amount)}
                      </div>
                    </div>
                  )}
                  <div className="flex items-center px-4 py-2.5 bg-gray-50 border-t border-gray-200 text-xs font-semibold">
                    <div className="w-5 mr-2 flex-shrink-0" />
                    <div className="w-28 flex-shrink-0 mr-3" />
                    <div className={`flex-1 ${sec.colorClass}`}>Total {sec.label}</div>
                    <div className="w-40 text-right font-mono tabular-nums text-gray-800">
                      &#x20A6;{fmtAmt(sec.total)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        <div className="flex items-center px-5 py-3 bg-gray-800 text-white text-sm font-bold">
          <div className="flex-1">{groupTotalLabel}</div>
          <div className="font-mono tabular-nums">₦{fmtAmt(groupTotal)}</div>
        </div>
      </div>
    );
  };

  const isBalanced = data?.is_balanced ?? null;
  const sections = getSections();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* â”€â”€ Header â”€â”€ */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-indigo-100 rounded-lg mt-0.5">
                <FileText className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Statement of Financial Position
                </h1>
                <p className="text-sm text-gray-500 mt-0.5">
                  {data?.as_of_date
                    ? `As at ${fmtDate(data.as_of_date)}`
                    : 'Financial position of the entity at a point in time'}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Formerly: Balance Sheet Â· FIRS / IAS 1 Compliant
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
              reportType="balance-sheet"
              onFiltersChange={handleFiltersChange}
              initialFilters={{
                asOfDate: filters.as_of_date,
                detailLevel: filters.detail_level,
                comparativeDate: filters.comparative_date,
              }}
              loading={loading || isRefetching}
            />
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-4">
        {/* Equation check banner */}
        {isBalanced !== null && (
          <div
            className={`flex items-center gap-3 p-4 rounded-lg border ${
              isBalanced ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
            }`}
          >
            {isBalanced ? (
              <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0" />
            )}
            <div>
              <p
                className={`font-semibold text-sm ${
                  isBalanced ? 'text-green-800' : 'text-red-800'
                }`}
              >
                {isBalanced
                  ? 'Accounting Equation Satisfied: Assets = Liabilities + Equity âœ“'
                  : 'Accounting Equation Not Satisfied âš  â€” Review account balances'}
              </p>
              {data && (
                <p className="text-xs text-gray-500 mt-0.5">
                  Total Assets: ₦{fmtAmt(data.assets.total)} Â· Total Liabilities + Equity: ₦
                  {fmtAmt(data.total_liabilities_equity)}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
            <p className="font-semibold text-sm">Failed to load Statement of Financial Position</p>
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
            <div className="w-10 h-10 border-4 border-gray-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-500">Generating Statement of Financial Positionâ€¦</p>
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

            {/* Report body */}
            <div className="rounded-b-lg overflow-hidden border border-gray-200">
              {renderGroup(
                ['assets-current', 'assets-noncurrent'],
                'Assets',
                data.assets.total,
                'TOTAL ASSETS',
                sections
              )}

              <div className="h-2 bg-gray-50 border-y border-gray-200" />

              {renderGroup(
                ['liabilities-current', 'liabilities-noncurrent'],
                'Liabilities',
                data.liabilities.total,
                'TOTAL LIABILITIES',
                sections
              )}
              {renderGroup(['equity'], 'Equity', data.equity.total, 'TOTAL EQUITY', sections)}
            </div>

            {/* Grand summary */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-emerald-900 text-white rounded-lg px-5 py-4 flex items-center justify-between">
                <span className="font-bold uppercase tracking-wide text-sm">Total Assets</span>
                <span className="font-bold font-mono tabular-nums text-emerald-300">
                  ₦{fmtAmt(data.assets.total)}
                </span>
              </div>
              <div className="bg-gray-900 text-white rounded-lg px-5 py-4 flex items-center justify-between">
                <span className="font-bold uppercase tracking-wide text-sm">
                  Total Equity &amp; Liabilities
                </span>
                <span className="font-bold font-mono tabular-nums text-purple-300">
                  ₦{fmtAmt(data.total_liabilities_equity)}
                </span>
              </div>
            </div>

            {/* Equation check line */}
            <div
              className={`rounded-lg border p-4 flex items-center justify-between ${
                isBalanced ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
              }`}
            >
              <div className="flex items-center gap-2">
                {isBalanced ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                )}
                <span
                  className={`font-semibold text-sm ${
                    isBalanced ? 'text-green-800' : 'text-red-800'
                  }`}
                >
                  {isBalanced
                    ? 'Assets = Liabilities + Equity â€” Statement Agreed âœ“'
                    : 'Assets â‰  Liabilities + Equity â€” Statement Does Not Agree âš '}
                </span>
              </div>
              {isBalanced && (
                <span className="text-xs text-green-700 font-mono">
                  ₦{fmtAmt(data.assets.total)}
                </span>
              )}
            </div>
          </>
        )}

        {/* Empty state */}
        {!loading && !error && !data && (
          <div className="bg-white rounded-lg border border-gray-200 p-16 text-center text-gray-400">
            <FileText className="h-12 w-12 mx-auto mb-4 text-gray-200" />
            <p className="font-medium text-gray-600 mb-1">No Data Available</p>
            <p className="text-sm">
              Select a reporting date and apply filters to generate the statement.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default BalanceSheetPage;
