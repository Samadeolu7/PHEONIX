/**
 * Petty Cash Replenishment Form Page
 * Create replenishment request to restore fund balance
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import { format } from 'date-fns';
import {
  RefreshCwIcon,
  SaveIcon,
  XIcon,
  SendIcon,
  AlertCircleIcon,
  CheckCircle2Icon,
  WalletIcon,
} from 'lucide-react';
import {
  useCreatePettyCashReplenishment,
  useUpdatePettyCashReplenishment,
  usePettyCashReplenishment,
  useSubmitReplenishment,
  useDefaultPettyCashFund,
  usePettyCashVouchers,
} from '../../hooks/usePettyCash';
import { useBankAccounts } from '../../hooks/useBanks';
import { CreatePettyCashReplenishment } from '../../types/pettyCash';

export const PettyCashReplenishmentForm: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const isEditMode = !!id;
  const preSelectedFund = searchParams.get('fund');

  // Form state
  const [formData, setFormData] = useState<CreatePettyCashReplenishment>({
    fund: preSelectedFund ? parseInt(preSelectedFund) : 0,
    replenishment_date: format(new Date(), 'yyyy-MM-dd'),
    voucher_ids: [],
    bank_account: null,
    requested_amount: '',
  });

  // Track whether custodian manually overrode the requested amount
  const [requestedAmountOverridden, setRequestedAmountOverridden] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [selectedVouchers, setSelectedVouchers] = useState<Set<number>>(new Set());

  // Fetch data
  const { data: existingReplenishment, isLoading: loadingReplenishment } =
    usePettyCashReplenishment(parseInt(id || '0'), isEditMode);
  const { data: defaultFund, isLoading: loadingFund, error: fundError } = useDefaultPettyCashFund();
  const funds = defaultFund ? [defaultFund] : [];
  const loadingFunds = loadingFund;
  const { data: bankAccountsData } = useBankAccounts({ is_active: true });
  const bankAccounts = bankAccountsData ?? [];
  const { data: allVouchers = [] } = usePettyCashVouchers({
    fund: formData.fund || undefined,
    status: 'retired',
  });

  // Mutations
  const createMutation = useCreatePettyCashReplenishment();
  const updateMutation = useUpdatePettyCashReplenishment();
  const submitMutation = useSubmitReplenishment();

  // Load existing replenishment data
  useEffect(() => {
    if (existingReplenishment && isEditMode) {
      setFormData({
        fund: existingReplenishment.fund,
        replenishment_date: existingReplenishment.replenishment_date,
        voucher_ids: existingReplenishment.vouchers || [],
        bank_account: existingReplenishment.bank_account ?? null,
        requested_amount:
          existingReplenishment.requested_amount ?? existingReplenishment.replenishment_amount,
      });
      setSelectedVouchers(new Set(existingReplenishment.vouchers || []));
      setRequestedAmountOverridden(true); // editing — keep their amount
    }
  }, [existingReplenishment, isEditMode]);

  // Auto-select the single petty cash fund
  useEffect(() => {
    if (funds.length > 0 && !formData.fund) {
      setFormData(prev => ({ ...prev, fund: funds[0].id }));
    }
  }, [funds]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-update requested_amount when voucher selection changes (unless overridden)
  useEffect(() => {
    if (!requestedAmountOverridden) {
      const total = availableVouchers
        .filter(v => selectedVouchers.has(v.id))
        .reduce((sum, v) => sum + (parseFloat(v.amount) || 0), 0);
      setFormData(prev => ({ ...prev, requested_amount: total > 0 ? total.toFixed(2) : '' }));
    }
  }, [selectedVouchers, requestedAmountOverridden]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filter out vouchers already included in other replenishments
  const availableVouchers = allVouchers.filter(v => {
    // If editing, include vouchers from current replenishment
    if (isEditMode && existingReplenishment?.vouchers?.includes(v.id)) {
      return true;
    }
    // Only show retired vouchers not yet replenished
    return v.status === 'retired';
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    // Clear error for this field
    if (errors[name]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }

    // Reset selected vouchers when fund changes
    if (name === 'fund') {
      setSelectedVouchers(new Set());
    }
  };

  const handleVoucherToggle = (voucherId: number) => {
    setSelectedVouchers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(voucherId)) {
        newSet.delete(voucherId);
      } else {
        newSet.add(voucherId);
      }
      return newSet;
    });
  };

  const calculateTotalAmount = (): number => {
    return availableVouchers
      .filter(v => selectedVouchers.has(v.id))
      .reduce((sum, v) => sum + parseFloat(v.amount), 0);
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.replenishment_date) {
      newErrors.replenishment_date = 'Request date is required';
    }
    // vouchers are intentionally optional — a replenishment may be a direct
    // fund top-up with no prior spending (e.g. initial injection).
    if (!formData.bank_account) {
      newErrors.bank_account = 'Please select the bank account to fund this reimbursement from';
    }
    const reqAmt = parseFloat(String(formData.requested_amount || '0'));
    if (!formData.requested_amount || reqAmt <= 0) {
      newErrors.requested_amount = 'Please enter the amount you are requesting';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSaveDraft = async () => {
    if (!formData.replenishment_date) {
      setErrors({ general: 'Request date is required to save a draft' });
      return;
    }

    const dataToSave = {
      ...formData,
      voucher_ids: Array.from(selectedVouchers),
    };

    setSubmitting(true);
    try {
      if (isEditMode) {
        await updateMutation.mutateAsync({
          id: parseInt(id!),
          data: dataToSave,
        });
      } else {
        await createMutation.mutateAsync(dataToSave);
      }
      navigate('/treasury/petty-cash');
    } catch (error: any) {
      setErrors({ general: error.response?.data?.message || 'Failed to save reimbursement' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const dataToSave = {
      ...formData,
      voucher_ids: Array.from(selectedVouchers),
    };

    setSubmitting(true);
    try {
      let replenishmentId: number;

      if (isEditMode) {
        await updateMutation.mutateAsync({
          id: parseInt(id!),
          data: dataToSave,
        });
        replenishmentId = parseInt(id!);
      } else {
        const result = await createMutation.mutateAsync(dataToSave);
        replenishmentId = result.id;
      }

      // Submit for verification
      await submitMutation.mutateAsync(replenishmentId);
      navigate('/treasury/petty-cash');
    } catch (error: any) {
      setErrors({ general: error.response?.data?.message || 'Failed to submit reimbursement' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    navigate('/treasury/petty-cash');
  };

  if (isEditMode && loadingReplenishment) {
    return (
      <div className="p-8">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-64 mb-6"></div>
          <div className="bg-white rounded-lg shadow p-6 space-y-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Don't allow editing if not in draft/submitted status
  if (
    isEditMode &&
    existingReplenishment &&
    !['draft', 'submitted'].includes(existingReplenishment.status)
  ) {
    return (
      <div className="p-8">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <div className="flex items-start gap-3">
            <AlertCircleIcon className="h-5 w-5 text-yellow-600 mt-0.5" />
            <div>
              <h3 className="font-semibold text-yellow-900">Cannot Edit Reimbursement</h3>
              <p className="text-sm text-yellow-700 mt-1">
                This reimbursement is in {existingReplenishment.status} status and cannot be edited.
              </p>
              <button
                onClick={() => navigate('/treasury/petty-cash')}
                className="mt-4 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const selectedFund = funds.find(f => f.id === formData.fund);
  const totalAmount = calculateTotalAmount();

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <RefreshCwIcon className="h-8 w-8" />
          {isEditMode ? 'Edit Reimbursement Request' : 'New Reimbursement Request'}
        </h1>
        <p className="text-gray-600 mt-1">
          {isEditMode
            ? 'Update reimbursement details'
            : 'Request reimbursement to restore petty cash fund'}
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
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white rounded-lg shadow p-6 space-y-6">
          {/* Fund Info - auto-selected, no selection needed */}
          {loadingFunds ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
              <p className="text-sm text-gray-500">Loading petty cash fund...</p>
            </div>
          ) : fundError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-sm text-red-700">
                Petty cash GL account not set up. Contact your administrator.
              </p>
            </div>
          ) : funds.length > 0 ? (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 flex items-center gap-3">
              <WalletIcon className="h-5 w-5 text-blue-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-blue-800">{funds[0].fund_name}</p>
                <p className="text-xs text-blue-700 mt-0.5">
                  Current balance: ₦{parseFloat(funds[0].current_balance).toLocaleString()} &nbsp;|
                  Float: ₦{parseFloat(funds[0].float_amount).toLocaleString()}
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-sm text-red-700">
                No active petty cash fund found. Contact your administrator.
              </p>
            </div>
          )}

          {/* Request Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Request Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              name="replenishment_date"
              title="Request Date"
              value={formData.replenishment_date ?? ''}
              onChange={handleChange}
              className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.replenishment_date ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.replenishment_date && (
              <p className="text-red-500 text-sm mt-1">{errors.replenishment_date}</p>
            )}
          </div>

          {/* Bank Account Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Source Bank Account <span className="text-red-500">*</span>
            </label>
            <select
              name="bank_account"
              title="Source Bank Account"
              value={formData.bank_account ?? ''}
              onChange={e =>
                setFormData(prev => ({
                  ...prev,
                  bank_account: e.target.value ? parseInt(e.target.value) : null,
                }))
              }
              className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.bank_account ? 'border-red-500' : 'border-gray-300'
              }`}
            >
              <option value="">Select bank account...</option>
              {bankAccounts.map((acct: any) => (
                <option key={acct.id} value={acct.id}>
                  {acct.bank_name ?? acct.bank_details?.bank_name} — {acct.account_number} (
                  {acct.account_name})
                </option>
              ))}
            </select>
            {errors.bank_account && (
              <p className="text-red-500 text-sm mt-1">{errors.bank_account}</p>
            )}
            {bankAccounts.length === 0 && (
              <p className="text-sm text-amber-600 mt-1">
                No active bank accounts found.{' '}
                <Link to="/banks/accounts/new" className="underline">
                  Set up a bank account
                </Link>{' '}
                first.
              </p>
            )}
          </div>

          {/* Fund Info + Reimbursement Amount */}
          {selectedFund && (
            <div className="space-y-3">
              {/* Fund balance info */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-blue-900 mb-2">Fund Information</h3>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-blue-700">Float Amount:</p>
                    <p className="font-semibold text-blue-900">
                      ₦{parseFloat(selectedFund.float_amount).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-blue-700">Current Balance:</p>
                    <p className="font-semibold text-blue-900">
                      ₦{parseFloat(selectedFund.current_balance).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-blue-700">Needed to Restore:</p>
                    <p className="font-semibold text-blue-900">
                      ₦
                      {(
                        parseFloat(selectedFund.float_amount) -
                        parseFloat(selectedFund.current_balance)
                      ).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>

              {/* Reimbursement amount — prominent, always visible */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Requested Reimbursement Amount <span className="text-red-500">*</span>
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  Enter the amount to request. If you selected vouchers above, this is pre-filled
                  from the voucher total.
                </p>
                <div className="flex items-center gap-3">
                  <span className="text-gray-500 font-medium">₦</span>
                  <input
                    type="number"
                    name="requested_amount"
                    min="0"
                    step="0.01"
                    value={formData.requested_amount ?? ''}
                    onChange={e => {
                      setRequestedAmountOverridden(true);
                      setFormData(prev => ({ ...prev, requested_amount: e.target.value }));
                      if (errors.requested_amount) {
                        setErrors(prev => {
                          const n = { ...prev };
                          delete n.requested_amount;
                          return n;
                        });
                      }
                    }}
                    placeholder="0.00"
                    className={`flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-xl font-bold ${
                      errors.requested_amount ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                  {requestedAmountOverridden && (
                    <button
                      type="button"
                      title="Reset to voucher total"
                      onClick={() => {
                        setRequestedAmountOverridden(false);
                        const total = availableVouchers
                          .filter(v => selectedVouchers.has(v.id))
                          .reduce((sum, v) => sum + parseFloat(v.amount), 0);
                        setFormData(prev => ({
                          ...prev,
                          requested_amount: total > 0 ? total.toFixed(2) : '',
                        }));
                      }}
                      className="text-xs text-blue-600 hover:underline whitespace-nowrap"
                    >
                      Reset to voucher total
                    </button>
                  )}
                </div>
                {errors.requested_amount && (
                  <p className="text-red-500 text-sm mt-1">{errors.requested_amount}</p>
                )}
                {/* Voucher total hint */}
                {selectedVouchers.size > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    Voucher total: ₦
                    {totalAmount.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Voucher Selection */}
        {formData.fund > 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-lg font-semibold">
                  Select Retired Vouchers{' '}
                  <span className="text-sm font-normal text-gray-500">(optional)</span>
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Attach retired vouchers to reconcile spending, or leave empty for a direct fund
                  top-up.
                </p>
              </div>
              <span className="text-sm text-gray-600">
                {selectedVouchers.size} voucher(s) selected • Total: ₦{totalAmount.toLocaleString()}
              </span>
            </div>

            {errors.vouchers && <p className="text-red-500 text-sm mb-4">{errors.vouchers}</p>}

            {availableVouchers.length === 0 ? (
              <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-lg bg-gray-50">
                <CheckCircle2Icon className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">No retired vouchers — that's OK</p>
                <p className="text-sm text-gray-400 mt-1">
                  You can submit this as a direct fund top-up without vouchers. Enter the amount
                  above and proceed.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {availableVouchers.map(voucher => (
                  <div
                    key={voucher.id}
                    onClick={() => handleVoucherToggle(voucher.id)}
                    className={`p-4 border rounded-lg cursor-pointer transition-all ${
                      selectedVouchers.has(voucher.id)
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        title={`Select voucher ${voucher.voucher_number}`}
                        checked={selectedVouchers.has(voucher.id)}
                        onChange={() => handleVoucherToggle(voucher.id)}
                        className="mt-1 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <div className="flex-1">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium">{voucher.voucher_number}</p>
                            <p className="text-sm text-gray-600 mt-1">{voucher.description}</p>
                            <p className="text-xs text-gray-500 mt-1">
                              Payee: {voucher.payee_name} • Category:{' '}
                              {voucher.expense_category_name}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-lg">
                              ₦{parseFloat(voucher.amount).toLocaleString()}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              {voucher.retired_at
                                ? format(new Date(voucher.retired_at), 'MMM dd, yyyy')
                                : '—'}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Summary */}
        {selectedVouchers.size > 0 && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-6">
            <div className="flex items-start gap-3">
              <CheckCircle2Icon className="h-6 w-6 text-green-600 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-green-900">Reimbursement Summary</h3>
                <div className="mt-3 grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-green-700">Vouchers Selected:</p>
                    <p className="font-semibold text-green-900">{selectedVouchers.size}</p>
                  </div>
                  <div>
                    <p className="text-sm text-green-700">Vouchers Total:</p>
                    <p className="font-semibold text-green-900">₦{totalAmount.toLocaleString()}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-sm text-green-700">Requested Reimbursement Amount:</p>
                    <p className="text-2xl font-bold text-green-900">
                      ₦
                      {parseFloat(String(formData.requested_amount || 0)).toLocaleString(
                        undefined,
                        { minimumFractionDigits: 2, maximumFractionDigits: 2 }
                      )}
                    </p>
                  </div>
                </div>
                <p className="text-sm text-green-700 mt-3">
                  After approval and posting, the fund balance will be restored by the approved
                  amount through a journal entry.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 bg-white rounded-lg shadow p-6">
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
            type="button"
            onClick={handleSaveDraft}
            disabled={submitting}
            className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50"
          >
            <SaveIcon className="h-4 w-4" />
            Save Draft
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50"
          >
            <SendIcon className="h-4 w-4" />
            {submitting ? 'Submitting...' : 'Submit for Verification'}
          </button>
        </div>
      </form>
    </div>
  );
};
