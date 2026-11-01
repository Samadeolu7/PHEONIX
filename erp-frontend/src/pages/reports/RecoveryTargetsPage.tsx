/**
 * Recovery Targets
 *
 * Replaces the daily hand-typed thread messages officers used to post:
 *   "Target: 1.2m / Recovered Today / Cumulative Recovered / Outstanding Balance"
 * Managers set each officer's monthly target here; everything else is
 * computed live from actual loan repayments on the officer's assigned
 * clients (see analytics/views.py::RecoveryTargetsView), so running totals
 * can't drift from typos. Each officer's progress is shown against the share
 * of the month already gone ("halfway through the month = 50% of target").
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  ClipboardCopy,
  Download,
  Loader2,
  Pencil,
  RefreshCw,
  Save,
  Target,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  recoveryTargetService,
  RecoveryOfficerRow,
  RecoveryStatus,
  RecoveryTargetsResponse,
} from '../../services/recoveryTargetService';
import { BRAND } from '../../constants/brand';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';

const AUTO_REFRESH_MS = 3 * 60_000;

function num(v: string | number | null | undefined): number {
  const n = parseFloat(String(v ?? '0'));
  return isNaN(n) ? 0 : n;
}

function naira(v: string | number | null | undefined): string {
  return `₦${num(v).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function prettyDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

const STATUS_META: Record<RecoveryStatus, { label: string; bar: string; chip: string }> = {
  achieved: { label: 'Target met', bar: '#15803d', chip: 'bg-green-100 text-green-800' },
  on_pace: { label: 'On pace', bar: '#16a34a', chip: 'bg-green-50 text-green-700' },
  slightly_behind: { label: 'Slightly behind', bar: '#d97706', chip: 'bg-amber-50 text-amber-800' },
  behind: { label: 'Behind', bar: '#dc2626', chip: 'bg-red-50 text-red-700' },
  no_target: { label: 'No target', bar: '#9ca3af', chip: 'bg-gray-100 text-gray-600' },
};

function ProgressBar({ pct, elapsed, status }: { pct: number; elapsed: number; status: RecoveryStatus }) {
  return (
    <div className="relative h-2.5 w-full min-w-[120px] rounded-full bg-gray-100" title={`${pct.toFixed(1)}% of target · ${elapsed.toFixed(1)}% of month gone`}>
      <div
        className="h-full rounded-full"
        style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: STATUS_META[status].bar }}
      />
      {/* Where they should be by now */}
      <div
        className="absolute -top-1 h-[18px] w-0.5 rounded bg-gray-700"
        style={{ left: `calc(${Math.min(elapsed, 100)}% - 1px)` }}
      />
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-gray-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
    </div>
  );
}

function DailyBreakdown({ row }: { row: RecoveryOfficerRow }) {
  const target = row.target ? num(row.target) : null;
  let running = 0;
  if (row.daily.length === 0) {
    return <p className="px-4 py-3 text-sm text-gray-500">Nothing recovered on defaulted loans this month yet.</p>;
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs uppercase text-gray-500">
          <th className="px-4 py-2 font-medium">Date</th>
          <th className="px-4 py-2 text-right font-medium">Recovered</th>
          <th className="px-4 py-2 text-right font-medium">Cumulative</th>
          {target !== null && <th className="px-4 py-2 text-right font-medium">Balance</th>}
        </tr>
      </thead>
      <tbody>
        {row.daily.map((d) => {
          running += num(d.amount);
          return (
            <tr key={d.date} className="border-t border-gray-100">
              <td className="px-4 py-1.5 text-gray-700">{prettyDate(d.date)}</td>
              <td className="px-4 py-1.5 text-right tabular-nums">{naira(d.amount)}</td>
              <td className="px-4 py-1.5 text-right tabular-nums">{naira(running)}</td>
              {target !== null && (
                <td className="px-4 py-1.5 text-right tabular-nums">{naira(Math.max(target - running, 0))}</td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function buildSummaryText(data: RecoveryTargetsResponse): string {
  const lines = [
    `Recovery update — ${prettyDate(data.as_of)} (day ${data.days_elapsed} of ${data.days_in_month}, ${data.pct_month_elapsed}% of month gone)`,
    '',
  ];
  for (const r of data.officers) {
    if (!r.target) continue;
    lines.push(
      r.name,
      `Target: ${naira(r.target)}`,
      `Recovered today: ${naira(r.recovered_today)}`,
      `Cumulative recovered: ${naira(r.recovered_mtd)} (${r.pct_achieved}%)`,
      `Outstanding balance: ${naira(r.balance)}`,
      '',
    );
  }
  if (num(data.totals.target) > 0) {
    lines.push(
      `TEAM: ${naira(data.totals.recovered_mtd)} of ${naira(data.totals.target)} (${data.totals.pct_achieved}%)`,
    );
  }
  return lines.join('\n');
}

export default function RecoveryTargetsPage() {
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState<RecoveryTargetsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (background = false) => {
    if (!background) setLoading(true);
    setError(null);
    try {
      setData(await recoveryTargetService.get(month));
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err?.message ?? 'Failed to load recovery targets.');
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { load(); setEditing(false); }, [load]);
  useAutoRefresh(() => load(true), AUTO_REFRESH_MS, !editing);

  const elapsed = num(data?.pct_month_elapsed);
  const withTargets = useMemo(() => data?.officers.filter((r) => r.target) ?? [], [data]);

  function startEditing() {
    if (!data) return;
    const d: Record<number, string> = {};
    for (const r of data.officers) d[r.staff_id] = r.target ? String(num(r.target)) : '';
    setDraft(d);
    setEditing(true);
  }

  function copyLastMonth() {
    if (!data) return;
    let filled = 0;
    const d = { ...draft };
    for (const r of data.officers) {
      if (!d[r.staff_id] && r.previous_target) {
        d[r.staff_id] = String(num(r.previous_target));
        filled += 1;
      }
    }
    setDraft(d);
    toast.info(filled ? `Copied ${filled} target(s) from last month` : 'No blank officers had a target last month');
  }

  async function saveTargets() {
    if (!data) return;
    const changes = data.officers
      .filter((r) => (draft[r.staff_id] ?? '') !== (r.target ? String(num(r.target)) : ''))
      .map((r) => ({ staff_id: r.staff_id, target_amount: draft[r.staff_id]?.trim() || null }));
    if (changes.length === 0) { setEditing(false); return; }
    setSaving(true);
    try {
      await recoveryTargetService.save(month, changes);
      toast.success('Targets saved');
      setEditing(false);
      await load();
    } catch (e: unknown) {
      const err = e as { message?: string; details?: { errors?: { error: string }[] } };
      toast.error(err?.details?.errors?.map((x) => x.error).join(' · ') || err?.message || 'Failed to save targets');
    } finally {
      setSaving(false);
    }
  }

  async function copySummary() {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(buildSummaryText(data));
      toast.success('Summary copied — paste it into the thread');
    } catch {
      toast.error('Could not copy to clipboard');
    }
  }

  async function exportCsv() {
    try { await recoveryTargetService.downloadCsv(month); } catch { toast.error('Failed to export CSV'); }
  }

  function toggle(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const btn = 'flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50';

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b bg-white px-4 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <Link to="/reports" className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <Target size={20} style={{ color: BRAND.colors.navyPrimary }} />
              <h1 className="text-xl font-bold text-gray-900">Recovery Targets</h1>
            </div>
            <p className="text-sm text-gray-500">
              Each officer's monthly target vs. what they've actually recovered on defaulted loans. Updates automatically.
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl p-4 sm:p-6">
        {/* Controls */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <input
              type="month"
              value={month}
              onChange={(e) => e.target.value && setMonth(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            />
            <button type="button" onClick={() => load()} disabled={loading} className={btn}>
              {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Refresh
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {editing ? (
              <>
                <button type="button" onClick={copyLastMonth} className={btn}>Copy last month</button>
                <button type="button" onClick={() => setEditing(false)} className={btn}><X size={14} />Cancel</button>
                <button
                  type="button" onClick={saveTargets} disabled={saving}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                  style={{ backgroundColor: BRAND.colors.navyPrimary }}
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Save targets
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={copySummary} disabled={!data || withTargets.length === 0} className={btn}>
                  <ClipboardCopy size={14} />Copy summary
                </button>
                <button type="button" onClick={exportCsv} disabled={!data} className={btn}>
                  <Download size={14} />CSV
                </button>
                {data?.can_set_targets && (
                  <button
                    type="button" onClick={startEditing}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white"
                    style={{ backgroundColor: BRAND.colors.navyPrimary }}
                  >
                    <Pencil size={14} />Set targets
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle size={16} />{error}
          </div>
        )}

        {loading && !data && (
          <div className="flex justify-center py-20"><Loader2 size={32} className="animate-spin text-blue-600" /></div>
        )}

        {data && (
          <>
            {/* Month progress */}
            <div className="mb-4 rounded-xl border border-gray-200 bg-white p-4">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="font-medium text-gray-800">
                  {data.as_of
                    ? `Day ${data.days_elapsed} of ${data.days_in_month} — ${data.pct_month_elapsed}% of the month gone`
                    : 'This month has not started yet'}
                </span>
                {data.as_of && <span className="text-gray-500">Figures as of {prettyDate(data.as_of)}</span>}
              </div>
              <div className="h-1.5 w-full rounded-full bg-gray-100">
                <div className="h-full rounded-full bg-gray-500" style={{ width: `${elapsed}%` }} />
              </div>
            </div>

            <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Tile label="Team target" value={naira(data.totals.target)} sub={`${withTargets.length} officer(s) with a target`} />
              <Tile
                label="Recovered this month"
                value={naira(data.totals.recovered_mtd)}
                sub={data.totals.pct_achieved ? `${data.totals.pct_achieved}% of target · should be ~${data.pct_month_elapsed}%` : undefined}
              />
              <Tile label="Recovered today" value={naira(data.totals.recovered_today)} sub={prettyDate(data.as_of)} />
              <Tile label="Balance to target" value={naira(data.totals.balance)} />
            </div>

            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                  <tr>
                    <th className="w-8 px-3 py-3" />
                    <th className="px-3 py-3 font-medium">Officer</th>
                    <th className="px-3 py-3 text-right font-medium">Target</th>
                    <th className="px-3 py-3 text-right font-medium">Today</th>
                    <th className="px-3 py-3 text-right font-medium">Cumulative</th>
                    <th className="px-3 py-3 text-right font-medium">Balance</th>
                    <th className="px-3 py-3 font-medium">Progress</th>
                    <th className="px-3 py-3 text-right font-medium">Needed / day</th>
                  </tr>
                </thead>
                <tbody>
                  {data.officers.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-500">No officers with assigned clients.</td></tr>
                  )}
                  {data.officers.map((r) => {
                    const meta = STATUS_META[r.status];
                    const open = expanded.has(r.staff_id);
                    return (
                      <React.Fragment key={r.staff_id}>
                        <tr className="border-t border-gray-100 hover:bg-gray-50">
                          <td className="px-3 py-3">
                            <button type="button" onClick={() => toggle(r.staff_id)} className="text-gray-400 hover:text-gray-700" aria-label="Show daily breakdown">
                              {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </button>
                          </td>
                          <td className="px-3 py-3">
                            <div className="font-medium text-gray-900">{r.name}</div>
                            <div className="text-xs text-gray-500">{[r.position, r.branch_name].filter(Boolean).join(' · ')}</div>
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">
                            {editing ? (
                              <input
                                type="number" min="0" step="1000" inputMode="decimal"
                                value={draft[r.staff_id] ?? ''}
                                placeholder={r.previous_target ? `last: ${num(r.previous_target).toLocaleString('en-NG')}` : '—'}
                                onChange={(e) => setDraft((p) => ({ ...p, [r.staff_id]: e.target.value }))}
                                className="w-36 rounded-md border border-gray-300 px-2 py-1 text-right text-sm"
                              />
                            ) : r.target ? naira(r.target) : <span className="text-gray-400">—</span>}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">{naira(r.recovered_today)}</td>
                          <td className="px-3 py-3 text-right font-medium tabular-nums">{naira(r.recovered_mtd)}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{r.balance !== null ? naira(r.balance) : '—'}</td>
                          <td className="px-3 py-3">
                            {r.target ? (
                              <div className="space-y-1">
                                <ProgressBar pct={num(r.pct_achieved)} elapsed={elapsed} status={r.status} />
                                <div className="flex items-center justify-between gap-2 text-xs">
                                  <span className="tabular-nums text-gray-600">{r.pct_achieved}%</span>
                                  <span className={`rounded-full px-2 py-0.5 font-medium ${meta.chip}`}>{meta.label}</span>
                                </div>
                              </div>
                            ) : (
                              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${meta.chip}`}>{meta.label}</span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums text-gray-700">
                            {r.required_daily ? naira(r.required_daily) : '—'}
                          </td>
                        </tr>
                        {open && (
                          <tr className="bg-gray-50/60">
                            <td />
                            <td colSpan={7} className="pb-3"><DailyBreakdown row={r} /></td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="mt-3 text-xs text-gray-500">
              Recovered = repayments on loans that were {data.min_days_overdue}+ days overdue on the day the client paid
              (principal, interest, fees and penalty), for clients assigned to each officer. Repayments on current loans
              are normal collections and don't count. Reversed payments are excluded. The dark tick on each bar marks where
              the officer should be by now.
              {data.totals.unassigned_recovered_mtd && num(data.totals.unassigned_recovered_mtd) > 0 && (
                <> {naira(data.totals.unassigned_recovered_mtd)} was recovered this month from clients with no assigned officer.</>
              )}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
