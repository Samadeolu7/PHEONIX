import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, X } from 'lucide-react';
import bankService from '../../services/bankService';
import { accountService } from '../../services/accountService';
import { userManagementService, type User } from '../../services/userManagementService';
import type { BankAccount } from '../../types/banks';
import type { Account } from '../../types/accounts';

const BankAccountFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;

  const [formData, setFormData] = useState({
    bank_name: '',
    account_number: '',
    account_name: '',
    account_type: 'current' as 'savings' | 'current' | 'fixed_deposit' | 'domiciliary',
    currency: 'NGN',
    gl_account: '' as string,
    account_manager: '' as string,
    current_balance: '0.00',
    is_cashier_collection_account: false,
    requires_dual_approval: false,
    dual_approval_threshold: '',
    is_active: true,
    notes: '',
  });

  const [glAccounts, setGlAccounts] = useState<Account[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // When true the backend auto-creates a GL account under 1100.
  // In create mode this is always true by default; in edit mode it flips
  // to false once we detect the account already has a linked GL account.
  const [useAutoGL, setUseAutoGL] = useState(!isEditMode);

  useEffect(() => {
    loadGLAccounts();
    loadUsers();
    if (isEditMode) {
      loadAccount();
    }
  }, [id]);

  const loadAccount = async () => {
    try {
      setLoading(true);
      const data = await bankService.getBankAccount(Number(id));
      setFormData({
        bank_name: data.bank_name || '',
        account_number: data.account_number,
        account_name: data.account_name,
        account_type: data.account_type as any,
        currency: data.currency,
        gl_account: data.gl_account?.toString() || '',
        account_manager: data.account_manager?.toString() || '',
        current_balance: data.current_balance,
        is_cashier_collection_account: data.is_cashier_collection_account,
        requires_dual_approval: data.requires_dual_approval || false,
        dual_approval_threshold: data.dual_approval_threshold || '',
        is_active: data.is_active,
        notes: data.notes || '',
      });
      // If the account already has a GL account linked, show the selector
      if (data.gl_account) setUseAutoGL(false);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message || 'Failed to load account');
    } finally {
      setLoading(false);
    }
  };

  const loadGLAccounts = async () => {
    try {
      const accounts = await accountService.getAccounts({
        account_type: 'ASSET',
        is_active: true,
      });
      setGlAccounts(accounts);
    } catch (err) {
      console.error('Failed to load GL accounts:', err);
      // Show error to user
      setError('Failed to load GL accounts. Please refresh the page.');
    }
  };

  const loadUsers = async () => {
    try {
      const allUsers = await userManagementService.getUsers();
      // Handle both array and paginated response formats
      const userList = Array.isArray(allUsers) ? allUsers : (allUsers as any).results || [];
      // Filter only active users
      setUsers(userList.filter((u: User) => u.is_active));
    } catch (err) {
      console.error('Failed to load users:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const payload: Record<string, unknown> = {
        bank_name: formData.bank_name,
        account_number: formData.account_number,
        account_name: formData.account_name,
        account_type: formData.account_type,
        currency: formData.currency,
        account_manager: Number(formData.account_manager),
        current_balance: formData.current_balance,
        is_cashier_collection_account: formData.is_cashier_collection_account,
        requires_dual_approval: formData.requires_dual_approval,
        dual_approval_threshold: formData.dual_approval_threshold
          ? Number(formData.dual_approval_threshold)
          : null,
        is_active: formData.is_active,
        notes: formData.notes,
      };

      // Only attach gl_account when the user has explicitly chosen one.
      // When useAutoGL is true we omit it so the backend auto-creates a
      // child account under 1100 (Cash and Cash Equivalents).
      if (!useAutoGL && formData.gl_account) {
        payload.gl_account = Number(formData.gl_account);
      }

      if (isEditMode) {
        await bankService.updateBankAccount(Number(id), payload as any);
      } else {
        await bankService.createBankAccount(payload as any);
      }

      navigate('/banks/accounts');
    } catch (err: unknown) {
      const e = err as { message?: string; details?: Record<string, unknown> };
      const details = e.details;
      let msg = e.message || '';
      if (details && typeof details === 'object') {
        const fieldErrors = Object.entries(details)
          .flatMap(([field, errs]) => {
            const list = Array.isArray(errs) ? errs : [errs];
            return list.map(m =>
              field === 'non_field_errors' ? String(m) : `${field}: ${String(m)}`
            );
          })
          .join('  |  ');
        if (fieldErrors) msg = fieldErrors;
      }
      setError(msg || 'Failed to save account');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-6">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => navigate('/banks/accounts')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Bank Accounts
          </button>
          <h1 className="text-3xl font-bold text-gray-900">
            {isEditMode ? 'Edit Bank Account' : 'Add Bank Account'}
          </h1>
          <p className="text-gray-600 mt-1">
            {isEditMode
              ? 'Update account details'
              : 'Create a new bank account for your organization'}
          </p>
        </div>

        {/* Form */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            {/* Bank Details */}
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Bank Details</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Bank Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.bank_name}
                    onChange={e => setFormData({ ...formData, bank_name: e.target.value })}
                    placeholder="e.g., First Bank Nigeria - Ikeja Branch"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 mt-1">Enter the bank name and branch</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Account Number *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.account_number}
                    onChange={e => setFormData({ ...formData, account_number: e.target.value })}
                    placeholder="1234567890"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Account Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.account_name}
                    onChange={e => setFormData({ ...formData, account_name: e.target.value })}
                      placeholder="Krystar Trust Main Account"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Account Type *
                  </label>
                  <select
                    required
                    value={formData.account_type}
                    onChange={e =>
                      setFormData({ ...formData, account_type: e.target.value as any })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="current">Current Account</option>
                    <option value="savings">Savings Account</option>
                    <option value="fixed_deposit">Fixed Deposit</option>
                    <option value="domiciliary">Domiciliary Account</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Currency *</label>
                  <select
                    required
                    value={formData.currency}
                    onChange={e => setFormData({ ...formData, currency: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="NGN">NGN - Nigerian Naira</option>
                    <option value="USD">USD - US Dollar</option>
                    <option value="GBP">GBP - British Pound</option>
                    <option value="EUR">EUR - Euro</option>
                  </select>
                </div>
              </div>
            </div>

            {/* System Integration */}
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">System Integration</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* ── GL Account ── */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    General Ledger (GL) Account
                  </label>

                  {/* Auto-create notice */}
                  {useAutoGL ? (
                    <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 flex items-start gap-3">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-blue-800">
                          ✅ Auto-create GL account under{' '}
                          <strong>1100 – Cash and Cash Equivalents</strong>
                        </p>
                        <p className="text-xs text-blue-700 mt-1">
                          A child GL account named{' '}
                          <strong>
                            &ldquo;{formData.account_name || 'the account name you enter above'}
                            &rdquo;
                          </strong>{' '}
                          will be automatically created under the{' '}
                          <em>1100 Cash and Cash Equivalents</em> parent, allowing you to monitor
                          this bank account separately in the ledger.
                        </p>
                      </div>
                      {isEditMode && (
                        <button
                          type="button"
                          onClick={() => setUseAutoGL(false)}
                          className="text-xs text-blue-600 underline whitespace-nowrap hover:text-blue-800"
                        >
                          Link existing GL account
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <select
                        value={formData.gl_account}
                        onChange={e => setFormData({ ...formData, gl_account: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="">Select existing GL Account (ASSET › CHILD only)</option>
                        {glAccounts
                          .filter(a => a.account_level?.toLowerCase() === 'child')
                          .map(account => (
                            <option key={account.id} value={account.id}>
                              {account.code} – {account.name}
                            </option>
                          ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          setUseAutoGL(true);
                          setFormData(prev => ({ ...prev, gl_account: '' }));
                        }}
                        className="text-xs text-blue-600 underline hover:text-blue-800"
                      >
                        ← Auto-create instead
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Account Manager *
                  </label>
                  <select
                    required
                    value={formData.account_manager}
                    onChange={e => setFormData({ ...formData, account_manager: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Select Manager</option>
                    {users.map(user => (
                      <option key={user.id} value={user.id}>
                        {user.full_name} ({user.username})
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">User who approves transactions</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Opening Balance
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.current_balance}
                    onChange={e => setFormData({ ...formData, current_balance: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>

            {/* Settings */}
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Account Settings</h2>
              <div className="space-y-3">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.is_cashier_collection_account}
                    onChange={e =>
                      setFormData({
                        ...formData,
                        is_cashier_collection_account: e.target.checked,
                      })
                    }
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">
                    Cashier Collection Account
                    <span className="text-gray-500 block text-xs">
                      Cashiers can transfer funds to this account
                    </span>
                  </span>
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.requires_dual_approval}
                    onChange={e =>
                      setFormData({ ...formData, requires_dual_approval: e.target.checked })
                    }
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">
                    Require Dual Approval
                    <span className="text-gray-500 block text-xs">
                      Large transactions need two approvers
                    </span>
                  </span>
                </label>

                {formData.requires_dual_approval && (
                  <div className="ml-6">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Dual Approval Threshold
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.dual_approval_threshold}
                      onChange={e =>
                        setFormData({ ...formData, dual_approval_threshold: e.target.value })
                      }
                      placeholder="e.g., 100000"
                      className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Amount above which dual approval is required
                    </p>
                  </div>
                )}

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={e => setFormData({ ...formData, is_active: e.target.checked })}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">Active</span>
                </label>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                value={formData.notes}
                onChange={e => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Additional notes about this account..."
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4 border-t">
              <button
                type="button"
                onClick={() => navigate('/banks/accounts')}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {submitting ? 'Saving...' : isEditMode ? 'Update Account' : 'Create Account'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default BankAccountFormPage;
