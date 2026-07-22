/**
 * Savings Deposit Page
 * Flexible deposit recording for any savings account type.
 * Flow: search client → pick account → enter amount → submit.
 */

import React, { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PiggyBank, Loader2, AlertCircle, CheckCircle,
  ArrowLeft, ChevronDown, X, Search,
} from 'lucide-react';
import { useSavingsAccounts, useDepositToSavings } from '../../hooks/useSavings';
import type { SavingsAccount } from '../../services/savingsService';
import { clientService, ClientOption } from '../../services/clientService';
import { useEffect } from 'react';
import { accountService } from '../../services/accountService';

interface CashierAccount { id: number; name: string; code: string; }

function fmt(v: string | number | null | undefined) {
  const n = parseFloat(String(v ?? '0'));
  return isNaN(n) ? '0.00' : n.toLocaleString('en-NG', { minimumFractionDigits: 2 });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

const CYCLE_BADGE: Record<string, string> = {
  daily:   'bg-blue-100 text-blue-700',
  weekly:  'bg-purple-100 text-purple-700',
  monthly: 'bg-teal-100 text-teal-700',
};

export default function SavingsDepositPage() {
  const navigate = useNavigate();

  // ── Client combobox ────────────────────────────────────────────────────
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [clientId, setClientId] = useState<number | null>(null);
  const [clientQuery, setClientQuery] = useState('');
  const [showClientDrop, setShowClientDrop] = useState(false);
  const clientBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoadingClients(true);
    clientService.getClientOptions({ status: 'active' })
      .then(setClients)
      .catch(() => setClients([]))
      .finally(() => setLoadingClients(false));
  }, []);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (clientBoxRef.current && !clientBoxRef.current.contains(e.target as Node))
        setShowClientDrop(false);
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  const filteredClients = useMemo(() => {
    const q = clientQuery.toLowerCase().trim();
    if (!q) return clients;
    return clients.filter(c =>
      c.name.toLowerCase().includes(q) || c.client_id.toLowerCase().includes(q)
    );
  }, [clients, clientQuery]);

  const selectedClient = clients.find(c => c.id === clientId) ?? null;

  // ── Savings accounts for selected client ──────────────────────────────
  const [accounts, setAccounts] = useState<SavingsAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<SavingsAccount | null>(null);

  useEffect(() => {
    if (!clientId) { setAccounts([]); setSelectedAccount(null); return; }
    setLoadingAccounts(true);
    setSelectedAccount(null);
    accountService.getAccounts({ client: clientId, status: 'active', page_size: 50 })
      .then(res => {
        const list = Array.isArray(res) ? res : (res as { results: SavingsAccount[] }).results ?? [];
        setAccounts(list);
      })
      .catch(() => setAccounts([]))
      .finally(() => setLoadingAccounts(false));
  }, [clientId]);

  // ── Cashier accounts ───────────────────────────────────────────────────
  const [cashierAccounts, setCashierAccounts] = useState<CashierAccount[]>([]);
  useEffect(() => {
    accountService.getAccounts({ account_type: 'ASSET' })
      .then(list => setCashierAccounts(
        list.map(a => ({ id: Number(a.id), name: a.name, code: a.code }))
      ))
      .catch(() => {});
  }, []);

  // ── Deposit form ───────────────────────────────────────────────────────
  const [amount, setAmount] = useState('');
  const [depositDate, setDepositDate] = useState(today());
  const [cashierAccountId, setCashierAccountId] = useState<number | ''>('');
  const [description, setDescription] = useState('');

  // Pre-fill amount from the account's contribution_amount when account selected
  useEffect(() => {
    if (selectedAccount?.contribution_amount) {
      setAmount(selectedAccount.contribution_amount);
    } else {
      setAmount('');
    }
  }, [selectedAccount]);

  // ── Submission ─────────────────────────────────────────────────────────
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const depositMutation = useDepositToSavings({
    onSuccess: (result) => {
      setSuccess(
        `₦${fmt(result.amount)} deposited to ${selectedAccount?.account_number}. ` +
        `New balance: ₦${fmt(result.balance_after)}.`
      );
      setAmount('');
      setDescription('');
    },
    onError: (e) => {
      setError(e?.detail ?? e?.message ?? 'Deposit failed. Please try again.');
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!selectedAccount) { setError('Please select a savings account.'); return; }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) { setError('Enter a valid amount greater than zero.'); return; }

    depositMutation.mutate({
      accountId: selectedAccount.id,
      data: {
        amount,
        date: depositDate,
        cashier_account_id: cashierAccountId || undefined,
        description: description.trim() || `Savings deposit – ${selectedAccount.account_number}`,
      },
    });
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <div className="w-px h-5 bg-gray-200" />
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-teal-100 flex items-center justify-center">
              <PiggyBank className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Record Savings Deposit</h1>
              <p className="text-xs text-gray-500">Works with all savings product types</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-6 space-y-5">

        {/* Alerts */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
        {success && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-green-700">{success}</p>
          </div>
        )}

        {/* Step 1 — Client */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <Search className="w-4 h-4 text-teal-500" /> Step 1 — Find Client
          </h2>
          <div ref={clientBoxRef} className="relative">
            <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-teal-400">
              <input
                type="text"
                value={showClientDrop ? clientQuery : (selectedClient ? `${selectedClient.name} (${selectedClient.client_id})` : '')}
                onChange={e => { setClientQuery(e.target.value); setClientId(null); }}
                onFocus={() => { setClientQuery(''); setShowClientDrop(true); }}
                placeholder={loadingClients ? 'Loading clients…' : 'Search by name or client ID…'}
                className="flex-1 px-3 py-2 text-sm outline-none bg-white"
                autoComplete="off"
              />
              {loadingClients && <Loader2 className="w-4 h-4 animate-spin text-gray-400 mr-2" />}
              {selectedClient && !showClientDrop ? (
                <button
                  type="button"
                  aria-label="Clear client"
                  onClick={() => { setClientId(null); setClientQuery(''); setAccounts([]); setSelectedAccount(null); }}
                  className="p-2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-400 mr-2" />
              )}
            </div>
            {showClientDrop && (
              <div className="absolute z-50 left-0 right-0 mt-1 max-h-60 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                {filteredClients.length === 0
                  ? <div className="px-3 py-2 text-sm text-gray-500">No clients found</div>
                  : filteredClients.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onMouseDown={() => {
                        setClientId(c.id);
                        setClientQuery('');
                        setShowClientDrop(false);
                        setSuccess(null);
                        setError(null);
                      }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-teal-50 border-b border-gray-100 last:border-b-0 ${c.id === clientId ? 'bg-teal-50 font-medium' : ''}`}
                    >
                      <span className="text-gray-900">{c.name}</span>
                      <span className="ml-1.5 text-xs text-gray-400">({c.client_id})</span>
                    </button>
                  ))
                }
              </div>
            )}
          </div>
        </div>

        {/* Step 2 — Pick account */}
        {clientId && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-3">
              Step 2 — Select Savings Account
            </h2>
            {loadingAccounts ? (
              <div className="flex items-center gap-2 py-4 text-sm text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading accounts…
              </div>
            ) : accounts.length === 0 ? (
              <p className="text-sm text-gray-500 py-2">
                No active savings accounts found for this client.
              </p>
            ) : (
              <div className="grid gap-2">
                {accounts.map(acc => (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => { setSelectedAccount(acc); setSuccess(null); setError(null); }}
                    className={`w-full text-left rounded-lg border p-3 transition-colors ${
                      selectedAccount?.id === acc.id
                        ? 'border-teal-500 bg-teal-50'
                        : 'border-gray-200 hover:border-teal-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-gray-900 font-mono">
                          {acc.account_number}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">{acc.product_name}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-gray-900">₦{fmt(acc.current_balance)}</p>
                        <div className="flex items-center gap-1.5 justify-end mt-0.5">
                          {acc.contribution_cycle && (
                            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${CYCLE_BADGE[acc.contribution_cycle] ?? 'bg-gray-100 text-gray-600'}`}>
                              {acc.contribution_cycle}
                            </span>
                          )}
                          {acc.contribution_amount && (
                            <span className="text-xs text-gray-400">
                              ₦{fmt(acc.contribution_amount)}/cycle
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 3 — Deposit form */}
        {selectedAccount && (
          <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-800">
              Step 3 — Deposit Details
            </h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Amount (₦) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  required
                  min="0.01"
                  step="0.01"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={depositDate}
                  onChange={e => setDepositDate(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Cashier / Cash Account
              </label>
              {cashierAccounts.length === 0 ? (
                <p className="text-xs text-gray-400">No cashier accounts loaded.</p>
              ) : (
                <select
                  value={cashierAccountId}
                  onChange={e => setCashierAccountId(e.target.value ? parseInt(e.target.value) : '')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                >
                  <option value="">— Auto-resolve (default cashier) —</option>
                  {cashierAccounts.map(a => (
                    <option key={a.id} value={a.id}>{a.code} – {a.name}</option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder={`Savings deposit – ${selectedAccount.account_number}`}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
              />
            </div>

            <div className="flex items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={depositMutation.isPending}
                className="flex items-center gap-2 bg-teal-600 text-white rounded-lg px-5 py-2.5 text-sm font-medium hover:bg-teal-700 transition-colors disabled:opacity-50"
              >
                {depositMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <PiggyBank className="w-4 h-4" />}
                Record Deposit
              </button>
              <button
                type="button"
                onClick={() => setSelectedAccount(null)}
                className="text-sm text-gray-500 border border-gray-300 rounded-lg px-4 py-2.5 hover:bg-gray-50 transition-colors"
              >
                Change Account
              </button>
            </div>
          </form>
        )}

      </div>
    </div>
  );
}
