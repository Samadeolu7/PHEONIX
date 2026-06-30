import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload, X } from 'lucide-react';
import bankService from '../../services/bankService';
import { cashierAccountService } from '../../services/treasuryService';
import type { BankAccount, CreateBankTransferRequest } from '../../types/banks';
import type { CashierAccount } from '../../types/treasury';

const DECIMAL_INPUT_REGEX = /^\d{0,16}(?:\.\d{0,2})?$/;

const BankTransferFormPage: React.FC = () => {
  const navigate = useNavigate();
  const [sourceType, setSourceType] = useState<'bank' | 'cashier'>('bank');
  const [formData, setFormData] = useState<CreateBankTransferRequest>({
    source_type: 'bank',
    source_bank_account: undefined,
    destination_bank_account: 0,
    amount: '',
    description: '',
    reference_number: '',
    transfer_date: new Date().toISOString().split('T')[0],
  });
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [cashierAccounts, setCashierAccounts] = useState<CashierAccount[]>([]);
  const [destinationAccounts, setDestinationAccounts] = useState<BankAccount[]>([]);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAccounts();
  }, []);

  useEffect(() => {
    setDestinationAccounts(bankAccounts.filter(acc => acc.id !== formData.source_bank_account));
  }, [formData.source_bank_account, bankAccounts]);

  const loadAccounts = async () => {
    try {
      const [banks, cashiers] = await Promise.all([
        bankService.listBankAccounts({ is_active: true }),
        cashierAccountService.getActive(),
      ]);
      setBankAccounts(banks);
      setCashierAccounts(cashiers);
    } catch (err: any) {
      console.error('Failed to load accounts:', err);
    }
  };

  const handleSourceTypeChange = (st: 'bank' | 'cashier') => {
    setSourceType(st);
    setFormData({
      ...formData,
      source_type: st,
      source_bank_account: undefined,
      source_cashier_account: undefined,
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setAttachment(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (sourceType === 'bank') {
        if (!formData.source_bank_account) {
          throw new Error('Please select a source bank account');
        }
      } else {
        if (!formData.source_cashier_account) {
          throw new Error('Please select a source cashier account');
        }
      }
      if (!formData.destination_bank_account) {
        throw new Error('Please select a destination account');
      }
      if (!formData.amount || isNaN(parseFloat(formData.amount)) || parseFloat(formData.amount) <= 0) {
        throw new Error('Please enter a valid amount');
      }

      const transfer = await bankService.createBankTransfer({
        ...formData,
        attachment,
      } as any);

      navigate(`/banks/transfers/${transfer.id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create transfer');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/banks/transfers')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Inter-bank Transfers
        </button>
        <h1 className="text-3xl font-bold text-gray-900">New Inter-bank Transfer</h1>
        <p className="text-gray-600 mt-1">Move funds between bank accounts</p>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {/* Source Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Source Type</label>
            <div className="flex gap-4">
              {(['bank', 'cashier'] as const).map(st => (
                <label key={st} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="sourceType"
                    value={st}
                    checked={sourceType === st}
                    onChange={() => handleSourceTypeChange(st)}
                    className="accent-blue-600"
                  />
                  <span className="text-sm text-gray-700 capitalize">{st === 'bank' ? 'Bank Account' : 'Cashier Account'}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Source Account */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Source {sourceType === 'bank' ? 'Bank' : 'Cashier'} Account *
            </label>
            {sourceType === 'bank' ? (
              <select
                required
                value={formData.source_bank_account || ''}
                onChange={e =>
                  setFormData({
                    ...formData,
                    source_bank_account: Number(e.target.value),
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Select source account...</option>
                {bankAccounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.account_name} ({acc.account_number}) - {acc.bank_name} - ₦
                    {parseFloat(acc.current_balance).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </option>
                ))}
              </select>
            ) : (
              <select
                required
                value={formData.source_cashier_account || ''}
                onChange={e =>
                  setFormData({
                    ...formData,
                    source_cashier_account: Number(e.target.value),
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Select source cashier account...</option>
                {cashierAccounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.code}) - ₦
                    {parseFloat(acc.balance || '0').toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Destination Account */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Destination Bank Account *
            </label>
            <select
              required
              value={formData.destination_bank_account || ''}
              onChange={e =>
                setFormData({
                  ...formData,
                  destination_bank_account: Number(e.target.value),
                })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Select destination account...</option>
              {destinationAccounts.map(acc => (
                <option key={acc.id} value={acc.id}>
                  {acc.account_name} ({acc.account_number}) - {acc.bank_name}
                  {acc.is_cashier_collection_account && ' [Collection Account]'}
                </option>
              ))}
            </select>
            {destinationAccounts.length === 0 && (
              <p className="text-sm text-amber-600 mt-1">
                Select a source account to see available destinations.
              </p>
            )}
          </div>

          {/* Amount and Date */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount *</label>
              <input
                type="text"
                inputMode="decimal"
                required
                value={formData.amount}
                onChange={e => {
                  if (DECIMAL_INPUT_REGEX.test(e.target.value) || e.target.value === '') {
                    setFormData({ ...formData, amount: e.target.value });
                  }
                }}
                placeholder="0.00"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Transfer Date</label>
              <input
                type="date"
                value={formData.transfer_date}
                onChange={e => setFormData({ ...formData, transfer_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
            <textarea
              required
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              placeholder="Purpose of transfer..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Reference Number */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reference Number</label>
            <input
              type="text"
              value={formData.reference_number}
              onChange={e => setFormData({ ...formData, reference_number: e.target.value })}
              placeholder="External reference (e.g., bank slip number)"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Attachment */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Attachment</label>
            <div className="mt-1 flex items-center gap-4">
              <label className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 cursor-pointer">
                <Upload className="w-5 h-5" />
                <span>Upload File</span>
                <input
                  type="file"
                  onChange={handleFileChange}
                  className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png"
                />
              </label>
              {attachment && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">{attachment.name}</span>
                  <button
                    type="button"
                    onClick={() => setAttachment(null)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Upload deposit slip, receipt, or supporting document
            </p>
          </div>

          {/* Submit Buttons */}
          <div className="flex gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={() => navigate('/banks/transfers')}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Creating Transfer...' : 'Create Transfer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default BankTransferFormPage;
