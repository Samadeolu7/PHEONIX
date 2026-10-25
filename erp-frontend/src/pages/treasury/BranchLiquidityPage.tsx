import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Wallet } from 'lucide-react';
import { useBranchOptions } from '../../hooks/useBranches';
import { toast } from 'sonner';
import { useBranchForecast, useTreasurySettings, useUpdateTreasurySettings } from '../../hooks/useBankBorrowings';
import type { TreasurySettings } from '../../types/bankBorrowing';
import { apiErrorMessage } from './treasuryFormat';
import { useAuth } from '../../contexts/AuthContext';
import { formatDay, naira } from './treasuryFormat';

const SETTING_FIELDS: { key: keyof TreasurySettings; label: string; hint: string; min: number; max: number }[] = [
  { key: 'lookahead_days', label: 'Look-ahead window (days)', hint: 'How far ahead the lending check reserves cash.', min: 7, max: 180 },
  { key: 'smart_savings_notice_days', label: 'Smart Saver notice (days)', hint: 'From the client asking to the payout deadline.', min: 0, max: 90 },
  { key: 'collection_rate_window_days', label: 'Collection history (days)', hint: "Period used to measure each branch's collection rate.", min: 14, max: 365 },
  { key: 'default_contribution_lead_days', label: 'Branch share lead time (days)', hint: 'Suggested default for new bank borrowings.', min: 0, max: 60 },
];

const SettingsCard: React.FC = () => {
  const { data } = useTreasurySettings();
  const save = useUpdateTreasurySettings();
  const [draft, setDraft] = useState<Partial<TreasurySettings>>({});
  if (!data) return null;
  const value = (k: keyof TreasurySettings) => (draft[k] ?? data[k]) as number;
  const dirty = Object.keys(draft).length > 0;

  return (
    <section className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-1">Lending check settings</h2>
      <p className="text-sm text-gray-600 mb-4">Applies to every branch. Only directors can change these.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {SETTING_FIELDS.map((f) => (
          <label key={f.key} className="block text-sm">
            <span className="font-medium text-gray-700">{f.label}</span>
            <input type="number" min={f.min} max={f.max} value={value(f.key)}
              onChange={(e) => setDraft((d) => ({ ...d, [f.key]: Number(e.target.value) }))}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg" />
            <span className="text-xs text-gray-500">{f.hint}</span>
          </label>
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        <button type="button" disabled={!dirty || save.isPending}
          onClick={async () => {
            try {
              await save.mutateAsync(draft);
              setDraft({});
              toast.success('Settings saved.');
            } catch (e) {
              toast.error(apiErrorMessage(e, 'Could not save the settings.'));
            }
          }}
          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50">
          Save settings
        </button>
        {dirty && <button type="button" onClick={() => setDraft({})} className="px-4 py-2 rounded-lg border border-gray-300">Undo</button>}
      </div>
    </section>
  );
};

const BranchLiquidityPage: React.FC = () => {
  const { user, isDirectorPlus: isDirector } = useAuth();
  const { data: branches = [] } = useBranchOptions();
  const [branchId, setBranchId] = useState<number | undefined>(undefined);

  // Directors pick any branch; everyone else is limited to their own (the API enforces this too).
  useEffect(() => {
    if (branchId === undefined && branches.length > 0) {
      const own = user?.branch_id ? Number(user.branch_id) : undefined;
      setBranchId(own && branches.some((b) => b.id === own) ? own : branches[0].id);
    }
  }, [branches, branchId, user]);

  const { data: f, isLoading, error } = useBranchForecast(branchId, undefined, branchId !== undefined);
  const interesting = (f?.days ?? []).filter((d, i) => i === 0 || Number(d.inflow) > 0 || d.outflows.length > 0);
  const rate = Math.round(Number(f?.collection_rate ?? 0) * 100);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Wallet className="w-8 h-8 text-blue-600" /> Branch Cash Forecast
          </h1>
          <p className="text-gray-600 mt-1">
            What a branch can safely lend today, after setting aside savings payouts, bank-loan shares and approved
            loans that are waiting to be paid out.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isDirector && <Link to="/treasury/borrowings" className="text-blue-700 hover:underline text-sm">Bank borrowings</Link>}
          <select title="Branch" className="px-3 py-2 border border-gray-300 rounded-lg" value={branchId ?? ''} disabled={!isDirector}
            onChange={(e) => setBranchId(Number(e.target.value))}>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">Could not load the forecast.</div>}
      {isLoading && <p className="text-gray-500">Calculating…</p>}

      {f && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              ['Can lend today', naira(f.available_today), 'text-green-700'],
              ['Cash and bank now', naira(f.cash_now), 'text-gray-900'],
              [`Committed payments (${f.lookahead_days} days)`, naira(f.committed_outflows_total), 'text-red-700'],
              [`Expected repayments (at ${rate}% collection)`, naira(f.expected_inflows_total), 'text-blue-700'],
            ].map(([label, value, color]) => (
              <div key={label} className="bg-white rounded-lg shadow p-4">
                <p className="text-xs text-gray-500">{label}</p>
                <p className={`text-xl font-semibold mt-1 ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Day by day</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-gray-600">
                  <tr>
                    <th className="px-3 py-2">Date</th><th className="px-3 py-2 text-right">Expected in</th>
                    <th className="px-3 py-2 text-right">Payments out</th><th className="px-3 py-2 text-right">Balance after</th>
                    <th className="px-3 py-2">What is due</th>
                  </tr>
                </thead>
                <tbody>
                  {interesting.map((d) => {
                    const negative = Number(d.closing) < 0;
                    return (
                      <tr key={d.date} className="border-t align-top">
                        <td className="px-3 py-2 whitespace-nowrap">{formatDay(d.date)}</td>
                        <td className="px-3 py-2 text-right text-blue-700">{Number(d.inflow) > 0 ? naira(d.inflow) : '—'}</td>
                        <td className="px-3 py-2 text-right text-red-700">{Number(d.outflow) > 0 ? naira(d.outflow) : '—'}</td>
                        <td className={`px-3 py-2 text-right font-medium ${negative ? 'text-red-700' : 'text-gray-900'}`}>{naira(d.closing)}</td>
                        <td className="px-3 py-2">
                          {d.outflows.map((o, i) => (
                            <div key={i} className={o.overdue ? 'text-red-700' : ''}>{o.description} — {naira(o.amount)}{o.overdue ? ' (overdue)' : ''}</div>
                          ))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-500 mt-3">
              Expected repayments count only schedule rows not yet overdue, scaled by this branch&apos;s collection rate
              over recent months. The closing balance can dip below zero on a day with no money to cover that day&apos;s
              payments, which is exactly what the lending check protects against.
            </p>
          </section>
        </>
      )}
      {isDirector && <SettingsCard />}
    </div>
  );
};

export default BranchLiquidityPage;
