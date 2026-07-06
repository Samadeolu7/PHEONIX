/**
 * CashInflowForecastCard
 *
 * Brings back the old system's rotating Expected/Actual Cash Inflow boxes
 * (dash.html — cycles Daily → Weekly → Monthly every 5s), which the client
 * specifically relies on for forecasting. Fetches the current month's
 * expected-vs-actual trend once (analytics/cash-inflow-trend/, which
 * defaults to the full current month so "expected" covers the rest of the
 * week/month, not just what's already past) and derives all three
 * granularities client-side — no extra round trips.
 *
 * Used in two places: a compact variant on the main role dashboard, and a
 * fuller variant at the top of DirectorPortfolioPage.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { dashboardStatsService, formatNaira } from '../../services/dashboardStatsService';

type Granularity = 'daily' | 'weekly' | 'monthly';
const GRANULARITIES: Granularity[] = ['daily', 'weekly', 'monthly'];
const LABELS: Record<Granularity, string> = {
  daily: 'Today',
  weekly: 'This Week',
  monthly: 'This Month',
};

function startOfWeek(d: Date): Date {
  // Monday-start week, matching the old system's Mon–Fri collection cadence.
  const day = d.getDay(); // 0 = Sunday
  const diff = (day === 0 ? -6 : 1) - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function endOfWeek(d: Date): Date {
  const monday = startOfWeek(d);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return sunday;
}

interface Props {
  /** Compact renders two small side-by-side boxes for the main dashboard hero;
   *  full renders a larger card with more headroom for the report page. */
  variant?: 'compact' | 'full';
}

export default function CashInflowForecastCard({ variant = 'compact' }: Props) {
  const [points, setPoints] = useState<{ date: string; expected: string; actual: string }[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    dashboardStatsService.getCashInflowTrend().then((data) => {
      if (!cancelled) {
        setPoints(data);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % GRANULARITIES.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const totals = useMemo(() => {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const weekStart = startOfWeek(today).toISOString().slice(0, 10);
    const weekEnd = endOfWeek(today).toISOString().slice(0, 10);

    const sums: Record<Granularity, { expected: number; actual: number }> = {
      daily: { expected: 0, actual: 0 },
      weekly: { expected: 0, actual: 0 },
      monthly: { expected: 0, actual: 0 },
    };

    for (const p of points) {
      const expected = parseFloat(p.expected) || 0;
      const actual = parseFloat(p.actual) || 0;
      sums.monthly.expected += expected;
      sums.monthly.actual += actual;
      if (p.date >= weekStart && p.date <= weekEnd) {
        sums.weekly.expected += expected;
        sums.weekly.actual += actual;
      }
      if (p.date === todayStr) {
        sums.daily.expected += expected;
        sums.daily.actual += actual;
      }
    }
    return sums;
  }, [points]);

  const granularity = GRANULARITIES[index];
  const current = totals[granularity];

  if (variant === 'full') {
    return (
      <div className="rounded-xl bg-white shadow-sm mb-6 overflow-hidden">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div className="flex items-center gap-2">
            <CalendarClock size={16} className="text-green-600" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              Cash Inflow Forecast
            </h2>
          </div>
          <div className="flex gap-1.5">
            {GRANULARITIES.map((g, i) => (
              <button
                key={g}
                onClick={() => setIndex(i)}
                className={`h-1.5 w-6 rounded-full transition-colors ${
                  i === index ? 'bg-green-500' : 'bg-gray-200'
                }`}
                aria-label={LABELS[g]}
              />
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 divide-x">
          <div className="p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Expected Cash Inflow — {LABELS[granularity]}
            </p>
            <p className="mt-1 text-2xl font-bold text-gray-900">
              {loading ? '—' : formatNaira(current.expected)}
            </p>
          </div>
          <div className="p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Actual Cash Inflow — {LABELS[granularity]}
            </p>
            <p className="mt-1 text-2xl font-bold text-green-700">
              {loading ? '—' : formatNaira(current.actual)}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Compact variant — two small boxes for the main dashboard hero row.
  return (
    <div className="grid grid-cols-2 gap-3">
      <button
        type="button"
        onClick={() => setIndex((i) => (i + 1) % GRANULARITIES.length)}
        className="rounded-xl p-4 text-left transition-colors"
        style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.10)' }}
        title="Click to cycle Daily / Weekly / Monthly"
      >
        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.50)' }}>
          Expected Cash Inflow — {LABELS[granularity]}
        </p>
        <p className="text-lg font-black text-white leading-tight mt-1">
          {loading ? '—' : formatNaira(current.expected)}
        </p>
      </button>
      <button
        type="button"
        onClick={() => setIndex((i) => (i + 1) % GRANULARITIES.length)}
        className="rounded-xl p-4 text-left transition-colors"
        style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.10)' }}
        title="Click to cycle Daily / Weekly / Monthly"
      >
        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.50)' }}>
          Actual Cash Inflow — {LABELS[granularity]}
        </p>
        <p className="text-lg font-black text-white leading-tight mt-1">
          {loading ? '—' : formatNaira(current.actual)}
        </p>
      </button>
    </div>
  );
}
