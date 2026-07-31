// TrialBalancePage â€” FIRS/IFRS Compliant Trial Balance
// Expandable account-type sections, Dr/Cr columns, balance check

import React, { useState, useCallback, useMemo } from 'react';
import {
  Scale,
  CheckCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  GitBranch,
} from 'lucide-react';
import { useTrialBalance, useConsolidatedTrialBalance } from '../../hooks/useTrialBalance';
import { usePermission } from '../../hooks/usePermissions';
import { useAuth } from '../../contexts/AuthContext';
import ReportFilters from '../../components/financialReports/ReportFilters';
import ExportControls from '../../components/financialReports/ExportControls';
import {
  AccountBalance,
  TrialBalanceParams,
  ReportFilters as ReportFiltersType,
  ExportFormat,
  ConsolidatedTrialBalanceData,
} from '../../types/financialReports';

const TYPE_GROUPS = [
  {
    type: 'ASSET',
    label: 'Assets',
    colorClass: 'text-emerald-700',
    headerClass: 'bg-emerald-50 border-emerald-200',
  },
  {
    type: 'LIABILITY',
    label: 'Liabilities',
    colorClass: 'text-orange-700',
    headerClass: 'bg-orange-50 border-orange-200',
  },
  {
    type: 'EQUITY',
    label: 'Equity',
    colorClass: 'text-purple-700',
    headerClass: 'bg-purple-50 border-purple-200',
  },
  {
    type: 'INCOME',
    label: 'Revenue / Income',
    colorClass: 'text-blue-700',
    headerClass: 'bg-blue-50 border-blue-200',
  },
  {
    type: 'EXPENSE',
    label: 'Expenses',
    colorClass: 'text-red-700',
    headerClass: 'bg-red-50 border-red-200',
  },
  {
    type: 'SAVINGS',
    label: 'Savings Accounts',
    colorClass: 'text-cyan-700',
    headerClass: 'bg-cyan-50 border-cyan-200',
  },
  {
    type: 'LOAN',
    label: 'Loan Accounts',
    colorClass: 'text-rose-700',
    headerClass: 'bg-rose-50 border-rose-200',
  },
] as const;

const LEVEL_INDENT = ['pl-4', 'pl-11', 'pl-[72px]', 'pl-[100px]'] as const;

const fmtAmt = (v: string | number) => {
  const n = typeof v === 'number' ? v : parseFloat(v as string);
  return isNaN(n) || n === 0
    ? ''
    : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const fmtTotal = (v: string | number) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return isNaN(n)
    ? '0.00'
    : Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

/** Compute the net Dr/Cr columns for a single account (standard trial balance format). */
function netBalance(acc: AccountBalance): { drAmt: number; crAmt: number } {
  const dr = parseFloat(acc.debit || '0');
  const cr = parseFloat(acc.credit || '0');
  const net = dr - cr;
  return net >= 0 ? { drAmt: net, crAmt: 0 } : { drAmt: 0, crAmt: Math.abs(net) };
}

/** Sum net Dr totals across an array of accounts (for group/grand totals). */
function groupNetDr(accounts: AccountBalance[]): number {
  return accounts.reduce((s, a) => s + netBalance(a).drAmt, 0);
}

/** Sum net Cr totals across an array of accounts (for group/grand totals). */
function groupNetCr(accounts: AccountBalance[]): number {
  return accounts.reduce((s, a) => s + netBalance(a).crAmt, 0);
}
const fmtDate = (d: string) => {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

const TrialBalancePage: React.FC = () => {
  const [filters, setFilters] = useState<TrialBalanceParams>({
    detail_level: 'detailed',
    include_zero_balances: false,
  });
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(
    new Set(['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE', 'SAVINGS', 'LOAN'])
  );
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());
  const [consolidatedMode, setConsolidatedMode] = useState(false);

  const { data, loading, error, refetch, exportReport, isRefetching } = useTrialBalance(filters);

  const { isElevated } = usePermission();
  const { activeBranch } = useAuth();
  // Matches the backend's own gate (resolve_effective_branch(request) is None) —
  // a single branch selected has nothing to consolidate.
  const canViewConsolidated = isElevated && !activeBranch;
  // Consolidated summary only (no children) — the backend doesn't currently
  // tag nested child accounts with branch_id/is_interbranch_eliminated, only
  // top-level parent rows, so 'detailed'/'all' would collide same-code
  // accounts from different branches under one un-attributed row.
  const consolidatedParams: TrialBalanceParams = {
    start_date: filters.start_date,
    end_date: filters.end_date,
    detail_level: 'summary',
    include_zero_balances: filters.include_zero_balances,
  };
  const {
    data: consolidatedData,
    loading: consolidatedLoading,
    error: consolidatedError,
  } = useConsolidatedTrialBalance(consolidatedParams, consolidatedMode && canViewConsolidated);

  const handleFiltersChange = useCallback(
    (newFilters: ReportFiltersType) => {
      const params: TrialBalanceParams = {
        start_date: newFilters.startDate,
        end_date: newFilters.endDate,
        detail_level: newFilters.detailLevel || 'summary',
        include_zero_balances: newFilters.includeZeroBalances || false,
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

  const toggleType = (type: string) =>
    setExpandedTypes(prev => {
      const next = new Set(prev);
      next.has(type) ? next.delete(type) : next.add(type);
      return next;
    });

  const toggleAccount = (code: string) =>
    setExpandedAccounts(prev => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });

  const groups = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, AccountBalance[]>();
    data.accounts.forEach(acc => {
      if (!map.has(acc.account_type)) map.set(acc.account_type, []);
      map.get(acc.account_type)!.push(acc);
    });
    return TYPE_GROUPS.filter(g => map.has(g.type)).map(g => ({
      ...g,
      accounts: map.get(g.type)!,
    }));
  }, [data]);

  const renderAccount = (
    acc: AccountBalance,
    level: number,
    colorClass: string
  ): React.ReactNode => {
    const hasChildren = acc.children && acc.children.length > 0;
    const isExpanded = expandedAccounts.has(acc.code);
    const isParent = acc.level === 'PARENT';
    const { drAmt, crAmt } = netBalance(acc);
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
            className={`flex-1 text-sm min-w-0 pr-4 ${isParent ? 'font-semibold text-gray-900' : 'text-gray-700'}`}
          >
            {acc.name}
          </div>
          <div className="w-36 flex-shrink-0 text-right font-mono text-sm text-blue-700 tabular-nums">
            {drAmt > 0 ? fmtAmt(drAmt) : ''}
          </div>
          <div className="w-36 flex-shrink-0 text-right font-mono text-sm text-rose-700 tabular-nums">
            {crAmt > 0 ? fmtAmt(crAmt) : ''}
          </div>
        </div>
        {hasChildren && isExpanded && acc.children && (
          <>{acc.children.map(child => renderAccount(child, level + 1, colorClass))}</>
        )}
      </React.Fragment>
    );
  };

  const isBalanced = data?.is_balanced ?? null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* â”€â”€ Header â”€â”€ */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-slate-100 rounded-lg mt-0.5">
                <Scale className="h-5 w-5 text-slate-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Trial Balance</h1>
                <p className="text-sm text-gray-500 mt-0.5">
                  {data?.date_range
                    ? data.date_range.start
                      ? `For the period ${fmtDate(data.date_range.start)} to ${fmtDate(data.date_range.end)}`
                      : `As at ${fmtDate(data.date_range.end)}`
                    : 'Verify that total debits equal total credits across all accounts'}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  FIRS / IFRS Compliant Â· Nigerian Generally Accepted Accounting Practice
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
              reportType="trial-balance"
              onFiltersChange={handleFiltersChange}
              initialFilters={{
                detailLevel: filters.detail_level,
                includeZeroBalances: filters.include_zero_balances,
              }}
              loading={loading || isRefetching}
            />
          </div>
          {canViewConsolidated && (
            <div className="mt-4 flex items-center justify-between rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={consolidatedMode}
                  onChange={e => setConsolidatedMode(e.target.checked)}
                  className="accent-cyan-600"
                />
                <GitBranch className="h-4 w-4 text-cyan-700" />
                <span className="text-sm font-medium text-cyan-900">
                  Consolidated (All Branches)
                </span>
              </label>
              <span className="text-xs text-cyan-700">
                Reciprocal Due-from/Due-to inter-branch clearing pairs are eliminated from the
                totals below
              </span>
            </div>
          )}
        </div>
      </div>

      {consolidatedMode && canViewConsolidated ? (
        <ConsolidatedTrialBalanceView
          data={consolidatedData}
          loading={consolidatedLoading}
          error={consolidatedError}
        />
      ) : (
        <div className="max-w-7xl mx-auto px-6 py-6 space-y-4">
          {/* Balance status banner */}
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
                  className={`font-semibold text-sm ${isBalanced ? 'text-green-800' : 'text-red-800'}`}
                >
                  {isBalanced
                    ? 'Trial Balance is Balanced âœ“'
                    : 'Trial Balance is Out of Balance âš '}
                </p>
                {!isBalanced && data && (
                  <p className="text-xs mt-0.5 text-red-700">
                    Difference: ₦{fmtTotal(data.totals.difference)} â€” Review journal entries for
                    posting errors.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
              <p className="font-semibold text-sm">Failed to load Trial Balance</p>
              <p className="text-xs mt-1">{error}</p>
              <button
                type="button"
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
              <div className="w-10 h-10 border-4 border-gray-200 border-t-slate-600 rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-gray-500">Generating Trial Balanceâ€¦</p>
            </div>
          )}

          {/* â”€â”€ Report â”€â”€ */}
          {data && !loading && (
            <>
              {/* Column headers */}
              <div className="bg-gray-800 text-gray-300 text-xs font-semibold uppercase tracking-wider rounded-t-lg flex items-center px-4 py-3">
                <div className="w-5 mr-2 flex-shrink-0" />
                <div className="w-28 flex-shrink-0 mr-3">Acc. No.</div>
                <div className="flex-1">Account Name</div>
                <div className="w-36 text-right flex-shrink-0">Debit (₦)</div>
                <div className="w-36 text-right flex-shrink-0">Credit (₦)</div>
              </div>

              {/* Account type groups */}
              <div className="rounded-b-lg overflow-hidden border border-gray-200">
                {groups.map((group, idx) => {
                  const isExpanded = expandedTypes.has(group.type);
                  const isLast = idx === groups.length - 1;
                  const gDr = groupNetDr(group.accounts);
                  const gCr = groupNetCr(group.accounts);
                  return (
                    <div
                      key={group.type}
                      className={`bg-white overflow-hidden ${!isLast ? 'border-b border-gray-200' : ''}`}
                    >
                      {/* Group header */}
                      <div
                        tabIndex={0}
                        className={`flex items-center justify-between px-5 py-3.5 cursor-pointer select-none transition-colors hover:brightness-95 border-b ${group.headerClass}`}
                        onClick={() => toggleType(group.type)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') toggleType(group.type);
                        }}
                      >
                        <div className="flex items-center gap-2">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-gray-500" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-gray-400" />
                          )}
                          <span className={`font-bold text-sm ${group.colorClass}`}>
                            {group.label}
                          </span>
                          <span className="text-xs text-gray-400">({group.accounts.length})</span>
                        </div>
                        <div className="flex items-center gap-6 text-xs font-mono">
                          <span className="text-blue-700 tabular-nums">
                            Dr: {gDr > 0 ? fmtTotal(gDr) : 'â€”'}
                          </span>
                          <span className="text-rose-700 tabular-nums">
                            Cr: {gCr > 0 ? fmtTotal(gCr) : 'â€”'}
                          </span>
                        </div>
                      </div>

                      {/* Account rows */}
                      {isExpanded && (
                        <div>
                          {group.accounts.map(acc => renderAccount(acc, 0, group.colorClass))}
                          {/* Subtotal */}
                          <div className="flex items-center px-4 py-2.5 bg-gray-50 border-t border-gray-200 text-xs font-semibold">
                            <div className="w-5 mr-2 flex-shrink-0" />
                            <div className="w-28 flex-shrink-0 mr-3" />
                            <div className={`flex-1 ${group.colorClass}`}>Total {group.label}</div>
                            <div className="w-36 text-right font-mono tabular-nums text-blue-800">
                              {gDr > 0 ? fmtTotal(gDr) : 'â€”'}
                            </div>
                            <div className="w-36 text-right font-mono tabular-nums text-rose-800">
                              {gCr > 0 ? fmtTotal(gCr) : 'â€”'}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Grand totals — computed from net per-account balances */}
              {(() => {
                const allAccounts = groups.flatMap(g => g.accounts);
                const grandDr = groupNetDr(allAccounts);
                const grandCr = groupNetCr(allAccounts);
                const diff = Math.abs(grandDr - grandCr);
                return (
                  <div className="bg-gray-900 text-white rounded-lg px-5 py-4 flex items-center">
                    <div className="w-5 mr-2 flex-shrink-0" />
                    <div className="w-28 flex-shrink-0 mr-3" />
                    <div className="flex-1 font-bold uppercase tracking-wide text-sm">
                      Grand Total
                      {diff > 0.005 && (
                        <span className="ml-3 text-xs font-normal text-red-400">
                          Difference: ₦{fmtTotal(diff)}
                        </span>
                      )}
                    </div>
                    <div className="w-36 text-right font-bold font-mono tabular-nums text-blue-300">
                      ₦{fmtTotal(grandDr)}
                    </div>
                    <div className="w-36 text-right font-bold font-mono tabular-nums text-rose-300">
                      ₦{fmtTotal(grandCr)}
                    </div>
                  </div>
                );
              })()}

              {/* Final balance agreement line */}
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
                    className={`font-semibold text-sm ${isBalanced ? 'text-green-800' : 'text-red-800'}`}
                  >
                    {isBalanced
                      ? 'Î£ Debits = Î£ Credits â€” Trial Balance Agreed'
                      : 'Î£ Debits â‰  Î£ Credits â€” Discrepancy Detected'}
                  </span>
                </div>
                {!isBalanced && (
                  <span className="font-mono text-sm text-red-700 font-bold">
                    Î” ₦{fmtTotal(data.totals.difference)}
                  </span>
                )}
              </div>
            </>
          )}

          {/* Empty state */}
          {!loading && !error && !data && (
            <div className="bg-white rounded-lg border border-gray-200 p-16 text-center text-gray-400">
              <Scale className="h-12 w-12 mx-auto mb-4 text-gray-200" />
              <p className="font-medium text-gray-600 mb-1">No Trial Balance Data</p>
              <p className="text-sm">
                Select a date range and apply filters to generate the report.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Consolidated (All Branches) view ────────────────────────────────────────
// Deliberately a separate, simpler flat table rather than reusing the
// single-branch tree renderer above: consolidated rows are summary-level
// only (see consolidatedParams — 'detail_level: summary', no children) and
// the same GL code can legitimately appear once per branch, which the
// tree renderer's per-code React keys / expand-state Set aren't built to
// disambiguate. A flat table sidesteps that instead of retrofitting it.
const ConsolidatedTrialBalanceView: React.FC<{
  data: ConsolidatedTrialBalanceData | undefined;
  loading: boolean;
  error: string | null;
}> = ({ data, loading, error }) => {
  const isBalanced = data?.is_balanced ?? null;
  const included = useMemo(
    () => (data?.accounts ?? []).filter(a => !a.is_interbranch_eliminated),
    [data]
  );
  const eliminated = useMemo(
    () => (data?.accounts ?? []).filter(a => a.is_interbranch_eliminated),
    [data]
  );

  return (
    <div className="max-w-7xl mx-auto px-6 py-6 space-y-4">
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
          <p className={`font-semibold text-sm ${isBalanced ? 'text-green-800' : 'text-red-800'}`}>
            {isBalanced
              ? 'Consolidated Trial Balance is Balanced ✓'
              : 'Consolidated Trial Balance is Out of Balance ⚠'}
          </p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
          <p className="font-semibold text-sm">Failed to load Consolidated Trial Balance</p>
          <p className="text-xs mt-1">{error}</p>
        </div>
      )}

      {loading && !data && (
        <div className="bg-white rounded-lg border border-gray-200 p-16 text-center">
          <div className="w-10 h-10 border-4 border-gray-200 border-t-cyan-600 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Generating Consolidated Trial Balance…</p>
        </div>
      )}

      {data && !loading && (
        <>
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="min-w-full text-sm divide-y divide-gray-100">
              <thead className="bg-gray-800 text-gray-300 text-xs font-semibold uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 text-left">Acc. No.</th>
                  <th className="px-4 py-3 text-left">Account Name</th>
                  <th className="px-4 py-3 text-left">Branch</th>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-right">Debit (₦)</th>
                  <th className="px-4 py-3 text-right">Credit (₦)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {included.map(acc => {
                  const { drAmt, crAmt } = netBalance(acc);
                  return (
                    <tr key={`${acc.branch_id ?? ''}-${acc.code}`} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{acc.code}</td>
                      <td className="px-4 py-2.5 text-gray-800">{acc.name}</td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs">
                        {acc.branch_name ?? '—'}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs">{acc.account_type}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-blue-700 tabular-nums">
                        {drAmt > 0 ? fmtAmt(drAmt) : ''}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-rose-700 tabular-nums">
                        {crAmt > 0 ? fmtAmt(crAmt) : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-900 text-white font-bold">
                  <td className="px-4 py-3" colSpan={4}>
                    Grand Total
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-blue-300">
                    ₦{fmtTotal(data.totals.total_debits)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-rose-300">
                    ₦{fmtTotal(data.totals.total_credits)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {eliminated.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                <p className="text-sm font-semibold text-gray-700">
                  Inter-Branch Eliminations ({eliminated.length})
                </p>
                <p className="text-xs text-gray-500">
                  Due-from/Due-to clearing pairs — shown for audit, excluded from the totals above
                  since each matches an equal-and-opposite entry in the counterparty branch&apos;s
                  books.
                </p>
              </div>
              <table className="min-w-full text-sm divide-y divide-gray-100">
                <tbody className="divide-y divide-gray-100">
                  {eliminated.map(acc => {
                    const { drAmt, crAmt } = netBalance(acc);
                    return (
                      <tr key={`${acc.branch_id ?? ''}-${acc.code}`} className="text-gray-400">
                        <td className="px-4 py-2 font-mono text-xs">{acc.code}</td>
                        <td className="px-4 py-2">{acc.name}</td>
                        <td className="px-4 py-2 text-xs">{acc.branch_name ?? '—'}</td>
                        <td className="px-4 py-2 text-right font-mono tabular-nums">
                          {drAmt > 0 ? fmtAmt(drAmt) : ''}
                        </td>
                        <td className="px-4 py-2 text-right font-mono tabular-nums">
                          {crAmt > 0 ? fmtAmt(crAmt) : ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {!loading && !error && !data && (
        <div className="bg-white rounded-lg border border-gray-200 p-16 text-center text-gray-400">
          <GitBranch className="h-12 w-12 mx-auto mb-4 text-gray-200" />
          <p className="font-medium text-gray-600 mb-1">No Consolidated Trial Balance Data</p>
        </div>
      )}
    </div>
  );
};

export default TrialBalancePage;
