/**
 * Director Portfolio & Performance Overview
 *
 * The director-level equivalent of OfficerPortfolioPage — same at-a-glance,
 * no-date-picker style, but scoped to the full portfolio (or a selected
 * branch) rather than one officer's assigned clients. Brings over the old
 * system's dash.html director-relevant reports (expected/actual cash inflow,
 * portfolio at risk, defaulters, staff performance, loan performance by
 * product) and adds richer data the old system never had: CBN risk-band
 * breakdown with required provisioning, and a real per-officer scorecard.
 */

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CreditCard,
  DollarSign,
  Loader2,
  RefreshCw,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  Users,
  UserCog,
  Wallet,
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { loanService, PARSummary, CBNReturns } from '../../services/loanService';
import CashInflowForecastCard from '../../components/dashboard/CashInflowForecastCard';
import {
  dashboardStatsService,
  MicrofinanceDashboardStats,
  StaffPerformanceRow,
  CashInflowPoint,
  LoanPortfolioByProductRow,
  formatNaira,
} from '../../services/dashboardStatsService';
import { portfolioPerformanceService } from '../../services/portfolioPerformanceService';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';

// Background refresh so cron-driven loan status changes (arrears/risk/
// disbursements) surface without a manual refresh.
const AUTO_REFRESH_MS = 3 * 60_000;

// ── Helpers ──────────────────────────────────────────────────────────────

function fmt(v: string | number | null | undefined): string {
  const n = parseFloat(String(v ?? '0'));
  return isNaN(n) ? '0.00' : n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtInt(v: number | null | undefined): string {
  return (v ?? 0).toLocaleString('en-NG');
}

interface KpiCardProps {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  color: string;
  linkTo?: string;
  linkLabel?: string;
  alert?: boolean;
}

function KpiCard({ label, value, sub, icon, color, linkTo, linkLabel, alert }: KpiCardProps) {
  return (
    <div className={`rounded-xl bg-white p-5 shadow-sm border-l-4 ${alert ? 'border-red-400' : color}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
          <p className={`mt-1 text-2xl font-bold ${alert ? 'text-red-600' : 'text-gray-900'}`}>{value}</p>
          {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
        </div>
        <div className={`rounded-lg p-2 ${alert ? 'bg-red-50 text-red-500' : 'bg-gray-50 text-gray-500'}`}>
          {icon}
        </div>
      </div>
      {linkTo && (
        <Link to={linkTo} className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700">
          {linkLabel ?? 'View details'} <ArrowRight size={12} />
        </Link>
      )}
    </div>
  );
}

function SectionCard({ title, icon, children, right }: { title: string; icon: React.ReactNode; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white shadow-sm mb-6">
      <div className="flex items-center justify-between border-b px-5 py-4">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{title}</h2>
        </div>
        {right}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────

export default function DirectorPortfolioPage() {
  const [stats, setStats] = useState<MicrofinanceDashboardStats | null>(null);
  const [par, setPar] = useState<PARSummary | null>(null);
  const [cbn, setCbn] = useState<CBNReturns | null>(null);
  const [defaulters, setDefaulters] = useState<any[]>([]);
  const [staffPerf, setStaffPerf] = useState<StaffPerformanceRow[]>([]);
  // Current-month collection_rate (paid/due for THIS period) keyed by staff_id,
  // from OfficerScorecardTrendView — replaces StaffPerformanceRow.collection_rate
  // (a lifetime paid/(paid+outstanding) ratio that mostly reflects loan age, not
  // repayment behaviour) so this table doesn't show a different, misleading
  // "collection rate" than the dedicated Staff Performance report.
  const [periodCollectionRates, setPeriodCollectionRates] = useState<Record<number, string>>({});
  const [cashInflow, setCashInflow] = useState<CashInflowPoint[]>([]);
  const [byProduct, setByProduct] = useState<LoanPortfolioByProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(background = false) {
    if (!background) setLoading(true);
    setError(null);
    try {
      const [statsData, parData, cbnData, defaultersRes, staffData, cashData, productData, trendData] = await Promise.all([
        dashboardStatsService.getStats(),
        loanService.getPARSummary(),
        loanService.getCBNReturns(),
        loanService.getDefaulters(),
        dashboardStatsService.getStaffPerformance(),
        dashboardStatsService.getCashInflowTrend(),
        dashboardStatsService.getLoanPortfolioByProduct(),
        portfolioPerformanceService.getOfficerTrend({}, 1),
      ]);
      setStats(statsData);
      setPar(parData);
      setCbn(cbnData);
      setDefaulters((defaultersRes as any)?.results?.slice(0, 8) ?? []);
      setStaffPerf(staffData);
      setCashInflow(cashData);
      setByProduct(productData);
      setPeriodCollectionRates(
        Object.fromEntries(trendData.data.map((r) => [r.staff_id, r.collection_rate]))
      );
    } catch (e: unknown) {
      const err = e as { detail?: string; message?: string };
      setError(err?.detail ?? err?.message ?? 'Failed to load portfolio overview.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  useAutoRefresh(() => load(true), AUTO_REFRESH_MS);

  const today = new Date().toLocaleDateString('en-NG', { day: '2-digit', month: 'long', year: 'numeric' });
  const cashInflowChartData = cashInflow.map((p) => ({
    date: p.date.slice(5),
    Expected: parseFloat(p.expected),
    Actual: parseFloat(p.actual),
  }));
  const byProductChartData = byProduct.map((p) => ({
    name: p.product_name,
    Outstanding: parseFloat(p.outstanding),
    Disbursed: parseFloat(p.disbursed),
  }));

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Portfolio &amp; Performance Overview</h1>
          <p className="mt-1 text-sm text-gray-500">As at {today} — organization-wide view</p>
        </div>
        <button
          type="button"
          onClick={() => load()}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {loading && !stats ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 size={28} className="animate-spin text-blue-600" />
        </div>
      ) : stats ? (
        <>
          {/* ── Cash Inflow Forecast (client-requested, at the top) ── */}
          <CashInflowForecastCard variant="full" />

          {/* ── KPI Cards ── */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
            <KpiCard
              label="Loan Portfolio (Outstanding)"
              value={formatNaira(stats.total_loan_book)}
              sub={`${fmtInt(stats.active_loans)} active loans`}
              icon={<CreditCard size={20} />}
              color="border-indigo-400"
              linkTo="/loans/accounts"
              linkLabel="View loans"
            />
            <KpiCard
              label="Collections This Month"
              value={formatNaira(stats.collections_this_month ?? '0')}
              sub={`Disbursed: ${formatNaira(stats.total_disbursed_this_month)}`}
              icon={<DollarSign size={20} />}
              color="border-green-400"
              linkTo="/reports/daily-transactions"
              linkLabel="Collections report"
            />
            <KpiCard
              label="Portfolio at Risk (PAR30)"
              value={`${(stats.par30_ratio ?? 0).toFixed(2)}%`}
              sub={formatNaira(stats.par30_amount ?? '0')}
              icon={<TrendingDown size={20} />}
              color="border-orange-400"
              alert={(stats.par30_ratio ?? 0) > 5}
              linkTo="/reports/loans/par"
              linkLabel="PAR report"
            />
            <KpiCard
              label="Repayment Rate"
              value={`${stats.loan_repayment_rate.toFixed(1)}%`}
              icon={<TrendingUp size={20} />}
              color={stats.loan_repayment_rate >= 90 ? 'border-green-400' : 'border-orange-400'}
            />
          </div>

          {/* ── Pending items ── */}
          <div className="grid gap-4 sm:grid-cols-3 mb-6">
            <KpiCard
              label="Pending Approvals"
              value={fmtInt(stats.pending_approvals)}
              icon={<ShieldAlert size={18} />}
              color="border-yellow-400"
              alert={stats.pending_approvals > 0}
              linkTo="/approvals"
              linkLabel="Review"
            />
            <KpiCard
              label="Pending Tickets"
              value={fmtInt(stats.pending_tickets)}
              icon={<AlertTriangle size={18} />}
              color="border-purple-400"
              linkTo="/tickets"
              linkLabel="View tickets"
            />
            <KpiCard
              label="Pending Prospects"
              value={fmtInt(stats.pending_prospects ?? 0)}
              icon={<Users size={18} />}
              color="border-teal-400"
              linkTo="/clients?client_type=pr"
              linkLabel="View prospects"
            />
          </div>

          {/* ── CBN Compliance ── */}
          {cbn && (
            <SectionCard
              title="CBN Provisioning Compliance"
              icon={<ShieldAlert size={16} className="text-red-500" />}
              right={
                <div className="flex gap-4 text-xs">
                  <span className="text-gray-500">GLP: <strong className="text-gray-900">{formatNaira(cbn.gross_loan_portfolio)}</strong></span>
                  <span className="text-red-600 font-semibold">Required Provision: {formatNaira(cbn.total_required_provision)}</span>
                </div>
              }
            >
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      <th className="px-3 py-2">Classification</th>
                      <th className="px-3 py-2 text-right">Provision Rate</th>
                      <th className="px-3 py-2 text-right">Loans</th>
                      <th className="px-3 py-2 text-right">Outstanding Principal</th>
                      <th className="px-3 py-2 text-right">Required Provision</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {cbn.classification_breakdown.map((row) => (
                      <tr key={row.classification} className={row.loan_count > 0 && row.classification !== 'performing' ? 'bg-red-50' : ''}>
                        <td className="px-3 py-2 font-medium capitalize text-gray-800">{row.classification}</td>
                        <td className="px-3 py-2 text-right text-gray-600">{row.provision_rate_pct}%</td>
                        <td className="px-3 py-2 text-right text-gray-600">{fmtInt(row.loan_count)}</td>
                        <td className="px-3 py-2 text-right font-medium text-gray-900">{formatNaira(row.outstanding_principal)}</td>
                        <td className="px-3 py-2 text-right font-semibold text-red-600">{formatNaira(row.required_provision)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}

          {/* ── PAR Ageing Buckets ── */}
          {par && (
            <SectionCard
              title="Portfolio at Risk — Ageing Buckets"
              icon={<BarChart3 size={16} className="text-indigo-500" />}
              right={
                <div className="flex gap-4 text-xs">
                  <span className="text-orange-600 font-semibold">PAR30: {parseFloat(par.par_ratios.par30).toFixed(2)}%</span>
                  <span className="text-red-600 font-semibold">NPL: {parseFloat(par.par_ratios.npl_ratio).toFixed(2)}%</span>
                </div>
              }
            >
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      <th className="px-3 py-2">Bucket</th>
                      <th className="px-3 py-2 text-right">Loan Count</th>
                      <th className="px-3 py-2 text-right">Outstanding Balance</th>
                      <th className="px-3 py-2 text-right">PAR %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {par.buckets.map((b) => {
                      const pct = parseFloat(b.par_pct);
                      const isRisk = b.key !== 'current';
                      return (
                        <tr key={b.key} className={isRisk && b.loan_count > 0 ? 'bg-red-50' : ''}>
                          <td className={`px-3 py-2 font-medium ${isRisk && b.loan_count > 0 ? 'text-red-700' : 'text-gray-800'}`}>{b.label}</td>
                          <td className="px-3 py-2 text-right text-gray-600">{fmtInt(b.loan_count)}</td>
                          <td className="px-3 py-2 text-right font-medium text-gray-900">{formatNaira(b.outstanding_balance)}</td>
                          <td className={`px-3 py-2 text-right font-semibold ${pct > 0 ? 'text-red-600' : 'text-green-600'}`}>{pct.toFixed(2)}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}

          {/* ── Cash Inflow Trend ── */}
          <SectionCard title="Cash Inflow — Expected vs. Actual (This Month)" icon={<Wallet size={16} className="text-green-500" />}>
            {cashInflowChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={cashInflowChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => formatNaira(v)} />
                  <Legend />
                  <Line type="monotone" dataKey="Expected" stroke="#9ca3af" strokeDasharray="4 2" dot={false} />
                  <Line type="monotone" dataKey="Actual" stroke="#16a34a" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-gray-400">No repayment schedule activity in this period.</p>
            )}
          </SectionCard>

          {/* ── Loan Performance by Product ── */}
          <SectionCard title="Loan Portfolio by Product" icon={<BarChart3 size={16} className="text-blue-500" />}>
            {byProductChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={byProductChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => formatNaira(v)} />
                  <Legend />
                  <Bar dataKey="Outstanding" fill="#4f46e5" />
                  <Bar dataKey="Disbursed" fill="#93c5fd" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-gray-400">No active loans to break down by product.</p>
            )}
          </SectionCard>

          {/* ── Staff Performance ── */}
          <SectionCard
            title="Loan Officer Performance"
            icon={<UserCog size={16} className="text-teal-600" />}
            right={
              <Link to="/reports/staff-performance" className="text-xs font-medium text-blue-600 hover:underline">
                Full trend &amp; drill-down →
              </Link>
            }
          >
            {staffPerf.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      <th className="px-3 py-2">Officer</th>
                      <th className="px-3 py-2 text-right">Portfolio Size</th>
                      <th className="px-3 py-2 text-right">Loans</th>
                      <th className="px-3 py-2 text-right">Collection Rate (This Month)</th>
                      <th className="px-3 py-2 text-right">Disbursed This Month</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {staffPerf.map((row) => {
                      const periodRate = periodCollectionRates[row.staff_id];
                      return (
                      <tr key={row.staff_id}>
                        <td className="px-3 py-2 font-medium text-gray-800">
                          {row.name}
                          {row.position && <span className="ml-1 text-xs text-gray-400">({row.position})</span>}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-gray-900">{formatNaira(row.portfolio_size)}</td>
                        <td className="px-3 py-2 text-right text-gray-600">{fmtInt(row.loan_count)}</td>
                        <td className={`px-3 py-2 text-right font-semibold ${periodRate === undefined ? 'text-gray-400' : parseFloat(periodRate) >= 90 ? 'text-green-600' : 'text-orange-600'}`}>
                          {periodRate === undefined ? '—' : `${fmt(periodRate)}%`}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-600">{formatNaira(row.disbursed_this_month)}</td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-gray-400">No officers with an active portfolio yet.</p>
            )}
          </SectionCard>

          {/* ── Current Defaulters (preview) ── */}
          <SectionCard
            title="Current Defaulters (Top 8 by Days Overdue)"
            icon={<AlertTriangle size={16} className="text-red-500" />}
            right={
              <Link to="/reports/loans/defaulters" className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700">
                Full report <ArrowRight size={12} />
              </Link>
            }
          >
            {defaulters.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      <th className="px-3 py-2">Loan #</th>
                      <th className="px-3 py-2">Client</th>
                      <th className="px-3 py-2">Officer</th>
                      <th className="px-3 py-2 text-right">Days Overdue</th>
                      <th className="px-3 py-2 text-right">Arrears</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {defaulters.map((loan: any) => (
                      <tr key={loan.id} className="bg-red-50/50">
                        <td className="px-3 py-2 font-medium text-gray-800">{loan.loan_number}</td>
                        <td className="px-3 py-2 text-gray-700">{loan.client_name}</td>
                        <td className="px-3 py-2 text-gray-500">{loan.assigned_officer_name ?? '—'}</td>
                        <td className="px-3 py-2 text-right font-semibold text-red-600">{loan.days_in_arrears}</td>
                        <td className="px-3 py-2 text-right font-medium text-gray-900">{formatNaira(loan.arrears_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-gray-400">No loans currently in arrears.</p>
            )}
          </SectionCard>
        </>
      ) : null}
    </div>
  );
}
