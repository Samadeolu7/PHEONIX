/**
 * New Savings Account Page
 * Creates a new savings account for a client linked to a savings product.
 * The backend auto-generates the account number and creates the linked GL account.
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PiggyBank, Loader2, AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react';
import {
  createSavingsAccount,
  CreateSavingsAccountData,
} from '../../services/savingsService';
import { clientService, Client } from '../../services/clientService';

// Product type from Products API (minimal shape needed for the dropdown)
interface SavingsProductOption {
  id: number;
  name: string;
  contribution_cycle?: string;
}

const INTEREST_METHODS = [
  { value: 'daily', label: 'Daily' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annually', label: 'Annually' },
];

const STATEMENT_FREQS = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annually', label: 'Annually' },
  { value: 'on_demand', label: 'On Demand' },
];

const WEEKDAYS = [
  { value: 0, label: 'Monday' },
  { value: 1, label: 'Tuesday' },
  { value: 2, label: 'Wednesday' },
  { value: 3, label: 'Thursday' },
  { value: 4, label: 'Friday' },
  { value: 5, label: 'Saturday' },
  { value: 6, label: 'Sunday' },
];

export default function SavingsAccountFormPage() {
  const navigate = useNavigate();

  const [clientId, setClientId] = useState('');
  const [clients, setClients] = useState<Client[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [productId, setProductId] = useState('');
  const [products, setProducts] = useState<SavingsProductOption[]>([]);
  const [nickname, setNickname] = useState('');
  const [openedOn, setOpenedOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [interestRate, setInterestRate] = useState('0.00');
  const [interestMethod, setInterestMethod] = useState('monthly');
  const [minimumBalance, setMinimumBalance] = useState('0.00');
  const [allowOverdraft, setAllowOverdraft] = useState(false);
  const [overdraftLimit, setOverdraftLimit] = useState('0.00');
  const [autoRenew, setAutoRenew] = useState(true);
  const [statementFreq, setStatementFreq] = useState('monthly');
  const [contribDay, setContribDay] = useState<number | ''>('');

  const [selectedProduct, setSelectedProduct] = useState<SavingsProductOption | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Load savings products
  useEffect(() => {
    import('../../services/api').then(({ default: api }) => {
      api.get('/products/', { params: { product_type: 'SAVINGS' } })
        .then((data: unknown) => {
          const items = Array.isArray(data) ? data : (data as { results?: SavingsProductOption[] })?.results ?? [];
          setProducts(items as SavingsProductOption[]);
        })
        .catch(() => {/* products list may not be needed if admin manages them */});
    });
  }, []);

  // Load active clients for name-first selection
  useEffect(() => {
    setLoadingClients(true);
    clientService.getClients({ status: 'active' })
      .then((response: unknown) => {
        const data = response as { results?: Client[]; data?: Client[] } | Client[];
        const list = Array.isArray(data)
          ? data
          : (Array.isArray(data?.results) ? data.results : (Array.isArray(data?.data) ? data.data : []));
        setClients(list);
      })
      .catch(() => {
        // Keep fallback numeric input available when clients fail to load
        setClients([]);
      })
      .finally(() => setLoadingClients(false));
  }, []);

  function handleProductChange(id: string) {
    setProductId(id);
    const p = products.find(x => String(x.id) === id) ?? null;
    setSelectedProduct(p);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const cId = parseInt(clientId);
    const pId = parseInt(productId);
    if (!cId || isNaN(cId)) { setError('Please select a valid client.'); return; }
    if (!pId || isNaN(pId)) { setError('Please select a savings product.'); return; }

    const payload: CreateSavingsAccountData = {
      client: cId,
      product: pId,
      nickname: nickname.trim() || undefined,
      opened_on: openedOn,
      interest_rate: interestRate,
      interest_calculation_method: interestMethod,
      minimum_balance: minimumBalance,
      allow_overdraft: allowOverdraft,
      overdraft_limit: overdraftLimit,
      auto_renew: autoRenew,
      statement_frequency: statementFreq,
      contribution_day_of_week:
        selectedProduct?.contribution_cycle === 'weekly' && contribDay !== ''
          ? Number(contribDay)
          : null,
    };

    setSubmitting(true);
    try {
      await createSavingsAccount(payload);
      setSuccess(true);
      setTimeout(() => navigate('/savings/accounts'), 1500);
    } catch (e: unknown) {
      const err = e as { detail?: string; message?: string; non_field_errors?: string[] };
      const msg = err?.detail ?? (err?.non_field_errors ?? []).join(', ') ?? err?.message ?? 'Failed to create savings account.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-xl border border-green-200 p-10 text-center max-w-sm">
          <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-3" />
          <p className="text-lg font-bold text-gray-900">Account Created!</p>
          <p className="text-sm text-gray-500 mt-1">Redirecting to savings accounts…</p>
        </div>
      </div>
    );
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
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <div className="w-px h-5 bg-gray-200" />
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-teal-100 flex items-center justify-center">
              <PiggyBank className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">New Savings Account</h1>
              <p className="text-xs text-gray-500">Open a new savings account for a client</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-6">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3 mb-5">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Client & Product */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-4">Account Details</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Client <span className="text-red-500">*</span>
                </label>
                {loadingClients ? (
                  <div className="flex items-center gap-2 py-2 text-sm text-gray-500">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading clients…
                  </div>
                ) : clients.length > 0 ? (
                  <select
                    required
                    value={clientId}
                    onChange={e => setClientId(e.target.value)}
                    aria-label="Client"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  >
                    <option value="">— Select client —</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.full_name} ({c.client_id})
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="number"
                    required
                    min="1"
                    value={clientId}
                    onChange={e => setClientId(e.target.value)}
                    placeholder="Enter client"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                )}
                <p className="text-xs text-gray-400 mt-1">Select by client name (ID shown in brackets)</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Savings Product <span className="text-red-500">*</span>
                </label>
                {products.length > 0 ? (
                  <select
                    required
                    value={productId}
                    onChange={e => handleProductChange(e.target.value)}
                    aria-label="Savings product"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  >
                    <option value="">— Select product —</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="number"
                    required
                    min="1"
                    value={productId}
                    onChange={e => { setProductId(e.target.value); setSelectedProduct(null); }}
                    placeholder="Product ID"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nickname (optional)</label>
                <input
                  type="text"
                  value={nickname}
                  onChange={e => setNickname(e.target.value)}
                  placeholder="e.g. Emergency Fund"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Opening Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={openedOn}
                  onChange={e => setOpenedOn(e.target.value)}
                  title="Account opening date"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                />
              </div>
            </div>

            {/* Weekly contribution day - only show if product cycle is weekly */}
            {selectedProduct?.contribution_cycle === 'weekly' && (
              <div className="mt-4">
                <label className="block text-xs font-medium text-gray-600 mb-1">Weekly Contribution Day</label>
                <select
                  value={contribDay}
                  onChange={e => setContribDay(e.target.value === '' ? '' : Number(e.target.value))}
                  aria-label="Weekly contribution day"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                >
                  <option value="">— Select day —</option>
                  {WEEKDAYS.map(d => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Financial Terms */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-4">Financial Terms</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Interest Rate (%)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={interestRate}
                  onChange={e => setInterestRate(e.target.value)}
                  title="Interest rate percentage"
                  placeholder="0.00"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Interest Calculation</label>
                <select
                  value={interestMethod}
                  onChange={e => setInterestMethod(e.target.value)}
                  aria-label="Interest calculation method"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                >
                  {INTEREST_METHODS.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Minimum Balance (₦)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={minimumBalance}
                  onChange={e => setMinimumBalance(e.target.value)}
                  title="Minimum balance in naira"
                  placeholder="0.00"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Statement Frequency</label>
                <select
                  value={statementFreq}
                  onChange={e => setStatementFreq(e.target.value)}
                  aria-label="Statement frequency"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                >
                  {STATEMENT_FREQS.map(f => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-6 mt-4">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowOverdraft}
                  onChange={e => setAllowOverdraft(e.target.checked)}
                  className="rounded border-gray-300"
                />
                Allow Overdraft
              </label>
              {allowOverdraft && (
                <div className="flex-1">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={overdraftLimit}
                    onChange={e => setOverdraftLimit(e.target.value)}
                    title="Overdraft limit in naira"
                    placeholder="Overdraft limit (₦)"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                </div>
              )}
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoRenew}
                  onChange={e => setAutoRenew(e.target.checked)}
                  className="rounded border-gray-300"
                />
                Auto-renew
              </label>
            </div>
          </div>

          {/* Submit */}
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 bg-teal-600 text-white rounded-lg px-5 py-2.5 text-sm font-medium hover:bg-teal-700 transition-colors disabled:opacity-50"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <PiggyBank className="w-4 h-4" />}
              Open Savings Account
            </button>
            <button
              type="button"
              onClick={() => navigate('/savings/accounts')}
              className="text-sm text-gray-500 border border-gray-300 rounded-lg px-5 py-2.5 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
