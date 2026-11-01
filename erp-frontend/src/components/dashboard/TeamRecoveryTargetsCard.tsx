/**
 * TeamRecoveryTargetsCard
 *
 * Branch manager / director summary of every officer's recovery target on the
 * role-based dashboard. Click-through to /reports/recovery-targets for the
 * full table. Officers furthest behind are listed first so problems surface
 * before anyone sees a good total. Data comes from the same endpoint as the
 * Recovery Targets page (already branch-scoped server-side).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Target } from 'lucide-react';
import {
  recoveryTargetService,
  RecoveryStatus,
  RecoveryTargetsResponse,
} from '../../services/recoveryTargetService';
import { formatNaira } from '../../services/dashboardStatsService';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import { BRAND } from '../../constants/brand';

const AUTO_REFRESH_MS = 3 * 60_000;
const MAX_ROWS = 5;

const STATUS: Record<RecoveryStatus, { label: string; color: string }> = {
  achieved: { label: 'Met', color: '#4ade80' },
  on_pace: { label: 'On pace', color: '#a3e635' },
  slightly_behind: { label: 'Slightly behind', color: '#fbbf24' },
  behind: { label: 'Behind', color: '#f87171' },
  no_target: { label: 'No target', color: 'rgba(255,255,255,0.4)' },
};

const naira = (v?: string | null) => formatNaira(v ?? '0');
const n = (v?: string | null) => { const x = parseFloat(v ?? '0'); return isNaN(x) ? 0 : x; };

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function TeamRecoveryTargetsCard() {
  const navigate = useNavigate();
  const [data, setData] = useState<RecoveryTargetsResponse | null>(null);

  const load = useCallback(() => {
    recoveryTargetService.get(currentMonth()).then(setData).catch(() => setData(null));
  }, []);
  useEffect(() => { load(); }, [load]);
  useAutoRefresh(load, AUTO_REFRESH_MS);

  const rows = useMemo(
    () => (data?.officers ?? [])
      .filter((r) => r.target)
      .sort((a, b) => n(a.pace_gap) - n(b.pace_gap)), // furthest behind pace first
    [data],
  );

  if (!data) return null;

  const elapsed = n(data.pct_month_elapsed);
  const behind = rows.filter((r) => r.status === 'behind' || r.status === 'slightly_behind').length;
  const open = () => navigate('/reports/recovery-targets');
  const box = { background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.10)' };

  if (rows.length === 0) {
    if (!data.can_set_targets) return null;
    return (
      <button type="button" onClick={open} className="flex w-full items-center justify-between rounded-xl p-4 text-left" style={box}>
        <span className="flex items-center gap-2 text-sm text-white">
          <Target className="h-4 w-4" style={{ color: BRAND.colors.gold }} />
          No recovery targets set for this month yet
        </span>
        <span className="flex items-center text-xs font-semibold" style={{ color: BRAND.colors.gold }}>
          Set targets <ChevronRight className="h-4 w-4" />
        </span>
      </button>
    );
  }

  const teamPct = n(data.totals.pct_achieved);
  // Director on "All branches": label each officer with their branch.
  const multiBranch = new Set(rows.map((r) => r.branch_name)).size > 1;

  return (
    <button type="button" onClick={open} className="w-full rounded-xl p-4 text-left" style={box} title="Open Recovery Targets">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>
            <Target className="h-3.5 w-3.5" style={{ color: BRAND.colors.gold }} />
            Team recovery · day {data.days_elapsed} of {data.days_in_month} ({data.pct_month_elapsed}% of month)
          </p>
          <p className="mt-1 text-xl font-black leading-tight text-white">
            {naira(data.totals.recovered_mtd)}
            <span className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.55)' }}>
              {' '}of {naira(data.totals.target)} · {teamPct.toFixed(1)}%
            </span>
          </p>
          <p className="mt-0.5 text-xs" style={{ color: 'rgba(255,255,255,0.70)' }}>
            Today {naira(data.totals.recovered_today)} · {naira(data.totals.balance)} to go ·{' '}
            <span style={{ color: behind ? '#f87171' : 'rgba(255,255,255,0.70)' }}>
              {behind} of {rows.length} officer(s) behind pace
            </span>
          </p>
        </div>
        <span className="flex items-center text-xs font-semibold" style={{ color: BRAND.colors.gold }}>
          View all <ChevronRight className="h-4 w-4" />
        </span>
      </div>

      <div className="mt-3 space-y-2">
        {rows.slice(0, MAX_ROWS).map((r) => {
          const s = STATUS[r.status];
          const pct = n(r.pct_achieved);
          return (
            <div key={r.staff_id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[10rem_minmax(0,1fr)_auto]">
              <span className="truncate text-xs font-semibold text-white">
                {r.name}
                {multiBranch && r.branch_name && (
                  <span className="font-normal" style={{ color: 'rgba(255,255,255,0.5)' }}> · {r.branch_name}</span>
                )}
              </span>
              <div className="relative order-3 col-span-2 h-1.5 rounded-full sm:order-none sm:col-span-1" style={{ background: 'rgba(255,255,255,0.12)' }}>
                <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: s.color }} />
                <div className="absolute -top-1 h-3.5 w-0.5 rounded bg-white/70" style={{ left: `calc(${Math.min(elapsed, 100)}% - 1px)` }} />
              </div>
              <span className="whitespace-nowrap text-right text-xs" style={{ color: s.color }}>
                {pct.toFixed(0)}% · {s.label}
              </span>
            </div>
          );
        })}
        {rows.length > MAX_ROWS && (
          <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.45)' }}>
            +{rows.length - MAX_ROWS} more officer(s)
          </p>
        )}
      </div>
    </button>
  );
}
