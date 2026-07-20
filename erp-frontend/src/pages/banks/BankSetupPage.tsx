/**
 * BankSetupPage — unified form to create or edit a bank account.
 *
 * Covers everything in one place:
 *   1. Bank institution  — pick an existing bank OR enter a new one
 *   2. Account details   — number, name, type, currency
 *   3. GL ledger link    — auto-create (default) or link to an existing unlinked GL account
 */
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Save, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import {
  useBanks,
  useBankAccount,
  useCreateBankAccount,
  useUpdateBankAccount,
} from '../../hooks/useBanks';
import { accountService } from '../../services/accountService';
import { userManagementService, type User } from '../../services/userManagementService';
import type { Account } from '../../types/accounts';

const BankSetupPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const isEdit = !!id;

  // ── React Query hooks ──────────────────────────────────────────
  const { data: banks = [] } = useBanks({ is_active: true });
  const { data: existingAccount, isLoading: accountLoading } = useBankAccount(Number(id), isEdit);
  const createAccount = useCreateBankAccount();
  const updateAccount = useUpdateBankAccount();

  // ── loading state ──────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── reference data (non-bank services, no hooks yet) ───────────
  const [glAccounts, setGlAccounts] = useState<Account[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  // ── Section 1: Bank Institution ───────────────────────────────
  const [bankMode, setBankMode] = useState<'existing' | 'new'>('existing');
  const [selectedBankId, setSelectedBankId] = useState('');
  const [newBank, setNewBank] = useState({ name: '', code: '', branch: '' });
  const [editBankLabel, setEditBankLabel] = useState('');

  // ── Section 2: Account Details ────────────────────────────────
  const [acct, setAcct] = useState({
    account_number: '',
    account_name: '',
    account_type: 'current' as 'current' | 'savings' | 'fixed_deposit' | 'domiciliary',
    currency: 'NGN',
    is_cashier_collection_account: false,
    notes: '',
    account_manager: '',
  });

  // ── Section 3: GL Link ────────────────────────────────────────
  const [glMode, setGlMode] = useState<'auto' | 'existing'>('auto');
  const [glAccountId, setGlAccountId] = useState('');

  // ── Advanced (hidden by default) ──────────────────────────────
  const [showAdvanced, setShowAdvanced] = useState(false);

  // ── Load non-bank reference data ──────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [glRes, usersRes] = await Promise.all([
          accountService.getAccounts({ account_type: 'ASSET', is_active: true }),
          userManagementService.getUsers(),
        ]);
        setGlAccounts((glRes as Account[]).filter(a => a.account_level?.toLowerCase() === 'child'));
        setUsers(usersRes.filter(u => u.is_active));

        const preselectedBankId = searchParams.get('bank');
        if (preselectedBankId) {
          setSelectedBankId(preselectedBankId);
          setBankMode('existing');
        }
      } catch {
        setError('Failed to load reference data. Please refresh the page.');
      }
    })();
  }, [searchParams]);

  // ── Populate form from existing account ───────────────────────
  useEffect(() => {
    if (existingAccount) {
      setEditBankLabel(
        [existingAccount.bank_display_name, existingAccount.bank_branch].filter(Boolean).join(' – ')
      );
      setAcct({
        account_number: existingAccount.account_number ?? '',
        account_name: existingAccount.account_name ?? '',
        account_type:
          (existingAccount.account_type as
            | 'current'
            | 'savings'
            | 'fixed_deposit'
            | 'domiciliary') ?? 'current',
        currency: existingAccount.currency ?? 'NGN',
        is_cashier_collection_account: existingAccount.is_cashier_collection_account ?? false,
        notes: existingAccount.notes ?? '',
        account_manager: existingAccount.account_manager
          ? String(existingAccount.account_manager)
          : '',
      });
      if (existingAccount.gl_account) {
        setGlMode('existing');
        setGlAccountId(String(existingAccount.gl_account));
      }
    }
  }, [existingAccount]);

  // ── Submit ─────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isEdit) {
      if (bankMode === 'existing' && !selectedBankId) {
        setError('Please select a bank or choose "New bank".');
        return;
      }
      if (bankMode === 'new' && !newBank.name.trim()) {
        setError('Bank name is required.');
        return;
      }
    }
    if (!acct.account_number.trim()) {
      setError('Account number is required.');
      return;
    }
    if (!acct.account_name.trim()) {
      setError('Account name is required.');
      return;
    }
    if (glMode === 'existing' && !glAccountId) {
      setError('Please select a GL account or switch to "Auto-create".');
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        account_number: acct.account_number,
        account_name: acct.account_name,
        account_type: acct.account_type,
        currency: acct.currency,
        is_cashier_collection_account: acct.is_cashier_collection_account,
        notes: acct.notes,
      };
      if (acct.account_manager) {
        payload.account_manager = Number(acct.account_manager);
      }

      if (!isEdit) {
        if (bankMode === 'existing') {
          payload.bank = Number(selectedBankId);
        } else {
          payload.bank_name = newBank.name.trim();
          if (newBank.code.trim()) payload.new_bank_code = newBank.code.trim();
          if (newBank.branch.trim()) payload.new_bank_branch = newBank.branch.trim();
        }
      }

      if (glMode === 'existing' && glAccountId) {
        payload.gl_account = Number(glAccountId);
      }

      if (isEdit) {
        await updateAccount.mutateAsync({
          id: Number(id),
          data: payload as Parameters<typeof updateAccount.mutateAsync>[0]['data'],
        });
      } else {
        await createAccount.mutateAsync(payload as Parameters<typeof createAccount.mutateAsync>[0]);
      }
      navigate('/banks/accounts');
    } catch (err: unknown) {
      const data =
        (err as { response?: { data?: Record<string, unknown> }; data?: Record<string, unknown> })
          ?.response?.data ??
        (err as { data?: Record<string, unknown> })?.data ??
        {};
      const msgs = Object.entries(data)
        .flatMap(([k, v]) =>
          (Array.isArray(v) ? v : [v]).map(m =>
            k === 'non_field_errors' ? String(m) : `${k}: ${String(m)}`
          )
        )
        .join('  •  ');
      setError(msgs || err?.message || 'Failed to save. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const setAcctField = (field: keyof typeof acct, value: unknown) =>
    setAcct(prev => ({ ...prev, [field]: value }));

  const isLoading = accountLoading;

  if (isLoading) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Back"
          onClick={() => navigate('/banks/accounts')}
          className="rounded-lg p-2 hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft className="h-5 w-5 text-gray-600" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900">
          {isEdit ? 'Edit Bank Account' : 'Add Bank Account'}
        </h1>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* ── Section 1: Bank Institution ── */}
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
          <h2 className="font-semibold text-gray-800">Bank Institution</h2>

          {isEdit ? (
            <div className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-700">
              <span className="font-medium">{editBankLabel || 'Unknown bank'}</span>
              <p className="text-xs text-gray-500 mt-0.5">
                Bank cannot be changed after account creation.
              </p>
            </div>
          ) : (
            <>
              {/* Toggle */}
              <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm font-medium">
                <button
                  type="button"
                  onClick={() => setBankMode('existing')}
                  className={`flex-1 py-2 transition-colors ${bankMode === 'existing' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                >
                  Use existing bank
                </button>
                <button
                  type="button"
                  onClick={() => setBankMode('new')}
                  className={`flex-1 py-2 transition-colors ${bankMode === 'new' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                >
                  Add new bank
                </button>
              </div>

              {bankMode === 'existing' ? (
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Select bank <span className="text-red-500">*</span>
                  </label>
                  <select
                    title="Select bank"
                    value={selectedBankId}
                    onChange={e => setSelectedBankId(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">— Select a bank —</option>
                    {banks.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.bank_name}
                        {b.branch_name ? ` – ${b.branch_name}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="sm:col-span-3">
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Bank name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      title="Bank name"
                      placeholder="e.g. First Bank of Nigeria"
                      value={newBank.name}
                      onChange={e => setNewBank(p => ({ ...p, name: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Bank code
                    </label>
                    <input
                      type="text"
                      title="Bank code"
                      placeholder="e.g. 011"
                      value={newBank.code}
                      onChange={e => setNewBank(p => ({ ...p, code: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Branch name
                    </label>
                    <input
                      type="text"
                      title="Branch name"
                      placeholder="e.g. Ikeja Branch"
                      value={newBank.branch}
                      onChange={e => setNewBank(p => ({ ...p, branch: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        {/* ── Section 2: Account Details ── */}
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
          <h2 className="font-semibold text-gray-800">Account Details</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Account number <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                title="Account number"
                placeholder="e.g. 0123456789"
                value={acct.account_number}
                onChange={e => setAcctField('account_number', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Account name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                title="Account name"
                placeholder="e.g. Krystar Trust Main Account"
                value={acct.account_name}
                onChange={e => setAcctField('account_name', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Account type</label>
              <select
                title="Account type"
                value={acct.account_type}
                onChange={e => setAcctField('account_type', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="current">Current Account</option>
                <option value="savings">Savings Account</option>
                <option value="fixed_deposit">Fixed Deposit</option>
                <option value="domiciliary">Domiciliary Account</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Currency</label>
              <select
                title="Currency"
                value={acct.currency}
                onChange={e => setAcctField('currency', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="NGN">NGN — Nigerian Naira</option>
                <option value="USD">USD — US Dollar</option>
                <option value="GBP">GBP — British Pound</option>
                <option value="EUR">EUR — Euro</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Account manager
              </label>
              <select
                title="Account manager"
                value={acct.account_manager}
                onChange={e => setAcctField('account_manager', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">
                  {isEdit ? '— Keep current manager —' : '— Defaults to you if left blank —'}
                </option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.full_name} ({u.username})
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">
                Only this person can approve transfers landing in this specific account — each
                account can have a different manager, even at the same bank.
              </p>
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={acct.is_cashier_collection_account}
              onChange={e => setAcctField('is_cashier_collection_account', e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600"
            />
            <span className="font-medium text-gray-700">Use as cashier collection account</span>
            <span className="text-gray-500">(cash received from customers goes here)</span>
          </label>
        </section>

        {/* ── Section 3: GL Link ── */}
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-3">
          <h2 className="font-semibold text-gray-800">General Ledger (GL) Link</h2>

          <div className="space-y-2">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="radio"
                name="glMode"
                checked={glMode === 'auto'}
                onChange={() => {
                  setGlMode('auto');
                  setGlAccountId('');
                }}
                className="mt-0.5 h-4 w-4 border-gray-300 text-blue-600"
              />
              <div>
                <p className="text-sm font-medium text-gray-800">
                  Auto-create GL account <span className="text-blue-600">(recommended)</span>
                </p>
                <p className="text-xs text-gray-500">
                  A new GL account named after this bank account will be created automatically under{' '}
                  <strong>1100 – Cash and Cash Equivalents</strong>.
                </p>
              </div>
            </label>

            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="radio"
                name="glMode"
                checked={glMode === 'existing'}
                onChange={() => setGlMode('existing')}
                className="mt-0.5 h-4 w-4 border-gray-300 text-blue-600"
              />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-800">Link to an existing GL account</p>
                <p className="text-xs text-gray-500 mb-2">
                  Only unlinked ASSET child accounts are shown. Each GL account can only be linked
                  to one bank account.
                </p>
                {glMode === 'existing' && (
                  <select
                    title="GL account"
                    value={glAccountId}
                    onChange={e => setGlAccountId(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">— Select GL account —</option>
                    {glAccounts.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.code} – {a.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </label>
          </div>
        </section>

        {/* ── Advanced (optional notes) ── */}
        <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <button
            type="button"
            onClick={() => setShowAdvanced(v => !v)}
            className="flex w-full items-center justify-between px-5 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 rounded-xl"
          >
            <span>Notes / additional info</span>
            {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {showAdvanced && (
            <div className="px-5 pb-4">
              <textarea
                title="Notes"
                value={acct.notes}
                onChange={e => setAcctField('notes', e.target.value)}
                rows={3}
                placeholder="Any additional notes about this account…"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          )}
        </section>

        {/* ── Actions ── */}
        <div className="flex justify-end gap-3 pb-4">
          <button
            type="button"
            onClick={() => navigate('/banks/accounts')}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {submitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Account'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default BankSetupPage;
