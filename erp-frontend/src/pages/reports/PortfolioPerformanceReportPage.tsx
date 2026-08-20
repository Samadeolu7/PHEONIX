/**
 * Portfolio & Performance Report (Track 2)
 *
 * Standalone drillable report under Reports, going further than the old
 * system (dash.html) or the Track 1 dashboard widgets: real date-range
 * filtering, a branch x product x officer x CBN-risk-band breakdown,
 * interest income split by recognition mode (legacy/at-disbursement/
 * deferred), a CBN provisioning compliance snapshot, and an officer
 * scorecard trend over time. CSV export only — see
 * portfolioPerformanceService.ts for why (PDF/Excel are unimplemented
 * stubs elsewhere in the app; this ships a real, working CSV instead).
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  BarChart3,
  Download,
  Loader2,
  PiggyBank,
  ShieldAlert,
  TrendingUp,
  UserCog,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { formatNaira } from '../../services/dashboardStatsService';
import PortfolioPerformanceFilters from '../../components/reports/PortfolioPerformanceFilters';
import {
  portfolioPerformanceService,
  ReportFilters,
  GroupByDimension,
  PortfolioBreakdownRow,
  InterestIncomeByModeResponse,
  ProvisioningComplianceResponse,
} from '../../services/portfolioPerformanceService';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';

// Background refresh so cron-driven loan status/provisioning changes surface
// without a manual refresh.
const AUTO_REFRESH_MS = 3 * 60_000;

// ── Helpers ──────────────────────────────────────────────────────────────

function fmt(v: string | number | null | undefined): string {
  const n = parseFloat(String(v ?? '0'));
  return isNaN(n) ? '0.00' : n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtInt(v: number | null | undefined): string {
  return (v ?? 0).toLocaleString('en-NG');
}

function rowLabel(row: PortfolioBreakdownRow, groupBy: GroupByDimension[]): string {
  return groupBy
    .map((g) => {
      if (g === 'branch') return row.branch_name ?? 'Unassigned';
      if (g === 'product') return row.product_name ?? 'Unassigned';
      if (g === 'officer') return row.officer_name ?? 'Unassigned';
      return row.risk_classification ?? 'performing';
    })
    .join(' / ');
}

function KpiCard({ label, value, sub, icon, color }: { label: string; value: string; sub?: string; icon: React.ReactNode; color: string }) {
  return (
    <div className={`rounded-xl bg-white p-5 shadow-sm border-l-4 ${color}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
        </div>
        <div className="rounded-lg bg-gray-50 p-2 text-gray-500">{icon}</div>
      </div>
    </div>
  );
}

function SectionCard({
  title, icon, children, right, onDownload,
}: { title: string; icon: React.ReactNode; children: React.ReactNode; right?: React.ReactNode; onDownload?: () => void }) {
  return (
    <div className="rounded-xl bg-white shadow-sm mb-6">
      <div className="flex items-center justify-between border-b px-5 py-4">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{title}</h2>
        </div>
        <div className="flex items-center gap-3">
          {right}
          {onDownload && (
            <button
              type="button"
              onClick={onDownload}
              className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              <Download size={13} /> CSV
            </button>
          )}
        </div>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

const ALL_DIMENSIONS: GroupByDimension[] = ['branch', 'product', 'officer', 'risk_band'];
const RISK_ORDER = ['performing', 'watch', 'substandard', 'doubtful', 'loss'];

export default function PortfolioPerformanceReportPage() {
  const [filters, setFilters] = useState<ReportFilters>({});
  const [groupBy, setGroupBy] = useState<GroupByDimension[]>(ALL_DIMENSIONS);

  const [breakdown, setBreakdown] = useState<PortfolioBreakdownRow[]>([]);
  const [interestIncome, setInterestIncome] = useState<InterestIncomeByModeResponse['data'] | null>(null);
  const [provisioning, setProvisioning] = useState<ProvisioningComplianceResponse['data'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(background = false) {
    if (!background) setLoading(true);
    setError(null);
    try {
      const [breakdownRes, interestRes, provisioningRes] = await Promise.all([
        portfolioPerformanceService.getBreakdown(filters, groupBy),
        portfolioPerformanceService.getInterestIncomeByMode(filters),
        portfolioPerformanceService.getProvisioningSnapshot({
          branch: filters.branch, product: filters.product, officer: filters.officer,
        }),
      ]);
      setBreakdown(breakdownRes.data);
      setInterestIncome(interestRes.data);
      setProvisioning(provisioningRes.data);
    } catch (e: unknown) {
      const err = e as { detail?: string; message?: string };
      setError(err?.detail ?? err?.message ?? 'Failed to load the portfolio & performance report.');
    } finally {
      setLoading(false);
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [filters, groupBy]);

  useAutoRefresh(() => load(true), AUTO_REFRESH_MS);

  const primaryDim = groupBy[0];
  const breakdownChartData = breakdown.map((row) => ({
    name: rowLabel(row, groupBy),
    'Outstanding Principal': parseFloat(row.outstanding_principal),
  }));

  const totalOutstanding = breakdown.reduce((sum, r) => sum + parseFloat(r.outstanding_principal), 0);
  const totalRecognized = interestIncome ? parseFloat(interestIncome.total_recognized_income) : 0;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Portfolio &amp; Performance Report</h1>
        <p className="mt-1 text-sm text-gray-500">
          Full drillable breakdown — branch, product, officer, CBN risk band, interest recognition mode, provisioning, and officer trends.
        </p>
      </div>

      <PortfolioPerformanceFilters
        filters={filters}
        onFiltersChange={setFilters}
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
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
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-6">
            <KpiCard
              label="Outstanding Principal (Filtered)"
              value={formatNaira(totalOutstanding)}
              sub={`${breakdown.reduce((s, r) => s + r.loan_count, 0)} loans`}
              icon={<TrendingUp size={20} />}
              color="border-indigo-400"
            />
            <KpiCard
              label="Total Recognized Interest Income"
              value={formatNaira(totalRecognized)}
              icon={<PiggyBank size={20} />}
              color="border-green-400"
            />
            <KpiCard
              label="Provisioning Shortfall / Surplus"
              value={formatNaira(provisioning?.shortfall_or_surplus ?? '0')}
              sub={(parseFloat(provisioning?.shortfall_or_surplus ?? '0') > 0) ? 'Under-provisioned' : 'Adequately provisioned'}
              icon={<ShieldAlert size={20} />}
              color={(parseFloat(provisioning?.shortfall_or_surplus ?? '0') > 0) ? 'border-red-400' : 'border-green-400'}
            />
          </div>

          {/* ── Portfolio Breakdown ── */}
          <SectionCard
            title="Portfolio Breakdown"
            icon={<BarChart3 size={16} className="text-indigo-500" />}
            onDownload={() => portfolioPerformanceService.downloadCsv('breakdown', filters, { group_by: groupBy.join(',') })}
          >
            {breakdown.length > 0 ? (
              <>
                {primaryDim && (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={breakdownChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={60} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: number) => formatNaira(v)} />
                      <Bar dataKey="Outstanding Principal" fill="#4f46e5" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        <th className="px-3 py-2">Segment</th>
                        <th className="px-3 py-2 text-right">Loans</th>
                        <th className="px-3 py-2 text-right">Outstanding Principal</th>
                        <th className="px-3 py-2 text-right">Disbursed</th>
                        <th className="px-3 py-2 text-right">Total Paid</th>
                        <th className="px-3 py-2 text-right">Provision</th>
                        <th className="px-3 py-2 text-right">Collection Rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {breakdown.map((row, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2 font-medium text-gray-800">{rowLabel(row, groupBy)}</td>
                          <td className="px-3 py-2 text-right text-gray-600">{fmtInt(row.loan_count)}</td>
                          <td className="px-3 py-2 text-right font-medium text-gray-900">{formatNaira(row.outstanding_principal)}</td>
                          <td className="px-3 py-2 text-right text-gray-600">{formatNaira(row.disbursed_amount)}</td>
                          <td className="px-3 py-2 text-right text-gray-600">{formatNaira(row.total_paid)}</td>
                          <td className="px-3 py-2 text-right text-gray-600">{formatNaira(row.provision_amount)}</td>
                          <td className={`px-3 py-2 text-right font-semibold ${parseFloat(row.collection_rate) >= 90 ? 'text-green-600' : 'text-orange-600'}`}>
                            {fmt(row.collection_rate)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-400">No loans match the current filters.</p>
            )}
          </SectionCard>

          {/* ── Interest Income by Recognition Mode ── */}
          <SectionCard
            title="Interest Income by Recognition Mode"
            icon={<PiggyBank size={16} className="text-green-500" />}
            onDownload={() => portfolioPerformanceService.downloadCsv('interest-income', filters)}
          >
            {interestIncome && (
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-lg border border-gray-200 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">At Disbursement</p>
                  <p className="mt-1 text-xl font-bold text-gray-900">{formatNaira(interestIncome.at_disbursement.recognized_income)}</p>
                  <p className="text-xs text-gray-500">{interestIncome.at_disbursement.loan_count} loans</p>
                </div>
                <div className="rounded-lg border border-gray-200 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Deferred / Unearned</p>
                  <p className="mt-1 text-xl font-bold text-gray-900">{formatNaira(interestIncome.deferred.recognized_income)}</p>
                  <p className="text-xs text-gray-500">{interestIncome.deferred.loan_count} loans</p>
                </div>
                <div className="rounded-lg border border-gray-200 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Legacy (Cash-Basis)</p>
                  <p className="mt-1 text-xl font-bold text-gray-900">{formatNaira(interestIncome.legacy_cash_basis.recognized_income)}</p>
                  <p className="text-xs text-gray-500">{interestIncome.legacy_cash_basis.loan_count} loans</p>
                </div>
              </div>
            )}
          </SectionCard>

          {/* ── CBN Provisioning Compliance ── */}
          <SectionCard
            title="CBN Provisioning Compliance (Current Snapshot)"
            icon={<ShieldAlert size={16} className="text-red-500" />}
            onDownload={() => portfolioPerformanceService.downloadCsv('provisioning', {
              branch: filters.branch, product: filters.product, officer: filters.officer,
            })}
            right={
              <div className="flex gap-4 text-xs">
                <span className="text-gray-500">Required: <strong className="text-gray-900">{formatNaira(provisioning?.total_required_provision ?? '0')}</strong></span>
                <span className="text-gray-500">Booked: <strong className="text-gray-900">{formatNaira(provisioning?.total_booked_provision ?? '0')}</strong></span>
              </div>
            }
          >
            {provisioning && (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        <th className="px-3 py-2">Classification</th>
                        <th className="px-3 py-2 text-right">Rate</th>
                        <th className="px-3 py-2 text-right">Loans</th>
                        <th className="px-3 py-2 text-right">Outstanding</th>
                        <th className="px-3 py-2 text-right">Required Provision</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {[...provisioning.by_risk_band]
                        .sort((a, b) => RISK_ORDER.indexOf(a.risk_classification) - RISK_ORDER.indexOf(b.risk_classification))
                        .map((band) => (
                          <tr key={band.risk_classification} className={band.loan_count > 0 && band.risk_classification !== 'performing' ? 'bg-red-50' : ''}>
                            <td className="px-3 py-2 font-medium capitalize text-gray-800">{band.risk_classification}</td>
                            <td className="px-3 py-2 text-right text-gray-600">{band.provision_rate_pct}%</td>
                            <td className="px-3 py-2 text-right text-gray-600">{fmtInt(band.loan_count)}</td>
                            <td className="px-3 py-2 text-right font-medium text-gray-900">{formatNaira(band.outstanding_principal)}</td>
                            <td className="px-3 py-2 text-right font-semibold text-red-600">{formatNaira(band.required_provision)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-xs text-gray-400">
                  Booked provision reflects the balance of each product's allowance account as of the last time
                  <code className="mx-1 rounded bg-gray-100 px-1">post_loan_provisions</code>
                  was run — this command is not on a schedule, so the figure may lag the required provision shown above.
                </p>
              </>
            )}
          </SectionCard>

          {/* ── Staff Performance (promoted to its own report) ── */}
          <SectionCard
            title="Staff Performance"
            icon={<UserCog size={16} className="text-teal-600" />}
          >
            <p className="text-sm text-gray-500 mb-3">
              Per-officer expected-vs-actual collections trend now lives in its own report,
              with per-officer drill-down and links to disbursements and client assignment.
            </p>
            <Link
              to="/reports/staff-performance"
              className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white"
              style={{ backgroundColor: '#0a1857' }}
            >
              View Staff Performance Report →
            </Link>
          </SectionCard>
        </>
      )}
    </div>
  );
}
