import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  TrendingUp,
  Tag,
  Package,
  Calendar,
  Users,
  AlertCircle,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { useCollectionStatus } from '../../../hooks/useIncomeReports';
import { useAutoRefresh } from '../../../hooks/useAutoRefresh';

// Background refresh so income figures posted by other users / cron jobs
// surface without a manual refresh.
const AUTO_REFRESH_MS = 3 * 60_000;

const thisYear = () => new Date().getFullYear();
const pad2 = (n: number) => String(n).padStart(2, '0');
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
const janFirst = () => `${thisYear()}-01-01`;

const fmt = (v: number) =>
  v.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface KpiCardProps {
  label: string;
  value: string;
  sub?: string;
  color: string;
}
const KpiCard: React.FC<KpiCardProps> = ({ label, value, sub, color }) => (
  <div className={`bg-white rounded-xl border border-gray-200 p-5 shadow-sm`}>
    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
    <p className={`mt-1 text-2xl font-bold tabular-nums ${color}`}>{value}</p>
    {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
  </div>
);

interface NavCardProps {
  to: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  color: string;
}
const NavCard: React.FC<NavCardProps> = ({ to, icon, title, description, color }) => (
  <Link
    to={to}
    className="group flex items-start gap-4 bg-white rounded-xl border border-gray-200 p-5
               shadow-sm hover:shadow-md hover:border-blue-300 transition-all"
  >
    <div className={`flex-shrink-0 p-2.5 rounded-lg ${color}`}>{icon}</div>
    <div className="flex-1 min-w-0">
      <p className="font-semibold text-gray-900 group-hover:text-blue-700 transition-colors">
        {title}
      </p>
      <p className="mt-0.5 text-sm text-gray-500">{description}</p>
    </div>
    <ChevronRight className="flex-shrink-0 h-4 w-4 text-gray-300 group-hover:text-blue-500 mt-1 transition-colors" />
  </Link>
);

const STATUS_COLORS: Record<string, string> = {
  paid: 'bg-green-100 text-green-800',
  partial: 'bg-yellow-100 text-yellow-800',
  overdue: 'bg-red-100 text-red-800',
  sent: 'bg-blue-100 text-blue-800',
  draft: 'bg-gray-100 text-gray-700',
  cancelled: 'bg-gray-100 text-gray-400',
};

const IncomeReportsDashboardPage: React.FC = () => {
  const [dateFrom, setDateFrom] = useState(janFirst());
  const [dateTo, setDateTo] = useState(todayStr());
  const [appliedFilters, setAppliedFilters] = useState({
    date_from: janFirst(),
    date_to: todayStr(),
  });

  const { data, isLoading: loading, error: queryError, refetch } = useCollectionStatus(appliedFilters);
  const error =
    queryError instanceof Error ? queryError.message : queryError ? String(queryError) : null;

  useAutoRefresh(() => refetch(), AUTO_REFRESH_MS);

  const handleApply = () => {
    setAppliedFilters({ date_from: dateFrom, date_to: dateTo });
  };

  const s = data?.summary;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-100 rounded-xl">
                <TrendingUp className="h-6 w-6 text-blue-700" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Income Reports</h1>
                <p className="text-sm text-gray-500">Revenue analysis &amp; collection tracking</p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-gray-500 font-medium">From</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-gray-500 font-medium">To</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                onClick={handleApply}
                disabled={loading}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400
                           text-white text-sm font-medium px-3.5 py-1.5 rounded-lg transition-colors"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                Apply
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Overview · {dateFrom} → {dateTo}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <KpiCard
              label="Total Invoiced"
              value={s ? `₦${fmt(s.total_invoiced)}` : '—'}
              sub={s ? `${s.total_invoices} invoices` : undefined}
              color="text-gray-900"
            />
            <KpiCard
              label="Collected"
              value={s ? `₦${fmt(s.total_collected)}` : '—'}
              sub={s ? `${s.collection_rate.toFixed(1)}% collection rate` : undefined}
              color="text-green-700"
            />
            <KpiCard
              label="Outstanding"
              value={s ? `₦${fmt(s.total_outstanding)}` : '—'}
              color="text-orange-600"
            />
            <KpiCard
              label="Overdue"
              value={s ? `₦${fmt(s.overdue_amount)}` : '—'}
              sub={s ? `${s.overdue_count} overdue invoices` : undefined}
              color="text-red-600"
            />
          </div>
        </section>

        {data && data.by_status.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Invoice Status Breakdown
            </h2>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-5 py-3 font-medium text-gray-600">Status</th>
                    <th className="text-right px-5 py-3 font-medium text-gray-600">Count</th>
                    <th className="text-right px-5 py-3 font-medium text-gray-600">Invoiced</th>
                    <th className="text-right px-5 py-3 font-medium text-gray-600">Collected</th>
                    <th className="text-right px-5 py-3 font-medium text-gray-600">Outstanding</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.by_status.map(row => (
                    <tr key={row.status} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            STATUS_COLORS[row.status] || 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {row.label}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-gray-700">
                        {row.count}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-gray-900 font-medium">
                        {fmt(row.invoiced)}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-green-700">
                        {fmt(row.collected)}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-orange-600">
                        {fmt(row.outstanding)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Detailed Reports
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <NavCard
              to="/incomes/reports/by-category"
              icon={<Tag className="h-5 w-5 text-blue-600" />}
              title="By Income Category"
              description="Revenue breakdown by income category with collection rates"
              color="bg-blue-50"
            />
            <NavCard
              to="/incomes/reports/by-service-item"
              icon={<Package className="h-5 w-5 text-violet-600" />}
              title="By Service / Fee Item"
              description="Revenue per service item — quantity, price and collection"
              color="bg-violet-50"
            />
            <NavCard
              to="/incomes/reports/by-period"
              icon={<Calendar className="h-5 w-5 text-emerald-600" />}
              title="By Period (Trend)"
              description="Daily, weekly, monthly or yearly income trend charts"
              color="bg-emerald-50"
            />
            <NavCard
              to="/incomes/reports/by-client"
              icon={<Users className="h-5 w-5 text-orange-600" />}
              title="By Client"
              description="Top clients by revenue — invoiced, collected and outstanding"
              color="bg-orange-50"
            />
          </div>
        </section>
      </div>
    </div>
  );
};

export default IncomeReportsDashboardPage;
