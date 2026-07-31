// src/pages/treasury/CashTransferFormPage.tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpCircle } from 'lucide-react';
import { cashierAccountService, cashTransferService } from '../../services/treasuryService';
import { accountService } from '../../services/accountService';

const DECIMAL_INPUT_REGEX = /^\d{0,16}(?:\.\d{0,2})?$/;

const CashTransferFormPage: React.FC = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [cashierAccountId, setCashierAccountId] = useState('');
  const [destinationAccountId, setDestinationAccountId] = useState('');
  const [transferDate, setTransferDate] = useState('');
  const [amount, setAmount] = useState('');
  const [bankDepositSlip, setBankDepositSlip] = useState('');
  const [bankReference, setBankReference] = useState('');
  const [depositProof, setDepositProof] = useState<File | null>(null);
  const [formError, setFormError] = useState('');

  /* ── Data loaders ── */
  const { data: activeCashierAccounts = [] } = useQuery({
    queryKey: ['cashier-accounts-active'],
    queryFn: () => cashierAccountService.getActive(),
    staleTime: 60_000,
  });

  const { data: glAccounts = [] } = useQuery({
    queryKey: ['gl-accounts-all'],
    // Moving cash between named cashier/bank tills needs to see those
    // tills' own sub-ledger accounts, not just generic GL accounts.
    queryFn: () => accountService.getAccounts({ is_active: true, include_subledgers: true }),
    staleTime: 60_000,
  });

  /* ── Create mutation ── */
  const createMutation = useMutation({
    mutationFn: () =>
      cashTransferService.create({
        cashier_account: Number(cashierAccountId),
        destination_account: Number(destinationAccountId),
        transfer_date: transferDate || undefined,
        amount,
        bank_deposit_slip: bankDepositSlip.trim() || undefined,
        bank_reference: bankReference.trim() || undefined,
        deposit_proof: depositProof ?? undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cash-transfers'] });
      navigate('/treasury/cash-transfers');
    },
  });

  /* ── Submit ── */
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError('');

    if (!cashierAccountId) {
      setFormError('Please select a cashier account.');
      return;
    }
    if (!destinationAccountId) {
      setFormError('Please select a destination account.');
      return;
    }
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      setFormError('Please enter a valid transfer amount.');
      return;
    }

    try {
      await createMutation.mutateAsync();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create transfer.';
      setFormError(msg);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-2 mb-6">
          <ArrowUpCircle className="text-blue-500" size={22} />
          <div>
            <h1 className="text-xl font-bold text-gray-900">New Cash Transfer</h1>
            <p className="text-sm text-gray-500">
              Transfer cash from a cashier account to the bank
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

          {/* Cashier Account */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Cashier Account <span className="text-red-500">*</span>
            </label>
            <select
              title="Cashier account"
              value={cashierAccountId}
              onChange={e => setCashierAccountId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">— Select cashier account —</option>
              {activeCashierAccounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.cashier_name ? ` (${a.cashier_name})` : ''}
                  {' — '}
                  {parseFloat(a.current_balance).toLocaleString('en-NG', {
                    style: 'currency',
                    currency: 'NGN',
                  })}
                </option>
              ))}
            </select>
          </div>

          {/* Destination Account */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Destination Account <span className="text-red-500">*</span>
            </label>
            <select
              title="Destination GL account"
              value={destinationAccountId}
              onChange={e => setDestinationAccountId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">— Select destination account —</option>
              {glAccounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.code ? `${a.code} – ` : ''}
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          {/* Transfer Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Transfer Date</label>
            <input
              type="date"
              title="Transfer date"
              value={transferDate}
              onChange={e => setTransferDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Amount (₦) <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              inputMode="decimal"
              title="Transfer amount"
              value={amount}
              onChange={e => {
                if (DECIMAL_INPUT_REGEX.test(e.target.value) || e.target.value === '') {
                  setAmount(e.target.value);
                }
              }}
              placeholder="0.00"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {/* Bank Deposit Slip */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Bank Deposit Slip No.
            </label>
            <input
              type="text"
              title="Bank deposit slip number"
              value={bankDepositSlip}
              onChange={e => setBankDepositSlip(e.target.value)}
              placeholder="Optional"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Bank Reference */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bank Reference</label>
            <input
              type="text"
              title="Bank reference number"
              value={bankReference}
              onChange={e => setBankReference(e.target.value)}
              placeholder="Optional"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Deposit Proof */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Deposit Proof (image / PDF)
            </label>
            <input
              type="file"
              title="Deposit proof document"
              accept="image/*,application/pdf"
              onChange={e => setDepositProof(e.target.files?.[0] ?? null)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-blue-50 file:text-blue-700"
            />
            {depositProof && (
              <p className="text-xs text-green-600 mt-1">Selected: {depositProof.name}</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              title="Cancel"
              onClick={() => navigate('/treasury/cash-transfers')}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              title="Create draft transfer"
              disabled={createMutation.isPending}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {createMutation.isPending ? 'Creating…' : 'Create Transfer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CashTransferFormPage;
