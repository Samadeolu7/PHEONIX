/**
 * Petty Cash Fund Form Page
 * Create and edit petty cash funds
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { WalletIcon, SaveIcon, XIcon, CheckCircle2Icon, AlertCircleIcon } from 'lucide-react';
import {
  useCreatePettyCashFund,
  useUpdatePettyCashFund,
  usePettyCashFund,
  useSetupPettyCashFund,
} from '../../hooks/usePettyCash';
import { CreatePettyCashFund } from '../../types/pettyCash';

export const PettyCashFundForm: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;

  const [formData, setFormData] = useState<CreatePettyCashFund>({
    fund_name: '',
    custodian: 0,
    float_amount: '',
    petty_cash_account: 0,
    description: '',
    is_active: true,
  });

  const [setupData, setSetupData] = useState({
    sourceAccountId: 0,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [showSetupDialog, setShowSetupDialog] = useState(false);

  // Fetch data
  const { data: existingFund, isLoading: loadingFund } = usePettyCashFund(
    parseInt(id || '0'),
    isEditMode
  );

  // Mutations
  const createMutation = useCreatePettyCashFund();
  const updateMutation = useUpdatePettyCashFund();
  const setupMutation = useSetupPettyCashFund();

  // Load existing fund data
  useEffect(() => {
    if (existingFund && isEditMode) {
      setFormData({
        fund_name: existingFund.fund_name,
        custodian: existingFund.custodian,
        float_amount: existingFund.float_amount,
        petty_cash_account: existingFund.petty_cash_account,
        description: existingFund.description || '',
        is_active: existingFund.is_active,
      });
    }
  }, [existingFund, isEditMode]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;

    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));

    // Clear error for this field
    if (errors[name]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.fund_name.trim()) {
      newErrors.fund_name = 'Fund name is required';
    }
    if (!formData.custodian) {
      newErrors.custodian = 'Please select a custodian';
    }
    if (!formData.float_amount || parseFloat(formData.float_amount) <= 0) {
      newErrors.float_amount = 'Please enter a valid float amount greater than 0';
    }
    if (!formData.petty_cash_account) {
      newErrors.petty_cash_account = 'Please select a petty cash account';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      if (isEditMode) {
        await updateMutation.mutateAsync({
          id: parseInt(id!),
          data: formData,
        });
        navigate('/treasury/petty-cash');
      } else {
        const result = await createMutation.mutateAsync(formData);
        // After creating, show setup dialog
        setShowSetupDialog(true);
        setSubmitting(false);
        return;
      }
    } catch (error: any) {
      setErrors({ general: error.response?.data?.message || 'Failed to save fund' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSetup = async () => {
    if (!setupData.sourceAccountId) {
      setErrors({ ...errors, setup: 'Please select a source account' });
      return;
    }

    setSubmitting(true);
    try {
      await setupMutation.mutateAsync({
        id: parseInt(id!),
        sourceAccountId: setupData.sourceAccountId,
      });
      navigate('/treasury/petty-cash');
    } catch (error: any) {
      setErrors({ setup: error.response?.data?.message || 'Failed to setup fund' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    navigate('/treasury/petty-cash');
  };

  if (isEditMode && loadingFund) {
    return (
      <div className="p-8">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-64 mb-6"></div>
          <div className="bg-white rounded-lg shadow p-6 space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Show setup dialog after fund creation
  if (showSetupDialog) {
    return (
      <div className="p-8">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-lg shadow p-8">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
                <CheckCircle2Icon className="h-8 w-8 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold">Fund Created Successfully!</h2>
              <p className="text-gray-600 mt-2">
                Now let's set up the initial float by transferring money from a source account.
              </p>
            </div>

            {errors.setup && (
              <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircleIcon className="h-5 w-5 text-red-600 mt-0.5" />
                  <p className="text-sm text-red-700">{errors.setup}</p>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Source Account (Bank/Cash) <span className="text-red-500">*</span>
                </label>
                <select
                  value={setupData.sourceAccountId}
                  onChange={e =>
                    setSetupData({ ...setupData, sourceAccountId: parseInt(e.target.value) })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select account to transfer from...</option>
                  {/* TODO: Load bank/cash accounts from API */}
                  <option value="1">Main Bank Account</option>
                  <option value="2">Operating Cash Account</option>
                  <option value="3">Savings Account</option>
                </select>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-blue-900 mb-2">What happens when you setup?</h3>
                <ul className="text-sm text-blue-700 space-y-1">
                  <li>
                    • ${parseFloat(formData.float_amount || '0').toLocaleString()} will be
                    transferred from the source account
                  </li>
                  <li>• A journal entry will be created for accounting purposes</li>
                  <li>• The fund will be ready for voucher requests</li>
                </ul>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  onClick={() => navigate('/treasury/petty-cash')}
                  disabled={submitting}
                  className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                >
                  Skip for Now
                </button>
                <button
                  onClick={handleSetup}
                  disabled={submitting}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? 'Setting up...' : 'Complete Setup'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <WalletIcon className="h-8 w-8" />
          {isEditMode ? 'Edit Petty Cash Fund' : 'New Petty Cash Fund'}
        </h1>
        <p className="text-gray-600 mt-1">
          {isEditMode
            ? 'Update fund details'
            : 'Create a new petty cash fund with a fixed float amount'}
        </p>
      </div>

      {/* Error Alert */}
      {errors.general && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircleIcon className="h-5 w-5 text-red-600 mt-0.5" />
            <div>
              <h3 className="font-semibold text-red-900">Error</h3>
              <p className="text-sm text-red-700 mt-1">{errors.general}</p>
            </div>
          </div>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-6">
        {/* Fund Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Fund Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            name="fund_name"
            value={formData.fund_name}
            onChange={handleChange}
            placeholder="e.g., Main Office Petty Cash, Admin Petty Cash"
            className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              errors.fund_name ? 'border-red-500' : 'border-gray-300'
            }`}
          />
          {errors.fund_name && <p className="text-red-500 text-sm mt-1">{errors.fund_name}</p>}
        </div>

        {/* Custodian */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Custodian <span className="text-red-500">*</span>
          </label>
          <select
            name="custodian"
            value={formData.custodian}
            onChange={handleChange}
            disabled={isEditMode && existingFund?.status !== 'draft'}
            className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              errors.custodian ? 'border-red-500' : 'border-gray-300'
            }`}
          >
            <option value="">Select custodian...</option>
            {/* TODO: Load users from API */}
            <option value="1">John Doe (Accountant)</option>
            <option value="2">Jane Smith (Admin)</option>
            <option value="3">Mike Johnson (Office Manager)</option>
          </select>
          {errors.custodian && <p className="text-red-500 text-sm mt-1">{errors.custodian}</p>}
        </div>

        {/* Float Amount */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Float Amount <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <span className="absolute left-3 top-2.5 text-gray-500">$</span>
            <input
              type="number"
              name="float_amount"
              value={formData.float_amount}
              onChange={handleChange}
              step="0.01"
              min="0"
              placeholder="0.00"
              disabled={isEditMode && existingFund?.status !== 'draft'}
              className={`w-full pl-8 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.float_amount ? 'border-red-500' : 'border-gray-300'
              }`}
            />
          </div>
          {errors.float_amount && (
            <p className="text-red-500 text-sm mt-1">{errors.float_amount}</p>
          )}
          <p className="text-sm text-gray-500 mt-1">
            This is the fixed amount that will be maintained in the petty cash fund
          </p>
        </div>

        {/* Petty Cash Account */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Petty Cash GL Account <span className="text-red-500">*</span>
          </label>
          <select
            name="petty_cash_account"
            value={formData.petty_cash_account}
            onChange={handleChange}
            disabled={isEditMode && existingFund?.status !== 'draft'}
            className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              errors.petty_cash_account ? 'border-red-500' : 'border-gray-300'
            }`}
          >
            <option value="">Select GL account...</option>
            {/* TODO: Load petty cash accounts from API */}
            <option value="1">1010 - Petty Cash - Main Office</option>
            <option value="2">1011 - Petty Cash - Admin</option>
            <option value="3">1012 - Petty Cash - Branch</option>
          </select>
          {errors.petty_cash_account && (
            <p className="text-red-500 text-sm mt-1">{errors.petty_cash_account}</p>
          )}
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
          <textarea
            name="description"
            value={formData.description}
            onChange={handleChange}
            rows={3}
            placeholder="Optional: Provide additional details about this fund..."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Is Active */}
        {isEditMode && (
          <div className="flex items-center">
            <input
              type="checkbox"
              name="is_active"
              checked={formData.is_active}
              onChange={handleChange}
              className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label className="ml-2 block text-sm text-gray-700">Active Fund</label>
          </div>
        )}

        {/* Info Box */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold text-blue-900 mb-2">About Petty Cash Funds</h3>
          <ul className="text-sm text-blue-700 space-y-1">
            <li>• The float amount is the fixed balance maintained in the fund</li>
            <li>• A custodian is responsible for managing vouchers and receipts</li>
            <li>
              • After creation, you'll need to setup the fund by transferring the initial float
            </li>
            <li>• Periodic reimbursements keep the fund at the float amount</li>
          </ul>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <button
            type="button"
            onClick={handleCancel}
            disabled={submitting}
            className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50"
          >
            <XIcon className="h-4 w-4" />
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50"
          >
            <SaveIcon className="h-4 w-4" />
            {submitting ? 'Saving...' : isEditMode ? 'Update Fund' : 'Create Fund'}
          </button>
        </div>
      </form>
    </div>
  );
};
