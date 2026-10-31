import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Wallet } from 'lucide-react';
import { useBranchOptions } from '../../hooks/useBranches';
import { toast } from 'sonner';
import { useBranchForecast, useTreasurySettings, useUpdateTreasurySettings } from '../../hooks/useBankBorrowings';
import type { TreasurySettings } from '../../types/bankBorrowing';
import { apiErrorMessage } from './treasuryFormat';
import { InfoButton, InfoLine } from '../../components/treasury/InfoButton';
import { useAuth } from '../../contexts/AuthContext';
import { formatDay, naira } from './treasuryFormat';

const OUTFLOW_LABELS: Record<string, string> = {
  savings_withdrawal: 'Savings payouts',
  approved_loan: 'Approved loans not yet paid out',
  bank_loan_share: 'Bank-loan shares to send',
  bank_loan_instalment: 'Bank-loan instalments',
};

const SETTING_FIELDS: { key: keyof TreasurySettings; label: string; hint: string; min: number; max: number }[] = [
  { key: 'lookahead_days', label: 'Look-ahead (days)', hint: 'How far ahead to check upcoming payments.', min: 7, max: 180 },
  { key: 'reserve_buffer_days', label: 'Days to spare', hint: 'Have money ready this many days early. 0 = on the due date. Higher is safer but lends less.', min: 0, max: 14 },
  { key: 'max_collection_rate_pct', label: 'Collection cap (%)', hint: 'Never count more than this % of expected repayments.', min: 0, max: 100 },
  { key: 'collection_rate_window_days', label: 'History (days)', hint: 'Past period used to measure collection and recovery.', min: 14, max: 365 },
  { key: 'smart_savings_notice_days', label: 'Smart Saver notice (days)', hint: 'Days from request to payout deadline.', min: 0, max: 90 },
  { key: 'default_contribution_lead_days', label: 'Share lead time (days)', hint: 'Default days before an instalment that branches send their share.', min: 0, max: 60 },
];

const SettingsCard: React.FC = () => {
  const { data } = useTreasurySettings();
  const save = useUpdateTreasurySettings();
  const [draft, setDraft] = useState<Partial<TreasurySettings>>({});
  if (!data) return null;
  const value = (k: keyof TreasurySettings) => (draft[k] ?? data[k]) as number;
  const includeRecovery = (draft.include_arrears_recovery ?? data.include_arrears_recovery) as boolean;
  const dirty = Object.keys(draft).length > 0;

  return (
    <section className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-1">Lending check settings</h2>
      <p className="text-sm text-gray-600 mb-4">Applies to all branches. Directors only.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
      <label className="mt-4 flex items-start gap-2 text-sm text-gray-800">
        <input type="checkbox" className="mt-1" checked={includeRecovery}
          onChange={(e) => setDraft((d) => ({ ...d, include_arrears_recovery: e.target.checked }))} />
        <span>
          Count recovery of old debt
          <span className="block text-xs text-gray-500">
            Expect overdue loans back at each branch&apos;s recent recovery rate. Untick to ignore them (safer).
          </span>
        </span>
      </label>
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
  const { data: branches = [], isError: branchesFailed } = useBranchOptions();
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
  const measured = Math.round(Number(f?.measured_collection_rate ?? f?.collection_rate ?? 0) * 100);
  const recRate = Math.round(Number(f?.recovery_rate ?? 0) * 1000) / 10;
  const recMeasured = Math.round(Number(f?.measured_recovery_rate ?? 0) * 1000) / 10;
  const sharesIn = Number(f?.expected_inflows_total ?? 0) - Number(f?.expected_scheduled_total ?? 0)
    - Number(f?.expected_recovery_total ?? 0);
  const lowest = f?.days.reduce((lo, d) => (Number(d.closing) < Number(lo.closing) ? d : lo), f.days[0]);
  const outflowGroups = (f?.days ?? []).flatMap((d) => d.outflows).reduce<Record<string, { n: number; total: number }>>(
    (acc, o) => {
      const g = acc[o.type] ?? { n: 0, total: 0 };
      acc[o.type] = { n: g.n + 1, total: g.total + Number(o.amount) };
      return acc;
    }, {});
  const staleApprovals = (f?.days ?? []).flatMap((d) => d.outflows)
    .filter((o) => o.type === 'approved_loan' && (o.age_days ?? 0) > 30);
  const scheduleDue = rate > 0 ? Number(f?.expected_scheduled_total ?? 0) / (rate / 100) : 0;

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

      {branchesFailed && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">Could not load your branches. Refresh the page; if it persists, contact support.</div>}
      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">Could not load the forecast.</div>}
      {isLoading && <p className="text-gray-500">Calculating…</p>}

      {f && (() => {
        const short = f.days.find((d) => Number(d.closing) < 0);
        return short ? (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm">
            <strong>Shortfall ahead:</strong> {naira(-Number(short.closing))} short on {formatDay(short.date)}.
            Move cash in from another branch or chase collections before then.
          </div>
        ) : null;
      })()}

      {f && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-xs text-gray-500 flex items-center gap-1">Can lend today
                <InfoButton title="Can lend today">
                  <p>The lowest the balance gets over the next {f.lookahead_days} days, after adding expected money in and taking out committed payments. Lending more would leave a payment short.</p>
                  {lowest && <InfoLine label={`Lowest point (${formatDay(lowest.date)})`} value={naira(lowest.closing)} strong />}
                  {Number(f.reserve_buffer_days ?? 0) > 0 && <p className="text-gray-500">Payments must be covered {f.reserve_buffer_days} day(s) before they are due (Days to spare setting).</p>}
                </InfoButton>
              </div>
              <p className="text-xl font-semibold mt-1 text-green-700">{naira(f.available_today)}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-xs text-gray-500 flex items-center gap-1">Cash and bank now
                <InfoButton title="Cash and bank now">
                  <p>Ledger balances of this branch&apos;s bank accounts and cashier tills.</p>
                  {(f.cash_accounts ?? []).map((a) => (
                    <InfoLine key={a.account_id} label={`${a.name} (${a.code})`} value={naira(a.balance)} />
                  ))}
                  <InfoLine label="Total" value={naira(f.cash_now)} strong />
                  {(f.cash_accounts_excluded ?? []).length > 0 && (
                    <>
                      <p className="font-medium text-gray-900 pt-2">Not counted</p>
                      {(f.cash_accounts_excluded ?? []).map((a) => (
                        <InfoLine key={a.account_id} muted label={`${a.name} (${a.code}) — ${a.reason}`} value={naira(a.balance)} />
                      ))}
                    </>
                  )}
                  <p className="text-gray-500">If this differs from the bank statement or till count, the ledger needs reconciling.</p>
                </InfoButton>
              </div>
              <p className="text-xl font-semibold mt-1 text-gray-900">{naira(f.cash_now)}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-xs text-gray-500 flex items-center gap-1">Committed payments ({f.lookahead_days} days)
                <InfoButton title="Committed payments">
                  <p>Money that must leave this branch in the next {f.lookahead_days} days.</p>
                  {Object.entries(outflowGroups).map(([type, g]) => (
                    <InfoLine key={type} label={`${OUTFLOW_LABELS[type] ?? type} (${g.n})`} value={naira(g.total)} />
                  ))}
                  <InfoLine label="Total" value={naira(f.committed_outflows_total)} strong />
                  {staleApprovals.length > 0 && (
                    <p className="text-amber-700">{staleApprovals.length} approved loan(s) are over 30 days old and still hold cash back. Disburse or reject them if they are not going ahead.</p>
                  )}
                  <p className="text-gray-500">Open withdrawal requests count until completed or cancelled. Overdue items count today.</p>
                </InfoButton>
              </div>
              <p className="text-xl font-semibold mt-1 text-red-700">{naira(f.committed_outflows_total)}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-xs text-gray-500 flex items-center gap-1">Expected money in ({f.lookahead_days} days)
                <InfoButton title="Expected money in">
                  <InfoLine label="Repayments falling due" value={naira(f.expected_scheduled_total)} />
                  <InfoLine label="Recovery of old debt" value={naira(f.expected_recovery_total)} />
                  <InfoLine label="Shares from other branches" value={naira(sharesIn > 0.004 ? sharesIn : 0)} />
                  <InfoLine label="Total" value={naira(f.expected_inflows_total)} strong />
                  <p className="text-gray-500">Each part has its own ⓘ below.</p>
                </InfoButton>
              </div>
              <p className="text-xl font-semibold mt-1 text-blue-700">{naira(f.expected_inflows_total)}</p>
            </div>
          </div>

          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Where the expected money comes from</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="rounded-lg border border-gray-200 p-4">
                <div className="text-gray-500 flex items-center gap-1">Repayments falling due
                  <InfoButton title="Repayments falling due">
                    <InfoLine label={`Unpaid instalments due in ${f.lookahead_days} days`} value={naira(scheduleDue)} />
                    <InfoLine label="× collection rate used" value={`${rate}%`} />
                    <InfoLine label="Expected" value={naira(f.expected_scheduled_total)} strong />
                    <p>Collection rate: of instalments due in recent months (ignoring the last 7 days), {naira(f.collected)} of {naira(f.scheduled)} was paid = {measured}%{measured > rate ? `, capped at ${rate}%` : ''}.</p>
                    {Number(f.schedule_excess ?? 0) > 0 && (
                      <p className="text-amber-700">{naira(f.schedule_excess)} on {f.loans_with_schedule_excess} loan(s) was ignored: their schedules show more unpaid than the loan actually owes.</p>
                    )}
                  </InfoButton>
                </div>
                <p className="text-lg font-semibold text-blue-700">{naira(f.expected_scheduled_total)}</p>
                <p className="text-xs text-gray-500 mt-1">
                  Counting {rate}% of what falls due: {measured}% of instalments due in recent months were paid
                  {measured > rate ? `, capped at ${rate}% for safety` : ''}.
                </p>
              </div>
              <div className="rounded-lg border border-gray-200 p-4">
                <div className="text-gray-500 flex items-center gap-1">Recovery of old debt
                  <InfoButton title="Recovery of old debt">
                    <InfoLine label="Overdue today" value={naira(f.arrears_outstanding)} />
                    <InfoLine label="× recovery rate used" value={`${recRate}%`} />
                    <InfoLine label={`Spread over ${f.lookahead_days} days (from tomorrow)`} value={naira(f.expected_recovery_total)} strong />
                    <p>Recovery rate: of debt overdue at the start of the history period, {naira(f.recovered_in_window)} of {naira(f.arrears_at_window_start)} has been paid since = {recMeasured}%{recMeasured > recRate ? `, capped at ${recRate}%` : ''}.</p>
                    <p className="text-gray-500">Overdue amounts never exceed what each loan actually owes.</p>
                  </InfoButton>
                </div>
                <p className="text-lg font-semibold text-blue-700">{naira(f.expected_recovery_total)}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {Number(f.arrears_outstanding ?? 0) > 0
                    ? <>{naira(f.arrears_outstanding)} is overdue today. Over recent months this branch recovered
                      {' '}{recMeasured}% of its old debt ({naira(f.recovered_in_window)} of {naira(f.arrears_at_window_start)})
                      {recMeasured > recRate ? `, capped at ${recRate}%` : ''}; that pace is assumed to continue.</>
                    : 'No overdue instalments, or recovery is switched off in the settings below.'}
                </p>
              </div>
              <div className="rounded-lg border border-gray-200 p-4">
                <div className="text-gray-500 flex items-center gap-1">Shares from other branches
                  <InfoButton title="Shares from other branches">
                    <p>Only for the branch the bank debits: bank-loan shares other branches still have to send, counted on their send-by date. Late shares are not counted until they arrive.</p>
                  </InfoButton>
                </div>
                <p className="text-lg font-semibold text-blue-700">{naira(sharesIn > 0.004 ? sharesIn : 0)}</p>
                <p className="text-xs text-gray-500 mt-1">Bank-loan shares other branches still have to send this branch.</p>
              </div>
            </div>
          </section>

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
              &quot;Expected in&quot; is repayments falling due that day (at the collection rate), an even daily share of
              expected old-debt recovery, and any bank-loan shares due from other branches. The closing balance can dip
              below zero on a day with no money to cover that day&apos;s payments, which is exactly what the lending
              check protects against.
            </p>
          </section>
        </>
      )}
      {isDirector && <SettingsCard />}
    </div>
  );
};

export default BranchLiquidityPage;
