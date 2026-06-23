/**
 * Portfolio at Risk (PAR) Report Page
 * Computes PAR1, PAR30, PAR90 from live loan data.
 * Route: /reports/loans/par
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Download,
  Loader2,
  Printer,
  RefreshCw,
  TrendingDown,
} from 'lucide-react';
import { loanService, LoanAccountList } from '../../../services/loanService';
import { BRAND } from '../../../constants/brand';

// ── helpers ────────────────────────────────────────────────────────────────────

function fmt(amount: number): string {
  return amount.toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtInt(n: number): string {
  return n.toLocaleString('en-NG');
}

function fmtPct(n: number): string {
  return n.toFixed(2) + '%';
}

const todayStr = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const todayLabel = () =>
  new Date().toLocaleDateString('en-NG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

// ── PAR computation ─────────────────────────────────────────────────────────────

interface PARBand {
  label: string;
  threshold: number;
  loans: LoanAccountList[];
  outstanding: number;
  pctOfPortfolio: number;
}

function computePAR(allLoans: LoanAccountList[]): {
  totalPortfolio: number;
  par1: PARBand;
  par30: PARBand;
  par90: PARBand;
  bands: PARBand[];
} {
  const totalPortfolio = allLoans.reduce(
    (s, l) => s + parseFloat(l.outstanding_principal || '0'),
    0
  );

  const buildBand = (label: string, threshold: number): PARBand => {
    const atRisk = allLoans.filter((l) => l.days_in_arrears >= threshold);
    const outstanding = atRisk.reduce(
      (s, l) => s + parseFloat(l.outstanding_principal || '0'),
      0
    );
    const pctOfPortfolio = totalPortfolio > 0 ? (outstanding / totalPortfolio) * 100 : 0;
    return { label, threshold, loans: atRisk, outstanding, pctOfPortfolio };
  };

  const par1  = buildBand('PAR 1',  1);
  const par30 = buildBand('PAR 30', 30);
  const par90 = buildBand('PAR 90', 90);

  const bands: PARBand[] = [
    buildBand('1–30 Days', 1),
    buildBand('31–60 Days', 31),
    buildBand('61–90 Days', 61),
    buildBand('91–180 Days', 91),
    buildBand('>180 Days', 181),
  ];

  // For the discrete bands (1-30, 31-60…) filter to the range instead of cumulative
  const discrete: PARBand[] = [
    { ...bands[0], loans: allLoans.filter((l) => l.days_in_arrears >= 1 && l.days_in_arrears <= 30), outstanding: 0, pctOfPortfolio: 0 },
    { ...bands[1], loans: allLoans.filter((l) => l.days_in_arrears >= 31 && l.days_in_arrears <= 60), outstanding: 0, pctOfPortfolio: 0 },
    { ...bands[2], loans: allLoans.filter((l) => l.days_in_arrears >= 61 && l.days_in_arrears <= 90), outstanding: 0, pctOfPortfolio: 0 },
    { ...bands[3], loans: allLoans.filter((l) => l.days_in_arrears >= 91 && l.days_in_arrears <= 180), outstanding: 0, pctOfPortfolio: 0 },
    { ...bands[4], loans: allLoans.filter((l) => l.days_in_arrears > 180), outstanding: 0, pctOfPortfolio: 0 },
  ].map((b) => {
    const outstanding = b.loans.reduce(
      (s, l) => s + parseFloat(l.outstanding_principal || '0'),
      0
    );
    const pctOfPortfolio = totalPortfolio > 0 ? (outstanding / totalPortfolio) * 100 : 0;
    return { ...b, outstanding, pctOfPortfolio };
  });

  return { totalPortfolio, par1, par30, par90, bands: discrete };
}

// ── CSV export ─────────────────────────────────────────────────────────────────

function exportCSV(bands: PARBand[], totalPortfolio: number, asOf: string) {
  const headers = ['PAR Band', '# Loans', 'Outstanding Balance (₦)', '% of Portfolio'];
  const rows = bands.map((b) => [
    b.label,
    b.loans.length,
    b.outstanding.toFixed(2),
    b.pctOfPortfolio.toFixed(2) + '%',
  ]);

  const csv = [
    [`PAR Report - As Of: ${asOf}`, '', '', ''],
    [`Total Portfolio: ₦${totalPortfolio.toFixed(2)}`, '', '', ''],
    [],
    headers,
    ...rows,
  ]
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `par-report-${asOf}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── PAR card ──────────────────────────────────────────────────────────────────

interface PARCardProps {
  label: string;
  pct: number;
  count: number;
  outstanding: number;
  colorClass: string;
}

const PARCard: React.FC<PARCardProps> = ({ label, pct, count, outstanding, colorClass }) => (
  <div className="rounded-xl bg-white p-5 shadow-sm">
    <div className="flex items-start justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">{label}</p>
        <p className={`mt-1 text-3xl font-bold tabular-nums ${colorClass}`}>{fmtPct(pct)}</p>
      </div>
      <TrendingDown size={20} className={`mt-1 ${colorClass} opacity-60`} />
    </div>
    <p className="mt-2 text-xs text-gray-500">
      {fmtInt(count)} loans · ₦{fmt(outstanding)}
    </p>
  </div>
);

// ── Page ───────────────────────────────────────────────────────────────────────

export default function PARReportPage() {
  const [allLoans, setAllLoans] = useState<LoanAccountList[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asOf, setAsOf] = useState(todayStr());

  const loadLoans = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch active and disbursed loans — the full portfolio
      const [activeRes, disbursedRes, defaultedRes] = await Promise.all([
        loanService.listLoans({ status: 'active', page: 1 }),
        loanService.listLoans({ status: 'disbursed', page: 1 }),
        loanService.listLoans({ status: 'defaulted', page: 1 }),
      ]);

      const toArr = (r: unknown): LoanAccountList[] => {
        if (Array.isArray(r)) return r as LoanAccountList[];
        const rr = r as { results?: LoanAccountList[] };
        return rr?.results ?? [];
      };

      const merged = [...toArr(activeRes), ...toArr(disbursedRes), ...toArr(defaultedRes)];
      const seen = new Set<number>();
      const unique = merged.filter((l) => {
        if (seen.has(l.id)) return false;
        seen.add(l.id);
        return true;
      });
      setAllLoans(unique);
    } catch (e: unknown) {
      const err = e as { detail?: string; message?: string };
      setError(err?.detail ?? err?.message ?? 'Failed to load PAR data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLoans();
  }, [loadLoans]);

  const { totalPortfolio, par1, par30, par90, bands } = computePAR(allLoans);
  const atRiskAmount = par1.outstanding; // widest definition

  const par1Color  = par1.pctOfPortfolio  > 10 ? 'text-red-600'    : par1.pctOfPortfolio  > 5  ? 'text-orange-500' : 'text-green-600';
  const par30Color = par30.pctOfPortfolio > 5  ? 'text-red-600'    : par30.pctOfPortfolio > 2  ? 'text-orange-500' : 'text-green-600';
  const par90Color = par90.pctOfPortfolio > 2  ? 'text-red-700'    : par90.pctOfPortfolio > 1  ? 'text-red-500'    : 'text-green-600';

  return (
    <div className="min-h-screen bg-gray-50 p-6 print:bg-white print:p-0">
      {/* Header */}
      <div
        className="mb-6 rounded-xl p-5 text-white print:rounded-none"
        style={{ background: BRAND.colors.navyPrimary }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Portfolio at Risk (PAR) Report</h1>
            <p className="mt-0.5 text-sm opacity-75">
              {BRAND.companyName} — Risk concentration analysis
            </p>
          </div>
          <div className="flex items-center gap-3 print:hidden">
            <div className="flex items-center gap-2">
              <label className="text-xs opacity-75">As of date</label>
              <input
                type="date"
                value={asOf}
                onChange={(e) => setAsOf(e.target.value)}
                className="rounded-lg border-0 bg-white/10 px-3 py-1.5 text-sm text-white focus:bg-white/20 focus:outline-none"
              />
            </div>
            <button
              onClick={() => exportCSV(bands, totalPortfolio, asOf)}
              disabled={loading || allLoans.length === 0}
              className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-sm font-medium hover:bg-white/20 disabled:opacity-50"
            >
              <Download size={14} /> Export CSV
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-sm font-medium hover:bg-white/20"
            >
              <Printer size={14} /> Print
            </button>
            <button
              onClick={loadLoans}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-sm font-medium hover:bg-white/20 disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 size={28} className="animate-spin text-blue-600" />
        </div>
      ) : (
        <>
          {/* PAR Summary Cards */}
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <PARCard
              label="PAR 1 Day"
              pct={par1.pctOfPortfolio}
              count={par1.loans.length}
              outstanding={par1.outstanding}
              colorClass={par1Color}
            />
            <PARCard
              label="PAR 30 Days"
              pct={par30.pctOfPortfolio}
              count={par30.loans.length}
              outstanding={par30.outstanding}
              colorClass={par30Color}
            />
            <PARCard
              label="PAR 90 Days"
              pct={par90.pctOfPortfolio}
              count={par90.loans.length}
              outstanding={par90.outstanding}
              colorClass={par90Color}
            />
            <div className="rounded-xl bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
                Total Portfolio
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">
                ₦{fmt(totalPortfolio)}
              </p>
              <p className="mt-2 text-xs text-gray-500">{fmtInt(allLoans.length)} total accounts</p>
            </div>
            <div className="rounded-xl bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
                At-Risk Amount
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-red-600">
                ₦{fmt(atRiskAmount)}
              </p>
              <p className="mt-2 text-xs text-gray-500">All loans with ≥1 day arrears</p>
            </div>
          </div>

          {/* PAR Breakdown Table */}
          <div className="mb-6 overflow-hidden rounded-xl bg-white shadow-sm">
            <div
              className="px-5 py-4 text-sm font-semibold text-white"
              style={{ background: BRAND.colors.navyPrimary }}
            >
              PAR Breakdown by Arrears Band
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <th className="px-5 py-3">Arrears Band</th>
                    <th className="px-5 py-3 text-right"># Loans</th>
                    <th className="px-5 py-3 text-right">Outstanding Balance (₦)</th>
                    <th className="px-5 py-3 text-right">% of Portfolio</th>
                    <th className="px-5 py-3">Risk Bar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {bands.map((band) => {
                    const barWidth = Math.min(100, band.pctOfPortfolio * 5); // scale for visibility
                    const barColor =
                      band.threshold >= 181
                        ? 'bg-red-700'
                        : band.threshold >= 91
                        ? 'bg-red-500'
                        : band.threshold >= 61
                        ? 'bg-orange-500'
                        : band.threshold >= 31
                        ? 'bg-orange-400'
                        : 'bg-yellow-400';
                    return (
                      <tr key={band.label} className="hover:bg-gray-50">
                        <td className="px-5 py-3 font-medium text-gray-800">{band.label}</td>
                        <td className="px-5 py-3 text-right tabular-nums text-gray-700">
                          {fmtInt(band.loans.length)}
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums font-semibold text-gray-900">
                          {fmt(band.outstanding)}
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums">
                          <span
                            className={`font-bold ${
                              band.pctOfPortfolio > 5
                                ? 'text-red-600'
                                : band.pctOfPortfolio > 2
                                ? 'text-orange-500'
                                : 'text-gray-700'
                            }`}
                          >
                            {fmtPct(band.pctOfPortfolio)}
                          </span>
                        </td>
                        <td className="px-5 py-3 w-40">
                          <div className="h-2 rounded-full bg-gray-100">
                            <div
                              className={`h-2 rounded-full ${barColor} transition-all`}
                              style={{ width: `${barWidth}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr
                    className="border-t-2 text-sm font-semibold text-white"
                    style={{ background: BRAND.colors.navyLight }}
                  >
                    <td className="px-5 py-3">Total at Risk (PAR 1)</td>
                    <td className="px-5 py-3 text-right">{fmtInt(par1.loans.length)}</td>
                    <td className="px-5 py-3 text-right">{fmt(par1.outstanding)}</td>
                    <td className="px-5 py-3 text-right">{fmtPct(par1.pctOfPortfolio)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Trend note / interpretation */}
          <div
            className="rounded-xl border-l-4 p-5 text-sm"
            style={{ borderColor: BRAND.colors.gold, background: BRAND.colors.goldLight }}
          >
            <p className="font-semibold" style={{ color: BRAND.colors.navyPrimary }}>
              PAR Interpretation Guide
            </p>
            <ul className="mt-2 space-y-1 text-gray-700">
              <li>
                <strong>PAR 1:</strong> Any loan with ≥1 day in arrears. Widest risk measure.
              </li>
              <li>
                <strong>PAR 30:</strong> Loans ≥30 days overdue. Internationally recognised
                standard for microfinance. Target: &lt;5%.
              </li>
              <li>
                <strong>PAR 90:</strong> Loans ≥90 days overdue. High probability of loss.
                Target: &lt;2%.
              </li>
            </ul>
            <p className="mt-3 text-xs text-gray-500">
              Data as of {asOf}. Generated by {BRAND.systemLabel} on {todayLabel()}.
            </p>
          </div>
        </>
      )}

      {/* Print footer */}
      <div className="mt-6 hidden text-center text-xs text-gray-400 print:block">
        PAR Report — As of {asOf} — Generated by {BRAND.systemLabel} on {todayLabel()}.
        Confidential — for internal use only.
      </div>
    </div>
  );
}
