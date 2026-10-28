import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PiggyBank, Plus, Search } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { SmartSavingsControl } from '../../components/savings/SmartSavingsControl';
import { PayoutDeadlineBadge } from '../../components/savings/PayoutDeadlineBadge';
import { useSavingsAccounts, useSmartSavers } from '../../hooks/useSavings';
import type { SavingsAccount, SavingsAccountsPage } from '../../services/savingsService';

const naira = (v: string | number | null | undefined) =>
  `₦${Number(v ?? 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (iso: string | null | undefined) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

type Tab = 'active' | 'matured' | 'inactive' | 'all';
const TABS: { id: Tab; label: string }[] = [
  { id: 'active', label: 'Active' },
  { id: 'matured', label: 'Matured' },
  { id: 'inactive', label: 'Switched off' },
  { id: 'all', label: 'All' },
];

const SmartSavingsPage: React.FC = () => {
  const [tab, setTab] = useState<Tab>('active');
  const [search, setSearch] = useState('');
  const [enrolOpen, setEnrolOpen] = useState(false);
  const [enrolSearch, setEnrolSearch] = useState('');
  const [picked, setPicked] = useState<SavingsAccount | null>(null);

  const { data, isLoading, error } = useSmartSavers({
    cycle_state: tab === 'all' ? undefined : tab,
    search: search.trim() || undefined,
  });
  // Unfiltered snapshot for the summary cards.
  const { data: all } = useSmartSavers();
  const rows = data?.results ?? [];
  const allRows = all?.results ?? [];

  const stats = useMemo(() => {
    const active = allRows.filter((r) => r.is_active);
    return {
      active: active.length,
      maturingSoon: active.filter((r) => !r.matured && r.days_to_maturity <= 14).length,
      matured: active.filter((r) => r.matured).length,
      openRequests: allRows.reduce((n, r) => n + r.open_withdrawals, 0),
    };
  }, [allRows]);

  // Accounts that can be enrolled: active savings accounts that are not already in an active cycle.
  const candidates = useSavingsAccounts(
    { search: enrolSearch.trim(), status: 'active', page_size: 15 },
    { enabled: enrolOpen && enrolSearch.trim().length >= 2 }
  );
  const candidateRows = useMemo(() => {
    const d = candidates.data as SavingsAccountsPage | SavingsAccount[] | undefined;
    const list = Array.isArray(d) ? d : d?.results ?? [];
    return list.filter((a) => !a.smart_savings_active);
  }, [candidates.data]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <PiggyBank className="w-8 h-8 text-emerald-600" /> Smart Savings
          </h1>
          <p className="text-gray-600 mt-1 max-w-2xl">
            {data?.cycle_months ?? 3}-month cycle with {Number(data?.interest_rate_pct ?? 6)}% interest on the opening
            balance at maturity. Early withdrawal may cost a penalty. Payouts need notice.
          </p>
        </div>
        <button type="button" onClick={() => setEnrolOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white">
          <Plus className="w-4 h-4" /> Enrol an account
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          ['Active savers', stats.active, 'text-gray-900'],
          ['Maturing in 14 days', stats.maturingSoon, 'text-amber-700'],
          ['Matured, interest due', stats.matured, 'text-blue-700'],
          ['Open withdrawal requests', stats.openRequests, 'text-red-700'],
        ].map(([label, value, color]) => (
          <div key={label as string} className="bg-white rounded-lg shadow p-4">
            <p className="text-xs text-gray-500">{label}</p>
            <p className={`text-2xl font-semibold mt-1 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {TABS.map((t) => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded-md text-sm ${tab === t.id ? 'bg-white shadow font-medium' : 'text-gray-600'}`}>
              {t.label}
            </button>
          ))}
        </div>
        <label className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or account no."
            className="pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm w-72" />
        </label>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">Could not load Smart Savers.</div>}

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3 text-right">Balance</th>
              <th className="px-4 py-3">Cycle</th>
              <th className="px-4 py-3 text-right">Interest at maturity</th>
              <th className="px-4 py-3">Early-break penalty</th>
              <th className="px-4 py-3">Withdrawal request</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-500">Loading…</td></tr>}
            {!isLoading && rows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                {tab === 'active' ? 'No active Smart Savers yet. Use "Enrol an account" to add one.' : 'Nothing here.'}
              </td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-t align-top hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Link to={`/savings/accounts/${r.id}`} className="font-medium text-blue-700 hover:underline">{r.client_name}</Link>
                  <div className="text-xs text-gray-500">{r.account_number}{r.branch_name ? ` · ${r.branch_name}` : ''}</div>
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">{naira(r.balance)}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {r.is_active ? (
                    <>
                      <div>{day(r.start_date)} → {day(r.maturity_date)}</div>
                      <div className={`text-xs ${r.matured ? 'text-blue-700 font-medium' : r.days_to_maturity <= 14 ? 'text-amber-700' : 'text-gray-500'}`}>
                        {r.matured ? 'Matured — interest due' : `${r.days_to_maturity} day${r.days_to_maturity === 1 ? '' : 's'} left`}
                      </div>
                    </>
                  ) : <span className="text-gray-500">Switched off</span>}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">{r.is_active ? naira(r.expected_interest) : '—'}</td>
                <td className="px-4 py-3">
                  {r.penalty_rate ? `${Number(r.penalty_rate)}% of balance`
                    : <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5" title="The savings product has no early-withdrawal penalty set up">None set</span>}
                </td>
                <td className="px-4 py-3">
                  {r.open_withdrawals > 0 ? (
                    <>
                      <div>{naira(r.open_withdrawal_amount)}{r.open_withdrawals > 1 ? ` (${r.open_withdrawals})` : ''}</div>
                      <PayoutDeadlineBadge dueDate={r.earliest_payout_due} status="pending" />
                    </>
                  ) : '—'}
                </td>
                <td className="px-4 py-3 text-right">
                  <SmartSavingsControl compact accountId={r.id} accountNumber={r.account_number} clientName={r.client_name}
                    balance={r.balance} active={r.is_active} wasEnrolled matured={r.matured} penaltyRate={r.penalty_rate} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={enrolOpen} onClose={() => { setEnrolOpen(false); setEnrolSearch(''); }} title="Enrol an account in Smart Savings">
        <div className="space-y-3 text-sm">
          <label className="relative block">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
            <input autoFocus value={enrolSearch} onChange={(e) => setEnrolSearch(e.target.value)}
              placeholder="Type a client name or account number (2+ letters)"
              className="pl-9 pr-3 py-2 border border-gray-300 rounded-lg w-full" />
          </label>
          {enrolSearch.trim().length >= 2 && (
            <ul className="divide-y border rounded-lg max-h-72 overflow-y-auto">
              {candidates.isLoading && <li className="p-3 text-gray-500">Searching…</li>}
              {!candidates.isLoading && candidateRows.length === 0 && (
                <li className="p-3 text-gray-500">No matching active accounts that are not already enrolled.</li>
              )}
              {candidateRows.map((a) => (
                <li key={a.id}>
                  <button type="button" className="w-full text-left p-3 hover:bg-gray-50 flex justify-between gap-3"
                    onClick={() => { setPicked(a); setEnrolOpen(false); setEnrolSearch(''); }}>
                    <span>
                      <span className="font-medium text-gray-900">{a.client_name}</span>
                      <span className="block text-xs text-gray-500">{a.account_number} · {a.product_name}</span>
                    </span>
                    <span className="text-gray-700 whitespace-nowrap">{naira(a.current_balance)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>

      {picked && (
        <SmartSavingsControl key={picked.id} autoOpen onClosed={() => setPicked(null)}
          accountId={picked.id} accountNumber={picked.account_number} clientName={picked.client_name}
          balance={picked.current_balance} active={false} />
      )}
    </div>
  );
};

export default SmartSavingsPage;
