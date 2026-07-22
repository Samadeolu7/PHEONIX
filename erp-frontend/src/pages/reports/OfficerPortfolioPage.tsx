/**
 * Officer Portfolio Dashboard
 * Role-specific KPI summary for Credit Officers and other officers below Director.
 * Scoped server-side to the logged-in officer's assigned clients.
 */

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle,
  CreditCard,
  DollarSign,
  Loader2,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { api } from '../../services/api';
import { loanService } from '../../services/loanService';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';

// Background refresh so cron-driven loan status changes (arrears/risk/
// disbursements) surface without a manual refresh.
const AUTO_REFRESH_MS = 3 * 60_000;

// ── Types ──────────────────────────────────────────────────────────────────

interface DashboardStats {
  total_clients: number;
  active_clients: number;
  new_clients_this_month: number;
  active_loans: number;
  total_loan_book: string;
  total_disbursed_this_month: string;
  overdue_loans: number;
  defaulting_loans: number;
  loan_repayment_rate: number;
  par30_ratio: number;
  par30_amount: string;
  collections_this_month: string;
  total_savings: string;
  pending_approvals: number;
  cashier_balance: string | null;
  cashier_account_id: number | null;
  cashier_account_name: string | null;
}

interface PARBucket {
  key: string;
  label: string;
  loan_count: number;
  outstanding_balance: string;
  par_pct: string;
}

interface PARSummaryData {
  glp: string;
  buckets: PARBucket[];
  par_ratios: { par30: string; par90: string; npl_ratio: string };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(v: string | number | null | undefined): string {
  const n = parseFloat(String(v ?? '0'));
  return isNaN(n)
    ? '0.00'
    : n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtInt(v: number): string {
  return v.toLocaleString('en-NG');
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
    <div
      className={`rounded-xl bg-white p-5 shadow-sm border-l-4 ${alert ? 'border-red-400' : color}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
          <p className={`mt-1 text-2xl font-bold ${alert ? 'text-red-600' : 'text-gray-900'}`}>
            {value}
          </p>
          {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
        </div>
        <div
          className={`rounded-lg p-2 ${alert ? 'bg-red-50 text-red-500' : 'bg-gray-50 text-gray-500'}`}
        >
          {icon}
        </div>
      </div>
      {linkTo && (
        <Link
          to={linkTo}
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
        >
          {linkLabel ?? 'View details'} <ArrowRight size={12} />
        </Link>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function OfficerPortfolioPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [par, setPar] = useState<PARSummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(background = false) {
    if (!background) setLoading(true);
    setError(null);
    try {
      const [statsRes, parRes] = await Promise.all([
        api.get('/analytics/dashboard-stats/'),
        loanService.getPARSummary(),
      ]);
      // analytics endpoint wraps in { success, data: {...} }
      setStats((statsRes as { data: DashboardStats }).data ?? (statsRes as DashboardStats));
      setPar(parRes as unknown as PARSummaryData);
    } catch (e: unknown) {
      const err = e as { detail?: string; message?: string };
      setError(err?.detail ?? err?.message ?? 'Failed to load portfolio data.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useAutoRefresh(() => load(true), AUTO_REFRESH_MS);

  const today = new Date().toLocaleDateString('en-NG', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Portfolio</h1>
          <p className="mt-1 text-sm text-gray-500">
            As at {today} — scoped to your assigned clients
          </p>
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
          {/* ── KPI Cards ── */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
            <KpiCard
              label="Active Clients"
              value={fmtInt(stats.active_clients)}
              sub={`${fmtInt(stats.new_clients_this_month)} new this month`}
              icon={<Users size={20} />}
              color="border-blue-400"
              linkTo="/clients"
              linkLabel="View clients"
            />
            <KpiCard
              label="Loan Portfolio (Outstanding)"
              value={`₦${fmt(stats.total_loan_book)}`}
              sub={`${fmtInt(stats.active_loans)} active loans`}
              icon={<CreditCard size={20} />}
              color="border-indigo-400"
              linkTo="/loans/accounts"
              linkLabel="View loans"
            />
            <KpiCard
              label="Collections This Month"
              value={`₦${fmt(stats.collections_this_month)}`}
              sub={`Disbursed: ₦${fmt(stats.total_disbursed_this_month)}`}
              icon={<DollarSign size={20} />}
              color="border-green-400"
              linkTo="/reports/daily-transactions"
              linkLabel="View collection report"
            />
            <KpiCard
              label="Total Savings Mobilised"
              value={`₦${fmt(stats.total_savings)}`}
              icon={<Wallet size={20} />}
              color="border-teal-400"
              linkTo="/savings/accounts"
              linkLabel="View savings"
            />
          </div>

          {/* ── Cash Account Balance ── */}
          {stats.cashier_balance !== null && (
            <div
              className={`rounded-xl p-5 mb-6 flex items-center justify-between border-l-4 shadow-sm ${
                parseFloat(stats.cashier_balance ?? '0') !== 0
                  ? 'bg-red-50 border-red-500'
                  : 'bg-green-50 border-green-400'
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`rounded-lg p-2 ${
                    parseFloat(stats.cashier_balance ?? '0') !== 0
                      ? 'bg-red-100 text-red-600'
                      : 'bg-green-100 text-green-600'
                  }`}
                >
                  <Wallet size={22} />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    My Cash Account Balance
                    {stats.cashier_account_name && (
                      <span className="ml-1 font-normal normal-case text-gray-400">
                        — {stats.cashier_account_name}
                      </span>
                    )}
                  </p>
                  <p
                    className={`text-2xl font-bold mt-0.5 ${
                      parseFloat(stats.cashier_balance ?? '0') !== 0
                        ? 'text-red-700'
                        : 'text-green-700'
                    }`}
                  >
                    ₦{fmt(stats.cashier_balance)}
                  </p>
                </div>
              </div>
              <div className="text-right">
                {parseFloat(stats.cashier_balance ?? '0') !== 0 ? (
                  <div className="flex items-center gap-1 text-sm font-semibold text-red-600">
                    <AlertTriangle size={16} />
                    Must be ₦0.00 at end of day
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-sm font-semibold text-green-600">
                    <CheckCircle size={16} />
                    Balanced — end of day target met
                  </div>
                )}
                <Link
                  to={
                    stats.cashier_account_id != null
                      ? `/accounts/${stats.cashier_account_id}/ledger`
                      : '/treasury/cashier-accounts'
                  }
                  className="mt-1 inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                >
                  View transactions <ArrowRight size={11} />
                </Link>
              </div>
            </div>
          )}

          {/* ── Risk & Performance Row ── */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
            <KpiCard
              label="Portfolio at Risk (PAR30)"
              value={`${stats.par30_ratio.toFixed(2)}%`}
              sub={`₦${fmt(stats.par30_amount)} at risk`}
              icon={<TrendingDown size={20} />}
              color="border-orange-400"
              alert={stats.par30_ratio > 5}
              linkTo="/reports/loans/par"
              linkLabel="PAR report"
            />
            <KpiCard
              label="Overdue Loans"
              value={fmtInt(stats.overdue_loans)}
              sub="1+ days past due"
              icon={<AlertTriangle size={20} />}
              color="border-yellow-400"
              alert={stats.overdue_loans > 0}
              linkTo="/loans/accounts?status=active"
              linkLabel="View overdue"
            />
            <KpiCard
              label="Defaulting Loans"
              value={fmtInt(stats.defaulting_loans)}
              icon={<TrendingDown size={20} />}
              color="border-red-400"
              alert={stats.defaulting_loans > 0}
              linkTo="/reports/loans/defaulters"
              linkLabel="Defaulters report"
            />
            <KpiCard
              label="Repayment Rate"
              value={`${stats.loan_repayment_rate.toFixed(1)}%`}
              sub="Paid vs. total obligation"
              icon={<TrendingUp size={20} />}
              color={stats.loan_repayment_rate >= 90 ? 'border-green-400' : 'border-orange-400'}
            />
          </div>

          {/* ── PAR Breakdown Table ── */}
          {par && (
            <div className="rounded-xl bg-white shadow-sm mb-6">
              <div className="flex items-center justify-between border-b px-5 py-4">
                <div className="flex items-center gap-2">
                  <BarChart3 size={16} className="text-indigo-500" />
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                    Portfolio at Risk — Ageing Buckets
                  </h2>
                </div>
                <div className="flex gap-4 text-xs">
                  <span className="text-gray-500">
                    GLP: <strong className="text-gray-900">₦{fmt(par.glp)}</strong>
                  </span>
                  <span className="text-orange-600 font-semibold">
                    PAR30: {parseFloat(par.par_ratios.par30).toFixed(2)}%
                  </span>
                  <span className="text-red-600 font-semibold">
                    NPL: {parseFloat(par.par_ratios.npl_ratio).toFixed(2)}%
                  </span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      <th className="px-5 py-3">Bucket</th>
                      <th className="px-5 py-3 text-right">Loan Count</th>
                      <th className="px-5 py-3 text-right">Outstanding Balance</th>
                      <th className="px-5 py-3 text-right">PAR %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {par.buckets.map(b => {
                      const pct = parseFloat(b.par_pct);
                      const isRisk = b.key !== 'current';
                      return (
                        <tr
                          key={b.key}
                          className={isRisk && b.loan_count > 0 ? 'bg-red-50' : 'hover:bg-gray-50'}
                        >
                          <td
                            className={`px-5 py-3 font-medium ${isRisk && b.loan_count > 0 ? 'text-red-700' : 'text-gray-800'}`}
                          >
                            {b.label}
                          </td>
                          <td className="px-5 py-3 text-right text-gray-700">
                            {fmtInt(b.loan_count)}
                          </td>
                          <td className="px-5 py-3 text-right font-medium text-gray-900">
                            ₦{fmt(b.outstanding_balance)}
                          </td>
                          <td
                            className={`px-5 py-3 text-right font-semibold ${pct > 0 ? 'text-red-600' : 'text-green-600'}`}
                          >
                            {pct.toFixed(2)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Quick Actions ── */}
          <div className="rounded-xl bg-white shadow-sm">
            <div className="border-b px-5 py-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                Quick Actions
              </h2>
            </div>
            <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-3 lg:grid-cols-4">
              {[
                {
                  label: 'New Loan Application',
                  path: '/loans/accounts/create',
                  icon: <CreditCard size={16} />,
                  color: 'bg-blue-50 text-blue-700 border-blue-200',
                },
                {
                  label: 'Loan Collection',
                  path: '/loans/collection',
                  icon: <DollarSign size={16} />,
                  color: 'bg-green-50 text-green-700 border-green-200',
                },
                {
                  label: 'Savings Deposit',
                  path: '/savings/accounts',
                  icon: <Wallet size={16} />,
                  color: 'bg-teal-50 text-teal-700 border-teal-200',
                },
                {
                  label: 'Add New Client',
                  path: '/clients/create',
                  icon: <Users size={16} />,
                  color: 'bg-purple-50 text-purple-700 border-purple-200',
                },
                {
                  label: 'Defaulters Report',
                  path: '/reports/loans/defaulters',
                  icon: <AlertTriangle size={16} />,
                  color: 'bg-red-50 text-red-700 border-red-200',
                },
                {
                  label: 'Collection Sheet',
                  path: '/savings/collection',
                  icon: <BarChart3 size={16} />,
                  color: 'bg-orange-50 text-orange-700 border-orange-200',
                },
                {
                  label: 'PAR Report',
                  path: '/reports/loans/par',
                  icon: <TrendingDown size={16} />,
                  color: 'bg-yellow-50 text-yellow-700 border-yellow-200',
                },
                {
                  label: 'Disbursement Master Roll',
                  path: '/reports/disbursement-master-roll',
                  icon: <CheckCircle size={16} />,
                  color: 'bg-gray-50 text-gray-700 border-gray-200',
                },
              ].map(a => (
                <Link
                  key={a.path}
                  to={a.path}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-medium transition-colors hover:brightness-95 ${a.color}`}
                >
                  {a.icon}
                  {a.label}
                </Link>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
