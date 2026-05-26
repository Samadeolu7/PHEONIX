// src/pages/treasury/CashierAccountFormPage.tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import { cashierAccountService } from '../../services/treasuryService';
import { accountService } from '../../services/accountService';
import { staffService } from '../../services/staffService';

const CashierAccountFormPage: React.FC = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [accountNumber, setAccountNumber] = useState('');
  const [name, setName] = useState('');
  const [cashierId, setCashierId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [dailyLimit, setDailyLimit] = useState('');
  const [dualApproval, setDualApproval] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [formError, setFormError] = useState('');

  /* ── Data loaders ── */
  const { data: staffList = [] } = useQuery({
    queryKey: ['staff-active'],
    queryFn: () => staffService.getAllStaff({ is_active: true }),
    staleTime: 60_000,
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ['gl-accounts-asset'],
    queryFn: () => accountService.getAccounts({ account_type: 'ASSET', is_active: true }),
    staleTime: 60_000,
  });

  /* ── Create mutation ── */
  const createMutation = useMutation({
    mutationFn: () =>
      cashierAccountService.create({
        account_number: accountNumber.trim(),
        name: name.trim(),
        cashier: Number(cashierId),
        account: Number(accountId),
        daily_collection_limit: dailyLimit.trim() || undefined,
        requires_dual_approval: dualApproval,
        is_active: isActive,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cashier-accounts'] });
      navigate('/treasury/cashier-accounts');
    },
  });

  /* ── Submit handler ── */
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError('');

    if (!accountNumber.trim()) {
      setFormError('Account number is required.');
      return;
    }
    if (!name.trim()) {
      setFormError('Account name is required.');
      return;
    }
    if (!cashierId) {
      setFormError('Please select a cashier (staff member).');
      return;
    }
    if (!accountId) {
      setFormError('Please select a GL account.');
      return;
    }

    try {
      await createMutation.mutateAsync();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create cashier account.';
      setFormError(msg);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-2 mb-6">
          <Users className="text-blue-500" size={22} />
          <div>
            <h1 className="text-xl font-bold text-gray-900">New Cashier Account</h1>
            <p className="text-sm text-gray-500">
              Create a virtual cash till linked to a staff member
            </p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-lg border border-gray-200 p-6 space-y-5"
        >
          {/* Error banner */}
          {formError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {formError}
            </div>
          )}

          {/* Account Number */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Account Number <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              title="Account number"
              value={accountNumber}
              onChange={e => setAccountNumber(e.target.value)}
              placeholder="e.g. CA-0001"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Account Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              title="Account name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Branch Front-Desk Cashier"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {/* Cashier (staff) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Assigned Cashier (Staff) <span className="text-red-500">*</span>
            </label>
            <select
              title="Assigned cashier"
              value={cashierId}
              onChange={e => setCashierId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">— Select staff member —</option>
              {staffList.map(s => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                  {s.employee_id ? ` (${s.employee_id})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* GL Account */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Linked GL Account (Asset) <span className="text-red-500">*</span>
            </label>
            <select
              title="Linked GL account"
              value={accountId}
              onChange={e => setAccountId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">— Select account —</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.code ? `${a.code} – ` : ''}
                  {a.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              Showing ASSET-type accounts only (cash / bank accounts)
            </p>
          </div>

          {/* Daily Limit */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Daily Collection Limit
            </label>
            <input
              type="number"
              title="Daily collection limit"
              value={dailyLimit}
              onChange={e => setDailyLimit(e.target.value)}
              placeholder="Leave blank for unlimited"
              min="0"
              step="0.01"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Toggles */}
          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                title="Requires dual approval"
                checked={dualApproval}
                onChange={e => setDualApproval(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Requires dual approval for transfers</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                title="Account is active"
                checked={isActive}
                onChange={e => setIsActive(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Account is active</span>
            </label>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              title="Cancel"
              onClick={() => navigate('/treasury/cashier-accounts')}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              title="Create cashier account"
              disabled={createMutation.isPending}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {createMutation.isPending ? 'Creating…' : 'Create Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CashierAccountFormPage;
