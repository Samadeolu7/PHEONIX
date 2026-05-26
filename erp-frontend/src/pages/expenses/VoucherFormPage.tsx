import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Calculator, AlertTriangle } from 'lucide-react';
import { useCreateVoucher, useUpdateVoucher, useVoucher } from '../../hooks/usePrepaidVouchers';
import { useActivePrepaidExpenses } from '../../hooks/usePrepaidExpenses';
import { useFixedAssets } from '../../hooks/useAssets';
import { CreateVoucherData, ValidationError } from '../../types/vouchers';

const VoucherFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = !!id;

  const [formData, setFormData] = useState<Partial<CreateVoucherData>>({
    beneficiary_type: 'asset',
    issue_date: new Date().toISOString().split('T')[0],
  });
  const [errors, setErrors] = useState<ValidationError>({});
  const [selectedPrepaidExpense, setSelectedPrepaidExpense] = useState<any>(null);

  // Queries
  const { data: existingVoucher } = useVoucher(Number(id), isEditing);
  const { data: prepaidExpensesData } = useActivePrepaidExpenses();
  const { data: assetsResponse } = useFixedAssets({ status: 'active' });
  const allAssets = Array.isArray(assetsResponse)
    ? assetsResponse
    : ((assetsResponse as any)?.results ?? []);
  // Mutations
  const createVoucher = useCreateVoucher();
  const updateVoucher = useUpdateVoucher();

  // Load existing data for editing
  useEffect(() => {
    if (existingVoucher && isEditing) {
      setFormData({
        prepaid_expense: existingVoucher.prepaid_expense,
        issue_date: existingVoucher.issue_date,
        expiry_date: existingVoucher.expiry_date,
        beneficiary_type: existingVoucher.beneficiary_type,
        beneficiary_name: existingVoucher.beneficiary_name,
        beneficiary_reference: existingVoucher.beneficiary_reference,
        allocated_units: existingVoucher.allocated_units,
        allocated_amount: existingVoucher.allocated_amount,
        odometer_reading: (existingVoucher as any).odometer_reading,
        redemption_date: existingVoucher.redemption_date,
        redemption_location: existingVoucher.redemption_location,
        notes: existingVoucher.notes,
      });

      // Find and set the selected prepaid expense
      if (prepaidExpensesData) {
        const prepaidExpense = prepaidExpensesData.find(
          (expense: any) => expense.id === existingVoucher.prepaid_expense
        );
        if (prepaidExpense) setSelectedPrepaidExpense(prepaidExpense);
      }
    }
  }, [existingVoucher, isEditing, prepaidExpensesData]);

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));

    // Clear field-specific errors
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const handlePrepaidExpenseChange = (prepaidExpense: any) => {
    setSelectedPrepaidExpense(prepaidExpense);
    handleInputChange('prepaid_expense', prepaidExpense.id);

    // Auto-calculate amount if unit cost is available
    if (prepaidExpense.unit_cost && formData.allocated_units) {
      const units = parseFloat(formData.allocated_units);
      const unitCost = parseFloat(prepaidExpense.unit_cost);
      const totalAmount = (units * unitCost).toFixed(2);
      handleInputChange('allocated_amount', totalAmount);
    }
  };

  const handleUnitsChange = (units: string) => {
    handleInputChange('allocated_units', units);

    // Auto-calculate amount if prepaid expense has unit cost
    if (selectedPrepaidExpense?.unit_cost && units) {
      const unitsNum = parseFloat(units);
      const unitCost = parseFloat(selectedPrepaidExpense.unit_cost);
      const totalAmount = (unitsNum * unitCost).toFixed(2);
      handleInputChange('allocated_amount', totalAmount);
    }
  };

  const calculateUnitCost = () => {
    if (formData.allocated_units && formData.allocated_amount) {
      const units = parseFloat(formData.allocated_units);
      const amount = parseFloat(formData.allocated_amount);
      return units > 0 ? (amount / units).toFixed(2) : '0.00';
    }
    return '0.00';
  };

  const validateForm = (): boolean => {
    const newErrors: ValidationError = {};

    // Required field validations
    if (!formData.prepaid_expense) newErrors.prepaid_expense = ['Prepaid Expense is required'];
    if (!formData.beneficiary_type) newErrors.beneficiary_type = ['Beneficiary type is required'];
    if (!formData.beneficiary_name) newErrors.beneficiary_name = ['Beneficiary name is required'];
    // Units only required for measurable (unit-based) expenses
    if (selectedPrepaidExpense?.measurable && !formData.allocated_units) {
      newErrors.allocated_units = ['Allocated units is required'];
    }
    if (!formData.allocated_amount) newErrors.allocated_amount = ['Allocated amount is required'];

    // Numeric validations
    if (
      selectedPrepaidExpense?.measurable &&
      formData.allocated_units &&
      (isNaN(parseFloat(formData.allocated_units)) || parseFloat(formData.allocated_units) <= 0)
    ) {
      newErrors.allocated_units = ['Allocated units must be greater than 0'];
    }
    if (formData.allocated_amount && (isNaN(parseFloat(formData.allocated_amount)) || parseFloat(formData.allocated_amount) <= 0)) {
      newErrors.allocated_amount = ['Allocated amount must be greater than 0'];
    }

    // Date validations
    if (formData.expiry_date && formData.issue_date) {
      const issueDate = new Date(formData.issue_date);
      const expiryDate = new Date(formData.expiry_date);
      if (expiryDate <= issueDate) {
        newErrors.expiry_date = ['Expiry date must be after issue date'];
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    try {
      // Prepare the data with proper types - keep decimal fields as strings
      const submitData: any = {
        prepaid_expense: Number(formData.prepaid_expense),
        issue_date: formData.issue_date,
        expiry_date: formData.expiry_date || null,
        beneficiary_type: formData.beneficiary_type,
        beneficiary_name: formData.beneficiary_name,
        // Optional text fields: send empty string, never null
        beneficiary_reference: formData.beneficiary_reference || '',
        notes: formData.notes || '',
        // Non-measurable (amount-only) expenses don't track units; send 0
        allocated_units: selectedPrepaidExpense?.measurable
          ? formData.allocated_units
            ? parseFloat(formData.allocated_units).toFixed(2)
            : '0.00'
          : '0.00',
        allocated_amount: formData.allocated_amount
          ? parseFloat(formData.allocated_amount).toFixed(2)
          : '0.00',
        odometer_reading: (formData as any).odometer_reading
          ? parseFloat((formData as any).odometer_reading).toFixed(2)
          : null,
      };

      // Only include redemption fields when editing (not on creation)
      if (isEditing) {
        submitData.redemption_date = formData.redemption_date || null;
        submitData.redemption_location = formData.redemption_location || '';
      }

      if (isEditing) {
        await updateVoucher.mutateAsync({
          id: Number(id),
          data: submitData,
        });
        alert('Voucher updated successfully');
      } else {
        const result = await createVoucher.mutateAsync(submitData as CreateVoucherData);
        alert(`Voucher ${result.voucher_number} created successfully`);
      }
      navigate('/expenses/vouchers');
    } catch (error: any) {
      if (error.response?.data) {
        setErrors(error.response.data);
      } else {
        alert('Failed to save voucher');
      }
    }
  };
  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/expenses/vouchers')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft size={20} />
          Back to Vouchers
        </button>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            {isEditing ? 'Edit' : 'Create'} Prepaid Voucher
          </h1>
          <p className="text-gray-600">
            {isEditing
              ? 'Update voucher details'
              : 'Create a new prepaid voucher for resource consumption'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Prepaid Expense Selection */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Prepaid Expense Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Prepaid Expense *
              </label>
              <select
                aria-label="Prepaid Expense"
                value={formData.prepaid_expense || ''}
                onChange={e => {
                  const prepaidExpense = prepaidExpensesData?.find(
                    (exp: any) => exp.id === Number(e.target.value)
                  );
                  if (prepaidExpense) handlePrepaidExpenseChange(prepaidExpense);
                }}
                className={`w-full border rounded-md px-3 py-2 ${
                  errors.prepaid_expense ? 'border-red-300' : 'border-gray-300'
                }`}
                required
                disabled={isEditing} // Don't allow changing prepaid expense when editing
              >
                <option value="">Select prepaid expense...</option>
                {prepaidExpensesData?.map((expense: any) => (
                  <option key={expense.id} value={expense.id}>
                    {expense.reference_number} - {expense.category_name} (₦
                    {parseFloat(expense.remaining_amount).toLocaleString()} remaining)
                  </option>
                ))}
              </select>
              {errors.prepaid_expense && (
                <p className="mt-1 text-sm text-red-600">{errors.prepaid_expense[0]}</p>
              )}
            </div>

            {selectedPrepaidExpense && (
              <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                <h3 className="text-sm font-medium text-blue-900 mb-2">Prepaid Expense Details</h3>
                <div className="space-y-1 text-sm text-blue-800">
                  <p>
                    <span className="font-medium">Reference:</span>{' '}
                    {selectedPrepaidExpense.reference_number}
                  </p>
                  <p>
                    <span className="font-medium">Category:</span>{' '}
                    {selectedPrepaidExpense.category_name}
                  </p>
                  <p>
                    <span className="font-medium">Description:</span>{' '}
                    {selectedPrepaidExpense.description}
                  </p>
                  <p>
                    <span className="font-medium">Remaining Amount:</span> ₦
                    {parseFloat(selectedPrepaidExpense.remaining_amount).toLocaleString()}
                  </p>
                  {selectedPrepaidExpense.measurable && selectedPrepaidExpense.unit_of_measure && (
                    <p>
                      <span className="font-medium">Remaining Units:</span>{' '}
                      {parseFloat(selectedPrepaidExpense.remaining_units).toLocaleString()}{' '}
                      {selectedPrepaidExpense.unit_of_measure}
                    </p>
                  )}
                  {selectedPrepaidExpense.unit_cost && (
                    <p>
                      <span className="font-medium">Unit Cost:</span> ₦
                      {parseFloat(selectedPrepaidExpense.unit_cost).toFixed(2)}/unit
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Beneficiary Information */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Beneficiary Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Beneficiary Type *
              </label>
              <select
                aria-label="Beneficiary Type"
                value={formData.beneficiary_type || 'asset'}
                onChange={e => {
                  handleInputChange('beneficiary_type', e.target.value);
                  handleInputChange('beneficiary_reference', '');
                  handleInputChange('beneficiary_name', '');
                }}
                className={`w-full border rounded-md px-3 py-2 ${
                  errors.beneficiary_type ? 'border-red-300' : 'border-gray-300'
                }`}
                required
              >
                <option value="asset">Asset/Vehicle</option>
                <option value="employee">Employee</option>
                <option value="department">Department</option>
                <option value="other">Other</option>
              </select>
              {errors.beneficiary_type && (
                <p className="mt-1 text-sm text-red-600">{errors.beneficiary_type[0]}</p>
              )}
            </div>

            {/* Asset picker shown when type is asset */}
            {formData.beneficiary_type === 'asset' ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Select Asset *
                </label>
                <select
                  aria-label="Select Asset"
                  value={formData.beneficiary_reference || ''}
                  onChange={e => {
                    const asset = allAssets.find((a: any) => a.asset_number === e.target.value);
                    if (asset) {
                      handleInputChange('beneficiary_reference', asset.asset_number);
                      handleInputChange('beneficiary_name', asset.name);
                    } else {
                      handleInputChange('beneficiary_reference', '');
                      handleInputChange('beneficiary_name', '');
                    }
                  }}
                  className={`w-full border rounded-md px-3 py-2 ${
                    errors.beneficiary_reference ? 'border-red-300' : 'border-gray-300'
                  }`}
                >
                  <option value="">Select asset…</option>
                  {allAssets.map((asset: any) => (
                    <option key={asset.id} value={asset.asset_number}>
                      {asset.asset_number} — {asset.name}
                      {asset.registration_number ? ` (${asset.registration_number})` : ''}
                    </option>
                  ))}
                </select>
                {errors.beneficiary_reference && (
                  <p className="mt-1 text-sm text-red-600">{errors.beneficiary_reference[0]}</p>
                )}
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Beneficiary Name *
                </label>
                <input
                  type="text"
                  value={formData.beneficiary_name || ''}
                  onChange={e => handleInputChange('beneficiary_name', e.target.value)}
                  className={`w-full border rounded-md px-3 py-2 ${
                    errors.beneficiary_name ? 'border-red-300' : 'border-gray-300'
                  }`}
                  placeholder="e.g., John Doe, IT Department"
                  required
                />
                {errors.beneficiary_name && (
                  <p className="mt-1 text-sm text-red-600">{errors.beneficiary_name[0]}</p>
                )}
              </div>
            )}

            {/* Auto-filled name when asset is selected */}
            {formData.beneficiary_type === 'asset' && formData.beneficiary_name && (
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Asset Name</label>
                <input
                  aria-label="Asset Name"
                  type="text"
                  value={formData.beneficiary_name}
                  readOnly
                  className="w-full border border-gray-200 bg-gray-50 rounded-md px-3 py-2 text-gray-600"
                />
              </div>
            )}

            {/* Non-asset reference field */}
            {formData.beneficiary_type !== 'asset' && (
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Beneficiary Reference
                </label>
                <input
                  type="text"
                  value={formData.beneficiary_reference || ''}
                  onChange={e => handleInputChange('beneficiary_reference', e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  placeholder="e.g., EMP-123, DEPT-IT"
                />
                <p className="mt-1 text-xs text-gray-500">Employee ID, Department code, etc.</p>
              </div>
            )}

            {/* Baseline reading — for vehicles use odometer (km), for generators use engine hours, skip for others */}
            {formData.beneficiary_type === 'asset' && (
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Baseline Reading at Issue
                  <span className="ml-1 text-xs font-normal text-gray-400">
                    (Odometer km — or Engine Hours for generators)
                  </span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={(formData as any).odometer_reading || ''}
                  onChange={e => handleInputChange('odometer_reading', e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  placeholder="e.g., 45230 (km) or 1284 (hrs)"
                  aria-label="Baseline reading at voucher issue"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Enter the current odometer (vehicles/trucks) or engine-hour meter (generators,
                  pumps). This becomes the starting point when you record the first consumption
                  against this voucher. Leave blank for assets that don't use measurement-based
                  tracking.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Allocation Details */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Allocation Details</h2>
          <div
            className={`grid grid-cols-1 gap-4 ${
              selectedPrepaidExpense?.measurable ? 'md:grid-cols-3' : 'md:grid-cols-2'
            }`}
          >
            {selectedPrepaidExpense?.measurable && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Allocated Units *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.allocated_units || ''}
                  onChange={e => handleUnitsChange(e.target.value)}
                  className={`w-full border rounded-md px-3 py-2 ${
                    errors.allocated_units ? 'border-red-300' : 'border-gray-300'
                  }`}
                  placeholder="0.00"
                  required
                />
                {errors.allocated_units && (
                  <p className="mt-1 text-sm text-red-600">{errors.allocated_units[0]}</p>
                )}
                {selectedPrepaidExpense.unit_of_measure && (
                  <p className="mt-1 text-xs text-gray-500">
                    Unit: {selectedPrepaidExpense.unit_of_measure}
                  </p>
                )}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Allocated Amount *
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.allocated_amount || ''}
                onChange={e => handleInputChange('allocated_amount', e.target.value)}
                className={`w-full border rounded-md px-3 py-2 ${
                  errors.allocated_amount ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="0.00"
                required
              />
              {errors.allocated_amount && (
                <p className="mt-1 text-sm text-red-600">{errors.allocated_amount[0]}</p>
              )}
            </div>

            {selectedPrepaidExpense?.measurable && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Unit Cost (Calculated)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={`₦${calculateUnitCost()}`}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 bg-gray-50"
                    readOnly
                  />
                  <Calculator size={16} className="text-gray-400" />
                </div>
                <p className="mt-1 text-xs text-gray-500">Amount ÷ Units</p>
              </div>
            )}
          </div>

          {/* Amount-only notice */}
          {selectedPrepaidExpense && !selectedPrepaidExpense.measurable && (
            <div className="mt-4 bg-amber-50 border border-amber-200 rounded-md p-3">
              <div className="flex items-center gap-2">
                <Calculator size={16} className="text-amber-600" />
                <span className="text-sm font-medium text-amber-900">Amount-only expense</span>
              </div>
              <p className="text-sm text-amber-700 mt-1">
                This prepaid expense tracks by amount only — no unit quota. Enter the monetary value
                to allocate to this beneficiary.
              </p>
            </div>
          )}

          {/* Auto-calculation notice */}
          {selectedPrepaidExpense?.unit_cost && (
            <div className="mt-4 bg-green-50 border border-green-200 rounded-md p-3">
              <div className="flex items-center gap-2">
                <Calculator size={16} className="text-green-600" />
                <span className="text-sm font-medium text-green-900">Auto-calculation enabled</span>
              </div>
              <p className="text-sm text-green-700 mt-1">
                Amount is automatically calculated based on prepaid expense unit cost (₦
                {parseFloat(selectedPrepaidExpense.unit_cost).toFixed(4)}/unit). You can override
                the amount if needed.
              </p>
            </div>
          )}
        </div>

        {/* Validity Period */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Validity Period</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Issue Date</label>
              <input
                type="date"
                aria-label="Issue Date"
                value={formData.issue_date || ''}
                onChange={e => handleInputChange('issue_date', e.target.value)}
                className={`w-full border rounded-md px-3 py-2 ${
                  errors.issue_date ? 'border-red-300' : 'border-gray-300'
                }`}
                required
              />
              {errors.issue_date && (
                <p className="mt-1 text-sm text-red-600">{errors.issue_date[0]}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date</label>
              <input
                type="date"
                value={formData.expiry_date || ''}
                onChange={e => handleInputChange('expiry_date', e.target.value || undefined)}
                className={`w-full border rounded-md px-3 py-2 ${
                  errors.expiry_date ? 'border-red-300' : 'border-gray-300'
                }`}
              />
              {errors.expiry_date && (
                <p className="mt-1 text-sm text-red-600">{errors.expiry_date[0]}</p>
              )}
              <p className="mt-1 text-xs text-gray-500">Leave empty for no expiry</p>
            </div>
          </div>

          {/* Validity warning */}
          {formData.expiry_date && (
            <div className="mt-4">
              {new Date(formData.expiry_date) < new Date() ? (
                <div className="bg-red-50 border border-red-200 rounded-md p-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={16} className="text-red-600" />
                    <span className="text-sm font-medium text-red-900">Expiry Date Warning</span>
                  </div>
                  <p className="text-sm text-red-700 mt-1">
                    The expiry date is in the past. This voucher will be created as expired.
                  </p>
                </div>
              ) : (
                (() => {
                  const daysUntilExpiry = Math.ceil(
                    (new Date(formData.expiry_date).getTime() - new Date().getTime()) /
                      (1000 * 60 * 60 * 24)
                  );
                  if (daysUntilExpiry <= 7) {
                    return (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                        <div className="flex items-center gap-2">
                          <AlertTriangle size={16} className="text-yellow-600" />
                          <span className="text-sm font-medium text-yellow-900">Expiring Soon</span>
                        </div>
                        <p className="text-sm text-yellow-700 mt-1">
                          This voucher will expire in {daysUntilExpiry} day
                          {daysUntilExpiry !== 1 ? 's' : ''}.
                        </p>
                      </div>
                    );
                  }
                  return null;
                })()
              )}
            </div>
          )}
        </div>

        {/* Redemption Information — edit only */}
        {isEditing && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Redemption Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Redemption Date
                </label>
                <input
                  type="date"
                  aria-label="Redemption Date"
                  value={formData.redemption_date || ''}
                  onChange={e => handleInputChange('redemption_date', e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Redemption Location
                </label>
                <input
                  type="text"
                  value={formData.redemption_location || ''}
                  onChange={e => handleInputChange('redemption_location', e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  placeholder="e.g., Shell Station - Main Street"
                />
              </div>
            </div>
          </div>
        )}

        {/* Additional Information */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Additional Information</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              rows={4}
              value={formData.notes || ''}
              onChange={e => handleInputChange('notes', e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
              placeholder="Additional notes about this voucher..."
            />
          </div>
        </div>

        {/* Summary */}
        {formData.allocated_amount && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-blue-900 mb-4">Voucher Summary</h3>
            {selectedPrepaidExpense?.measurable ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-blue-700 font-medium">Total Units:</span>
                  <p className="text-lg font-bold text-blue-900">
                    {formData.allocated_units || '0'} units
                  </p>
                </div>
                <div>
                  <span className="text-blue-700 font-medium">Total Value:</span>
                  <p className="text-lg font-bold text-blue-900">
                    ₦{parseFloat(formData.allocated_amount).toFixed(2)}
                  </p>
                </div>
                <div>
                  <span className="text-blue-700 font-medium">Unit Cost:</span>
                  <p className="text-lg font-bold text-blue-900">₦{calculateUnitCost()}/unit</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-blue-700 font-medium">Allocated Amount:</span>
                  <p className="text-lg font-bold text-blue-900">
                    ₦{parseFloat(formData.allocated_amount).toFixed(2)}
                  </p>
                </div>
                {selectedPrepaidExpense?.remaining_amount && (
                  <div>
                    <span className="text-blue-700 font-medium">Remaining After Allocation:</span>
                    <p className="text-lg font-bold text-blue-900">
                      ₦
                      {(
                        parseFloat(selectedPrepaidExpense.remaining_amount) -
                        parseFloat(formData.allocated_amount)
                      ).toFixed(2)}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Form Actions */}
        <div className="flex justify-end gap-4">
          <button
            type="button"
            onClick={() => navigate('/expenses/vouchers')}
            className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={createVoucher.isPending || updateVoucher.isPending}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            <Save size={20} />
            {createVoucher.isPending || updateVoucher.isPending
              ? 'Saving...'
              : isEditing
                ? 'Update Voucher'
                : 'Create Voucher'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default VoucherFormPage;
