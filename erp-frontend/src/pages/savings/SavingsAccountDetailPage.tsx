/**
 * Savings Account Detail Page
 * Shows account summary, transaction ledger, deposit/withdraw actions, and contribution schedule.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Loader2,
  RefreshCw,
  X,
  ArrowDownCircle,
  ArrowUpCircle,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  getSavingsAccount,
  getAccountSchedule,
  getSavingsTransactions,
  initiateWithdrawal,
  SavingsAccount,
  ContributionScheduleItem,
  SavingsTransactionRow,
} from '../../services/savingsService';
import api from '../../services/api';
import { BankAccount } from '../../types/banks';
import { bankService } from '../../services/bankService';

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(amount: string | number | null | undefined): string {
  const n = parseFloat(String(amount ?? '0'));
  return isNaN(n)
    ? '0.00'
    : n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-NG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  dormant: 'bg-yellow-100 text-yellow-700',
  frozen: 'bg-blue-100 text-blue-700',
  closed: 'bg-gray-100 text-gray-600',
};

const CONTRIB_STATUS_BADGE: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  paid: 'bg-green-100 text-green-700',
  missed: 'bg-red-100 text-red-700',
};

// ── Deposit Modal ──────────────────────────────────────────────────────────

interface DepositModalProps {
  account: SavingsAccount;
  onClose: () => void;
  onSuccess: () => void;
}

function DepositModal({ account, onClose, onSuccess }: DepositModalProps) {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank'>('cash');
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [selectedBankAccount, setSelectedBankAccount] = useState<number | ''>('');

  useEffect(() => {
    bankService.listBankAccounts({ is_active: true }).then(setBankAccounts);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      setError('Please enter a valid amount.');
      return;
    }
    if (paymentMethod === 'bank' && !selectedBankAccount) {
      setError('Please select a destination bank account.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.post(`/savings/accounts/${account.id}/deposit/`, {
        amount,
        description: description || 'Deposit',
        payment_date: paymentDate,
        payment_method: paymentMethod,
        ...(paymentMethod === 'bank' ? { bank_account_id: selectedBankAccount } : {}),
      });
      setSuccess(true);
      setTimeout(onSuccess, 1200);
    } catch (e: unknown) {
      const err = e as { detail?: string; message?: string };
      setError(err?.detail ?? err?.message ?? 'Deposit failed.');
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1 text-gray-400 hover:bg-gray-100"
        >
          <X size={18} />
        </button>
        <h2 className="mb-1 text-lg font-semibold text-gray-900">Deposit</h2>
        <p className="mb-4 text-sm text-gray-500">
          {account.account_number} — {account.client_name}
        </p>

        {success ? (
          <div className="flex flex-col items-center py-6 text-center">
            <CheckCircle size={40} className="mb-2 text-green-500" />
            <p className="font-medium text-gray-900">Deposit recorded</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Amount (₦)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                placeholder="0.00"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Payment Date</label>
              <input
                type="date"
                value={paymentDate}
                onChange={e => setPaymentDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Payment Method</label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('cash')}
                  className={`flex-1 rounded-lg border-2 py-2 text-sm font-medium transition-colors ${
                    paymentMethod === 'cash'
                      ? 'border-green-500 bg-green-50 text-green-700'
                      : 'border-gray-200 text-gray-500 hover:border-green-300'
                  }`}
                >
                  💵 Cash
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('bank')}
                  className={`flex-1 rounded-lg border-2 py-2 text-sm font-medium transition-colors ${
                    paymentMethod === 'bank'
                      ? 'border-green-500 bg-green-50 text-green-700'
                      : 'border-gray-200 text-gray-500 hover:border-green-300'
                  }`}
                >
                  🏦 Bank
                </button>
              </div>
            </div>
            {paymentMethod === 'bank' && (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Destination Bank Account
                </label>

                <select
                  aria-label="Destination Bank Account"
                  title="Destination Bank Account"
                  value={selectedBankAccount}
                  onChange={e =>
                    setSelectedBankAccount(e.target.value ? Number(e.target.value) : '')
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  required
                >
                  <option value="">Select bank account</option>

                  {bankAccounts.map(account => (
                    <option key={account.id} value={account.id}>
                      {account.bank_name}
                      {' — '}
                      {account.account_number}
                      {' ('}
                      {account.account_name}
                      {')'}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                placeholder="Deposit"
              />
            </div>
            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle size={14} /> {error}
              </div>
            )}
            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {submitting ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <ArrowDownCircle size={14} />
                )}
                Post Deposit
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Withdraw Modal ─────────────────────────────────────────────────────────

interface WithdrawModalProps {
  account: SavingsAccount;
  onClose: () => void;
  onSuccess: () => void;
}

function WithdrawModal({ account, onClose, onSuccess }: WithdrawModalProps) {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      setError('Please enter a valid amount.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await initiateWithdrawal({
        savings_account: account.id,
        amount,
        description: description || 'Withdrawal',
      });
      setSuccess(true);
      setTimeout(onSuccess, 1200);
    } catch (e: unknown) {
      const err = e as { detail?: string; message?: string };
      setError(err?.detail ?? err?.message ?? 'Withdrawal request failed.');
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1 text-gray-400 hover:bg-gray-100"
        >
          <X size={18} />
        </button>
        <h2 className="mb-1 text-lg font-semibold text-gray-900">Withdraw</h2>
        <p className="mb-2 text-sm text-gray-500">
          {account.account_number} — {account.client_name}
        </p>
        <p className="mb-4 text-sm text-gray-500">
          Available: <strong className="text-gray-900">₦{fmt(account.available_balance)}</strong>
        </p>

        {success ? (
          <div className="flex flex-col items-center py-6 text-center">
            <CheckCircle size={40} className="mb-2 text-green-500" />
            <p className="font-medium text-gray-900">Withdrawal request submitted</p>
            <p className="mt-1 text-sm text-gray-500">Pending approval</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Amount (₦)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={account.available_balance}
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                placeholder="0.00"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Reason</label>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                placeholder="Withdrawal reason"
              />
            </div>
            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle size={14} /> {error}
              </div>
            )}
            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
              >
                {submitting ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <ArrowUpCircle size={14} />
                )}
                Submit Request
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function SavingsAccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const accountId = parseInt(id ?? '0', 10);

  const [account, setAccount] = useState<SavingsAccount | null>(null);
  const [transactions, setTransactions] = useState<SavingsTransactionRow[]>([]);
  const [txTotal, setTxTotal] = useState(0);
  const [txPage, setTxPage] = useState(1);
  const TX_PAGE_SIZE = 25;

  const today = new Date();
  const [scheduleYear, setScheduleYear] = useState(today.getFullYear());
  const [scheduleMonth, setScheduleMonth] = useState(today.getMonth() + 1);
  const [schedule, setSchedule] = useState<ContributionScheduleItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [txLoading, setTxLoading] = useState(false);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeposit, setShowDeposit] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);

  const loadAccount = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    setError(null);
    try {
      const acc = await getSavingsAccount(accountId);
      setAccount(acc);
    } catch (e: unknown) {
      const err = e as { detail?: string; message?: string };
      setError(err?.detail ?? err?.message ?? 'Failed to load savings account.');
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  const loadTransactions = useCallback(async () => {
    if (!accountId) return;
    setTxLoading(true);
    try {
      const res = await getSavingsTransactions(accountId, txPage, TX_PAGE_SIZE);
      setTransactions(res.results);
      setTxTotal(res.count);
    } catch {
      // non-fatal
    } finally {
      setTxLoading(false);
    }
  }, [accountId, txPage]);

  const loadSchedule = useCallback(async () => {
    if (!accountId) return;
    setScheduleLoading(true);
    try {
      const res = await getAccountSchedule(accountId, scheduleYear, scheduleMonth);
      setSchedule(Array.isArray(res) ? res : []);
    } catch {
      setSchedule([]);
    } finally {
      setScheduleLoading(false);
    }
  }, [accountId, scheduleYear, scheduleMonth]);

  useEffect(() => {
    loadAccount();
  }, [loadAccount]);
  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);
  useEffect(() => {
    loadSchedule();
  }, [loadSchedule]);

  const txTotalPages = Math.max(1, Math.ceil(txTotal / TX_PAGE_SIZE));

  const MONTHS = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Loader2 size={32} className="animate-spin text-blue-600" />
      </div>
    );
  }

  if (error || !account) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="flex items-center gap-2 rounded-lg bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle size={16} />
          {error ?? 'Account not found.'}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {showDeposit && (
        <DepositModal
          account={account}
          onClose={() => setShowDeposit(false)}
          onSuccess={() => {
            setShowDeposit(false);
            loadAccount();
            loadTransactions();
          }}
        />
      )}
      {showWithdraw && (
        <WithdrawModal
          account={account}
          onClose={() => setShowWithdraw(false)}
          onSuccess={() => {
            setShowWithdraw(false);
            loadAccount();
            loadTransactions();
          }}
        />
      )}

      {/* Header */}
      <div className="border-b bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-gray-900">{account.account_number}</h1>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_BADGE[account.status] ?? 'bg-gray-100 text-gray-600'}`}
                >
                  {account.status}
                </span>
              </div>
              <p className="text-sm text-gray-500">
                {account.client_name} — {account.product_name}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                loadAccount();
                loadTransactions();
              }}
              className="rounded-lg border border-gray-300 p-2 text-gray-500 hover:bg-gray-50"
              title="Refresh"
            >
              <RefreshCw size={16} />
            </button>
            {account.status === 'active' && (
              <>
                <button
                  onClick={() => setShowDeposit(true)}
                  className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
                >
                  <ArrowDownCircle size={14} />
                  Deposit
                </button>
                <button
                  onClick={() => setShowWithdraw(true)}
                  className="flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
                >
                  <ArrowUpCircle size={14} />
                  Withdraw
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl space-y-6 p-6">
        {/* Summary Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              label: 'Current Balance',
              value: `₦${fmt(account.current_balance)}`,
              color: 'text-gray-900',
            },
            {
              label: 'Available Balance',
              value: `₦${fmt(account.available_balance)}`,
              color: 'text-green-700',
            },
            {
              label: 'Interest Rate',
              value: `${account.interest_rate}% p.a.`,
              color: 'text-gray-700',
            },
            { label: 'Opened On', value: fmtDate(account.opened_on), color: 'text-gray-700' },
          ].map(card => (
            <div key={card.label} className="rounded-xl bg-white p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                {card.label}
              </p>
              <p className={`mt-1 text-xl font-bold ${card.color}`}>{card.value}</p>
            </div>
          ))}
        </div>

        {/* Account Details */}
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Account Details
          </h2>
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3 lg:grid-cols-4">
            <div>
              <p className="text-gray-500">Product</p>
              <p className="font-medium text-gray-900">{account.product_name}</p>
            </div>
            {account.nickname && (
              <div>
                <p className="text-gray-500">Nickname</p>
                <p className="font-medium text-gray-900">{account.nickname}</p>
              </div>
            )}
            {account.contribution_cycle && (
              <div>
                <p className="text-gray-500">Contribution Cycle</p>
                <p className="font-medium capitalize text-gray-900">{account.contribution_cycle}</p>
              </div>
            )}
            {account.contribution_amount && parseFloat(account.contribution_amount) > 0 && (
              <div>
                <p className="text-gray-500">Contribution Amount</p>
                <p className="font-medium text-gray-900">₦{fmt(account.contribution_amount)}</p>
              </div>
            )}
            <div>
              <p className="text-gray-500">Min. Balance</p>
              <p className="font-medium text-gray-900">₦{fmt(account.minimum_balance)}</p>
            </div>
            <div>
              <p className="text-gray-500">Last Transaction</p>
              <p className="font-medium text-gray-900">{fmtDate(account.last_transaction_date)}</p>
            </div>
            <div>
              <p className="text-gray-500">Auto Renew</p>
              <p className="font-medium text-gray-900">{account.auto_renew ? 'Yes' : 'No'}</p>
            </div>
            <div className="col-span-2">
              <Link
                to={`/clients/${account.client}`}
                className="text-sm text-blue-600 hover:underline"
              >
                View Client Profile →
              </Link>
            </div>
          </div>
        </div>

        {/* Transaction Ledger */}
        <div className="rounded-xl bg-white shadow-sm">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                Savings Ledger
              </h2>
              <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700">
                GL Entries
              </span>
            </div>
            {txLoading && <Loader2 size={16} className="animate-spin text-gray-400" />}
          </div>

          {transactions.length === 0 && !txLoading ? (
            <div className="py-12 text-center text-sm text-gray-400">No transactions yet.</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Reference</th>
                      <th className="px-4 py-3">Description</th>
                      <th className="px-4 py-3 text-right">Debit</th>
                      <th className="px-4 py-3 text-right">Credit</th>
                      <th className="px-4 py-3 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {transactions.map(tx => (
                      <tr key={tx.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 text-gray-600">{fmtDate(tx.date)}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-500">
                          {tx.reference}
                        </td>
                        <td className="px-4 py-2.5 text-gray-700">{tx.description}</td>
                        <td className="px-4 py-2.5 text-right text-red-600">
                          {tx.debit ? `₦${fmt(tx.debit)}` : ''}
                        </td>
                        <td className="px-4 py-2.5 text-right text-green-700">
                          {tx.credit ? `₦${fmt(tx.credit)}` : ''}
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium text-gray-900">
                          ₦{fmt(tx.balance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {txTotalPages > 1 && (
                <div className="flex items-center justify-between border-t px-4 py-3">
                  <p className="text-xs text-gray-500">
                    Page {txPage} of {txTotalPages} ({txTotal} total)
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setTxPage(p => Math.max(1, p - 1))}
                      disabled={txPage === 1}
                      className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                    >
                      <ChevronLeft size={12} /> Prev
                    </button>
                    <button
                      type="button"
                      onClick={() => setTxPage(p => Math.min(txTotalPages, p + 1))}
                      disabled={txPage === txTotalPages}
                      className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                    >
                      Next <ChevronRight size={12} />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Contribution Schedule */}
        {account.contribution_cycle && (
          <div className="rounded-xl bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                Contribution Schedule
              </h2>
              <div className="flex items-center gap-2">
                <select
                  aria-label="Schedule month"
                  title="Schedule month"
                  value={scheduleMonth}
                  onChange={e => setScheduleMonth(parseInt(e.target.value))}
                  className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                >
                  {MONTHS.map((m, i) => (
                    <option key={i + 1} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  title="Schedule year"
                  placeholder="Year"
                  value={scheduleYear}
                  onChange={e => setScheduleYear(parseInt(e.target.value))}
                  className="w-20 rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                  min={2020}
                  max={2035}
                />
                {scheduleLoading && <Loader2 size={16} className="animate-spin text-gray-400" />}
              </div>
            </div>

            {schedule.length === 0 && !scheduleLoading ? (
              <div className="py-10 text-center text-sm text-gray-400">
                No schedule for this period.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      <th className="px-4 py-3">Expected Date</th>
                      <th className="px-4 py-3 text-right">Amount Due</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Paid On</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {schedule.map(row => (
                      <tr
                        key={row.id}
                        className={row.status === 'missed' ? 'bg-red-50' : 'hover:bg-gray-50'}
                      >
                        <td className="px-4 py-2.5 text-gray-700">{fmtDate(row.expected_date)}</td>
                        <td className="px-4 py-2.5 text-right font-medium text-gray-900">
                          ₦{fmt(row.expected_amount)}
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${CONTRIB_STATUS_BADGE[row.status] ?? 'bg-gray-100 text-gray-600'}`}
                          >
                            {row.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-500">{fmtDate(row.paid_on)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
