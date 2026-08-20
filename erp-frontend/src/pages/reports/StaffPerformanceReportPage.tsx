/**
 * Staff Performance Report
 *
 * Promoted out of the Portfolio & Performance report into its own
 * first-class page — this is the "expected vs actual" collections report:
 * per officer, per month, amount_due (what their assigned clients' schedule
 * said was owed) vs collections_received (what was actually paid),
 * expressed as a PERIOD collection_rate. This is a different, more
 * meaningful number than the "Collection Rate" shown elsewhere (e.g. the
 * Director dashboard's officer table), which is a lifetime
 * paid/(paid+outstanding) ratio that mostly reflects loan age, not
 * repayment behaviour — see OfficerScorecardTrendView's docstring
 * (analytics/views.py) for the distinction.
 *
 * Row expand gives a lazy per-officer product-mix drill-down (reuses
 * PortfolioBreakdownView, no new endpoint), plus links out to that
 * officer's disbursements (Disbursement Master Roll) and to the client
 * assignment page for rebalancing an overloaded portfolio.
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  ChevronDown,
  ChevronRight,
  Download,
  Loader2,
  UserCog,
  Users2,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { formatNaira } from '../../services/dashboardStatsService';
import PortfolioPerformanceFilters from '../../components/reports/PortfolioPerformanceFilters';
import {
  portfolioPerformanceService,
  ReportFilters,
  OfficerTrendRow,
  PortfolioBreakdownRow,
} from '../../services/portfolioPerformanceService';
import { BRAND } from '../../constants/brand';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';

// Background refresh so cron-driven loan status/collection changes surface
// without a manual refresh.
const AUTO_REFRESH_MS = 3 * 60_000;

function fmt(v: string | number | null | undefined): string {
  const n = parseFloat(String(v ?? '0'));
  return isNaN(n) ? '0.00' : n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtInt(v: number | null | undefined): string {
  return (v ?? 0).toLocaleString('en-NG');
}

const TREND_COLORS = ['#4f46e5', '#16a34a', '#ea580c', '#db2777', '#0891b2', '#7c3aed'];

// ── Lazy per-officer product-mix drill-down ─────────────────────────────────

function OfficerDrillDown({ officerId, filters }: { officerId: number; filters: ReportFilters }) {
  const [rows, setRows] = useState<PortfolioBreakdownRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    portfolioPerformanceService
      .getBreakdown({ ...filters, officer: officerId }, ['product'])
      .then((res) => { if (!cancelled) setRows(res.data); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [officerId, filters]);

  return (
    <tr className="bg-gray-50/70">
      <td colSpan={7} className="px-4 py-3">
        {loading ? (
          <div className="flex justify-center py-3"><Loader2 size={16} className="animate-spin text-gray-400" /></div>
        ) : rows && rows.length > 0 ? (
          <div className="space-y-2">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-400">
                  <th className="py-1 pr-3">Product</th>
                  <th className="py-1 pr-3 text-right">Loans</th>
                  <th className="py-1 pr-3 text-right">Outstanding Principal</th>
                  <th className="py-1 text-right">Collection Rate (cumulative)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="text-gray-700">
                    <td className="py-1 pr-3">{r.product_name ?? 'Unassigned'}</td>
                    <td className="py-1 pr-3 text-right">{fmtInt(r.loan_count)}</td>
                    <td className="py-1 pr-3 text-right">{formatNaira(r.outstanding_principal)}</td>
                    <td className="py-1 text-right">{fmt(r.collection_rate)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex gap-3 pt-1">
              <Link
                to={`/reports/disbursement-master-roll?officer=${officerId}`}
                className="text-xs font-medium text-blue-600 hover:underline"
              >
                View disbursements →
              </Link>
              <Link
                to="/clients/groups"
                className="text-xs font-medium text-blue-600 hover:underline"
              >
                Reassign clients →
              </Link>
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-400">No product breakdown available for this officer.</p>
        )}
      </td>
    </tr>
  );
}

export default function StaffPerformanceReportPage() {
  const [filters, setFilters] = useState<ReportFilters>({});
  const [months, setMonths] = useState(6);
  const [officerTrend, setOfficerTrend] = useState<OfficerTrendRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  async function load(background = false) {
    if (!background) setLoading(true);
    setError(null);
    try {
      const res = await portfolioPerformanceService.getOfficerTrend(filters, months);
      setOfficerTrend(res.data);
    } catch (e: unknown) {
      const err = e as { detail?: string; message?: string };
      setError(err?.detail ?? err?.message ?? 'Failed to load staff performance data.');
    } finally {
      setLoading(false);
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [filters, months]);

  useAutoRefresh(() => load(true), AUTO_REFRESH_MS);

  function toggleExpand(staffId: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(staffId)) next.delete(staffId); else next.add(staffId);
      return next;
    });
  }

  const officerNames = Array.from(new Set(officerTrend.map((r) => r.name)));
  const monthLabels = Array.from(new Set(officerTrend.map((r) => r.month))).sort();
  const trendChartData = monthLabels.map((m) => {
    const point: Record<string, string | number> = { month: officerTrend.find((r) => r.month === m)?.label ?? m };
    for (const name of officerNames) {
      const row = officerTrend.find((r) => r.month === m && r.name === name);
      point[name] = row ? parseFloat(row.collection_rate) : 0;
    }
    return point;
  });

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mb-6 flex items-center gap-3">
        <Link to="/reports" className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <div className="flex items-center gap-2">
            <UserCog size={20} style={{ color: BRAND.colors.navyPrimary }} />
            <h1 className="text-xl font-bold text-gray-900">Staff Performance Report</h1>
          </div>
          <p className="text-sm text-gray-500">
            What each officer's assigned clients owed vs. what was actually collected — a period rate, not a lifetime one.
          </p>
        </div>
      </div>

      <PortfolioPerformanceFilters
        filters={filters}
        onFiltersChange={setFilters}
        groupBy={[]}
        onGroupByChange={() => { /* no group-by control needed on this page */ }}
        showGroupBy={false}
      />

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 size={28} className="animate-spin text-blue-600" />
        </div>
      ) : (
        <div className="rounded-xl bg-white shadow-sm">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <div className="flex items-center gap-2">
              <BarChart3 size={16} className="text-teal-600" />
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Officer Scorecard Trend</h2>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={months}
                onChange={(e) => setMonths(Number(e.target.value))}
                className="rounded-lg border border-gray-300 py-1.5 px-2 text-xs"
              >
                <option value={3}>Last 3 months</option>
                <option value={6}>Last 6 months</option>
                <option value={12}>Last 12 months</option>
                <option value={24}>Last 24 months</option>
              </select>
              <button
                type="button"
                onClick={() => portfolioPerformanceService.downloadCsv('officer-trend', filters, { months })}
                className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                <Download size={13} /> CSV
              </button>
            </div>
          </div>

          <div className="p-5">
            {officerTrend.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={trendChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} unit="%" />
                    <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} />
                    <Legend />
                    {officerNames.map((name, i) => (
                      <Line key={name} type="monotone" dataKey={name} stroke={TREND_COLORS[i % TREND_COLORS.length]} strokeWidth={2} dot={false} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>

                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        <th className="px-4 py-2 w-6" />
                        <th className="px-4 py-2">Month</th>
                        <th className="px-4 py-2">Officer</th>
                        <th className="px-4 py-2 text-right">Disbursed</th>
                        <th className="px-4 py-2 text-right">Amount Due</th>
                        <th className="px-4 py-2 text-right">Collected</th>
                        <th className="px-4 py-2 text-right">Collection Rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {officerTrend.map((row, i) => (
                        <React.Fragment key={i}>
                          <tr className="cursor-pointer hover:bg-gray-50" onClick={() => toggleExpand(row.staff_id)}>
                            <td className="px-4 py-2 text-gray-400">
                              {expanded.has(row.staff_id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </td>
                            <td className="px-4 py-2 text-gray-600">{row.label}</td>
                            <td className="px-4 py-2 font-medium text-gray-800">{row.name}</td>
                            <td className="px-4 py-2 text-right text-gray-600">{formatNaira(row.disbursed_amount)}</td>
                            <td className="px-4 py-2 text-right text-gray-600">{formatNaira(row.amount_due)}</td>
                            <td className="px-4 py-2 text-right text-gray-600">{formatNaira(row.collections_received)}</td>
                            <td className={`px-4 py-2 text-right font-semibold ${parseFloat(row.collection_rate) >= 90 ? 'text-green-600' : 'text-orange-600'}`}>
                              {fmt(row.collection_rate)}%
                            </td>
                          </tr>
                          {expanded.has(row.staff_id) && (
                            <OfficerDrillDown officerId={row.staff_id} filters={filters} />
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-400">No officer activity in the selected trend window.</p>
            )}
          </div>
        </div>
      )}

      {/* Related reports */}
      <div className="mt-6 rounded-xl bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Related Reports</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Link
            to="/reports/portfolio-performance"
            className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <BarChart3 size={16} className="text-indigo-500" />
            Portfolio &amp; Performance Report
          </Link>
          <Link
            to="/reports/disbursement-master-roll"
            className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <BarChart3 size={16} className="text-orange-500" />
            Disbursement Master Roll
          </Link>
          <Link
            to="/clients/groups"
            className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Users2 size={16} className="text-purple-500" />
            Client Assignment
          </Link>
        </div>
      </div>
    </div>
  );
}
