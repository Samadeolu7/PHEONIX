import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Building2, CreditCard, ExternalLink, AlertCircle } from 'lucide-react';
import { useBank, useCreateBank, useUpdateBank, useBankAccounts } from '../../hooks/useBanks';

const EMPTY_FORM = {
  bank_name: '',
  bank_code: '',
  branch_name: '',
  address: '',
  phone: '',
  email: '',
  account_manager_name: '',
  account_manager_phone: '',
  account_manager_email: '',
  is_active: true,
  notes: '',
};

type FormData = typeof EMPTY_FORM;

function toFormData(d: { [key: string]: unknown }): FormData {
  return {
    bank_name: (d.bank_name as string) ?? '',
    bank_code: (d.bank_code as string) ?? '',
    branch_name: (d.branch_name as string) ?? '',
    address: (d.address as string) ?? '',
    phone: (d.phone as string) ?? '',
    email: (d.email as string) ?? '',
    account_manager_name: (d.account_manager_name as string) ?? '',
    account_manager_phone: (d.account_manager_phone as string) ?? '',
    account_manager_email: (d.account_manager_email as string) ?? '',
    is_active: (d.is_active as boolean) ?? true,
    notes: (d.notes as string) ?? '',
  };
}

const BankFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const numericId = isEdit ? Number(id) : 0;

  const { data: bankData, isLoading: bankLoading } = useBank(numericId, isEdit);
  const { data: accounts = [] } = useBankAccounts({ bank: numericId, is_active: undefined });
  const createBank = useCreateBank();
  const updateBank = useUpdateBank();

  const [formData, setFormData] = useState<FormData>(EMPTY_FORM);
  const formInited = useRef(false);
  const [error, setError] = useState<string | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect -- legitimate: initialize form from async query data once */
  useEffect(() => {
    if (bankData && !formInited.current) {
      formInited.current = true;
      setFormData(toFormData(bankData));
    }
  }, [bankData]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.bank_name.trim()) {
      setError('Bank name is required.');
      return;
    }
    setError(null);
    try {
      if (isEdit) {
        await updateBank.mutateAsync({ id: numericId, data: formData });
      } else {
        await createBank.mutateAsync(formData);
      }
      navigate('/banks');
    } catch (err: unknown) {
      const e = err as {
        message?: string;
        response?: { data?: Record<string, unknown> };
        data?: Record<string, unknown>;
      };
      const data = e?.response?.data ?? e?.data ?? {};
      const msg = Object.values(data).flat().join(' ') || e?.message || 'Save failed.';
      setError(msg);
    }
  };

  const isSubmitting = createBank.isPending || updateBank.isPending;

  if (bankLoading) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Back to banks"
          onClick={() => navigate('/banks')}
          className="rounded-lg p-2 hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft className="h-5 w-5 text-gray-600" />
        </button>
        <div className="flex items-center gap-2">
          <Building2 className="h-6 w-6 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">{isEdit ? 'Edit Bank' : 'Add Bank'}</h1>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Bank Details */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
          <h2 className="font-semibold text-gray-800">Bank Details</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Bank Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="bank_name"
                value={formData.bank_name}
                onChange={handleChange}
                placeholder="e.g. First Bank of Nigeria"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Bank Code</label>
              <input
                type="text"
                name="bank_code"
                value={formData.bank_code}
                onChange={handleChange}
                placeholder="e.g. 011"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Branch Name</label>
              <input
                type="text"
                name="branch_name"
                value={formData.branch_name}
                onChange={handleChange}
                placeholder="e.g. Ikeja Branch"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Phone</label>
              <input
                type="text"
                name="phone"
                title="Phone"
                value={formData.phone}
                onChange={handleChange}
                placeholder="e.g. 08012345678"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
              <input
                type="email"
                name="email"
                title="Email"
                value={formData.email}
                onChange={handleChange}
                placeholder="e.g. info@bank.com"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-gray-700">Address</label>
              <textarea
                name="address"
                title="Address"
                value={formData.address}
                onChange={handleChange}
                rows={2}
                placeholder="Bank branch address"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="is_active"
              checked={formData.is_active}
              onChange={handleChange}
              className="h-4 w-4 rounded border-gray-300 text-blue-600"
            />
            <span className="font-medium text-gray-700">Active</span>
          </label>
        </div>

        {/* Account Manager */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
          <h2 className="font-semibold text-gray-800">Account Manager</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Name</label>
              <input
                type="text"
                name="account_manager_name"
                title="Account manager name"
                value={formData.account_manager_name}
                onChange={handleChange}
                placeholder="Account manager name"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Phone</label>
              <input
                type="text"
                name="account_manager_phone"
                title="Account manager phone"
                value={formData.account_manager_phone}
                onChange={handleChange}
                placeholder="Account manager phone"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
              <input
                type="email"
                name="account_manager_email"
                title="Account manager email"
                value={formData.account_manager_email}
                onChange={handleChange}
                placeholder="Account manager email"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <label className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
          <textarea
            name="notes"
            title="Notes"
            value={formData.notes}
            onChange={handleChange}
            rows={3}
            placeholder="Additional notes about this bank"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Save */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate('/banks')}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {isSubmitting ? 'Saving\u2026' : 'Save Bank'}
          </button>
        </div>
      </form>

      {/* Bank Accounts — GL account connection is done per account */}
      {isEdit && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-gray-500" />
              <h2 className="font-semibold text-gray-800">Bank Accounts &amp; GL Links</h2>
            </div>
            <button
              type="button"
              onClick={() => navigate(`/banks/accounts/new?bank=${id}`)}
              className="rounded-lg bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100 border border-blue-200"
            >
              + Add Account
            </button>
          </div>

          {accounts.length === 0 ? (
            <p className="text-sm text-gray-500">No accounts linked to this bank yet.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {accounts.map(acct => (
                <div key={acct.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{acct.account_name}</p>
                    <p className="text-xs text-gray-500">{acct.account_number}</p>
                    {acct.gl_account_code ? (
                      <p className="text-xs text-green-600 mt-0.5">
                        GL: {acct.gl_account_code} — {acct.gl_account_name}
                      </p>
                    ) : (
                      <p className="text-xs text-amber-600 mt-0.5">No GL account linked</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate(`/banks/accounts/${acct.id}/edit`)}
                    className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Edit / Link GL
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BankFormPage;
