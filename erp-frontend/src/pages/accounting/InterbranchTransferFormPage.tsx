import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useBranchOptions } from '../../hooks/useBranches';
import { useAccountsByBranch } from '../../hooks/useAccountsSimple';
import { useCreateInterbranchTransfer } from '../../hooks/useInterbranch';

const DECIMAL_INPUT_REGEX = /^\d{0,16}(?:\.\d{0,2})?$/;

const InterbranchTransferFormPage: React.FC = () => {
  const navigate = useNavigate();

  const [fromBranchId, setFromBranchId] = useState<number | ''>('');
  const [toBranchId, setToBranchId] = useState<number | ''>('');
  const [fromAccountId, setFromAccountId] = useState<number | ''>('');
  const [toAccountId, setToAccountId] = useState<number | ''>('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [error, setError] = useState<string | null>(null);

  const { data: branchOptions = [] } = useBranchOptions();
  const { data: fromAccounts = [], isLoading: loadingFromAccounts } = useAccountsByBranch(
    fromBranchId || undefined
  );
  const { data: toAccounts = [], isLoading: loadingToAccounts } = useAccountsByBranch(
    toBranchId || undefined
  );
  const createTransfer = useCreateInterbranchTransfer();

  // Only leaf accounts can be posted to — matches TransactionEntry.clean()'s
  // rejection of parent/category accounts on the backend, so the dropdown
  // never offers a choice that will always fail.
  const postableFromAccounts = fromAccounts.filter(a => a.can_post_transactions !== false);
  const postableToAccounts = toAccounts.filter(a => a.can_post_transactions !== false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!fromBranchId || !toBranchId) {
      setError('Please select both a source and destination branch.');
      return;
    }
    if (fromBranchId === toBranchId) {
      setError('Source and destination branches must be different.');
      return;
    }
    if (!fromAccountId || !toAccountId) {
      setError('Please select both a source and destination account.');
      return;
    }
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount.');
      return;
    }

    try {
      await createTransfer.mutateAsync({
        from_branch_id: fromBranchId,
        to_branch_id: toBranchId,
        from_account_id: fromAccountId,
        to_account_id: toAccountId,
        amount,
        description,
        date,
      });
      navigate('/accounting/interbranch-transfers');
    } catch (err: unknown) {
      const e = err as {
        details?: { error?: string; non_field_errors?: string[] };
        message?: string;
      };
      setError(
        e?.details?.error ||
          e?.details?.non_field_errors?.join(' ') ||
          e?.message ||
          'Failed to create inter-branch transfer.'
      );
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <button
          onClick={() => navigate('/accounting/interbranch-transfers')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Inter-Branch Transfers
        </button>
        <h1 className="text-3xl font-bold text-gray-900">New Inter-Branch Transfer</h1>
        <p className="text-gray-600 mt-1">
          Move funds between two branches — posts a balanced JV in each branch&apos;s own books via
          a Due-from/Due-to clearing account, so neither branch&apos;s trial balance is disturbed.
        </p>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-6">
            {/* Source branch/account */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  From Branch *
                </label>
                <select
                  required
                  value={fromBranchId}
                  onChange={e => {
                    setFromBranchId(e.target.value ? Number(e.target.value) : '');
                    setFromAccountId('');
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select source branch...</option>
                  {branchOptions
                    .filter(b => b.id !== toBranchId)
                    .map(b => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  From Account *
                </label>
                <select
                  required
                  disabled={!fromBranchId}
                  value={fromAccountId}
                  onChange={e => setFromAccountId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                >
                  <option value="">
                    {!fromBranchId
                      ? 'Select a branch first...'
                      : loadingFromAccounts
                        ? 'Loading accounts...'
                        : 'Select account...'}
                  </option>
                  {postableFromAccounts.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.code} — {a.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Destination branch/account */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">To Branch *</label>
                <select
                  required
                  value={toBranchId}
                  onChange={e => {
                    setToBranchId(e.target.value ? Number(e.target.value) : '');
                    setToAccountId('');
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select destination branch...</option>
                  {branchOptions
                    .filter(b => b.id !== fromBranchId)
                    .map(b => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">To Account *</label>
                <select
                  required
                  disabled={!toBranchId}
                  value={toAccountId}
                  onChange={e => setToAccountId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                >
                  <option value="">
                    {!toBranchId
                      ? 'Select a branch first...'
                      : loadingToAccounts
                        ? 'Loading accounts...'
                        : 'Select account...'}
                  </option>
                  {postableToAccounts.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.code} — {a.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Amount and Date */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount *</label>
              <input
                type="text"
                inputMode="decimal"
                required
                value={amount}
                onChange={e => {
                  if (DECIMAL_INPUT_REGEX.test(e.target.value) || e.target.value === '') {
                    setAmount(e.target.value);
                  }
                }}
                placeholder="0.00"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder="Purpose of transfer..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Submit Buttons */}
          <div className="flex gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={() => navigate('/accounting/interbranch-transfers')}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createTransfer.isPending}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {createTransfer.isPending ? 'Creating Transfer...' : 'Create Transfer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default InterbranchTransferFormPage;
