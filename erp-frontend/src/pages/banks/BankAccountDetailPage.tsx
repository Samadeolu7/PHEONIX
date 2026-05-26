import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Edit,
  TrendingUp,
  TrendingDown,
  Clock,
  Lock,
  Unlock,
  Calendar,
  DollarSign,
  FileText,
  AlertCircle,
} from 'lucide-react';
import bankService from '../../services/bankService';
import { useSuspendBankAccount, useActivateBankAccount } from '../../hooks/useBanks';
import type { BankAccount, BankAccountSummary, LedgerEntry } from '../../types/banks';

const BankAccountDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [account, setAccount] = useState<BankAccount | null>(null);
  const [summary, setSummary] = useState<BankAccountSummary | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'ledger' | 'transfers'>('overview');

  // Suspend modal state
  const [showSuspendModal, setShowSuspendModal] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');
  const [suspendReasonError, setSuspendReasonError] = useState<string | null>(null);

  // Activate confirmation modal state
  const [showActivateModal, setShowActivateModal] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const suspendMutation = useSuspendBankAccount();
  const activateMutation = useActivateBankAccount();

  useEffect(() => {
    // Validate that id is a valid number
    if (!id || isNaN(Number(id))) {
      setError('Invalid account ID');
      setLoading(false);
      return;
    }

    if (id) {
      loadAccount();
      loadSummary();
      loadLedger();
    }
  }, [id]);

  const loadAccount = async () => {
    try {
      const data = await bankService.getBankAccount(Number(id));
      setAccount(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load account');
    }
  };

  const loadSummary = async () => {
    try {
      const data = await bankService.getBankAccountSummary(Number(id));
      setSummary(data);
    } catch (err: any) {
      console.error('Failed to load summary:', err);
    }
  };

  const loadLedger = async () => {
    try {
      setLoading(true);
      const data = await bankService.getBankAccountLedger(Number(id), { limit: 50 });
      // API returns object with entries array, not direct array
      setLedger(data.entries || []);
    } catch (err: any) {
      console.error('Failed to load ledger:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSuspend = () => {
    setSuspendReason('');
    setSuspendReasonError(null);
    setActionError(null);
    setShowSuspendModal(true);
  };

  const handleConfirmSuspend = async () => {
    if (!account) return;
    if (!suspendReason.trim()) {
      setSuspendReasonError('A reason is required to suspend an account');
      return;
    }
    try {
      await suspendMutation.mutateAsync({ id: account.id, reason: suspendReason.trim() });
      setShowSuspendModal(false);
      loadAccount();
    } catch (err: unknown) {
      const e = err as { message?: string };
      setActionError(e?.message ?? 'Failed to suspend account');
      setShowSuspendModal(false);
    }
  };

  const handleActivate = () => {
    setActionError(null);
    setShowActivateModal(true);
  };

  const handleConfirmActivate = async () => {
    if (!account) return;
    try {
      await activateMutation.mutateAsync(account.id);
      setShowActivateModal(false);
      loadAccount();
    } catch (err: unknown) {
      const e = err as { message?: string };
      setActionError(e?.message ?? 'Failed to activate account');
      setShowActivateModal(false);
    }
  };

  if (loading && !account) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !account) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error || 'Account not found'}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/banks/accounts')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Accounts
        </button>

        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{account.account_name}</h1>
            <p className="text-gray-600 mt-1">
              {account.bank_name} • {account.account_number}
            </p>
          </div>
          <div className="flex gap-2">
            {account.is_suspended ? (
              <button
                onClick={handleActivate}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                <Unlock className="w-5 h-5" />
                Activate
              </button>
            ) : (
              <button
                onClick={handleSuspend}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                <Lock className="w-5 h-5" />
                Suspend
              </button>
            )}
            <button
              onClick={() => navigate(`/banks/accounts/${account.id}/edit`)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Edit className="w-5 h-5" />
              Edit
            </button>
          </div>
        </div>

        {/* Status Alerts */}
        {account.is_suspended && (
          <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            <span>This account is currently suspended</span>
          </div>
        )}
        {actionError && (
          <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            <span>{actionError}</span>
            <button
              aria-label="Dismiss error"
              onClick={() => setActionError(null)}
              className="ml-auto text-red-500 hover:text-red-700 font-bold"
            >
              ×
            </button>
          </div>
        )}

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">Current Balance</span>
                <DollarSign className="w-5 h-5 text-green-600" />
              </div>
              <p className="text-2xl font-bold text-gray-900">
                ₦{parseFloat(summary.current_balance).toLocaleString()}
              </p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">Available</span>
                <DollarSign className="w-5 h-5 text-blue-600" />
              </div>
              <p className="text-2xl font-bold text-gray-900">
                ₦{parseFloat(summary.available_balance).toLocaleString()}
              </p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">Pending In</span>
                <TrendingUp className="w-5 h-5 text-green-600" />
              </div>
              <p className="text-xl font-bold text-green-600">
                ₦{parseFloat(summary.pending_incoming).toLocaleString()}
              </p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">Pending Out</span>
                <TrendingDown className="w-5 h-5 text-red-600" />
              </div>
              <p className="text-xl font-bold text-red-600">
                ₦{parseFloat(summary.pending_outgoing).toLocaleString()}
              </p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px">
              <button
                onClick={() => setActiveTab('overview')}
                className={`px-6 py-3 text-sm font-medium border-b-2 ${
                  activeTab === 'overview'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Overview
              </button>
              <button
                onClick={() => setActiveTab('ledger')}
                className={`px-6 py-3 text-sm font-medium border-b-2 ${
                  activeTab === 'ledger'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Ledger
              </button>
              <button
                onClick={() => setActiveTab('transfers')}
                className={`px-6 py-3 text-sm font-medium border-b-2 ${
                  activeTab === 'transfers'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Transfers
              </button>
            </nav>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Account Details</h3>
                    <dl className="space-y-3">
                      <div className="flex justify-between">
                        <dt className="text-gray-600">Account Type:</dt>
                        <dd className="font-medium">{account.account_type}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-gray-600">Currency:</dt>
                        <dd className="font-medium">{account.currency}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-gray-600">GL Account:</dt>
                        <dd className="font-medium">
                          {account.gl_account_code} - {account.gl_account_name}
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-gray-600">Manager:</dt>
                        <dd className="font-medium">{account.account_manager_name}</dd>
                      </div>
                      {account.date_opened && (
                        <div className="flex justify-between">
                          <dt className="text-gray-600">Opened:</dt>
                          <dd className="font-medium">
                            {new Date(account.date_opened).toLocaleDateString()}
                          </dd>
                        </div>
                      )}
                    </dl>
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold mb-4">Settings & Limits</h3>
                    <dl className="space-y-3">
                      {account.daily_withdrawal_limit && (
                        <div className="flex justify-between">
                          <dt className="text-gray-600">Daily Limit:</dt>
                          <dd className="font-medium">
                            ₦{parseFloat(account.daily_withdrawal_limit).toLocaleString()}
                          </dd>
                        </div>
                      )}
                      {account.monthly_transaction_limit && (
                        <div className="flex justify-between">
                          <dt className="text-gray-600">Monthly Limit:</dt>
                          <dd className="font-medium">
                            ₦{parseFloat(account.monthly_transaction_limit).toLocaleString()}
                          </dd>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <dt className="text-gray-600">Dual Approval:</dt>
                        <dd className="font-medium">
                          {account.requires_dual_approval ? (
                            <span>
                              Yes (₦
                              {parseFloat(account.dual_approval_threshold || '0').toLocaleString()})
                            </span>
                          ) : (
                            'No'
                          )}
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-gray-600">Cashier Collection:</dt>
                        <dd className="font-medium">
                          {account.is_cashier_collection_account ? 'Yes' : 'No'}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>

                {account.notes && (
                  <div>
                    <h3 className="text-lg font-semibold mb-2">Notes</h3>
                    <p className="text-gray-600 bg-gray-50 p-4 rounded-lg">{account.notes}</p>
                  </div>
                )}
              </div>
            )}

            {/* Ledger Tab */}
            {activeTab === 'ledger' && (
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold">Transaction Ledger</h3>
                  <button
                    onClick={loadLedger}
                    className="text-sm text-blue-600 hover:text-blue-700"
                  >
                    Refresh
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Date
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Reference
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Description
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                          Debit
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                          Credit
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                          Balance
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {ledger.map(entry => (
                        <tr key={entry.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                            {new Date(entry.date).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                            {entry.reference_number}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">{entry.description}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-green-600 font-medium">
                            {entry.debit !== '0.00' &&
                              `₦${parseFloat(entry.debit).toLocaleString()}`}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-red-600 font-medium">
                            {entry.credit !== '0.00' &&
                              `₦${parseFloat(entry.credit).toLocaleString()}`}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-medium text-gray-900">
                            ₦{parseFloat(entry.balance).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {ledger.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      <FileText className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                      <p>No transactions yet</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Transfers Tab */}
            {activeTab === 'transfers' && (
              <div className="text-center py-8 text-gray-500">
                <p>Transfer history coming soon...</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ---- Suspend Modal ---- */}
      {showSuspendModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Lock className="h-5 w-5 text-red-600" />
              <h3 className="text-lg font-semibold text-gray-900">Suspend Bank Account</h3>
            </div>
            <p className="text-sm text-gray-600">
              Suspending this account will prevent new transactions. You can reactivate it at any
              time.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reason <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={3}
                placeholder="Enter the reason for suspension…"
                value={suspendReason}
                onChange={e => {
                  setSuspendReason(e.target.value);
                  setSuspendReasonError(null);
                }}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              {suspendReasonError && (
                <p className="mt-1 text-sm text-red-600">{suspendReasonError}</p>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowSuspendModal(false)}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSuspend}
                disabled={suspendMutation.isPending}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {suspendMutation.isPending ? 'Suspending…' : 'Confirm Suspend'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Activate Confirmation Modal ---- */}
      {showActivateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Unlock className="h-5 w-5 text-green-600" />
              <h3 className="text-lg font-semibold text-gray-900">Reactivate Bank Account</h3>
            </div>
            <p className="text-sm text-gray-600">
              This will allow new transactions on this account again. Continue?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowActivateModal(false)}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmActivate}
                disabled={activateMutation.isPending}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {activateMutation.isPending ? 'Activating…' : 'Confirm Activate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BankAccountDetailPage;
