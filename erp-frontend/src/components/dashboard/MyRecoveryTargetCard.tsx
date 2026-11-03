/**
 * MyRecoveryTargetCard
 *
 * Shown on the role-based dashboard to anyone with a recovery target this
 * month (renders nothing otherwise). Deliberately never "comfortable green":
 * it always shows the nearest goal not yet met —
 *   below 80% of today's target → today's shortfall
 *   else below 80% of this week's → the week's shortfall
 *   else → what's still left for the month
 * Green only once the whole monthly target is met.
 * Data: /api/analytics/recovery-targets/mine/ (analytics/views.py::my_recovery_focus).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Target } from 'lucide-react';
import { recoveryTargetService, MyRecoveryTarget, RecoveryFocus } from '../../services/recoveryTargetService';
import { formatNaira } from '../../services/dashboardStatsService';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import { BRAND } from '../../constants/brand';

const AUTO_REFRESH_MS = 3 * 60_000;

const HEADLINE: Record<RecoveryFocus, string> = {
  daily: 'Behind today’s target',
  weekly: 'Behind this week’s target',
  monthly: 'Still needed this month',
  achieved: 'Monthly target met',
};

const ACCENT: Record<RecoveryFocus, string> = {
  daily: '#f87171',   // red
  weekly: '#fbbf24',  // amber
  monthly: BRAND.colors.gold,
  achieved: '#4ade80', // green — only when the month is done
};

const naira = (v?: string) => formatNaira(v ?? "0");

function n(v?: string): number {
  const x = parseFloat(v ?? '0');
  return isNaN(x) ? 0 : x;
}

export default function MyRecoveryTargetCard() {
  const navigate = useNavigate();
  const [data, setData] = useState<MyRecoveryTarget | null>(null);

  const load = useCallback(() => {
    recoveryTargetService.mine().then(setData).catch(() => setData(null));
  }, []);

  useEffect(() => { load(); }, [load]);
  useAutoRefresh(load, AUTO_REFRESH_MS, !!data?.has_target);

  if (!data?.has_target || !data.focus) return null;

  const focus = data.focus;
  const accent = ACCENT[focus];
  const goal = n(data.focus_target);
  const done = n(data.focus_recovered);
  const pct = goal > 0 ? Math.min((done / goal) * 100, 100) : 0;

  // Shortfalls from earlier days/weeks are added to today's / this week's goal — say so.
  const carried = (amount?: string, base?: string) =>
    n(amount) > 0 ? ` (${naira(base)} + ${naira(amount)} carried over)` : '';

  const detail: Record<RecoveryFocus, string> = {
    daily: `Recovered ${naira(data.recovered_today)} of today’s ${naira(data.daily_goal)}${carried(data.daily_carried, data.daily_target)}`,
    weekly: `This week: ${naira(data.recovered_week)} of ${naira(data.weekly_goal)}${carried(data.weekly_carried, data.weekly_target)} · today ${naira(data.recovered_today)}`,
    monthly: `${naira(data.recovered_mtd)} of ${naira(data.target)} — ${naira(data.required_daily)}/day for the next ${data.days_left} day(s)`,
    achieved: `${naira(data.recovered_mtd)} of ${naira(data.target)} recovered`,
  };

  return (
    <button
      type="button"
      onClick={() => navigate('/reports/recovery-targets')}
      className="w-full rounded-xl p-4 text-left"
      style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.10)', borderLeft: `4px solid ${accent}` }}
      title="Open Recovery Targets"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>
            <Target className="h-3.5 w-3.5" style={{ color: accent }} />
            My recovery target · {HEADLINE[focus]}
          </p>
          <p className="mt-1 text-2xl font-black leading-tight" style={{ color: accent }}>
            {focus === 'achieved'
              ? n(data.above_target) > 0 ? `+${naira(data.above_target)}` : naira(data.target)
              : naira(data.shortfall)}
          </p>
          <p className="mt-1 text-xs" style={{ color: 'rgba(255,255,255,0.70)' }}>{detail[focus]}</p>
        </div>
        <div className="text-right text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>
          <p>Month: <span className="font-semibold text-white">{naira(data.recovered_mtd)}</span></p>
          <p>of {naira(data.target)}</p>
        </div>
      </div>
      <div className="mt-3 h-1.5 w-full rounded-full" style={{ background: 'rgba(255,255,255,0.12)' }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: accent }} />
      </div>
      <p className="mt-2 text-[11px]" style={{ color: 'rgba(255,255,255,0.40)' }}>
        Counts repayments on loans {data.min_days_overdue}+ days overdue.
      </p>
    </button>
  );
}
