import React, { useEffect, useState } from 'react';
import { Calendar, CheckCircle, Loader2, AlertCircle, Plus } from 'lucide-react';
import { depositToSavings } from '../../../services/savingsService';
import { api } from '../../../services/api';

interface SavingsAccount { id: number; account_number: string; client_name: string; current_balance: string; product_name: string; }
interface DayEntry { date: string; amount: string }

function toISO(d: Date) { return d.toISOString().split('T')[0]; }
function fmt(v: string | number | null | undefined) {
  const n = parseFloat(String(v ?? '0'));
  return isNaN(n) ? '0.00' : n.toLocaleString('en-NG', { minimumFractionDigits: 2 });
}

export default function ThriftMultiDayPage() {
  const today = toISO(new Date());
  const [accountSearch, setAccountSearch] = useState('');
  const [accounts, setAccounts] = useState<SavingsAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<SavingsAccount | null>(null);
  const [days, setDays] = useState<DayEntry[]>([{ date: today, amount: '' }]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');


  async function searchAccounts() {
    if (!accountSearch.trim()) return;
    setLoading(true);
    try {
      const res = await api.get('/savings/accounts/', { params: { search: accountSearch, page_size: 20 } });
      const items = Array.isArray(res) ? res : (res as any).results ?? [];
      setAccounts(items);
    } catch { setError('Failed to search savings accounts.'); }
    finally { setLoading(false); }
  }

  function addDay() { setDays(prev => [...prev, { date: today, amount: '' }]); }
  function removeDay(i: number) { setDays(prev => prev.filter((_, idx) => idx !== i)); }
  function updateDay(i: number, field: keyof DayEntry, value: string) {
    setDays(prev => prev.map((d, idx) => idx === i ? { ...d, [field]: value } : d));
  }

  const total = days.reduce((s, d) => s + parseFloat(d.amount || '0'), 0);

  async function handleSubmit() {
    if (!selectedAccount) return;
    const validEntries = days
      .map((d, idx) => ({ ...d, idx }))
      .filter(d => d.date && parseFloat(d.amount) > 0);
    if (validEntries.length === 0) { setError('Add at least one day with a valid amount.'); return; }
    setSubmitting(true);
    setError('');
    const postedIndices: number[] = [];
    try {
      for (const entry of validEntries) {
        await depositToSavings(selectedAccount.id, {
          amount: entry.amount,
          description: `Savings contribution - ${entry.date}`,
          date: entry.date,
        });
        postedIndices.push(entry.idx);
      }
      setSuccess(`${validEntries.length} day(s) of contributions posted successfully. Total: ₦${fmt(total)}`);
      setDays([{ date: today, amount: '' }]);
      setSelectedAccount(null);
      setAccounts([]);
      setAccountSearch('');
    } catch (err: unknown) {
      const e = err as { detail?: string; message?: string };
      const reason = e?.detail ?? e?.message ?? 'Unknown error.';
      const failedEntry = validEntries[postedIndices.length];
      if (postedIndices.length > 0) {
        // Remove the days that already posted so retrying doesn't double-post them.
        setDays(prev => prev.filter((_, i) => !postedIndices.includes(i)));
        setError(
          `Posted ${postedIndices.length} of ${validEntries.length} day(s), then failed on ` +
          `${failedEntry.date}: ${reason}. The posted day(s) were removed from the list below — ` +
          `fix the remaining entry and try again.`
        );
      } else {
        setError(`Failed to post ${failedEntry.date}: ${reason}`);
      }
    }
    finally { setSubmitting(false); }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Receipt Multi-Day Thrift</h1>
          <p className="text-sm text-gray-500 mt-1">Post multiple days of daily contributions for a single client at once.</p>
        </div>

        {success && (
          <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm mb-4">
            <CheckCircle className="w-4 h-4 shrink-0" />{success}
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">
            <AlertCircle className="w-4 h-4 shrink-0" />{error}
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 mb-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Step 1 — Select Client Account</h2>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={accountSearch}
              onChange={e => setAccountSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && searchAccounts()}
              placeholder="Search by client name or account number…"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={searchAccounts}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
            </button>
          </div>
          {accounts.length > 0 && (
            <div className="border border-gray-200 rounded-lg overflow-hidden mb-3">
              {accounts.map(acc => (
                <button
                  key={acc.id}
                  onClick={() => { setSelectedAccount(acc); setAccounts([]); }}
                  className={`w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-blue-50 border-b last:border-0 ${
                    selectedAccount?.id === acc.id ? 'bg-blue-50' : ''
                  }`}
                >
                  <span className="font-medium">{acc.client_name}</span>
                  <span className="text-gray-500 font-mono">{acc.account_number}</span>
                </button>
              ))}
            </div>
          )}
          {selectedAccount && (
            <div className="p-3 bg-blue-50 rounded-lg text-sm">
              <p className="font-semibold text-blue-900">{selectedAccount.client_name}</p>
              <p className="text-blue-700 font-mono">{selectedAccount.account_number}</p>
              <p className="text-blue-600">Balance: ₦{fmt(selectedAccount.current_balance)}</p>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">Step 2 — Enter Days & Amounts</h2>
            <button
              onClick={addDay}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
            >
              <Plus className="w-3.5 h-3.5" /> Add Day
            </button>
          </div>
          <div className="space-y-2">
            {days.map((d, i) => (
              <div key={i} className="flex gap-2 items-center">
                <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
                <input
                  type="date"
                  value={d.date}
                  onChange={e => updateDay(i, 'date', e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
                <input
                  type="number"
                  value={d.amount}
                  onChange={e => updateDay(i, 'amount', e.target.value)}
                  placeholder="Amount (₦)"
                  className="w-36 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  min="0" step="0.01"
                />
                {days.length > 1 && (
                  <button onClick={() => removeDay(i)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                )}
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between text-sm">
            <span className="text-gray-600">{days.filter(d => parseFloat(d.amount) > 0).length} day(s) to post</span>
            <span className="font-semibold text-gray-900">Total: ₦{fmt(total)}</span>
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={!selectedAccount || submitting || total <= 0}
          className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
          Post {days.filter(d => parseFloat(d.amount) > 0).length} Day(s) — ₦{fmt(total)}
        </button>
      </div>
    </div>
  );
}
